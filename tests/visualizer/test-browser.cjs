const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.VIS_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.VIS_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'visualizer-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'visualizer-test-'));
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
// Both background effects can allocate the shared raw buffer before the visualizer opens.
for(const effect of ['beat','led']) {
 await run(`visBands=new Uint8Array(0);visBinsNorm=new Float32Array(0);${effect==='beat'?'toggleBeatGlow()':'toggleXpspLeds()'}`);
 await new Promise(r=>setTimeout(r,200));
 assert.equal(await run('visBands.length'),128, effect+' did not initialize the shared buffer');
 const data=await run(`(()=>{const v=getVisData();return {n:v.n,length:v.bins.length,finite:[...v.bins].every(Number.isFinite),energy:v.avg}})()`);
 assert.equal(data.length,data.n, effect+' left normalized frequency bins unallocated');
 assert(data.finite && data.energy>0, effect+' lost audio data');
 await run('toggleVisualizerView()');
 for(const style of ['bars','wave','ps3']) {
  await run(`setVisStyle('${style}')`);
  await new Promise(r=>setTimeout(r,150));
  const result=await run(`(async()=>{
   const first=visAnimationId;for(let i=0;i<30&&first===visAnimationId;i++)await new Promise(r=>setTimeout(r,100));
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   let lit=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>60)lit++;
   return {running:first!==visAnimationId,lit,playing:!audio.paused};
  })()`);
  assert(result.running,style+' stopped its animation loop after '+effect);
  assert(result.lit>100,style+' produced no visible output');
  assert(result.playing,style+' interrupted playback');
  const png=await command('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(artifacts,effect+'-'+style+'.png'),Buffer.from(png.data,'base64'));
  console.log('PASS',effect,style,result);
 }
 await run(`toggleVisualizerView();${effect==='beat'?'toggleBeatGlow()':'toggleXpspLeds()'}`);
}
// The raw buffer can also be resized by background effects after an FFT size change.
await run('analyserNode.fftSize=512;toggleBeatGlow()');
await new Promise(r=>setTimeout(r,100));
assert.equal(await run('getVisData().bins.length'),256);
await run('toggleBeatGlow();toggleVisualizerView();setVisStyle("bars")');
await command('Emulation.setDeviceMetricsOverride',{width:420,height:850,deviceScaleFactor:1,mobile:true});
await new Promise(r=>setTimeout(r,300));
assert.equal(await run('canvas.width'),420);
assert.equal(await run('getVisData().bins.length'),256);
// Exercise the no-Web-Audio path used on iOS, including a preallocated raw buffer.
const fallback=await run(`(()=>{
 analyserNode=null;visBands=new Uint8Array(64);visBinsNorm=new Float32Array(0);
 const playing=getVisData();const result={length:playing.bins.length,energy:playing.avg};
 audio.pause();const silence=getVisData();result.silent=silence.avg===0&&[...silence.bins].every(v=>v===0);return result;
})()`);
assert.equal(fallback.length,64);assert(fallback.energy>0);assert(fallback.silent);
console.log('PASS FFT resize, mobile viewport, fallback and paused silence');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
