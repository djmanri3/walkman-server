/* Optional cassette screen, limited to idle Walkman Hi-Res playback. */
let walkmanHiResCassetteTimer = null;
let walkmanHiResCassetteActivity = performance.now();
let walkmanHiResCassetteFocus = null;
const walkmanHiResCassettePointers = new Set();

function isWalkmanHiResCassetteEnabled() {
  return loadLS('walkman_hires_cassette_enabled') === 'on';
}

function getWalkmanHiResCassetteDelay() {
  const raw = loadLS('walkman_hires_cassette_delay');
  const value = Number(raw);
  return raw && Number.isFinite(value) ? Math.min(120, Math.max(3, Math.round(value))) : 10;
}

function setWalkmanHiResCassetteEnabled(enabled) {
  saveLS('walkman_hires_cassette_enabled', enabled ? 'on' : 'off');
  walkmanHiResCassetteActivity = performance.now();
  syncWalkmanHiResCassette();
}

function setWalkmanHiResCassetteDelay(value) {
  const number = Number(value);
  const delay = value !== '' && Number.isFinite(number) ? Math.min(120, Math.max(3, Math.round(number))) : 10;
  saveLS('walkman_hires_cassette_delay', String(delay));
  document.getElementById('walkman-hires-cassette-delay').value = delay;
  walkmanHiResCassetteActivity = performance.now();
  syncWalkmanHiResCassette();
}

function walkmanHiResCassetteContext() {
  return document.body.dataset.theme === 'walkmanhires'
    && isWalkmanHiResCassetteEnabled() && !document.hidden && !walkmanHiResCassettePointers.size
    && !!playlist[currentTrackIndex]
    && document.getElementById('view-playing').classList.contains('active')
    && !document.querySelector('.settings-overlay.open, .settings-menu.open, .settings-submenu.open, .audio-enhancements-menu.open, .search-overlay.open, .context-menu-overlay.open, .queue-drawer.open, .lyrics-view.active, .visualizer-overlay.open, .library-picker.open')
    && getComputedStyle(document.getElementById('emby-modal')).display === 'none';
}

function updateWalkmanHiResCassetteTrack() {
  const overlay = document.getElementById('walkman-hires-cassette');
  if (overlay.hidden) return;
  const track = playlist[currentTrackIndex];
  const title = track?.Name || '';
  const artist = (track?.Artists || []).join(', ') || track?.AlbumArtist || '';
  const shorten = text => Array.from(text).length > 48 ? Array.from(text).slice(0, 47).join('') + '…' : text;
  document.getElementById('walkman-hires-cassette-title').textContent = shorten(title);
  document.getElementById('walkman-hires-cassette-artist').textContent = shorten(artist);
  overlay.setAttribute('aria-label', `${t('hiresCassetteScreen')}: ${title}. ${artist}. ${t('hiresCassetteReturn')}`);
  const progress = Number.isFinite(audio.duration) && audio.duration > 0
    ? Math.max(0, Math.min(1, audio.currentTime / audio.duration)) : 0;
  const radius = fraction => Math.sqrt(62 ** 2 + (101 ** 2 - 62 ** 2) * fraction).toFixed(2);
  document.getElementById('walkman-hires-cassette-tape-left').setAttribute('r', radius(1 - progress));
  document.getElementById('walkman-hires-cassette-tape-right').setAttribute('r', radius(progress));
}

function hideWalkmanHiResCassette(restoreFocus = false) {
  const overlay = document.getElementById('walkman-hires-cassette');
  if (overlay.hidden) return;
  overlay.hidden = true;
  if (restoreFocus && walkmanHiResCassetteFocus?.isConnected && walkmanHiResCassetteFocus.offsetParent) {
    walkmanHiResCassetteFocus.focus({ preventScroll: true });
  }
  walkmanHiResCassetteFocus = null;
}

function dismissWalkmanHiResCassette() {
  hideWalkmanHiResCassette(true);
  walkmanHiResCassetteActivity = performance.now();
  syncWalkmanHiResCassette();
}

function syncWalkmanHiResCassette() {
  clearTimeout(walkmanHiResCassetteTimer);
  walkmanHiResCassetteTimer = null;
  const enabled = isWalkmanHiResCassetteEnabled();
  const toggle = document.getElementById('walkman-hires-cassette-toggle');
  toggle.setAttribute('aria-pressed', String(enabled));
  toggle.classList.toggle('on', enabled);
  const delay = document.getElementById('walkman-hires-cassette-delay');
  // Keep a partially entered value intact until the user commits the input.
  if (document.activeElement !== delay) delay.value = getWalkmanHiResCassetteDelay();
  delay.disabled = !enabled;
  if (!walkmanHiResCassetteContext()) {
    hideWalkmanHiResCassette();
    return;
  }
  const overlay = document.getElementById('walkman-hires-cassette');
  if (!overlay.hidden) {
    updateWalkmanHiResCassetteTrack();
    return;
  }
  if (audio.paused || audio.ended || audio.readyState < 3) return;
  const remaining = getWalkmanHiResCassetteDelay() * 1000 - (performance.now() - walkmanHiResCassetteActivity);
  walkmanHiResCassetteTimer = setTimeout(() => {
    walkmanHiResCassetteTimer = null;
    if (!walkmanHiResCassetteContext() || audio.paused || audio.ended || audio.readyState < 3) return;
    walkmanHiResCassetteFocus = document.activeElement;
    overlay.hidden = false;
    updateWalkmanHiResCassetteTrack();
    overlay.focus({ preventScroll: true });
  }, Math.max(0, remaining));
}

function resetWalkmanHiResCassetteIdle() {
  walkmanHiResCassetteActivity = performance.now();
  syncWalkmanHiResCassette();
}

for (const event of ['pointerdown', 'pointerup', 'pointercancel', 'pointermove', 'wheel', 'keydown']) {
  document.addEventListener(event, e => {
    if (e.type === 'pointerdown') walkmanHiResCassettePointers.add(e.pointerId);
    if (e.type === 'pointerup' || e.type === 'pointercancel') walkmanHiResCassettePointers.delete(e.pointerId);
    const overlay = document.getElementById('walkman-hires-cassette');
    if (!overlay.hidden) {
      if (e.type === 'keydown' && e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); dismissWalkmanHiResCassette();
      }
      return;
    }
    if (e.type === 'pointermove' && performance.now() - walkmanHiResCassetteActivity < 250) return;
    resetWalkmanHiResCassetteIdle();
  }, { capture: true, passive: event !== 'keydown' });
}

for (const event of ['playing', 'pause', 'waiting', 'ended', 'emptied', 'error']) {
  audio.addEventListener(event, () => {
    if (event === 'playing') walkmanHiResCassetteActivity = performance.now();
    syncWalkmanHiResCassette();
  });
}
audio.addEventListener('timeupdate', updateWalkmanHiResCassetteTrack);
document.addEventListener('visibilitychange', () => {
  walkmanHiResCassettePointers.clear();
  resetWalkmanHiResCassetteIdle();
});

// Menus and navigation can change without a pointer event (Android back,
// keyboard shortcuts, or restored state); they must never be covered on idle.
const walkmanHiResCassetteObserver = new MutationObserver(resetWalkmanHiResCassetteIdle);
for (const element of document.querySelectorAll('#view-playing, #queue-drawer, #settings-overlay, .settings-menu, .settings-submenu, #search-overlay, .context-menu-overlay, #view-lyrics, #visualizer-overlay, .audio-enhancements-menu, #emby-modal, .library-picker')) {
  walkmanHiResCassetteObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
}
walkmanHiResCassetteObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
syncWalkmanHiResCassette();
