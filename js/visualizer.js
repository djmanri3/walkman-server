/* Visualizador: canvas con estilos de visualización basados en el análisis de audio. */
    // --- VISUALIZADOR DE PARTICULAS Y ANILLOS ESTILO XPERIA ---
    let visAnimationId = null;
    let visParticles = [];
    let visStyle = 'rings';
    try {
      let savedStyle = loadLS('walkman_vis_style');
      if (savedStyle) {
        if (savedStyle === 'fire') savedStyle = 'ps3';
        if (savedStyle === 'circular') savedStyle = 'cosmic';
        if (savedStyle === 'bubble') savedStyle = 'particles';
        visStyle = savedStyle;
      }
    } catch (e) {}
    let visAlbumColor = { r: 70, g: 80, b: 255 };
    let visStyleMenuOpen = false;
    const canvas = document.getElementById('visualizer-canvas');
    const ctx = canvas.getContext('2d');

    function toggleVisStyleMenu() {
      visStyleMenuOpen = !visStyleMenuOpen;
      document.getElementById('vis-style-menu').classList.toggle('open', visStyleMenuOpen);
    }

    function setVisStyle(style) {
      visStyle = style;
      visStyleMenuOpen = false;
      document.getElementById('vis-style-menu').classList.remove('open');
      document.querySelectorAll('#vis-style-menu .vis-style-option').forEach(o => {
        o.classList.toggle('active', o.dataset.vis === style);
      });
      saveLS('walkman_vis_style', style);
    }

    // Array conveniente de pares (frecuencia media, valor 0-1)
    let visBands = new Uint8Array(0);
    // Buffer reutilizable normalizado (evita asignar un array nuevo cada frame)
    let visBinsNorm = new Float32Array(0);
    // Caché del color de acento (getComputedStyle es caro; se refresca cada 500ms)
    let visAccentCache = '';
    let visAccentCacheTime = 0;

    // Buffers reutilizables para el shader del Cosmic Flow (render a baja resolución)
    let cosmicCanvas = null;
    let cosmicCtx = null;
    let cosmicImg = null;
    let cosmicW = 0;
    let cosmicH = 0;
    let cosmicBoost = 0.6;

    // Partículas del color del álbum (visualizador "Partículas del álbum")
    let albumParticles = [];
    let albumParticleW = 0;
    let albumParticleH = 0;

    // Estrellas de fondo para el visualizador de "Bloques rítmicos"
    let spaceStars = [];
    let spaceStarW = 0;
    let spaceStarH = 0;

    // Picos por columna de los Bloques rítmicos (efecto peak-hold + decaimiento)
    let blockPeaks = [];
    let blockPeakCount = 0;

    function initBlockPeaks(count) {
      blockPeakCount = count;
      blockPeaks = new Float32Array(count);
    }

    function initSpaceStars() {
      spaceStarW = canvas.width;
      spaceStarH = canvas.height;
      spaceStars = [];
      const count = 160;
      for (let i = 0; i < count; i++) {
        spaceStars.push({
          x: Math.random(),
          y: Math.random(),
          r: Math.random() * 1.6 + 0.3,
          tw: Math.random() * Math.PI * 2,
          ts: 0.5 + Math.random() * 1.5
        });
      }
    }

    function initAlbumParticles() {
      const w = canvas.width;
      const h = canvas.height;
      albumParticleW = w;
      albumParticleH = h;
      albumParticles = [];
      const count = 90;
      for (let i = 0; i < count; i++) {
        albumParticles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          r: Math.random() * 4 + 1.2,
          phase: Math.random() * Math.PI * 2,
          speed: 0.5 + Math.random() * 1.2
        });
      }
    }

    function getVisData() {
      if (!analyserNode) {
        // Sin AudioContext (p. ej. iOS con procesado Web Audio desactivado):
        // Si el audio está en pausa o no hay canción, devolvemos silencio real.
        // Si está reproduciendo, generamos una onda suave basada en el tiempo
        // de reproducción para que el visualizador no se quede en negro.
        const n = 64;
        if (visBands.length !== n) {
          visBands = new Uint8Array(n);
          visBinsNorm = new Float32Array(n);
        }
        const now = audio && !audio.paused && audio.src ? performance.now() : 0;
        if (!now) {
          for (let i = 0; i < n; i++) { visBands[i] = 0; visBinsNorm[i] = 0; }
          return { bins: visBinsNorm, avg: 0, n };
        }
        const base = (Math.sin(now / 300) * 0.5 + 0.5) * 0.25 + 0.15;
        for (let i = 0; i < n; i++) {
          const wave = (Math.sin(now / 120 + i * 0.6) * 0.5 + 0.5) * 0.2;
          const v = (base + wave) * 255;
          visBands[i] = Math.min(255, Math.max(0, v));
          visBinsNorm[i] = visBands[i] / 255;
        }
        return { bins: visBinsNorm, avg: base + 0.1, n };
      }
      const n = analyserNode.frequencyBinCount;
      if (visBands.length !== n) {
        visBands = new Uint8Array(n);
        visBinsNorm = new Float32Array(n);
      }
      analyserNode.getByteFrequencyData(visBands);
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += visBands[i];
        visBinsNorm[i] = visBands[i] / 255;
      }
      const avg = (sum / n) / 255;
      return { bins: visBinsNorm, avg, n };
    }

    function initParticles() {
      visParticles = [];
      const particleCount = 60;
      for (let i = 0; i < particleCount; i++) {
        visParticles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 8 + 2,
          color: Math.random() > 0.5 ? 'rgba(210, 150, 255, ' : 'rgba(120, 200, 255, ',
          alpha: Math.random() * 0.5 + 0.1,
          speedX: (Math.random() - 0.5) * 0.8,
          speedY: (Math.random() - 0.5) * 0.8
        });
      }
    }

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    }
    // Debounced resize: evita recomputar partículas a cada evento de resize
    let resizeCanvasTimer = null;
    window.addEventListener('resize', () => {
      if (!document.getElementById('visualizer-overlay').classList.contains('open')) return;
      clearTimeout(resizeCanvasTimer);
      resizeCanvasTimer = setTimeout(resizeCanvas, 120);
    });

    function renderVisualizer() {
      if (!document.getElementById('visualizer-overlay').classList.contains('open')) return;

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const vis = getVisData();
      const audioIntensity = vis ? vis.avg : 0.2;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2 - 40;
      const now = performance.now();
      if (now - visAccentCacheTime > 500) {
        visAccentCache = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#aa00ff';
        visAccentCacheTime = now;
      }
      const accent = visAccentCache;

      if (visStyle === 'rings') {
        drawVisRings(centerX, centerY, audioIntensity, accent);
      } else if (visStyle === 'bars') {
        drawVisBars(vis, accent);
      } else if (visStyle === 'wave') {
        drawVisWave(vis, accent);
      } else if (visStyle === 'ps3') {
        drawVisPs3(vis);
      } else if (visStyle === 'cosmic') {
        drawVisCosmicFlow(vis);
      } else if (visStyle === 'particles') {
        drawVisAlbumParticles(vis);
      } else if (visStyle === 'blocks') {
        drawVisBlocks(vis);
      }

      // Partículas de fondo (puntitos rosas y azules) solo en "Anillos Pulsantes"
      if (visStyle === 'rings') {
        visParticles.forEach(p => {
          p.x += p.speedX * (1 + audioIntensity * 2);
          p.y += p.speedY * (1 + audioIntensity * 2);
          if (p.x < 0) p.x = canvas.width;
          if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height;
          if (p.y > canvas.height) p.y = 0;
          ctx.beginPath();
          const currentRadius = p.radius * (1 + audioIntensity * 0.8);
          ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
          ctx.fillStyle = p.color + (p.alpha + audioIntensity * 0.3) + ')';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#fff';
          ctx.fill();
          ctx.shadowBlur = 0;
        });
      }

      visAnimationId = requestAnimationFrame(renderVisualizer);
    }

    function drawVisRings(centerX, centerY, audioIntensity, accent) {
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        const r = (60 * i) + (audioIntensity * 40 * i);
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.globalAlpha = 0.35 / i + audioIntensity * 0.2;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    function drawVisBars(vis, accent) {
      if (!vis) return;
      const w = canvas.width;
      const h = canvas.height;
      const barCount = 64;
      const barWidth = (w - 40) / barCount;
      const gap = 2;
      const maxBarH = h * 0.6;
      for (let i = 0; i < barCount; i++) {
        const bin = Math.min(vis.n - 1, Math.floor((i / barCount) * vis.n * 0.8) + 2);
        const v = Math.pow(vis.bins[bin], 1.3);
        const barH = Math.max(2, v * maxBarH);
        const x = 20 + i * barWidth;
        const hue = 260 - (i / barCount) * 120;
        const grad = ctx.createLinearGradient(0, h - barH, 0, h);
        grad.addColorStop(0, `hsla(${hue}, 90%, 65%, 1)`);
        grad.addColorStop(1, `hsla(${hue}, 90%, 35%, 0.2)`);
        ctx.fillStyle = grad;
        roundRect(x, h - barH, barWidth - gap, barH, 4);
        ctx.fill();
      }
    }

    function drawVisWave(vis, accent) {
      if (!vis) return;
      const w = canvas.width;
      const h = canvas.height;
      const steps = 128;
      ctx.lineWidth = 3;
      const n = vis.n;
      // Onda superior
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const bin = Math.min(n - 1, Math.floor((i / steps) * n * 0.9));
        const x = (i / steps) * w;
        const y = h / 2 - vis.bins[bin] * (h * 0.42) * Math.abs(Math.sin(Math.PI * i / steps));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = accent;
      ctx.shadowBlur = 18;
      ctx.shadowColor = accent;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Onda inferior invertida
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const bin = Math.min(n - 1, Math.floor((i / steps) * n * 0.9));
        const x = (i / steps) * w;
        const y = h / 2 + vis.bins[bin] * (h * 0.42) * Math.abs(Math.sin(Math.PI * i / steps));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.stroke();
    }

    function drawVisPs3(vis) {
      const w = canvas.width;
      const h = canvas.height;
      const c = visAlbumColor || { r: 70, g: 80, b: 255 };
      const now = performance.now() / 1000;
      const avg = vis ? vis.avg : 0.2;

      // Fondo: degradado radial centrado con el color del álbum
      const bgGrad = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, Math.max(w, h) * 0.7);
      bgGrad.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, 0.6)`);
      bgGrad.addColorStop(0.5, `rgba(${Math.floor(c.r * 0.55)}, ${Math.floor(c.g * 0.55)}, ${Math.floor(c.b * 0.55)}, 0.4)`);
      bgGrad.addColorStop(1, 'rgba(5, 5, 10, 1)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Olas estilo XMB (ReverseArch/RetroArch): bandas finas de luz centradas
      // verticalmente en la pantalla, simétricas arriba y abajo, con pocas capas.
      const center = h * 0.5;
      const spread = Math.min(w, h) * 0.16;
      const layers = [
        { offset: spread * 0.7, amp: 12 + avg * 16, freq: 0.004, speed: 1.2, alpha: 0.7, dir: 1 },
        { offset: spread * 1.35, amp: 18 + avg * 22, freq: 0.003, speed: 0.8, alpha: 0.5, dir: 1 }
      ];

      layers.forEach((L, li) => {
        const step = 3;
        const ptsTop = [];
        const ptsBot = [];
        for (let x = 0; x <= w; x += step) {
          const t = now * L.speed + li * 1.3;
          // Curva suave de la ola, fluyendo horizontalmente por la pantalla
          const wave = Math.sin(x * L.freq + t) * L.amp
            + Math.sin(x * 0.008 + t * 0.6 + 1.3) * (L.amp * 0.4);
          // Pequeña reacción al audio (banda media)
          let audioNudge = 0;
          if (vis) {
            const bin = Math.min(vis.n - 1, Math.floor((x / w) * vis.n * 0.7));
            audioNudge = vis.bins[bin] * 14 * Math.abs(Math.sin(x * 0.002 + now));
          }
          const baseTop = center - L.offset + wave - audioNudge;
          const baseBot = center + L.offset - wave + audioNudge;
          ptsTop.push(x, baseTop);
          ptsBot.push(x, baseBot);
        }

        L.alpha = 0.7 - li * 0.2;

        // Sombra difuminada bajo cada cresta para el efecto 3D suave
        ctx.beginPath();
        ctx.moveTo(0, center);
        for (let i = 0; i < ptsTop.length; i += 2) ctx.lineTo(ptsTop[i], ptsTop[i + 1]);
        ctx.lineTo(w, center);
        ctx.closePath();
        let grad = ctx.createLinearGradient(0, center - L.offset - L.amp * 3, 0, center);
        grad.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${L.alpha + 0.1})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, center);
        for (let i = 0; i < ptsBot.length; i += 2) ctx.lineTo(ptsBot[i], ptsBot[i + 1]);
        ctx.lineTo(w, center);
        ctx.closePath();
        grad = ctx.createLinearGradient(0, center, 0, center + L.offset + L.amp * 3);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, ${L.alpha + 0.1})`);
        ctx.fillStyle = grad;
        ctx.fill();

        // Cresta brillante
        ctx.beginPath();
        ctx.moveTo(ptsTop[0], ptsTop[1]);
        for (let i = 2; i < ptsTop.length; i += 2) ctx.lineTo(ptsTop[i], ptsTop[i + 1]);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 + avg * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 16;
        ctx.shadowColor = `rgba(${c.r}, ${c.g}, ${c.b}, 0.9)`;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(ptsBot[0], ptsBot[1]);
        for (let i = 2; i < ptsBot.length; i += 2) ctx.lineTo(ptsBot[i], ptsBot[i + 1]);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 + avg * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 16;
        ctx.shadowColor = `rgba(${c.r}, ${c.g}, ${c.b}, 0.9)`;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
    }

    function drawVisCosmicFlow(vis) {
      const w = canvas.width;
      const h = canvas.height;
      const c = visAlbumColor || { r: 70, g: 80, b: 255 };

      // Resolución de render (se mantiene baja y estable para un flujo fluido)
      const scale = 0.22;
      const RW = Math.max(2, Math.floor(w * scale));
      const RH = Math.max(2, Math.floor(h * scale));

      if (!cosmicCanvas || cosmicW !== RW || cosmicH !== RH) {
        cosmicCanvas = document.createElement('canvas');
        cosmicW = RW;
        cosmicH = RH;
        cosmicCanvas.width = RW;
        cosmicCanvas.height = RH;
        cosmicCtx = cosmicCanvas.getContext('2d', { willReadFrequently: true });
        cosmicImg = cosmicCtx.createImageData(RW, RH);
      }

      const data = cosmicImg.data;

      // Velocidad del tiempo suavizada (media móvil) para un movimiento fluido
      const targetBoost = vis ? (0.6 + vis.avg * 1.0) : 0.6;
      cosmicBoost = cosmicBoost * 0.85 + targetBoost * 0.15;
      const t = (performance.now() / 1000) * 0.4 * cosmicBoost;

      // Colores base (normalizados 0-1)
      const gr = c.r / 255, gg = c.g / 255, gb = c.b / 255;
      const wBr = Math.min(1, gr * 1.4), wBg = Math.min(1, gg * 1.4), wBb = Math.min(1, gb * 1.4);

      const px_s = 1.0 / h;
      const aspect = w / h;

      // Colores de onda por capa (solo dependen de t y la capa)
      const layR = new Float32Array(5), layG = new Float32Array(5), layB = new Float32Array(5);
      for (let i = 1; i <= 4; i++) {
        const mixf = Math.sin(i + t * 0.5) * 0.5 + 0.5;
        const inv = 1 / i;
        layR[i] = (gr + (wBr - gr) * mixf) * inv;
        layG[i] = (gg + (wBg - gg) * mixf) * inv;
        layB[i] = (gb + (wBb - gb) * mixf) * inv;
      }

      // Precalcular uvx y valores de onda por columna (solo dependen de x)
      const uvx = new Float32Array(RW);
      const waveY = new Float32Array(RW * 5);
      for (let px = 0; px < RW; px++) {
        const sx = (px + 0.5) / RW;
        uvx[px] = (sx - 0.5) * aspect;
        for (let i = 1; i <= 4; i++) {
          waveY[px * 5 + i] = Math.sin(uvx[px] * 5.5 + t * i * 0.4 + i) * 0.15
                            + Math.cos(uvx[px] * 3.8 - t * 0.3 + i * 2.0) * 0.1;
        }
      }

      for (let py = 0; py < RH; py++) {
        const sy = (py + 0.5) / RH;
        const uvy = sy - 0.5;
        const rowBase = py * RW * 4;

        for (let px = 0; px < RW; px++) {
          const uvx_ = uvx[px];
          const uvLen = Math.sqrt(uvx_ * uvx_ + uvy * uvy);
          const glow = smoothstep01(1.0, 0.0, uvLen);

          let r = gr * glow, g = gg * glow, b = gb * glow;

          for (let i = 1; i <= 4; i++) {
            const diff = uvy - waveY[px * 5 + i];
            let d2 = diff < 0 ? -diff : diff;

            const core = 0.0012 / (d2 + 0.0018 + px_s * 0.5);

            const downwardDist = -diff > 0 ? -diff : 0.0;
            let silkBody = smoothstep01(0.2, 0.0, downwardDist) * smoothstep01(px_s, -px_s, diff);

            const silkTexture = Math.sin(uvx_ * 12.0 + diff * 25.0 - t * 1.5) * 0.5 + 0.5;
            silkBody *= (0.4 + 0.6 * silkTexture);

            const amt = core * 0.85 + silkBody * 0.3;
            r += layR[i] * amt;
            g += layG[i] * amt;
            b += layB[i] * amt;
          }

          const pos = rowBase + px * 4;
          data[pos] = r * 255 > 255 ? 255 : r * 255;
          data[pos + 1] = g * 255 > 255 ? 255 : g * 255;
          data[pos + 2] = b * 255 > 255 ? 255 : b * 255;
          data[pos + 3] = 255;
        }
      }

      cosmicCtx.putImageData(cosmicImg, 0, 0);
      // Blur suave al escalar para eliminar los dientes de sierra del render a baja resolución
      ctx.imageSmoothingEnabled = true;
      ctx.filter = 'blur(1.5px)';
      ctx.drawImage(cosmicCanvas, 0, 0, w, h);
      ctx.filter = 'none';
    }

    function smoothstep01(edge0, edge1, x) {
      const t = (x - edge0) / (edge1 - edge0);
      const c = Math.max(0, Math.min(1, t));
      return c * c * (3 - 2 * c);
    }

    function drawVisAlbumParticles(vis) {
      const w = canvas.width;
      const h = canvas.height;
      const c = visAlbumColor || { r: 70, g: 80, b: 255 };
      const now = performance.now() / 1000;
      const avg = vis ? vis.avg : 0.2;

      // Re-crear las partículas si cambió el tamaño del canvas
      if (albumParticleW !== w || albumParticleH !== h || albumParticles.length === 0) {
        initAlbumParticles();
      }

      // Fondo oscuro con un resplandor del color del álbum
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      bgGrad.addColorStop(0, `rgba(${Math.floor(c.r * 0.35)}, ${Math.floor(c.g * 0.35)}, ${Math.floor(c.b * 0.35)}, 0.4)`);
      bgGrad.addColorStop(1, 'rgba(5, 5, 12, 1)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Tono dominante y variaciones del color del álbum
      const baseHue = colorToHue(c);

      albumParticles.forEach(p => {
        // Movimiento + reacción al audio
        p.x += p.vx * (1 + avg * 2.5);
        p.y += p.vy * (1 + avg * 2.5);

        // Suave balanceo con el tiempo
        p.vy += Math.sin(now * p.speed + p.phase) * 0.01 * (1 + avg * 2);

        // Rebote en los bordes
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        // Tamaño pulsante según el audio
        const r = p.r * (1 + avg * 1.4 + Math.sin(now * 3 + p.phase) * 0.2);
        const alpha = 0.35 + avg * 0.5 + (p.phase % 1) * 0.2;

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        // Color del álbum con pequeña variación de brillo
        const hue = baseHue + (p.phase % 1) * 30 - 15;
        ctx.fillStyle = `hsla(${hue}, 70%, ${55 + avg * 15}%, ${Math.min(1, alpha)})`;
        ctx.shadowBlur = 12;
        ctx.shadowColor = `rgba(${c.r}, ${c.g}, ${c.b}, 0.9)`;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    }

    // Convierte un color RGB (0-255) a matiz HSL (0-360)
    function colorToHue(color) {
      const r = color.r / 255, g = color.g / 255, b = color.b / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const d = max - min;
      if (d === 0) return 0;
      let h;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
      return h;
    }

    function drawVisBlocks(vis) {
      const w = canvas.width;
      const h = canvas.height;
      const c = visAlbumColor || { r: 70, g: 80, b: 255 };
      const now = performance.now() / 1000;
      const avg = vis ? vis.avg : 0.2;

      // Re-crear las estrellas si cambió el tamaño del canvas
      if (spaceStarW !== w || spaceStarH !== h || spaceStars.length === 0) {
        initSpaceStars();
      }

      // Fondo tipo espacio: degradado oscuro azulado/violeta con estrellas
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#05060f');
      bg.addColorStop(0.5, `rgb(${Math.floor(c.r * 0.10)}, ${Math.floor(c.g * 0.10)}, ${Math.floor(c.b * 0.14)})`);
      bg.addColorStop(1, '#030408');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Suave resplandor del color del álbum en el centro
      const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.55);
      glow.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${0.05 + avg * 0.08})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Estrellas que titilan
      for (const s of spaceStars) {
        const twinkle = 0.3 + 0.6 * Math.abs(Math.sin(now * s.ts + s.tw));
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${twinkle})`;
        ctx.fill();
      }

      // Rejilla fina tipo "led display": cada columna = una frecuencia, con
      // efecto de pico: el bloque llena hasta el nivel actual, y el pico
      // (altura máxima alcanzada) quema más tiempo y baja despacio desvaneciéndose.
      const cols = 64;
      const rows = 36;
      const gap = 2;
      const cellW = (w - gap * (cols - 1)) / cols;
      const cellH = (h - gap * (rows - 1)) / rows;
      const hueBase = colorToHue(c);

      if (blockPeakCount !== cols) initBlockPeaks(cols);

      const decay = 0.06;

      for (let col = 0; col < cols; col++) {
        const band = vis && vis.bins && vis.bins.length
          ? vis.bins[Math.floor((col / cols) * vis.bins.length)]
          : avg;
        // Intensidad actual de esta banda (sensibilidad reducida)
        const level = Math.min(1, band * 0.9);

        // Actualizar el pico: sube con la música, baja despacio después
        let peak = blockPeaks[col];
        if (level > peak) {
          peak = level;
        } else {
          peak = Math.max(0, peak - decay);
        }
        blockPeaks[col] = peak;

        // Alturas desde la base (0 = base abajo, 1 = tope arriba)
        const fullH = level;          // onda actual: coloreada hasta aquí
        const peakH = Math.max(peak, level); // huella del pico (descolorida)

        for (let row = 0; row < rows; row++) {
          // pos: 0 arriba del canvas, 1 abajo (base)
          const pos = row / (rows - 1);

          // La fila está dentro de la barra llena si pos >= 1 - altura
          if (pos < 1 - peakH * 1.05) continue;

          const x = col * (cellW + gap) + gap / 2;
          const y = h - (row + 1) * (cellH + gap) + gap / 2;

          if (pos >= 1 - fullH) {
            // Onda actual: coloreada y brillante, máxima en la base
            let lit = (pos - (1 - fullH)) / (fullH * 1.05 + 0.001);
            lit = Math.min(1, Math.max(0, lit));
            const flicker = 0.9 + 0.1 * Math.sin(now * 6 + col * 1.13 + row * 2.7 + (col % 7));
            const alpha = Math.min(1, lit * (0.55 + avg * 0.35) * flicker);
            const lightness = 30 + lit * 38 + avg * 15;
            ctx.fillStyle = `hsla(${hueBase + lit * 12}, ${60 + lit * 28}%, ${lightness}%, ${alpha})`;
          } else {
            // Huella del pico: descolorida y se desvanece hacia arriba
            const fadeTop = (1 - pos - fullH) / (peakH * 1.05 - fullH + 0.001);
            const keep = Math.max(0, 1 - fadeTop);
            const alpha = keep * (0.35 + avg * 0.2);
            const saturation = 12 * keep;
            const lightness = 30 + keep * 20;
            ctx.fillStyle = `hsla(${hueBase}, ${saturation}%, ${lightness}%, ${Math.max(0, alpha)})`;
          }
          ctx.fillRect(x, y, cellW, cellH);
        }
      }

      // Reflejo sutil en la línea de base pulsando con el ritmo
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${0.12 + avg * 0.3})`;
      ctx.fillRect(0, h - 2, w, 2);
    }

    function roundRect(x, y, w, h, r) {
      if (w <= 0 || h <= 0) return;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function toggleVisualizerView() {
      const visOverlay = document.getElementById('visualizer-overlay');
      if (!visOverlay.classList.contains('open')) closeLyricsIfOpen();
      visOverlay.classList.toggle('open');

      if (visOverlay.classList.contains('open')) {
        // Marcar el estilo activo en el menú
        document.querySelectorAll('#vis-style-menu .vis-style-option').forEach(o => {
          o.classList.toggle('active', o.dataset.vis === visStyle);
        });
        resizeCanvas();
        updateVisualizerOverlayData();
        renderVisualizer();
      } else {
        visStyleMenuOpen = false;
        document.getElementById('vis-style-menu').classList.remove('open');
        if (visAnimationId) cancelAnimationFrame(visAnimationId);
      }
    }

    function updateVisualizerOverlayData() {
      const track = playlist[currentTrackIndex];
      const titleEl = document.getElementById('vis-track-title');
      const artistEl = document.getElementById('vis-track-artist');
      const thumbEl = document.getElementById('vis-thumb');
      const ytEl = document.getElementById('vis-yt-link');

      if (track) {
        titleEl.textContent = track.Name || 'Song';
        artistEl.textContent = track.Artists && track.Artists.length ? track.Artists.join(', ') : (track.AlbumArtist || 'Artist');
        thumbEl.src = getEmbyImageUrl(track);
        ytEl.textContent = track.Path || `youtube.com/watch?v=PJniSb91tvo`;
        ytEl.href = `https://www.youtube.com/results?search_query=${encodeURIComponent((track.Artists ? track.Artists.join(' ') : '') + ' ' + track.Name)}`;
      } else {
        titleEl.textContent = 'Song';
        artistEl.textContent = 'Artist';
        thumbEl.src = defaultPlaceholder;
        ytEl.textContent = 'none';
      }

      document.getElementById('vis-play-icon').textContent = audio.paused ? 'play_arrow' : 'pause';
    }

