/* Browser adapter for the original Sony Visualizer engine. */
window.SonyVisualizer = (() => {
  'use strict';
  const revision = 'gate-rectangles-3';
  const assetURL = name => { const url = new URL(name, base); url.searchParams.set('v', revision); return url.href; };
  const base = new URL('../vendor/sony-visualizer/', document.currentScript.src);
  const root = document.querySelector('.visualizer-canvas-container');
  const canvas = document.createElement('canvas');
  canvas.id = 'sony-visualizer-canvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none';
  root.appendChild(canvas);
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.style.cssText = 'position:absolute;inset:25% 10% auto;text-align:center;color:white;pointer-events:none;display:none';
  root.appendChild(status);
  let engine, loading, active = false, chosen = '', applied = '', song = '', generation = 0;
  let lastFrame = 0, lastPlay = null, failed = false;
  const images = new Map();
  const message = (key) => typeof t === 'function' ? t(key) : key;
  function check(code) { if (code !== 0) throw new Error('Sony Visualizer operation failed'); }
  function error(cause) {
    console.warn("Sony Visualizer could not render", cause || "Engine error");
    failed = true;
    status.textContent = message(cause?.code === 'SONY_STALE_RUNTIME' ? 'visSonyUpdate' : 'visSonyError'); status.style.display = '';
  }
  async function load() {
    if (engine) return engine;
    if (!loading) loading = (async () => {
      status.textContent = message('visSonyLoading'); status.style.display = '';
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const runtime = location.protocol === 'file:' ? 'visualizer-file.js' : 'visualizer.js';
        script.src = assetURL(runtime);
        script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
      });
      const m = await createSonyVisualizer({ canvas, locateFile: assetURL,
        printErr: text => { if (text.startsWith('Sony Visualizer:')) error(text); } });
      resize();
      check(m._ux_init(canvas.width, canvas.height, 0));
      if (m.sonyGraphicsRevision !== revision) {
        const cause = new Error('Outdated Sony Visualizer runtime'); cause.code = 'SONY_STALE_RUNTIME'; throw cause;
      }
      canvas.dataset.sonyRevision = revision;
      check(m.ccall('ux_music', 'number', ['string','string','string','number'], ['','','',180000]));
      engine = m;
      return m;
    })();
    return loading;
  }
  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(root.clientWidth * ratio));
    const h = Math.max(1, Math.round(root.clientHeight * ratio));
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w; canvas.height = h;
    if (engine) { check(engine._ux_resize(w, h)); song = ''; }
  }
  function readImage(url) {
    if (images.has(url)) return images.get(url);
    const task = new Promise(resolve => {
      const image = new Image(); image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          const bitmap = document.createElement('canvas'); bitmap.width = bitmap.height = 128;
          const ctx = bitmap.getContext('2d'); ctx.drawImage(image, 0, 0, 128, 128);
          resolve(ctx.getImageData(0, 0, 128, 128).data);
        } catch { resolve(null); }
      };
      image.onerror = () => resolve(null); image.src = url;
    });
    images.set(url, task);
    if (images.size > 24) images.delete(images.keys().next().value);
    return task;
  }
  async function artwork(track, id) {
    // Reuse the same artwork URLs as the web player, including local covers.
    const tracks = [track, ...playlist].filter(Boolean);
    const urls = [...new Set(tracks.map(getEmbyImageUrl))].slice(0, 12);
    const pixels = (await Promise.all(urls.map(readImage))).filter(Boolean);
    if (id !== generation || !engine || !pixels.length) return;
    const ptr = engine._malloc(128 * 128 * 4);
    try { pixels.forEach((data, index) => {
      engine.HEAPU8.set(data, ptr); check(engine._ux_cover(ptr, index, pixels.length));
    }); } catch (cause) { error(cause); } finally { engine._free(ptr); }
  }
  function sync() {
    if (!engine || failed) return;
    const track = playlist[currentTrackIndex];
    const key = JSON.stringify([track?.Id, track?.Name, track?.Album, track?.Artists, track?.coverUrl, audio.duration]);
    if (applied !== chosen || song !== key) {
      if (applied !== chosen || chosen === 'sony-7') {
        const theme = chosen === 'sony-7' ? Math.floor(Math.random() * 7) : Number(chosen.slice(5));
        check(engine._ux_theme(theme)); applied = chosen;
      }
      check(engine.ccall('ux_music', 'number', ['string','string','string','number'], [
        track?.Name || '', track?.Artists?.join(', ') || track?.AlbumArtist || '', track?.Album || '',
        Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : Math.max(180000, (track?.RunTimeTicks || 0) / 10000)
      ]));
      song = key; lastPlay = null;
      artwork(track, ++generation);
    }
    const playing = !audio.paused && !audio.ended;
    if (lastPlay !== playing) { check(engine._ux_play(playing ? 1 : 0)); lastPlay = playing; }
  }
  function select(style) {
    active = /^sony-[0-7]$/.test(style); chosen = style;
    canvas.style.display = active ? '' : 'none';
    document.getElementById('visualizer-canvas').style.visibility = active ? 'hidden' : '';
    status.style.display = active && (failed || !engine) ? '' : 'none';
    if (active) load().then(() => { if (active) { sync(); status.style.display = failed ? '' : 'none'; } }).catch(error);
  }
  function render(now) {
    if (!active) return false;
    if (engine && !failed) {
      try { resize(); sync(); if (now - lastFrame >= 33) {
        check(engine._ux_frame(Math.max(0, Math.round((audio.currentTime || 0) * 1000)))); lastFrame = now;
      } } catch (cause) { error(cause); }
    }
    return true;
  }
  canvas.addEventListener('pointerup', event => {
    if (!engine || failed) return;
    const rect = canvas.getBoundingClientRect();
    try { check(engine._ux_touch(Math.round((event.clientX-rect.left)*canvas.width/rect.width), Math.round((event.clientY-rect.top)*canvas.height/rect.height))); } catch (cause) { error(cause); }
  });
  return { select, render };
})();
