/* UI principal: pestañas, ajustes, zoom, búsqueda, vistas de biblioteca, menús contextuales, carrusel y acciones de álbum. */
    // Pila de navegación para el botón Volver
    let navStack = [];
    // Tipo de lista de favoritos abierta ('' = ninguna, 'Songs' | 'Albums')
    let favoritesViewKind = '';
    // Categorías cuyo listado se puede ordenar por la barra superior
    const SORTABLE_CATEGORIES = ['Songs', 'Albums', 'Playlists'];
    // Categoría abierta en el listado, para reordenar sin recargar
    let currentCategory = '';
    // Copia sin ordenar de la categoría abierta (la consume renderCategoryList)
    let currentCategoryItems = null;
    // Pistas del listado abierto (interior de álbum, artista o playlist). Se
    // guarda para reordenar una playlist en el sitio sin volver a pedirla.
    let subItems = null;
    // Año/fecha de lanzamiento por Id de álbum. Las canciones no los traen
    // (Emby y Jellyfin los dejan a null), así que se piden de los álbumes.
    let albumDates = null;
    let albumDatesLoading = null;
    const LIST_SORTS = {
      // defDir: dirección que se usa hasta que el usuario elija otra
      title: { field: null, defDir: 'asc' },
      // Cada servidor llama distinto a "cuándo entró en la biblioteca":
      //   Emby / Jellyfin -> DateCreated
      //   Plex            -> CreateDate (añadido en normalizePlexItem)
      //   local           -> CreateDate (última modificación del archivo)
      // Se prueban en orden y gana el primero que venga informado.
      dateAdded: { fields: ['DateCreated', 'DateAdded', 'addedAt', 'CreateDate'], defDir: 'desc' },
      releaseDate: { field: 'PremiereDate', needsAlbum: true, defDir: 'asc' },
      year: { field: 'ProductionYear', needsAlbum: true, defDir: 'asc' }
    };

    function getListSort() {
      const key = loadLS('walkman_list_sort');
      return LIST_SORTS[key] !== undefined ? key : 'title';
    }

    // Cada criterio tiene su dirección natural ("lo añadido más reciente
    // primero"), pero en cuanto el usuario toca el desplegable su elección
    // manda para todos los criterios.
    function getListSortDir(key) {
      const spec = LIST_SORTS[key || getListSort()];
      if (loadLS('walkman_list_sort_dir_set') === '1') {
        return loadLS('walkman_list_sort_dir') === 'desc' ? 'desc' : 'asc';
      }
      return (spec && spec.defDir) || 'asc';
    }

    function invalidateAlbumDates() {
      albumDates = null;
      albumDatesLoading = null;
    }

    // Una sola petición por biblioteca: los álbumes con su año y fecha, indexados
    // por Id, para poder ordenar las canciones por los datos de su disco.
    async function ensureAlbumDates() {
      if (albumDates) return albumDates;
      if (albumDatesLoading) return albumDatesLoading;
      const st = embyConfig.serverType;
      albumDatesLoading = (async () => {
        const map = {};
        try {
          if (st === 'plex') {
            const data = await fetchPlexItems(9, embyConfig.libraryId);
            (data.Items || []).forEach(al => {
              if (al.ProductionYear || al.PremiereDate) {
                map[String(al.Id)] = { year: al.ProductionYear, premiere: al.PremiereDate };
              }
            });
          } else if (st !== 'local') {
            const res = await fetch(`${embyConfig.host}/Users/${embyConfig.userId}/Items?Recursive=true&IncludeItemTypes=MusicAlbum&Fields=ProductionYear,PremiereDate&api_key=${embyConfig.token}`);
            if (!res.ok) return map;
            const data = await res.json();
            (data.Items || []).forEach(al => {
              if (al.ProductionYear || al.PremiereDate) {
                map[String(al.Id)] = { year: al.ProductionYear, premiere: al.PremiereDate };
              }
            });
          }
        } catch (e) {}
        albumDates = map;
        return map;
      })();
      return albumDatesLoading;
    }

    // Ordena en el sitio: las listas ya se cargan enteras, así que no hace
    // falta volver a pedir nada al servidor. Lo que no tenga fecha va al final.
    function sortListItems(items, key, dir) {
      if (!items || LIST_SORTS[key] === undefined) return items || [];
      const spec = LIST_SORTS[key];
      const desc = (dir || getListSortDir()) === 'desc';
      const sign = desc ? -1 : 1;
      const arr = items.slice();
      if (!spec.field && !spec.fields) {
        arr.sort((a, b) => sign * String(a.SortName || a.Name || '').localeCompare(
          String(b.SortName || b.Name || ''), undefined, { numeric: true, sensitivity: 'base' }));
        return arr;
      }
      const val = item => {
        let raw = null;
        if (item) {
          if (spec.fields) {
            for (const f of spec.fields) {
              const cand = item[f];
              if (cand !== null && cand !== undefined && cand !== '') { raw = cand; break; }
            }
          } else {
            raw = item[spec.field];
          }
        }
        // Si es una canción, su año y fecha están en el álbum, no en la pista
        if ((raw === null || raw === undefined || raw === '') && spec.needsAlbum && item && albumDates) {
          const al = albumDates[String(item.AlbumId || '')];
          if (al) raw = spec.field === 'ProductionYear' ? al.year : al.premiere;
        }
        if (raw === null || raw === undefined || raw === '') return null;
        if (spec.field === 'ProductionYear') {
          const n = parseInt(String(raw).slice(0, 4), 10);
          return isNaN(n) ? null : n;
        }
        const time = new Date(raw).getTime();
        return isNaN(time) ? null : time;
      };
      arr.sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        // Los que no tienen el dato se quedan siempre al final
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return va === vb ? 0 : sign * (va < vb ? -1 : 1);
      });
      return arr;
    }

    // Aplica el orden elegido y lo deja reflejado en los desplegables
    async function applyListSort() {
      updateSortControls();
      // Dentro de una playlist: se repinta desde las pistas ya cargadas
      if (subItems && subItems.ordenable) {
        // Año y fecha de lanzamiento en canciones necesitan los datos del álbum
        if (LIST_SORTS[getListSort()].needsAlbum) await ensureAlbumDates();
        renderTrackList(sortListItems(subItems.tracks, getListSort(), getListSortDir()));
        return;
      }
      if (!currentCategory || !currentCategoryItems) return;
      if (LIST_SORTS[getListSort()].needsAlbum) await ensureAlbumDates();
      renderCategoryList(currentCategory, currentCategoryItems);
    }

    // Cambia el criterio (Primer desplegable)
    async function setListSort(key) {
      // Si el valor no existe, solo resincronizamos el desplegable
      if (LIST_SORTS[key] === undefined) { updateSortControls(); return; }
      saveLS('walkman_list_sort', key);
      await applyListSort();
    }

    // Cambia la dirección (segundo desplegable)
    async function setListSortDir(dir) {
      if (dir !== 'asc' && dir !== 'desc') { updateSortControls(); return; }
      saveLS('walkman_list_sort_dir', dir);
      saveLS('walkman_list_sort_dir_set', '1');
      await applyListSort();
    }

    function updateSortControls() {
      const key = getListSort();
      const sel = document.getElementById('list-sort-select');
      if (sel && sel.value !== key) sel.value = key;
      const dirSel = document.getElementById('list-sort-dir');
      if (dirSel) {
        const dir = getListSortDir();
        if (dirSel.value !== dir) dirSel.value = dir;
        // La flecha del icono acompaña a la dirección activa
        const ico = document.getElementById('list-sort-dir-icon');
        if (ico) {
          const wanted = dir === 'desc' ? 'arrow_downward' : 'arrow_upward';
          if (ico.textContent.trim() !== wanted) ico.textContent = wanted;
        }
      }
    }

    function showSortBar(visible) {
      const bar = document.getElementById('list-sortbar');
      if (!bar) return;
      bar.style.display = visible ? 'flex' : 'none';
      if (visible) updateSortControls();
    }

    function switchTab(tab) {
      if (tab !== 'playing') closeLyricsIfOpen();
      document.querySelectorAll('.top-nav div').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
      
      if (tab === 'playing') {
        document.getElementById('nav-playing').classList.add('active');
        document.getElementById('nav-playing').setAttribute('aria-selected', 'true');
        document.getElementById('nav-music').setAttribute('aria-selected', 'false');
        document.getElementById('view-playing').classList.add('active');
      } else {
        document.getElementById('nav-music').classList.add('active');
        document.getElementById('nav-music').setAttribute('aria-selected', 'true');
        document.getElementById('nav-playing').setAttribute('aria-selected', 'false');
        document.getElementById('view-music').classList.add('active');
      }
      updateZ1Layout();
      updateZ1MiniPlayer();
      closeZ1HeaderMenu();
      resetBeatGlowBackground();
    }

    // Color promedio de la carátula (refleja fielmente cualquier tono, incl. verde)

    function toggleSettingsMenu() {
      const overlay = document.getElementById('settings-overlay');
      const menu = document.getElementById('settings-menu');
      const opening = !overlay.classList.contains('open');
      if (opening) {
        overlay.classList.add('open');
        menu.classList.add('open');
      } else {
        overlay.classList.remove('open');
        menu.classList.remove('open');
        document.querySelectorAll('.settings-submenu.open').forEach(s => s.classList.remove('open'));
      }
      const btn = document.getElementById('settings-btn');
      if (btn) btn.setAttribute('aria-expanded', String(opening));
      // Cerrar el menú EQ si está abierto
      closeEqualizer();
    }

    // Abre el submenú de una sección de ajustes (cierra el menú principal detrás)
    function openSettingsSection(name) {
      document.getElementById('settings-menu').classList.remove('open');
      const sub = document.getElementById('settings-submenu-' + name);
      if (sub) sub.classList.add('open');
    }

    // Vuelve al menú principal desde un submenú de ajustes
    function closeSettingsSection(name) {
      const sub = document.getElementById('settings-submenu-' + name);
      if (sub) sub.classList.remove('open');
      document.getElementById('settings-menu').classList.add('open');
    }

    function closeSettingsMenu() {
      document.getElementById('settings-overlay').classList.remove('open');
      document.getElementById('settings-menu').classList.remove('open');
      document.querySelectorAll('.settings-submenu.open').forEach(s => s.classList.remove('open'));
    }

    function applyZoom(z) {
      const num = Math.max(55, Math.min(175, Number(z) || 100));
      const factor = num / 100;
      // Aplicar zoom geométrico a la interfaz para que todo escale visiblemente
      try { document.body.style.zoom = factor; } catch (e) {}
      // Compensar la altura: con zoom el body growía a 100vh*factor de layout;
      // reducimos su altura a 100vh/factor para que el body siga ocupando el viewport
      try { document.body.style.height = ((100 / num) * 100) + 'vh'; } catch (e) {}
      // La vista del reproductor usa tamaños fijos grandes (portada, carrusel,
      // controles, título). A zoom alto esos elementos crecerían y se saldrían
      // de la pantalla. Se contra-escalan (zoom = 100/num) para que siguan cabiendo.
      const cZoom = (num > 100) ? (100 / num) : '';
      try {
        ['carousel-container', 'controls-wrapper', 'track-header-wrapper', 'settings-menu'].forEach(id => {
          const el = document.querySelector('.' + id);
          if (el) el.style.zoom = cZoom;
        });
      } catch (e) {}
      const opts = document.querySelectorAll('#zoom-options .accent-option');
      opts.forEach(o => {
        o.classList.toggle('active', Number(o.dataset.zoom) === num);
      });
      updateZ1Layout();
    }

    function setZoom(z) {
      applyZoom(z);
      fitHeader(z);
      saveLS('walkman_zoom', String(z));
    }

    function initZoom() {
      let saved = 100;
      saved = Number(loadLS('walkman_zoom')) || 100;
      applyZoom(saved);
    }

    function initPlayingTitleMarquee() {
      const title = document.getElementById('track-title');
      const text = document.getElementById('track-title-text');
      let frame = 0;
      let previous = '';
      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const style = getComputedStyle(title);
          const available = title.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          const distance = Math.max(0, text.scrollWidth - available);
          const signature = JSON.stringify([text.textContent, available, distance]);
          if (signature === previous) return;
          previous = signature;
          title.classList.remove('title-overflow');
          title.title = text.textContent;
          if (available <= 0 || distance <= 1) return;
          // Keep a constant reading speed, with a pause at each end.
          title.style.setProperty('--title-travel', `${-distance}px`);
          title.style.setProperty('--title-duration', `${Math.max(6, distance / 35 + 4)}s`);
          void text.offsetWidth;
          title.classList.add('title-overflow');
        });
      };
      new ResizeObserver(schedule).observe(title);
      new MutationObserver(schedule).observe(text, { childList: true, characterData: true, subtree: true });
      document.fonts.ready.then(schedule);
      schedule();
    }

    function applyPlayingTheme(theme) {
      const selected = ['modern', 'classic', 'z1'].includes(theme) ? theme : 'modern';
      document.querySelector('#view-playing .carousel-container').cancelAlbumSwipe?.();
      document.getElementById('view-playing').dataset.theme = selected;
      document.body.dataset.theme = selected;
      document.getElementById('app-logo').textContent = 'WALKMAN';
      closeZ1HeaderMenu();
      document.querySelectorAll('[data-playing-theme]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.playingTheme === selected));
      });
      refreshCarouselImages();
      updateZ1Layout();
      updateZ1MiniPlayer();
      fitHeader();
      resetBeatGlowBackground();
    }

    function setPlayingTheme(theme) {
      applyPlayingTheme(theme);
      saveLS('walkman_playing_theme', document.getElementById('view-playing').dataset.theme);
    }

    function initPlayingTheme() {
      applyPlayingTheme(loadLS('walkman_playing_theme'));
    }

    function updatePlayingThemeData() {
      const track = playlist[currentTrackIndex];
      document.getElementById('track-album').textContent = track ? (track.Album || '') : '';
      document.getElementById('playing-queue-position').textContent =
        `${track ? currentTrackIndex + 1 : 0}/${playlist.length}`;
      updateZ1MiniPlayer();
    }

    function closeZ1HeaderMenu() {
      document.querySelector('header').classList.remove('z1-actions-open');
      document.querySelector('.z1-header-more').setAttribute('aria-expanded', 'false');
    }

    function toggleZ1HeaderMenu() {
      const open = document.querySelector('header').classList.toggle('z1-actions-open');
      document.querySelector('.z1-header-more').setAttribute('aria-expanded', String(open));
    }

    function updateZ1MiniPlayer() {
      const track = playlist[currentTrackIndex];
      document.body.classList.toggle('z1-playing', document.body.dataset.theme === 'z1' && document.getElementById('view-playing').classList.contains('active'));
      const visible = document.body.dataset.theme === 'z1' && !!track && document.getElementById('view-music').classList.contains('active');
      const mini = document.getElementById('z1-mini-player');
      mini.hidden = !visible;
      document.body.classList.toggle('z1-has-mini', visible);
      updateZ1MiniProgress();
      if (!track) return;
      document.getElementById('z1-mini-title').textContent = track.Name || '';
      document.getElementById('z1-mini-artist').textContent = (track.Artists || []).join(', ') || track.AlbumArtist || '';
      const img = document.getElementById('z1-mini-cover');
      const url = getEmbyImageUrl(track);
      if (img.getAttribute('src') !== url) img.src = url;
      document.getElementById('z1-mini-play-icon').textContent = audio.paused ? 'play_arrow' : 'pause';
    }

    function updateZ1MiniProgress() {
      const slider = document.getElementById('z1-mini-progress');
      const seekable = !!playlist[currentTrackIndex] && Number.isFinite(audio.duration) && audio.duration > 0;
      const progress = seekable ? Math.min(100, Math.max(0, audio.currentTime / audio.duration * 100)) : 0;
      slider.disabled = !seekable;
      slider.value = progress;
      slider.style.setProperty('--mini-progress', `${progress}%`);
      slider.setAttribute('aria-valuetext', `${formatTime(seekable ? audio.currentTime : 0)} / ${formatTime(seekable ? audio.duration : 0)}`);
    }

    function initZ1Interface() {
      ['play', 'pause', 'ended', 'loadedmetadata', 'emptied'].forEach(event => audio.addEventListener(event, updateZ1MiniPlayer));
      ['timeupdate', 'durationchange', 'seeking'].forEach(event => audio.addEventListener(event, () => {
        if (!document.getElementById('z1-mini-player').hidden) updateZ1MiniProgress();
      }));
      document.getElementById('z1-mini-cover').onerror = event => {
        if (event.target.src !== defaultPlaceholder) event.target.src = defaultPlaceholder;
      };
      document.addEventListener('click', event => {
        if (!event.target.closest('header')) closeZ1HeaderMenu();
      });
      document.addEventListener('keydown', event => { if (event.key === 'Escape') closeZ1HeaderMenu(); });
      updateZ1MiniPlayer();
    }

    function updateZ1Layout() {
      const view = document.getElementById('view-playing');
      view.classList.remove('z1-stacked');
      if (view.dataset.theme !== 'z1' || !view.classList.contains('active')) return;
      if (!window.matchMedia('(min-aspect-ratio: 6/5)').matches) return;
      const style = getComputedStyle(view);
      const available = view.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const cover = document.getElementById('card-current').offsetWidth;
      const play = view.querySelector('.control-btn.play').offsetWidth;
      const controls = Math.max(280, play / 1.3 * 3.3 + 86);
      view.classList.toggle('z1-stacked', cover * 1.32 + parseFloat(style.columnGap) + controls > available);
    }
    window.addEventListener('resize', updateZ1Layout);

    function applyCarouselZoom(z) {
      const num = Math.max(55, Math.min(175, Number(z) || 100));
      try { document.documentElement.style.setProperty('--carousel-size', String(num / 100)); } catch (e) {}
      const opts = document.querySelectorAll('#carousel-options .accent-option');
      opts.forEach(o => {
        o.classList.toggle('active', Number(o.dataset.czoom) === num);
      });
      updateZ1Layout();
    }

    function setCarouselZoom(z) {
      applyCarouselZoom(z);
      saveLS('walkman_zoom_carousel', String(z));
    }

    function initCarouselZoom() {
      let saved = 100;
      saved = Number(loadLS('walkman_zoom_carousel')) || 100;
      applyCarouselZoom(saved);
    }


    function toggleSearchOverlay() {
      const overlay = document.getElementById('search-overlay');
      overlay.classList.toggle('open');
      if (overlay.classList.contains('open')) {
        closeEqualizer();
        document.getElementById('search-input').focus();
      }
    }

    let searchTimeout = null;
    function handleSearch(query) {
      clearTimeout(searchTimeout);
      if (!query.trim()) {
        document.getElementById('search-results-container').innerHTML = '<div style="color: #888; font-size: 13px; text-align: center; padding: 10px;">Escribe para buscar...</div>';
        return;
      }

      searchTimeout = setTimeout(async () => {
        const container = document.getElementById('search-results-container');
        container.innerHTML = '<div style="color: #aaa; font-size: 13px; text-align: center;">Buscando...</div>';

        try {
          let items = [];
          const st = embyConfig.serverType;

          if (st === 'local') {
            // La biblioteca local se guarda en memoria (localTracks), así que
            // la búsqueda se hace localmente sin llamar a ningún servidor.
            const q = query.toLowerCase();
            items = localTracks.filter(t => {
              const name = (t.Name || '').toLowerCase();
              const album = (t.Album || '').toLowerCase();
              const albumArtist = (t.AlbumArtist || '').toLowerCase();
              if (name.includes(q) || album.includes(q) || albumArtist.includes(q)) return true;
              const artists = (t.Artists && t.Artists.length)
                ? t.Artists : (t.AlbumArtist ? [t.AlbumArtist] : []);
              for (const a of artists) {
                if (String(a).toLowerCase().includes(q)) return true;
              }
              return false;
            });
          } else if (st === 'plex') {
            const data = await fetchPlexJson(`${embyConfig.host}/search?query=${encodeURIComponent(query)}&X-Plex-Token=${embyConfig.token}`);
            const metadata = data.MediaContainer.Metadata || [];
            items = metadata.filter(m => [10, 9, 4].includes(m.type)).map(normalizePlexItem);
          } else {
            const res = await fetch(`${embyConfig.host}/Users/${embyConfig.userId}/Items?SearchTerm=${encodeURIComponent(query)}&Recursive=true&IncludeItemTypes=Audio,MusicAlbum,MusicArtist&Fields=AlbumId,MediaSources&Limit=20&api_key=${embyConfig.token}`);
            const data = await res.json();
            items = data.Items || [];
          }

          container.innerHTML = '';
          if (items.length === 0) {
            container.innerHTML = '<div style="color: #888; font-size: 13px; text-align: center;">' + t('noResults') + '</div>';
            return;
          }

          items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'list-item';
            const imgUrl = getEmbyImageUrl(item);
            
            renderMediaRow(div, imgUrl, item.Name, `${item.Type} • ${item.AlbumArtist || item.Artists ? (item.Artists || []).join(', ') : ''}`);
            const imgEl = div.querySelector('img');
            applyArtistImageFallback(imgEl, item);

            div.onclick = () => {
              toggleSearchOverlay();
              if (item.Type === 'Audio') {
                playlist = [item];
                originalPlaylist = [item];
                playlistVersion++;
                playTrack(0);
                saveQueue();
                switchTab('playing');
              } else {
                switchTab('music');
                loadSubItems(item.Id, item.Name, item.Type);
              }
            };
            div.querySelector('.list-item-more').onclick = (e) => {
              e.stopPropagation();
              openContextMenu(e, item);
            };

            container.appendChild(div);
          });
        } catch (err) {
          container.innerHTML = '<div style="color: #ff5555; font-size: 13px; text-align: center;">Error en la búsqueda</div>';
        }
      }, 300);
    }


    let featuredSlides = [];
    let featuredTimer = null;
    let featuredIndex = 0;

    function isFeaturedEnabled() {
      return loadLS('walkman_featured') !== 'off';
    }

    function applyFeaturedVisibility() {
      const section = document.getElementById('featured-slideshow');
      if (!section) return;
      const enabled = isFeaturedEnabled();
      section.style.display = enabled ? '' : 'none';
      // El contenedor incluye el botón de recargar, así que se oculta entero
      const wrap = document.getElementById('home-featured');
      if (wrap) wrap.style.display = enabled ? '' : 'none';
      const btn = document.getElementById('featured-btn');
      if (btn) btn.classList.toggle('on', enabled);
      const sizeWrap = document.getElementById('featured-size-wrap');
      if (sizeWrap) sizeWrap.style.display = enabled ? '' : 'none';
      applyFeaturedZoom();
    }

    function toggleFeatured() {
      const enabled = !isFeaturedEnabled();
      saveLS('walkman_featured', enabled ? 'on' : 'off');
      applyFeaturedVisibility();
      if (enabled) {
        updateCategoryCounts();
      } else {
        const slideshow = document.getElementById('featured-slideshow');
        if (slideshow) slideshow.innerHTML = '';
        if (featuredTimer) { clearInterval(featuredTimer); featuredTimer = null; }
      }
    }

    function isPlayingHiResEnabled() {
      return loadLS('walkman_playing_hires') !== 'off';
    }

    function applyPlayingHiResState() {
      const enabled = isPlayingHiResEnabled();
      const button = document.getElementById('playing-hires-btn');
      button.classList.toggle('on', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      document.getElementById('hires-badge').classList.toggle('hidden',
        !enabled || !isHiResAudio(playlist[currentTrackIndex]));
    }

    function togglePlayingHiRes() {
      saveLS('walkman_playing_hires', isPlayingHiResEnabled() ? 'off' : 'on');
      applyPlayingHiResState();
    }

    function isCardFlareEnabled() {
      return loadLS('walkman_card_flare') !== 'off';
    }

    function applyCardFlareState() {
      const btn = document.getElementById('card-flare-btn');
      if (btn) btn.classList.toggle('on', isCardFlareEnabled());
    }

    function toggleCardFlare() {
      saveLS('walkman_card_flare', isCardFlareEnabled() ? 'off' : 'on');
      applyCardFlareState();
    }

    function applyFeaturedZoom() {
      const num = Math.max(55, Math.min(175, Number(getFeaturedZoom()) || 100));
      try {
        document.documentElement.style.setProperty('--featured-zoom', String(num / 100));
      } catch (e) {}
      const opts = document.querySelectorAll('#featured-size-options .accent-option');
      opts.forEach(o => {
        o.classList.toggle('active', Number(o.dataset.fz) === num);
      });
    }

    function setFeaturedZoom(z) {
      saveLS('walkman_featured_zoom', String(z));
      applyFeaturedZoom();
    }

    function getFeaturedZoom() {
      return Number(loadLS('walkman_featured_zoom')) || 100;
    }

    function initFeaturedZoom() {
      applyFeaturedZoom();
    }

    function buildFeaturedSlides() {
      const container = document.getElementById('featured-slideshow');
      if (!container) return;
      container.innerHTML = '';
      if (featuredSlides.length === 0) return;

      const titleStrip = document.createElement('div');
      titleStrip.className = 'featured-title-strip';
      titleStrip.setAttribute('data-i18n', 'myMusicHome');
      titleStrip.textContent = t('myMusicHome');
      container.appendChild(titleStrip);

      featuredSlides.forEach((slide, i) => {
        const div = document.createElement('div');
        div.className = 'featured-slide' + (i === 0 ? ' active' : '');
        div.innerHTML = '<div class="featured-slide-bg"></div><div class="featured-slide-art"></div><div class="featured-slide-overlay"><div class="featured-slide-title"></div><div class="featured-slide-artist"></div></div>';
        const background = `url(${JSON.stringify(String(slide.img))})`;
        div.style.backgroundImage = background;
        div.querySelector('.featured-slide-bg').style.backgroundImage = background;
        div.querySelector('.featured-slide-art').style.backgroundImage = background;
        div.querySelector('.featured-slide-title').textContent = slide.title || '';
        div.querySelector('.featured-slide-artist').textContent = slide.artist || '';
        container.appendChild(div);
      });

      const dots = document.createElement('div');
      dots.className = 'featured-dots';
      featuredSlides.forEach((s, i) => {
        const d = document.createElement('div');
        d.className = 'featured-dot' + (i === 0 ? ' active' : '');
        d.onclick = (ev) => {
          ev.stopPropagation();
          goToFeatured(i);
        };
        dots.appendChild(d);
      });
      container.appendChild(dots);

      const prevBtn = document.createElement('button');
      prevBtn.className = 'featured-arrow featured-arrow-prev';
      prevBtn.setAttribute('aria-label', 'Anterior');
      prevBtn.innerHTML = '<span class="material-icons">chevron_left</span>';
      prevBtn.onclick = (e) => {
        e.stopPropagation();
        goToFeatured(featuredIndex - 1);
      };
      prevBtn.oncontextmenu = (e) => e.stopPropagation();
      container.appendChild(prevBtn);

      const nextBtn = document.createElement('button');
      nextBtn.className = 'featured-arrow featured-arrow-next';
      nextBtn.setAttribute('aria-label', 'Siguiente');
      nextBtn.innerHTML = '<span class="material-icons">chevron_right</span>';
      nextBtn.onclick = (e) => {
        e.stopPropagation();
        goToFeatured(featuredIndex + 1);
      };
      nextBtn.oncontextmenu = (e) => e.stopPropagation();
      container.appendChild(nextBtn);

      const progress = document.createElement('div');
      progress.className = 'featured-progress';
      const progressFill = document.createElement('div');
      progressFill.className = 'featured-progress-fill';
      progress.appendChild(progressFill);
      container.appendChild(progress);

      container.style.cursor = 'pointer';
      container.onclick = () => playFeaturedAlbum(featuredIndex);

      // Menú contextual con clic derecho sobre el side show
      container.oncontextmenu = (e) => {
        e.preventDefault();
        const slide = featuredSlides[featuredIndex];
        if (!slide) return;
        openContextMenu(e, slide.item || slide);
      };

      featuredIndex = 0;
      if (featuredTimer) clearInterval(featuredTimer);
      featuredTimer = setInterval(featuredNext, 4000);
      if (featuredSlides.length >= 2) startFeaturedProgress();
    }

    function startFeaturedProgress() {
      const container = document.getElementById('featured-slideshow');
      if (!container) return;
      const fill = container.querySelector('.featured-progress-fill');
      if (fill) {
        fill.style.animation = 'none';
        void fill.offsetWidth;
        fill.style.animation = '';
      }
      container.classList.remove('playing');
      void container.offsetWidth;
      container.classList.add('playing');
    }

    function featuredNext() {
      if (featuredSlides.length < 2) return;
      const slides = document.querySelectorAll('#featured-slideshow .featured-slide');
      const dots = document.querySelectorAll('#featured-slideshow .featured-dot');
      if (!slides.length) return;
      slides[featuredIndex].classList.remove('active');
      slides[featuredIndex].classList.add('leaving');
      if (dots[featuredIndex]) dots[featuredIndex].classList.remove('active');
      featuredIndex = (featuredIndex + 1) % featuredSlides.length;
      const next = slides[featuredIndex];
      next.classList.remove('leaving');
      next.classList.add('active');
      if (dots[featuredIndex]) dots[featuredIndex].classList.add('active');
      startFeaturedProgress();
    }

    function goToFeatured(i) {
      if (!featuredSlides.length) return;
      i = (i + featuredSlides.length) % featuredSlides.length;
      const slides = document.querySelectorAll('#featured-slideshow .featured-slide');
      const dots = document.querySelectorAll('#featured-slideshow .featured-dot');
      if (!slides.length) return;
      if (i === featuredIndex) {
        if (featuredTimer) clearInterval(featuredTimer);
        featuredTimer = setInterval(featuredNext, 4000);
        if (featuredSlides.length >= 2) startFeaturedProgress();
        return;
      }
      slides[featuredIndex].classList.remove('active');
      slides[featuredIndex].classList.add('leaving');
      if (dots[featuredIndex]) dots[featuredIndex].classList.remove('active');
      featuredIndex = i;
      const next = slides[featuredIndex];
      next.classList.remove('leaving');
      next.classList.add('active');
      if (dots[featuredIndex]) dots[featuredIndex].classList.add('active');
      if (featuredTimer) clearInterval(featuredTimer);
      featuredTimer = setInterval(featuredNext, 4000);
      startFeaturedProgress();
    }

    function renderFeaturedAlbums(albums) {
      if (!albums || albums.length === 0) return;
      const shuffled = albums.slice().sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 10);
      featuredSlides = selected.map(album => ({
        id: album.Id,
        albumId: album.AlbumId,
        coverUrl: album.coverUrl || '',
        img: getImageUrl(album),
        title: album.Name || 'Desconocido',
        artist: album.AlbumArtist || (album.Artists && album.Artists[0]) || '',
        item: album
      }));
      buildFeaturedSlides();
    }

    async function refreshFeatured() {
      const el = document.querySelector('.featured-refresh');
      if (el) {
        el.classList.remove('spinning');
        void el.offsetWidth;
        el.classList.add('spinning');
      }
      const st = embyConfig.serverType;
      const types = SERVER_TYPES[st];
      if (!types || !types.Album) return;
      try {
        const fdata = await fetchItems(types.Album);
        const albums = fdata.Items || fdata || [];
        if (albums.length > 0) {
          await resolveAlbumCoverIds(albums);
          renderFeaturedAlbums(albums);
        }
      } catch (e) {}
    }

    // Fix carátulas de álbumes (Emby/Jellyfin): el Id del álbum listado a
    // veces da 404 aunque reporte imagen; el fiable es el Id de la canción,
    // que es el álbum físico que sí tiene la portada. Se reutiliza en el side
    // show, en el recuento de categorías y en la vista de álbumes.
    async function resolveAlbumCoverIds(albums) {
      if (!Array.isArray(albums) || albums.length === 0) return;
      const st = embyConfig.serverType;
      const types = SERVER_TYPES[st];
      try {
        const songsData = await fetchItems(types.Audio);
        const idByTrackAlbum = {};
        const hiresByAlbum = {};
        (songsData.Items || []).forEach(s => {
          if (s.Id && s.Album && !idByTrackAlbum[s.Album]) {
            idByTrackAlbum[s.Album] = s.Id;
          }
          if (s.Album && isHiResAudio(s)) {
            hiresByAlbum[s.Album] = true;
          }
        });
        albums.forEach(item => {
          if (st === 'emby' || st === 'jellyfin') {
            if (idByTrackAlbum[item.Name] && (!item.AlbumId || item.AlbumId === item.Id)) {
              item.AlbumId = idByTrackAlbum[item.Name];
            }
          }
          if (hiresByAlbum[item.Name]) item._hasHiRes = true;
        });
        if (st !== 'emby' && st !== 'jellyfin') return;
        const pending = albums.filter(item => !item.AlbumId || item.AlbumId === item.Id);
        await Promise.all(pending.map(async (item) => {
          try {
            const sub = await fetchItems(types.Audio, item.Id);
            const first = (sub.Items || []).find(s => s.Id);
            if (first && first.Id) item.AlbumId = first.Id;
            if (!item._hasHiRes && (sub.Items || []).some(s => isHiResAudio(s))) item._hasHiRes = true;
          } catch (e) {}
        }));
      } catch (e) {}
    }

    async function refreshFeaturedImages() {
      if (!isFeaturedEnabled()) return;
      const fst = embyConfig.serverType;
      if (!fst) return;
      const ftypes = SERVER_TYPES[fst];
      if (!ftypes || !ftypes.Album) return;
      try {
        const fdata = await fetchItems(ftypes.Album);
        await resolveAlbumCoverIds(fdata.Items || []);
        renderFeaturedAlbums(fdata.Items || []);
      } catch (e) {}
    }

    async function playFeaturedAlbum(index) {
      if (!featuredSlides || !featuredSlides[index]) return;
      const slide = featuredSlides[index];
      const st = embyConfig.serverType;
      const types = SERVER_TYPES[st];
      const id = slide.id;
      let albumTracks = [];
      try {
        const data = await fetchItems(types.Audio, id, 'MusicAlbum');
        albumTracks = data.Items || [];
      } catch (e) {}
      if (albumTracks.length === 0) return;
      playlist = [...albumTracks];
      originalPlaylist = [...albumTracks];
      playlistVersion++;
      renderQueueList();
      refreshCarouselImages();
      playTrack(0);
      saveQueue();
      switchTab('playing');
    }


    async function loadCategory(category) {
      favoritesViewKind = '';
      subItems = null;
      currentCategory = category;
      showSortBar(SORTABLE_CATEGORIES.indexOf(category) !== -1);
      document.getElementById('category-view').style.display = 'none';
      document.getElementById('list-view').style.display = 'block';
      document.getElementById('selected-category-title').textContent = tCategory(category);

      // Nivel actual = categoría; desde aquí se accede a sub-elementos
      navStack = [{ type: 'category', category: category }];

      const container = document.getElementById('items-container');
      container.innerHTML = '<div style="color:#aaa;">Cargando...</div>';

      const st = embyConfig.serverType;
      const types = SERVER_TYPES[st];
      const typeMap = { 'Songs': types.Audio, 'Albums': types.Album, 'Artists': types.Artist, 'Playlists': types.Playlist };
      const data = await fetchItems(typeMap[category]);
      // Si el orden activo necesita el año del álbum, lo pedimos antes de pintar
      if (LIST_SORTS[getListSort()].needsAlbum) await ensureAlbumDates();

      // Fix carátulas de álbumes (Emby/Jellyfin): el Id del álbum listado a
      // veces da 404 aunque reporte imagen; el fiable es el Id de la canción,
      // que es el álbum físico que sí tiene la portada. Aprovechamos este paso
      // para marcar en cada álbum si contiene alguna pista Hi-Res (_hasHiRes).
      if (category === 'Albums') {
        await resolveAlbumCoverIds(data.Items || []);
      }

      currentCategoryItems = data.Items || [];
      renderCategoryList(category, currentCategoryItems);
    }

    // Pinta el listado ya ordenado. Separado de loadCategory para que cambiar
    // el orden sea instantáneo y no vuelva a pedir la lista al servidor.
    function renderCategoryList(category, rawItems) {
      const items = sortListItems(rawItems, getListSort(), getListSortDir());
      const container = document.getElementById('items-container');
      container.innerHTML = '';
      const catLabel = tCategory(category);
      const fragment = document.createDocumentFragment();

      if (category === 'Songs' && items.length > 0) {
        const shuffleDiv = document.createElement('div');
        shuffleDiv.className = 'list-item list-item-shuffle';
        shuffleDiv.innerHTML = `
          <div class="list-item-shuffle-icon"><span class="material-icons">shuffle</span></div>
          <div class="list-item-info">
            <div class="list-item-title">${t('shuffle')}</div>
            <div class="list-item-sub">${t('shuffleAll')} ${items.length}</div>
          </div>
        `;
        shuffleDiv.onclick = () => playShuffleAll(items);
        fragment.appendChild(shuffleDiv);
      }

      items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const imgUrl = getEmbyImageUrl(item);
        
        renderMediaRow(div, imgUrl, item.Name, item.AlbumArtist || (item.Artists ? item.Artists.join(', ') : catLabel), item._hasHiRes || isHiResAudio(item));
        const imgEl = div.querySelector('img');
        applyArtistImageFallback(imgEl, item);

        div.onclick = () => {
          if (category === 'Songs') {
            playlist = [...items];
            originalPlaylist = [...items];
            playlistVersion++;
            renderQueueList();
            refreshCarouselImages();
            playTrack(index);
            saveQueue();
            switchTab('playing');
          } else {
            const kindMap = { 'Albums': 'MusicAlbum', 'Artists': 'MusicArtist', 'Playlists': 'Playlist' };
            loadSubItems(item.Id, item.Name, kindMap[category]);
          }
        };
        div.querySelector('.list-item-more').onclick = (e) => {
          e.stopPropagation();
          openContextMenu(e, item);
        };

        fragment.appendChild(div);
      });
      container.appendChild(fragment);
    }

    // --- FAVORITOS ---

    // Muestra el submenú con "Álbumes favoritos" y "Canciones favoritas"
    async function showFavoritesMenu() {
      document.getElementById('list-view').style.display = 'none';
      document.getElementById('category-view').style.display = 'block';
      document.getElementById('home-featured').style.display = 'none';
      document.getElementById('home-grid').style.display = 'none';
      document.getElementById('fav-view').style.display = 'block';
      navStack = [{ type: 'favmenu' }];
      await refreshFavoritesCount();
    }

    async function loadFavorites(kind) {
      currentCategory = '';
      currentCategoryItems = null;
      subItems = null;
      showSortBar(false);
      document.getElementById('category-view').style.display = 'none';
      document.getElementById('list-view').style.display = 'block';
      document.getElementById('selected-category-title').textContent = kind === 'Albums' ? t('favAlbums') : t('favSongs');

      // Desde aquí se accede a los elementos de cada favorito
      navStack = [{ type: 'favmenu' }, { type: 'favorites', favKind: kind }];
      favoritesViewKind = kind;

      const container = document.getElementById('items-container');
      container.innerHTML = '<div style="color:#aaa;">' + t('loadingSongs') + '</div>';

      const items = await fetchFavorites(kind);

      container.innerHTML = '';
      if (items.length === 0) {
        container.innerHTML = '<div style="color:#888;font-size:13px;text-align:center;padding:20px;">' + t('noFavorites') + '</div>';
        return;
      }
      const fragment = document.createDocumentFragment();

      if (kind === 'Songs') {
        const shuffleDiv = document.createElement('div');
        shuffleDiv.className = 'list-item list-item-shuffle';
        shuffleDiv.innerHTML = `
          <div class="list-item-shuffle-icon"><span class="material-icons">shuffle</span></div>
          <div class="list-item-info">
            <div class="list-item-title">${t('shuffle')}</div>
            <div class="list-item-sub">${t('shuffleAll')} ${items.length}</div>
          </div>
        `;
        shuffleDiv.onclick = () => playShuffleAll(items);
        fragment.appendChild(shuffleDiv);
      }

      items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const imgUrl = getEmbyImageUrl(item);

        renderMediaRow(div, imgUrl, item.Name, item.AlbumArtist || (item.Artists ? item.Artists.join(', ') : (item.Album || '')), item._hasHiRes || isHiResAudio(item));
        const imgEl = div.querySelector('img');
        applyArtistImageFallback(imgEl, item);

        div.onclick = () => {
          if (kind === 'Songs') {
            playlist = [...items];
            originalPlaylist = [...items];
            playlistVersion++;
            renderQueueList();
            refreshCarouselImages();
            playTrack(index);
            saveQueue();
            switchTab('playing');
          } else {
            loadSubItems(item.Id, item.Name, 'MusicAlbum');
          }
        };
        div.querySelector('.list-item-more').onclick = (e) => {
          e.stopPropagation();
          openContextMenu(e, item);
        };

        fragment.appendChild(div);
      });
      container.appendChild(fragment);
    }

    async function loadSubItems(parentId, title, parentKind) {
      favoritesViewKind = '';
      currentCategory = '';
      currentCategoryItems = null;
      // Solo las playlists se pueden ordenar: en un álbum o en un artista el
      // orden de las pistas significa algo (número de pista, discos) y
      // reordenarlas rompería esa intención.
      const ordenable = parentKind === 'Playlist';
      showSortBar(ordenable);
      document.getElementById('category-view').style.display = 'none';
      document.getElementById('list-view').style.display = 'block';
      document.getElementById('selected-category-title').textContent = title;

      // Guardar hacia dónde volver (la categoría o el tipo de favorito en el que estábamos)
      const current = navStack.length ? navStack[navStack.length - 1] : null;
      navStack.push({
        type: 'subitems',
        category: current ? current.category : '',
        favKind: current ? current.favKind : ''
      });

      const container = document.getElementById('items-container');
      container.innerHTML = '<div style="color:#aaa;">' + t('loadingSongs') + '</div>';

      const st = embyConfig.serverType;
      const types = SERVER_TYPES[st];
      const data = await fetchItems(types.Audio, parentId, parentKind);
      const tracks = data.Items || [];
      subItems = { title: title, kind: parentKind, tracks: tracks, ordenable: ordenable };
      if (ordenable && LIST_SORTS[getListSort()].needsAlbum) await ensureAlbumDates();
      renderTrackList(ordenable ? sortListItems(tracks, getListSort(), getListSortDir()) : tracks);
    }

    // Pinta las pistas de un álbum, un artista o una playlist. Va aparte de
    // loadSubItems para poder reordenar una playlist en el sitio, sin volver a
    // pedirle las pistas al servidor.
    function renderTrackList(tracks) {
      const container = document.getElementById('items-container');
      container.innerHTML = '';
      const fragment = document.createDocumentFragment();

      if (tracks.length > 0) {
        const shuffleDiv = document.createElement('div');
        shuffleDiv.className = 'list-item list-item-shuffle';
        shuffleDiv.innerHTML = `
          <div class="list-item-shuffle-icon"><span class="material-icons">shuffle</span></div>
          <div class="list-item-info">
            <div class="list-item-title">${t('shuffle')}</div>
            <div class="list-item-sub">${t('shuffleAll')} ${tracks.length}</div>
          </div>
        `;
        shuffleDiv.onclick = () => playShuffleAll(tracks);
        fragment.appendChild(shuffleDiv);
      }

      tracks.forEach((track, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const imgUrl = getEmbyImageUrl(track);

        renderMediaRow(div, imgUrl, track.Name, track.Artists ? track.Artists.join(', ') : t('unknown'), isHiResAudio(track));

        div.onclick = () => {
          playlist = [...tracks];
          originalPlaylist = [...tracks];
          playlistVersion++;
          renderQueueList();
          refreshCarouselImages();
          playTrack(index);
          saveQueue();
          switchTab('playing');
        };
        div.querySelector('.list-item-more').onclick = (e) => {
          e.stopPropagation();
          openContextMenu(e, track);
        };

        fragment.appendChild(div);
      });
      container.appendChild(fragment);
    }

    function backToCategories() {
      // Si venimos de un sub-elemento (álbum/artista/playlist), volvemos a la lista de esa categoría
      if (navStack.length > 1) {
        const previous = navStack[navStack.length - 2] || navStack[0];
        navStack.pop();
        if (previous && previous.type === 'category' && previous.category) {
          loadCategory(previous.category);
          return;
        }
        if (previous && previous.type === 'favorites' && previous.favKind) {
          loadFavorites(previous.favKind);
          return;
        }
        if (previous && previous.type === 'favmenu') {
          showFavoritesMenu();
          return;
        }
      }
      // Si no hay historial, volvemos al menú principal de My music
      navStack = [];
      favoritesViewKind = '';
      document.getElementById('category-view').style.display = 'block';
      document.getElementById('list-view').style.display = 'none';
      document.getElementById('fav-view').style.display = 'none';
      document.getElementById('home-grid').style.display = '';
      // applyFeaturedVisibility respeta si el side show está desactivado
      applyFeaturedVisibility();
    }

    // --- MENÚ CONTEXTUAL ---

    function getEmbyMediaInfo(item) {
      if (!item || !item.MediaSources || !item.MediaSources[0]) return null;
      const ms = item.MediaSources[0];
      const audioStream = (ms.MediaStreams || []).find(s => s && s.Type === 'Audio') ||
        (ms.MediaStreams || [])[0] ||
        {};
      return {
        container: ms.Container || audioStream.Container || '',
        bitrate: ms.Bitrate || audioStream.BitRate || audioStream.Bitrate || 0,
        sampleRate: ms.SampleRate || audioStream.SampleRate || 0,
        channels: ms.Channels || audioStream.Channels || 0,
        codec: audioStream.Codec || ms.Codec || ''
      };
    }

    function getAudioQualityText(item) {
      if (!item) return '';
      // Emby/Jellyfin: MediaSources[0] + MediaStreams
      const embyInfo = getEmbyMediaInfo(item);
      if (embyInfo) {
        let parts = [];
        if (embyInfo.container) parts.push((embyInfo.codec || embyInfo.container).toUpperCase());
        if (embyInfo.bitrate) parts.push(formatBitrate(embyInfo.bitrate));
        if (embyInfo.sampleRate) parts.push(formatSampleRate(embyInfo.sampleRate));
        if (embyInfo.channels) parts.push(embyInfo.channels + ' ch');
        return parts.join(' · ');
      }
      // Plex / Local
      if (item._audioQuality) {
        const q = item._audioQuality;
        const qcodec = q.audioCodec || q.codec;
        let parts = [];
        if (q.container || qcodec) parts.push((qcodec || q.container).toUpperCase());
        if (q.bitrate) parts.push(formatBitrate(q.bitrate));
        if (q.sampleRate) parts.push(formatSampleRate(q.sampleRate));
        if (q.channels) parts.push(q.channels + ' ch');
        return parts.join(' · ');
      }
      return '';
    }

    function formatBitrate(bps) {
      if (!bps) return '';
      if (bps >= 1000000) return (bps / 1000000).toFixed(1) + ' Mbps';
      if (bps >= 1000) return Math.round(bps / 1000) + ' kbps';
      return bps + ' bps';
    }

    function formatSampleRate(hz) {
      if (!hz) return '';
      if (hz >= 1000) return (hz / 1000).toFixed(1) + ' kHz';
      return hz + ' Hz';
    }

    let hiresIconCounter = 0;
    function hiresIconHtml() {
      const gid = 'hiresGold' + (hiresIconCounter++);
      return '<span class="list-hires-icon" title="Hi-Res Audio" role="img" aria-label="Hi-Res Audio">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48.425 48.425" preserveAspectRatio="xMidYMid meet">' +
        '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#F9E1B4"/><stop offset="0.25" stop-color="#FAD37E"/>' +
        '<stop offset="0.55" stop-color="#E9A737"/><stop offset="0.8" stop-color="#D28B2D"/>' +
        '<stop offset="1" stop-color="#B4802C"/></linearGradient></defs>' +
        '<rect width="48.425" height="48.425" fill="url(#' + gid + ')"/>' +
        '<g fill="#000000">' +
        '<path d="M41.7749634,14.1011963c-1.2600098-0.5539551-1.6170044-0.8739624-1.6170044-1.5819702c0-0.9199829,0.7649536-1.2579956,1.5019531-1.2579956c0.6420288,0,1.4120483,0.177002,2.06604,0.4309692l0.401001-1.6709595c-0.6900024-0.3010254-1.5610352-0.4840088-2.5370483-0.4840088c-1.6729736,0-3.4299927,0.9379883-3.4299927,3.0750122c0,1.5319824,0.94104,2.3599854,2.5840454,3.0949707c1.2630005,0.592041,1.7909546,1.007019,1.7909546,1.809021c0,0.8930054-0.6679688,1.2359619-1.5539551,1.2359619c-0.7740479,0-1.6670532-0.1799927-2.5310059-0.5459595l-0.3920288,1.7160034c0.8710327,0.3460083,1.9949951,0.5509644,2.9230347,0.5509644c1.6900024,0,3.5479736-0.8009644,3.5479736-3.0709839C44.5289307,15.6342163,43.4369507,14.8822021,41.7749634,14.1011963"/>' +
        '<path d="M33.770813,9.5367432c-2.6090088,0-3.9619751,2.4330444-3.9619751,5.5050049c0,3.1640015,1.5310059,5.4320068,4.5939941,5.4320068c0.8619995,0,1.6459961-0.1589966,2.1539917-0.3659668l-0.242981-1.651001c-0.5709839,0.2059937-1.1790161,0.2959595-1.809021,0.2959595c-1.6209717,0-2.6350098-1.0749512-2.7449951-3.09198h5.572998v-0.8709717C37.3328247,11.6497803,36.3718262,9.5367432,33.770813,9.5367432 M35.4588623,14.0057373h-3.6990356c0.1359863-1.5789795,0.7160034-2.8409424,1.9920044-2.8409424c1.1779785,0,1.7070313,1.1709595,1.7070313,2.7529907V14.0057373z"/>' +
        '<path d="M26.9251709,13.7351685v-0.026001c1.157959-0.4550171,1.8460083-1.559021,1.8460083-3.1409912c0-2.6340332-1.5890503-3.6229858-3.4370117-3.6229858l-3.848999,0.0229492v13.4620361h1.8460083v-5.7349854h1.1459961c1.3859863,0,1.7039795,0.4609985,2.0369873,2.0199585c0.1950073,0.8699951,0.5529785,2.6799927,0.7420044,3.7150269h2.0219727c-0.3410034-1.4700317-0.617981-2.7520142-0.9389648-4.197998C27.9751587,14.6031494,27.663147,14.0061646,26.9251709,13.7351685 M24.8101807,12.8851318h-1.4790039V8.736145h1.5379639c1.0050049,0,2.0250244,0.342041,2.0250244,2.0629883C26.894165,12.335144,26.0111694,12.8851318,24.8101807,12.8851318"/>' +
        '<rect x="17.7680054" y="12.6350098" width="2.1149902" height="2.0369873"/><rect x="14.2819824" y="6.9680176" width="1.8839722" height="1.9249878"/><rect x="14.2730103" y="10.7529907" width="1.8770142" height="9.677002"/>' +
        '<polygon points="10.364502,12.6348267 6.1434937,12.6348267 6.1434937,6.9678345 4.2354736,6.9678345 4.2354736,20.4308472 6.1434937,20.4308472 6.1434937,14.4208374 10.364502,14.4208374 10.364502,20.4308472 12.2524414,20.4308472 12.2524414,6.9678345 10.364502,6.9678345"/>' +
        '<path d="M24.2147217,29.095459c-8.0780029,0-15.7089539-1.992981-22.4049683-5.5v23.0170288l44.8029785-0.0250244V23.595459C39.916748,27.102478,32.2977295,29.095459,24.2147217,29.095459 M10.17276,42.3274536l-0.7160034-2.2049561H6.3267517l-0.7089844,2.2049561H3.8527527l2.9330139-9.0119629h2.269989l2.9139709,9.0119629H10.17276z M20.2657471,39.6624756c0,1.8380127-1.3859863,2.8259888-3.2579956,2.8259888c-1.8430176,0-3.2410278-0.9879761-3.2410278-2.8259888v-6.3469849h1.6660156V39.4375c0,1.1029663,0.6610107,1.5559692,1.565979,1.5559692c0.9050293,0,1.6060181-0.4810181,1.6060181-1.5559692v-6.1220093h1.6610107V39.6624756z M25.8157349,42.3274536h-2.7529907v-9.0119629h2.7529907c2.6600342,0,4.1010132,1.697998,4.1010132,4.4679565C29.916748,40.5614624,28.475769,42.3274536,25.8157349,42.3274536 M34.1607666,42.3274536h-1.6470337v-9.0119629h1.6470337V42.3274536z M40.5587769,42.4634399c-2.434021,0-3.7790527-1.9229736-3.7790527-4.6309814s1.3270264-4.6799927,3.7790527-4.6799927c2.506958,0,3.8199463,1.9719849,3.8199463,4.6799927S43.0377197,42.4634399,40.5587769,42.4634399"/>' +
        '<polygon points="6.7034912,38.6351318 9.055481,38.6351318 7.8884888,34.7351685"/>' +
        '<path d="M25.585083,34.7817993h-0.8700562v6.0510254h0.8700562c1.8469849,0,2.6709595-1.1879883,2.6709595-3.0250244C28.2560425,35.9988403,27.4320679,34.7817993,25.585083,34.7817993"/>' +
        '<path d="M40.5587769,34.6429443c-1.4580078,0-2.1360474,1.4020386-2.1360474,3.1890259c0,1.7659912,0.6950073,3.1619873,2.1700439,3.1619873c1.4909668,0,2.1459961-1.3959961,2.1459961-3.1619873C42.7387695,36.0449829,42.0497437,34.6429443,40.5587769,34.6429443"/>' +
        '</g></svg></span>';
    }

    const LOSSLESS_CODECS = ['flac', 'alac', 'wav', 'pcm', 'aiff', 'ape', 'wv', 'dsd', 'dsf', 'dff', 'lpcm'];
    const LOSSLESS_EXTS = ['flac', 'wav', 'aiff', 'aif', 'ape', 'wv', 'dsf', 'dff', 'dsd'];

    function isHiresSampleRate(sampleRate) {
      // Hi-Res genérico: > 44 kHz (44.1 CD también se considera, como antes).
      // Plex tiene además un fallback propio para lossless sin sampleRate.
      return !!sampleRate && Number(sampleRate) > 44000;
    }

    function isLosslessCodec(codec) {
      if (!codec) return false;
      return LOSSLESS_CODECS.includes(String(codec).toLowerCase());
    }

    function isHiResAudio(item) {
      if (!item) return false;
      // Emby/Jellyfin
      const embyInfo = getEmbyMediaInfo(item);
      if (embyInfo && embyInfo.codec) {
        // Hi-Res solo aplica a codecs sin pérdida (lossless). Un MP3/AAC/etc
        // a 48 kHz NO es Hi-Res.
        if (!isLosslessCodec(embyInfo.codec)) return false;
        if (isHiresSampleRate(embyInfo.sampleRate)) return true;
      }
      // Plex
      if (item._audioQuality) {
        const q = item._audioQuality;
        const codec = q.audioCodec || q.codec || q.container || '';
        if (codec && !isLosslessCodec(codec)) return false;
        if (isHiresSampleRate(q.sampleRate)) return true;
        // Plex a veces no reporta sampleRate; si el códec es lossless
        // mostramos el icono (mejor mostrar que ocultar en caso de duda).
        if (codec && isLosslessCodec(codec) && q.sampleRate == null) return true;
      }
      // Local: inferir de la extensión del archivo (DSD/DSF/DFF siempre Hi-Res,
      // resto de lossless solo si la extensión lo sugiere)
      if (item.IsLocal && item.Path) {
        const ext = String(item.Path).split('.').pop().toLowerCase();
        if (['dsf', 'dff', 'dsd'].includes(ext)) return true;
        if (LOSSLESS_EXTS.includes(ext) && isHiresSampleRate(embyInfo && embyInfo.sampleRate)) return true;
      }
      return false;
    }

    function ctxShowInfo() {
      if (!ctxMenuItem) return;
      const info = document.getElementById('ctx-menu-info');
      const item = ctxMenuItem;
      const fileName = item.Path ? item.Path.split(/[/\\]/).pop() : t('noAvailable');
      const artist = item.Artists ? item.Artists.join(', ') : (item.AlbumArtist || t('unknown'));
      const album = item.Album || t('unknown');
      const quality = getAudioQualityText(item);
      info.replaceChildren();
      const rows = [[t('infoName'), item.Name], [t('infoArtist'), artist],
        [t('infoAlbum'), album], [t('infoFile'), fileName]];
      if (quality) rows.push([t('audioQuality'), quality]);
      rows.forEach(([label, value], index) => {
        if (index) info.appendChild(document.createElement('br'));
        const strong = document.createElement('strong');
        strong.textContent = label + ':';
        info.append(strong, document.createTextNode(' ' + (value || '')));
      });
      if (quality && isHiResAudio(item)) {
        const badge = document.createElement('span');
        badge.style.cssText = 'color:#e4a133;font-weight:bold;';
        badge.textContent = ' ★ HI-RES'; info.appendChild(badge);
      }
      info.style.display = 'block';
    }


    // --- MENÚ DE ACCIONES DE LA PORTADA (PLAYING) ---
    function getCurrentTrack() {
      return playlist && playlist[currentTrackIndex] ? playlist[currentTrackIndex] : null;
    }

    function openAlbumActionsMenu() {
      const track = getCurrentTrack();
      if (!track) {
        showToast('No hay ninguna canción en reproducción');
        return;
      }
      const title = document.getElementById('album-actions-title');
      const sub = document.getElementById('album-actions-sub');
      title.textContent = track.Name || '...';
      sub.textContent = (track.Artists && track.Artists.length) ? track.Artists.join(', ') : (track.AlbumArtist || '');
      const overlay = document.getElementById('album-actions-overlay');
      overlay.classList.add('open');
      overlay.style.display = 'flex';
    }

    function closeAlbumActionsMenu() {
      const overlay = document.getElementById('album-actions-overlay');
      overlay.classList.remove('open');
      overlay.style.display = 'none';
    }

    function currentTrackSearchTerms() {
      const track = getCurrentTrack();
      const artist = track.Artists && track.Artists.length ? track.Artists.join(' ') : (track.AlbumArtist || '');
      const title = track.Name || '';
      const album = track.Album || '';
      return { artist, title, album };
    }

    function albumActionsYouTube() {
      closeAlbumActionsMenu();
      const { artist, title } = currentTrackSearchTerms();
      const q = `${artist} ${title}`.trim();
      if (!q) return;
      window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), '_blank');
    }

    function albumActionsGoogleAlbum() {
      closeAlbumActionsMenu();
      const { artist, album, title } = currentTrackSearchTerms();
      let q = '';
      if (album) {
        q = `${album} ${artist}`.trim();
      } else {
        q = `${title} ${artist} álbum`.trim();
      }
      if (!q) return;
      window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank');
    }

    function albumActionsGoogleArtist() {
      closeAlbumActionsMenu();
      const { artist } = currentTrackSearchTerms();
      if (!artist) return;
      window.open('https://www.google.com/search?q=' + encodeURIComponent(artist), '_blank');
    }

    async function albumActionsMoreFromArtist() {
      closeAlbumActionsMenu();
      const track = getCurrentTrack();
      if (!track) return;
      const artist = track.Artists && track.Artists.length ? track.Artists[0] : (track.AlbumArtist || '');
      if (!artist) {
        showToast('No se ha podido identificar el artista');
        return;
      }
      try {
        const st = embyConfig.serverType;
        let artistItem = null;
        if (st === 'local') {
          // Local: buscar en la lista de artistas únicos
          const map = new Map();
          localTracks.filter(t => t.Type !== 'Playlist').forEach(t => {
            (t.Artists || [t.AlbumArtist || 'Desconocido']).forEach(a => {
              if (!map.has(a)) map.set(a, { Id: 'local_artist_' + a, Name: a, Type: 'MusicArtist', AlbumArtist: a, Artists: [], Count: 0, IsLocal: true });
              map.get(a).Count++;
            });
          });
          artistItem = map.get(artist) || null;
        } else if (st === 'plex') {
          // Plex: buscar artista por nombre
          const data = await fetchPlexJson(`${embyConfig.host}/search?query=${encodeURIComponent(artist)}&X-Plex-Token=${embyConfig.token}`);
          const meta = data.MediaContainer.Metadata || [];
          const found = meta.find(m => m.type === 8 && String(m.title || '').toLowerCase() === String(artist).toLowerCase());
          if (found) artistItem = normalizePlexItem(found);
        } else {
          // Emby/Jellyfin: buscar artista por nombre
          const res = await fetch(`${embyConfig.host}/Users/${embyConfig.userId}/Items?SearchTerm=${encodeURIComponent(artist)}&IncludeItemTypes=MusicArtist&Recursive=true&api_key=${embyConfig.token}`);
          const data = await res.json();
          if (data.Items && data.Items.length) artistItem = data.Items[0];
        }
        if (!artistItem) {
          showToast('No se encontró el artista: ' + artist);
          return;
        }
        // Navegar a la pestaña My music y cargar canciones del artista
        switchTab('music');
        loadSubItems(artistItem.Id, artistItem.Name, artistItem.Type);
        showToast('Mostrando canciones de ' + artist);
      } catch (e) {
        showToast('Error al cargar artista');
      }
    }

    // --- EASTER EGG WALKMAN ---
    let walkmanTaps = 0;
    let walkmanTapTimer = null;

    function walkmanTap() {
      walkmanTaps++;
      clearTimeout(walkmanTapTimer);
      walkmanTapTimer = setTimeout(() => { walkmanTaps = 0; }, 800);
      if (walkmanTaps >= 3) {
        walkmanTaps = 0;
        document.getElementById('github-popup-overlay').classList.add('open');
        document.getElementById('github-popup-overlay').style.display = 'flex';
      }
    }

    function closeGithubPopup() {
      const el = document.getElementById('github-popup-overlay');
      el.classList.remove('open');
      el.style.display = 'none';
    }

    function initAlbumSwipe() {
      const carousel = document.querySelector('#view-playing .carousel-container');
      const cards = [...carousel.querySelectorAll(':scope > .art-card')];
      let gesture = null, motion = null, frame = null;
      let suppressClickUntil = 0;

      function clearMotion() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        if (motion) motion.layer.remove();
        motion = null;
        carousel.classList.remove('album-swiping');
      }
      function cancel() { gesture = null; clearMotion(); }
      carousel.cancelAlbumSwipe = cancel;
      window.addEventListener('resize', cancel);

      function copyCard(source, layer, left, top, width, height) {
        const copy = source.cloneNode(true);
        [copy, ...copy.querySelectorAll('*')].forEach(el => {
          el.removeAttribute('id'); el.removeAttribute('onclick');
        });
        copy.className = 'art-card swipe-card';
        copy.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;transform:none;transition:none;animation:none;visibility:visible;pointer-events:none;`;
        layer.appendChild(copy);
        return copy;
      }
      function beginMotion(g, direction) {
        const current = document.getElementById('card-current');
        current.classList.remove('card-pop');
        const rect = current.getBoundingClientRect(), root = carousel.getBoundingClientRect();
        const zoom = rect.width / current.offsetWidth;
        const width = rect.width / zoom, height = rect.height / zoom;
        const left = (rect.left - root.left) / zoom, top = (rect.top - root.top) / zoom;
        const layer = document.createElement('div');
        layer.className = 'album-swipe-layer'; layer.setAttribute('aria-hidden', 'true');
        carousel.appendChild(layer);
        const classic = document.getElementById('view-playing').dataset.theme === 'classic';
        const z1 = document.getElementById('view-playing').dataset.theme === 'z1';
        const index = direction < 0
          ? (g.index + 1 < playlist.length ? g.index + 1 : (repeatMode === 1 ? 0 : g.index))
          : Math.max(0, g.index - 1);
        const incomingCard = classic || z1 ? (direction < 0 ? cards[0] : null) : (direction < 0 ? cards[2] : cards[0]);
        const backgrounds = [];
        // Move each queued cover once, keeping the remaining stack behind it.
        cards.filter(card => card !== current && card !== incomingCard && getComputedStyle(card).display !== 'none').forEach(card => {
          const r = card.getBoundingClientRect(), style = getComputedStyle(card);
          const copy = copyCard(card, layer, (r.left-root.left)/zoom, (r.top-root.top)/zoom, r.width/zoom, r.height/zoom);
          copy.style.opacity = style.opacity; copy.style.filter = style.filter; copy.style.zIndex = '1';
          backgrounds.push({copy, side:card.id, opacity:Number(style.opacity)});
        });
        const outgoing = copyCard(current, layer, left, top, width, height);
        const incoming = copyCard(current, layer, left, top, width, height);
        const track = playlist[index];
        incoming.querySelector('img').src = getEmbyImageUrl(track);
        const badge = incoming.querySelector('.hires-badge');
        if (badge) badge.classList.toggle('hidden', !isPlayingHiResEnabled() || !isHiResAudio(track));
        outgoing.style.zIndex = direction < 0 ? '4' : '2';
        incoming.style.zIndex = direction < 0 ? '3' : '4';
        outgoing.style.transformOrigin = incoming.style.transformOrigin = classic ? 'left center' : 'center';
        motion = { layer, outgoing, incoming, index, source: g.index, direction, width, zoom, classic, z1, backgrounds, progress: 0 };
        if (z1) {
          motion.z1Cards = [{copy:outgoing,slot:0}, {copy:incoming,slot:-direction}];
          backgrounds.forEach(({copy,side}) => {
            Object.assign(copy.style, {left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
            motion.z1Cards.push({copy,slot:side==='card-prev'?1:2});
          });
          // The third queued cover enters the back of the stack on advance.
          const outerTrack = direction < 0 && index !== g.index ? playlist[g.index + 3] : null;
          if (outerTrack) {
            const copy = copyCard(current,layer,left,top,width,height);
            copy.querySelector('img').src = getEmbyImageUrl(outerTrack);
            const badge = copy.querySelector('.hires-badge');
            if (badge) badge.classList.toggle('hidden', !isPlayingHiResEnabled() || !isHiResAudio(outerTrack));
            motion.z1Cards.push({copy,slot:3});
          }
        } else if (!classic) {
          motion.modernCards = [{copy:outgoing,slot:0}, {copy:incoming,slot:-direction}];
          backgrounds.forEach(({copy}) => {
            Object.assign(copy.style, {left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
            motion.modernCards.push({copy,slot:direction});
          });
          const outerIndex = index-direction;
          if (index!==g.index && playlist[outerIndex]) {
            const copy = copyCard(current,layer,left,top,width,height);
            copy.querySelector('img').src = getEmbyImageUrl(playlist[outerIndex]);
            const badge = copy.querySelector('.hires-badge');
            if (badge) badge.classList.toggle('hidden', !isPlayingHiResEnabled() || !isHiResAudio(playlist[outerIndex]));
            motion.modernCards.push({copy,slot:-direction*2});
          }
        }
        carousel.classList.add('album-swiping');
      }
      function draw(progress) {
        const m = motion;
        m.progress = progress;
        if (m.z1) {
          const slots = [
            {x:0,scale:1,angle:0,light:1,opacity:1},
            {x:.36,scale:.66,angle:-32,light:.88,opacity:1},
            {x:.57,scale:.5,angle:-38,light:.75,opacity:1},
            {x:.78,scale:.38,angle:-45,light:.65,opacity:0}
          ];
          m.z1Cards.forEach(({copy,slot}) => {
            const position = slot + m.direction * progress;
            let state;
            if (position < 0) {
              const t = Math.min(1, -position);
              state = {x:-.85*t,scale:1-.15*t,angle:10*t,light:1,opacity:1-Math.max(0,t-.6)/.4};
            } else {
              const i = Math.min(2, Math.floor(position)), t = Math.min(1, position-i);
              state = Object.fromEntries(Object.keys(slots[0]).map(key => [key, slots[i][key]+(slots[i+1][key]-slots[i][key])*t]));
            }
            copy.style.transformOrigin = 'center';
            copy.style.transform = `translateX(${state.x*m.width}px) perspective(${m.width*3}px) rotateY(${state.angle}deg) scale(${state.scale})`;
            copy.style.opacity = String(copy===m.incoming&&m.index===m.source?0:state.opacity);
            copy.style.filter = `brightness(${state.light})`;
            copy.style.zIndex = String(100-Math.round(Math.abs(position)*20));
            const badge = copy.querySelector('.hires-badge');
            if (badge) badge.style.opacity = String(Math.max(0,1-Math.abs(position)));
          });
          return;
        }
        if (!m.classic) {
          m.modernCards.forEach(({copy,slot}) => {
            const position = slot+m.direction*progress;
            const distance = Math.abs(position);
            const scale = 1-0.18*Math.min(2,distance);
            // The cover nearest the center stays opaque, so the artwork
            // behind it does not bleed through while the front order swaps.
            let opacity = distance<=1 ? Math.min(1,1.5-distance) : Math.max(0,(2-distance)*0.5);
            if (copy===m.incoming && m.index===m.source) opacity = 0;
            if (copy===m.outgoing && m.index!==m.source-m.direction) opacity *= 1-progress;
            copy.style.transformOrigin = 'center';
            copy.style.transform = `translateX(${position*m.width*0.58}px) scale(${scale})`;
            copy.style.opacity = String(opacity);
            copy.style.filter = `brightness(${1-0.3*Math.min(1,distance)})`;
            copy.style.zIndex = String(10+Math.round((2-distance)*100));
            const badge = copy.querySelector('.hires-badge');
            if (badge) badge.style.opacity = String(Math.max(0,1-distance));
          });
          return;
        }
        const start = m.classic && m.direction < 0 ? 0.34 : 0.65;
        const scale = m.classic ? 0.86 : 0.82;
        const outgoingDistance = m.direction > 0 && m.classic ? 0.34 : 0.95;
        m.outgoing.style.transform = `translateX(${m.direction*progress*m.width*outgoingDistance}px) scale(${1-progress*(1-scale)}) rotate(${m.direction<0?-progress*4:0}deg)`;
        m.outgoing.style.opacity = String(m.direction<0 ? Math.max(0,1-Math.max(0,progress-0.65)/0.35) : 1-progress*0.15);
        m.incoming.style.transform = `translateX(${-m.direction*start*m.width*(1-progress)}px) scale(${scale+(1-scale)*progress})`;
        m.incoming.style.opacity = String(m.direction<0 ? 1 : progress);
        m.incoming.style.filter = `brightness(${0.75+progress*0.25})`;
        if (m.index === m.source) m.incoming.style.opacity = '0';
        if (m.classic) m.backgrounds.forEach(({copy,side,opacity}) => {
          if (m.direction<0) {
            copy.style.transform = `translateX(${-0.28*m.width*progress}px) scale(${1+(0.86/0.72-1)*progress})`;
            copy.style.opacity = String(opacity+(0.85-opacity)*progress);
          } else if (side==='card-prev') {
            copy.style.transform = `translateX(${0.28*m.width*progress}px) scale(${1+(0.72/0.86-1)*progress})`;
          } else copy.style.opacity = String(opacity*(1-progress));
        });
      }
      function settle(commit) {
        if (!motion) return;
        commit = commit && motion.index !== motion.source;
        const m = motion, from = m.progress, to = commit ? 1 : 0;
        const started = performance.now(), duration = commit ? 260 : 200;
        function tick(now) {
          if (currentTrackIndex !== m.source) { cancel(); return; }
          const t = Math.min(1, (now-started)/duration);
          draw(from+(to-from)*(1-Math.pow(1-t,3)));
          if (t < 1) { frame = requestAnimationFrame(tick); return; }
          // Swap real artwork underneath the final frame, avoiding a second pop.
          if (commit && m.index !== m.source) playTrack(m.index, true);
          clearMotion();
        }
        frame = requestAnimationFrame(tick);
      }
      carousel.addEventListener('pointerdown', event => {
        if (!event.isPrimary) { cancel(); return; }
        if (event.button !== 0 || frame !== null) return;
        const card = event.target.closest('.art-card');
        if (!card || !playlist[currentTrackIndex]) return;
        suppressClickUntil = 0;
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, index: currentTrackIndex,
          threshold: Math.max(40, Math.min(90, card.getBoundingClientRect().width * 0.15)) };
        card.setPointerCapture(event.pointerId);
      });
      carousel.addEventListener('pointermove', event => {
        if (!gesture || event.pointerId !== gesture.id) return;
        const dx = event.clientX-gesture.x, dy = event.clientY-gesture.y;
        if (currentTrackIndex !== gesture.index || (Math.abs(dy)>12 && Math.abs(dy)>Math.abs(dx))) {
          gesture = null; settle(false); return;
        }
        if (Math.abs(dx) < 8 && !motion) return;
        const direction = dx < 0 ? -1 : 1;
        if (motion && motion.direction !== direction) clearMotion();
        if (!motion) beginMotion(gesture, direction);
        const distance = Math.abs(dx) / motion.zoom;
        draw(Math.min(motion.index===motion.source?0.12:0.95, distance/(motion.width*(motion.classic||motion.z1?0.85:0.58))));
      });
      carousel.addEventListener('pointerup', event => {
        if (!gesture || event.pointerId !== gesture.id) return;
        const { x, y, threshold } = gesture;
        gesture = null;
        const dx = event.clientX-x, dy = event.clientY-y;
        const commit = Math.abs(dx)>=threshold && Math.abs(dx)>=Math.abs(dy)*1.35;
        if (!motion && commit) beginMotion({index:currentTrackIndex}, dx<0?-1:1);
        if (motion) {
          suppressClickUntil = performance.now()+600;
          settle(commit);
        }
      });
      const abortGesture = () => { if (gesture) { gesture = null; settle(false); } };
      carousel.addEventListener('pointercancel', abortGesture);
      carousel.addEventListener('lostpointercapture', abortGesture);
      carousel.addEventListener('click', event => {
        if (performance.now()>=suppressClickUntil) return;
        suppressClickUntil = 0; event.preventDefault(); event.stopImmediatePropagation();
      }, true);
    }

    function playCarouselSide(side) {
      if (['classic', 'z1'].includes(document.getElementById('view-playing').dataset.theme)) {
        const index = currentTrackIndex + side;
        if (playlist[index]) playTrack(index);
      } else if (side === 1) {
        prevTrack();
      } else {
        nextTrack();
      }
    }

    function refreshCarouselImages() {
      updatePlayingThemeData();
      const queued = ['classic', 'z1'].includes(document.getElementById('view-playing').dataset.theme);
      // Classic and Z1 stack the next two queued tracks behind the current artwork.
      const indexes = queued
        ? [currentTrackIndex + 1, currentTrackIndex + 2]
        : [currentTrackIndex - 1, currentTrackIndex + 1];
      ['prev', 'next'].forEach((side, i) => {
        const track = playlist[indexes[i]];
        const card = document.getElementById('card-' + side);
        card.style.display = track ? '' : 'none';
        if (track) setCardImg(document.getElementById('img-' + side), getEmbyImageUrl(track));
      });
    }


    // Si el logo (app-logo) ya no cabe en el header (pantallas muy pequeñas), lo oculta.
    // Solo aplica en la versión móvil; en escritorio el logo siempre permanece visible.
    function fitHeader(zoom) {
      const header = document.querySelector('header');
      const appLogo = document.getElementById('app-logo');
      if (!header || !appLogo) return;
      if (document.body.dataset.theme === 'z1') { appLogo.style.display = ''; return; }

      const isMobile = window.innerWidth <= 768;
      if (!isMobile) {
        appLogo.style.display = '';
        return;
      }

      if (zoom === undefined) {
        zoom = Number(loadLS('walkman_zoom')) || 100;
      }
      const forceHide = Number(zoom) >= 125;
      appLogo.style.display = forceHide ? 'none' : '';

      if (forceHide) return;

      // Medir el ancho natural de cada hijo del header (sin que se encojan en flexbox)
      const children = [...header.children].filter(el => getComputedStyle(el).display !== 'none').map(el => ({
        el,
        flex: el.style.flex || '',
        minWidth: el.style.minWidth || ''
      }));
      children.forEach(({ el }) => {
        el.style.flex = '0 0 auto';
        el.style.minWidth = 'auto';
      });

      const gaps = (children.length - 1) * 16;
      const totalWidth = children.reduce((sum, { el }) => sum + el.offsetWidth, 0) + gaps;
      const available = header.clientWidth - (parseFloat(getComputedStyle(header).paddingLeft) || 0)
                                              - (parseFloat(getComputedStyle(header).paddingRight) || 0);

      children.forEach(({ el, flex, minWidth }) => {
        el.style.flex = flex;
        el.style.minWidth = minWidth;
      });

      if (totalWidth > available - 10) {
        appLogo.style.display = 'none';
      }
    }

    window.addEventListener('resize', fitHeader);

