const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'player-swipe-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'player-swipe-test-'));
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

await run('audio.play()');
await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const center=()=>run("(()=>{const r=document.getElementById('card-current').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
async function drag(dx,dy=0,{cancel=false,start,verifyMotion=false}={}) {
 const initialIndex=await run('currentTrackIndex');
 const p=start||await center();
 await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:0}]});
 for(let i=1;i<=6;i++){
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+dx*i/6,y:p.y+dy*i/6,id:0}]});
  await wait(20);
 }
 if(verifyMotion) {
  assert.equal(await run('currentTrackIndex'),initialIndex,'Track changed before releasing the cover');
  assert.equal(await run("document.querySelectorAll('.album-swipe-layer').length"),1,'No live swipe preview');
  const geometry=await run(`(()=>{
   const real=document.getElementById('card-current').getBoundingClientRect();
   const copies=[...document.querySelectorAll('.album-swipe-layer .swipe-card')];
   const element=copies.find(c=>c.querySelector('img').src===playlist[currentTrackIndex].coverUrl);
   const copy=element.getBoundingClientRect();
   const incoming=copies.find(c=>c.querySelector('img').src===playlist[currentTrackIndex+${dx<0?1:-1}].coverUrl).getBoundingClientRect();
   return {theme:document.getElementById('view-playing').dataset.theme,realX:real.x,copyX:copy.x,
    centerDelta:copy.x+copy.width/2-real.x-real.width/2,realWidth:real.width,incomingWidth:incoming.width,
    rotation:new DOMMatrix(getComputedStyle(element).transform).b,
    frontOpacity:Number(getComputedStyle(copies.sort((a,b)=>{
     const r=a.getBoundingClientRect(),s=b.getBoundingClientRect(),center=real.x+real.width/2;
     return Math.abs(r.x+r.width/2-center)-Math.abs(s.x+s.width/2-center);
    })[0]).opacity)};
  })()`);
  assert(Math.abs(geometry.realX-geometry.copyX)>30,'Cover does not follow the finger');
  if(geometry.theme==='modern') {
   assert(Math.abs(geometry.centerDelta-dx)<3,'Modern cover does not move with the finger');
   assert(Math.abs(geometry.rotation)<0.001,'Modern cover tilts during swipe');
   assert.equal(geometry.frontOpacity,1,'The front cover should not show other artwork through it');
   assert(geometry.incomingWidth>geometry.realWidth*.84&&geometry.incomingWidth<geometry.realWidth,'Incoming Modern cover does not grow from its side slot');
  }
  const png=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,geometry.theme+'-drag-'+initialIndex+'-'+(dx<0?'left':'right')+'.png'),Buffer.from(png.data,'base64'));
 }
 await command('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
 await wait(700);
}
for(const theme of ['modern','classic']) {
 await run(`setPlayingTheme('${theme}');playTrack(0)`);await wait(700);
 await drag(-110,0,{verifyMotion:true});
 assert.equal(await run('currentTrackIndex'),1,theme+' left swipe must advance exactly once');
 assert.equal(await run("document.getElementById('album-actions-overlay').classList.contains('open')"),false,'Swipe also opened the album menu');
 await drag(110,0,{verifyMotion:true});assert.equal(await run('currentTrackIndex'),0,theme+' right swipe must go back');
 await drag(0,-70);assert.equal(await run('currentTrackIndex'),0,'Vertical scrolling changed songs');
 await drag(-25);assert.equal(await run('currentTrackIndex'),0,'Short swipe should spring back');
 assert.equal(await run("document.querySelectorAll('.album-swipe-layer').length"),0,'Short swipe did not clean up');
 await drag(-30,0,{cancel:true});assert.equal(await run('currentTrackIndex'),0,'Canceled gesture changed songs');
 // Small finger movement is still a tap and must open the album actions.
 await drag(3);
 assert(await run("document.getElementById('album-actions-overlay').classList.contains('open')"),'Tap no longer opens album menu');
 await run('closeAlbumActionsMenu()');
 // Swiping on an exposed upcoming cover must not also activate its click.
 const edge=await run("(()=>{const current=document.getElementById('card-current').getBoundingClientRect();return {x:current.right+10,y:current.y+current.height/2}})()");
 await drag(-110,0,{start:edge});
 assert.equal(await run('currentTrackIndex'),1,'Side-cover swipe activated more than one song');
 assert(await run('!audio.paused'));
 assert.equal(await run("document.querySelectorAll('.album-swipe-layer').length"),0,'Preview not cleaned up');
 console.log('PASS',theme,'touch swipes, vertical scroll, cancel, tap and side-cover click suppression');
}
await run('repeatMode=0;playTrack(0)');await wait(700);
await drag(110);assert.equal(await run('currentTrackIndex'),0,'Previous swipe exceeded queue start');
await run('playTrack(2)');await wait(700);
await drag(-110);assert.equal(await run('currentTrackIndex'),2,'Next swipe exceeded queue end');
await run('repeatMode=1');await drag(-110);assert.equal(await run('currentTrackIndex'),0,'Swipe should respect repeat-all');
// Lyrics must keep their own scrolling and selection behavior.
await run("document.getElementById('view-lyrics').classList.add('active')");
await drag(-110);assert.equal(await run('currentTrackIndex'),0,'Lyrics gesture changed songs');
await run("document.getElementById('view-lyrics').classList.remove('active')");
console.log('PASS queue boundaries, repeat and lyrics isolation');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
