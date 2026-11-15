/* Letras del origen de la pista, respaldo LRCLIB y traducción por bloques. */
    // ---- Letras (Lyrics) sincronizadas con LRCLIB ----
    const lrcLines = [];            // { time (s), text }
    let lrcLoadedTitle = '';
    let lrcInterval = null;
    let lastLrcIdx = -1;            // línea activa ya resaltada (evita trabajo redundante)
    let lyricsFollowEnabled = true; // resaltar/auto-scroll a la línea actual

    let lyricsLoadVersion = 0;
    let lyricsTranslationVersion = 0;
    const lyricsTranslationCache = new Map();

    function lyricsTrackKey(track) {
      return track ? JSON.stringify([embyConfig.serverType, embyConfig.host, embyConfig.userId,
        track.Id, track.Path, track.Name, track.Album, track.Artists]) : '';
    }

    // El plazo incluye la lectura del cuerpo, no solo la llegada de las cabeceras.
    async function lyricsRequest(url, format = 'json', options = {}, timeout = 6000) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      try {
        const response = await fetch(url, { ...options, signal: ctl.signal });
        if (!response.ok) throw new Error('Lyrics HTTP ' + response.status);
        return await response[format]();
      } finally { clearTimeout(timer); }
    }

    function normalizeStoredLyrics(data) {
      if (typeof data === 'string') return data.trim() && !/^\s*<(?:!doctype|html)\b/i.test(data) ? data : null;
      if (!data) return null;
      if (Array.isArray(data.Tracks)) {
        const main = data.Tracks.find(t => t.Type === 'Main') || data.Tracks[0];
        return normalizeStoredLyrics(main);
      }
      const lines = Array.isArray(data) ? data : data.Lyrics;
      if (Array.isArray(lines)) {
        const normalized = lines.filter(l => l && typeof l.Text === 'string').map(l => ({
          time: l.Start != null && Number.isFinite(Number(l.Start)) ? Number(l.Start) / 10000000 : null,
          text: l.Text
        }));
        return normalized.some(l => l.text.trim()) ? normalized : null;
      }
      return normalizeStoredLyrics(data.syncedLyrics || data.plainLyrics || data.Text);
    }

    async function storedLyrics(track, config) {
      const embedded = normalizeStoredLyrics(track.Lyrics || track.lyrics);
      if (embedded) return embedded;
      if (track.IsLocal || config.serverType === 'local') {
        for (const file of track._lyricsFiles || []) {
          try {
            const text = normalizeStoredLyrics(await file.text());
            if (text) return text;
          } catch (_) { /* Probar el siguiente archivo. */ }
        }
        if (track._file && window.jsmediatags && window.jsmediatags.BlobReader) {
          return new Promise(resolve => {
            const timer = setTimeout(() => resolve(null), 4000);
            const done = value => { clearTimeout(timer); resolve(value); };
            try {
              new window.jsmediatags.Reader().setReader(new window.jsmediatags.BlobReader(track._file)).read({
                onSuccess: tag => {
                  const tags = tag.tags || {};
                  const value = tags.USLT && tags.USLT.data;
                  done(normalizeStoredLyrics(tags.lyrics || (value && (value.lyrics || value.text))));
                },
                onError: () => done(null)
              });
            } catch (_) { done(null); }
          });
        }
        return null;
      }
      const host = config.host.replace(/\/$/, '');
      if (!host || !track.Id) return null;
      if (config.serverType === 'plex') {
        const token = encodeURIComponent(config.token);
        const text = await lyricsRequest(`${host}/library/metadata/${encodeURIComponent(track._plexKey || track.Id)}?X-Plex-Token=${token}`, 'text');
        let metadata;
        try { metadata = JSON.parse(text); } catch (_) { metadata = parsePlexResponse(text); }
        const item = metadata.MediaContainer?.Metadata?.[0];
        const streams = (item?.Media || []).flatMap(m => [...(m.Stream || []), ...(m.Part || []).flatMap(p => p.Stream || [])]);
        const candidates = streams.filter(s => String(s.streamType) === '4' && s.key)
          .sort((a, b) => Number(!!b.timed) - Number(!!a.timed));
        for (const stream of candidates) {
          // No enviar el token a URLs externas suministradas por un stream.
          const url = new URL(stream.key, host + '/');
          if (url.origin !== new URL(host).origin) continue;
          url.searchParams.set('X-Plex-Token', config.token);
          try {
            const result = normalizeStoredLyrics(await lyricsRequest(url.href, 'text'));
            if (result) return result;
          } catch (_) { /* Siguiente stream. */ }
        }
        return null;
      }
      const id = encodeURIComponent(track.Id);
      const paths = config.serverType === 'emby' ? [`/Items/${id}/Lyrics`, `/Audio/${id}/Lyrics`] : [`/Audio/${id}/Lyrics`];
      for (const path of paths) {
        try {
          const text = await lyricsRequest(`${host}${path}?api_key=${encodeURIComponent(config.token)}`, 'text', { headers: { 'X-Emby-Token': config.token } });
          let data;
          try { data = JSON.parse(text); } catch (_) { data = text; }
          const result = normalizeStoredLyrics(data);
          if (result) return result;
        } catch (_) { /* Versiones antiguas pueden no exponer letras. */ }
      }
      return null;
    }

    function toggleLyricsView() {
      const view = document.getElementById('view-lyrics');
      const open = !view.classList.contains('active');
      view.classList.toggle('active', open);
      // Los controles multimedia quedan visibles y clicables encima del popup
      const cw = document.querySelector('.controls-wrapper');
      if (cw) cw.classList.toggle('lyrics-open', open);
      if (open) {
        loadLyrics();
        if (!lrcInterval) {
          lrcInterval = setInterval(() => {
            if (document.getElementById('view-lyrics').classList.contains('active')) {
              // Si cambió la canción mientras el popup está abierto, recargar letras
              const track = playlist[currentTrackIndex];
              const currentKey = lyricsTrackKey(track);
              if (currentKey && currentKey !== lrcLoadedTitle) {
                loadLyrics();
                return;
              }
              updateLyricsHighlight();
            }
          }, 250);
        }
      } else {
        if (lrcInterval) { clearInterval(lrcInterval); lrcInterval = null; }
      }
    }

    function closeLyricsIfOpen() {
      const view = document.getElementById('view-lyrics');
      if (view && view.classList.contains('active')) toggleLyricsView();
    }

    function toggleLyricsFollow() {
      lyricsFollowEnabled = !lyricsFollowEnabled;
      const btn = document.getElementById('lyrics-follow-btn');
      if (btn) {
        btn.classList.toggle('on', lyricsFollowEnabled);
        btn.setAttribute('aria-pressed', lyricsFollowEnabled ? 'true' : 'false');
      }
      // Al reactivar, resaltar la línea actual de inmediato
      if (lyricsFollowEnabled) updateLyricsHighlight();
    }

    async function loadLyrics() {
      const body = document.getElementById('lyrics-body');
      const version = ++lyricsLoadVersion;
      ++lyricsTranslationVersion;
      lrcLines.length = 0;
      const selector = document.getElementById('lyrics-lang');
      if (selector) { selector.disabled = false; selector.value = ''; }
      const indicator = document.getElementById('lyrics-translating');
      if (indicator) indicator.style.display = 'none';
      body.innerHTML = '<div class="lyrics-loading">' + t('searchingLyrics') + '</div>';
      const track = playlist[currentTrackIndex];
      if (!track) {
        body.innerHTML = '<div class="lyrics-empty">' + t('noTrackPlaying') + '</div>';
        return;
      }
      const artist = (track.Artists && track.Artists.length) ? track.Artists.join(' ') : '';
      const title = track.Name || '';
      const album = track.Album || '';
      lrcLoadedTitle = lyricsTrackKey(track);
      const key = lrcLoadedTitle;
      const isCurrent = () => version === lyricsLoadVersion && lyricsTrackKey(playlist[currentTrackIndex]) === key;
      document.getElementById('lyrics-title').textContent = title ? title : 'Letras';
      const duration = Number(track.RunTimeTicks ? (track.RunTimeTicks / 10000000) : track.Duration || 0);

      // Busca la mejor coincidencia entre los resultados de LRCLIB priorizando
      // la duración más cercana a la de la canción local.  Esto evita que versiones
      // con duraciones muy diferentes (hi-res, remasters, directos) se emparejen
      // con la letra equivocada y provoquen desfase.
      function pickBestMatch(results, dur) {
        if (!Array.isArray(results)) return null;
        results = results.filter(r => r && (r.syncedLyrics || r.plainLyrics));
        if (!results.length) return null;
        if (!dur) return results[0];
        let best = null;
        let bestDiff = Infinity;
        for (const r of results) {
          if (r.instrumental) continue;
          const rd = Number(r.duration) || 0;
          const diff = rd ? Math.abs(rd - dur) : Infinity;
          if (diff < bestDiff) { bestDiff = diff; best = r; }
        }
        // Si todos son instrumentales o sin duración, tomar el primero
        return best || results[0];
      }

      try {
        let stored = null;
        try { stored = await storedLyrics(track, { ...embyConfig }); } catch (_) { /* Respaldo web. */ }
        if (!isCurrent()) return;
        if (stored) { displayLrc(stored, title); return; }
        // 1) Intento preciso: /api/get con album_name
        const params = new URLSearchParams();
        params.set('track_name', title);
        if (artist) params.set('artist_name', artist);
        if (album) params.set('album_name', album);
        if (duration) params.set('duration', duration.toFixed(2));
        const getUrl = `https://lrclib.net/api/get?${params}`;
        let match = null;
        try {
          const data = await lyricsRequest(getUrl);
          if (data) {
            if (data && (data.syncedLyrics || data.plainLyrics)) match = data;
          }
        } catch (_) { /* ignorar, continuar con search */ }

        // 2) Fallback: /api/search con mejor selección
        if (!match) {
          const searchParams = new URLSearchParams();
          searchParams.set('track_name', title);
          if (artist) searchParams.set('artist_name', artist);
          if (duration) searchParams.set('duration', duration.toFixed(2));
          const results = await lyricsRequest(`https://lrclib.net/api/search?${searchParams}`);
          match = pickBestMatch(results, duration);
        }

        if (!isCurrent()) return;
        if (match) {
          displayLrc(match.syncedLyrics || match.plainLyrics, title);
        } else {
          body.innerHTML = '<div class="lyrics-empty">' + t('noLyrics') + '</div>';
        }
      } catch (e) {
        if (!isCurrent()) return;
        body.innerHTML = '<div class="lyrics-error">' + t('lyricsError') + '</div>';
      }
    }

    function displayLrc(lrc, title) {
      const body = document.getElementById('lyrics-body');
      lrcLines.length = 0;
      const titleEl = document.getElementById('lyrics-title');
      titleEl.textContent = title;
      titleEl.removeAttribute('data-i18n'); // el título es dinámico, no se traduce
      // Reiniciar selector de idioma a "Original" al cambiar de canción
      const sel = document.getElementById('lyrics-lang');
      if (sel) sel.value = '';
      if (!lrc || !String(lrc).trim()) {
        body.innerHTML = '<div class="lyrics-empty">' + t('noSyncedLyrics') + '</div>';
        return;
      }
      if (Array.isArray(lrc)) {
        lrc.forEach(l => lrcLines.push({ time: l.time, text: l.text, _orig: l.text }));
      } else {
        const input = String(lrc);
        const offset = Number((input.match(/\[offset:([+-]?\d+)\]/i) || [])[1] || 0) / 1000;
        const plain = [];
        input.split(/\r?\n/).forEach(line => {
          const stamps = [...line.matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g)];
          const text = line.replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, '').trim();
          if (stamps.length) stamps.forEach(m => lrcLines.push({
            time: Math.max(0, Number(m[1]) * 60 + Number(m[2]) + Number('0.' + (m[3] || '0')) + offset),
            text, _orig: text
          }));
          else if (!/^\s*\[[a-z]+:/i.test(line)) plain.push({ time: null, text: line.trim(), _orig: line.trim() });
        });
        if (!lrcLines.length) lrcLines.push(...plain);
      }
      lrcLines.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
      renderLyricsBody();
      updateLyricsHighlight();
    }

    function renderLyricsBody() {
      lastLrcIdx = -1;
      const body = document.getElementById('lyrics-body');
      body.innerHTML = lrcLines
        .map((l, i) => `<div class="lyrics-line" id="lrc-line-${i}">${escapeHtml(l.text)}</div>`)
        .join('');
      updateLyricsHighlight();
    }

    const MYMEMORY_EMAIL = 'walkman.myanri@gmail.com';

    async function translateWithGoogle(text, src, target) {
      const tl = target === 'zh' ? 'zh-CN' : target;
      const data = await lyricsRequest(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(src)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`);
      const translated = data?.[0]?.map(part => part && part[0]).filter(Boolean).join('');
      if (!translated) throw new Error('Empty translation');
      return { text: translated, source: data[2] || src };
    }

    async function translateLyrics(lang) {
      if (!lrcLines.length) return;
      const version = ++lyricsTranslationVersion;
      const key = lrcLoadedTitle;
      const isCurrent = () => version === lyricsTranslationVersion && key === lrcLoadedTitle
        && key === lyricsTrackKey(playlist[currentTrackIndex]);
      const sel = document.getElementById('lyrics-lang');
      const ind = document.getElementById('lyrics-translating');
      const original = lrcLines.map(l => l._orig ?? l.text);
      if (!lang) {
        lrcLines.forEach((l, i) => { l.text = original[i]; });
        if (ind) ind.style.display = 'none';
        renderLyricsBody();
        return;
      }
      if (ind) ind.style.display = 'flex';
      // Solo detectar con MyMemory si Google falla; una detección compartida por canción.
      let fallbackSource;
      const detectFallback = () => fallbackSource ||= (async () => {
        const probe = original.filter(Boolean).join(' ').slice(0, 100);
        const candidates = ['en', 'es', 'de', 'fr', 'it', 'pt'].filter(c => c !== lang);
        const scores = await Promise.all(candidates.map(async source => {
          try {
            const data = await lyricsRequest(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(probe)}&langpair=${source}|${encodeURIComponent(lang)}&de=${encodeURIComponent(MYMEMORY_EMAIL)}`);
            return { source, score: Number(data.responseStatus) === 200 ? Number(data.matches?.[0]?.match || data.responseData?.match || 0) : 0 };
          } catch (_) { return { source, score: 0 }; }
        }));
        scores.sort((a, b) => b.score - a.score);
        return scores[0]?.score > 0 ? scores[0].source : null;
      })();
      const cacheKey = JSON.stringify([lang, original]);
      try {
        let results = lyricsTranslationCache.get(cacheKey);
        if (!results) {
          const unique = [...new Set(original.filter(l => l.trim()))];
          const translated = new Map();
          const batches = [];
          let batch = [];
          for (const line of unique) {
            if (batch.length && [...batch, line].join('\n').length > 1400) {
              batches.push(batch); batch = [];
            }
            batch.push(line);
          }
          if (batch.length) batches.push(batch);
          let cursor = 0, quotaHit = false, complete = true;
          async function worker() {
            while (cursor < batches.length && isCurrent()) {
              const lines = batches[cursor++];
              let source = 'auto';
              let googleUnavailable = false;
              try {
                const result = await translateWithGoogle(lines.join('\n'), 'auto', lang);
                source = result.source;
                const split = result.text.trim().split(/\r?\n/);
                if (split.length === lines.length && split.every(l => l.trim())) {
                  lines.forEach((l, i) => translated.set(l, split[i]));
                  continue;
                }
              } catch (_) { googleUnavailable = true; }
              let lineCursor = 0;
              const lineWorker = async () => {
                while (lineCursor < lines.length) {
                  const line = lines[lineCursor++];
                  if (!isCurrent()) return;
                  try {
                    if (googleUnavailable) throw new Error('Google unavailable');
                    const result = await translateWithGoogle(line, 'auto', lang);
                    translated.set(line, result.text);
                    continue;
                  } catch (_) { /* MyMemory requiere un idioma de origen concreto. */ }
                  try {
                    if (source === 'auto') source = await detectFallback();
                    if (!source || quotaHit || new TextEncoder().encode(line).length > 480) throw new Error('No fallback');
                    const data = await lyricsRequest(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(line)}&langpair=${encodeURIComponent(source)}|${encodeURIComponent(lang)}&de=${encodeURIComponent(MYMEMORY_EMAIL)}`);
                    if (data.quotaFinished) quotaHit = true;
                    if (Number(data.responseStatus) !== 200 || !data.responseData?.translatedText || quotaHit) throw new Error('Translation unavailable');
                    translated.set(line, data.responseData.translatedText);
                  } catch (_) { complete = false; }
                }
              };
              await Promise.all(Array.from({ length: Math.min(2, lines.length) }, lineWorker));
            }
          }
          await Promise.all(Array.from({ length: Math.min(3, batches.length) }, worker));
          if (!isCurrent()) return;
          results = original.map(line => translated.get(line) || line);
          if (complete) {
            if (lyricsTranslationCache.size >= 30) lyricsTranslationCache.delete(lyricsTranslationCache.keys().next().value);
            lyricsTranslationCache.set(cacheKey, results);
          }
          if (quotaHit) showToast(t('quotaExceeded'));
        }
        if (!isCurrent()) return;
        lrcLines.forEach((l, i) => { l.text = results[i]; });
        renderLyricsBody();
      } finally {
        if (isCurrent()) {
          if (sel) sel.disabled = false;
          if (ind) ind.style.display = 'none';
        }
      }
    }

    function updateLyricsHighlight() {
      if (!lrcLines.length) return;
      if (!lyricsFollowEnabled) {
        // Seguimiento desactivado: no resaltar ni hacer auto-scroll
        if (lastLrcIdx !== -1) {
          lastLrcIdx = -1;
          const prev = document.querySelector('.lyrics-line.active');
          if (prev) prev.classList.remove('active');
        }
        return;
      }
      const t = audio.currentTime;
      let idx = -1;
      for (let i = lrcLines.length - 1; i >= 0; i--) {
        if (lrcLines[i].time !== null && t >= lrcLines[i].time) { idx = i; break; }
      }
      // Si la línea activa no ha cambiado, no hay nada que resaltar ni scrollear
      if (idx === lastLrcIdx) return;
      lastLrcIdx = idx;
      const prev = document.querySelector('.lyrics-line.active');
      if (prev) prev.classList.remove('active');
      if (idx >= 0) {
        const el = document.getElementById('lrc-line-' + idx);
        if (el) {
          el.classList.add('active');
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }

