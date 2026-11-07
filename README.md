# walkman-server
Small music player for Emby, Jellyfin, and Plex with the style of the Walkman app of Xpetia NXT series

# Access without install on presmise
You can access in this link: https://djmanri3.github.io/walkman-server/

## Recommended Web Browsers
### Windows
- Google Chrome
- Microsoft Edge
- Firefox
- Zen Browser
- Samsung Internet Browser
  
### Android
- Google Chrome
- Google Chrome (WebApp)
- Samsung Internet Browser
- Samsung Internet Browser (WebApp)

### MacOs
- Firefox
- Zen Browser
- Chrome
- Safari (only rewind and ast-forward)

### iOS and iPadOS (iPad and iPhone) [NO VIEW ALBUM ART]
- Safari (WebApp) (not show album art but gets next and previous buttons)
- Google Chrome (not button to next or previous song, only advance or rewind 30 seconds)
- Brave (not button to next/previous song, only advance or rewind 30 seconds)
- Firefox (not button to next/previous song, only advance or rewind 30 seconds)
- Opera Browser (not button to next/previous song, only advance or rewind 30 seconds)

# How to install on premise
- Do you need to install Docker and docker-compose
- Only download docker-compose.yaml file and exec in the same folder you donwload it
```
docker-compose up -d
```
- And acces to <ip server or locahost>:8081

# Features
- Native equaliser with 5 bands [not working on iPad and iPhone]
- Open Bass: an independently written bass effect using public DSP equations and runtime-calculated coefficients. Uses AudioWorklet on HTTPS/localhost and the same DSP in compatible mode over plain HTTP, with a final anti-clipping guard. [Design, validation and provenance](docs/open-bass.md). Audio effects remain disabled on iPad and iPhone.
- Add equaliser space (VPT) with 3 profiles [not working on iPad and iPhone]
- Add song visualizer
  - Anillos pulsantes
  - Barras de frecuencia
  - Onda estéreo
  - Ondas PS3
  - Cosmic Flow
  - Particulas del álbum
  - Bloques ritmicos
- Fix search
- Add buttons of playlist, repeat, repeat playlist and shuffle
- View in carousel mode
- Background colour adapts to album cover
- Add install on smartphone with web app
- Compatible with medIa widget browser 
- Add connection with Emby, Jellyfin, Plex AND LOCAL!!!
- FIX LIST ALBUM COVERS ON EMBY SERVERS!!!!!
- Add Side Show of albums on tab My Music (can be disable on settings)
- Add reorder song on play queue
- Fix auto-close equaliser when clic or touch on another part
- Fix clean cache
- Add settings to resize some things
- Fix add song by Album on play queue
- Add banner when adding local music on Android to wait ready
- Update lib of get album color
- Add a glow adjustment based on the song's rhythm on settings.
- Add option on settings to simulate LED effect of Xperia SP LEDs
- Add option to view lyrics, lyrics get from service LRCLIB and translated into your language use api.memory.translated.net
- Fix connection to Plex servers and fix getting data from them (Songs, Artists, Albums and Playlists)
- Add menu when clic or touch on an album cover is playing with these options:
  - Search song on YouTube
  - Search album on Google
  - Search artist on Google
  - More songs from this artist
- Add config parameters on docker-compose
  - DEFAULT_LANGUAGE: English, Español, Français, Deutsch, Italiano or Português
  - DEFAULT_SERVER_TYPE: Emby, Jellyfin, Plex or Local
  - DEFAULT_SERVER_URL: your server URL
- Add media controls with keyboard
  - r: repeat song mode
  - s: random song mode
  - ->: next song
  - <-: previous song
  - space bar: play/pause
- Enable or disable auto scroll on lyrics
- Redesign settings menu
- Add hi-res icon when music is hi-res
- Application security improved

### Version 3.0
- Add icon when song is Hi-Res audio (can be disable on settings)
- Favorites on My music tab added
- Added can add song to playlist
- Add independent Open Bass DSP with HTTP support and output limiting
- Add more visualizer effects
- Add new Classic theme
- Refine Xperia SP light bar with paired pulses and adaptive album color
- Add interactive album swipe animations for Modern and Classic themes
- Harden metadata rendering, cover parsing and service worker caching
- Add show app version in settings and Walkman easter egg ;)
- Center desktop navigation (Playing and My music text) while preserving mobile header layout
- Animate overflowing Playing titles in Modern and Classic themes


# Bugs
- Tell me :)

# Screenshots

## Player
### Theme Modern
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-server/blob/dev/Demo_images/Player_Modern.png?raw=true" />

### Theme Classic
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-server/blob/dev/Demo_images/Player_Classic.png?raw=true" />

### Settings
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-server/blob/dev/Demo_images/Settings.png?raw=true" />

## Player search
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-server/blob/main/Demo_images/Playing_search.png?raw=true" />

## Lyrics
### Theme Modern
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-server/blob/main/Demo_images/Lyris_Modern.png?raw=true" />

### Theme Classic
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-server/blob/main/Demo_images/Lyris_Classic.png?raw=true" />

## Ecualizer
### Clear bass
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-emby/blob/main/Demo_images/Ecualizer_clear_bass.png?raw=true" />

### Spatial Equaliser (VTP)
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-emby/blob/main/Demo_images/Ecualizer_VPT.png?raw=true" />

## Visualizer
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-emby/blob/main/Demo_images/Visualizer.png?raw=true" />

## Library
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-emby/blob/main/Demo_images/Library.png?raw=true" />

### Songs
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-emby/blob/main/Demo_images/Songs.png?raw=true" />

### Artists
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-emby/blob/main/Demo_images/Artists.png?raw=true" />

### Albums
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-emby/blob/main/Demo_images/Albums.png?raw=true" />

### Playlist
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-emby/blob/main/Demo_images/Playlist.png?raw=true" />

### Inside of playlists
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-emby/blob/main/Demo_images/Inside_playlist.png?raw=true" />

### Connect to server or local
#### Emby
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-server/blob/main/Demo_images/Connect_to_server_or_local_Emby.png?raw=true" />

#### Jellyfin
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-server/blob/main/Demo_images/Connect_to_server_or_local_Jellyfin.png?raw=true" />

#### Plex
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-server/blob/main/Demo_images/Connect_to_server_or_local_Plex.png?raw=true" />

#### Local
<img width="1915" height="952" alt="image" src="https://github.com/djmanri3/walkman-server/blob/main/Demo_images/Connect_to_server_or_local_Local.png?raw=true" />
