/* Adaptadores de servidores multimedia: Emby, Jellyfin y Plex (conexión, auth, normalización de items e imágenes). */

    // ---- Server Adapter ----
    let embyConfig = { host: '', token: '', userId: '', libraryId: '', user: '', serverType: 'emby', allowHttp: false };
    // Mapeo de tipos por servidor
    const SERVER_TYPES = {
      emby:    { Audio: 'Audio', Album: 'MusicAlbum', Artist: 'MusicArtist', Playlist: 'Playlist' },
      jellyfin: { Audio: 'Audio', Album: 'MusicAlbum', Artist: 'MusicArtist', Playlist: 'Playlist' },
      plex:    { Audio: 10, Album: 9, Artist: 8, Playlist: 15 },
      local:   { Audio: 'Audio', Album: 'Album', Artist: 'Artist', Playlist: 'Playlist' }
    };
    // Lista de bibliotecas musicales disponibles del servidor conectado
    let availableLibraries = [];

    function switchServerType(type) {
      embyConfig.serverType = type;
      document.querySelectorAll('.server-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
      document.getElementById('form-emby').classList.toggle('active', type !== 'plex' && type !== 'local');
      document.getElementById('form-plex').classList.toggle('active', type === 'plex');
      document.getElementById('form-local').classList.toggle('active', type === 'local');
      syncHttpWarning();
      document.getElementById('library-selector').style.display = 'none';
      const logo = document.getElementById('server-modal-logo');
      if (logo) logo.setAttribute('data-type', type);
      const modalEl = document.getElementById('emby-modal');
      if (modalEl) modalEl.setAttribute('data-type', type);
      const logoImg = document.getElementById('server-modal-logo-img');
      if (logoImg) {
        const map = { emby: 'icons/Walkman_emby.png', jellyfin: 'icons/Walkman_jellyfin.png', plex: 'icons/Walkman_plex.png', local: 'icons/Walkman_monocolor.png' };
        logoImg.src = map[type] || 'icons/Walkman_monocolor.png';
      }
    }

    function onServerUrlInput(value) {
      const val = String(value || '').trim().toLowerCase();
      if (val.indexOf('http://') === 0 && !embyConfig.allowHttp) {
        embyConfig.allowHttp = true;
        saveServerSettings();
      }
      syncHttpWarning();
    }

    // El aviso aparece automáticamente cuando la URL del servidor es HTTP.
    function syncHttpWarning() {
      const warn = document.getElementById('http-warning');
      if (!warn) return;
      if (embyConfig.serverType === 'local') { warn.style.display = 'none'; return; }
      const field = embyConfig.serverType === 'plex'
        ? document.getElementById('plex-host')
        : document.getElementById('emby-host');
      const val = String(field && field.value || '').trim().toLowerCase();
      warn.style.display = val.indexOf('http://') === 0 ? 'block' : 'none';
    }


    function isMobileDevice() {
      return /Android|iPhone|iPad|iPod|Mobile|Touch/i.test(navigator.userAgent) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
    }

    function showLocalImportBanner() {
      if (!/Android/i.test(navigator.userAgent)) return;
      const b = document.getElementById('local-banner');
      if (b) b.style.display = 'block';
    }

    function hideLocalImportBanner() {
      const b = document.getElementById('local-banner');
      if (b) b.style.display = 'none';
    }

    async function connectServer() {
      const type = embyConfig.serverType;
      if (type === 'plex') return connectPlex();
      if (type === 'local') return pickLocalFolder();
      return connectEmbyJellyfin(type);
    }

    async function connectEmbyJellyfin(type) {
      const rawHost = document.getElementById('emby-host').value;
      const host = sanitizeServerUrl(rawHost);
      if (!host) { showToast('URL del servidor inválida. Usa http:// o https://', 'error'); return; }
      const user = document.getElementById('emby-user').value;
      const pass = document.getElementById('emby-pass').value;

      try {
        const authRes = await fetch(`${host}/Users/AuthenticateByName`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Emby-Authorization': 'MediaBrowser Client="Walkman Web", Device="Xperia", DeviceId="X1", Version="1.0.0"'
          },
          body: JSON.stringify({ Username: user, Pw: pass })
        });
        if (!authRes.ok) throw new Error('Credenciales incorrectas');

        const authData = await authRes.json();
        embyConfig.host = host;
        embyConfig.token = authData.AccessToken;
        embyConfig.userId = authData.User.Id;
        embyConfig.user = user;
        embyConfig.serverType = type;
        saveServerSettings();

        const viewsRes = await fetch(`${host}/Users/${embyConfig.userId}/Views?api_key=${embyConfig.token}`);
        const viewsData = await viewsRes.json();
        populateLibrarySelect(viewsData.Items);
      } catch (err) {
        showToast('Error de conexión: ' + err.message, 'error');
      }
    }

    function decodePlexEntities(str) {
      if (typeof str !== 'string' || str.indexOf('&') === -1) return str;
      return str.replace(/&#(\d+);/g, (m, d) => String.fromCharCode(d))
                .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    }

    function parseAttrs(str) {
      const obj = {};
      const re = /([\w:.-]+)="([^"]*)"/g;
      let m;
      while ((m = re.exec(str)) !== null) {
        const k = m[1];
        let v = m[2];
        if (v === 'false') v = false; else if (v === 'true') v = true;
        else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
        else v = decodePlexEntities(v);
        obj[k] = v;
      }
      return obj;
    }

    function parsePlexObject(tag, xml) {
      const out = [];
      const re = new RegExp('<' + tag + '\\b[^>]*?/?>', 'g');
      let m;
      while ((m = re.exec(xml)) !== null) {
        out.push(parseAttrs(m[0]));
      }
      return out;
    }

    function parsePlexMetadata(xml) {
      const out = [];
      const tagRe = /<(Metadata|Track|Album|Artist|Playlist|Video|Photo|Folder|Movie|Episode|Show)\b[^>]*>([\s\S]*?)<\/\1>|<\1\b[^>]*\/>/g;
      let m;
      while ((m = tagRe.exec(xml)) !== null) {
        const inner = m[2] || '';
        const tagStr = m[0];
        const item = parseAttrs(tagStr);
        const mediaMatches = new RegExp('<Media\\b[^>]*>([\\s\\S]*?)</Media>|<Media\\b[^>]*/>', 'g');
        let mm;
        const media = [];
        while ((mm = mediaMatches.exec(inner)) !== null) {
          // Conservar atributos del propio <Media> (audioSampleRate, audioCodec,
          // audioChannels, bitrate, container...) y de sus <Part>/<Stream>:
          // sin ellos no se puede detectar la calidad/Hi-Res en Plex, y el
          // servidor a veces solo reporta samplingRate/codec en los <Stream>.
          const mediaTag = mm[0].match(/<Media\b[^>]*?>/);
          const attrs = mediaTag ? parseAttrs(mediaTag[0]) : {};
          const parts = parsePlexObject('Part', mm[1] || '');
          const streams = parsePlexObject('Stream', mm[1] || '');
          media.push(Object.assign({ Part: parts, Stream: streams }, attrs));
        }
        if (media.length) item.Media = media;
        out.push(item);
      }
      return out;
    }

    function parsePlexResponse(text) {
      const obj = { MediaContainer: {} };
      const mcMatch = text.match(/<MediaContainer\b([^>]*)>/);
      if (mcMatch) Object.assign(obj.MediaContainer, parseAttrs(mcMatch[1]));
      obj.MediaContainer.Metadata = parsePlexMetadata(text);
      obj.MediaContainer.Directory = parsePlexObject('Directory', text);
      return obj;
    }

    async function fetchPlexJson(url) {
      const res = await fetch(url);
      const text = await res.text();
      if (!text || !text.trim()) return { MediaContainer: { Metadata: [], Directory: [] } };
      try {
        return JSON.parse(text);
      } catch {
        return parsePlexResponse(text);
      }
    }

    async function connectPlex() {
      const rawHost = document.getElementById('plex-host').value;
      const host = sanitizeServerUrl(rawHost);
      if (!host) { showToast('URL del servidor Plex inválida. Usa http:// o https://', 'error'); return; }
      // Plex se sirve normalmente por HTTP en la red local (sin TLS), así que no
      // se aplica la puerta de "Permitir conexión por HTTP" como en Emby/Jellyfin.
      const statusEl = document.getElementById('plex-status');
      statusEl.style.display = 'block';

      try {
        // Paso 1: Registrar dispositivo y obtener PIN
        const pinRes = await fetch('https://plex.tv/api/v2/pins?X-Plex-Client-Identifier=walkman-web', {
          method: 'POST'
        });
        if (!pinRes.ok) throw new Error(`Error al conectar con Plex: ${pinRes.statusText}`);
        const pinText = await pinRes.text();
        let pinData;
        const pinIdMatch = pinText.match(/<pin[^>]*\bid="([^"]*)"/);
        const pinCodeMatch = pinText.match(/<pin[^>]*\bcode="([^"]*)"/);
        if (pinIdMatch || pinCodeMatch) {
          pinData = { id: pinIdMatch ? pinIdMatch[1] : '', code: pinCodeMatch ? pinCodeMatch[1] : '' };
        } else {
          try {
            pinData = JSON.parse(pinText);
          } catch {
            throw new Error('Respuesta inesperada del servidor Plex. Raw: ' + pinText.substring(0, 200));
          }
        }
        const pinId = pinData.id;
        const authUrl = `https://app.plex.tv/auth#?forward=https%3A%2F%2Fwww.plex.tv%2F%3Fcode%3D${pinData.code}&code=${pinData.code}`;

        statusEl.innerHTML = `
          <div class="plex-spinner"></div>
          <div>Código de autorización Plex:</div>
          <div id="plex-code" style="font-size:1.2em;font-weight:bold;margin:10px 0;min-height:24px;cursor:pointer;user-select:all;">${pinData.code}</div>
          <div style="margin-top:4px;font-size:0.8em;color:#666;">Clic para copiar</div>
          <div style="margin-top:8px;">Autoriza en: <a href="https://www.plex.tv/link" target="_blank" rel="noopener">www.plex.tv/link</a></div>
          <div id="copy-message" style="margin-top:4px;display:none;color:#4CAF50;font-size:0.9em;">¡Copiado!</div>
          <div style="margin-top:8px;color:#888;">Esperando autorización...</div>
        `;

        document.getElementById('plex-code').addEventListener('click', function() {
          navigator.clipboard.writeText(pinData.code).then(function() {
            const copyMsg = document.getElementById('copy-message');
            copyMsg.style.display = 'block';
            setTimeout(function() { copyMsg.style.display = 'none'; }, 2000);
          });
        });

        // Paso 2: Polling del PIN (Plex espera sondeo periódico; no usar backoff aquí)
        let plexToken = null;
        for (let i = 0; i < 36; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const pollRes = await fetchWithRetry(`https://plex.tv/api/v2/pins/${pinId}?X-Plex-Client-Identifier=walkman-web`, {}, 1, 300);
          const pollText = await pollRes.text();
          let pollData;
          const tokenMatch = pollText.match(/<pin[^>]*\bauthToken="([^"]*)"/);
          if (tokenMatch) {
            pollData = { authToken: tokenMatch[1] };
          } else {
            try { pollData = JSON.parse(pollText); } catch { pollData = {}; }
          }
          if (pollData.authToken) {
            plexToken = pollData.authToken;
            break;
          }
        }

        if (!plexToken) throw new Error('Tiempo de espera agotado. Inténtalo de nuevo.');

        // Paso 3: Obtener bibliotecas del servidor.
        // Si la URL es HTTP y la app va por HTTPS, el navegador bloquea esa
        // petición (contenido mixto net::ERR_FAILED). Reintentamos por el
        // puerto seguro de Plex (32443) por si el servidor lo tiene activo.
        let sectData;
        try {
          sectData = await fetchPlexJson(`${host}/library/sections?X-Plex-Token=${plexToken}`);
        } catch (e) {
          if (host.indexOf('http://') === 0 && location.protocol === 'https:') {
            const hostname = host.replace(/^[a-z]+:\/\//i, '').split(':')[0];
            const httpsFallback = 'https://' + hostname + ':32443';
            sectData = await fetchPlexJson(`${httpsFallback}/library/sections?X-Plex-Token=${plexToken}`);
          } else {
            throw e;
          }
        }
        const musicSections = (sectData.MediaContainer.Directory || []).filter(s => s.type === 'artist');

        if (musicSections.length === 0) throw new Error('No se encontraron bibliotecas de música en Plex.');

        embyConfig.host = host;
        embyConfig.token = plexToken;
        embyConfig.userId = '';
        embyConfig.user = 'Plex';
        embyConfig.serverType = 'plex';
        embyConfig.libraryId = musicSections[0].key;
        saveServerSettings();

        populateLibrarySelect(musicSections.map(s => ({ Id: s.key, Name: s.title })));
        document.getElementById('emby-modal').style.display = 'none';
        await updateCategoryCounts();
      } catch (err) {
        const mixed = host.indexOf('http://') === 0 && location.protocol === 'https:'
          && /Failed to fetch|Mixed Content|net::ERR/i.test(String(err && err.message || ''));
        statusEl.innerHTML = `<div style="color:#ff5555;">Error: ${err.message}</div>` +
          (mixed ? `<div style="color:#eab308;font-size:12px;margin-top:8px;">El navegador bloquea Plex por HTTP desde esta página HTTPS (contenido mixto). Para permitirlo: pulsa el candado de la barra de direcciones → Configuración del sitio → "Contenido no seguro" → Permitir, y vuelve a conectar. Alternativa: expón tu Plex por HTTPS (puerto 32443) y usa esa URL.</div>` : '');
      }
    }

    function populateLibrarySelect(items) {
      availableLibraries = items;
      saveLS('walkman_libraries', JSON.stringify(items));
      const select = document.getElementById('emby-libraries');
      select.innerHTML = '<option value="">-- Seleccionar --</option>';
      items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.Id;
        opt.textContent = item.Name;
        if (embyConfig.libraryId && String(embyConfig.libraryId) === String(item.Id)) opt.selected = true;
        select.appendChild(opt);
      });
      document.getElementById('library-selector').style.display = 'block';
    }

    async function fetchItems(type, parentId, parentKind, artistName) {
      const st = embyConfig.serverType;
      if (st === 'local') {
        if (type === 'Audio') {
          let result = [...localTracks].filter(t => t.Type !== 'Playlist');
          if (artistName) {
            const a = String(artistName).toLowerCase();
            result = result.filter(t =>
              (t.AlbumArtist || '').toLowerCase() === a ||
              (t.Artists || []).some(ar => String(ar).toLowerCase() === a)
            );
          } else if (parentId && parentId.startsWith('local_album_')) {
            const albumName = parentId.replace('local_album_', '');
            result = result.filter(t => (t.Album || 'Desconocido') === albumName);
          } else if (parentId && parentId.startsWith('local_artist_')) {
            const artist = parentId.replace('local_artist_', '');
            result = result.filter(t => (t.Artists || ['Desconocido']).includes(artist));
          } else if (parentId) {
            // Sub-listado de una playlist local, respetando el orden original
            const pl = localTracks.find(t => t.Type === 'Playlist' && t.Id === parentId);
            if (pl && Array.isArray(pl.PlaylistIds)) {
              const byId = new Map(result.map(t => [t.Id, t]));
              result = pl.PlaylistIds.map(id => byId.get(id)).filter(Boolean);
            }
          }
          return { Items: result, TotalRecordCount: result.length };
        }
        if (type === 'Playlist') {
          const pls = localTracks.filter(t => t.Type === 'Playlist');
          return { Items: pls, TotalRecordCount: pls.length };
        }
        if (type === 'Album') {
          const map = new Map();
          localTracks.filter(t => t.Type !== 'Playlist').forEach(t => {
            const key = t.Album || 'Desconocido';
            if (!map.has(key)) {
              map.set(key, {
                Id: 'local_album_' + key,
                Name: key,
                Type: 'MusicAlbum',
                AlbumArtist: t.AlbumArtist || '',
                Artists: [],
                Count: 0,
                coverUrl: t.coverUrl || '',
                IsLocal: true
              });
            } else if (!map.get(key).coverUrl && t.coverUrl) {
              map.get(key).coverUrl = t.coverUrl;
            }
            map.get(key).Count++;
          });
          return { Items: [...map.values()], TotalRecordCount: map.size };
        }
        if (type === 'Artist') {
          const map = new Map();
          localTracks.filter(t => t.Type !== 'Playlist').forEach(t => {
            (t.Artists || ['Desconocido']).forEach(a => {
              if (!map.has(a)) map.set(a, { Id: 'local_artist_' + a, Name: a, Type: 'MusicArtist', AlbumArtist: a, Artists: [], Count: 0, IsLocal: true });
              map.get(a).Count++;
            });
          });
          return { Items: [...map.values()], TotalRecordCount: map.size };
        }
        return { Items: [], TotalRecordCount: 0 };
      }
      if (st === 'plex') return fetchPlexItems(type, parentId, parentKind, artistName);
      return fetchEmbyItems(type, parentId, parentKind, artistName);
    }

    function plexItemId(item) {
      if (item.ratingKey !== undefined && item.ratingKey !== null && item.ratingKey !== '') return item.ratingKey;
      if (item.key) {
        const m = String(item.key).match(/(\d+)/);
        if (m) return m[1];
      }
      return '';
    }

    async function fetchPlexItems(type, sectionKey, parentKind, artistName) {
      const sk = sectionKey || embyConfig.libraryId;
      let items = [];
      walkmanDebug('[PlexDebug] fetchPlexItems', { type, sectionKey, parentKind, artistName, libraryId: embyConfig.libraryId });

      if (type === 10 && artistName) {
        // Buscar todas las canciones de un artista por nombre mediante /search
        const data = await fetchPlexJson(`${embyConfig.host}/search?query=${encodeURIComponent(artistName)}&X-Plex-Token=${embyConfig.token}`);
        const meta = data.MediaContainer.Metadata || [];
        const a = String(artistName).toLowerCase();
        items = meta.filter(i => i.type === 10 &&
          (String(i.grandparentTitle || '').toLowerCase() === a ||
           String(i.originalTitle || '').toLowerCase() === a));
        walkmanDebug('[PlexDebug] artist search tracks', { artistName, matched: items.length });
      } else if (type === 'Playlist' || type === 15) {
        // Listar todas las playlists de audio
        const data = await fetchPlexJson(`${embyConfig.host}/playlists?X-Plex-Token=${embyConfig.token}`);
        const rawPlaylists = data.MediaContainer.Metadata || [];
        items = rawPlaylists.filter(i => i.playlistType === 'audio');
        walkmanDebug('[PlexDebug] playlists listing', { meta: rawPlaylists.length, audio: items.length, sample: rawPlaylists.slice(0, 2).map(p => ({ title: p.title, ratingKey: p.ratingKey, key: p.key, composite: p.composite, type: p.type, leafCount: p.leafCount })) });
      } else if (type === 10 && sectionKey) {
        // Sub-items de un álbum, artista o playlist específica
        if (parentKind === 'Playlist') {
          // Plex: /playlists/{id}/items es el endpoint correcto para el contenido;
          // /playlists/{id}/contents puede devolver MediaContainer vacío.
          let data = await fetchPlexJson(`${embyConfig.host}/playlists/${sectionKey}/items?X-Plex-Token=${embyConfig.token}`);
          let meta = data.MediaContainer.Metadata || [];
          walkmanDebug('[PlexDebug] playlist items', { sectionKey, meta: meta.length, total: data.MediaContainer.totalSize, size: data.MediaContainer.size, first: meta[0] ? { type: meta[0].type, title: meta[0].title, ratingKey: meta[0].ratingKey, playlistItemID: meta[0].playlistItemID } : null });
          if (!meta.length) {
            data = await fetchPlexJson(`${embyConfig.host}/playlists/${sectionKey}/contents?X-Plex-Token=${embyConfig.token}`);
            meta = data.MediaContainer.Metadata || [];
            walkmanDebug('[PlexDebug] playlist contents fallback', { sectionKey, meta: meta.length });
          }
          items = meta;
        } else if (parentKind === 'MusicArtist') {
          // Vía robusta para artistas: los filtros artist.id/artistID de /all
          // pueden ser ignorados (devolviendo TODAS las canciones), así que nos
          // aseguramos con grandparentRatingKey (id del artista en cada canción).
          let artistArr = [];
          let artistData = await fetchPlexJson(`${embyConfig.host}/library/sections/${embyConfig.libraryId}/all?type=10&artist.id=${sectionKey}&X-Plex-Token=${embyConfig.token}`);
          artistArr = (artistData.MediaContainer.Metadata || []).filter(i => String(i.grandparentRatingKey) === String(sectionKey));
          walkmanDebug('[PlexDebug] artist.id attempt', { sectionKey, got: artistData.MediaContainer.Metadata ? artistData.MediaContainer.Metadata.length : 0, matched: artistArr.length });
          if (!artistArr.length) {
            artistData = await fetchPlexJson(`${embyConfig.host}/library/sections/${embyConfig.libraryId}/all?type=10&artistID=${sectionKey}&X-Plex-Token=${embyConfig.token}`);
            artistArr = (artistData.MediaContainer.Metadata || []).filter(i => String(i.grandparentRatingKey) === String(sectionKey));
            walkmanDebug('[PlexDebug] artistID attempt', { sectionKey, got: artistData.MediaContainer.Metadata ? artistData.MediaContainer.Metadata.length : 0, matched: artistArr.length });
          }
          if (!artistArr.length) {
            // Fallback: álbumes del artista desde el listado de sección (vía ya probada) y sus canciones
            const secData = await fetchPlexJson(`${embyConfig.host}/library/sections/${embyConfig.libraryId}/all?type=9&X-Plex-Token=${embyConfig.token}`);
            const secAlbums = (secData.MediaContainer.Directory || []).filter(a => String(a.parentRatingKey) === String(sectionKey));
            walkmanDebug('[PlexDebug] section albums fallback', { sectionKey, albums: secAlbums.length });
            for (const album of secAlbums) {
              const albData = await fetchPlexJson(`${embyConfig.host}/library/metadata/${plexItemId(album)}/children?type=10&X-Plex-Token=${embyConfig.token}`);
              const albArr = albData.MediaContainer.Metadata || [];
              walkmanDebug('[PlexDebug] album tracks', { album: album.title, id: plexItemId(album), tracks: albArr.length });
              artistArr = artistArr.concat(albArr);
            }
          }
          items = artistArr;
        } else {
          const data = await fetchPlexJson(`${embyConfig.host}/library/metadata/${sectionKey}/children?type=10&X-Plex-Token=${embyConfig.token}`);
          items = data.MediaContainer.Metadata || [];
        }
      } else {
        // Listado principal de una sección
        const data = await fetchPlexJson(`${embyConfig.host}/library/sections/${sk}/all?type=${type}&X-Plex-Token=${embyConfig.token}`);
        if (type === 9 || type === 8) {
          items = (data.MediaContainer.Directory || []).map(i => ({ ...i, type }));
        } else {
          items = data.MediaContainer.Metadata || [];
        }
      }

      walkmanDebug('[PlexDebug] fetchPlexItems result', { type, parentKind, count: items.length });

      return { Items: items.map(normalizePlexItem), TotalRecordCount: items.length };
    }

    function normalizePlexItem(item) {
      const st = embyConfig.serverType;
      const typeMap = { 10: 'Audio', 9: 'MusicAlbum', 8: 'MusicArtist', 15: 'Playlist' };
      // Extraer info de calidad de audio desde Media (Plex). Como algunos
      // servidores solo exponen el audio en los <Stream> del <Part>, usamos
      // Media como fuente principal y los <Stream> de respaldo (Plex reporta
      // samplingRate/bitrate en kbps en Stream, al igual que en Media).
let audioQuality = null;
      const media = item.Media && item.Media[0];
      if (media) {
        // Plex JSON anida los Streams bajo Part[0].Stream; el XML los pone
        // directamente bajo <Media>. Buscamos en ambos sitios.
        const stream = (media.Stream || []).find(s => s && String(s.streamType) === '2')
          || (media.Part || []).reduce((a, p) => a.concat(p.Stream || []), []).find(s => s && String(s.streamType) === '2')
          || (media.Stream || [])[0]
          || (media.Part || []).reduce((a, p) => a.concat(p.Stream || []), [])[0]
          || null;
        const part = media.Part && media.Part[0] || null;
        audioQuality = {
          bitrate: media.bitrate != null ? Number(media.bitrate) * 1000
            : (stream && stream.bitrate != null ? Number(stream.bitrate) * 1000 : null),
          audioCodec: media.audioCodec || (part && part.audioCodec) || (stream && stream.codec) || null,
          container: media.container || (part && part.container) || null,
          channels: media.audioChannels || (stream && stream.channels) || null,
          sampleRate: media.audioSampleRate != null ? Number(media.audioSampleRate)
            : (stream && stream.samplingRate != null ? Number(stream.samplingRate) : null)
        };
        walkmanDebug('[PlexDebug] audioQuality', audioQuality);
      }
      return {
        Id: plexItemId(item),
        Name: decodePlexEntities(item.title || item.grandparentTitle || ''),
        Type: typeMap[item.type] || 'Audio',
        Artists: item.type === 10 ? [decodePlexEntities(item.grandparentTitle || '')].filter(Boolean) : [],
        AlbumArtist: decodePlexEntities(item.grandparentTitle || item.parentTitle || ''),
        Album: decodePlexEntities(item.parentTitle || ''),
        Duration: item.duration ? Math.round(item.duration / 1000) : 0,
        Path: item.Media?.[0]?.Part?.[0]?.file || '',
        ImageTags: item.thumb ? { Primary: item.thumb } : {},
        AlbumId: item.parentRatingKey || '',
        AlbumPrimaryImageTag: '',
        // Plex specifics
        _plexKey: item.ratingKey,
        _plexThumb: item.thumb || item.composite || '',
        _plexParentThumb: item.parentThumb || '',
        _plexGrandparentThumb: item.grandparentThumb || '',
        _plexPartId: item.Media?.[0]?.Part?.[0]?.id || '',
        _plexSectionKey: item.librarySectionID || '',
        _audioQuality: audioQuality
      };
    }

    function getImageUrl(item) {
      if (embyConfig.serverType === 'local' || item.IsLocal) return item.coverUrl || defaultPlaceholder;
      if (embyConfig.serverType === 'plex') return getPlexImageUrl(item);
      return getEmbyImageUrl(item);
    }

    function getPlexImageUrl(item) {
      if (!item) return defaultPlaceholder;
      const host = embyConfig.host;
      const token = embyConfig.token;

      if (item.Type === 'MusicArtist') {
        const thumb = item._plexThumb || item._plexGrandparentThumb;
        if (thumb) return `${host}${thumb}?X-Plex-Token=${token}`;
        return defaultPlaceholder;
      }

      if (item.Type === 'Audio') {
        const trackThumb = item._plexThumb;
        if (trackThumb) return `${host}${trackThumb}?X-Plex-Token=${token}`;
        const albumThumb = item._plexParentThumb || item._plexGrandparentThumb;
        if (albumThumb) return `${host}${albumThumb}?X-Plex-Token=${token}`;
        return defaultPlaceholder;
      }

      const thumb = item._plexThumb || item._plexGrandparentThumb;
      if (thumb) return `${host}${thumb}?X-Plex-Token=${token}`;
      return defaultPlaceholder;
    }


    function changeLibrary() {
      closeSettingsMenu();

      // Si hay bibliotecas guardadas del servidor conectado, mostrar el desplegable directo
      if (availableLibraries.length > 0) {
        showLibraryPicker();
      } else {
        // Intentar recargarlas desde el servidor conectado
        loadAvailableLibraries().then(ok => {
          if (ok) {
            showLibraryPicker();
          } else {
            // Sin bibliotecas recuperables: ir al modal de conexión
            showServerModal();
          }
        });
      }
    }

    async function loadAvailableLibraries() {
      const st = embyConfig.serverType;
      try {
        if (st === 'emby' || st === 'jellyfin') {
          if (!embyConfig.host || !embyConfig.token || !embyConfig.userId) return false;
          const res = await fetch(`${embyConfig.host}/Users/${embyConfig.userId}/Views?api_key=${embyConfig.token}`);
          const data = await res.json();
          if (data.Items && data.Items.length) {
            availableLibraries = data.Items;
            saveLS('walkman_libraries', JSON.stringify(data.Items));
            return true;
          }
        } else if (st === 'plex') {
          if (!embyConfig.host || !embyConfig.token) return false;
          const data = await fetchPlexJson(`${embyConfig.host}/library/sections?X-Plex-Token=${embyConfig.token}`);
          const sections = (data.MediaContainer.Directory || []).filter(s => s.type === 'artist')
            .map(s => ({ Id: s.key, Name: s.title }));
          if (sections.length) {
            availableLibraries = sections;
            saveLS('walkman_libraries', JSON.stringify(sections));
            return true;
          }
        }
      } catch (e) {}
      return false;
    }

    function showLibraryPicker() {
      const select = document.getElementById('lib-picker-select');
      select.innerHTML = '';
      availableLibraries.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.Id;
        opt.textContent = item.Name;
        if (embyConfig.libraryId && String(embyConfig.libraryId) === String(item.Id)) opt.selected = true;
        select.appendChild(opt);
      });
      document.getElementById('library-overlay').classList.add('open');
      document.getElementById('library-picker').classList.add('open');
    }

    function closeLibraryPicker() {
      document.getElementById('library-overlay').classList.remove('open');
      document.getElementById('library-picker').classList.remove('open');
    }

    async function applyLibraryChange(libId) {
      if (!libId) return;
      embyConfig.libraryId = libId;
      saveServerSettings();
      closeLibraryPicker();
      await updateCategoryCounts();
      showToast(t('libraryChanged'));
    }

    function clearCache() {
      // 1) Cachés del service worker (protegido: falla en APK con origin null)
      try {
        if (window.caches) {
          caches.keys().then(keys => {
            return Promise.all(keys.map(k => caches.delete(k)));
          }).catch(() => {});
        }
      } catch (e) {}

      // 2) Object URLs locales de canciones
      try {
        (localTracks || []).forEach(t => {
          if (t.objUrl) { try { URL.revokeObjectURL(t.objUrl); } catch (e) {} }
          if (t.coverUrl && t.coverUrl.startsWith('blob:')) { try { URL.revokeObjectURL(t.coverUrl); } catch (e) {} }
        });
        localTracks = [];
      } catch (e) {}

      // 3) Borrar localStorage COMPLETO (incluida la config de servidor)
      try { localStorage.clear(); } catch (e) {}

      // 4) Borrar sessionStorage
      try { if (window.sessionStorage) sessionStorage.clear(); } catch (e) {}

      showToast('Caché borrada. La app se recargará.', 'success');

      // 5) Recargar con cache-busting para no servir copia antigua
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('v', Date.now());
        window.location.href = url.toString();
      } catch (e) {
        try { window.location.reload(); } catch (e2) {}
      }
    }

    function showServerModal() {
      closeLyricsIfOpen();
      document.getElementById('emby-modal').style.display = 'flex';
      // Restaurar tab activa según config guardada
      switchServerType(embyConfig.serverType || 'emby');
      syncHttpWarning();

      // Si ya hay bibliotecas guardadas del servidor conectado, mostrar el selector
      // para poder cambiar de biblioteca sin reconectar
      if (availableLibraries.length > 0) {
        populateLibrarySelect(availableLibraries);
      }
    }

    function closeServerModal() {
      document.getElementById('emby-modal').style.display = 'none';
    }

    function getEmbyImageUrl(item) {
      if (!item) return defaultPlaceholder;
      if (embyConfig.serverType === 'local' || item.IsLocal) {
        return item.coverUrl || defaultPlaceholder;
      }
      if (embyConfig.serverType === 'plex') return getPlexImageUrl(item);

      const host = embyConfig.host;
      const token = embyConfig.token;

      // Canciones: si no tienen imagen propia, usar la del álbum que las contiene
      if (item.Type === 'Audio' && !item.ImageTags?.Primary && !item.PrimaryImageTag && item.AlbumId) {
        return `${host}/Items/${item.AlbumId}/Images/Primary?api_key=${token}`;
      }

      // Álbumes de música (Emby/Jellyfin): el Id listado a veces reporta imagen
      // pero 404 al pedirla; solo es fiable el AlbumId real de sus canciones.
      if (item.Type === 'MusicAlbum') {
        if (item.AlbumId && item.AlbumId !== item.Id) {
          return `${host}/Items/${item.AlbumId}/Images/Primary?api_key=${token}`;
        }
      }

      return `${host}/Items/${item.Id}/Images/Primary?api_key=${token}`;
    }

    // BÚSQUEDA EN EMBY EN TIEMPO REAL

    function saveServerSettings() {
      saveLS('walkman_server_config', JSON.stringify(embyConfig));
    }

    async function selectLibrary() {
      const libId = document.getElementById('emby-libraries').value;
      if (!libId) return;

      embyConfig.libraryId = libId;
      saveServerSettings();
      
      document.getElementById('emby-modal').style.display = 'none';
      await updateCategoryCounts();
    }

    // Aplica como valores por defecto los de WALKMAN_CONFIG (DEFAULT_LANGUAGE,
    // DEFAULT_SERVER_TYPE, DEFAULT_SERVER_URL) solo si no hay config guardada.
    function applyDefaultServerConfig() {
      if (loadLS('walkman_server_config')) return;
      const cfg = window.WALKMAN_CONFIG;
      if (!cfg) return;
      const st = normalizeServerType(cfg.serverType);
      if (st) embyConfig.serverType = st;
      if (cfg.serverUrl) {
        embyConfig.host = cfg.serverUrl;
        const hostInput = document.getElementById('emby-host');
        if (hostInput) hostInput.value = cfg.serverUrl;
        const plexInput = document.getElementById('plex-host');
        if (plexInput) plexInput.value = cfg.serverUrl;
        onServerUrlInput(cfg.serverUrl);
      }
    }

    async function restoreServerConfig() {
      const saved = loadLS('walkman_server_config');
      if (!saved) return false;

      try {
        const savedLibs = loadLS('walkman_libraries');
        if (savedLibs) availableLibraries = JSON.parse(savedLibs);

        const parsed = JSON.parse(saved);
        if (parsed.serverType === 'local') {
          // La biblioteca local necesita volver a seleccionar la carpeta
          embyConfig = { ...embyConfig, ...parsed, host: '', token: '' };
          switchServerType('local');
          return false;
        }
        if (parsed.host && parsed.token && parsed.libraryId) {
          embyConfig = { ...embyConfig, ...parsed };

          document.getElementById('emby-host').value = embyConfig.host || '';
          document.getElementById('emby-user').value = embyConfig.user || '';
          document.getElementById('plex-host').value = embyConfig.host || '';
          onServerUrlInput(embyConfig.host || '');

          await updateCategoryCounts();
          return true;
        }
      } catch (e) {}
      
      return false;
    }

    async function updateCategoryCounts() {
      const st = embyConfig.serverType;
      const types = SERVER_TYPES[st];

      const songs = await fetchItems(types.Audio);
      document.getElementById('count-songs').textContent = songs.TotalRecordCount || songs.Items.length;

      const albums = await fetchItems(types.Album);
      document.getElementById('count-albums').textContent = albums.TotalRecordCount || albums.Items.length;
      if (st === 'emby' || st === 'jellyfin') {
        await resolveAlbumCoverIds(albums.Items);
      }
      if (isFeaturedEnabled()) {
        renderFeaturedAlbums(albums.Items);
      } else {
        applyFeaturedVisibility();
      }

      const artists = await fetchItems(types.Artist);
      document.getElementById('count-artists').textContent = artists.TotalRecordCount || artists.Items.length;

      const playlists = await fetchItems(types.Playlist);
      document.getElementById('count-playlists').textContent = playlists.TotalRecordCount || playlists.Items.length;
    }


    async function fetchEmbyItems(type, parentId = embyConfig.libraryId, parentKind, artistName) {
      const fields = "PrimaryImageAspectRatio,BasicSyncInfo,ImageTags,PrimaryImageTag,AlbumPrimaryImageTag,AlbumId,MediaSources,MediaStreams";
      let url;
      if (type === 'Audio' && artistName) {
        // Buscar todas las canciones de un artista por nombre
        url = `${embyConfig.host}/Users/${embyConfig.userId}/Items?SearchTerm=${encodeURIComponent(artistName)}&IncludeItemTypes=Audio&Recursive=true&Fields=${fields}&Limit=100&api_key=${embyConfig.token}`;
      } else {
        url = `${embyConfig.host}/Users/${embyConfig.userId}/Items?ParentId=${parentId}&IncludeItemTypes=${type}&Recursive=true&Fields=${fields}&api_key=${embyConfig.token}`;
      }
      const res = await fetch(url);
      return await res.json();
    }

