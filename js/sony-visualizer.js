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
  let lastFrame = 0, lastPlay = null, failed = false, pending = '';
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
      const finish = value => {
        clearTimeout(timeout); image.onload = image.onerror = null; resolve(value);
      };
      // A missing or unreadable server cover must not block a scene forever.
      const timeout = setTimeout(() => finish(null), 5000);
      image.onload = () => {
        try {
          const bitmap = document.createElement('canvas'); bitmap.width = bitmap.height = 128;
          const ctx = bitmap.getContext('2d'); ctx.drawImage(image, 0, 0, 128, 128);
          finish(ctx.getImageData(0, 0, 128, 128).data);
        } catch { finish(null); }
      };
      image.onerror = () => finish(null); image.src = url;
    });
    images.set(url, task);
    if (images.size > 24) images.delete(images.keys().next().value);
    return task;
  }
  async function artwork(track) {
    // Reuse the same artwork URLs as the web player, including local covers.
    const tracks = [track, ...playlist].filter(Boolean);
    const urls = [...new Set(tracks.map(getEmbyImageUrl))].slice(0, 12);
    return (await Promise.all(urls.map(readImage))).filter(Boolean);
  }
  function uploadArtwork(pixels) {
    if (!pixels.length) return;
    const ptr = engine._malloc(128 * 128 * 4);
    try { pixels.forEach((data, index) => {
      engine.HEAPU8.set(data, ptr); check(engine._ux_cover(ptr, index, pixels.length));
    }); } finally { engine._free(ptr); }
  }
  const trackKey = track => JSON.stringify([track?.Id, track?.Name, track?.Album, track?.Artists, track?.coverUrl, audio.duration]);
  function sync() {
    if (!engine || failed) return false;
    const track = playlist[currentTrackIndex];
    const key = trackKey(track);
    if (applied !== chosen || song !== key) {
      const update = JSON.stringify([chosen, key]);
      if (pending !== update) {
        pending = update;
        const style = chosen, id = ++generation;
        artwork(track).then(pixels => {
          if (id !== generation || !active || !engine || failed || chosen !== style ||
              trackKey(playlist[currentTrackIndex]) !== key) return;
          // Reset retained per-song resources, then install metadata and every
          // cover together. Albums requests its collection on the first frame.
          const theme = style === 'sony-7' ? Math.floor(Math.random() * 7) : Number(style.slice(5));
          check(engine._ux_theme(theme));
          check(engine.ccall('ux_music', 'number', ['string','string','string','number'], [
            track?.Name || '', track?.Artists?.join(', ') || track?.AlbumArtist || '', track?.Album || '',
            Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : Math.max(180000, (track?.RunTimeTicks || 0) / 10000)
          ]));
          uploadArtwork(pixels);
          applied = style; song = key; lastPlay = null;
          status.style.display = 'none';
        }).catch(cause => { if (id === generation) error(cause); })
          .finally(() => { if (id === generation) pending = ''; });
      }
      // Keep the last complete image while preparing the next scene. Do not
      // let the native engine consume a temporary empty artwork collection.
      return false;
    }
    const playing = !audio.paused && !audio.ended;
    if (lastPlay !== playing) { check(engine._ux_play(playing ? 1 : 0)); lastPlay = playing; }
    return true;
  }
  function select(style) {
    active = /^sony-[0-7]$/.test(style); chosen = style;
    canvas.style.display = active ? '' : 'none';
    document.getElementById('visualizer-canvas').style.visibility = active ? 'hidden' : '';
    status.style.display = active && (failed || !engine) ? '' : 'none';
    if (active) load().then(() => { if (active) { sync(); status.style.display = failed || !song ? '' : 'none'; } }).catch(error);
  }
  function render(now) {
    if (!active) return false;
    if (engine && !failed) {
      try { resize(); if (!sync()) return true; if (now - lastFrame >= 33) {
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
