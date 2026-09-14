/* Utilidades compartidas: localStorage, fetch con reintentos, helpers de DOM y formato. */

    // --- LocalStorage helpers (try/catch centralizado) ---
    function saveLS(key, val) { try { localStorage.setItem(key, typeof val === 'object' ? JSON.stringify(val) : String(val)); } catch (e) {} }
    function loadLS(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }


    function sanitizeServerUrl(url) {
      if (!url || typeof url !== 'string') return '';
      url = url.trim();
      // Solo permitir http/https
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        // Bloquear credenciales en la URL
        if (parsed.username || parsed.password) {
          parsed.username = '';
          parsed.password = '';
        }
        // Eliminar fragmentos y normalizar
        parsed.hash = '';
        return parsed.href.replace(/\/+$/, '');
      } catch (e) {
        return '';
      }
    }

    function sanitizePath(path) {
      if (!path || typeof path !== 'string') return '';
      return path.replace(/[<>"'`;|\\$]/g, '');
    }

    function isSecureContext(url) {
      try { return new URL(url).protocol === 'https:' || location.protocol === 'https:'; }
      catch (e) { return false; }
    }

    // ---- Configuración de debug (activable con ?debug en la URL) ----
    const DEBUG = new URLSearchParams(window.location.search).has('debug');

    function walkmanDebug() {
      // Usamos console.log (no debug) para que Chrome no oculte estos mensajes
      // aunque el filtro de consola tenga el nivel Debug desactivado.
      if (DEBUG) console.log.apply(console, arguments);
    }
    // ---- Retry con backoff exponencial ----
    async function fetchWithRetry(url, options = {}, retries = 3, baseDelay = 800) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch(url, options);
          if (res.ok || attempt === retries) return res;
          if (res.status >= 500 && attempt < retries) {
            await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
            continue;
          }
          return res;
        } catch (err) {
          if (attempt === retries) throw err;
          await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        }
      }
    }

    // ---- Manejo de errores global ----
    // Captura errores no controlados y los muestra como toast en lugar de
    // romper la interfaz en silencio.
    window.addEventListener('error', (e) => {
      if (e && e.message && /script|css|resource/.test(e.message) && e.target && e.target instanceof HTMLElement) return;
      console.error('[WALKMAN] Error global:', e.message, e.filename, e.lineno);
    });
    window.addEventListener('unhandledrejection', (e) => {
      if (e && e.reason) console.warn('[WALKMAN] Promesa rechazada no capturada:', e.reason);
    });

    // --- DOM element cache (evita getElementById repetido en hot paths) ---
    const DOM = {};
    function $(id) { return DOM[id] || (DOM[id] = document.getElementById(id)); }

    const defaultPlaceholder = "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="#282828"/><circle cx="150" cy="130" r="60" fill="none" stroke="#535353" stroke-width="4"/><circle cx="150" cy="130" r="20" fill="#535353"/><path d="M165 130 L165 70 Q165 55 180 50 L180 60 Q170 65 170 70 L170 125" fill="#535353"/><rect x="130" y="210" width="40" height="6" rx="3" fill="#535353"/><rect x="110" y="222" width="80" height="6" rx="3" fill="#404040"/></svg>`);

    function showToast(msg, type) {
      const toast = document.getElementById('context-toast');
      toast.textContent = msg;
      toast.className = 'context-menu-toast' + (type ? ' toast-' + type : '');
      toast.classList.add('show');
      clearTimeout(toast._hideTimer);
      toast._hideTimer = setTimeout(() => toast.classList.remove('show'), type === 'error' ? 4000 : 2500);
    }

    function formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
