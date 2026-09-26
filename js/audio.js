/* Motor de audio: Web Audio (EQ, Clear Bass, VPT), volumen, crossfade, sleep timer y control de reproducción. */
    let playlist = [];
    // Estados de reproducción
    let currentTrackIndex = 0;
    let playlistVersion = 0;
    let lastSeenPlaylistVersion = -1;

    let repeatMode = 1; // 0: Off, 1: All, 2: One
    let isShuffle = false;
    let originalPlaylist = [];
    let lastVolume = 1;

    // Perfiles VPT
    let currentVptIndex = 0; // Por defecto "Estudio"
    const vptProfiles = ['Desactivado', 'Estudio', 'Club', 'Auditorio'];
    const vptNameKeys = { 'Desactivado': 'vptOff', 'Estudio': 'vptStudio', 'Club': 'vptClub', 'Auditorio': 'vptAuditorium' };

    const audio = document.getElementById('audio-player');

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const audioProcessingEnabled = !isIOS;
    let audioCtx = null;
    let trackSource = null;
    let analyserNode = null;
    let eqFilters = [];
    let clearBassFilter = null;
    let vptConvolver = null;
    let vptDryGain = null;
    let vptWetGain = null;

    function initAudioContext() {
      if (audioCtx) return;
      if (!audioProcessingEnabled) return;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const isAndroid = /Android/.test(navigator.userAgent);
      audioCtx = new AudioContext({
        latencyHint: isAndroid ? 'playback' : 'interactive'
      });
      trackSource = audioCtx.createMediaElementSource(audio);

      // Analizador de Audio para el Visualizador Canvas
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 256;

      // 5 Bandas de Ecualizador
      const frequencies = [400, 1000, 2500, 6000, 16000];
      eqFilters = frequencies.map(freq => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.4;
        filter.gain.value = 0;
        return filter;
      });

      // Clear Bass Filter
      clearBassFilter = audioCtx.createBiquadFilter();
      clearBassFilter.type = 'lowshelf';
      clearBassFilter.frequency.value = 70;
      clearBassFilter.gain.value = 0;

      // VPT Reverb Convolver & Gain Routing
      vptConvolver = audioCtx.createConvolver();
      vptDryGain = audioCtx.createGain();
      vptWetGain = audioCtx.createGain();

      vptDryGain.gain.value = 1.0;
      vptWetGain.gain.value = 0.0;

      // Cadena Audio: Track -> Analyser -> EQ Bandas -> Clear Bass -> (Split Dry / Wet Convolver) -> Destination
      let currentNode = trackSource;
      currentNode.connect(analyserNode);
      currentNode = analyserNode;

      eqFilters.forEach(filter => {
        currentNode.connect(filter);
        currentNode = filter;
      });
      currentNode.connect(clearBassFilter);

      // Conexión VPT
      clearBassFilter.connect(vptDryGain);
      clearBassFilter.connect(vptConvolver);
      vptConvolver.connect(vptWetGain);
      vptConvolver.__connected = true;

      vptDryGain.connect(audioCtx.destination);
      vptWetGain.connect(audioCtx.destination);

      applySavedAudioSettings();
    }

    // --- FUNCIONES DE CONTROL DE VOLUMEN ---
    function setVolume(value) {
      const vol = Math.max(0, Math.min(1, value / 100));
      if (audio) audio.volume = vol;
      updateVolumeIcon(vol);
      saveLS('walkman_volume', vol);
    }

    function updateVolumeIcon(vol) {
      const icon = document.getElementById('volume-icon');
      if (!icon) return;
      if (vol === 0) {
        icon.textContent = 'volume_off';
      } else if (vol < 0.5) {
        icon.textContent = 'volume_down';
      } else {
        icon.textContent = 'volume_up';
      }
    }

    function toggleMute() {
      const volBar = document.getElementById('volume-bar');
      if (audio.volume > 0) {
        lastVolume = audio.volume;
        setVolume(0);
        if (volBar) volBar.value = 0;
      } else {
        const restored = lastVolume > 0 ? lastVolume : 1;
        setVolume(restored * 100);
        if (volBar) volBar.value = restored * 100;
      }
    }

    function initVolume() {
      const savedVol = loadLS('walkman_volume');
      const volBar = document.getElementById('volume-bar');
      if (savedVol !== null) {
        const volVal = parseFloat(savedVol);
        audio.volume = volVal;
        if (volBar) volBar.value = volVal * 100;
        updateVolumeIcon(volVal);
      } else {
        audio.volume = 1;
        if (volBar) volBar.value = 100;
        updateVolumeIcon(1);
      }
    }

    // Generador de Respuesta al Impulso sintética para Reverb VPT
    function createImpulseResponse(duration, decay, reverse) {
      if (!audioCtx) return null;
      const sampleRate = audioCtx.sampleRate;
      const length = sampleRate * duration;
      const impulse = audioCtx.createBuffer(2, length, sampleRate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);

      for (let i = 0; i < length; i++) {
        let n = reverse ? length - i : i;
        left[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
        right[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      }
      return impulse;
    }

    function applyVptProfile(profileIndex) {
      if (!audioCtx || !vptConvolver || !vptWetGain || !vptDryGain) return;

      if (profileIndex === 0) {
        // Desactivado: desconectar convolver para ahorrar CPU
        if (vptConvolver.__connected) {
          try {
            clearBassFilter.disconnect(vptConvolver);
            vptConvolver.disconnect(vptWetGain);
          } catch (e) {}
          vptConvolver.__connected = false;
        }
        vptDryGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
        vptWetGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
      } else {
        // Reconectar convolver si estaba desconectado
        if (!vptConvolver.__connected) {
          try {
            clearBassFilter.connect(vptConvolver);
            vptConvolver.connect(vptWetGain);
            vptConvolver.__connected = true;
          } catch (e) {}
        }
        if (profileIndex === 1) {
          // Estudio (Reverb muy corta y brillante)
          vptConvolver.buffer = createImpulseResponse(0.6, 2.5, false);
          vptDryGain.gain.setValueAtTime(0.9, audioCtx.currentTime);
          vptWetGain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        } else if (profileIndex === 2) {
          // Club (Reverb mediana con graves potentes)
          vptConvolver.buffer = createImpulseResponse(1.5, 2.0, false);
          vptDryGain.gain.setValueAtTime(0.85, audioCtx.currentTime);
          vptWetGain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        } else if (profileIndex === 3) {
          // Auditorio (Reverb larga y envolvente)
          vptConvolver.buffer = createImpulseResponse(3.2, 1.5, false);
          vptDryGain.gain.setValueAtTime(0.75, audioCtx.currentTime);
          vptWetGain.gain.setValueAtTime(0.55, audioCtx.currentTime);
        }
      }
    }

    function switchSoundTab(tab) {
      document.getElementById('tab-btn-eq').classList.remove('active');
      document.getElementById('tab-btn-vpt').classList.remove('active');
      document.getElementById('sound-tab-eq').classList.remove('active');
      document.getElementById('sound-tab-vpt').classList.remove('active');

      if (tab === 'eq') {
        document.getElementById('tab-btn-eq').classList.add('active');
        document.getElementById('sound-tab-eq').classList.add('active');
      } else {
        document.getElementById('tab-btn-vpt').classList.add('active');
        document.getElementById('sound-tab-vpt').classList.add('active');
        renderVptCards();
      }
    }

    function renderVptCards() {
      const wrapper = document.getElementById('vpt-cards-wrapper');
      const cards = wrapper.querySelectorAll('.vpt-card');
      
      cards.forEach((card, idx) => {
        card.className = 'vpt-card';
        if (idx === currentVptIndex) {
          card.classList.add('active-card');
        } else if (idx === (currentVptIndex - 1 + vptProfiles.length) % vptProfiles.length) {
          card.classList.add('prev-card');
        } else if (idx === (currentVptIndex + 1) % vptProfiles.length) {
          card.classList.add('next-card');
        } else {
          card.classList.add('hidden-card');
        }
      });

      document.getElementById('vpt-current-name').textContent = t(vptNameKeys[vptProfiles[currentVptIndex]] || vptProfiles[currentVptIndex]);
    }

    function selectVptProfile(index) {
      currentVptIndex = index;
      renderVptCards();
      applyVptProfile(currentVptIndex);
      saveAudioSettings();
    }

    function nextVptProfile() {
      currentVptIndex = (currentVptIndex + 1) % vptProfiles.length;
      selectVptProfile(currentVptIndex);
    }

    function prevVptProfile() {
      currentVptIndex = (currentVptIndex - 1 + vptProfiles.length) % vptProfiles.length;
      selectVptProfile(currentVptIndex);
    }

    function saveAudioSettings() {
      const bands = [];
      for (let i = 0; i < 5; i++) {
        bands.push(document.getElementById(`eq-band-${i}`).value);
      }
      const cbValue = document.getElementById('cb-slider').value;
      const preset = document.getElementById('eq-preset-select').value;

      const audioSettings = { bands, cbValue, preset, vptIndex: currentVptIndex };
      saveLS('walkman_eq_settings', JSON.stringify(audioSettings));
    }

    function applySavedAudioSettings() {
      const saved = loadLS('walkman_eq_settings');
      if (!saved) {
        applyVptProfile(currentVptIndex);
        return;
      }
      
      try {
        const audioSettings = JSON.parse(saved);
        
        if (audioSettings.preset) {
          document.getElementById('eq-preset-select').value = audioSettings.preset;
        }

        if (audioSettings.bands && audioSettings.bands.length === 5) {
          audioSettings.bands.forEach((val, i) => {
            document.getElementById(`eq-band-${i}`).value = val;
            if (eqFilters[i]) eqFilters[i].gain.value = parseFloat(val);
          });
        }

        if (audioSettings.cbValue !== undefined) {
          document.getElementById('cb-slider').value = audioSettings.cbValue;
          if (clearBassFilter) clearBassFilter.gain.value = parseFloat(audioSettings.cbValue) * 1.5;
        }

        if (audioSettings.vptIndex !== undefined) {
          currentVptIndex = audioSettings.vptIndex;
          renderVptCards();
          applyVptProfile(currentVptIndex);
        }
      } catch (e) {}
    }

    function toggleEqualizer() {
      initAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const dropdown = document.getElementById('eq-dropdown');
      const btn = document.getElementById('eq-btn');
      
      dropdown.classList.toggle('open');
      btn.classList.toggle('active');
      document.getElementById('eq-overlay').classList.toggle('open');

      if (dropdown.classList.contains('open')) {
        btn.setAttribute('aria-expanded', 'true');
        document.getElementById('search-overlay').classList.remove('open');
        // Cerrar el menú de ajustes si está abierto
        closeSettingsMenu();
        renderVptCards();
      } else {
        btn.setAttribute('aria-expanded', 'false');
      }
    }

    function closeEqualizer() {
      const dropdown = document.getElementById('eq-dropdown');
      if (dropdown.classList.contains('open')) {
        dropdown.classList.remove('open');
        document.getElementById('eq-btn').classList.remove('active');
        document.getElementById('eq-overlay').classList.remove('open');
      }
    }

    function updateEqBand(index, value) {
      if (eqFilters[index]) {
        eqFilters[index].gain.value = parseFloat(value);
      }
      document.getElementById('eq-preset-select').value = 'Manual';
      saveAudioSettings();
    }

    function updateClearBass(value) {
      if (clearBassFilter) {
        clearBassFilter.gain.value = parseFloat(value) * 1.5;
      }
      saveAudioSettings();
    }

    const presets = {
      'Desactivado': [0, 0, 0, 0, 0],
      'Rock': [4, 2, -1, 3, 5],
      'Pop': [-1, 2, 4, 2, -1],
      'Jazz': [3, 0, 1, 2, 4],
      'Soul': [2, -1, 2, 3, 1],
      'BassBoost': [7, 4, 1, 0, 0]
    };

    function changePreset(presetName) {
      if (presetName === 'Manual') return;
      const vals = presets[presetName] || [0,0,0,0,0];
      vals.forEach((v, i) => {
        document.getElementById(`eq-band-${i}`).value = v;
        if (eqFilters[i]) eqFilters[i].gain.value = v;
      });
      saveAudioSettings();
    }

    // LÓGICA DE REPETICIÓN Y ALEATORIO
    function syncRepeatButton() {
      const btn = document.getElementById('repeat-btn');
      btn.classList.remove('active', 'repeat-one');
      if (repeatMode === 1) {
        btn.classList.add('active');
      } else if (repeatMode === 2) {
        btn.classList.add('active', 'repeat-one');
      }
    }

    function toggleRepeat() {
      repeatMode = (repeatMode + 1) % 3;
      syncRepeatButton();
      saveQueue();
    }

    function toggleShuffle() {
      const btn = document.getElementById('shuffle-btn');
      isShuffle = !isShuffle;

      if (isShuffle) {
        btn.classList.add('active');
        if (playlist.length > 0) {
          originalPlaylist = [...playlist];
          const currentTrack = playlist[currentTrackIndex];
          
          let rest = playlist.filter((_, idx) => idx !== currentTrackIndex);
          for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
          }
          playlist = [currentTrack, ...rest];
          playlistVersion++;
          currentTrackIndex = 0;
          renderQueueList();
          saveQueue();
        }
      } else {
        btn.classList.remove('active');
        if (originalPlaylist.length > 0) {
          const currentTrack = playlist[currentTrackIndex];
          playlist = [...originalPlaylist];
          playlistVersion++;
          currentTrackIndex = playlist.findIndex(t => t.Id === currentTrack.Id);
          if (currentTrackIndex === -1) currentTrackIndex = 0;
          renderQueueList();
          saveQueue();
        }
      }
    }

    function playShuffleAll(tracks) {
      if (!tracks || tracks.length === 0) return;
      const shuffled = tracks.slice().sort(() => Math.random() - 0.5);
      playlist = shuffled;
      originalPlaylist = [...tracks];
      isShuffle = true;
      const btn = document.getElementById('shuffle-btn');
      if (btn) btn.classList.add('active');
      playlistVersion++;
      renderQueueList();
      refreshCarouselImages();
      playTrack(0);
      saveQueue();
      switchTab('playing');
    }

    // ---- TEMPORIZADOR DE SUEÑO (Sleep Timer) ----
    let sleepTimerId = null;
    let sleepTimerMinutes = 0;
    let sleepTimerRemaining = 0;

    function toggleSleepTimer() {
      const wrap = document.getElementById('sleeptimer-options');
      if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    }

    function setSleepTimer(minutes) {
      sleepTimerMinutes = Number(minutes);
      const lbl = document.getElementById('sleeptimer-btn-label');
      if (sleepTimerMinutes > 0) {
        sleepTimerRemaining = sleepTimerMinutes * 60;
        if (!sleepTimerId) sleepTimerLoop();
        lbl.textContent = t('sleepTimer') + ': ' + sleepTimerMinutes + ' min';
        document.getElementById('sleeptimer-btn').classList.add('on');
        showToast(t('sleepTimer') + ': ' + sleepTimerMinutes + ' min', 'info');
      } else {
        if (sleepTimerId) { clearInterval(sleepTimerId); sleepTimerId = null; }
        sleepTimerRemaining = 0;
        lbl.textContent = t('sleepTimer');
        document.getElementById('sleeptimer-btn').classList.remove('on');
      }
    }

    function sleepTimerLoop() {
      if (sleepTimerRemaining <= 0) {
        clearInterval(sleepTimerId);
        sleepTimerId = null;
        return;
      }
      sleepTimerRemaining--;
      if (sleepTimerRemaining <= 0) {
        // Apagar la reproducción al terminar el temporizador
        if (audio && !audio.paused) {
          audio._userPaused = true;
          audio.pause();
          $('play-icon').textContent = 'play_arrow';
          $('vis-play-icon').textContent = 'play_arrow';
          setMediaSessionPlayback(false);
        }
        document.getElementById('sleeptimer-btn').classList.remove('on');
        document.getElementById('sleeptimer-btn-label').textContent = t('sleepTimer');
        showToast(t('sleepTimerEnd') || 'Sleep timer finalizado', 'success');
        return;
      }
      // Notificar al llegar a la mitad y al final
      if (sleepTimerRemaining % 60 === 0 && sleepTimerRemaining <= 300 && sleepTimerRemaining > 60) {
        showToast('Sleep timer: ' + (sleepTimerRemaining / 60) + ' min', 'info');
      }
      sleepTimerId = setTimeout(sleepTimerLoop, 1000);
    }

    // ---- CROSSFADE / FUNDIDO ENTRE CANCIONES ----
    let crossfadeSeconds = 0;

    function toggleCrossfade() {
      const wrap = document.getElementById('crossfade-wrap');
      if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    }

    function setCrossfade(seconds) {
      crossfadeSeconds = Number(seconds);
      const lbl = document.getElementById('crossfade-btn-label');
      if (crossfadeSeconds > 0) {
        lbl.textContent = 'Crossfade: ' + crossfadeSeconds + ' s';
        document.getElementById('crossfade-btn').classList.add('on');
      } else {
        lbl.textContent = t('crossfade');
        document.getElementById('crossfade-btn').classList.remove('on');
      }
      saveLS('walkman_crossfade', crossfadeSeconds);
    }

    // NAVEGACIÓN ENTRE PESTAÑAS

    let trackHasLoaded = false;

    function playTrack(index, skipAnimation = false) {
      if (playlist.length === 0) return;
      
      const prevIndex = currentTrackIndex;
      currentTrackIndex = index;
      const track = playlist[index];

      const cardCurrent = document.getElementById('card-current');
      const cardPrev = document.getElementById('card-prev');
      const cardNext = document.getElementById('card-next');
      const imgCurrentEl = document.getElementById('img-current');
      const imgPrevEl = document.getElementById('img-prev');
      const imgNextEl = document.getElementById('img-next');
      const trackInfo = document.querySelector('.track-info');
      const trackTitle = document.getElementById('track-title');
      const trackArtist = document.getElementById('track-artist');

      const allCards = [cardPrev, cardCurrent, cardNext];

      const newUrl = getEmbyImageUrl(track);
      const prevUrl = index > 0 ? getEmbyImageUrl(playlist[index - 1]) : null;
      const nextUrl = index < playlist.length - 1 ? getEmbyImageUrl(playlist[index + 1]) : null;
      const nextAfterUrl = index < playlist.length - 2 ? getEmbyImageUrl(playlist[index + 2]) : null;
      const prevBeforeUrl = index > 1 ? getEmbyImageUrl(playlist[index - 2]) : null;

      function setBaseStyles() {
        allCards.forEach(c => {
          c.style.transform = '';
          c.style.opacity = '';
          c.style.filter = '';
          c.style.zIndex = '';
        });
      }

      function applyImages() {
        setCardImg(imgCurrentEl, newUrl);
        if (prevUrl) {
          setCardImg(imgPrevEl, prevUrl);
          cardPrev.style.display = '';
        } else {
          cardPrev.style.display = 'none';
        }
        if (nextUrl) {
          setCardImg(imgNextEl, nextUrl);
          cardNext.style.display = '';
        } else {
          cardNext.style.display = 'none';
        }
      }

      // Pequeño "pop" de la carátula al cambiar de canción
      function triggerCardPop() {
        if (!isCardFlareEnabled()) return;
        cardCurrent.classList.remove('card-pop');
        void cardCurrent.offsetWidth;
        cardCurrent.classList.add('card-pop');
        clearTimeout(cardCurrent._popTimer);
        cardCurrent._popTimer = setTimeout(() => {
          cardCurrent.classList.remove('card-pop');
        }, 1400);
      }

      if (playlistVersion !== lastSeenPlaylistVersion) {
        trackHasLoaded = false;
        lastSeenPlaylistVersion = playlistVersion;
      }

      const canAnimate = !skipAnimation && trackHasLoaded && prevIndex !== index;

      if (canAnimate) {
        const goingForward = index > prevIndex;

        const cardW = cardCurrent.offsetWidth;
        const sideOffset = Math.round(cardW * 0.57);
        const farOffset = Math.round(cardW * 1.06);

        const oldCurrentSrc = imgCurrentEl.src;
        const oldNextSrc = imgNextEl.src;
        const oldPrevSrc = imgPrevEl.src;

        // Paso 1: Sin transición, posicionar en base CSS (sin cambio visual)
        allCards.forEach(c => { c.style.transition = 'none'; });
        setBaseStyles();
        void cardCurrent.offsetWidth;

        // Paso 2: Activar transiciones + poner destino → la animación arranca
        allCards.forEach(c => { c.style.transition = ''; });

        if (goingForward) {
          cardPrev.style.transform = `translateX(-${farOffset}px) scale(0.6)`;
          cardPrev.style.opacity = '0';
          cardCurrent.style.transform = `translateX(-${sideOffset}px) scale(0.82)`;
          cardCurrent.style.opacity = '0.5';
          cardCurrent.style.filter = 'brightness(0.7)';
          cardCurrent.style.zIndex = '2';
          cardNext.style.transform = 'translateX(0) scale(1)';
          cardNext.style.opacity = '1';
          cardNext.style.filter = '';
          cardNext.style.zIndex = '3';
        } else {
          cardNext.style.transform = `translateX(${farOffset}px) scale(0.6)`;
          cardNext.style.opacity = '0';
          cardCurrent.style.transform = `translateX(${sideOffset}px) scale(0.82)`;
          cardCurrent.style.opacity = '0.5';
          cardCurrent.style.filter = 'brightness(0.7)';
          cardCurrent.style.zIndex = '2';
          cardPrev.style.transform = 'translateX(0) scale(1)';
          cardPrev.style.opacity = '1';
          cardPrev.style.filter = '';
          cardPrev.style.zIndex = '3';
        }

        // Paso 3: Al terminar la transición, intercambiar y limpiar
        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;

          applyImages();

          // Sin transición, volver a base CSS y limpiar inline
          allCards.forEach(c => { c.style.transition = 'none'; });
          setBaseStyles();
          void cardCurrent.offsetWidth;
          allCards.forEach(c => { c.style.transition = ''; });

          triggerCardPop();
        };

        cardCurrent.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, 600);
      } else {
        applyImages();
        triggerCardPop();
      }

      trackHasLoaded = true;

      // Animación del texto
      trackInfo.classList.remove('transitioning');
      trackTitle.classList.remove('transitioning');
      trackArtist.classList.remove('transitioning');
      void trackInfo.offsetWidth;
      trackInfo.classList.add('transitioning');
      trackTitle.classList.add('transitioning');
      trackArtist.classList.add('transitioning');
      
      setTimeout(() => {
        trackInfo.classList.remove('transitioning');
        trackTitle.classList.remove('transitioning');
        trackArtist.classList.remove('transitioning');
      }, 400);

      document.getElementById('track-title').textContent = track.Name;
      document.getElementById('track-artist').textContent = track.Artists && track.Artists.length ? track.Artists.join(', ') : (track.AlbumArtist || 'Artista Desconocido');

      // Mostrar/ocultar insignia HI-RES en la carátula
      const hiresBadge = document.getElementById('hires-badge');
      if (hiresBadge) {
        if (isHiResAudio(track)) {
          hiresBadge.classList.remove('hidden');
        } else {
          hiresBadge.classList.add('hidden');
        }
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.Name,
          artist: track.Artists && track.Artists.length ? track.Artists.join(', ') : (track.AlbumArtist || 'Artista Desconocido'),
          album: track.Album || 'Walkman Web',
          artwork: [{ src: newUrl, sizes: '512x512', type: 'image/jpeg' }]
        });
      }

      initAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const streamUrl = track.IsLocal
        ? track.objUrl || track.Path
        : embyConfig.serverType === 'plex'
          ? `${embyConfig.host}/library/parts/${track._plexPartId}/stream?X-Plex-Token=${embyConfig.token}`
          : `${embyConfig.host}/Audio/${track.Id}/stream?static=true&api_key=${embyConfig.token}`;
      const doSwitch = () => {
        audio._crossfadeAdvancing = false;
        audio.src = streamUrl;
        audio._userPaused = false;
        audio.play();
        document.getElementById('play-icon').textContent = 'pause';
        document.getElementById('vis-play-icon').textContent = 'pause';
      };
      if (crossfadeSeconds > 0 && prevIndex !== index && audio.src && !audio.paused) {
        // Fundido suave: baja el volumen de la pista actual y entra la nueva
        const origVol = audio.volume;
        const fadeDur = Math.min(crossfadeSeconds, 3);
        const start = performance.now();
        const step = () => {
          const t = Math.min(1, (performance.now() - start) / (fadeDur * 1000));
          audio.volume = origVol * (1 - t);
          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            audio.volume = origVol;
            doSwitch();
            // Fundido de entrada
            audio.volume = 0;
            const up = performance.now();
            const upStep = () => {
              const t2 = Math.min(1, (performance.now() - up) / (fadeDur * 1000));
              audio.volume = origVol * t2;
              if (t2 < 1) requestAnimationFrame(upStep);
            };
            requestAnimationFrame(upStep);
          }
        };
        requestAnimationFrame(step);
      } else {
        doSwitch();
      }
      
      updateVisualizerOverlayData();
      renderQueueList();
      notifyAndroidMedia();
      showNowPlayingNotification(track);
      setupMediaSessionHandlers();
      setMediaSessionPlayback(true);
      saveQueue();
    }

    function togglePlay() {
      if (!audio.src) return;
      initAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      if (audio.paused) {
        audio._userPaused = false;
        audio.play();
        $('play-icon').textContent = 'pause';
        $('vis-play-icon').textContent = 'pause';
        setMediaSessionPlayback(true);
      } else {
        audio._userPaused = true;
        audio.pause();
        $('play-icon').textContent = 'play_arrow';
        $('vis-play-icon').textContent = 'play_arrow';
        setMediaSessionPlayback(false);
      }
      notifyAndroidMedia();
    }

    function prevTrack() {
      if (currentTrackIndex > 0) playTrack(currentTrackIndex - 1);
    }

    function nextTrack() {
      if (currentTrackIndex < playlist.length - 1) {
        playTrack(currentTrackIndex + 1);
      } else if (repeatMode === 1) {
        playTrack(0);
      }
    }

    audio.addEventListener('timeupdate', () => {
      if (isNaN(audio.duration)) return;
      const cur = audio.currentTime;
      if (cur === audio._lastTimeUpdate) return;
      audio._lastTimeUpdate = cur;
      const progress = ((cur / audio.duration) * 100).toFixed(2);
      $('progress-bar').value = progress;
      $('time-current').textContent = formatTime(cur);
      $('time-total').textContent = formatTime(audio.duration);
      // Barra de progreso del Visualizador (solo si está visible)
      if ($('visualizer-overlay').classList.contains('open')) {
        $('vis-progress-bar').value = progress;
        $('vis-time-current').textContent = formatTime(cur);
        $('vis-time-total').textContent = formatTime(audio.duration);
      }
      // Crossfade real al llegar al final: lanzar la siguiente pista antes de que termine
      if (crossfadeSeconds > 0 && repeatMode !== 2 && !audio._crossfadeAdvancing && !audio.paused) {
        const remaining = audio.duration - cur;
        if (remaining <= crossfadeSeconds && remaining > 0.2 && currentTrackIndex < playlist.length - 1) {
          audio._crossfadeAdvancing = true;
          playTrack(currentTrackIndex + 1);
        }
      }
    });

    audio.addEventListener('ended', () => {
      // Si el crossfade ya está fundiendo hacia la siguiente canción, no avanzar de nuevo
      if (audio._crossfadeAdvancing) {
        audio._crossfadeAdvancing = false;
        return;
      }
      if (repeatMode === 2) {
        audio.currentTime = 0;
        audio.play();
      } else {
        nextTrack();
      }
    });

    function seekTrack(value) {
      if (audio.duration) {
        audio.currentTime = (value / 100) * audio.duration;
      }
    }

