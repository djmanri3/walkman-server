/* UI principal: pestañas, ajustes, zoom, búsqueda, vistas de biblioteca, menús contextuales, carrusel y acciones de álbum. */
    // Pila de navegación para el botón Volver
    let navStack = [];

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

    function applyCarouselZoom(z) {
      const num = Math.max(55, Math.min(175, Number(z) || 100));
      try { document.documentElement.style.setProperty('--carousel-size', String(num / 100)); } catch (e) {}
      const opts = document.querySelectorAll('#carousel-options .accent-option');
      opts.forEach(o => {
        o.classList.toggle('active', Number(o.dataset.czoom) === num);
      });
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
            
            div.innerHTML = `
              <img src="${imgUrl}">
              <div class="list-item-info">
                <div class="list-item-title">${item.Name}</div>
                <div class="list-item-sub">${item.Type} • ${item.AlbumArtist || item.Artists ? (item.Artists || []).join(', ') : ''}</div>
              </div>
              <button class="list-item-more"><span class="material-icons">more_vert</span></button>
            `;
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
        div.style.backgroundImage = `url('${slide.img}')`;
        div.innerHTML = `
          <div class="featured-slide-bg" style="background-image:url('${slide.img}')"></div>
          <div class="featured-slide-art" style="background-image:url('${slide.img}')"></div>
          <div class="featured-slide-overlay">
            <div class="featured-slide-title">${slide.title}</div>
            <div class="featured-slide-artist">${slide.artist}</div>
          </div>
        `;
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

      // Fix carátulas de álbumes (Emby/Jellyfin): el Id del álbum listado a
      // veces da 404 aunque reporte imagen; el fiable es el Id de la canción,
      // que es el álbum físico que sí tiene la portada. Aprovechamos este paso
      // para marcar en cada álbum si contiene alguna pista Hi-Res (_hasHiRes).
      if (category === 'Albums') {
        await resolveAlbumCoverIds(data.Items || []);
      }

      container.innerHTML = '';
      const catLabel = tCategory(category);
      const fragment = document.createDocumentFragment();

      if (category === 'Songs' && data.Items.length > 0) {
        const shuffleDiv = document.createElement('div');
        shuffleDiv.className = 'list-item list-item-shuffle';
        shuffleDiv.innerHTML = `
          <div class="list-item-shuffle-icon"><span class="material-icons">shuffle</span></div>
          <div class="list-item-info">
            <div class="list-item-title">${t('shuffle')}</div>
            <div class="list-item-sub">${t('shuffleAll')} ${data.Items.length}</div>
          </div>
        `;
        shuffleDiv.onclick = () => playShuffleAll(data.Items);
        fragment.appendChild(shuffleDiv);
      }

      data.Items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const imgUrl = getEmbyImageUrl(item);
        
        div.innerHTML = `
          <img loading="lazy" src="${imgUrl}">
          <div class="list-item-info">
            <div class="list-item-title">${item.Name}${(item._hasHiRes || isHiResAudio(item)) ? hiresIconHtml() : ''}</div>
            <div class="list-item-sub">${item.AlbumArtist || (item.Artists ? item.Artists.join(', ') : catLabel)}</div>
          </div>
          <button class="list-item-more"><span class="material-icons">more_vert</span></button>
        `;
        const imgEl = div.querySelector('img');
        applyArtistImageFallback(imgEl, item);

        div.onclick = () => {
          if (category === 'Songs') {
            playlist = [...data.Items];
            originalPlaylist = [...data.Items];
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

    async function loadSubItems(parentId, title, parentKind) {
      document.getElementById('category-view').style.display = 'none';
      document.getElementById('list-view').style.display = 'block';
      document.getElementById('selected-category-title').textContent = title;

      // Guardar hacia dónde volver (la categoría en la que estábamos)
      navStack.push({ type: 'subitems', category: navStack.length ? navStack[navStack.length - 1].category : '' });

      const container = document.getElementById('items-container');
      container.innerHTML = '<div style="color:#aaa;">' + t('loadingSongs') + '</div>';

      const st = embyConfig.serverType;
      const types = SERVER_TYPES[st];
      const data = await fetchItems(types.Audio, parentId, parentKind);
      const albumTracks = data.Items;
      container.innerHTML = '';
      const fragment = document.createDocumentFragment();

      if (albumTracks.length > 0) {
        const shuffleDiv = document.createElement('div');
        shuffleDiv.className = 'list-item list-item-shuffle';
        shuffleDiv.innerHTML = `
          <div class="list-item-shuffle-icon"><span class="material-icons">shuffle</span></div>
          <div class="list-item-info">
            <div class="list-item-title">${t('shuffle')}</div>
            <div class="list-item-sub">${t('shuffleAll')} ${albumTracks.length}</div>
          </div>
        `;
        shuffleDiv.onclick = () => playShuffleAll(albumTracks);
        fragment.appendChild(shuffleDiv);
      }

      albumTracks.forEach((track, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const imgUrl = getEmbyImageUrl(track);

        div.innerHTML = `
          <img loading="lazy" src="${imgUrl}" onerror="this.onerror=null;this.src='${defaultPlaceholder}';">
          <div class="list-item-info">
            <div class="list-item-title">${track.Name}${isHiResAudio(track) ? hiresIconHtml() : ''}</div>
            <div class="list-item-sub">${track.Artists ? track.Artists.join(', ') : t('unknown')}</div>
          </div>
          <button class="list-item-more"><span class="material-icons">more_vert</span></button>
        `;

        div.onclick = () => {
          playlist = [...albumTracks];
          originalPlaylist = [...albumTracks];
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
      }
      // Si no hay historial, volvemos al menú principal de My music
      navStack = [];
      document.getElementById('category-view').style.display = 'block';
      document.getElementById('list-view').style.display = 'none';
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
      info.innerHTML = `<strong>${t('infoName')}:</strong> ${item.Name}<br><strong>${t('infoArtist')}:</strong> ${artist}<br><strong>${t('infoAlbum')}:</strong> ${album}<br><strong>${t('infoFile')}:</strong> ${fileName}`;
      if (quality) {
        info.innerHTML += `<br><strong>${t('audioQuality')}:</strong> ${quality}`;
        if (isHiResAudio(item)) {
          info.innerHTML += ' <span style="color:#e4a133;font-weight:bold;">★ HI-RES</span>';
        }
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

    function refreshCarouselImages() {
      const imgCurrentEl = document.getElementById('img-current');
      const imgPrevEl = document.getElementById('img-prev');
      const imgNextEl = document.getElementById('img-next');
      const cardPrev = document.getElementById('card-prev');
      const cardNext = document.getElementById('card-next');

      if (currentTrackIndex > 0 && playlist[currentTrackIndex - 1]) {
        setCardImg(imgPrevEl, getEmbyImageUrl(playlist[currentTrackIndex - 1]));
        cardPrev.style.display = '';
      } else {
        cardPrev.style.display = 'none';
      }

      if (currentTrackIndex < playlist.length - 1 && playlist[currentTrackIndex + 1]) {
        setCardImg(imgNextEl, getEmbyImageUrl(playlist[currentTrackIndex + 1]));
        cardNext.style.display = '';
      } else {
        cardNext.style.display = 'none';
      }
    }


    // Si el logo (app-logo) ya no cabe en el header (pantallas muy pequeñas), lo oculta.
    // Solo aplica en la versión móvil; en escritorio el logo siempre permanece visible.
    function fitHeader(zoom) {
      const header = document.querySelector('header');
      const appLogo = document.getElementById('app-logo');
      if (!header || !appLogo) return;

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
      const children = [...header.children].map(el => ({
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

