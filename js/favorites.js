/* Favoritos: marcado de canciones y álbumes, sincronización con el servidor (Emby/Jellyfin/Plex) y carga de las listas. */

    // ---- Favoritos (canciones y álbumes) ----
    // Todo se consulta al servidor: Emby/Jellyfin tienen favoritos nativos y
    // Plex no, así que allí se usa la valoración del usuario (el "pulgar
    // arriba" de Plex Web), que es lo más parecido a un favorito por usuario.
    // Solo la biblioteca local guarda los suyos en localStorage, con una copia
    // ligera del item para poder mostrarlos.
    const FAVORITES_LS_KEY = 'walkman_favorites';
    // Puntuación a partir de la cual un item de Plex cuenta como favorito
    const PLEX_FAVORITE_RATING = 8;
    let favoritesStore = null;
    let favoritesSyncDone = false;

    function favoriteBucket(kind) {
      return kind === 'Albums' ? 'albums' : 'songs';
    }

    // Los Id de la biblioteca local se regeneran en cada escaneo, así que la
    // única clave estable es la ruta del archivo.
    function favoriteKey(item) {
      if (!item) return '';
      if (item.IsLocal || embyConfig.serverType === 'local') return 'p:' + (item.Path || item.Id || '');
      return 'i:' + (item.Id || '');
    }

    function favoriteKind(item) {
      if (!item) return '';
      if (item.Type === 'Audio') return 'Songs';
      if (item.Type === 'MusicAlbum') return 'Albums';
      return '';
    }

    // Copia sin datos no serializables (blob: URL de portada, File del escaneo)
    function favoriteSnapshot(item) {
      const snap = {};
      ['Id', 'Name', 'Type', 'Album', 'AlbumArtist', 'Artists', 'Duration', 'Path',
       'ImageTags', 'AlbumId', 'AlbumPrimaryImageTag', 'Count',
       '_plexKey', '_plexThumb', '_plexParentThumb', '_plexGrandparentThumb',
       '_plexSectionKey', '_audioQuality', 'userRating'].forEach(k => {
        if (item[k] !== undefined) snap[k] = item[k];
      });
      snap.IsLocal = !!item.IsLocal;
      if (!item.IsLocal && item.coverUrl && String(item.coverUrl).indexOf('blob:') !== 0) {
        snap.coverUrl = item.coverUrl;
      }
      return snap;
    }

    function loadFavoritesStore() {
      if (favoritesStore) return favoritesStore;
      let parsed = null;
      try {
        const raw = loadLS(FAVORITES_LS_KEY);
        if (raw) parsed = JSON.parse(raw);
      } catch (e) { parsed = null; }
      favoritesStore = (parsed && typeof parsed === 'object' && parsed.songs && parsed.albums)
        ? parsed
        : { songs: {}, albums: {} };
      if (!favoritesStore.songs || typeof favoritesStore.songs !== 'object') favoritesStore.songs = {};
      if (!favoritesStore.albums || typeof favoritesStore.albums !== 'object') favoritesStore.albums = {};
      return favoritesStore;
    }

    function saveFavoritesStore() {
      loadFavoritesStore();
      saveLS(FAVORITES_LS_KEY, favoritesStore);
    }

    function isFavorite(item) {
      const kind = favoriteKind(item);
      if (!kind) return false;
      // Emby/Jellyfin envían IsFavorite ya resuelto en cada item
      if (item.IsFavorite !== undefined && item.IsFavorite !== null) return !!item.IsFavorite;
      return !!loadFavoritesStore()[favoriteBucket(kind)][favoriteKey(item)];
    }

    async function setFavorite(item, on) {
      const kind = favoriteKind(item);
      if (!kind) return false;
      const st = embyConfig.serverType;
      try {
        if (st === 'emby' || st === 'jellyfin') {
          if (item.Id && !await embyFavoriteUrl(item, on ? 'POST' : 'DELETE')) throw new Error('server');
        } else if (st === 'plex') {
          if (!await plexSetFavorite(item, on)) throw new Error('server');
          item.userRating = on ? PLEX_FAVORITE_RATING : 0;
        }
      } catch (e) {
        showToast(t('favError'), 'error');
        return false;
      }
      const bucket = loadFavoritesStore()[favoriteBucket(kind)];
      const key = favoriteKey(item);
      if (on) bucket[key] = favoriteSnapshot(item);
      else delete bucket[key];
      item.IsFavorite = on;
      saveFavoritesStore();
      updateFavoritesCount();
      return true;
    }

    async function toggleFavorite(item) {
      const kind = favoriteKind(item);
      if (!kind) return;
      const on = !isFavorite(item);
      if (!await setFavorite(item, on)) return;
      showToast(on ? t('addedToFavorites') : t('removedFromFavorites'));
      // Si estamos viendo la lista de favoritos de ese tipo, la repintamos
      if (favoritesViewKind === kind) loadFavorites(kind);
    }

    // --- Emby / Jellyfin ---

    const FAVORITE_FIELDS = 'PrimaryImageAspectRatio,ImageTags,PrimaryImageTag,AlbumPrimaryImageTag,AlbumId,MediaSources,MediaStreams';

    // Jellyfin 10.11 eliminó la ruta con userId y la mueve a /UserFavoriteItems,
    // donde el token ya identifica al usuario. Intentamos la ruta antigua y,
    // si el servidor responde 404/405, usamos la nueva.
    async function embyFavoriteUrl(item, method) {
      const qs = '?api_key=' + embyConfig.token;
      let res = await fetch(`${embyConfig.host}/Users/${embyConfig.userId}/FavoriteItems/${encodeURIComponent(item.Id)}${qs}`, { method });
      if (!res.ok && (res.status === 404 || res.status === 405)) {
        res = await fetch(`${embyConfig.host}/UserFavoriteItems/${encodeURIComponent(item.Id)}${qs}`, { method });
      }
      return res.ok;
    }

    async function embyFetchFavorites() {
      const qs = `Recursive=true&IncludeItemTypes=Audio,MusicAlbum&Fields=${FAVORITE_FIELDS}&api_key=${embyConfig.token}`;
      // 1) Endpoint dedicated (Emby y Jellyfin hasta 10.10)
      let res = await fetch(`${embyConfig.host}/Users/${embyConfig.userId}/FavoriteItems?${qs}`);
      // 2) Jellyfin 10.11+ lo mueve a una ruta plana sin userId
      if (!res.ok) res = await fetch(`${embyConfig.host}/UserFavoriteItems?${qs}`);
      // 3) Cualquier otra versión: el mismo filtro de /Items, que sí existe
      //    en todas las versiones de Emby y Jellyfin
      if (!res.ok) {
        res = await fetch(`${embyConfig.host}/Users/${embyConfig.userId}/Items?Filters=IsFavorite&${qs}`);
      }
      if (!res.ok) return null;
      const data = await res.json();
      return (data && data.Items) ? data.Items : [];
    }

    // --- Plex ---

    // Plex no tiene favoritos: se usa la valoración del usuario. El filtro
    // "userRating>>" es estrictamente mayor que, así que pedimos >= 7 y
    // filtramos en cliente para incluir también la nota exacta.
    async function plexFetchFavorites(type) {
      const sk = embyConfig.libraryId;
      if (!sk) return [];
      const data = await fetchPlexJson(`${embyConfig.host}/library/sections/${sk}/all?type=${type}&userRating%3E%3E=${PLEX_FAVORITE_RATING - 1}&X-Plex-Token=${embyConfig.token}`);
      const mc = data.MediaContainer || {};
      return (mc.Metadata || []).concat(mc.Directory || [])
        .map(normalizePlexItem)
        .filter(item => Number(item.userRating) >= PLEX_FAVORITE_RATING);
    }

    async function plexSetFavorite(item, on) {
      const ratingKey = item._plexKey || item.Id;
      if (!ratingKey) return false;
      const url = `${embyConfig.host}/:/rate?identifier=com.plexapp.plugins.library&key=${encodeURIComponent(ratingKey)}&rating=${on ? PLEX_FAVORITE_RATING : 0}&X-Plex-Token=${embyConfig.token}`;
      const res = await fetch(url, { method: 'PUT' });
      return res.ok;
    }

    // --- Común ---

    function storeFavorites(items) {
      const store = loadFavoritesStore();
      store.songs = {};
      store.albums = {};
      items.forEach(item => {
        const kind = favoriteKind(item);
        if (kind) store[favoriteBucket(kind)][favoriteKey(item)] = favoriteSnapshot(item);
      });
      saveFavoritesStore();
    }

    // Recoge los favoritos del servidor. El servidor manda: se reemplaza lo
    // guardado para no mostrar elementos obsoletos.
    async function syncFavoritesFromServer(force) {
      const st = embyConfig.serverType;
      if (st !== 'emby' && st !== 'jellyfin' && st !== 'plex') return;
      if (favoritesSyncDone && !force) return;
      if (!embyConfig.host || !embyConfig.token) return;
      if ((st === 'emby' || st === 'jellyfin') && !embyConfig.userId) return;
      favoritesSyncDone = true;
      try {
        if (st === 'plex') {
          const [albums, songs] = await Promise.all([plexFetchFavorites(9), plexFetchFavorites(10)]);
          storeFavorites(albums.concat(songs));
        } else {
          const items = await embyFetchFavorites();
          // Si el servidor falla, conservamos lo que ya teníamos
          if (!items) { favoritesSyncDone = false; return; }
          storeFavorites(items);
        }
        updateFavoritesCount();
      } catch (e) {
        // Para no quedarnos sin favoritos hasta la próxima recarga de la página
        favoritesSyncDone = false;
      }
    }

    function invalidateFavoritesCache() {
      favoritesSyncDone = false;
    }

    async function fetchFavorites(kind) {
      await syncFavoritesFromServer();
      const items = Object.values(loadFavoritesStore()[favoriteBucket(kind)] || {});
      if (embyConfig.serverType === 'local') {
        // Los blob: URL caducan al recargar: re-enlazamos con las pistas vivas
        // (por ruta en canciones, por nombre de álbum en los álbumes)
        const liveByPath = new Map();
        const coverByAlbum = new Map();
        (localTracks || []).forEach(tr => {
          if (tr.Path) liveByPath.set(String(tr.Path), tr);
          const album = tr.Album || '';
          if (album && !coverByAlbum.has(album)) coverByAlbum.set(album, tr.coverUrl || '');
        });
        return items.map(snap => {
          const live = liveByPath.get(String(snap.Path));
          if (live) return Object.assign({}, snap, live);
          const cover = coverByAlbum.get(snap.Name);
          return (snap.Type === 'MusicAlbum' && cover) ? Object.assign({}, snap, { coverUrl: cover }) : snap;
        }).filter(item => item && item.Name);
      }
      return items.filter(item => item && item.Name);
    }

    function favoritesCount(kind) {
      const bucket = loadFavoritesStore()[favoriteBucket(kind || 'Songs')];
      return Object.keys(bucket).length;
    }

    function updateFavoritesCount() {
      const total = document.getElementById('count-favorites');
      if (total) total.textContent = favoritesCount('Songs') + favoritesCount('Albums');
      const songs = document.getElementById('count-fav-songs');
      if (songs) songs.textContent = favoritesCount('Songs');
      const albums = document.getElementById('count-fav-albums');
      if (albums) albums.textContent = favoritesCount('Albums');
    }

    // Refresca el total en segundo plano (tarjeta de la rejilla principal)
    async function refreshFavoritesCount() {
      await syncFavoritesFromServer();
      updateFavoritesCount();
    }

    // Etiqueta e icono de la opción "favorito" del menú contextual
    function updateFavoriteMenuOption() {
      const opt = document.getElementById('ctx-favorite-option');
      if (!opt) return;
      const item = ctxMenuItem;
      if (!favoriteKind(item)) {
        opt.style.display = 'none';
        return;
      }
      opt.style.display = 'flex';
      const fav = isFavorite(item);
      const label = opt.querySelector('.ctx-favorite-label');
      if (label) label.textContent = fav ? t('removeFromFavorites') : t('addToFavorites');
      const icon = opt.querySelector('.material-icons');
      if (icon) {
        icon.textContent = fav ? 'favorite' : 'favorite_border';
        icon.style.color = fav ? '#ff4d6d' : '';
      }
    }

    function ctxToggleFavorite() {
      const item = ctxMenuItem;
      closeContextMenu();
      toggleFavorite(item);
    }
