const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'progress-seek-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'progress-seek-test-'));
chrome=spawn('/usr/bin/google-chrome',['--headless','--disable-background-timer-throttling','--disable-renderer-backgrounding','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
let tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',raw=>{let m=JSON.parse(raw);if(m.method==='Runtime.consoleAPICalled')console.log('CONSOLE',JSON.stringify(m.params.args));if(m.method==='Runtime.exceptionThrown')console.error('EXCEPTION',JSON.stringify(m.params.exceptionDetails));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{let n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{let r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1900,height:700,deviceScaleFactor:1,mobile:false});
await command('Page.navigate',{url:fileMode?require('node:url').pathToFileURL(path.join(root,'index.html')).href:'http://127.0.0.1:'+server.address().port+'/'});

for(let i=0;i<400;i++){if(await run("document.readyState==='complete' && typeof notifyAndroidMedia==='function' && typeof toggleVisualizerView==='function' && typeof audio!=='undefined'"))break;await new Promise(r=>setTimeout(r,100));}

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



await run("audio.pause();switchTab('playing')");
await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
// Simulate a remote stream whose media clock does not settle until seeked.
await run(`window.seekWrites=[];window.mediaTime=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
 Object.defineProperty(audio,'currentTime',{configurable:true,get(){return mediaTime.get.call(this)},set(value){seekWrites.push(value)}})`);
for(const theme of ['modern','classic','music','z1','ericsony','walkmanhires']) {
 await run(`setPlayingTheme('${theme}');audio.pause();document.getElementById('queue-drawer').classList.remove('open');document.getElementById('emby-modal').style.display='none';seekWrites=[]`);
 await new Promise(r=>setTimeout(r,450));
 const rect=await run("(()=>{const s=document.getElementById('progress-bar'),r=s.getBoundingClientRect();return {x:r.x,y:r.y+r.height/2,w:r.width,thumb:parseFloat(getComputedStyle(s).getPropertyValue('--seek-thumb-width'))}})()");
 const x=f=>rect.x+rect.thumb/2+(rect.w-rect.thumb)*f;
 await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x(.8),y:rect.y,id:0}]});
 for(const fraction of [.6,.4,.2]) {
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x(fraction),y:rect.y,id:0}]});
  const state=await run(`(()=>{
   audio.dispatchEvent(new Event('timeupdate'));
   const t=document.querySelector('.seek-drag-thumb:not([hidden])'),r=t.getBoundingClientRect();
   return {value:Number(document.getElementById('progress-bar').value),x:r.x+r.width/2,
    animations:t.getAnimations().length,writes:seekWrites.length};
  })()`);
  assert(Math.abs(state.value-fraction*100)<1,theme+': stale media time overwrote drag');
  assert(Math.abs(state.x-x(fraction))<1,theme+': visible thumb lagged behind touch');
  assert.equal(state.animations,0,theme+': thumb has an animation');
  assert.equal(state.writes,0,theme+': swipe caused intermediate media seeks');
 }
 const shot=await command('Page.captureScreenshot',{format:'png'});
 fs.writeFileSync(path.join(artifacts,theme+'-drag.png'),Buffer.from(shot.data,'base64'));
 await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 let state=await run("audio.dispatchEvent(new Event('timeupdate'));({value:Number(document.getElementById('progress-bar').value),writes:seekWrites,visibleThumbs:document.querySelectorAll('.seek-drag-thumb:not([hidden])').length})");
 assert.equal(state.writes.length,1,theme+': release must commit exactly once');
 assert(Math.abs(state.writes[0]/10-.2)<.01,theme+': wrong final audio position');
 assert(Math.abs(state.value-20)<1,theme+': waiting for remote seek moved the thumb back');
 assert.equal(state.visibleThumbs,0,theme+': drag thumb was not removed');
 await run('audio.dispatchEvent(new Event("seeked"))');
 console.log('PASS',theme,'direct visible thumb, delayed media clock, one seek on release');
}
// Cancellation must neither seek nor leave the drag preview visible.
await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:743,id:0}]});
await run('seekWrites=[]');
await command('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
assert(await run('seekWrites.length===0 && seekPreviewProgress===null && !draggingSeek && document.querySelectorAll(".seek-drag-thumb:not([hidden])").length===0'));
await run('delete audio.currentTime;seekTrack(50)');
for(let i=0;i<100 && await run('audio.seeking');i++)await new Promise(r=>setTimeout(r,10));
assert(await run('Math.abs(audio.currentTime-5)<.01 && seekPreviewProgress===null'),'Real media seek did not settle');
await run("document.getElementById('progress-bar').focus()");
await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
assert(await run('audio.currentTime>5'),'Keyboard no longer seeks');
console.log('PASS cancellation, real media seek completion and keyboard');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
