const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'hires-library-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'hires-library-test-'));
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
 localTracks=playlist.map((track,index)=>({...track,Type:'Audio',Genres:[index===1?'Rock':'Electronic'],DateCreated:new Date(2026,0,index+1).toISOString(),Duration:202+index,
 MediaSources:[{Container:index===1?'flac':'mp3',Bitrate:320000,MediaStreams:[{Type:'Audio',Codec:index===1?'flac':'mp3',SampleRate:index===1?96000:44100,BitDepth:index===1?24:16}]}]}));
 embyConfig.serverType='local';setPlayingTheme('walkmanhires');setLang('es');switchTab('music');
})()`);
const screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));};
assert.equal(await run("document.querySelectorAll('[data-hires-category]').length"),9);
assert(!await run("document.getElementById('walkman-hires-library-home').textContent.includes('USB')"));
for(const [width,height] of [[393,851],[320,640],[768,1024],[844,390]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,200));
 const layout=await run(`(()=>{
  const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  return {grid:rect('.walkman-hires-library-grid'),mini:rect('#z1-mini-player'),view:rect('#view-music'),background:getComputedStyle(document.getElementById('view-music')).backgroundColor,hidden:document.getElementById('walkman-hires-library-home').hidden,miniHidden:document.getElementById('z1-mini-player').hidden,scroll:document.body.scrollWidth};
 })()`);
 assert(!layout.hidden && !layout.miniHidden);
 assert.equal(layout.background,'rgb(0, 0, 0)');
 assert(layout.grid.x>=0 && layout.grid.right<=width+1 && layout.scroll<=width);
 assert(layout.mini.bottom<=height+1);
 await screenshot('home-'+width+'x'+height);
}
await command('Emulation.setDeviceMetricsOverride',{width:393,height:851,deviceScaleFactor:1,mobile:true});
await run("document.querySelector('.walkman-hires-library-search').click()");
assert(await run("document.getElementById('search-overlay').classList.contains('open')"));
await run('toggleSearchOverlay()');
await run('refreshWalkmanHiResLibrary()');
assert.equal(await run("document.getElementById('walkman-hires-library-refresh').disabled"),false);
await run("openWalkmanHiResLibrary('Songs')");
assert.equal(await run("document.querySelectorAll('#items-container .walkman-hires-audio-row').length"),3);
assert.equal(await run("getComputedStyle(document.querySelector('.walkman-hires-audio-row>img')).display"),'none');
assert.equal(await run("document.querySelector('.walkman-hires-media-audio').lastChild.textContent"),'03:22');
await screenshot('songs');
await run('backToCategories()');
assert(!await run("document.getElementById('walkman-hires-library-home').hidden"));
await run("openWalkmanHiResCollection('recent')");
assert.match(await run("document.querySelector('#items-container .list-item:not(.list-item-shuffle) .list-item-title').textContent"),/^Third song/);
await run("openWalkmanHiResCollection('hires')");
assert.equal(await run("document.querySelectorAll('#items-container .walkman-hires-audio-row').length"),1);
assert.match(await run("document.querySelector('.walkman-hires-audio-row .list-item-title').textContent"),/^Second song/);
await run("openWalkmanHiResCollection('genres')");
assert.deepEqual(await run("[...document.querySelectorAll('.walkman-hires-genre-row .list-item-info')].map(el=>el.textContent)"),['Electronic','Rock']);
await run("openWalkmanHiResCollection('genres','Rock')");
assert.equal(await run("document.querySelectorAll('#items-container .walkman-hires-audio-row').length"),1);
await run('backToCategories()');
assert.equal(await run("document.querySelectorAll('.walkman-hires-genre-row').length"),2);
await run('backToCategories()');
assert(!await run("document.getElementById('walkman-hires-library-home').hidden"));
await run("openWalkmanHiResLibrary('Favorites')");
assert(await run("document.getElementById('walkman-hires-library-home').hidden"));
await run('backToCategories()');
await run("applyPlayingTheme('modern')");
assert.equal(await run("getComputedStyle(document.getElementById('walkman-hires-library-home')).display"),'none');
assert.notEqual(await run("getComputedStyle(document.getElementById('home-grid')).display"),'none');
assert(await run("document.getElementById('z1-mini-player').hidden"));
await run("applyPlayingTheme('walkmanhires')");
assert(!await run("document.getElementById('z1-mini-player').hidden"));
await new Promise(r=>setTimeout(r,900));
assert.equal(await run("Number(getComputedStyle(document.getElementById('z1-mini-player'),'::before').opacity)"),1,'Playing mini-player wash should be visible');
assert.match(await run("getComputedStyle(document.getElementById('z1-mini-player'),'::before').backgroundImage"),/^linear-gradient\(90deg/);
await run("document.querySelector('.z1-mini-play').click()");
assert(await run('audio.paused'));
await new Promise(r=>setTimeout(r,250));
const miniFade=await run("Number(getComputedStyle(document.getElementById('z1-mini-player'),'::before').opacity)");
assert(miniFade>0 && miniFade<1,'Mini-player wash should fade on pause');
await new Promise(r=>setTimeout(r,650));
assert.equal(await run("Number(getComputedStyle(document.getElementById('z1-mini-player'),'::before').opacity)"),0);
await run("document.querySelector('.z1-mini-play').click()");
assert(await run('!audio.paused'));
await new Promise(r=>setTimeout(r,900));
// Exercise the actual touch path, including the compatibility click after swipe.
const miniTouch=async(dx,dy=0,shot=null)=>{
 const point=await run("(()=>{const r=document.querySelector('.z1-mini-track').getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.5}})()");
 const startX=point.x-dx/2;
 await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y:point.y,id:1}]});
 for(let i=1;i<=6;i++) {
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:startX+dx*i/6,y:point.y+dy*i/6,id:1}]});
  await new Promise(r=>setTimeout(r,20));
  if(i===3 && shot) {
   assert.equal(await run("document.querySelectorAll('.walkman-hires-mini-page').length"),2,'Swipe should show outgoing and incoming track pages');
   assert.notEqual(await run("getComputedStyle(document.querySelector('.walkman-hires-mini-page')).transform"),'none');
   await screenshot(shot);
  }
 }
 await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await new Promise(r=>setTimeout(r,200));
};
await run('playTrack(0)');
const firstMiniWash=await run("document.body.style.getPropertyValue('--walkman-hires-mini-wash')");
await miniTouch(-120,0,'mini-swipe-next');
assert.notEqual(await run("document.body.style.getPropertyValue('--walkman-hires-mini-wash')"),firstMiniWash,'Mini-player wash did not follow the artwork');
assert.equal(await run('currentTrackIndex'),1,'Swipe left should advance exactly one track');
assert.equal(await run("document.getElementById('z1-mini-title').textContent"),'Second song');
assert(await run("document.getElementById('view-music').classList.contains('active')"),'Swipe opened the full player');
await miniTouch(120,0,'mini-swipe-previous');
assert.equal(await run('currentTrackIndex'),0,'Swipe right should return to the previous track');
assert(await run("document.getElementById('view-music').classList.contains('active')"));
await miniTouch(0,-50);
assert.equal(await run('currentTrackIndex'),0,'Vertical movement changed tracks');
await run("applyPlayingTheme('z1')");
await miniTouch(-120);
assert.equal(await run('currentTrackIndex'),0,'Hi-Res gesture leaked into Z1');
await run("applyPlayingTheme('walkmanhires');switchTab('music')");
// A normal tap still opens Playing after a swipe.
const tap=await run("(()=>{const r=document.querySelector('.z1-mini-track').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...tap,id:1}]});
await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});

assert(await run("document.getElementById('view-playing').classList.contains('active')"));
console.log('PASS Hi-Res library home, no USB DAC, responsive grid, search, songs, recent, Hi-Res, genres, favorites, mini-player and other-theme isolation');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
