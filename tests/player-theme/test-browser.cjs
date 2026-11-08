const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'player-theme-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'player-theme-test-'));
chrome=spawn('/usr/bin/google-chrome',['--headless','--disable-background-timer-throttling','--disable-renderer-backgrounding','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
let tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',raw=>{let m=JSON.parse(raw);if(m.method==='Runtime.consoleAPICalled')console.log('CONSOLE',JSON.stringify(m.params.args));if(m.method==='Runtime.exceptionThrown')console.error('EXCEPTION',JSON.stringify(m.params.exceptionDetails));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{let n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{let r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1900,height:700,deviceScaleFactor:1,mobile:false});
await command('Page.navigate',{url:fileMode?require('node:url').pathToFileURL(path.join(root,'index.html')).href:'http://127.0.0.1:'+server.address().port+'/'});

for(let i=0;i<100;i++){if(await run("typeof toggleVisualizerView==='function' && typeof audio!=='undefined'"))break;await new Promise(r=>setTimeout(r,100));}

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
assert.equal(await run("document.getElementById('view-playing').dataset.theme"),'modern');
await run("toggleSettingsMenu();openSettingsSection('customization')");
assert.equal(await run("document.querySelectorAll('.playing-theme-option svg.playing-theme-preview').length"),3);
await run("document.querySelector('[data-playing-theme=classic]').click()");
assert.equal(await run("document.querySelector('[data-playing-theme=classic]').getAttribute('aria-pressed')"),'true');
const screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));};
await new Promise(r=>setTimeout(r,650));await screenshot('settings');await run('closeSettingsMenu()');
for(const [width,height] of [[1341,772],[880,400],[390,844],[844,390]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,350));
 const layout=await run(`(()=>{
  const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  return {art:rect('#card-current'),near:rect('#card-prev'),far:rect('#card-next'),title:rect('#track-title'),controls:rect('.controls'),volume:rect('#volume-bar'),progress:rect('#progress-bar'),scroll:document.body.scrollWidth,playing:!audio.paused,album:document.querySelector('#track-album').textContent};
 })()`);
 assert(layout.playing);assert.equal(layout.album,'1000 Faces (Single)');
 assert(layout.volume.width>30 && layout.progress.width>50);
 assert(layout.scroll<=width+1,'Horizontal overflow');
 for(const id of ['art','title','controls','volume','progress']) {
  const box=layout[id];assert(box.x>=0&&box.right<=width+1,id+' outside screen at '+width);
  assert(box.y>=0&&box.bottom<=height+1,id+' below screen at '+width);
 }
 assert(layout.near.right-layout.art.right>layout.art.width*.19,'Next artwork is hidden behind the current cover');
 assert(layout.far.right-layout.near.right>layout.art.width*.13,'Second upcoming artwork is hidden');
 assert(layout.far.right<=width+1,'Stack exceeds viewport');
 if(width>680)assert(layout.far.right<layout.title.x,'Classic stack overlaps the track information');
 await screenshot('classic-'+width);console.log('PASS Classic layout',width,height);
}
assert(await run("document.querySelector('#img-prev').src===playlist[1].coverUrl&&document.querySelector('#img-next').src===playlist[2].coverUrl"));
const firstBackground=await run("document.getElementById('bg-container').style.backgroundImage");
assert.equal(await run("getComputedStyle(document.getElementById('view-playing')).backgroundImage"),'none','Classic hides the adaptive background');
assert.equal(await run("getComputedStyle(document.getElementById('view-playing')).backgroundColor"),'rgba(0, 0, 0, 0)');
await run('nextTrack()');await new Promise(r=>setTimeout(r,800));
assert.notEqual(await run("document.getElementById('bg-container').style.backgroundImage"),firstBackground,'Background did not follow the new artwork');
console.log('PASS Classic adaptive background follows album artwork');
assert.equal(await run("document.querySelector('#playing-queue-position').textContent"),'2/3');
assert.equal(await run("document.querySelector('#track-title').textContent"),'Second song');
assert(await run("document.getElementById('card-next').style.display==='none'"),'End of queue should hide missing upcoming artwork');
await run('(async()=>{playTrack(0);await audio.play();document.getElementById("card-next").click();await audio.play()})()');
assert.equal(await run('currentTrackIndex'),2,'Far artwork must play the second upcoming track');
await run('(async()=>{playTrack(0);await audio.play();document.getElementById("card-prev").click();await audio.play()})()');
assert.equal(await run('currentTrackIndex'),1,'Near artwork must play the next track');
const before=await run('audio.currentTime');
await run("setPlayingTheme('modern')");
assert(await run(`!audio.paused&&audio.currentTime>=${before}`));
assert.equal(await run("getComputedStyle(document.querySelector('#view-playing')).display"),'flex');
assert(await run("document.querySelector('#img-prev').src===playlist[0].coverUrl&&document.querySelector('#img-next').src===playlist[2].coverUrl"));
await screenshot('modern');
// Z1 keeps the shared player while using a portrait Xperia layout.
await run("setPlayingTheme('z1');playTrack(0)");
assert(await run("document.querySelector('#img-prev').src===playlist[1].coverUrl&&document.querySelector('#img-next').src===playlist[2].coverUrl"),'Z1 must show the next two queued covers');
await run("(async()=>{document.getElementById('card-next').click();await audio.play()})()");
assert.equal(await run('currentTrackIndex'),2,'The far Z1 cover must play the second next song');
await run("(async()=>{playTrack(0);await audio.play()})()");
for (const [width,height] of [[1341,772],[390,844],[844,390]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,700));
 const layout=await run(`(()=>{
  const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  return {art:rect('#card-current'),title:rect('#track-title'),controls:rect('.controls'),volume:rect('#volume-bar'),progress:rect('#progress-bar'),scroll:document.body.scrollWidth,playing:!audio.paused,album:document.querySelector('#track-album').textContent};
 })()`);
 assert(layout.playing);assert.equal(layout.album,'1000 Faces (Single)');
 assert(layout.scroll<=width+1,'Z1 horizontal overflow');
 assert(layout.progress.y>=layout.controls.bottom&&layout.progress.y-layout.controls.bottom<=32,'Z1 progress should sit just below transport controls: '+JSON.stringify({width,controls:layout.controls,progress:layout.progress}));
 for(const id of ['art','title','controls','volume','progress']) {
  const box=layout[id];assert(box.width>20,id+' hidden');
  assert(box.x>=0&&box.right<=width+1,id+' outside Z1 screen at '+width);
  assert(box.y>=0&&box.bottom<=height+1,id+' below Z1 screen at '+width);
 }
 if(width/height<1.2) assert(layout.title.bottom<layout.art.y&&layout.art.bottom<layout.controls.y,'Z1 cover overlaps metadata or controls');
 else assert(layout.art.right<layout.title.x,'Z1 landscape must put the cover to the left of the metadata');
 // Scale until the cover fills the screen, then keep all player elements
 // separate by reflowing large covers into their own row.
 for(const zoom of [55,85,100,125,150,175]) {
  await run(`setCarouselZoom(${zoom})`);
  await new Promise(r=>setTimeout(r,650));
  const sizes=await run("({cover:document.getElementById('card-current').offsetWidth,button:document.querySelector('.control-btn.play').offsetWidth})");
  assert(Math.abs(sizes.cover-Math.min(layout.art.width*zoom/100,width-32))<=1,'Z1 cover zoom does not follow its setting at '+zoom+'% on '+width);
  if(zoom===55) layout.buttonWidth=sizes.button;
  else assert.equal(sizes.button,layout.buttonWidth,'Cover zoom resized Z1 transport controls');
  const overlaps=await run(`(()=>{
   const rect=el=>el.getBoundingClientRect();
   const covers=[...document.querySelectorAll('#view-playing .art-card')].filter(el=>getComputedStyle(el).display!=='none').map(rect);
   const content=[document.querySelector('.track-header-wrapper'),document.querySelector('.controls-wrapper')].map(rect);
   return covers.some(a=>content.some(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1));
  })()`);
  assert.equal(overlaps,false,'Z1 covers overlap text or controls at '+zoom+'% on '+width);
  await run("document.querySelector('#view-playing .controls-wrapper').scrollIntoView({block:'nearest'})");
  assert(await run("(()=>{const r=document.querySelector('#view-playing .controls-wrapper').getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight+1})()"),'Z1 controls cannot be reached at '+zoom+'%');
 }
 await screenshot('z1-large-'+width);
 await run("setCarouselZoom(100);document.getElementById('view-playing').scrollTop=0");
 await new Promise(r=>setTimeout(r,650));
 await screenshot('z1-'+width);
}
assert.equal(await run("getComputedStyle(document.querySelector('#view-playing .control-btn')).borderTopColor"),'rgb(255, 255, 255)');
assert.equal(await run("getComputedStyle(document.querySelector('#track-album')).display"),'block');
// Z1 may add a translucent texture, but cannot cover the shared adaptive color.
assert.equal(await run("getComputedStyle(document.getElementById('view-playing')).backgroundColor"),'rgba(0, 0, 0, 0)');
assert.equal(await run("getComputedStyle(document.getElementById('view-playing')).backgroundImage.includes('radial-gradient')"),false);
const z1Background=await run("document.getElementById('bg-container').style.backgroundImage");
assert(z1Background.includes('50% 45%') && z1Background.includes('100%'),'Z1 should tint the whole background');
assert(!z1Background.includes('rgb(5, 5, 5)'),'Z1 edges should retain the artwork hue');
await run("switchTab('music')");
assert.equal(await run("document.getElementById('bg-container').style.backgroundImage"),z1Background);
await run("switchTab('playing')");
assert.equal(await run("document.getElementById('bg-container').style.backgroundImage"),z1Background);
await run("setAccentMode('custom')");
await run("document.getElementById('card-prev').click()");await new Promise(r=>setTimeout(r,800));
assert.equal(await run('currentTrackIndex'),1);
assert.notEqual(await run("document.getElementById('bg-container').style.backgroundImage"),z1Background);
assert((await run("document.getElementById('bg-container').style.backgroundImage")).includes('50% 45%'));
// Beat glow must use the same Z1 background painter and restore its palette.
await run("paintAlbumBackground({r:30,g:96,b:100})");
assert((await run("document.getElementById('bg-container').style.backgroundImage")).includes('50% 45%'));
await screenshot('z1-background-teal');
await run("resetBeatGlowBackground();setAccentMode('dynamic')");
assert(await run("document.querySelector('#img-prev').src===playlist[2].coverUrl&&document.getElementById('card-next').style.display==='none'"));
console.log('PASS Z1 layouts, white controls, upcoming artwork navigation and adaptive background');
// The complete Z1 interface uses the Android home, overflow menu and mini player.
await run("embyConfig.serverType='local';localTracks=playlist.map(track=>({...track,Type:'Audio'}));switchTab('music');backToCategories()");
await run("featuredSlides=playlist.map(track=>({img:track.coverUrl,title:track.Name,artist:track.Artists.join(', ')}));featuredIndex=0;buildFeaturedSlides()");
assert.equal(await run("document.getElementById('app-logo').textContent"),'WALKMAN');
assert.equal(await run("getComputedStyle(document.getElementById('app-logo'),'::before').content"),'none');
assert.equal(await run("getComputedStyle(document.querySelector('.top-nav')).display"),'none');
assert.equal(await run("getComputedStyle(document.querySelector('.z1-header-back')).display"),'none');
await run("document.querySelector('.z1-mini-track').click()");
assert.notEqual(await run("getComputedStyle(document.querySelector('.z1-header-back')).display"),'none');
await run("document.querySelector('.z1-header-back').click()");
assert(await run("document.getElementById('view-music').classList.contains('active')"));
await run("document.querySelector('.featured-arrow-next').click()");
assert.equal(await run('featuredIndex'),1);
assert.equal(await run("document.querySelector('.featured-slide.active .featured-slide-title').textContent"),'Second song');
assert.equal(await run('currentTrackIndex'),1,'Slideshow navigation must not change playback');
for(const [width,height] of [[1341,772],[390,844],[844,390]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,250));
 const ui=await run(`(()=>{
  const logo=document.getElementById('app-logo').getBoundingClientRect();
  const mini=document.getElementById('z1-mini-player').getBoundingClientRect();
  return {logoLeft:logo.left,logoRight:logo.right,logoDisplay:getComputedStyle(document.getElementById('app-logo')).display,miniBottom:mini.bottom,miniWidth:mini.width,hero:getComputedStyle(document.getElementById('featured-slideshow')).display,scroll:document.body.scrollWidth};
 })()`);
 assert.equal(ui.hero,'block');assert.notEqual(ui.logoDisplay,'none');
 assert(ui.logoLeft>=0&&ui.logoRight<=width&&ui.miniWidth<=width&&ui.miniBottom<=height+1&&ui.scroll<=width+1,'Z1 interface overflows at '+width);
 assert.equal(await run("document.getElementById('z1-mini-title').textContent"),'Second song');
 await screenshot('z1-home-'+width);
}
assert(await run("(async()=>{for(const url of ['images/z1/artists-variant.png','images/z1/songs-variant.png','images/z1/albums-variant.png','images/z1/playlists-variant.png','images/z1/favorites-variant.png']){const image=new Image();image.src=url;await image.decode()}return true})()"));
await run("audio.currentTime=3;updateZ1MiniProgress()");
assert(Math.abs((await run("Number(document.getElementById('z1-mini-progress').value)"))-30)<1,'Mini progress is not synchronized');
assert.equal(await run("document.getElementById('z1-mini-progress').disabled"),false);
await run("document.getElementById('z1-mini-progress').value=60;document.getElementById('z1-mini-progress').dispatchEvent(new Event('input',{bubbles:true}))");
assert(Math.abs((await run('audio.currentTime'))-6)<.3,'Mini progress did not seek');
await run('audio.currentTime=0');
await run("document.querySelector('.z1-header-more').click()");
assert.equal(await run("document.querySelector('.z1-header-more').getAttribute('aria-expanded')"),'true');
await run("document.getElementById('eq-btn').click()");
assert(await run("document.getElementById('eq-dropdown').classList.contains('open')"));
assert.equal(await run("document.querySelector('.z1-header-more').getAttribute('aria-expanded')"),'false');
await run("closeEqualizer();loadCategory('Songs')");
assert((await run("document.querySelectorAll('#items-container .list-item').length"))>=3);
await screenshot('z1-library');
await run("document.querySelector('.z1-mini-play').click()");
await new Promise(r=>setTimeout(r,100));
assert(await run('audio.paused'));assert.equal(await run("document.getElementById('z1-mini-play-icon').textContent"),'play_arrow');
await run("document.querySelector('.z1-mini-play').click()");await new Promise(r=>setTimeout(r,100));
assert(await run('!audio.paused'));assert.equal(await run("document.getElementById('z1-mini-play-icon').textContent"),'pause');
await run("(async()=>{document.querySelector('.z1-mini-controls button:last-child').click();await audio.play()})()");
assert.equal(await run('currentTrackIndex'),2);assert.equal(await run("document.getElementById('z1-mini-title').textContent"),'Third song');
await run("(async()=>{document.querySelector('.z1-mini-controls button:first-child').click();await audio.play()})()");assert.equal(await run('currentTrackIndex'),1);
await run("setPlayingTheme('modern')");assert(await run("document.getElementById('z1-mini-player').hidden"));
assert.equal(await run("getComputedStyle(document.querySelector('.header-secondary-actions')).display"),'contents');
assert.equal(await run("getComputedStyle(document.querySelector('.top-nav')).display"),'flex');
assert.equal(await run("getComputedStyle(document.querySelector('.z1-header-back')).display"),'none');
await run("setPlayingTheme('z1');document.querySelector('.z1-mini-track').click()");
assert(await run("document.getElementById('view-playing').classList.contains('active')&&document.getElementById('z1-mini-player').hidden"));
console.log('PASS Z1 global theme, original artwork, local library, overflow actions and mini-player playback');
// A focused theme button must use native Space activation, without toggling playback.
await run("toggleSettingsMenu();openSettingsSection('customization');document.querySelector('[data-playing-theme=classic]').focus()");
await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
assert.equal(await run("document.querySelector('#view-playing').dataset.theme"),'classic');
assert(await run('!audio.paused'));
// The Hi-Res preference affects only the Playing cover, in either theme.
await run("playlist[currentTrackIndex]._audioQuality={codec:'flac',sampleRate:96000};applyPlayingHiResState()");
assert(await run("!document.getElementById('hires-badge').classList.contains('hidden')"));
const libraryIcon=await run('hiresIconHtml()');
await run("document.getElementById('playing-hires-btn').click()");
assert(await run("document.getElementById('hires-badge').classList.contains('hidden')"));
assert.equal(await run("document.getElementById('playing-hires-btn').getAttribute('aria-pressed')"),'false');
assert((await run('hiresIconHtml()')).includes('list-hires-icon')&&libraryIcon.includes('list-hires-icon'));
await run("setPlayingTheme('modern');applyPlayingHiResState();setPlayingTheme('classic')");
assert(await run("document.getElementById('hires-badge').classList.contains('hidden')"));
await run("togglePlayingHiRes();playlist[currentTrackIndex]._audioQuality={codec:'mp3',sampleRate:44100};applyPlayingHiResState()");
assert(await run("document.getElementById('hires-badge').classList.contains('hidden')"),'Ordinary tracks should not show the badge');
await run('togglePlayingHiRes()');
await command('Page.reload');
for(let i=0;i<100;i++){if(await run("document.querySelector('#view-playing')?.dataset.theme==='classic'"))break;await new Promise(r=>setTimeout(r,100));}
assert.equal(await run("document.querySelector('#view-playing').dataset.theme"),'classic');
assert.equal(await run('isPlayingHiResEnabled()'),false,'Hi-Res preference should survive reload');
assert.equal(await run("document.getElementById('playing-hires-btn').getAttribute('aria-pressed')"),'false');
console.log('PASS Hi-Res cover toggle, ordinary tracks and saved preference');
await run("setPlayingTheme('z1')");
await command('Page.reload');
for(let i=0;i<100;i++){if(await run("document.querySelector('#view-playing')?.dataset.theme==='z1'"))break;await new Promise(r=>setTimeout(r,100));}
assert.equal(await run("document.querySelector('#view-playing').dataset.theme"),'z1');
assert.equal(await run("document.querySelector('[data-playing-theme=z1]').getAttribute('aria-pressed')"),'true');
console.log('PASS saved Z1 preference');
await run("applyPlayingTheme('invalid')");
assert.equal(await run("document.querySelector('#view-playing').dataset.theme"),'modern');
console.log('PASS theme switching, playback, queue metadata, keyboard and saved preference');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
