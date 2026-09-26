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
          $('bg-container').style.background = 
            `radial-gradient(circle at 50% 60%, ${colorHex} 0%, #050505 85%)`;
          
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
        try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
        const bg = document.getElementById('bg-container');
        if (bg) bg.style.transition = 'background 90ms linear';
        if (!beatGlowAnimId) beatGlowLoop();
      } else {
        const bg = document.getElementById('bg-container');
        if (bg) bg.style.transition = 'background 1.5s ease-in-out';
        resetBeatGlowBackground();
      }
    }

    function beatGlowLoop() {
      if (!beatGlowEnabled) { beatGlowAnimId = null; return; }
      try {
        if (!analyserNode && audio) initAudioContext();
        if (analyserNode && audioCtx && audioCtx.state === 'suspended') {
          try { audioCtx.resume(); } catch (e) {}
        }
      } catch (e) {}

      // Sin audio reproduciéndose (pausa o sin pista): no repintar nada,
      // solo mantener el reloj RAF para reanudar en cuanto suene.
      if (analyserNode && audio && !audio.paused) {
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
              bg.style.background = `radial-gradient(circle at 50% 60%, rgb(${r},${g},${b}) 0%, #050505 85%)`;
            }
          }
        } catch (e) {}
      }
      beatGlowAnimId = requestAnimationFrame(beatGlowLoop);
    }

    function resetBeatGlowBackground() {
      const c = visAlbumColor || { r: 120, g: 120, b: 120 };
      const bg = document.getElementById('bg-container');
      if (bg) {
        bg.style.background = `radial-gradient(circle at 50% 60%, rgb(${c.r},${c.g},${c.b}) 0%, #050505 85%)`;
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
    let xpspLedHeightFrame = 0;
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
        strip.classList.toggle('on', xpspLedEnabled);
      }
    }

    function toggleXpspLeds() {
      xpspLedEnabled = !xpspLedEnabled;
      saveLS('walkman_xpsp_leds', xpspLedEnabled ? 'on' : 'off');
      applyXpspLedUI();
      if (xpspLedEnabled) {
        buildXpspLedStrip();
        xpspLedPulse = 0; xpspLedAvg = 0;
        try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
        if (!xpspLedAnimId) xpspLedLoop();
      } else {
        const els = xpspLedEls;
        const strip = document.getElementById('xpsp-led-strip');
        if (strip) strip.classList.remove('on');
        for (let i = 0; i < els.length; i++) {
          els[i].classList.remove('on');
        }
        xpspLedAnimId = null;
      }
    }

    // Devuelve el color de acento de la carátula actual como {r,g,b}
    function getXpspLedColor() {
      const c = visAlbumColor;
      if (c && typeof c.r === 'number') return c;
      return { r: 170, g: 0, b: 255 };
    }

    function xpspLedLoop() {
      if (!xpspLedEnabled) { xpspLedAnimId = null; return; }
      try {
        if (!analyserNode && audio) initAudioContext();
        if (analyserNode && audioCtx && audioCtx.state === 'suspended') {
          try { audioCtx.resume(); } catch (e) {}
        }
      } catch (e) {}

      // Ajusta la altura de los haces para que lleguen justo debajo de la barra
      // de progreso, recalculando periódicamente para seguir al reproductor.
      // Solo tiene sentido mientras hay audio sonando (los haces están visibles).
      if (audio && !audio.paused && --xpspLedHeightFrame <= 0) {
        xpspLedHeightFrame = 15;
        const prog = document.querySelector('.progress-container');
        let h = 160;
        if (prog) {
          const rect = prog.getBoundingClientRect();
          h = Math.max(0, Math.floor(window.innerHeight - rect.top));
        }
        const els = xpspLedEls;
        const hn = els.length;
        for (let i = 0; i < hn; i++) els[i].style.height = h + 'px';
      }

      const els = xpspLedEls;
      const n = els.length;
      const strip = document.getElementById('xpsp-led-strip');
      // Animar con el audio si está sonando; si no, mantener apagados
      if (analyserNode && n > 0 && audio && !audio.paused) {
        try {
          const bin = analyserNode.frequencyBinCount;
          if (bin > 0) {
            if (!visBands || visBands.length !== bin) visBands = new Uint8Array(bin);
            analyserNode.getByteFrequencyData(visBands);
            // Energía de frecuencias bajas (bajo / ritmo): solo los primeros bins,
            // que es donde vive el bombo y el bajo real de la canción.
            // fftSize=256 -> cada bin ~172Hz; 10 bins cubren ~0-1.7kHz.
            const low = Math.min(10, bin);
            // Frecuencias medias: del final de los graves hasta ~40 bins (~0-7kHz),
            // donde están la voz, guitarras y melodía; colaboran en el brillo.
            const mid = Math.min(40, bin);
            const midBins = mid - low;
            // Un solo recorrido para sumar graves, medias y el espectro completo
            let sumLow = 0, sumMid = 0, sumAll = 0;
            for (let i = 0; i < bin; i++) {
              const v = visBands[i];
              sumAll += v;
              if (i < low) sumLow += v;
              else if (i < mid) sumMid += v;
            }
            const bassEnergy = low > 0 ? (sumLow / low) / 255 : 0;
            const midEnergy = midBins > 0 ? (sumMid / midBins) / 255 : 0;
            // Proporción de graves frente al espectro completo: hace que los LEDs
            // brillen según el contenido de bajos, no según el volumen total.
            const totalAvg = bin > 0 ? (sumAll / bin) / 255 || 0 : 0;
            const bassRatio = totalAvg > 0.03
              ? Math.min(1.6, bassEnergy / Math.max(0.04, totalAvg))
              : bassEnergy;

            xpspLedAvg = xpspLedAvg * 0.92 + bassRatio * 0.08;
            const diff = bassRatio - xpspLedAvg;
            // Sensibilidad por defecto Media; valores más altos = kick más agresivo
            const kSens = [2.6, 4.6, 7.0][xpspLedSens - 1] || 4.6;
            xpspLedPulse = xpspLedPulse * 0.80 + Math.max(0, diff) * kSens;

            const color = getXpspLedColor();
            // El pulso del kick domina (fluctúa con cada golpe); graves y medias
            // solo aportan una base tenue para que se nota el contraste.
            let level = xpspLedPulse * 1.7
              + bassEnergy * 0.18
              + midEnergy * 0.2;
            // Gate: apaga por completo en silencio
            if (totalAvg < 0.05) {
              level = 0;
            }
            // La sensibilidad actúa como "ganancia del ritmo": hace que los
            // golpes tenues se vean con más (Alta) o con menos (Baja) claridad.
            // Sin tocar nada, Media (factor 1) no cambia el resultado.
            const sensGain = [0.55, 0.8, 1.25, 1.7][xpspLedSens - 1] || 0.8;
            level = level * (sensGain) + xpspLedPulse * (0.5 * (sensGain - 1));
            level = Math.min(1, level);

            // Color del haz: base tenue pero con picos claros.
            const beamRgba = `rgba(${color.r},${color.g},${color.b},${0.16 + level * 0.74})`;
            for (let i = 0; i < n; i++) {
              els[i].classList.add('on');
            }
            // Blur/grosor/resplandor dinámicos: crecen con el pulso.
            if (strip) {
              const glowOn = level >= 0.1;
              strip.classList.toggle('on', glowOn);
              strip.style.setProperty('--xpsp-beam', beamRgba);
              strip.style.setProperty('--xpsp-blur', (2 + level * 12) + 'px');
              strip.style.setProperty('--xpsp-glow-b', (4 + level * 12) + 'px');
              strip.style.setProperty('--xpsp-glow-h', (2 + level * 7) + 'px');
              strip.style.setProperty('--xpsp-glow',
                glowOn ? `rgba(${color.r},${color.g},${color.b},${0.1 + level * 0.55})` : 'transparent');
            }
          }
        } catch (e) {}
      } else {
        if (strip) strip.classList.remove('on');
        for (let i = 0; i < n; i++) {
          els[i].classList.remove('on');
        }
      }
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


