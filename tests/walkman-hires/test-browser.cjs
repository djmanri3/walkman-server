const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'walkman-hires-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'walkman-hires-test-'));
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

await run("playlist.forEach(track=>{track.Type='Audio';track.MediaSources=[{Container:'mp3',Bitrate:320000,MediaStreams:[{Type:'Audio',Codec:'mp3',SampleRate:44100}]}]});embyConfig.serverType='local'");
await run("setPlayingTheme('walkmanhires')");
assert.equal(await run("document.querySelector('[data-playing-theme=walkmanhires]').getAttribute('aria-pressed')"),'true');
const screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));};
const washOpacity=()=>run("Number(getComputedStyle(document.getElementById('bg-container'),'::after').opacity)");
await new Promise(r=>setTimeout(r,1000));
assert.equal(await washOpacity(),1,'Playing should reveal the artwork wash');
assert.equal(await run("document.getElementById('bg-container').style.backgroundColor"),'rgb(0, 0, 0)');
for (const [width,height] of [[393,851],[390,844],[320,640],[768,1024],[844,390],[1170,540],[1900,900]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,350));
 const layout=await run(`(()=>{
  const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  return {art:rect('#card-current'),metadata:rect('.track-header-wrapper'),title:rect('#track-title'),transport:rect('.controls'),progress:rect('#progress-bar'),favorite:rect('#walkman-hires-favorite'),shuffle:rect('#shuffle-btn'),repeat:rect('#repeat-btn'),scroll:document.body.scrollWidth};
 })()`);
 console.log(width,height,JSON.stringify(layout));
 assert(Math.abs(layout.art.width-layout.art.height)<1);
 for(const key of ['art','metadata','title','transport','progress','favorite','shuffle','repeat']) {
  const box=layout[key];assert(box.x>=0 && box.right<=width+1,key+' outside screen at '+width);
  assert(box.y>=0 && box.bottom<=height+1,key+' below screen at '+width);
 }
 assert(layout.scroll<=width);
 if(width/height<1.2) {
  assert(layout.art.bottom<=layout.metadata.y,'Portrait metadata should follow the sleeve');
  assert(layout.metadata.bottom<=layout.progress.y,'Metadata overlaps seek bar');
 }
 assert(layout.progress.bottom<=layout.transport.y,'Seek bar should precede transport');
 assert(layout.shuffle.right<=layout.transport.x && layout.transport.right<=layout.repeat.x,'Mode buttons overlap transport');
 await screenshot('playing-'+width+'x'+height);
}
await command('Emulation.setDeviceMetricsOverride',{width:393,height:851,deviceScaleFactor:1,mobile:true});
await run("window.hiresQueueFixture=[...playlist];playlist.forEach((track,index)=>track.Duration=202+index);renderQueueList();document.getElementById('walkman-hires-queue').click()");
await new Promise(r=>setTimeout(r,350));
assert(await run("document.getElementById('queue-drawer').classList.contains('open')"));
assert.deepEqual(await run("[...document.querySelectorAll('.walkman-hires-queue-number')].map(el=>el.textContent)"),['1','2','3']);
assert.equal(await run("document.querySelector('.walkman-hires-queue-audio').firstChild.textContent"),'MP3');
assert.equal(await run("document.querySelector('.walkman-hires-queue-duration').textContent"),'03:22');
for (const [width,height] of [[393,851],[320,640],[844,390]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,100));
 const queue=await run(`(()=>{
  const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  return {drawer:rect('#queue-drawer'),list:rect('#queue-list-container'),player:rect('#walkman-hires-queue-player'),playerDisplay:getComputedStyle(document.getElementById('walkman-hires-queue-player')).display,row:rect('.queue-item'),image:getComputedStyle(document.querySelector('.queue-item>img')).display};
 })()`);
 if(width<=height) {
  assert.equal(queue.drawer.x,0);assert.equal(queue.drawer.width,width);assert.equal(queue.drawer.height,height);
 } else {
  assert(queue.drawer.width<=360 && queue.drawer.width<width,'Landscape queue should be compact');
  assert.equal(queue.drawer.right,width);assert(queue.drawer.height<height);
 }
 assert.equal(queue.image,'none');
 if(width<=height) { assert.notEqual(queue.playerDisplay,'none');assert(queue.list.bottom<=queue.player.y+1); }
 else { assert.equal(queue.playerDisplay,'none');assert(queue.list.bottom<=queue.drawer.bottom+1); }
 assert(queue.player.bottom<=height+1 && queue.row.right<=width+1);
 await screenshot('queue-'+width+'x'+height);
}
await command('Emulation.setDeviceMetricsOverride',{width:393,height:851,deviceScaleFactor:1,mobile:true});
await run("applyPlayingTheme('modern')");
await new Promise(r=>setTimeout(r,350));
assert(await run("document.getElementById('queue-drawer').getBoundingClientRect().width<393"),'Other themes must keep the existing compact queue');
assert.equal(await run("getComputedStyle(document.getElementById('walkman-hires-queue-player')).display"),'none');
assert.equal(await run("getComputedStyle(document.querySelector('.queue-default-title')).display"),'block');
await run("applyPlayingTheme('walkmanhires')");
await new Promise(r=>setTimeout(r,350));
await run("document.querySelectorAll('.queue-item')[1].click()");
await new Promise(r=>setTimeout(r,150));
assert.equal(await run("document.getElementById('walkman-hires-queue-title').textContent"),'Second song');
assert.equal(await run("document.querySelector('.queue-item.active').dataset.idx"),'1');
await run("document.getElementById('walkman-hires-queue-play').click()");
assert(await run('audio.paused'));
assert.equal(await run("document.querySelector('#walkman-hires-queue-play span').textContent"),'play_arrow');
await run("seekTrack(45)");
assert(Math.abs(await run("Number(document.getElementById('walkman-hires-queue-progress').value)")-45)<.1);
await run("document.getElementById('walkman-hires-queue-play').click()");
assert(await run('!audio.paused'));
await run("document.querySelector('.queue-item .list-item-more').click()");
assert(await run("document.getElementById('context-menu-overlay').classList.contains('open')"));
assert(await run("document.getElementById('queue-drawer').classList.contains('open')"),'Opening row menu closed queue');
await run('ctxRemoveFromQueue()');
assert.equal(await run('playlist.length'),2);
assert.equal(await run("document.getElementById('walkman-hires-queue-title').textContent"),'Second song');
await run("document.querySelector('.walkman-hires-queue-track').click()");
assert(!await run("document.getElementById('queue-drawer').classList.contains('open')"));
// Restore the fixture for the playback and preference checks below.
await run("playlist=[...window.hiresQueueFixture];originalPlaylist=[...playlist];currentTrackIndex=0;playTrack(0);renderQueueList()");
console.log('PASS Hi-Res full-screen queue, metadata, mini-player, row selection and context removal');
await run('audio.pause()');
await new Promise(r=>setTimeout(r,250));
const fading=await washOpacity();assert(fading>0 && fading<1,'Pause should fade, rather than snap to black');
await new Promise(r=>setTimeout(r,750));
assert.equal(await washOpacity(),0,'Paused background should be black');
await screenshot('paused-393x851');
await run('audio.play()');await new Promise(r=>setTimeout(r,1000));
assert.equal(await washOpacity(),1,'Resuming should restore the artwork wash');
const before=await run("document.body.style.getPropertyValue('--walkman-hires-wash')");
await run('nextTrack()');await new Promise(r=>setTimeout(r,350));
assert.notEqual(await run("document.body.style.getPropertyValue('--walkman-hires-wash')"),before,'Wash should follow the next sleeve');
assert.equal(await run("document.getElementById('playing-queue-position').textContent"),'2/3');
await run("setLang('es');setPlayingTheme('modern')");
assert(!await run("document.body.classList.contains('walkman-hires-playing')"));
await run("setPlayingTheme('walkmanhires')");
assert(await run("document.body.classList.contains('walkman-hires-playing')"));
assert.equal(await run("document.getElementById('track-title-text').textContent"),'Second song');
// Quality is metadata, not a hardcoded Hi-Res badge on ordinary tracks.
await run("playlist[currentTrackIndex].MediaSources=[{Container:'flac',MediaStreams:[{Type:'Audio',Codec:'flac',SampleRate:96000,BitDepth:24}]}];updatePlayingThemeData()");
assert.match(await run("document.getElementById('walkman-hires-quality').textContent"),/FLAC.*96 kHz.*24 bit/);
assert.equal(await run("document.querySelector('#walkman-hires-quality .walkman-hires-quality-badge').textContent"),'HR');
assert.equal(await run("getComputedStyle(document.getElementById('walkman-hires-quality')).color"),'rgb(217, 189, 114)');
await run('applyPlayingHiResState()');
assert(!await run("document.getElementById('hires-badge').classList.contains('hidden')"));
await new Promise(r=>setTimeout(r,700));
await screenshot('flac-96khz-24bit');
const flacMetadata=await run('playlist[currentTrackIndex].MediaSources');
await run("playlist[currentTrackIndex].MediaSources=[{Container:'mp3',Bitrate:320000,MediaStreams:[{Type:'Audio',Codec:'mp3',SampleRate:48000}]}];updatePlayingThemeData()");
assert.equal(await run("document.querySelectorAll('#walkman-hires-quality .walkman-hires-quality-badge').length"),0);
assert.equal(await run("getComputedStyle(document.getElementById('walkman-hires-quality')).color"),'rgb(238, 238, 238)');
await run(`playlist[currentTrackIndex].MediaSources=${JSON.stringify(flacMetadata)};updatePlayingThemeData()`);

assert.equal(await run("document.getElementById('walkman-hires-favorite').disabled"),false);
await run('toggleWalkmanHiResFavorite()');
assert.equal(await run("document.getElementById('walkman-hires-favorite').getAttribute('aria-pressed')"),'true');
await run('toggleWalkmanHiResFavorite()');
assert.equal(await run("document.getElementById('walkman-hires-favorite').getAttribute('aria-pressed')"),'false');

await run('audio.pause()');
await run("setPlayingTheme('walkmanhires')");
await command('Page.reload');
for(let i=0;i<100;i++){if(await run("document.querySelector('#view-playing')?.dataset.theme==='walkmanhires'"))break;await new Promise(r=>setTimeout(r,100));}
assert.equal(await run("document.body.dataset.theme"),'walkmanhires');
assert(!await run("document.body.classList.contains('walkman-hires-playing')"),'Paused restore must not light up');
console.log('PASS WalkmanHiRes layout, playback fades, artwork changes, quality, theme switching and saved preference');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
