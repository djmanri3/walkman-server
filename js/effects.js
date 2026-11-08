/* Efectos visuales: color de fondo/accent dinámico, beat glow, LEDs Xperia SP, fullscreen y fallback de imagen de artista. */

    // --- Fallback de imagen de artista: si Emby/Jellyfin no tiene foto, la
    // buscamos en Deezer vía JSONP (Deezer no envía CORS, pero sí JSONP;
    // iTunes devuelve 403 en muchos entornos, así que no lo usamos). ---
    const artistImageCache = {};
    // Cola limitada: Deezer limita el número de peticiones por instante, así
    // que lanzamos como máximo 4 búsquedas a la vez y reintentamos una vez
    // si una falla (por tiempo de espera, tasa limitada o error temporal).
    const _extQueue = [];
    let _extActive = 0;
    const _extMaxConcurrent = 4;
    const _extInFlight = {};

    function jsonp(url) {
      return new Promise((resolve, reject) => {
        const cb = 'dz_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        const script = document.createElement('script');
        const cleanup = () => {
          delete window[cb];
          clearTimeout(timer);
          script.remove();
        };
        const timer = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, 8000);
        window[cb] = (data) => { cleanup(); resolve(data); };
        script.onerror = () => { cleanup(); reject(new Error('JSONP error: ' + url)); };
        script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
        document.head.appendChild(script);
      });
    }

    function _extNext() {
      while (_extActive < _extMaxConcurrent && _extQueue.length) {
        const task = _extQueue.shift();
        _extActive++;
        task().then(() => { _extActive--; _extNext(); }, () => { _extActive--; _extNext(); });
      }
    }

    function _queryDeezerImage(key) {
      return jsonp(`https://api.deezer.com/search/artist?q=${encodeURIComponent(key)}&limit=10&output=jsonp`)
        .then(ddata => {
          const artists = ddata && ddata.data;
          if (!Array.isArray(artists) || !artists.length) return '';
          const exact = artists.find(a => String(a.name || '').trim().toLowerCase() === key);
          const chosen = exact || artists[0];
          return chosen.picture_big || chosen.picture_xl || chosen.picture_medium || '';
        });
    }

    function _extTask(key) {
      return async () => {
        let url = '';
        try { url = await _queryDeezerImage(key); } catch (e) {}
        if (!url) {
          await new Promise(r => setTimeout(r, 1500));
          try { url = await _queryDeezerImage(key); } catch (e) {}
        }
        artistImageCache[key] = url || '';
        delete _extInFlight[key];
        return url;
      };
    }

    function fetchExternalArtistImage(name) {
      const key = String(name || '').trim().toLowerCase();
      if (!key) return Promise.resolve('');
      if (key in artistImageCache) return Promise.resolve(artistImageCache[key]);
      if (_extInFlight[key]) return _extInFlight[key];
      const p = new Promise(resolve => {
        _extQueue.push(() => _extTask(key)().then(resolve, resolve));
        _extNext();
      });
      _extInFlight[key] = p;
      return p;
    }

    async function handleImageFallback(el, item) {
      if (!el) return;
      el.onerror = null;
      if (!item) { el.src = defaultPlaceholder; return; }
      if (item.Type !== 'MusicArtist' || el.dataset.extTried) {
        el.src = defaultPlaceholder;
        return;
      }
      el.dataset.extTried = '1';
      el.referrerPolicy = 'no-referrer';
      const name = String(item.Name || item.AlbumArtist || '').trim();
      const url = await fetchExternalArtistImage(name);
      el.src = url || defaultPlaceholder;
    }

    function hasServerImage(item) {
      if (!item) return false;
      if (embyConfig.serverType === 'local' || item.IsLocal) {
        return !!item.coverUrl;
      }
      if (embyConfig.serverType === 'plex') {
        return !!(item._plexThumb || item._plexGrandparentThumb);
      }
      return !!(item.ImageTags && item.ImageTags.Primary) || !!item.PrimaryImageTag;
    }

    // Imagen de artista: si Emby/Jellyfin ya tiene foto, se respeta y no se
    // toca. Solo si el servidor no tiene imagen usamos la externa de Deezer
    // (un artista sin foto devuelve un placeholder 200, por lo que el onerror
    // no se dispara; por eso comprobamos ImageTags en vez de esperar el error).
    function applyArtistImageFallback(imgEl, item) {
      if (!imgEl || !item) return;
      if (item.Type !== 'MusicArtist') {
        imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = defaultPlaceholder; };
        return;
      }
      if (hasServerImage(item)) {
        imgEl.onerror = () => handleImageFallback(imgEl, item);
        return;
      }
      imgEl.referrerPolicy = 'no-referrer';
      const name = String(item.Name || item.AlbumArtist || '').trim();
      fetchExternalArtistImage(name).then(url => {
        if (url && imgEl) {
          imgEl.dataset.extTried = '1';
          imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = defaultPlaceholder; };
          imgEl.src = url;
        }
      }).catch(() => {});
      imgEl.onerror = () => handleImageFallback(imgEl, item);
    }

    // WEB AUDIO API - ECUALIZADOR, CLEAR BASS, VPT REVERB Y ANALYZER DE VISUALIZADOR
    // En iOS el AudioContext se suspende al minimizar la app, cortando el sonido
    // (ya que el audio va enrutado a través de él). Para poder reproducir en
    // background, en iOS desactivamos el procesado Web Audio y dejamos que el
    // elemento <audio> reproduzca de forma nativa directamente.

    function dominantFromCanvas(img) {
      const cv = document.createElement('canvas');
      const size = 32;
      cv.width = size; cv.height = size;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      try {
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        return { r: r, g: g, b: b };
      } catch (e) {
        return { r: 120, g: 120, b: 120 };
      }
    }

    function paintAlbumBackground(color) {
      const bg = $('bg-container');
      const playing = $('view-playing');
      const { r, g, b } = color;
      if (playing.dataset.theme !== 'z1') {
        bg.style.background = `radial-gradient(circle at 50% 60%, rgb(${r},${g},${b}) 0%, #050505 85%)`;
        return;
      }
      // The original Xperia background spreads the artwork hue across the
      // whole screen, with a broad glow and tinted edges rather than black.
      const red = r / 255, green = g / 255, blue = b / 255;
      const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
      const delta = max - min, light = (max + min) / 2;
      let hue = 0, saturation = 0;
      if (delta > 0) {
        hue = max === red ? ((green - blue) / delta + 6) % 6
          : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
        hue *= 60;
        saturation = delta / (1 - Math.abs(2 * light - 1));
      }
      saturation = saturation < .04 ? 0 : Math.min(.68, Math.max(.35, saturation * 1.4));
      const glow = 22 + max * 8;
      const tone = brightness => `hsl(${hue.toFixed(1)}, ${(saturation * 100).toFixed(1)}%, ${brightness.toFixed(1)}%)`;
      bg.style.setProperty('--z1-beat-color', tone(glow + 30));
      bg.style.background = `radial-gradient(ellipse farthest-corner at 50% 45%, ${tone(glow)} 0%, ${tone(glow * .85)} 55%, ${tone(glow * .55)} 100%)`;
    }

    // Color Thief
    const imgCurrent = document.getElementById('img-current');
    imgCurrent.addEventListener('load', function() {
      try {
        if (imgCurrent.complete && imgCurrent.naturalWidth !== 0) {
          const { r, g, b } = dominantFromCanvas(imgCurrent);
          const colorHex = `rgb(${r}, ${g}, ${b})`;
          
          // Guardar color del álbum para el visualizador estilo PS3
          visAlbumColor = { r: r, g: g, b: b };

          // El fondo SIEMPRE se adapta al color de la carátula, independientemente del modo
          paintAlbumBackground(visAlbumColor);
          
          // Solo el color de acento depende del modo
          if (accentMode === 'dynamic') {
            document.documentElement.style.setProperty('--accent-color', colorHex);
          }
        }
      } catch (e) {}
    });

    // ---- Color de acento dinámico/custom ----
    let accentMode = 'dynamic'; // 'dynamic' | 'custom'
    let customAccentHex = '#aa00ff';

    function applyAccent() {
      const isDynamic = accentMode === 'dynamic';
      document.getElementById('accent-opt-dynamic').classList.toggle('active', isDynamic);
      document.getElementById('accent-opt-custom').classList.toggle('active', !isDynamic);
      document.getElementById('accent-custom-row').style.display = isDynamic ? 'none' : 'flex';

      if (!isDynamic) {
        document.documentElement.style.setProperty('--accent-color', customAccentHex);
      } else {
        // Restaurar dinámico: el próximo load de imgCurrent lo recalculará
        try {
          if (imgCurrent.complete && imgCurrent.naturalWidth !== 0) {
            const c = ColorThief.getColorSync(imgCurrent);
            const { r, g, b } = c.rgb();
            document.documentElement.style.setProperty('--accent-color', `rgb(${r}, ${g}, ${b})`);
          }
        } catch (e) {}
      }
      saveAccentSettings();
    }

    function setAccentMode(mode) {
      accentMode = mode;
      applyAccent();
    }

    function setCustomAccent(hex) {
      customAccentHex = hex;
      accentMode = 'custom';
      applyAccent();
    }

    function saveAccentSettings() {
      try {
        saveLS('walkman_accent', JSON.stringify({ mode: accentMode, custom: customAccentHex }));
      } catch (e) {}
    }

    function restoreAccentSettings() {
      try {
        const saved = loadLS('walkman_accent');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.mode) accentMode = parsed.mode;
          if (parsed.custom) customAccentHex = parsed.custom;
        }
      } catch (e) {}
      document.getElementById('accent-color-input').value = customAccentHex;
      applyAccent();
    }

    // ---- Resplandor al ritmo de la música ----
    let beatGlowEnabled = false;
    let beatGlowSens = 2;
    let beatGlowAnimId = null;
    let beatGlowPulse = 0;
    let beatGlowAvg = 0;
    let z1BeatAvg = 0, z1BeatPulse = 0, z1BeatLevel = 0, z1BeatLastTime = 0, z1BeatRms = 0;
    let z1BeatWaveform = null;

    function resetZ1BeatEnvelope() {
      z1BeatAvg = z1BeatPulse = z1BeatLevel = z1BeatLastTime = z1BeatRms = 0;
    }

    function updateZ1BeatEnvelope(bands, dt, binHz, rms = null) {
      dt = Math.max(.001, Math.min(.1, dt));
      let bass = 0, body = 0, bassCount = 0, bodyCount = 0;
      if (bands) for (let i = 1; i < bands.length; i++) {
        const hz = i * binHz;
        if (hz >= 50 && hz < 250) { bass += bands[i] / 255; bassCount++; }
        else if (hz >= 250 && hz < 900) { body += bands[i] / 255; bodyCount++; }
      }
      bass /= bassCount || 1; body /= bodyCount || 1;
      const spectral = bass * .82 + body * .18;
      const hasRms = Number.isFinite(rms) && rms >= 0;
      if (hasRms) z1BeatRms += (rms - z1BeatRms) * (1 - Math.exp(-dt / .04));
      // Waveform amplitude retains beat dynamics that byte FFT magnitudes
      // compress. Do not clip it before detecting changes in loud music.
      const energy = hasRms ? spectral * .4 + z1BeatRms * 2.4 : spectral;
      z1BeatAvg += (energy - z1BeatAvg) * (1 - Math.exp(-dt / .45));
      // Mastered music often has only small level changes between beats.
      // Normalize those changes against the current level, rather than
      // requiring another jump as large as starting playback from silence.
      const rise = Math.max(0, energy - z1BeatAvg - .002);
      const attack = Math.min(1, rise / Math.max(.018, z1BeatAvg * .055));
      z1BeatPulse = Math.max(z1BeatPulse * Math.exp(-dt / .22), attack);
      const gain = [.75, 1, 1.25][beatGlowSens - 1] || 1;
      const target = energy < .015 ? 0 : Math.min(.72, z1BeatPulse * .58 * gain + energy * .045);
      const tau = target > z1BeatLevel ? .065 : .3;
      z1BeatLevel += (target - z1BeatLevel) * (1 - Math.exp(-dt / tau));
      if (z1BeatLevel < .0005) z1BeatLevel = 0;
      return z1BeatLevel;
    }

    function getBeatGlow() {
      return loadLS('walkman_beatglow') === 'on';
    }

    function getBeatGlowSens() {
      return Number(loadLS('walkman_beatglow_sens')) || 2;
    }

    function applyBeatGlowUI() {
      const btn = document.getElementById('beatglow-btn');
      if (btn) btn.classList.toggle('on', beatGlowEnabled);
      const label = document.getElementById('beatglow-btn-label');
      if (label) label.textContent = beatGlowEnabled ? t('beatGlow') + ': ON' : t('beatGlow');
      const wrap = document.getElementById('beatglow-sens-wrap');
      if (wrap) wrap.style.display = beatGlowEnabled ? '' : 'none';
      const opts = document.querySelectorAll('#beatglow-sens-options .accent-option');
      opts.forEach(o => o.classList.toggle('active', Number(o.dataset.bsens) === beatGlowSens));
    }

    // ---- Pantalla completa ----
    let fullscreenEnabled = false;

    function getFullscreenSetting() {
      return loadLS('walkman_fullscreen') === 'on';
    }

    function applyFullscreenUI() {
      const btn = document.getElementById('fullscreen-btn');
      if (btn) btn.classList.toggle('on', fullscreenEnabled);
      const label = document.getElementById('fullscreen-btn-label');
      if (label) label.textContent = fullscreenEnabled ? t('fullscreen') + ': ON' : t('fullscreen');
    }

    function isFullscreen() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function toggleFullscreen() {
      fullscreenEnabled = !isFullscreen();
      saveLS('walkman_fullscreen', fullscreenEnabled ? 'on' : 'off');
      if (fullscreenEnabled) {
        const el = document.documentElement;
        if (el.requestFullscreen) { el.requestFullscreen().catch(() => {}); }
        else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
        else if (el.msRequestFullscreen) { el.msRequestFullscreen(); }
      } else {
        if (document.exitFullscreen) { document.exitFullscreen().catch(() => {}); }
        else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
      }
    }

    function initFullscreen() {
      fullscreenEnabled = getFullscreenSetting();
      applyFullscreenUI();
      document.addEventListener('fullscreenchange', syncFullscreenUI);
      document.addEventListener('webkitfullscreenchange', syncFullscreenUI);
      if (fullscreenEnabled) {
        const el = document.documentElement;
        if (el.requestFullscreen) { el.requestFullscreen().catch(() => {}); }
        else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
      }
    }

    function syncFullscreenUI() {
      const fs = isFullscreen();
      fullscreenEnabled = fs;
      applyFullscreenUI();
      saveLS('walkman_fullscreen', fs ? 'on' : 'off');
    }

    function setBeatGlowSens(v) {
      beatGlowSens = Number(v) || 2;
      saveLS('walkman_beatglow_sens', String(beatGlowSens));
      applyBeatGlowUI();
    }

    function toggleBeatGlow() {
      beatGlowEnabled = !beatGlowEnabled;
      saveLS('walkman_beatglow', beatGlowEnabled ? 'on' : 'off');
      applyBeatGlowUI();
      if (beatGlowEnabled) {
        beatGlowPulse = 0; beatGlowAvg = 0;
        resetBeatGlowBackground();
        try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
        const bg = document.getElementById('bg-container');
        if (bg) bg.style.transition = 'background 90ms linear';
        if (!beatGlowAnimId) beatGlowLoop();
      } else {
        if (beatGlowAnimId !== null) cancelAnimationFrame(beatGlowAnimId);
        beatGlowAnimId = null;
        const bg = document.getElementById('bg-container');
        if (bg) bg.style.transition = 'background 1.5s ease-in-out';
        resetBeatGlowBackground();
      }
    }

    function beatGlowLoop(now = performance.now()) {
      if (!beatGlowEnabled) { beatGlowAnimId = null; return; }
      try {
        if (!analyserNode && audio) initAudioContext();
        if (analyserNode && audioCtx && audioCtx.state === 'suspended') {
          try { audioCtx.resume(); } catch (e) {}
        }
      } catch (e) {}

      if ($('view-playing').dataset.theme === 'z1') {
        const dt = z1BeatLastTime ? (now - z1BeatLastTime) / 1000 : 1 / 60;
        z1BeatLastTime = now;
        let bands = null, binHz = 1, rms = null;
        if (analyserNode && audio && !audio.paused) {
          try {
            const bin = analyserNode.frequencyBinCount;
            if (!visBands || visBands.length !== bin) visBands = new Uint8Array(bin);
            analyserNode.getByteFrequencyData(visBands);
            bands = visBands;
            binHz = audioCtx.sampleRate / analyserNode.fftSize;
            if (typeof analyserNode.getFloatTimeDomainData === 'function') {
              if (!z1BeatWaveform || z1BeatWaveform.length !== analyserNode.fftSize) z1BeatWaveform = new Float32Array(analyserNode.fftSize);
              analyserNode.getFloatTimeDomainData(z1BeatWaveform);
              let power = 0;
              for (const sample of z1BeatWaveform) power += sample * sample;
              rms = Math.sqrt(power / z1BeatWaveform.length);
            }
          } catch (e) {}
        }
        // Only opacity changes on beats: the artwork hue and base gradient
        // remain stable, including on pause, silence and high-energy tracks.
        const level = updateZ1BeatEnvelope(bands, dt, binHz, rms);
        $('bg-container').style.setProperty('--z1-beat-level', level.toFixed(3));
      } else if (analyserNode && audio && !audio.paused) {
        try {
          const bin = analyserNode.frequencyBinCount;
          if (bin > 0) {
            if (!visBands || visBands.length !== bin) visBands = new Uint8Array(bin);
            analyserNode.getByteFrequencyData(visBands);
            // Energía de graves (donde suele estar el ritmo)
            const low = Math.min(24, bin);
            let sum = 0;
            for (let i = 0; i < low; i++) sum += visBands[i];
            const energy = (sum / low) / 255;
            beatGlowAvg = beatGlowAvg * 0.97 + energy * 0.03;
            const diff = energy - beatGlowAvg;
            const k = [1.8, 3.0, 4.5][beatGlowSens - 1] || 3.0;
            const target = diff > 0 ? Math.min(0.85, diff * k) : 0;
            beatGlowPulse = Math.max(beatGlowPulse * 0.86, target);
            const breathe = energy * 0.15;
            const level = 1 + beatGlowPulse + breathe;
            const c = visAlbumColor || { r: 120, g: 120, b: 120 };
            const r = Math.min(255, Math.floor(c.r * level));
            const g = Math.min(255, Math.floor(c.g * level));
            const b = Math.min(255, Math.floor(c.b * level));
            const bg = document.getElementById('bg-container');
            if (bg) {
              paintAlbumBackground({ r, g, b });
            }
          }
        } catch (e) {}
      }
      beatGlowAnimId = requestAnimationFrame(beatGlowLoop);
    }

    function resetBeatGlowBackground() {
      resetZ1BeatEnvelope();
      const c = visAlbumColor || { r: 120, g: 120, b: 120 };
      const bg = document.getElementById('bg-container');
      if (bg) {
        bg.style.setProperty('--z1-beat-level', '0');
        paintAlbumBackground(c);
      }
    }

    function initBeatGlow() {
      beatGlowEnabled = getBeatGlow();
      beatGlowSens = getBeatGlowSens();
      applyBeatGlowUI();
      if (beatGlowEnabled) {
        const bg = document.getElementById('bg-container');
        if (bg) bg.style.transition = 'background 90ms linear';
        if (!beatGlowAnimId) beatGlowLoop();
      }
    }

    // ---- LEDs estilo Xperia SP (barra de iluminación que late con la música) ----

    let xpspLedEnabled = false;
    let xpspLedAnimId = null;
    let xpspLedEls = [];
    let xpspLedPulse = 0;
    let xpspLedAvg = 0;
    let xpspLedSens = 2;
    let xpspLedLastTime = 0;
    const xpspLedLevels = new Float32Array(3);
    const XPSP_LED_COUNT = 3;

    function getXpspLeds() {
      return loadLS('walkman_xpsp_leds') === 'on';
    }

    function getXpspLedSens() {
      return Number(loadLS('walkman_xpsp_leds_sens')) || 2;
    }

    function setXpspLedSens(v) {
      xpspLedSens = Number(v) || 2;
      saveLS('walkman_xpsp_leds_sens', String(xpspLedSens));
      applyXpspLedUI();
    }

    function buildXpspLedStrip() {
      const strip = document.getElementById('xpsp-led-strip');
      if (!strip) return;
      if (xpspLedEls.length) return;
      for (let i = 0; i < XPSP_LED_COUNT; i++) {
        const led = document.createElement('div');
        led.className = 'xpsp-led';
        strip.appendChild(led);
        xpspLedEls.push(led);
      }
    }

    function applyXpspLedUI() {
      const btn = document.getElementById('xpsp-led-btn');
      if (btn) btn.classList.toggle('on', xpspLedEnabled);
      const label = document.getElementById('xpsp-led-btn-label');
      if (label) label.textContent = xpspLedEnabled ? t('xpspLeds') + ': ON' : t('xpspLeds');
      const wrap = document.getElementById('xpsp-sens-wrap');
      if (wrap) wrap.style.display = xpspLedEnabled ? '' : 'none';
      const opts = document.querySelectorAll('#xpsp-sens-options .accent-option');
      opts.forEach(o => o.classList.toggle('active', Number(o.dataset.ssens) === xpspLedSens));
      const strip = document.getElementById('xpsp-led-strip');
      if (strip) {
        strip.style.display = xpspLedEnabled ? 'flex' : 'none';
        strip.classList.toggle('on', xpspLedEnabled && xpspLedLevels.some(level => level > 0.01));
      }
    }

    function toggleXpspLeds() {
      xpspLedEnabled = !xpspLedEnabled;
      saveLS('walkman_xpsp_leds', xpspLedEnabled ? 'on' : 'off');
      applyXpspLedUI();
      if (xpspLedEnabled) {
        buildXpspLedStrip();
        resetXpspLedLevels();
        try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
        if (!xpspLedAnimId) xpspLedLoop();
      } else {
        if (xpspLedAnimId !== null) cancelAnimationFrame(xpspLedAnimId);
        xpspLedAnimId = null;
        resetXpspLedLevels();
        paintXpspLeds();
      }
    }

    function resetXpspLedLevels() {
      xpspLedPulse = 0;
      xpspLedAvg = 0;
      xpspLedLastTime = 0;
      xpspLedLevels.fill(0);
    }

    // Approximation of the supplied Xperia SP video: a persistent center glow
    // and paired side flashes on musical attacks, rather than one band per LED.
    // Timing uses elapsed seconds so 60 Hz and 120 Hz screens pulse alike.
    function updateXpspLedLevels(bands, dt, binHz) {
      let bass = 0, body = 0, bassCount = 0, bodyCount = 0;
      for (let i = 1; i < bands.length; i++) {
        const hz = i * binHz;
        if (hz >= 50 && hz < 250) { bass += bands[i] / 255; bassCount++; }
        else if (hz >= 250 && hz < 1800) { body += bands[i] / 255; bodyCount++; }
      }
      bass /= bassCount || 1;
      body /= bodyCount || 1;
      const energy = bass * 0.35 + body * 0.65;
      const silent = Math.max(bass, body) < 0.015;
      xpspLedAvg += (energy - xpspLedAvg) * (1 - Math.exp(-dt / 0.3));
      // Compare attacks with the recent musical level, instead of keeping the
      // whole strip bright for as long as a bass note or vocal is sustained.
      const rise = Math.max(0, energy - xpspLedAvg - 0.012);
      const attack = Math.min(1, rise / Math.max(0.06, xpspLedAvg * 0.35));
      xpspLedPulse = silent ? 0 : Math.max(attack, xpspLedPulse * Math.exp(-dt / 0.16));
      const gain = [0.7, 1, 1.5][xpspLedSens - 1] || 1;
      const side = energy * 0.04 + xpspLedPulse * 0.95;
      const center = 0.14 + energy * 0.3 + xpspLedPulse * 0.65;
      const targets = [side, center, side];
      for (let i = 0; i < 3; i++) {
        const target = silent ? 0 : Math.min(1, targets[i] * gain);
        const tau = silent ? 0.09 : (target > xpspLedLevels[i] ? 0.02 : (i === 1 ? 0.16 : 0.11));
        xpspLedLevels[i] += (target - xpspLedLevels[i]) * (1 - Math.exp(-dt / tau));
        if (xpspLedLevels[i] < 0.001) xpspLedLevels[i] = 0;
      }
    }

    function paintXpspLeds() {
      const strip = document.getElementById('xpsp-led-strip');
      if (!strip) return;
      const color = visAlbumColor || { r: 170, g: 0, b: 255 };
      const rgb = [color.r, color.g, color.b].join(', ');
      if (strip.dataset.ledColor !== rgb) {
        strip.dataset.ledColor = rgb;
        strip.style.setProperty('--xpsp-rgb', rgb);
        strip.style.setProperty('--xpsp-light', [color.r, color.g, color.b].map(v => Math.round(v * 0.35 + 255 * 0.65)).join(', '));
        strip.style.setProperty('--xpsp-core', [color.r, color.g, color.b].map(v => Math.round(v * 0.1 + 255 * 0.9)).join(', '));
      }
      const peak = Math.max(...xpspLedLevels);
      strip.classList.toggle('on', peak > 0.01);
      strip.style.setProperty('--xpsp-level', peak.toFixed(3));
      xpspLedEls.forEach((led, i) => {
        led.style.opacity = xpspLedLevels[i].toFixed(3);
      });
    }

    function xpspLedLoop() {
      if (!xpspLedEnabled) { xpspLedAnimId = null; return; }
      try {
        if (!analyserNode && audio) initAudioContext();
        if (analyserNode && audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        const now = performance.now();
        const dt = xpspLedLastTime ? Math.min(0.1, Math.max(0.001, (now - xpspLedLastTime) / 1000)) : 1 / 60;
        xpspLedLastTime = now;
        if (analyserNode && audio && !audio.paused && !audio.ended && analyserNode.frequencyBinCount > 0) {
          const bin = analyserNode.frequencyBinCount;
          if (visBands.length !== bin) visBands = new Uint8Array(bin);
          analyserNode.getByteFrequencyData(visBands);
          updateXpspLedLevels(visBands, dt, audioCtx.sampleRate / analyserNode.fftSize);
        } else {
          resetXpspLedLevels();
        }
      } catch (e) { resetXpspLedLevels(); }
      paintXpspLeds();
      xpspLedAnimId = requestAnimationFrame(xpspLedLoop);
    }

    function initXpspLeds() {
      xpspLedEnabled = getXpspLeds();
      xpspLedSens = getXpspLedSens();
      if (xpspLedEnabled) {
        buildXpspLedStrip();
        if (!xpspLedAnimId) xpspLedLoop();
      }
      applyXpspLedUI();
    }


