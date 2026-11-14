const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'music-theme-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'music-theme-test-'));
chrome=spawn('/usr/bin/google-chrome',['--headless','--disable-background-timer-throttling','--disable-renderer-backgrounding','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
let tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',raw=>{let m=JSON.parse(raw);if(m.method==='Runtime.consoleAPICalled')console.log('CONSOLE',JSON.stringify(m.params.args));if(m.method==='Runtime.exceptionThrown')console.error('EXCEPTION',JSON.stringify(m.params.exceptionDetails));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{let n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{let r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1900,height:700,deviceScaleFactor:1,mobile:false});
await command('Page.navigate',{url:fileMode?require('node:url').pathToFileURL(path.join(root,'index.html')).href:'http://127.0.0.1:'+server.address().port+'/'});

for(let i=0;i<400;i++){if(await run("document.readyState==='complete' && typeof toggleVisualizerView==='function' && typeof audio!=='undefined'"))break;await new Promise(r=>setTimeout(r,100));}

await run(`(async()=>{
 const rate=44100,count=rate*10,bytes=new Uint8Array(44+count*2),v=new DataView(bytes.buffer);
 const text=(off,s)=>{for(let i=0;i<s.length;i++)bytes[off+i]=s.charCodeAt(i)};
 text(0,'RIFF');v.setUint32(4,36+count*2,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,count*2,true);
 for(let i=0;i<count;i++)v.setInt16(44+i*2,(Math.sin(i*2*Math.PI*220/rate)+Math.sin(i*2*Math.PI*880/rate))*6000,true);
 audio.src=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));audio.loop=true;
 initAudioContext();await audioCtx.resume();await audio.play();
 document.getElementById('emby-modal').style.display='none';
})()`);

await run(`(()=>{
 const cover=color=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="'+color+'"/><path d="M160 80v190a35 35 0 1 1-20-32V100l120-20v150a35 35 0 1 1-20-32V60z" fill="white"/></svg>');
 playlist=['#ac00c8','#b6bf60','#244f6f'].map((color,i)=>({Id:'theme-'+i,Name:['1000 Faces','Second song','Third song'][i],Artists:['Jason Ross, Dia Frampton'],Album:'1000 Faces (Single)',IsLocal:true,coverUrl:cover(color),objUrl:audio.src}));
 currentTrackIndex=0;playTrack(0);return true;
})()`);
await new Promise(r=>setTimeout(r,500));

await run(`(()=>{
 const cover='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#eeebe9"/><path d="M80 0h210a70 70 0 0 1 0 140H180a65 65 0 0 0 0 130h250a70 70 0 0 1 0 140H240a60 60 0 0 0 0 120h230" fill="none" stroke="#cfad39" stroke-width="90"/><text x="300" y="290" font-size="112" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="#6d2d15">ANUAL</text><text x="300" y="340" font-size="22" text-anchor="middle" fill="#777">EL ÁLBUM DANCE DEL AÑO 2014</text></svg>');
 playlist=playlist.map((track,i)=>({...track,Type:'Audio',Name:['#1 (Colors) - Vocal Edit','4 Ever Happy','A Little More'][i],Artists:['Rivaz'],Album:'Anual 2014',coverUrl:i===0?cover:track.coverUrl,MediaSources:[{Container:'mp3',Bitrate:320000,MediaStreams:[{Type:'Audio',Codec:'mp3',SampleRate:44100,Channels:2}]}]}));
 playlist[2].MediaSources=[{Container:'flac',MediaStreams:[{Type:'Audio',Codec:'flac'}]}];
 originalPlaylist=[...playlist];localTracks=playlist.map((track,i)=>({...track,CreateDate:new Date(2026,0,i+1).toISOString()}));embyConfig.serverType='local';currentTrackIndex=0;playTrack(0,true);setPlayingTheme('music');
})()`);
await new Promise(r=>setTimeout(r,500));
assert.equal(await run("document.querySelector('[data-playing-theme=music]').getAttribute('aria-pressed')"),'true');
assert.equal(await run("document.getElementById('music-track-quality').textContent"),'MP3 320 kbps');
const screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'))};
for(const [width,height] of [[1341,772],[844,390],[798,399],[390,844],[320,640],[768,1024],[640,360]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,300));
 const boxes=await run(`(()=>{
  const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  return {art:box('#card-current'),info:box('.track-header-wrapper'),controls:box('.controls'),progress:box('#progress-bar'),repeat:box('#repeat-btn'),shuffle:box('#shuffle-btn'),title:box('#track-title'),play:box('.control-btn.play'),prev:box('.controls .control-btn'),next:box('.controls .control-btn:last-child'),header:box('header')};
 })()`);
 for(const key of ['art','info','controls','progress','repeat','shuffle','play','prev','next']) {
  const b=boxes[key];assert(b.x>=-1 && b.right<=width+1 && b.width>0,key+' outside width '+width+': '+JSON.stringify(b));
  assert(b.y>=0,key+' above viewport '+width);
 }
 for(const key of ['play','prev','next'])assert(Math.abs(boxes[key].width-boxes[key].height)<1,'Distorted circle '+key+' at '+width);
 assert(boxes.progress.bottom<boxes.play.y,'Progress bar is not above transport');
 assert(boxes.repeat.right<=boxes.prev.x+1 && boxes.next.right<=boxes.shuffle.x+1,'Modes overlap transport at '+width);
 if(width>=640 && width/height>=1.2)assert(boxes.art.right<boxes.info.x,'Landscape is not split into two columns');
 else assert(boxes.art.bottom<=boxes.info.y+1,'Portrait cover overlaps metadata');
 assert(await run("getComputedStyle(document.getElementById('card-prev')).display==='none' && getComputedStyle(document.getElementById('card-next')).display==='none'"));
 assert.equal(await run("getComputedStyle(document.querySelector('.volume-container')).display"),'none');
 const headerAlignment=await run("(()=>{const a=document.querySelector('.header-search').getBoundingClientRect(),b=document.querySelector('.z1-header-more').getBoundingClientRect();return {search:a.top+a.height/2,more:b.top+b.height/2,width:a.width,height:a.height}})()");
 assert(Math.abs(headerAlignment.search-headerAlignment.more)<.5 && headerAlignment.width===32 && headerAlignment.height===44,'Search is misaligned at '+width);
 assert(await run('!audio.paused'),'Theme changed playback');
 await screenshot('music-'+width);
 console.log('PASS Music layout',width,height);
}
await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
assert.equal(await run("document.getElementById('emby-modal').style.display"),'none','Startup modal unexpectedly covers the player');
await run("document.getElementById('music-track-favorite').click()");await new Promise(r=>setTimeout(r,100));
assert.equal(await run("document.getElementById('music-track-favorite').getAttribute('aria-pressed')"),'true');
await run("document.getElementById('music-track-favorite').click()");await new Promise(r=>setTimeout(r,100));
assert.equal(await run("document.getElementById('music-track-favorite').getAttribute('aria-pressed')"),'false');
await run('togglePlay()');assert(await run('audio.paused'));await run('togglePlay()');
await run("document.querySelector('.z1-header-more').click()");
assert.notEqual(await run("getComputedStyle(document.querySelector('.header-secondary-actions')).display"),'none');
await screenshot('music-more');await run('closeZ1HeaderMenu()');
await run("document.querySelector('.z1-header-back').click()");
assert(await run("document.getElementById('view-music').classList.contains('active') && !document.getElementById('z1-mini-player').hidden"));
assert.equal(await run("document.querySelectorAll('#music-library-cards .music-library-card').length"),3);
assert.equal(await run("getComputedStyle(document.getElementById('home-grid')).display"),'none');
assert.equal(await run("document.querySelector('#music-recent-cards .music-library-card-title').textContent"),'A Little More');
await screenshot('music-library');
await run("document.querySelector('.z1-header-back').click()");
assert(await run("!document.getElementById('music-navigation').hidden"));
await screenshot('music-navigation');
await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
assert(await run("document.getElementById('music-navigation').hidden"));
await run("document.querySelectorAll('.music-library-track')[1].click()");
assert.equal(await run('currentTrackIndex'),1);assert(await run('!audio.paused'));
await run("openMusicQueue()");assert(await run("document.getElementById('queue-drawer').classList.contains('open')"));await run('toggleQueueDrawer()');
await run("setPlayingTheme('modern')");
assert.equal(await run("getComputedStyle(document.getElementById('music-track-quality')).display"),'none');
assert.equal(await run("getComputedStyle(document.querySelector('.music-track-action')).display"),'none');
assert.notEqual(await run("getComputedStyle(document.querySelector('.volume-container')).display"),'none');
await run("setPlayingTheme('music');navigateMusicTheme('home')");
await run("document.querySelector('#music-recent-cards .music-library-track').click()");
assert.equal(await run('playlist[currentTrackIndex].Name'),'A Little More');
assert.equal(await run('isShuffle'),false);assert(await run('!audio.paused'));
assert.equal(await run("document.querySelector('#music-track-quality .music-hr-badge').textContent"),'HR');
assert.equal(await run('isHiResAudio(playlist[currentTrackIndex])'),false,'Fixture must cover FLAC without sample rate');
await run('togglePlayingHiRes()');assert(await run("document.querySelector('#music-track-quality .music-hr-badge').hidden"));
await run('togglePlayingHiRes()');assert(await run("!document.querySelector('#music-track-quality .music-hr-badge').hidden"));
await run("playlist[currentTrackIndex].MediaSources[0].MediaStreams[0].SampleRate=48000;playlist[currentTrackIndex].MediaSources[0].MediaStreams[0].BitDepth=24;updateMusicThemeData()");
assert.equal(await run("document.getElementById('music-track-quality').textContent"),'FLAC 48 kHz / 24 bit HR');
assert.equal(await run("getComputedStyle(document.getElementById('hires-badge')).display"),'none','HR must not overlay the album cover');
assert.equal(await run("document.querySelector('.music-library-card .music-hr-badge')"),null,'HR must not overlay card artwork');
await screenshot('music-flac-hr');
await run(`(async()=>{
 localTracks=localTracks.map((track,i)=>({...track,Path:'song-'+i+'.mp3',Duration:180+i*10,AlbumArtist:'Rivaz'}));
 localTracks.push({Id:'other-song',Type:'Audio',Name:'Other Song',Artists:['Second Artist'],AlbumArtist:'Second Artist',Album:'Second Album',Path:'other.mp3',Duration:205,IsLocal:true,objUrl:audio.src,coverUrl:localTracks[0].coverUrl});
 localTracks.push({Id:'local-mix',Type:'Playlist',Name:'My mix',PlaylistIds:[localTracks[0].Id,localTracks[1].Id],Count:2,IsLocal:true});
 favoritesStore={songs:{},albums:{}};await setFavorite(localTracks[0],true);
})()`);
await run("navigateMusicTheme('home');document.querySelector('.z1-header-more').click()");
assert.notEqual(await run("getComputedStyle(document.querySelector('.header-secondary-actions')).display"),'none','Home overflow menu is missing');
assert(await run("!document.querySelector('.music-home-action').hidden"));
await screenshot('music-home-overflow');await run('closeZ1HeaderMenu()');
await run("document.querySelector('.z1-header-back').click()");
assert.equal(await run("document.querySelectorAll('#music-navigation .music-nav-icon').length"),8);
await screenshot('music-navigation-icons');await run('closeMusicNavigation()');
for(const category of ['Albums','Artists','Playlists','Songs']) {
 await run(`navigateMusicTheme('${category}')`);
 assert(await run('document.body.classList.contains("music-library-open")'));
 assert.equal(await run(`document.querySelector('[data-music-category=${category}]').getAttribute('aria-selected')`),'true');
 assert.equal(await run("getComputedStyle(document.querySelector('#list-view > .back-btn')).display"),'none');
 assert((await run("document.querySelectorAll('#items-container .music-media-row').length"))>0);
 assert(await run("document.querySelector('#items-container .list-item').getBoundingClientRect().top >= document.getElementById('music-library-tabs').getBoundingClientRect().bottom-1"),'Tabs obscure the first row in '+category);
 if(category==='Artists')assert((await run("document.querySelectorAll('#items-container .music-row-placeholder').length"))>0,'Missing artist initials');
 if(category==='Playlists')assert.equal(await run("document.querySelector('#items-container .music-row-subtitle').textContent"),'2 songs');
 if(category==='Songs') {
  assert.equal(await run("document.querySelector('.music-row-format > span:last-child').textContent"),'MP3');
  assert.equal(await run("document.querySelector('.music-row-duration').textContent"),'03:00');
  assert.equal(await run("document.querySelector('#items-container .music-media-row').querySelector('.music-hr-badge')"),null,'MP3 received an HR marker');
  assert.equal(await run("[...document.querySelectorAll('#items-container .music-media-row')].find(row=>row._musicPresentation[0].Id==='theme-2').querySelector('.music-hr-badge').textContent"),'HR');
 }
 await screenshot('music-category-'+category);
}
await run("document.querySelector('.music-header-sort').click()");
assert.notEqual(await run("getComputedStyle(document.getElementById('list-sortbar')).display"),'none');
await run('toggleMusicLibrarySort()');
await run(`(async()=>{
 window.originalLibraryFetch=fetchItems;
 let delaySongs=true;
 fetchItems=(type,...args)=>{
  if(type==='Audio' && delaySongs){delaySongs=false;return new Promise(resolve=>{window.resolveSlowSongs=()=>resolve({Items:[localTracks[0]],TotalRecordCount:1})});}
  return originalLibraryFetch(type,...args);
 };
 window.slowSongs=navigateMusicTheme('Songs');
 await navigateMusicTheme('Albums');resolveSlowSongs();await slowSongs;fetchItems=originalLibraryFetch;
})()`);
assert.equal(await run('currentCategory'),'Albums');
assert(await run("currentCategoryItems.every(item=>item.Type==='MusicAlbum')"),'A late songs response overwrote the Albums tab');
await run("navigateMusicTheme('Albums')");
await run("document.querySelector('#items-container .list-item').click()");
for(let i=0;i<100;i++){if(await run("document.body.classList.contains('music-detail-open') && !!subItems"))break;await new Promise(r=>setTimeout(r,30));}
assert(await run("!document.getElementById('music-detail-header').hidden"));
assert.equal(await run("getComputedStyle(document.querySelector('.music-row-number')).display"),'block');
await screenshot('music-album-detail');
await run("document.querySelector('.z1-header-back').click()");
assert.equal(await run("document.querySelector('.z1-header-back span').textContent"),'menu');
await run("navigateMusicTheme('favorites')");
assert.equal(await run("document.querySelector('[data-music-category=Favorites]').getAttribute('aria-selected')"),'true');
assert.equal(await run("document.querySelectorAll('#items-container .music-media-row').length"),1);
assert(await run("!document.getElementById('music-detail-header').hidden"));
await screenshot('music-favorites-songs');
await run("loadFavorites('Albums')");assert.equal(await run("document.querySelector('[data-music-favorites=Albums]').getAttribute('aria-selected')"),'true');
await screenshot('music-favorites-albums');
await run("setPlayingTheme('classic')");
assert.equal(await run("getComputedStyle(document.getElementById('music-library-tabs')).display"),'none');
assert.notEqual(await run("getComputedStyle(document.querySelector('#list-view > .back-btn')).display"),'none');
await run("setPlayingTheme('music');navigateMusicTheme('home')");
await run(`(()=>{
 window.recentRealFetch=window.fetch;
 window.recentQueries=[];window.recentFailure=false;
 window.fetch=async(input,options)=>{
  const url=new URL(String(input.url||input),location.href);
  if(!url.pathname.startsWith('/recent-test'))return recentRealFetch(input,options);
  recentQueries.push(url.href);
  if(recentFailure)return new Response('{}',{status:503});
  if(embyConfig.serverType==='plex')return new Response(JSON.stringify({MediaContainer:{Metadata:[
   {ratingKey:'older',type:10,title:'Older Plex',grandparentTitle:'Artist',addedAt:1700000000},
   {ratingKey:'newer',type:10,title:'Newer Plex',grandparentTitle:'Artist',addedAt:1800000000}
  ]}}));
  return new Response(JSON.stringify({Items:[
   {Id:'old',Type:'Audio',Name:'Older track',DateCreated:'2025-01-01'},
   {Id:'unknown',Type:'Audio',Name:'Unknown date'},
   {Id:'new',Type:'Audio',Name:'Newest track',DateCreated:'2026-11-14'},
   {Id:'playlist',Type:'Playlist',Name:'Not a song',DateCreated:'2026-12-01'}
  ]}));
 };
})()`);
for(const type of ['emby','jellyfin','plex']) {
 await run(`embyConfig={...embyConfig,serverType:'${type}',host:location.origin+'/recent-test',token:'test-token',userId:'u',libraryId:'recent-library'};navigateMusicTheme('home');loadMusicRecentTracks(true)`);
 assert.equal(await run("document.querySelector('#music-recent-cards .music-library-card-title').textContent"),type==='plex'?'Newer Plex':'Newest track');
 const request=new URL(await run('recentQueries.at(-1)'));
 if(type==='plex'){assert.equal(request.searchParams.get('sort'),'addedAt:desc');assert.equal(request.searchParams.get('X-Plex-Container-Size'),'18');assert(request.pathname.includes('/recent-library/all'));}
 else {assert.equal(request.searchParams.get('ParentId'),'recent-library');assert.equal(request.searchParams.get('SortBy'),'DateCreated');assert.equal(request.searchParams.get('SortOrder'),'Descending');assert.equal(request.searchParams.get('Limit'),'18');assert.equal(await run("document.querySelectorAll('#music-recent-cards .music-library-card').length"),3);}
 const before=await run('recentQueries.length');await run('renderMusicLibrary();loadMusicRecentTracks()');assert.equal(await run('recentQueries.length'),before,'Recent tracks repeatedly fetched while fresh');
}
await run("recentFailure=true;embyConfig.libraryId='unavailable';loadMusicRecentTracks(true)");
assert(await run("!!document.querySelector('#music-recent-cards .music-recent-retry')"),'Failure has no retry action');
await run("recentFailure=false;document.querySelector('#music-recent-cards .music-recent-retry').click()");
await run('musicRecentState.promise');assert.equal(await run('musicRecentState.error'),false);
await run(`(async()=>{
 const real=window.fetch;
 window.fetch=(input,options)=>String(input).includes('ParentId=slow-library')
  ? new Promise(resolve=>{window.resolveOldRecent=()=>resolve(new Response(JSON.stringify({Items:[{Id:'stale',Type:'Audio',Name:'Stale library track',DateCreated:'2026-01-01'}]})))})
  : real(input,options);
 embyConfig.serverType='emby';embyConfig.libraryId='slow-library';window.oldRecentRequest=loadMusicRecentTracks(true);
 embyConfig.libraryId='fresh-library';await loadMusicRecentTracks(true);resolveOldRecent();await oldRecentRequest;
})()`);
assert.equal(await run("document.querySelector('#music-recent-cards .music-library-card-title').textContent"),'Newest track','Old library response replaced the current library');
for(const lang of ['en','es','fr','de','it','pt']){await run(`setLang('${lang}')`);assert.equal(await run("document.getElementById('music-recent-title').textContent"),await run(`I18N.${lang}.musicRecentlyAdded`));}
await run("setLang('es');embyConfig.serverType='local';navigateMusicTheme('home')");
await screenshot('music-newly-added');
await run('window.fetch=recentRealFetch');
assert.equal(await run("loadLS('walkman_playing_theme')"),'music');
await command('Page.reload');await new Promise(r=>setTimeout(r,700));
assert.equal(await run("document.getElementById('view-playing').dataset.theme"),'music');
console.log('PASS Music player, Home overflow, colored navigation, library tabs, rows, album details, favorites, sorting, recent songs and theme isolation');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
