/* Arranque: atajos de teclado, Media Session, notificaciones, PWA y audio en background. */
    // ---- Accesibilidad: Navegación por teclado ----
    // Permite controlar la reproducción y los elementos con [data-a11y]
    // usando el teclado (Espacio, flechas, M/S/R, etc.)
    function initKeyboardNav() {
      document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
        if (typing) return; // no interceptar mientras se escribe

        switch (e.key) {
          case ' ': case 'Spacebar':
            e.preventDefault();
            togglePlay();
            break;
          case 'ArrowRight':
            e.preventDefault();
            nextTrack();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            prevTrack();
            break;
          case 'm': case 'M':
            toggleMute();
            break;
          case 'r': case 'R':
            toggleRepeat();
            break;
          case 's':
            toggleShuffle();
            break;
          case 'ArrowUp':
            e.preventDefault();
            const vb = document.getElementById('volume-bar');
            if (vb) {
              const nv = Math.min(100, Number(vb.value) + 5);
              vb.value = nv;
              setVolume(nv);
            }
            break;
          case 'ArrowDown':
            e.preventDefault();
            const vb2 = document.getElementById('volume-bar');
            if (vb2) {
              const nv2 = Math.max(0, Number(vb2.value) - 5);
              vb2.value = nv2;
              setVolume(nv2);
            }
            break;
          case 'Escape':
            closeContextMenu();
            closeAlbumActionsMenu();
            closeSettingsMenu();
            closeEqualizer();
            break;
          default:
            return;
        }
      });

      // Soporte de activación con Enter/Espacio para atributos data-a11y y role=button
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const t = e.target;
        if (!t || !t.getAttribute) return;
        const role = t.getAttribute('role');
        if (role === 'button' && t.hasAttribute('onclick')) {
          const fn = t.getAttribute('data-a11y') || t.getAttribute('onclick');
          if (t.tagName.toLowerCase() !== 'input') {
            if (fn && fn.indexOf('(') === -1) {
              const g = window[fn];
              if (typeof g === 'function') { e.preventDefault(); g(); }
            }
          }
        }
      });
    }
    initKeyboardNav();

    window.onload = async () => {
      currentLang = getLang();
      applyI18n();
      syncLangSelectors();
      initZoom();
      initCarouselZoom();
      initFeaturedZoom();
      applyCardFlareState();
      applyFeaturedVisibility();
      initVolume();
      setupMediaSession();
      renderVptCards();
      applySavedAudioSettings();
      restoreAccentSettings();
      initBeatGlow();
      initXpspLeds();
      initFullscreen();
      fitHeader();
      syncRepeatButton();
      // Restaurar crossfade desde localStorage
      const xf = loadLS('walkman_crossfade');
      if (xf !== null) { crossfadeSeconds = Number(xf) || 0; setCrossfade(crossfadeSeconds); }
      applyDefaultServerConfig();
      requestNotificationPermission();
      const connected = await restoreServerConfig();
      if (!connected) {
        showServerModal();
      } else {
        document.getElementById('emby-modal').style.display = 'none';
        switchServerType(embyConfig.serverType || 'emby');
        // Restaurar cola de reproducción persistente
        if (restoreQueue()) {
          playlistVersion++;
          syncRepeatButton();
          const shufBtn = document.getElementById('shuffle-btn');
          if (shufBtn) { if (isShuffle) shufBtn.classList.add('active'); else shufBtn.classList.remove('active'); }
          renderQueueList();
          refreshCarouselImages();
          if (playlist.length > 0 && currentTrackIndex >= 0) {
            const track = playlist[currentTrackIndex];
            document.getElementById('track-title').textContent = track.Name || '';
            const artistText = track.Artists && track.Artists.length ? track.Artists.join(', ') : (track.AlbumArtist || '');
            document.getElementById('track-artist').textContent = artistText;
            const img = getEmbyImageUrl(track);
            setCardImg(document.getElementById('img-current'), img);
            setCardImg(document.getElementById('img-prev'), currentTrackIndex > 0 ? getEmbyImageUrl(playlist[currentTrackIndex - 1]) : '');
            setCardImg(document.getElementById('img-next'), currentTrackIndex < playlist.length - 1 ? getEmbyImageUrl(playlist[currentTrackIndex + 1]) : '');
            document.getElementById('card-prev').style.display = currentTrackIndex > 0 ? '' : 'none';
            document.getElementById('card-next').style.display = currentTrackIndex < playlist.length - 1 ? '' : 'none';
            if ('mediaSession' in navigator) {
              navigator.mediaSession.metadata = new MediaMetadata({
                title: track.Name,
                artist: artistText,
                album: track.Album || 'Walkman Web',
                artwork: img ? [{ src: img, sizes: '512x512', type: 'image/jpeg' }] : []
              });
            }
          }
        }
      }
    };

    // --- NUEVO: Media Session API Controles ---
    function setupMediaSessionHandlers() {
      if (!('mediaSession' in navigator)) return;
      // Sincronizar los botones del widget con tus funciones existentes
      try { navigator.mediaSession.setActionHandler('play', () => { if (audio.paused) togglePlay(); }); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('pause', () => { if (!audio.paused) togglePlay(); }); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('previoustrack', prevTrack); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('nexttrack', nextTrack); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('seekbackward', (d) => { audio.currentTime = Math.max(0, audio.currentTime - ((d && d.seekOffset) || 15)); }); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('seekforward', (d) => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + ((d && d.seekOffset) || 15)); }); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.fastSeek && 'fastSeek' in audio) {
          audio.fastSeek(details.seekTime);
        } else {
          audio.currentTime = details.seekTime;
        }
      }); } catch (e) {}
    }

    function setMediaSessionPlayback(playing) {
      if (!('mediaSession' in navigator)) return;
      try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (e) {}
      try {
        if (playing && audio.duration && !isNaN(audio.duration)) {
          navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate || 1, position: audio.currentTime || 0 });
        }
      } catch (e) {}
    }

    function setupMediaSession() {
      if ('mediaSession' in navigator) {
        setupMediaSessionHandlers();
        setMediaSessionPlayback(!audio.paused);
      }
    };

    // --- Puente Android (solo usado por la app APK; ignorado en la web) ---
    // Notifica a la app nativa Android el estado de la reproducción para
    // controlar los controles multimedia de la barra de notificaciones.
    function notifyAndroidMedia() {
      try {
        if (typeof AndroidBridge === 'undefined' || !AndroidBridge.setMediaState) return;
        const imgEl = document.getElementById('img-current');
        const current = playlist[currentTrackIndex];
        const payload = {
          title: document.getElementById('track-title') ? document.getElementById('track-title').textContent : '',
          artist: document.getElementById('track-artist') ? document.getElementById('track-artist').textContent : '',
          album: current && current.Album ? current.Album : '',
          artwork: imgEl && imgEl.src && !imgEl.src.startsWith('data:') ? imgEl.src : '',
          playing: !audio.paused,
          position: audio.currentTime || 0,
          duration: audio.duration || 0
        };
        AndroidBridge.setMediaState(JSON.stringify(payload));
      } catch (e) { /* la app Android puede no existir en la web */ }
    }

    // Pide permiso de notificaciones la primera vez que arranca un cliente.
    // Compatible con Safari: soporta tanto la API moderna (Promesa) como el
    // callback antiguo. Solo muestra el diálogo si el navegador soporta
    // Notification y aún no se ha preguntado antes.
    function requestNotificationPermission() {
      try {
        if (!('Notification' in window)) return;
        let asked = loadLS('walkman_notif_asked') === '1';
        if (asked || Notification.permission !== 'default') return;

        const markAsked = () => {
          saveLS('walkman_notif_asked', '1');
        };

        if (typeof Notification.requestPermission === 'function') {
          // Callback (Safari antiguo). En navegadores modernos, además, se devuelve una promesa.
          const result = Notification.requestPermission(() => markAsked());
          if (result && typeof result.then === 'function') {
            result.then(perm => { if (perm) markAsked(); }).catch(() => {});
          }
        }
      } catch (e) {}
    }

    // Notificación local al cambiar de canción (web / fuera de la app Android).
    function showNowPlayingNotification(track) {
      try {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (!track) return;
        const artist = (track.Artists && track.Artists.length)
          ? track.Artists.join(', ')
          : (track.AlbumArtist || '');
        const imgEl = document.getElementById('img-current');
        let icon = '';
        if (imgEl && imgEl.src && !imgEl.src.startsWith('data:') && !imgEl.src.startsWith('blob:')) {
          icon = imgEl.src;
        }
        const n = new Notification(track.Name || 'Reproduciendo', {
          body: artist ? `${artist}${track.Album ? ' — ' + track.Album : ''}` : (track.Album || ''),
          icon: icon || undefined,
          silent: true,
          tag: 'now-playing'
        });
        n.onclick = () => { try { window.focus(); n.close(); } catch (e) {} };
        window.setTimeout(() => { try { n.close(); } catch (e) {} }, 8000);
      } catch (e) {}
    }

    // Registrar el Service Worker para PWA (el SW navega siempre contra la red
    // con cache: 'no-cache', así nunca sirve un index.html viejo).
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => {
            console.log('WALKMAN PWA Service Worker registrado con éxito:', reg.scope);
            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated') {
                  console.log('WALKMAN PWA actualizado. Recarga para ver los cambios.');
                }
              });
            });
          })
          .catch(err => console.error('Error al registrar Service Worker:', err));
      });
    }

    // Capturar evento de instalación PWA para mejor UX
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      console.log('WALKMAN PWA: App instalable detectada');
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      console.log('WALKMAN PWA: App instalada correctamente');
    });

    // ---- Audio en background / reanudado al volver (iOS Safari) ----
    // En iOS, al minimizar la web app Safari pausa la reproducción (o suspende
    // el AudioContext). Este bloque guarda el estado y reanuda automáticamente
    // al volver a primer plano, además de manejar las interrupciones de iOS
    // (Siri, llamadas, bloqueo de pantalla).
    function initBackgroundAudio() {
      if (!audio) return;
      let wasPlaying = false;

      function captureState() {
        wasPlaying = !!audio.src && !audio.paused && !audio.ended && !audio._userPaused;
      }

      function resumePlayback() {
        if (!wasPlaying || !audio.src || audio._userPaused) return;
        if (audio.ended) {
          nextTrack();
          return;
        }
        if (audioCtx && audioCtx.state !== 'running' && audioCtx.resume) {
          try { audioCtx.resume().catch(function() {}); } catch (e) {}
        }
        if (audio.paused) {
          const p = audio.play();
          if (p && p.catch) p.catch(function() {});
        }
      }

      // Algunos iOS requieren un gesto del usuario para reanudar el audio;
      // reintentamos la reproducción sobre el primer toque tras volver.
      function armGestureRetry() {
        if (window.__walkmanRetryArmed) return;
        window.__walkmanRetryArmed = true;
        const retry = function() {
          window.__walkmanRetryArmed = false;
          window.removeEventListener('pointerdown', retry);
          document.removeEventListener('touchstart', retry);
          if (wasPlaying && !audio._userPaused) {
            if (audioCtx && audioCtx.state !== 'running' && audioCtx.resume) {
              try { audioCtx.resume().catch(function() {}); } catch (e) {}
            }
            if (audio.paused && audio.src) {
              const p = audio.play();
              if (p && p.catch) p.catch(function() {});
            }
          }
        };
        window.addEventListener('pointerdown', retry);
        document.addEventListener('touchstart', retry);
      }

      function onHidden() {
        captureState();
      }

      function onVisible() {
        resumePlayback();
        armGestureRetry();
      }

      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') onHidden();
        else onVisible();
      });
      document.addEventListener('webkitvisibilitychange', function() {
        if (document.visibilityState === 'hidden') onHidden();
        else onVisible();
      });
      window.addEventListener('pageshow', function(e) {
        if (e.persisted) onVisible();
      });
      window.addEventListener('pagehide', onHidden);
      window.addEventListener('blur', onHidden);

      // Interrupciones de iOS Safari (llamada, Siri, bloqueo de pantalla)
      audio.addEventListener('webkitbegininterruption', onHidden);
      audio.addEventListener('webkitendinterruption', function() {
        captureState();
        resumePlayback();
      });

      // Si el navegador pausa el elemento por una interrupción involuntaria
      // (Safari, Android background throttle), capturamos que estaba sonando
      // para poder reanudarla al volver.
      audio.addEventListener('pause', function() {
        if (audio._userPaused || audio.ended) {
          wasPlaying = false;
        }
      });

      // Estado inicial
      wasPlaying = !!audio.src && !audio.paused;
    }

    initBackgroundAudio();
