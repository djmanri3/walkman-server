/* Sony Music layout, sharing the existing player, library and server adapters. */
function musicTrackCodec(item) {
  const info = getEmbyMediaInfo(item);
  const codec = info?.codec || info?.container || item?._audioQuality?.audioCodec
    || item?._audioQuality?.codec || item?._audioQuality?.container;
  if (codec) return String(codec).toUpperCase();
  const extension = String(item?.Path || '').split(/[?#]/)[0].split('.').pop();
  return /^(?:flac|mp3|aac|m4a|alac|wav|aiff|ogg|opus|dsf|dff)$/i.test(extension) ? extension.toUpperCase() : '';
}

function musicHasHr(item) {
  return musicTrackCodec(item) === 'FLAC' || isHiResAudio(item);
}

function musicPlaybackQuality(item) {
  const codec = musicTrackCodec(item);
  const info = getEmbyMediaInfo(item);
  const stream = item?.MediaSources?.[0]?.MediaStreams?.find(entry => entry.Type === 'Audio');
  const sampleRate = Number(info?.sampleRate || item?._audioQuality?.sampleRate);
  const depth = Number(stream?.BitDepth || stream?.BitsPerSample || item?._audioQuality?.bitDepth || item?._audioQuality?.bitsPerSample);
  if (isLosslessCodec(codec) && (sampleRate || depth)) {
    const rate = sampleRate > 0 ? `${Number((sampleRate / 1000).toFixed(1))} kHz` : '';
    return [codec, rate].filter(Boolean).join(' ') + (depth > 0 ? ` / ${depth} bit` : '');
  }
  return getAudioQualityText(item).split(' · ').slice(0, 2).join(' ') || codec;
}

function createMusicHrBadge() {
  const badge = document.createElement('span');
  badge.className = 'music-hr-badge';
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', 'HR');
  badge.textContent = 'HR';
  return badge;
}

function handlePlayerBack() {
  if (document.body.dataset.theme === 'music' && !document.getElementById('view-playing').classList.contains('active')) {
    if (document.body.classList.contains('music-detail-open')) backToCategories();
    else toggleMusicNavigation();
  } else switchTab('music');
}

function initMusicPlayerDismissGesture() {
  const player = document.getElementById('view-playing');
  let gesture = null;
  const available = () => document.body.dataset.theme === 'music' && player.classList.contains('active')
    && !document.getElementById('view-lyrics').classList.contains('active')
    && !document.getElementById('queue-drawer').classList.contains('open');
  player.addEventListener('touchstart', event => {
    gesture = null;
    if (!available() || event.touches.length !== 1 || player.scrollTop > 1
      || event.target.closest('button,input,select,textarea,a,[role="button"],.controls-wrapper,.lyrics-view,.queue-drawer')) return;
    const touch = event.touches[0];
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, vertical: false };
  }, { passive: true });
  player.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (!available() || event.touches.length !== 1) { gesture = null; return; }
    const touch = [...event.touches].find(point => point.identifier === gesture.id);
    if (!touch) { gesture = null; return; }
    const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
    if (!gesture.vertical) {
      if (dy < -14 || (Math.abs(dx) > 14 && Math.abs(dx) >= dy)) { gesture = null; return; }
      if (dy > 14 && dy > Math.abs(dx) * 1.35) gesture.vertical = true;
    }
    if (gesture.vertical && event.cancelable) event.preventDefault();
  }, { passive: false });
  player.addEventListener('touchend', event => {
    const ended = gesture;
    gesture = null;
    if (!ended || !ended.vertical || !available()) return;
    const touch = [...event.changedTouches].find(point => point.identifier === ended.id);
    if (!touch) return;
    if (event.cancelable) event.preventDefault();
    const dx = touch.clientX - ended.x, dy = touch.clientY - ended.y;
    if (dy >= Math.max(56, Math.min(96, player.clientHeight * .1)) && dy > Math.abs(dx) * 1.35) {
      // The library stays mounted while Playing is open, preserving its route and scroll.
      switchTab('music');
    }
  }, { passive: false });
  player.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
}

initMusicPlayerDismissGesture();

function initMusicLibraryTabGesture() {
  const library = document.getElementById('view-music');
  const tabs = [...document.querySelectorAll('#music-library-tabs [data-music-category]')];
  let gesture = null;
  const available = () => document.body.dataset.theme === 'music' && library.classList.contains('active')
    && document.body.classList.contains('music-library-open') && !document.body.classList.contains('music-detail-open');
  const selected = () => tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
  library.addEventListener('touchstart', event => {
    gesture = null;
    if (!available() || event.touches.length !== 1
      || event.target.closest('button,input,select,textarea,a,[role="button"],#music-library-tabs,#music-favorite-tabs,#list-sortbar')) return;
    const index = selected(), touch = event.touches[0];
    if (index >= 0) gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, index, horizontal: false };
  }, { passive: true });
  library.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (!available() || event.touches.length !== 1 || selected() !== gesture.index) { gesture = null; return; }
    const touch = [...event.touches].find(point => point.identifier === gesture.id);
    if (!touch) { gesture = null; return; }
    const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
    if (!gesture.horizontal) {
      if (Math.abs(dy) > 14 && Math.abs(dy) >= Math.abs(dx)) { gesture = null; return; }
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.35) gesture.horizontal = true;
    }
    if (gesture.horizontal && event.cancelable) event.preventDefault();
  }, { passive: false });
  library.addEventListener('touchend', event => {
    const ended = gesture;
    gesture = null;
    if (!ended || !ended.horizontal || !available() || selected() !== ended.index) return;
    const touch = [...event.changedTouches].find(point => point.identifier === ended.id);
    if (!touch) return;
    if (event.cancelable) event.preventDefault();
    const dx = touch.clientX - ended.x, dy = touch.clientY - ended.y;
    if (Math.abs(dx) < Math.max(56, Math.min(100, library.clientWidth * .15)) || Math.abs(dx) <= Math.abs(dy) * 1.35) return;
    const next = tabs[ended.index + (dx < 0 ? 1 : -1)];
    if (next) next.click();
  }, { passive: false });
  library.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
}

initMusicLibraryTabGesture();

function updateMusicThemeData() {
  const music = document.body.dataset.theme === 'music';
  const playing = document.getElementById('view-playing').classList.contains('active');
  const back = document.querySelector('.z1-header-back');
  back.querySelector('span').textContent = music ? (playing ? 'keyboard_arrow_down' : 'menu') : 'chevron_left';
  back.setAttribute('aria-label', music && !playing ? t('musicHome') : t('myMusic'));
  back.setAttribute('aria-expanded', String(!document.getElementById('music-navigation').hidden));
  document.querySelector('#repeat-btn > .material-icons').textContent = music ? 'repeat' : 'undo';
  document.querySelector('#shuffle-btn > .material-icons').textContent = music ? 'shuffle' : 'redo';
  updateMusicLibraryChrome();
  if (!music) return;
  const track = playlist[currentTrackIndex];
  const quality = musicPlaybackQuality(track);
  const label = document.getElementById('music-track-quality');
  label.textContent = quality;
  if (musicHasHr(track)) label.append(document.createTextNode(' '), createMusicHrBadge());
  label.hidden = !quality;
  document.getElementById('view-playing').classList.toggle('music-has-quality', !!quality);
  const background = document.getElementById('music-album-background');
  const url = track ? getEmbyImageUrl(track) : defaultPlaceholder;
  if (background.getAttribute('src') !== url) {
    background.onerror = () => { background.onerror = null; background.src = defaultPlaceholder; };
    background.src = url;
  }
  const favorite = document.getElementById('music-track-favorite');
  const on = track ? isFavorite(track) : false;
  favorite.disabled = !track;
  favorite.setAttribute('aria-pressed', String(on));
  favorite.setAttribute('aria-label', t(on ? 'removeFromFavorites' : 'addToFavorites'));
  favorite.querySelector('span').textContent = on ? 'star' : 'star_border';
  const add = document.getElementById('music-track-add');
  add.disabled = !track || embyConfig.serverType === 'local';
  add.setAttribute('aria-label', t('addToPlaylist'));
  document.querySelector('.music-header-queue').setAttribute('aria-label', t('musicPlayQueue'));
}

async function toggleMusicTrackFavorite() {
  const track = playlist[currentTrackIndex];
  if (!track) return;
  const button = document.getElementById('music-track-favorite');
  if (button.disabled) return;
  button.disabled = true;
  try { await toggleFavorite(track); } finally { updateMusicThemeData(); }
}

function addMusicTrackToPlaylist() {
  const track = playlist[currentTrackIndex];
  if (!track || embyConfig.serverType === 'local') return;
  ctxMenuItem = track;
  ctxAddToPlaylist();
}

function openMusicQueue() {
  closeMusicNavigation(false);
  switchTab('playing');
  if (!document.getElementById('queue-drawer').classList.contains('open')) toggleQueueDrawer();
}

function openMusicLyrics() {
  switchTab('playing');
  toggleLyricsView();
}

function closeMusicNavigation(restoreFocus = true) {
  const menu = document.getElementById('music-navigation');
  const wasOpen = !menu.hidden;
  menu.hidden = true;
  document.getElementById('music-navigation-overlay').hidden = true;
  document.querySelector('.z1-header-back').setAttribute('aria-expanded', 'false');
  if (wasOpen && restoreFocus) document.querySelector('.z1-header-back').focus();
}

function toggleMusicNavigation() {
  const menu = document.getElementById('music-navigation');
  if (!menu.hidden) { closeMusicNavigation(); return; }
  menu.hidden = false;
  document.getElementById('music-navigation-overlay').hidden = false;
  document.querySelector('.z1-header-back').setAttribute('aria-expanded', 'true');
  menu.querySelector('button').focus();
}

function navigateMusicTheme(target) {
  closeMusicNavigation(false);
  if (target === 'settings') { toggleSettingsMenu(); return; }
  if (target === 'queue') { openMusicQueue(); return; }
  switchTab('music');
  document.getElementById('view-music').scrollTop = 0;
  if (target === 'favorites') return loadFavorites('Songs');
  if (target !== 'home') return loadCategory(target);
  beginMusicLibraryRequest();
  navStack = [];
  favoritesViewKind = '';
  document.getElementById('category-view').style.display = 'block';
  document.getElementById('list-view').style.display = 'none';
  document.getElementById('fav-view').style.display = 'none';
  document.getElementById('home-grid').style.display = '';
  applyFeaturedVisibility();
  renderMusicLibrary();
  updateMusicLibraryChrome();
}

function refreshMusicHome() {
  closeZ1HeaderMenu();
  renderMusicLibrary();
  return loadMusicRecentTracks(true);
}

function toggleMusicLibrarySort() {
  const open = document.body.classList.toggle('music-sort-open');
  document.querySelector('.music-header-sort').setAttribute('aria-expanded', String(open));
  if (open) document.getElementById('list-sort-select').focus();
}

function toggleMusicAlbumsGrid() {
  if (document.body.dataset.theme !== 'music' || currentCategory !== 'Albums' || subItems || favoritesViewKind) return;
  saveLS('walkman_music_albums_grid', loadLS('walkman_music_albums_grid') === 'on' ? 'off' : 'on');
  closeZ1HeaderMenu();
  updateMusicLibraryChrome();
}

function getMusicAlbumsColumns() {
  const columns = Number(loadLS('walkman_music_albums_columns'));
  return Number.isInteger(columns) && columns >= 1 && columns <= 6 ? columns : 0;
}

function setMusicAlbumsColumns(value) {
  const columns = Number(value);
  saveLS('walkman_music_albums_columns', Number.isInteger(columns) && columns >= 1 && columns <= 6 ? String(columns) : 'auto');
  updateMusicLibraryChrome();
}

let musicLibraryViewKey = '';
let musicFavoriteCollection = { kind: '', items: null };
let musicLibraryRequestId = 0;
let musicRowsRenderState = null;
let musicCenteredCategory = '';

function beginMusicLibraryRequest() {
  const id = ++musicLibraryRequestId;
  return document.body.dataset.theme === 'music' ? { id, source: musicLibrarySource() } : null;
}

function isCurrentMusicLibraryRequest(request) {
  return !request || (request.id === musicLibraryRequestId && request.source === musicLibrarySource());
}

function rememberMusicFavorites(kind, items) {
  musicFavoriteCollection = { kind, items };
}

function updateMusicLibraryChrome() {
  const music = document.body.dataset.theme === 'music';
  const playing = document.getElementById('view-playing').classList.contains('active');
  const list = document.getElementById('list-view').style.display !== 'none';
  const favoriteMenu = document.getElementById('fav-view').style.display !== 'none'
    && document.getElementById('category-view').style.display !== 'none';
  const library = music && !playing && (list || favoriteMenu);
  const detail = library && list && navStack.at(-1)?.type === 'subitems';
  const favorites = library && !detail && (!!favoritesViewKind || favoriteMenu);
  const category = favorites ? 'Favorites' : currentCategory || navStack.find(entry => entry.type === 'category')?.category;
  const albums = library && !detail && !favorites && category === 'Albums';
  const grid = loadLS('walkman_music_albums_grid') === 'on';
  document.body.classList.toggle('music-albums-grid', albums && grid);
  const albumsAction = document.getElementById('music-albums-view-action');
  const albumsActionLabel = grid ? 'musicShowList' : 'musicShowGrid';
  albumsAction.hidden = !albums;
  albumsAction.textContent = grid ? 'view_list' : 'grid_view';
  albumsAction.dataset.i18nTitle = albumsActionLabel;
  albumsAction.title = t(albumsActionLabel);
  albumsAction.setAttribute('aria-label', t(albumsActionLabel));
  const columns = getMusicAlbumsColumns();
  document.getElementById('music-albums-columns-control').hidden = !albums || !grid;
  document.getElementById('music-albums-columns').value = columns ? String(columns) : 'auto';
  document.getElementById('items-container').style.setProperty('--music-album-columns', columns ? `repeat(${columns}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(140px, 1fr))');
  document.body.classList.toggle('music-library-open', library);
  document.body.classList.toggle('music-detail-open', detail);
  document.body.classList.toggle('music-favorites-open', favorites);
  document.body.classList.toggle('music-favorites-menu', music && favoriteMenu);
  const key = `${library}:${detail}:${category}:${favoritesViewKind}`;
  const changed = key !== musicLibraryViewKey;
  if (changed || !music) document.body.classList.remove('music-sort-open');
  musicLibraryViewKey = key;
  const sort = document.querySelector('.music-header-sort');
  sort.hidden = !library || document.getElementById('list-sortbar').style.display === 'none';
  sort.setAttribute('aria-label', t('sortBy'));
  sort.setAttribute('aria-expanded', String(document.body.classList.contains('music-sort-open')));
  const homeAction = document.querySelector('.music-home-action');
  homeAction.hidden = !music || playing || library;
  document.querySelector('#music-library-tabs').querySelectorAll('button').forEach(button => {
    const active = button.dataset.musicCategory === category;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && library && !detail && musicCenteredCategory !== category) {
      const tabs = document.getElementById('music-library-tabs');
      tabs.scrollLeft = Math.max(0, button.offsetLeft - (tabs.clientWidth - button.offsetWidth) / 2);
      musicCenteredCategory = category;
    }
  });
  document.querySelectorAll('[data-music-favorites]').forEach(button => {
    const active = button.dataset.musicFavorites === favoritesViewKind;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('#music-navigation [data-music-target]').forEach(button => {
    const active = button.dataset.musicTarget === (library ? favorites ? 'favorites' : category : 'home');
    button.classList.toggle('music-nav-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (!music) return;
  if (!playing) {
    document.querySelector('.z1-header-back span').textContent = detail ? 'arrow_back' : 'menu';
    document.querySelector('.z1-header-back').setAttribute('aria-label', t(detail ? 'back' : 'musicHome'));
  }
  if (library) {
    const container = document.getElementById('items-container');
    const state = [container.firstElementChild, container.lastElementChild, container.childElementCount, playlist[currentTrackIndex], currentLang];
    if (!musicRowsRenderState || state.some((value, index) => value !== musicRowsRenderState[index])) {
      container.querySelectorAll('.list-item').forEach(row => {
        if (row._musicPresentation) decorateMusicMediaRow(row, ...row._musicPresentation);
      });
      musicRowsRenderState = state;
    }
  }
  renderMusicDetailHeader(detail || (favorites && list), favorites);
}

function musicTrackCount(count) {
  return t(Number(count) === 1 ? 'musicOneTrack' : 'musicTracks').replace('{count}', String(count));
}

function decorateMusicMediaRow(row, item, index = 0, detail = false) {
  row._musicPresentation = [item, index, detail];
  if (document.body.dataset.theme !== 'music') return;
  row.classList.add('music-media-row');
  const current = playlist[currentTrackIndex];
  row.classList.toggle('music-current-row', !!current && (String(item.Id) === String(current.Id)
    || (item.Type === 'MusicAlbum' && String(item.Id) === String(current.AlbumId))));
  const existingSubtitle = row.querySelector('.music-row-subtitle');
  const original = row.querySelector('.list-item-sub').textContent;
  const subtitle = existingSubtitle || document.createElement('div');
  subtitle.className = 'music-only music-row-subtitle';
  let count = item.SongCount ?? item.Count ?? (item.Type !== 'MusicArtist' ? item.ChildCount : null) ?? item.PlaylistIds?.length;
  if (count !== null && count !== undefined && Number.isFinite(Number(count)) && ['MusicArtist', 'Playlist'].includes(item.Type)) {
    subtitle.textContent = item.Type === 'Playlist' && Number(count) === 0 ? t('musicEmptyPlaylist') : musicTrackCount(count);
  } else subtitle.textContent = original;
  if (existingSubtitle) return;
  row.querySelector('.list-item-info').appendChild(subtitle);
  const audioItem = item.Type === 'Audio' || detail;
  const info = document.createElement('div');
  info.className = 'music-only music-row-audio-info';
  if (audioItem) {
    const format = document.createElement('span');
    format.className = 'music-row-format';
    const codec = musicTrackCodec(item);
    if (musicHasHr(item)) format.appendChild(createMusicHrBadge());
    const text = document.createElement('span');
    text.textContent = String(codec).toUpperCase();
    format.appendChild(text);
    const duration = Number(item.RunTimeTicks) > 0 ? Number(item.RunTimeTicks) / 10000000 : Number(item.Duration);
    const time = document.createElement('span');
    time.className = 'music-row-duration';
    time.textContent = Number.isFinite(duration) && duration > 0 ? formatTime(duration) : '';
    info.append(format, time);
  } else if (item._hasHiRes) info.appendChild(createMusicHrBadge());
  row.insertBefore(info, row.querySelector('.list-item-more'));
  const number = document.createElement('span');
  number.className = 'music-only music-row-number';
  number.textContent = String(item.IndexNumber || item.TrackNumber || index + 1);
  row.prepend(number);
  if (item.Type === 'MusicArtist' || (item.Type === 'Playlist' && !hasServerImage(item))) {
    row.classList.toggle('music-placeholder-row', !hasServerImage(item));
    const placeholder = document.createElement('span');
    placeholder.className = 'music-only music-row-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    if (item.Type === 'MusicArtist') {
      const colors = ['#557483', '#4385dd', '#dc8b1b', '#d34747', '#468c82'];
      const hash = Array.from(item.Name || '').reduce((sum, c) => sum + c.codePointAt(0), 0);
      placeholder.style.backgroundColor = colors[hash % colors.length];
      placeholder.textContent = Array.from(item.Name || '?')[0].toUpperCase();
    } else {
      const icon = document.createElement('span');
      icon.className = 'material-icons';
      icon.textContent = 'queue_music';
      placeholder.appendChild(icon);
    }
    row.insertBefore(placeholder, row.querySelector('.list-item-info'));
    if (item.Type === 'MusicArtist') {
      row.classList.add('music-artist-row');
      const image = row.querySelector('img');
      const originalUrl = new URL(getEmbyImageUrl(item), document.baseURI).href;
      const syncPhoto = () => {
        const isFallback = image.src === new URL(defaultPlaceholder, document.baseURI).href || image.src === emergencyPlaceholder;
        const hasPhoto = image.complete && image.naturalWidth > 0 && !isFallback
          && (hasServerImage(item) || image.src !== originalUrl);
        row.classList.toggle('music-placeholder-row', !hasPhoto);
      };
      image.addEventListener('load', syncPhoto);
      image.addEventListener('error', () => row.classList.add('music-placeholder-row'));
      syncPhoto();
    }
  }
}

function renderMusicDetailHeader(visible, favorites = false) {
  const header = document.getElementById('music-detail-header');
  header.hidden = !visible;
  if (!visible) return;
  const state = [favorites, favoritesViewKind, musicFavoriteCollection, subItems, currentLang, document.getElementById('selected-category-title').textContent];
  if (header._musicRenderState && state.every((value, index) => value === header._musicRenderState[index])) return;
  header._musicRenderState = state;
  if (favorites) {
    const items = musicFavoriteCollection.kind === favoritesViewKind ? musicFavoriteCollection.items : null;
    const art = document.createElement('div');
    art.className = 'music-favorite-art';
    const icon = document.createElement('span');
    icon.className = 'material-icons';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'star';
    art.appendChild(icon);
    const copy = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = t('favorites');
    const count = document.createElement('p');
    count.textContent = items ? favoritesViewKind === 'Songs' ? musicTrackCount(items.length)
      : `${t('albums')}: ${items.length}` : '';
    copy.append(title, count);
    if (items && favoritesViewKind === 'Songs') {
      const seconds = items.reduce((sum, item) => sum + (Number(item.RunTimeTicks) > 0
        ? Number(item.RunTimeTicks) / 10000000 : Number(item.Duration) || 0), 0);
      if (seconds > 0 || !items.length) {
        const time = document.createElement('p');
        time.textContent = `${Math.round(seconds / 60)} min`;
        copy.appendChild(time);
      }
    }
    header.replaceChildren(art, copy);
    return;
  }
  const item = subItems?.item || subItems?.tracks?.[0];
  const image = document.createElement('img');
  image.src = getEmbyImageUrl(item);
  image.alt = '';
  image.onerror = () => { image.onerror = null; image.src = defaultPlaceholder; };
  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = subItems?.title || document.getElementById('selected-category-title').textContent;
  const artist = document.createElement('p');
  artist.textContent = item?.AlbumArtist || (item?.Artists || []).join(', ');
  const count = document.createElement('p');
  count.textContent = subItems ? musicTrackCount(subItems.tracks.length) : '';
  copy.append(title, artist, count);
  header.replaceChildren(image, copy);
}

function createMusicLibraryCard(track, onPlay, queueIndex = -1) {
  const article = document.createElement('article');
  article.className = 'music-library-card';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'music-library-track';
  const image = document.createElement('img');
  image.src = getEmbyImageUrl(track);
  image.alt = '';
  image.loading = 'lazy';
  image.onerror = () => { image.onerror = null; image.src = defaultPlaceholder; };
  const title = document.createElement('span');
  title.className = 'music-library-card-title';
  title.textContent = track.Name || t('noName');
  const artist = document.createElement('span');
  artist.className = 'music-library-card-artist';
  artist.textContent = (track.Artists || []).join(', ') || track.AlbumArtist || '';
  button.append(image, title, artist);
  button.addEventListener('click', onPlay);
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'music-library-card-more';
  more.setAttribute('aria-label', `${t('moreOptions')}: ${track.Name || t('noName')}`);
  const icon = document.createElement('span');
  icon.className = 'material-icons';
  icon.textContent = 'more_vert';
  more.appendChild(icon);
  more.addEventListener('click', event => openContextMenu(event, track, queueIndex));
  article.append(button, more);
  return article;
}

let musicQueueRenderKey = '';

function renderMusicLibrary(force = false) {
  if (force) musicRecentState.loadedAt = 0;
  if (document.body.dataset.theme !== 'music'
    || !document.getElementById('view-music').classList.contains('active')
    || document.getElementById('category-view').style.display === 'none') return;
  const container = document.getElementById('music-library-cards');
  const tracks = playlist.slice(currentTrackIndex, currentTrackIndex + 12);
  const key = JSON.stringify([musicLibrarySource(), currentLang, currentTrackIndex, playlistVersion,
    tracks.map(track => [track.Id, track.Name, track.Artists, track.AlbumArtist, getEmbyImageUrl(track)])]);
  if (key !== musicQueueRenderKey) {
    const fragment = document.createDocumentFragment();
    tracks.forEach((track, offset) => {
      const index = currentTrackIndex + offset;
      fragment.appendChild(createMusicLibraryCard(track, () => { playTrack(index); switchTab('playing'); }, index));
    });
    if (!playlist.length) {
      const empty = document.createElement('p');
      empty.className = 'music-library-empty';
      empty.textContent = t('emptyQueue');
      fragment.appendChild(empty);
    }
    container.replaceChildren(fragment);
    musicQueueRenderKey = key;
  }
  loadMusicRecentTracks(force);
}

let musicRecentState = { source: '', tracks: [], loadedAt: 0, promise: null, loading: false, error: false };

function musicLibrarySource() {
  return JSON.stringify([embyConfig.serverType, embyConfig.host, embyConfig.libraryId, embyConfig.userId]);
}

function renderMusicRecentTracks() {
  const container = document.getElementById('music-recent-cards');
  const state = musicRecentState;
  const renderState = [state, state.tracks, state.loading, state.error, currentLang];
  if (container._musicRenderState && renderState.every((value, index) => value === container._musicRenderState[index])) return;
  container._musicRenderState = renderState;
  container.setAttribute('aria-busy', String(state.loading));
  const fragment = document.createDocumentFragment();
  if (!state.tracks.length) {
    const message = document.createElement('p');
    message.className = 'music-recent-status';
    message.textContent = t(state.loading ? 'musicRecentLoading' : state.error ? 'musicRecentError' : 'musicRecentEmpty');
    fragment.appendChild(message);
  }
  if (state.error) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'music-recent-retry';
    retry.textContent = t('musicRecentRetry');
    retry.addEventListener('click', () => loadMusicRecentTracks(true));
    fragment.appendChild(retry);
  }
  state.tracks.forEach((track, index) => {
    fragment.appendChild(createMusicLibraryCard(track, () => {
      playlist = [...state.tracks];
      originalPlaylist = [...playlist];
      isShuffle = false;
      document.getElementById('shuffle-btn').classList.remove('active');
      playlistVersion++;
      playTrack(index);
      switchTab('playing');
    }));
  });
  container.replaceChildren(fragment);
}

async function loadMusicRecentTracks(force = false) {
  const source = musicLibrarySource();
  if (musicRecentState.source !== source) {
    musicRecentState = { source, tracks: [], loadedAt: 0, promise: null, loading: false, error: false };
  }
  const state = musicRecentState;
  if (embyConfig.serverType === 'local') {
    if (!force && state.localTracks === localTracks && state.localCount === localTracks.length
      && Date.now() - state.loadedAt < 60000) { renderMusicRecentTracks(); return; }
    const tracks = localTracks.filter(track => track.Type !== 'Playlist').map(track => track.Type ? track : { ...track, Type: 'Audio' });
    state.tracks = sortListItems(tracks, 'dateAdded', 'desc').slice(0, 18);
    state.localTracks = localTracks;
    state.localCount = localTracks.length;
    state.loadedAt = Date.now();
    renderMusicRecentTracks();
    return;
  }
  if (!embyConfig.host || !embyConfig.token || !embyConfig.libraryId) { renderMusicRecentTracks(); return; }
  if (state.promise) return state.promise;
  if (!force && Date.now() - state.loadedAt < 60000) { renderMusicRecentTracks(); return; }
  state.loading = true;
  state.error = false;
  renderMusicRecentTracks();
  state.promise = fetchRecentlyAddedTracks().then(tracks => {
    if (state !== musicRecentState || source !== musicLibrarySource()) return;
    state.tracks = tracks;
    state.loadedAt = Date.now();
  }).catch(() => {
    if (state === musicRecentState) state.error = true;
  }).finally(() => {
    state.loading = false;
    state.promise = null;
    if (state === musicRecentState && source === musicLibrarySource()) renderMusicRecentTracks();
  });
  return state.promise;
}

document.addEventListener('keydown', event => {
  const menu = document.getElementById('music-navigation');
  if (menu.hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); closeMusicNavigation(); }
  if (event.key === 'Tab') {
    const buttons = [...menu.querySelectorAll('button')];
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
  }
});

audio.addEventListener('timeupdate', () => {
  if (document.body.dataset.theme !== 'music') return;
  const progress = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(100, audio.currentTime / audio.duration * 100) : 0;
  document.getElementById('view-playing').style.setProperty('--music-progress', progress + '%');
});

for (const id of ['music-library-tabs', 'music-favorite-tabs']) {
  document.getElementById(id).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  });
}
