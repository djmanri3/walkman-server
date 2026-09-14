/* Sistema de idiomas (i18n): diccionarios y helpers de traducción. */
    // ---- Sistema de idiomas (i18n) ----
    const I18N = {
      en: {
        settings: 'Settings', accentColor: 'Accent color', dynamic: 'Dynamic', custom: 'Custom',
        pickColor: 'Choose a color', walkmanBarSize: 'Walkman bar size', albumCarouselSize: 'Album carousel size',
        slideshow: 'Album slideshow', slideshowSize: 'Slideshow size', beatGlow: 'Beat glow',
        glowIntensity: 'Glow intensity', low: 'Low', medium: 'Medium', high: 'High',
        xpspLeds: 'Xperia SP LEDs', sensitivity: 'Sensitivity', changeLibrary: 'Change music library',
        clearCache: 'Clear cache', fullscreen: 'Fullscreen', connectServer: 'Connect to Server', serverUrl: 'Server URL',
        user: 'User', password: 'Password', connect: 'Connect', localLibrary: 'Device local library',
        localLibraryHint: 'Select a folder on your device/computer to scan audio files (mp3, flac, ogg, m4a, wav, opus).',
        chooseFolder: 'Choose music folder', selectMusicLibrary: 'Select the Music Library',
        playing: 'Playing', myMusic: 'My music', visualizer: 'Visualizer', search: 'Search',
        myMusicHome: 'My Music', songs: 'Songs', albums: 'Albums', artists: 'Artists', playlists: 'Playlists',
        soundEnhancements: 'Sound Enhancements / EQ', serverSettings: 'Server Settings',
        selectTrack: 'Select a song', lyrics: 'Lyrics', original: 'Original', spanish: 'Spanish',
        english: 'English', german: 'German', french: 'French', italian: 'Italian', portuguese: 'Portuguese',
        japanese: 'Japanese', chinese: 'Chinese', russian: 'Russian', arabic: 'Arabic',
        language: 'Language', searchingLyrics: 'Searching lyrics...', translating: 'Translating...',
        noLyrics: 'No lyrics found for this song', noSyncedLyrics: 'This song has no synced lyrics',
        noSyncedFound: 'No synced lyrics found', noTrackPlaying: 'No song currently playing',
        lyricsError: 'Error connecting to the lyrics server', emptyQueue: 'No songs in queue',
        noTracks: 'No songs', back: 'Back', repeat: 'Repeat', shuffle: 'Shuffle',
        shuffleAll: 'Shuffle all songs',
        equalizer: 'Equalizer', eqVptTab: 'Settings / VPT', vptAmbient: 'Ambient sound (VPT)',
        vptOff: 'Off', vptOffDesc: 'No immersive ambient sound effects',
        vptStudio: 'Studio', vptStudioDesc: 'Creates the sound of an acoustic recording studio',
        vptClub: 'Club', vptClubDesc: 'Simulates the live sound of a music club',
        vptAuditorium: 'Auditorium', vptAuditoriumDesc: 'Produces the wide resonance of a concert hall',
        searchPlaceholder: 'Search songs, albums, artists...', searchHint: 'Type to search...',
        visStyle: 'Visualizer style', visRings: 'Pulsing rings', visBars: 'Frequency bars',
        visWave: 'Stereo wave', visPs3: 'PS3 waves', visCosmic: 'Cosmic Flow',
        visParticles: 'Album particles', visBlocks: 'Rhythmic blocks',
        playNext: 'Play next', addToQueue: 'Add to queue', removeFromQueue: 'Remove from queue', play: 'Play',
        musicInfo: 'Music information', noName: 'No name', noAvailable: 'Not available',
        searchYouTube: 'Search song on YouTube', searchGoogleAlbum: 'Search album on Google',
        searchGoogleArtist: 'Search artist on Google', moreFromArtist: 'More songs from this artist',
        unknown: 'Unknown', infoName: 'Name', infoArtist: 'Artist', infoAlbum: 'Album', infoFile: 'File', audioQuality: 'Audio quality',
        sleepTimer: 'Sleep timer', crossfade: 'Crossfade (fade between songs)', sleepTimerEnd: 'Sleep timer ended',
        libraryChanged: 'Library changed', noResults: 'No results found',
        addedToQueue: 'Added to queue', addedToQueueMany: '{kind} added ({n} songs)',
        notInQueue: 'Not in the queue', removedFromQueueToast: 'Removed from queue',
        kindArtist: 'Artist', kindAlbum: 'Album', kindPlaylist: 'Playlist',
        coversReady: 'Covers ready ({n})', noEmbeddedCovers: 'No embedded covers',
        loadingSongs: 'Loading songs...', refreshSlideshow: 'Refresh slideshow',
        quotaExceeded: 'Translation temporarily unavailable (daily free limit reached)',
        followLyrics: 'Follow the song', customization: 'Customization', effects: 'Effects', soundControl: 'Sound control',
        cardFlare: 'Cover glow on track change',
        httpWarning: 'Warning: all HTTP traffic will be allowed, but it is very insecure, since everything may become visible to other users on the network.'
      },
      es: {
        settings: 'Ajustes', accentColor: 'Color de acento', dynamic: 'Dinámico', custom: 'Personalizado',
        pickColor: 'Elige un color', walkmanBarSize: 'Tamaño Barra Walkman', albumCarouselSize: 'Tamaño carrusel de álbumes',
        slideshow: 'Side show de álbumes', slideshowSize: 'Tamaño del side show', beatGlow: 'Resplandor al ritmo',
        glowIntensity: 'Intensidad del resplandor', low: 'Baja', medium: 'Media', high: 'Alta',
        xpspLeds: 'LEDs Xperia SP', sensitivity: 'Sensibilidad', changeLibrary: 'Cambiar biblioteca de música',
        clearCache: 'Borrar caché', fullscreen: 'Pantalla completa', connectServer: 'Conectarse al Servidor', serverUrl: 'URL del Servidor',
        user: 'Usuario', password: 'Contraseña', connect: 'Conectar', localLibrary: 'Biblioteca local del dispositivo',
        localLibraryHint: 'Selecciona una carpeta de tu dispositivo/computadora para escanear archivos de audio (mp3, flac, ogg, m4a, wav, opus).',
        chooseFolder: 'Elegir carpeta de música', selectMusicLibrary: 'Selecciona la Biblioteca Musical',
        playing: 'Reproduciendo', myMusic: 'Mi música', visualizer: 'Visualizador', search: 'Buscar',
        myMusicHome: 'Mi Música', songs: 'Canciones', albums: 'Álbumes', artists: 'Artistas', playlists: 'Listas de reproducción',
        soundEnhancements: 'Mejoras de Sonido / Ecualizador', serverSettings: 'Ajustes de Servidor',
        selectTrack: 'Selecciona una canción', lyrics: 'Letras', original: 'Original', spanish: 'Español',
        english: 'Inglés', german: 'Alemán', french: 'Francés', italian: 'Italiano', portuguese: 'Portugués',
        japanese: 'Japonés', chinese: 'Chino', russian: 'Ruso', arabic: 'Árabe',
        language: 'Idioma', searchingLyrics: 'Buscando letras...', translating: 'Traduciendo...',
        noLyrics: 'No se encontraron letras para esta canción', noSyncedLyrics: 'Esta canción no tiene letras sincronizadas',
        noSyncedFound: 'No se encontraron letras sincronizadas', noTrackPlaying: 'Sin canción en reproducción',
        lyricsError: 'Error al conectar con el servidor de letras', emptyQueue: 'Sin canciones en la cola',
        noTracks: 'Sin canciones', back: 'Volver', repeat: 'Repetir', shuffle: 'Aleatorio',
        shuffleAll: 'Aleatorio de todas las canciones',
        equalizer: 'Ecualizador', eqVptTab: 'Ajustes / VPT', vptAmbient: 'Sonido de ambiente (VPT)',
        vptOff: 'Desactivado', vptOffDesc: 'Sin efectos de sonido ambiente envolvente',
        vptStudio: 'Estudio', vptStudioDesc: 'Crea el sonido de un estudio de grabación acústico',
        vptClub: 'Club', vptClubDesc: 'Simula el sonido en vivo de un club de música',
        vptAuditorium: 'Auditorio', vptAuditoriumDesc: 'Produce la resonancia amplia de una sala de conciertos',
        searchPlaceholder: 'Buscar canciones, álbumes, artistas...', searchHint: 'Escribe para buscar...',
        visStyle: 'Estilo del Visualizador', visRings: 'Anillos pulsantes', visBars: 'Barras de frecuencia',
        visWave: 'Onda estéreo', visPs3: 'Ondas PS3', visCosmic: 'Cosmic Flow',
        visParticles: 'Partículas del álbum', visBlocks: 'Bloques rítmicos',
        playNext: 'Reproducir siguiente', addToQueue: 'Añadir a la cola', removeFromQueue: 'Eliminar de la cola', play: 'Reproducir',
        musicInfo: 'Información de la música', noName: 'Sin nombre', noAvailable: 'No disponible',
        searchYouTube: 'Buscar canción en YouTube', searchGoogleAlbum: 'Buscar álbum en Google',
        searchGoogleArtist: 'Buscar artista en Google', moreFromArtist: 'Más canciones del artista',
        unknown: 'Desconocido', infoName: 'Nombre', infoArtist: 'Artista', infoAlbum: 'Álbum', infoFile: 'Fichero', audioQuality: 'Calidad de audio',
        sleepTimer: 'Temporizador de sueño', crossfade: 'Fundido entre canciones (Crossfade)', sleepTimerEnd: 'Temporizador de sueño finalizado',
        libraryChanged: 'Biblioteca cambiada', noResults: 'No se encontraron resultados',
        addedToQueue: 'Añadida a la cola', addedToQueueMany: '{kind} añadido ({n} canciones)',
        notInQueue: 'No está en la cola', removedFromQueueToast: 'Eliminada de la cola',
        kindArtist: 'Artista', kindAlbum: 'Álbum', kindPlaylist: 'Playlist',
        coversReady: 'Portadas listas ({n})', noEmbeddedCovers: 'Sin portadas incrustadas',
        loadingSongs: 'Cargando canciones...', refreshSlideshow: 'Recargar side show',
        quotaExceeded: 'Traducción no disponible temporalmente (límite gratuito diario alcanzado)',
        followLyrics: 'Seguir la canción', customization: 'Personalización', effects: 'Efectos', soundControl: 'Control del sonido',
        cardFlare: 'Brillo de carátula al cambiar de canción',
        httpWarning: 'Aviso: todo el tráfico que sea http a partir de ahora será permitido, pero es muy inseguro, ya que todo puede llegar a ser visible para otros usuarios de la red.'
      },
      fr: {
        settings: 'Réglages', accentColor: 'Couleur d\'accent', dynamic: 'Dynamique', custom: 'Personnalisé',
        beatGlow: 'Lueur au rythme', xpspLeds: 'LEDs Xperia SP', sensitivity: 'Sensibilité', low: 'Faible',
        medium: 'Moyenne', high: 'Élevée', changeLibrary: 'Changer la bibliothèque musicale',
        clearCache: 'Vider le cache', fullscreen: 'Plein écran', connectServer: 'Se connecter au Serveur', serverUrl: 'URL du Serveur',
        user: 'Utilisateur', password: 'Mot de passe', connect: 'Connecter', chooseFolder: 'Choisir le dossier musique',
        selectMusicLibrary: 'Sélectionner la bibliothèque musicale', visualizer: 'Visualiseur', search: 'Rechercher',
        myMusicHome: 'Ma musique', songs: 'Chansons', albums: 'Albums', artists: 'Artistes', playlists: 'Listes de lecture',
        serverSettings: 'Paramètres du Serveur', language: 'Langue', original: 'Original', spanish: 'Espagnol',
        english: 'Anglais', french: 'Français', german: 'Allemand', italian: 'Italien', portuguese: 'Portugais',
        lyrics: 'Paroles', translating: 'Traduction...', noLyrics: 'Aucune parole trouvée pour cette chanson',
        equalizer: 'Égaliseur', eqVptTab: 'Réglages / VPT', vptAmbient: 'Son ambiant (VPT)',
        vptOff: 'Désactivé', vptOffDesc: 'Aucun effet sonore ambiant immersif',
        vptStudio: 'Studio', vptStudioDesc: 'Crée le son d\'un studio d\'enregistrement acoustique',
        vptClub: 'Club', vptClubDesc: 'Simule le son en direct d\'un club de musique',
        vptAuditorium: 'Auditorium', vptAuditoriumDesc: 'Produit la résonance large d\'une salle de concert',
        searchPlaceholder: 'Rechercher chansons, albums, artistes...', searchHint: 'Écrivez pour rechercher...',
        visStyle: 'Style du visualiseur', visRings: 'Anneaux pulsants', visBars: 'Barres de fréquence',
        visWave: 'Onde stéréo', visPs3: 'Ondes PS3', visCosmic: 'Cosmic Flow',
        visParticles: 'Particules d\'album', visBlocks: 'Blocs rythmiques',
        playNext: 'Lire ensuite', addToQueue: 'Ajouter à la file', removeFromQueue: 'Retirer de la file', play: 'Lire',
        musicInfo: 'Informations musicales', noName: 'Sans nom', noAvailable: 'Indisponible',
        searchYouTube: 'Rechercher la chanson sur YouTube', searchGoogleAlbum: 'Rechercher l’album sur Google',
        searchGoogleArtist: 'Rechercher l’artiste sur Google', moreFromArtist: 'Plus de chansons de cet artiste',
        unknown: 'Inconnu', infoName: 'Nom', infoArtist: 'Artiste', infoAlbum: 'Album', infoFile: 'Fichier', audioQuality: 'Qualité audio',
        sleepTimer: 'Minuteur de sommeil', crossfade: 'Fondu enchaîné (crossfade)', sleepTimerEnd: 'Minuteur de sommeil terminé',
        libraryChanged: 'Bibliothèque changée', noResults: 'Aucun résultat trouvé',
        addedToQueue: 'Ajouté à la file', addedToQueueMany: '{kind} ajouté ({n} chansons)',
        notInQueue: 'Pas dans la file', removedFromQueueToast: 'Retiré de la file',
        kindArtist: 'Artiste', kindAlbum: 'Album', kindPlaylist: 'Playlist',
        coversReady: 'Pochettes prêtes ({n})', noEmbeddedCovers: 'Aucune pochette intégrée',
        loadingSongs: 'Chargement des chansons...', refreshSlideshow: 'Actualiser le diaporama',
        quotaExceeded: 'Traduction temporairement indisponible (limite gratuite quotidienne atteinte)',
        followLyrics: 'Suivre la chanson', customization: 'Personnalisation', effects: 'Effets', soundControl: 'Contrôle du son',
        cardFlare: 'Lueur de la pochette au changement de chanson',
        httpWarning: 'Attention : tout le trafic HTTP sera autorisé, mais c\'est très peu sûr, car tout peut devenir visible pour d\'autres utilisateurs du réseau.'
      },
      de: {
        settings: 'Einstellungen', accentColor: 'Akzentfarbe', dynamic: 'Dynamisch', custom: 'Benutzerdefiniert',
        beatGlow: 'Rhythmus-Glow', xpspLeds: 'Xperia SP LEDs', sensitivity: 'Empfindlichkeit', low: 'Niedrig',
        medium: 'Mittel', high: 'Hoch', changeLibrary: 'Musikbibliothek ändern', clearCache: 'Cache leeren', fullscreen: 'Vollbild',
        connectServer: 'Mit Server verbinden', serverUrl: 'Server-URL', user: 'Benutzer', password: 'Passwort',
        connect: 'Verbinden', chooseFolder: 'Musikordner wählen', selectMusicLibrary: 'Musikbibliothek wählen',
        visualizer: 'Visualizer', search: 'Suchen', serverSettings: 'Server-Einstellungen', language: 'Sprache',
        myMusicHome: 'Meine Musik', songs: 'Songs', albums: 'Alben', artists: 'Künstler', playlists: 'Wiedergabelisten',
        original: 'Original', spanish: 'Spanisch', english: 'Englisch', german: 'Deutsch', french: 'Französisch',
        italian: 'Italienisch', portuguese: 'Portugiesisch', lyrics: 'Liedtexte', translating: 'Übersetzen...',
        equalizer: 'Equalizer', eqVptTab: 'Einstellungen / VPT', vptAmbient: 'Umgebungsklang (VPT)',
        vptOff: 'Deaktiviert', vptOffDesc: 'Keine immersiven Umgebungsklang-Effekte',
        vptStudio: 'Studio', vptStudioDesc: 'Erzeugt den Klang eines akustischen Aufnahmestudios',
        vptClub: 'Club', vptClubDesc: 'Simuliert den Live-Sound eines Musikclubs',
        vptAuditorium: 'Auditorium', vptAuditoriumDesc: 'Erzeugt die weite Resonanz eines Konzertsaals',
        searchPlaceholder: 'Songs, Alben, Künstler suchen...', searchHint: 'Zum Suchen tippen...',
        visStyle: 'Visualizer-Stil', visRings: 'Pulsierende Ringe', visBars: 'Frequenzbalken',
        visWave: 'Stereo-Welle', visPs3: 'PS3-Wellen', visCosmic: 'Cosmic Flow',
        visParticles: 'Album-Partikel', visBlocks: 'Rhythmische Blöcke',
        playNext: 'Als Nächstes abspielen', addToQueue: 'Zur Warteschlange hinzufügen', play: 'Abspielen',
        removeFromQueue: 'Aus der Warteschlange entfernen', musicInfo: 'Musikinformationen', noName: 'Ohne Namen',
        searchYouTube: 'Song auf YouTube suchen', searchGoogleAlbum: 'Album auf Google suchen',
        searchGoogleArtist: 'Künstler auf Google suchen', moreFromArtist: 'Mehr Lieder dieses Künstlers',
        noAvailable: 'Nicht verfügbar', unknown: 'Unbekannt', infoName: 'Name', infoArtist: 'Künstler',
        infoAlbum: 'Album', infoFile: 'Datei', audioQuality: 'Audioqualität', libraryChanged: 'Bibliothek geändert', noResults: 'Keine Ergebnisse gefunden',
        sleepTimer: 'Schlaftimer', crossfade: 'Überblendung (Crossfade)', sleepTimerEnd: 'Schlaftimer beendet',
        addedToQueue: 'Zur Warteschlange hinzugefügt', addedToQueueMany: '{kind} hinzugefügt ({n} Songs)',
        notInQueue: 'Nicht in der Warteschlange', removedFromQueueToast: 'Aus der Warteschlange entfernt',
        kindArtist: 'Künstler', kindAlbum: 'Album', kindPlaylist: 'Playlist',
        coversReady: 'Cover bereit ({n})', noEmbeddedCovers: 'Keine eingebetteten Cover',
        loadingSongs: 'Songs werden geladen...', refreshSlideshow: 'Diashow aktualisieren',
        quotaExceeded: 'Übersetzung vorübergehend nicht verfügbar (tägliches kostenloses Limit erreicht)',
        followLyrics: 'Dem Lied folgen', customization: 'Anpassung', effects: 'Effekte', soundControl: 'Tonsteuerung',
        cardFlare: 'Cover-Lichtwechsel beim Liedwechsel',
        httpWarning: 'Warnung: Der gesamte HTTP-Verkehr wird erlaubt, aber das ist sehr unsicher, da alles für andere Benutzer im Netzwerk sichtbar werden kann.'
      },
      it: {
        settings: 'Impostazioni', accentColor: 'Colore accento', dynamic: 'Dinamico', custom: 'Personalizzato',
        beatGlow: 'Bagliore a ritmo', xpspLeds: 'LED Xperia SP', sensitivity: 'Sensibilità', low: 'Bassa',
        medium: 'Media', high: 'Alta', changeLibrary: 'Cambia libreria musicale', clearCache: 'Svuota cache', fullscreen: 'Schermo intero',
        connectServer: 'Connetti al Server', serverUrl: 'URL del Server', user: 'Utente', password: 'Password',
        connect: 'Connetti', chooseFolder: 'Scegli cartella musicale', selectMusicLibrary: 'Seleziona libreria musicale',
        visualizer: 'Visualizzatore', search: 'Cerca', serverSettings: 'Impostazioni Server', language: 'Lingua',
        myMusicHome: 'La mia musica', songs: 'Canzoni', albums: 'Album', artists: 'Artisti', playlists: 'Playlist',
        original: 'Originale', spanish: 'Spagnolo', english: 'Inglese', german: 'Tedesco', french: 'Francese',
        italian: 'Italiano', portuguese: 'Portoghese', lyrics: 'Testi', translating: 'Traduzione...',
        equalizer: 'Equalizzatore', eqVptTab: 'Impostazioni / VPT', vptAmbient: 'Audio ambientale (VPT)',
        vptOff: 'Disattivato', vptOffDesc: 'Nessun effetto sonoro ambientale immersivo',
        vptStudio: 'Studio', vptStudioDesc: 'Crea il suono di uno studio di registrazione acustico',
        vptClub: 'Club', vptClubDesc: 'Simula il suono dal vivo di un club musicale',
        vptAuditorium: 'Auditorium', vptAuditoriumDesc: 'Produce l\'ampia risonanza di una sala da concerto',
        searchPlaceholder: 'Cerca canzoni, album, artisti...', searchHint: 'Digita per cercare...',
        visStyle: 'Stile visualizzatore', visRings: 'Anelli pulsanti', visBars: 'Barre di frequenza',
        visWave: 'Onda stereo', visPs3: 'Onde PS3', visCosmic: 'Cosmic Flow',
        visParticles: 'Particelle dell\'album', visBlocks: 'Blocchi ritmici',
        playNext: 'Riproduci successiva', addToQueue: 'Aggiungi alla coda', removeFromQueue: 'Rimuovi dalla coda', play: 'Riproduci',
        musicInfo: 'Informazioni musicali', noName: 'Senza nome', noAvailable: 'Non disponibile',
        searchYouTube: 'Cerca canzone su YouTube', searchGoogleAlbum: 'Cerca album su Google',
        searchGoogleArtist: 'Cerca artista su Google', moreFromArtist: 'Altre canzoni di questo artista',
        unknown: 'Sconosciuto', infoName: 'Nome', infoArtist: 'Artista', infoAlbum: 'Album', infoFile: 'File', audioQuality: 'Qualità audio',
        sleepTimer: 'Timer di spegnimento', crossfade: 'Dissolvenza incrociata (crossfade)', sleepTimerEnd: 'Timer di spegnimento terminato',
        libraryChanged: 'Libreria cambiata', noResults: 'Nessun risultato trovato',
        addedToQueue: 'Aggiunto alla coda', addedToQueueMany: '{kind} aggiunto ({n} canzoni)',
        notInQueue: 'Non è in coda', removedFromQueueToast: 'Rimosso dalla coda',
        kindArtist: 'Artista', kindAlbum: 'Album', kindPlaylist: 'Playlist',
        coversReady: 'Copertine pronte ({n})', noEmbeddedCovers: 'Nessuna copertina incorporata',
        loadingSongs: 'Caricamento canzoni...', refreshSlideshow: 'Aggiorna presentazione',
        quotaExceeded: 'Traduzione temporaneamente non disponibile (limite gratuito giornaliero raggiunto)',
        followLyrics: 'Segui la canzone', customization: 'Personalizzazione', effects: 'Effetti', soundControl: 'Controllo del suono',
        cardFlare: 'Luce della copertina al cambio di canzone',
        httpWarning: 'Avviso: tutto il traffico HTTP sarà consentito, ma è molto insicuro, poiché tutto può diventare visibile ad altri utenti della rete.'
      },
      pt: {
        settings: 'Configurações', accentColor: 'Cor de destaque', dynamic: 'Dinâmico', custom: 'Personalizado',
        beatGlow: 'Brilho no ritmo', xpspLeds: 'LEDs Xperia SP', sensitivity: 'Sensibilidade', low: 'Baixa',
        medium: 'Média', high: 'Alta', changeLibrary: 'Alterar biblioteca musical', clearCache: 'Limpar cache', fullscreen: 'Tela cheia',
        connectServer: 'Conectar ao Servidor', serverUrl: 'URL do Servidor', user: 'Utilizador', password: 'Senha',
        connect: 'Conectar', chooseFolder: 'Escolher pasta de música', selectMusicLibrary: 'Selecionar biblioteca musical',
        visualizer: 'Visualizador', search: 'Pesquisar', serverSettings: 'Configurações do Servidor', language: 'Idioma',
        myMusicHome: 'Minha música', songs: 'Músicas', albums: 'Álbuns', artists: 'Artistas', playlists: 'Listas de reprodução',
        original: 'Original', spanish: 'Espanhol', english: 'Inglês', german: 'Alemão', french: 'Francês',
        italian: 'Italiano', portuguese: 'Português', lyrics: 'Letras', translating: 'A traduzir...',
        equalizer: 'Equalizador', eqVptTab: 'Configurações / VPT', vptAmbient: 'Som ambiente (VPT)',
        vptOff: 'Desativado', vptOffDesc: 'Sem efeitos de som ambiente imersivos',
        vptStudio: 'Estúdio', vptStudioDesc: 'Cria o som de um estúdio de gravação acústico',
        vptClub: 'Clube', vptClubDesc: 'Simula o som ao vivo de um clube de música',
        vptAuditorium: 'Auditório', vptAuditoriumDesc: 'Produz a ampla ressonância de uma sala de concertos',
        searchPlaceholder: 'Pesquisar músicas, álbuns, artistas...', searchHint: 'Escreva para pesquisar...',
        visStyle: 'Estilo do visualizador', visRings: 'Anéis pulsantes', visBars: 'Barras de frequência',
        visWave: 'Onda estéreo', visPs3: 'Ondas PS3', visCosmic: 'Cosmic Flow',
        visParticles: 'Partículas do álbum', visBlocks: 'Blocos rítmicos',
        playNext: 'Reproduzir a seguir', addToQueue: 'Adicionar à fila', removeFromQueue: 'Remover da fila', play: 'Reproduzir',
        musicInfo: 'Informações da música', noName: 'Sem nome', noAvailable: 'Indisponível',
        searchYouTube: 'Pesquisar música no YouTube', searchGoogleAlbum: 'Pesquisar álbum no Google',
        searchGoogleArtist: 'Pesquisar artista no Google', moreFromArtist: 'Mais músicas deste artista',
        unknown: 'Desconhecido', infoName: 'Nome', infoArtist: 'Artista', infoAlbum: 'Álbum', infoFile: 'Arquivo', audioQuality: 'Qualidade de áudio',
        sleepTimer: 'Temporizador de sono', crossfade: 'Fusão entre faixas (crossfade)', sleepTimerEnd: 'Temporizador de sono finalizado',
        libraryChanged: 'Biblioteca alterada', noResults: 'Nenhum resultado encontrado',
        addedToQueue: 'Adicionado à fila', addedToQueueMany: '{kind} adicionado ({n} músicas)',
        notInQueue: 'Não está na fila', removedFromQueueToast: 'Removido da fila',
        kindArtist: 'Artista', kindAlbum: 'Álbum', kindPlaylist: 'Playlist',
        coversReady: 'Capas prontas ({n})', noEmbeddedCovers: 'Sem capas incorporadas',
        loadingSongs: 'A carregar músicas...', refreshSlideshow: 'Atualizar apresentação',
        quotaExceeded: 'Tradução temporariamente indisponível (limite gratuito diário atingido)',
        followLyrics: 'Seguir a música', customization: 'Personalização', effects: 'Efeitos', soundControl: 'Controle de som',
        cardFlare: 'Brilho da capa ao mudar de música',
        httpWarning: 'Aviso: todo o tráfego HTTP será permitido, mas é muito inseguro, já que tudo pode tornar-se visível para outros utilizadores da rede.'
      }
    };

    let currentLang = 'en';
    // Mapeo de nombres de idioma (DEFAULT_LANGUAGE) a códigos
    const LANG_CODES = {
      'English': 'en', 'Español': 'es', 'Français': 'fr',
      'Deutsch': 'de', 'Italiano': 'it', 'Português': 'pt'
    };
    // Mapeo de tipos de servidor (DEFAULT_SERVER_TYPE) a minúsculas
    const SERVER_TYPE_CODES = {
      'Emby': 'emby', 'Jellyfin': 'jellyfin', 'Plex': 'plex', 'Local': 'local'
    };
    function normalizeServerType(v) {
      if (!v) return '';
      const key = String(v).trim();
      return SERVER_TYPE_CODES[key]
        || SERVER_TYPE_CODES[key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()]
        || '';
    }
    function t(key) {
      const dict = I18N[currentLang] || I18N.en;
      return dict[key] !== undefined ? dict[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
    }
    function getLang() {
      const saved = loadLS('walkman_lang');
      if (saved) return saved;
      // Fallback al idioma por defecto desde WALKMAN_CONFIG (DEFAULT_LANGUAGE)
      const langName = (window.WALKMAN_CONFIG && window.WALKMAN_CONFIG.language) || '';
      const code = LANG_CODES[langName] || '';
      return code || 'en';
    }
    function setLang(lang) {
      currentLang = I18N[lang] ? lang : 'en';
      saveLS('walkman_lang', currentLang);
      applyI18n();
      syncLangSelectors();
    }
    function syncLangSelectors() {
      document.querySelectorAll('.lang-select').forEach(sel => { sel.value = currentLang; });
    }
    function applyI18n() {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.setAttribute('placeholder', t(key));
      });
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.setAttribute('title', t(key));
      });
      if (typeof renderVptCards === 'function' && document.getElementById('vpt-current-name')) {
        renderVptCards();
      }
    }
    currentLang = getLang();


    const categoryKeys = { 'Songs': 'songs', 'Albums': 'albums', 'Artists': 'artists', 'Playlists': 'playlists', 'Playlist': 'playlists' };
    function tCategory(category) { return t(categoryKeys[category] || category); }
