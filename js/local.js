/* Biblioteca local: escaneo de carpetas, extracción de metadatos y portadas incrustadas. */
    // ---- Biblioteca Local (File System Access API) ----
    let localTracks = [];
    let localRootName = '';

    const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'wav', 'opus', 'wma', 'webm']);

    async function pickLocalFolder() {
      showLocalImportBanner();
      // En la app Android, el selector de carpetas lo gestiona la propia app
      // (SAF) y entrega las pistas vía el puente onLocalTracks.
      if (window.AndroidBridge && window.AndroidBridge.pickLocalFolder) {
        window.AndroidBridge.pickLocalFolder();
        return;
      }
      // En Android/móvil el File System Access API es poco fiable;
      // usamos siempre el selector de carpeta (input webkitdirectory)
      if (!window.showDirectoryPicker || isMobileDevice()) {
        document.getElementById('local-folder-input').click();
        return;
      }
      const statusEl = document.getElementById('local-status');
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<div class="plex-spinner"></div><div>Escanenado carpetas...</div>';

      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        localRootName = dirHandle.name;
        localTracks = [];
        await scanDirectory(dirHandle);
        if (localTracks.length === 0) {
          statusEl.innerHTML = '<div style="color:#ff5555;">No se encontraron archivos de audio en la carpeta.</div>';
          return;
        }
        embyConfig.serverType = 'local';
        embyConfig.host = '';
        embyConfig.token = '';
        embyConfig.user = localRootName;
        saveServerSettings();
        statusEl.innerHTML = `<div style="color:#4CAF50;">✓ ${localTracks.length} canciones encontradas en "${localRootName}"</div>`;
        localTracks.sort((a, b) => a.Name.localeCompare(b.Name));
        updateLocalCounts();
        switchServerType('local');
        document.getElementById('emby-modal').style.display = 'none';
        switchTab('music');
      } catch (err) {
        if (err.name === 'AbortError') {
          statusEl.style.display = 'none';
          return;
        }
        statusEl.innerHTML = `<div style="color:#ff5555;">Error: ${err.message}</div>`;
      }
    }

    // Extracción manual de portada incrustada leyendo los bytes del archivo.
    // Soporta MP3 (APIC frame en ID3v2) y FLAC (METADATA_BLOCK_PICTURE).
    async function extractCoverManually(file) {
      try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const ext = (file.name.split('.').pop() || '').toLowerCase();

        if (ext === 'flac') {
          // "fLaC" header + metadata blocks
          let pos = 4;
          while (pos + 4 <= bytes.length) {
            const last = bytes[pos] & 0x80;
            const type = bytes[pos] & 0x7f;
            const len = ((bytes[pos+1] << 24) | (bytes[pos+2] << 16) | (bytes[pos+3] << 8) | bytes[pos+4]);
            pos += 4;
            if (type === 6) { // PICTURE
              let p = pos + 4; // skip picture type(4)
              const mimeLen = (bytes[p] << 24) | (bytes[p+1] << 16) | (bytes[p+2] << 8) | bytes[p+3];
              p += 4;
              const mime = new TextDecoder().decode(bytes.slice(p, p + mimeLen));
              p += mimeLen;
              const descLen = (bytes[p] << 24) | (bytes[p+1] << 16) | (bytes[p+2] << 8) | bytes[p+3];
              p += 4 + descLen;
              p += 4; // width
              p += 4; // height
              p += 4; // depth
              p += 4; // colors
              const dataLen = (bytes[p] << 24) | (bytes[p+1] << 16) | (bytes[p+2] << 8) | bytes[p+3];
              p += 4;
              const imgBytes = bytes.slice(p, p + dataLen);
              if (imgBytes.length > 0) {
                return URL.createObjectURL(new Blob([imgBytes], { type: mime || 'image/jpeg' }));
              }
            }
            pos += len;
            if (last) break;
          }
        } else {
          // MP3 ID3v2: "ID3" + version(2) + flags(1) + size(4 syncsafe)
          if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
            const version = bytes[3];
            let pos = 10;
            const tagSize = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
            const end = Math.min(pos + tagSize, bytes.length);
            while (pos + 10 <= end) {
              const frameId = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]);
              if (frameId === '\x00\x00\x00\x00' || !/^[A-Z0-9]{4}$/.test(frameId)) break;
              let size;
              if (version === 4) {
                size = ((bytes[pos+4] & 0x7f) << 21) | ((bytes[pos+5] & 0x7f) << 14) | ((bytes[pos+6] & 0x7f) << 7) | (bytes[pos+7] & 0x7f);
              } else {
                size = (bytes[pos+4] << 24) | (bytes[pos+5] << 16) | (bytes[pos+6] << 8) | bytes[pos+7];
              }
              const frameData = pos + 10;
              if (frameId === 'APIC' && frameData + size <= bytes.length) {
                const enc = bytes[frameData];
                let p = frameData + 1;
                let mimeEnd = p;
                while (mimeEnd < frameData + size && bytes[mimeEnd] !== 0) mimeEnd++;
              const mime = new TextDecoder().decode(bytes.slice(p, mimeEnd));
                p = mimeEnd + 1; // picture type
                p++; // skip pic type
                if (enc === 0 || enc === 3) {
                  while (p < frameData + size && bytes[p] !== 0) p++;
                  p++;
                } else {
                  while (p + 1 < frameData + size && !(bytes[p] === 0 && bytes[p+1] === 0)) p += 2;
                  p += 2;
                }
                const imgBytes = bytes.slice(p, frameData + size);
                if (imgBytes.length > 0) {
                  return URL.createObjectURL(new Blob([imgBytes], { type: mime || 'image/jpeg' }));
                }
              }
              pos = frameData + size;
            }
          }
        }
        return '';
      } catch (e) {
        console.warn('[WALKMAN] error extractCoverManually', e);
        return '';
      }
    }

    function embeddedCoverUrl(file) {
      return new Promise((resolve) => {
        // Primer intento: lector manual de bytes (más fiable)
        extractCoverManually(file).then((manualCover) => {
          if (manualCover) return resolve(manualCover);
          // Respaldo: jsmediatags
          try {
            if (!window.jsmediatags || !window.jsmediatags.BlobReader) {
              return resolve('');
            }
            const reader = new window.jsmediatags.BlobReader(file);
            new window.jsmediatags.Reader()
              .setReader(reader)
              .read({
                onSuccess: (tag) => {
                  try {
                    const tags = tag && tag.tags ? tag.tags : {};
                    let pic = tags.picture;
                    if (!pic && tags.PIC) pic = tags.PIC;
                    if (!pic && tags.APIC) pic = tags.APIC;
                    if (pic && pic.data) {
                      const bytes = new Uint8Array(pic.data);
                      const blob = new Blob([bytes], { type: pic.format || 'image/jpeg' });
                      return resolve(URL.createObjectURL(blob));
                    }
                    return resolve('');
                  } catch (e) {
                    return resolve('');
                  }
                },
                onError: () => resolve('')
              });
          } catch (e) {
            resolve('');
          }
        });
      });
    }

    async function handleLocalFolderInput(event) {
      const statusEl = document.getElementById('local-status');
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<div class="plex-spinner"></div><div>Leyendo carpetas...</div>';

      try {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) {
          hideLocalImportBanner();
          statusEl.textContent = '';
          statusEl.style.display = 'none';
          return;
        }
        localTracks = [];
        localRootName = 'Local';

        // Mapa de portadas por álbum (desde archivos de imagen de portada) — instantáneo
        const coverMap = new Map();
        for (const file of files) {
          const lower = file.name.toLowerCase();
          const ext = lower.split('.').pop();
          if (['jpg','jpeg','png','webp','gif'].includes(ext) && (lower.includes('cover') || lower.includes('folder') || lower.includes('albumart') || lower === 'cover.jpg' || lower === 'folder.jpg' || lower === 'album.jpg' || lower === 'front.jpg')) {
            const parts = (file.webkitRelativePath || '').split('/');
            const albumName = parts.length > 1 ? parts[parts.length - 2] : 'Desconocido';
            if (!coverMap.has(albumName)) {
              coverMap.set(albumName, URL.createObjectURL(file));
            }
          }
        }

        // Constructor de pistas: rápido, sin leer tags (solo asignamos la portada de carpeta si existe)
        for (const file of files) {
          const lower = file.name.toLowerCase();
          const ext = lower.split('.').pop();
          if (!AUDIO_EXTENSIONS.has(ext)) continue;

          const parts = (file.webkitRelativePath || file.name).split('/');
          const albumName = parts.length > 1 ? parts[parts.length - 2] : 'Desconocido';
          const objUrl = URL.createObjectURL(file);
          const title = file.name.replace(/\.\w+$/, '');

          localTracks.push({
            Id: `local_${localTracks.length}_${Date.now()}`,
            Name: title,
            Artists: [albumName || 'Desconocido'],
            AlbumArtist: albumName || 'Desconocido',
            Album: albumName || 'Local',
            Type: 'Audio',
            Duration: 0,
            Path: file.webkitRelativePath || file.name,
            objUrl: objUrl,
            coverUrl: coverMap.get(albumName) || '',
            IsLocal: true,
            _file: file
          });
        }

        if (localTracks.length === 0) {
          statusEl.innerHTML = '<div style="color:#ff5555;">No se encontraron archivos de audio en la carpeta.</div>';
          return;
        }

        embyConfig.serverType = 'local';
        embyConfig.host = '';
        embyConfig.token = '';
        embyConfig.user = localRootName;
        saveServerSettings();
        statusEl.innerHTML = `<div style="color:#4CAF50;">✓ ${localTracks.length} canciones cargadas. Extrayendo portadas...</div>`;
        localTracks.sort((a, b) => a.Name.localeCompare(b.Name));
        updateLocalCounts();
        switchServerType('local');
        document.getElementById('emby-modal').style.display = 'none';
        switchTab('music');

        // Extraer portadas incrustadas en segundo plano (solo las que aún no tienen carpeta)
        extractEmbeddedCoversInBackground(localTracks);
        extractAudioQualityInBackground(localTracks);
      } catch (err) {
        hideLocalImportBanner();
        statusEl.innerHTML = `<div style="color:#ff5555;">Error: ${err.message}</div>`;
      }
    }

    // Recibe de la app Android (vía selector SAF) la lista de pistas locales y
    // las integra en la biblioteca local, igual que handleLocalFolderInput.
    window.onAndroidLocalTracks = function (tracks) {
      if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        const statusEl = document.getElementById('local-status');
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.innerHTML = '<div style="color:#ff5555;">No se encontraron archivos de audio en la carpeta.</div>';
        }
        return;
      }
      localTracks = tracks.map(t => Object.assign({}, t, { IsLocal: true }));
      localRootName = (tracks[0] && tracks[0].Album) || 'Local';
      embyConfig.serverType = 'local';
      embyConfig.host = '';
      embyConfig.token = '';
      embyConfig.user = localRootName;
      saveServerSettings();
      localTracks.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
      updateLocalCounts();
      switchServerType('local');
      const modal = document.getElementById('emby-modal');
      if (modal) modal.style.display = 'none';
      switchTab('music');
      renderQueueList();
      refreshCarouselImages();
      const statusEl = document.getElementById('local-status');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<div style="color:#4CAF50;">✓ ' + localTracks.length + ' canciones cargadas.</div>';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }
      hideLocalImportBanner();
    };

    // Extrae la calidad de audio (bitrate, sample rate, codec) de un archivo local
    // vía jsmediatags cuando el formato lo permite (MP3/FLAC/MP4 tienen tags).
    function extractLocalAudioQuality(file) {
      return new Promise((resolve) => {
        try {
          if (!window.jsmediatags || !window.jsmediatags.BlobReader) return resolve(null);
          const reader = new window.jsmediatags.BlobReader(file);
          new window.jsmediatags.Reader()
            .setReader(reader)
            .read({
              onSuccess: (tag) => {
                try {
                  const tags = tag && tag.tags ? tag.tags : {};
                  const q = {};
                  if (tags.sampleRate || tags['samplerate']) { /* tonal */ }
                  q.sampleRate = tags.sampleRate || null;
                  q.bitrate = tags.bitrate ? Number(tags.bitrate) : null;
                  q.codec = tags.audioFormat || tags.format || '';
                  // Fallback por extensión
                  const ext = String(file && file.name || '').split('.').pop().toLowerCase();
                  if (!q.sampleRate && ['dsf', 'dff', 'dsd'].includes(ext)) q.sampleRate = 2822400;
                  if (q.sampleRate || q.bitrate || q.codec) return resolve(q);
                  return resolve(null);
                } catch (e) { return resolve(null); }
              },
              onError: () => resolve(null)
            });
        } catch (e) { resolve(null); }
      });
    }

    async function extractAudioQualityInBackground(tracks) {
      const pending = tracks.filter(t => t._file && !t._audioQuality);
      if (pending.length === 0) return;
      const CONCURRENCY = 3;
      let i = 0;
      async function worker() {
        while (i < pending.length) {
          const idx = i++;
          const track = pending[idx];
          const q = await extractLocalAudioQuality(track._file);
          if (q) track._audioQuality = q;
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
    }

    async function extractEmbeddedCoversInBackground(tracks) {
      const pending = tracks.filter(t => !t.coverUrl && t._file);
      if (pending.length === 0) {
        hideLocalImportBanner();
        return;
      }

      const CONCURRENCY = 4;
      let i = 0;
      let done = 0;
      let coversFound = 0;
      const toast = document.getElementById('context-toast');

      async function worker() {
        while (i < pending.length) {
          const idx = i++;
          const track = pending[idx];
          const cover = await embeddedCoverUrl(track._file);
          if (cover) {
            // Propagar la portada a todas las pistas del mismo álbum
            track.coverUrl = cover;
            tracks.forEach(t => {
              if (t !== track && !t.coverUrl && t.Album === track.Album) {
                t.coverUrl = cover;
              }
            });
            coversFound++;
          }
          done++;
          toast.textContent = `Extrayendo portadas... ${done}/${pending.length}`;
          if (!toast.classList.contains('show')) toast.classList.add('show');
        }
      }

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

      console.log(`[WALKMAN] portadas extraídas: ${coversFound}/${pending.length}`);
      toast.textContent = coversFound > 0 ? t('coversReady').replace('{n}', coversFound) : t('noEmbeddedCovers');
      setTimeout(() => toast.classList.remove('show'), 1500);
      hideLocalImportBanner();

      // Refrescar cola, carrusel y la vista actual para mostrar las portadas ya extraídas
      renderQueueList();
      refreshCarouselImages();
      const itemsContainer = document.getElementById('items-container');
      if (itemsContainer && itemsContainer.style.display !== 'none' && itemsContainer.children.length > 0) {
        const activeTitle = document.getElementById('selected-category-title');
        const category = activeTitle ? activeTitle.textContent : '';
        if (category === 'Songs' || category === 'Albums' || category === 'Artists') {
          loadCategory(category);
        }
      }
    }

    async function scanDirectory(dirHandle, albumName, coverUrl) {      const dirAlbumName = albumName || dirHandle.name || 'Desconocido';

      let dirCoverUrl = coverUrl || '';
      const coverCandidates = ['cover.jpg','cover.jpeg','cover.png','folder.jpg','folder.jpeg','folder.png','album.jpg','album.jpeg','front.jpg','front.png'];

      const entries = [];
      for await (const entry of dirHandle.values()) {
        entries.push(entry);
      }

      for (const entry of entries) {
        if (entry.kind !== 'file') continue;
        const lower = entry.name.toLowerCase();
        const ext = lower.split('.').pop();
        if (coverCandidates.includes(lower) || lower.includes('cover') || lower.includes('folder') || lower.includes('albumart')) {
          if (['jpg','jpeg','png','webp','gif'].includes(ext)) {
            const file = await entry.getFile();
            dirCoverUrl = URL.createObjectURL(file);
            break;
          }
        }
      }

      for (const entry of entries) {
        if (entry.kind === 'directory') {
          await scanDirectory(entry, entry.name, '');
        } else if (entry.kind === 'file') {
          const lower = entry.name.toLowerCase();
          const ext = lower.split('.').pop();
          if (AUDIO_EXTENSIONS.has(ext)) {
            const file = await entry.getFile();
            const objUrl = URL.createObjectURL(file);
            const title = entry.name.replace(/\.\w+$/, '');
            localTracks.push({
              Id: `local_${localTracks.length}_${Date.now()}`,
              Name: title,
              Artists: [dirAlbumName || 'Desconocido'],
              AlbumArtist: dirAlbumName || 'Desconocido',
              Album: dirAlbumName || 'Local',
              Type: 'Audio',
              Duration: 0,
              Path: entry.name,
              objUrl: objUrl,
              coverUrl: dirCoverUrl || '',
              IsLocal: true
            });
          }
        }
      }
    }

    function updateLocalCounts() {
      document.getElementById('count-songs').textContent = localTracks.filter(t => t.Type !== 'Playlist').length;
      document.getElementById('count-albums').textContent = new Set(localTracks.filter(t => t.Type !== 'Playlist').map(t => t.Album)).size;
      document.getElementById('count-artists').textContent = new Set(localTracks.filter(t => t.Type !== 'Playlist').map(t => t.AlbumArtist)).size;
      document.getElementById('count-playlists').textContent = localTracks.filter(t => t.Type === 'Playlist').length;
    }
