/* Letras sincronizadas (LRCLIB) y traducción (MyMemory). */
    // ---- Letras (Lyrics) sincronizadas con LRCLIB ----
    const lrcLines = [];            // { time (s), text }
    let lrcLoadedTitle = '';
    let lrcInterval = null;
    let lastLrcIdx = -1;            // línea activa ya resaltada (evita trabajo redundante)
    let lyricsFollowEnabled = true; // resaltar/auto-scroll a la línea actual

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
              const currentKey = track
                ? (track.Name || '') + '|' + ((track.Artists && track.Artists.length) ? track.Artists.join(' ') : '')
                : '';
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
      body.innerHTML = '<div class="lyrics-loading">' + t('searchingLyrics') + '</div>';
      const track = playlist[currentTrackIndex];
      if (!track) {
        body.innerHTML = '<div class="lyrics-empty">' + t('noTrackPlaying') + '</div>';
        return;
      }
      const artist = (track.Artists && track.Artists.length) ? track.Artists.join(' ') : '';
      const title = track.Name || '';
      const album = track.Album || '';
      lrcLoadedTitle = title + '|' + artist;
      document.getElementById('lyrics-title').textContent = title ? title : 'Letras';
      const duration = Number(track.RunTimeTicks ? (track.RunTimeTicks / 10000000) : 0);

      // Busca la mejor coincidencia entre los resultados de LRCLIB priorizando
      // la duración más cercana a la de la canción local.  Esto evita que versiones
      // con duraciones muy diferentes (hi-res, remasters, directos) se emparejen
      // con la letra equivocada y provoquen desfase.
      function pickBestMatch(results, dur) {
        if (!Array.isArray(results) || !results.length) return null;
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
        // 1) Intento preciso: /api/get con album_name
        const params = new URLSearchParams();
        params.set('track_name', title);
        if (artist) params.set('artist_name', artist);
        if (album) params.set('album_name', album);
        if (duration) params.set('duration', duration.toFixed(2));
        const getUrl = `https://lrclib.net/api/get?${params}`;
        let match = null;
        try {
          const resGet = await fetchWithRetry(getUrl, {}, 2);
          if (resGet.ok) {
            const data = await resGet.json();
            if (data && (data.syncedLyrics || data.plainLyrics)) match = data;
          }
        } catch (_) { /* ignorar, continuar con search */ }

        // 2) Fallback: /api/search con mejor selección
        if (!match) {
          const searchParams = new URLSearchParams();
          searchParams.set('track_name', title);
          if (artist) searchParams.set('artist_name', artist);
          if (duration) searchParams.set('duration', duration.toFixed(2));
          const res = await fetchWithRetry(
            `https://lrclib.net/api/search?${searchParams}`, {}, 2);
          if (!res.ok) throw new Error('http');
          const results = await res.json();
          match = pickBestMatch(results, duration);
        }

        if (match) {
          displayLrc(match.syncedLyrics || match.plainLyrics, title);
        } else {
          body.innerHTML = '<div class="lyrics-empty">' + t('noLyrics') + '</div>';
        }
      } catch (e) {
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
      const lineRe = /\[(\d+):(\d+)(?:[.:](\d+))?\](.*)/;
      String(lrc).split(/\r?\n/).forEach(line => {
        const m = line.match(lineRe);
        if (m) {
          const t = parseInt(m[1]) * 60 + parseInt(m[2]) + (m[3] ? parseInt(m[3]) / 100 : 0);
          const text = m[4].trim();
          lrcLines.push({ time: t, text, _orig: text });
        }
      });
      lrcLines.sort((a, b) => a.time - b.time);
      if (!lrcLines.length) {
        body.innerHTML = '<div class="lyrics-empty">' + t('noSyncedFound') + '</div>';
        return;
      }
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

    // Detecta el idioma de origen de las letras (Google, gratuito y con CORS).
    // MyMemory requiere "de" (email) para levantar el límite diario por IP;
    // sin él la cuota anónima se agota pronto y devuelve 429. Cámbialo por tu email real.
    const MYMEMORY_EMAIL = 'walkman.myanri@gmail.com';

    function detectSourceLang(probe) {
      return fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=` +
        encodeURIComponent(probe))
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d && Array.isArray(d) && d[2]) return String(d[2]).substring(0, 2).toUpperCase();
          return null;
        })
        .catch(() => null);
    }

    // Traduce una línea con Google Translate (endpoint gtx, sin API key).
    // Devuelve el texto o lanza si no se puede (bloqueado/error).
    function translateWithGoogle(text, src, target) {
      const tl = target === 'zh' ? 'zh-CN' : target;
      return fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(src)}&tl=${encodeURIComponent(tl)}&dt=t&q=` +
        encodeURIComponent(text))
        .then(r => { if (!r.ok) throw new Error('http'); return r.json(); })
        .then(d => {
          if (Array.isArray(d) && Array.isArray(d[0]) && d[0].length) {
            const parts = d[0].map(x => x && x[0]).filter(x => x);
            if (parts.length) return parts.join('');
          }
          throw new Error('bad');
        });
    }

    // Si la detección externa (Google) no responde, probamos fuentes candidatas
    // vía MyMemory y nos quedamos con la de mayor confianza (matches[0].match).
    async function detectSourceLangFallback(probe, target) {
      const candidates = ['es', 'en', 'de', 'fr', 'it', 'pt'];
      const q = String(probe).slice(0, 120);
      let best = 'en';
      let bestScore = 0;
      const settled = await Promise.allSettled(candidates.filter(c => c !== target).map(async (c) => {
        try {
          const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${c}|${target || 'en'}&de=${encodeURIComponent(MYMEMORY_EMAIL)}`);
          if (!r.ok) throw new Error('http');
          const d = await r.json();
          if (!d || Number(d.responseStatus) !== 200) return { c, score: 0 };
          const score = (d.matches && d.matches[0] && Number(d.matches[0].match)) || (d.responseData && Number(d.responseData.match)) || 0;
          return { c, score };
        } catch (e) { return { c, score: 0 }; }
      }));
      settled.forEach(x => {
        if (x.status === 'fulfilled' && x.value.score > bestScore) { bestScore = x.value.score; best = x.value.c; }
      });
      return best;
    }

    // Traduce las letras al idioma seleccionado. MyMemory limita cada query a
    // 500 caracteres, así que se traduce línea a línea (cada una corta) con
    // varios workers en paralelo. "Original" restaura el texto fuente.
    async function translateLyrics(lang) {
      const sel = document.getElementById('lyrics-lang');
      if (!lrcLines.length) return;
      sel.disabled = true;
      const ind = document.getElementById('lyrics-translating');
      if (ind) ind.style.display = 'flex';
      try {
        if (!lang) {
          // Volver al idioma original
          lrcLines.forEach(l => { l.text = l._orig || l.text; });
          renderLyricsBody();
          return;
        }
        const original = lrcLines.map(l => l._orig || l.text);
        const detTitle = document.getElementById('lyrics-title').textContent;
        const probe = original.filter(x => x).slice(0, 15).join(' ') || detTitle || 'music';
        let src = await detectSourceLang(probe);
        if (!src) src = await detectSourceLangFallback(probe, lang);

        const results = new Array(original.length);
        let cursor = 0;
        let quotaHit = false;
        const concurrency = 4;

        const fetchTx = (url, ms) => {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), ms);
          return fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(timer));
        };

        const worker = async () => {
          while (cursor < original.length && !quotaHit) {
            const idx = cursor++;
            let line = original[idx];
            try { while (new TextEncoder().encode(line).length > 480) line = line.slice(0, -1); } catch (e) {}
            if (!line.trim()) { results[idx] = original[idx]; continue; }
            let tr = null;
            try {
              tr = await translateWithGoogle(line, src, lang);
            } catch (e) { tr = null; }
            if (tr) { results[idx] = tr; continue; }
            try {
              const r = await fetchTx(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(line)}` +
                `&langpair=${src}|${encodeURIComponent(lang)}&de=${encodeURIComponent(MYMEMORY_EMAIL)}`, 12000);
              if (!r.ok) throw new Error('http');
              const d = await r.json();
              if (d && d.quotaFinished) {
                quotaHit = true;
                results[idx] = original[idx];
              } else if (d && Number(d.responseStatus) === 200 && d.responseData && d.responseData.translatedText && d.responseData.translatedText.trim()) {
                results[idx] = d.responseData.translatedText;
              } else {
                results[idx] = original[idx];
              }
            } catch (e) {
              results[idx] = original[idx];
            }
          }
        };
        await Promise.all(Array.from({ length: concurrency }, worker));

        lrcLines.forEach((l, i) => { if (results[i]) l.text = results[i]; });
        renderLyricsBody();
        if (quotaHit) showToast(t('quotaExceeded'));
      } catch (e) {
        // Mantener texto actual si falla la traducción
      } finally {
        sel.disabled = false;
        if (ind) ind.style.display = 'none';
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
        if (t >= lrcLines[i].time) { idx = i; break; }
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

