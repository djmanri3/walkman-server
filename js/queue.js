/* Cola de reproducción: persistencia en localStorage, render de la lista, drag & drop y acciones de contexto. */

    // --- Cola de reproducción persistente ---
    const QUEUE_LS_KEY = 'walkman_queue';
    let _saveQueueTimer = null;
    function saveQueue() {
      if (_saveQueueTimer) return;
      _saveQueueTimer = setTimeout(() => {
        _saveQueueTimer = null;
        try {
          const state = {
            v: 2,
            playlist: playlist,
            originalPlaylist: originalPlaylist,
            currentTrackIndex: currentTrackIndex,
            isShuffle: isShuffle,
            repeatMode: repeatMode
          };
          saveLS(QUEUE_LS_KEY, state);
        } catch (e) {}
      }, 300);
    }

    function restoreQueue() {
      try {
        const raw = loadLS(QUEUE_LS_KEY);
        if (!raw) return false;
        const state = JSON.parse(raw);
        if (!state || !Array.isArray(state.playlist) || state.playlist.length === 0) return false;
        playlist = state.playlist;
        originalPlaylist = Array.isArray(state.originalPlaylist) ? state.originalPlaylist : [...playlist];
        currentTrackIndex = Math.min(Math.max(0, state.currentTrackIndex || 0), playlist.length - 1);
        isShuffle = !!state.isShuffle;
        repeatMode = typeof state.repeatMode === 'number' ? state.repeatMode : 1;
        return true;
      } catch (e) { return false; }
    }

    // ---- Seguridad: Sanitización de URLs de servidores ----

    let ctxMenuItem = null;
    let ctxQueueIdx = -1;

    function openContextMenu(event, item, queueIdx = -1) {
      ctxMenuItem = item;
      ctxQueueIdx = queueIdx;
      const overlay = document.getElementById('context-menu-overlay');
      const title = document.getElementById('ctx-menu-title');
      const sub = document.getElementById('ctx-menu-sub');
      const info = document.getElementById('ctx-menu-info');
      const removeOpt = document.getElementById('ctx-remove-option');

      title.textContent = item.Name || t('noName');
      sub.textContent = item.Artists ? item.Artists.join(', ') : (item.AlbumArtist || '');
      info.style.display = 'none';
      // Solo mostrar "Eliminar de la cola" cuando el menú sale de la Play Queue
      removeOpt.style.display = queueIdx >= 0 ? 'flex' : 'none';
      overlay.classList.add('open');
    }

    function closeContextMenu() {
      document.getElementById('context-menu-overlay').classList.remove('open');
      ctxMenuItem = null;
      ctxQueueIdx = -1;
    }

    function isAlbumItem(item) {
      // Todos los álbumes llegan normalizados a Type === 'MusicAlbum' (emby, jellyfin, plex, local)
      return !!item && item.Type === 'MusicAlbum';
    }

    function isPlaylistItem(item) {
      return !!item && item.Type === 'Playlist';
    }

    function isArtistItem(item) {
      return !!item && item.Type === 'MusicArtist';
    }

    // Si el elemento es un álbum, playlist o artista, devuelve sus canciones; si no, el propio elemento
    async function resolveQueueItems(item) {
      const st = embyConfig.serverType;
      if (!isAlbumItem(item) && !isPlaylistItem(item) && !isArtistItem(item)) return [item];
      let tracks = [];
      try {
        const data = await fetchItems((SERVER_TYPES[st] || {}).Audio, item.Id, item.Type);
        tracks = (data && data.Items) ? data.Items : [];
      } catch (e) { tracks = []; }
      // Fallback: si el Id del álbum no devuelve canciones, probar con el Id de canción (AlbumId)
      if (tracks.length === 0 && item.AlbumId) {
        try {
          const data2 = await fetchItems((SERVER_TYPES[st] || {}).Audio, item.AlbumId, item.Type);
          tracks = (data2 && data2.Items) ? data2.Items : [];
        } catch (e) {}
      }
      if (tracks.length > 0) return tracks;
      return [item];
    }

    async function ctxPlay() {
      if (!ctxMenuItem) return;
      const items = await resolveQueueItems(ctxMenuItem);
      if (items.length === 0) return;
      playlist = [...items];
      originalPlaylist = [...items];
      playlistVersion++;
      renderQueueList();
      refreshCarouselImages();
      playTrack(0);
      saveQueue();
      switchTab('playing');
      closeContextMenu();
    }

    async function ctxPlayNext() {
      if (!ctxMenuItem) return;
      const items = await resolveQueueItems(ctxMenuItem);
      const idx = currentTrackIndex + 1;
      playlist.splice(idx, 0, ...items);
      originalPlaylist.splice(idx, 0, ...items);
      renderQueueList();
      refreshCarouselImages();
      saveQueue();
      const kind = isArtistItem(ctxMenuItem) ? 'Artista' : (isPlaylistItem(ctxMenuItem) ? 'Playlist' : 'Álbum');
      showToast(items.length === 1 ? 'Reproducirá después de la actual' : kind + ' programado (' + items.length + ' canciones)');
      closeContextMenu();
    }

    async function ctxAddToQueue() {
      if (!ctxMenuItem) return;
      const items = await resolveQueueItems(ctxMenuItem);
      playlist.push(...items);
      originalPlaylist.push(...items);
      renderQueueList();
      refreshCarouselImages();
      saveQueue();
      const kind = isArtistItem(ctxMenuItem) ? t('kindArtist') : (isPlaylistItem(ctxMenuItem) ? t('kindPlaylist') : t('kindAlbum'));
      showToast(items.length === 1 ? t('addedToQueue') : t('addedToQueueMany').replace('{kind}', kind).replace('{n}', String(items.length)));
      closeContextMenu();
    }

    function ctxRemoveFromQueue() {
      if (!ctxMenuItem) return;
      // Al venir de la Play Queue, ctxQueueIdx es el índice real en playlist
      let idx = ctxQueueIdx;
      if (idx < 0 || idx >= playlist.length) {
        // Retroceso: buscar por coincidencia de Id/Name
        idx = playlist.findIndex(t => t && (t.Id === ctxMenuItem.Id || t.Name === ctxMenuItem.Name));
      }
      if (idx < 0) {
        showToast(t('notInQueue'));
        closeContextMenu();
        return;
      }
      playlist.splice(idx, 1);
      const oIdx = originalPlaylist.findIndex(t => t && (t.Id === ctxMenuItem.Id || t.Name === ctxMenuItem.Name));
      if (oIdx >= 0) originalPlaylist.splice(oIdx, 1);

      // Ajustar índice de reproducción si se borra algo antes o igual que la actual
      if (idx < currentTrackIndex) {
        currentTrackIndex--;
      } else if (idx === currentTrackIndex) {
        // Si se borra la canción actual, retroceder o avanzar
        if (playlist.length > 0) {
          currentTrackIndex = Math.min(currentTrackIndex, playlist.length - 1);
        }
      }

      if (playlist.length === 0) {
        currentTrackIndex = -1;
      }

      renderQueueList();
      refreshCarouselImages();
      saveQueue();
      showToast(t('removedFromQueueToast'));
      closeContextMenu();
    }


    function toggleQueueDrawer() {
      document.getElementById('queue-drawer').classList.toggle('open');
    }

    function renderQueueList() {
      const container = document.getElementById('queue-list-container');
      container.innerHTML = '';

      if (playlist.length === 0) {
        container.innerHTML = '<div style="color: #aaa; font-size: 13px; text-align: center; margin-top: 20px;">' + t('emptyQueue') + '</div>';
        return;
      }

      const fragment = document.createDocumentFragment();

      playlist.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = `queue-item ${idx === currentTrackIndex ? 'active' : ''}`;
        div.dataset.idx = idx;
        const imgUrl = getEmbyImageUrl(item);
        
        div.innerHTML = `
          <button class="queue-drag" data-idx="${idx}" title="Arrastrar para reordenar"><span class="material-icons">drag_handle</span></button>
          <img loading="lazy" src="${imgUrl}" onerror="this.onerror=null;this.src='${defaultPlaceholder}';">
          <div class="queue-item-info">
            <div class="queue-item-title">${item.Name}</div>
            <div class="queue-item-artist">${item.Artists ? item.Artists.join(', ') : 'Artista'}</div>
          </div>
          <button class="list-item-more"><span class="material-icons">more_vert</span></button>
        `;

        div.onclick = () => {
          if (window.__queueDragMoved) { window.__queueDragMoved = false; return; }
          playTrack(idx, true);
          renderQueueList();
        };
        div.querySelector('.list-item-more').onclick = (e) => {
          e.stopPropagation();
          openContextMenu(e, item, idx);
        };

        fragment.appendChild(div);
        const dragBtn = div.querySelector('.queue-drag');
        setupQueueDrag(dragBtn, div, idx, container);
      });
      container.appendChild(fragment);
    }

    function setCardImg(imgEl, src) {
      imgEl.onerror = () => { imgEl.src = defaultPlaceholder; };
      imgEl.src = src;
    }

    function setupQueueDrag(dragBtn, itemDiv, idx, container) {
      let dragging = false;
      let dragged = false;
      let startY = 0;

      dragBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        dragged = false;
        window.__queueDragMoved = false;
        startY = e.clientY;
        itemDiv.classList.add('dragging');
        try { dragBtn.setPointerCapture(e.pointerId); } catch (err) {}
      });

      dragBtn.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const delta = Math.abs(e.clientY - startY);
        if (delta > 6) dragged = true;
        if (!dragged) return;
        e.preventDefault();
        // Limpiar indicadores previos
        container.querySelectorAll('.queue-item').forEach((el) => {
          el.classList.remove('drop-above');
          el.classList.remove('drop-below');
        });
        // Encontrar el ítem sobre el que está el puntero
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (el) {
          const target = el.closest('.queue-item');
          if (target && target !== itemDiv) {
            const rect = target.getBoundingClientRect();
            const above = e.clientY < rect.top + rect.height / 2;
            target.classList.add(above ? 'drop-above' : 'drop-below');
          }
        }
      });

      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        itemDiv.classList.remove('dragging');
        const overEl = e && e.clientX != null ? document.elementFromPoint(e.clientX, e.clientY) : null;
        let target = overEl ? overEl.closest('.queue-item') : null;
        container.querySelectorAll('.queue-item').forEach((el) => {
          el.classList.remove('drop-above');
          el.classList.remove('drop-below');
        });
        if (dragged) window.__queueDragMoved = true;
        if (target && target !== itemDiv && dragged) {
          const targetIdx = Number(target.dataset.idx);
          const from = Number(itemDiv.dataset.idx);
          reorderPlaylist(from, targetIdx);
          renderQueueList();
        }
      }

      dragBtn.addEventListener('pointerup', endDrag);
      dragBtn.addEventListener('pointercancel', endDrag);
    }

    function reorderPlaylist(from, to) {
      if (from === to || from < 0 || to < 0 || from >= playlist.length || to >= playlist.length) return;
      const [moved] = playlist.splice(from, 1);
      playlist.splice(to, 0, moved);
      if (currentTrackIndex === from) {
        currentTrackIndex = to;
      } else if (from < currentTrackIndex && to >= currentTrackIndex) {
        currentTrackIndex--;
      } else if (from > currentTrackIndex && to <= currentTrackIndex) {
        currentTrackIndex++;
      }
      playlistVersion++;
      refreshCarouselImages();
      saveQueue();
    }

