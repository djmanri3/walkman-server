/* Walkman Hi-Res: the artwork wash fades away when playback stops. */
function syncWalkmanHiResPlayback(playing = !audio.paused && !audio.ended && audio.readyState >= 3) {
  document.body.classList.toggle('walkman-hires-playing',
    document.body.dataset.theme === 'walkmanhires' && playing);
  updateWalkmanHiResQueuePlayer();
}

function updateWalkmanHiResTheme() {
  syncWalkmanHiResPlayback();
  updateWalkmanHiResLibraryChrome();
  if (typeof syncWalkmanHiResCassette === 'function') syncWalkmanHiResCassette();
  if (document.body.dataset.theme !== 'walkmanhires') return;
  const track = playlist[currentTrackIndex];
  const quality = document.getElementById('walkman-hires-quality');
  quality.textContent = track ? musicPlaybackQuality(track) : '';
  quality.hidden = !quality.textContent;
  const hiRes = !!track && isHiResAudio(track);
  quality.classList.toggle('walkman-hires-quality-hr', hiRes);
  if (hiRes && quality.textContent) {
    const badge = document.createElement('span');
    badge.className = 'walkman-hires-quality-badge';
    badge.textContent = 'HR';
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', t('hiresResolution'));
    quality.appendChild(badge);
  }
  const favorite = document.getElementById('walkman-hires-favorite');
  const on = !!track && isFavorite(track);
  favorite.disabled = !track;
  favorite.setAttribute('aria-pressed', String(on));
  favorite.setAttribute('aria-label', t(on ? 'removeFromFavorites' : 'addToFavorites'));
  favorite.querySelector('span').textContent = on ? 'star' : 'star_border';
}

async function toggleWalkmanHiResFavorite() {
  const track = playlist[currentTrackIndex];
  const button = document.getElementById('walkman-hires-favorite');
  if (!track || button.disabled) return;
  button.disabled = true;
  try { await toggleFavorite(track); } finally { updateWalkmanHiResTheme(); }
}

audio.addEventListener('playing', () => syncWalkmanHiResPlayback(true));
for (const event of ['pause', 'ended', 'emptied', 'waiting', 'error']) {
  audio.addEventListener(event, () => syncWalkmanHiResPlayback(false));
}


function decorateWalkmanHiResQueueRow(row, track, index) {
  const number = document.createElement('span');
  number.className = 'walkman-hires-only walkman-hires-queue-number';
  number.textContent = String(index + 1);
  row.querySelector('.queue-drag').appendChild(number);
  const details = document.createElement('div');
  details.className = 'walkman-hires-only walkman-hires-queue-audio';
  const codec = document.createElement('span');
  codec.textContent = musicTrackCodec(track);
  const duration = document.createElement('span');
  duration.className = 'walkman-hires-queue-duration';
  const seconds = Number(track.RunTimeTicks) > 0 ? Number(track.RunTimeTicks) / 10000000 : Number(track.Duration);
  duration.textContent = Number.isFinite(seconds) && seconds > 0 ? formatTime(seconds) : '';
  details.append(codec, duration);
  const more = row.querySelector('.list-item-more');
  more.setAttribute('aria-label', `${t('moreOptions')}: ${track.Name || t('noName')}`);
  row.insertBefore(details, more);
}

function updateWalkmanHiResQueueProgress() {
  if (document.body.dataset.theme !== 'walkmanhires') return;
  const slider = document.getElementById('walkman-hires-queue-progress');
  const seekable = !!playlist[currentTrackIndex] && Number.isFinite(audio.duration) && audio.duration > 0;
  const progress = seekable ? displayedPlaybackProgress() : 0;
  slider.disabled = !seekable;
  slider.value = progress;
  slider.style.setProperty('--queue-progress', progress + '%');
  if (seekable) {
    const duration = document.querySelector('.queue-item.active .walkman-hires-queue-duration');
    if (duration && !duration.textContent) duration.textContent = formatTime(audio.duration);
  }
}

function updateWalkmanHiResQueuePlayer() {
  if (document.body.dataset.theme !== 'walkmanhires') return;
  const track = playlist[currentTrackIndex];
  const image = document.getElementById('walkman-hires-queue-cover');
  const source = track ? getEmbyImageUrl(track) : defaultPlaceholder;
  if (image.getAttribute('src') !== source) {
    image.onerror = () => { image.onerror = null; image.src = defaultPlaceholder; };
    image.src = source;
  }
  document.getElementById('walkman-hires-queue-title').textContent = track?.Name || t('emptyQueue');
  document.getElementById('walkman-hires-queue-artist').textContent = (track?.Artists || []).join(', ') || track?.AlbumArtist || '';
  document.getElementById('walkman-hires-queue-count').textContent = String(playlist.length);
  const play = document.getElementById('walkman-hires-queue-play');
  play.disabled = !track;
  play.querySelector('span').textContent = !audio.paused && !audio.ended ? 'pause' : 'play_arrow';
  play.setAttribute('aria-label', t(!audio.paused && !audio.ended ? 'pause' : 'play'));
  updateWalkmanHiResQueueProgress();
}

function openWalkmanHiResQueueLibrary() {
  document.getElementById('queue-drawer').classList.remove('open');
  switchTab('music');
}

for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'seeking', 'emptied']) {
  audio.addEventListener(event, updateWalkmanHiResQueueProgress);
}


function updateWalkmanHiResLibraryChrome() {
  const hires = document.body.dataset.theme === 'walkmanhires';
  if (!hires && currentCategory === 'WalkmanHiRes') {
    beginMusicLibraryRequest(); currentCategory = ''; navStack = [];
    document.getElementById('category-view').style.display = 'block';
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('fav-view').style.display = 'none';
    document.getElementById('home-grid').style.display = '';
    applyFeaturedVisibility();
  }
  const library = hires && document.getElementById('view-music').classList.contains('active');
  document.body.classList.toggle('walkman-hires-library-open', library);
  if (!library) document.querySelector('#z1-mini-player .z1-mini-track').cancelWalkmanHiResSwipe?.();
  const root = document.getElementById('category-view').style.display !== 'none'
    && document.getElementById('fav-view').style.display === 'none';
  document.getElementById('walkman-hires-library-home').hidden = !hires || !root;
  if (!hires) return;
  document.querySelectorAll('#items-container .list-item').forEach(row => {
    if (row._musicPresentation) decorateWalkmanHiResMediaRow(row, row._musicPresentation[0], row._musicPresentation[2]);
  });
}

function decorateWalkmanHiResMediaRow(row, item, detail = false) {
  if (document.body.dataset.theme !== 'walkmanhires') return;
  if (item.Type !== 'Audio' && !(item.IsLocal && !item.Type) && !detail) return;
  row.classList.add('walkman-hires-audio-row');
  let info = row.querySelector('.walkman-hires-media-audio');
  if (!info) {
    info = document.createElement('div');
    info.className = 'walkman-hires-only walkman-hires-media-audio';
    info.append(document.createElement('span'), document.createElement('span'));
    row.insertBefore(info, row.querySelector('.list-item-more'));
  }
  info.firstChild.textContent = musicTrackCodec(item);
  const seconds = Number(item.RunTimeTicks) > 0 ? Number(item.RunTimeTicks) / 10000000 : Number(item.Duration);
  info.lastChild.textContent = Number.isFinite(seconds) && seconds > 0 ? formatTime(seconds) : '';
}

function openWalkmanHiResLibrary(category) {
  switchTab('music');
  if (category === 'Favorites') return showFavoritesMenu();
  return loadCategory(category);
}

function walkmanHiResGenres(track) {
  const raw = track.Genres || track.Genre || [];
  const values = Array.isArray(raw) ? raw : String(raw).split(/[;|]/);
  const names = values.map(value => typeof value === 'string' ? value.trim() : value?.Name || value?.tag || '').filter(Boolean);
  return [...new Set(names.length ? names : [''])];
}

async function openWalkmanHiResCollection(mode, genre = null) {
  if (document.body.dataset.theme !== 'walkmanhires') return;
  switchTab('music');
  const request = beginMusicLibraryRequest('walkmanhires:' + mode + ':' + (genre ?? ''));
  currentCategory = 'WalkmanHiRes';
  favoritesViewKind = ''; subItems = null;
  navStack = [{ type: 'hires-collection', mode }];
  if (genre !== null) navStack.push({ type: 'hires-genre', genre });
  showSortBar(false);
  document.getElementById('category-view').style.display = 'none';
  document.getElementById('list-view').style.display = 'block';
  const label = { recent: 'hiresRecent', hires: 'hiresResolution', genres: 'hiresGenres' }[mode];
  document.getElementById('selected-category-title').textContent = genre === null ? t(label) : genre || t('hiresUnknownGenre');
  const container = document.getElementById('items-container');
  container.textContent = t('loadingSongs');
  updateMusicLibraryChrome();
  try {
    const result = await fetchItems(SERVER_TYPES[embyConfig.serverType].Audio);
    if (!isCurrentMusicLibraryRequest(request) || document.body.dataset.theme !== 'walkmanhires') return;
    const tracks = (result.Items || []).map(track => track.Type ? track : { ...track, Type: 'Audio' });
    if (mode === 'genres' && genre === null) {
      const genres = new Map();
      tracks.forEach(track => walkmanHiResGenres(track).forEach(name => genres.set(name, (genres.get(name) || 0) + 1)));
      container.replaceChildren();
      [...genres].sort(([a], [b]) => a.localeCompare(b, currentLang)).forEach(([name, count]) => {
        const row = document.createElement('button');
        row.type = 'button'; row.className = 'list-item walkman-hires-genre-row';
        const icon = document.createElement('span'); icon.className = 'material-icons'; icon.textContent = 'library_music';
        const title = document.createElement('span'); title.className = 'list-item-info'; title.textContent = name || t('hiresUnknownGenre');
        const total = document.createElement('span'); total.textContent = String(count);
        row.append(icon, title, total);
        row.onclick = () => openWalkmanHiResCollection('genres', name);
        container.appendChild(row);
      });
      if (!genres.size) container.textContent = t('hiresNoTracks');
    } else {
      const filtered = mode === 'hires' ? tracks.filter(isHiResAudio)
        : genre !== null ? tracks.filter(track => walkmanHiResGenres(track).includes(genre)) : tracks;
      const sorted = sortListItems(filtered, mode === 'recent' ? 'dateAdded' : 'title', mode === 'recent' ? 'desc' : 'asc');
      renderTrackList(sorted);
      if (!sorted.length) container.textContent = t('hiresNoTracks');
    }
  } catch (error) {
    if (isCurrentMusicLibraryRequest(request) && document.body.dataset.theme === 'walkmanhires') container.textContent = t('hiresLoadError');
  }
  updateMusicLibraryChrome();
}

async function refreshWalkmanHiResLibrary() {
  const button = document.getElementById('walkman-hires-library-refresh');
  if (button.disabled) return;
  button.disabled = true;
  try { await updateCategoryCounts(); }
  catch (error) { showToast(t('hiresLoadError')); }
  finally { button.disabled = false; }
}

function initWalkmanHiResMiniSwipe() {
  const track = document.querySelector('#z1-mini-player .z1-mini-track');
  const mini = document.getElementById('z1-mini-player');
  let gesture = null;
  let motion = null;
  let motionTimer = null;
  let suppressClickUntil = 0;
  const available = () => document.body.dataset.theme === 'walkmanhires' && !mini.hidden
    && document.getElementById('view-music').classList.contains('active');
  const release = id => {
    if (track.hasPointerCapture(id)) track.releasePointerCapture(id);
  };
  const clearMotion = () => {
    clearTimeout(motionTimer); motionTimer = null;
    motion?.layer.remove(); motion = null;
    track.classList.remove('walkman-hires-mini-swiping');
  };
  track.cancelWalkmanHiResSwipe = () => {
    const pending = gesture; gesture = null;
    if (pending) release(pending.id);
    clearMotion();
  };
  const makePage = item => {
    const page = document.createElement('span');
    page.className = 'walkman-hires-mini-page';
    const image = document.createElement('img');
    image.alt = ''; image.draggable = false;
    image.onerror = () => { image.onerror = null; image.src = defaultPlaceholder; };
    image.src = item ? getEmbyImageUrl(item) : defaultPlaceholder;
    const copy = document.createElement('span'); copy.className = 'walkman-hires-mini-page-copy';
    const title = document.createElement('span'); title.textContent = item?.Name || '';
    const artist = document.createElement('span'); artist.textContent = (item?.Artists || []).join(', ') || item?.AlbumArtist || '';
    copy.append(title, artist); page.append(image, copy);
    return page;
  };
  const move = (state, offset) => {
    state.outgoing.style.transform = `translateX(${offset}px)`;
    if (state.incoming) state.incoming.style.transform = `translateX(${offset - state.direction * state.width}px)`;
  };
  const follow = (pending, dx) => {
    if (!motion) {
      const layer = document.createElement('span');
      layer.className = 'walkman-hires-mini-motion'; layer.setAttribute('aria-hidden', 'true');
      const outgoing = makePage(playlist[pending.index]);
      layer.appendChild(outgoing); track.appendChild(layer);
      track.classList.add('walkman-hires-mini-swiping');
      motion = { layer, outgoing, incoming: null, direction: 0, target: null, width: track.clientWidth };
    }
    const direction = dx < 0 ? -1 : 1;
    if (motion.direction !== direction) {
      motion.incoming?.remove(); motion.incoming = null;
      motion.direction = direction;
      motion.target = direction < 0 ? (pending.index + 1 < playlist.length ? pending.index + 1 : repeatMode === 1 ? 0 : null)
        : pending.index > 0 ? pending.index - 1 : null;
      if (motion.target !== null) {
        motion.incoming = makePage(playlist[motion.target]);
        motion.layer.appendChild(motion.incoming);
      }
    }
    const offset = motion.target === null ? Math.max(-motion.width * .2, Math.min(motion.width * .2, dx * .25))
      : Math.max(-motion.width, Math.min(motion.width, dx));
    move(motion, offset);
  };
  const settle = commit => {
    if (!motion) return;
    const state = motion;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : commit ? 220 : 180;
    // Keep the moving pages above the normal metadata while playback updates.
    if (commit) {
      if (state.direction < 0) nextTrack();
      else prevTrack();
    }
    if (motion !== state) return;
    void state.layer.offsetWidth;
    for (const page of [state.outgoing, state.incoming].filter(Boolean)) {
      page.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1)`;
    }
    move(state, commit ? state.direction * state.width : 0);
    if (!duration) clearMotion();
    else motionTimer = setTimeout(clearMotion, duration + 30);
  };
  track.addEventListener('pointerdown', event => {
    suppressClickUntil = 0;
    if (gesture) { track.cancelWalkmanHiResSwipe(); return; }
    if (!available() || event.button !== 0 || event.isPrimary === false) return;
    clearMotion();
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, index: currentTrackIndex, horizontal: false,
      scale: track.getBoundingClientRect().width / track.clientWidth || 1 };
    track.setPointerCapture(event.pointerId);
  });
  track.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!available() || currentTrackIndex !== gesture.index) { track.cancelWalkmanHiResSwipe(); return; }
    const dx = (event.clientX - gesture.x) / gesture.scale, dy = (event.clientY - gesture.y) / gesture.scale;
    if (!gesture.horizontal) {
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { track.cancelWalkmanHiResSwipe(); return; }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.35) gesture.horizontal = true;
    }
    if (gesture.horizontal) {
      if (event.cancelable) event.preventDefault();
      follow(gesture, dx);
    }
  });
  track.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const ended = gesture; gesture = null;
    release(event.pointerId);
    if (!ended.horizontal) return;
    suppressClickUntil = performance.now() + 700;
    if (event.cancelable) event.preventDefault();
    const dx = (event.clientX - ended.x) / ended.scale, dy = (event.clientY - ended.y) / ended.scale;
    const threshold = Math.max(40, Math.min(80, mini.clientWidth * .14));
    const commit = available() && currentTrackIndex === ended.index && !!motion && motion.target !== null
      && Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.35;
    settle(commit);
  });
  const cancel = () => { if (gesture) { gesture = null; settle(false); } };
  track.addEventListener('pointercancel', cancel);
  track.addEventListener('lostpointercapture', cancel);
  track.addEventListener('click', event => {
    if (event.detail !== 0 && performance.now() < suppressClickUntil) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressClickUntil = 0;
    }
  }, true);
}

initWalkmanHiResMiniSwipe();
