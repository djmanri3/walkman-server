const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.SONY_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.SONY_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'sony-web-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sony-web-test-'));
chrome=spawn('/usr/bin/google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
let tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',raw=>{let m=JSON.parse(raw);if(m.method==='Runtime.consoleAPICalled')console.log('CONSOLE',JSON.stringify(m.params.args));if(m.method==='Runtime.exceptionThrown')console.error('EXCEPTION',JSON.stringify(m.params.exceptionDetails));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{let n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{let r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1900,height:700,deviceScaleFactor:1,mobile:false});const requests=[];if(fileMode)await command('Network.enable');ws.on('message',raw=>{const message=JSON.parse(raw);if(message.method==='Network.requestWillBeSent')requests.push(message.params.request.url);if(message.method==='Network.loadingFailed')console.log('NETWORK FAILURE',JSON.stringify(message.params));});
await command('Page.navigate',{url:fileMode?require('node:url').pathToFileURL(path.join(root,'index.html')).href:'http://127.0.0.1:'+server.address().port+'/'});

for(let i=0;i<100;i++){if(await run("typeof toggleVisualizerView==='function' && typeof audio!=='undefined'"))break;await new Promise(r=>setTimeout(r,100));}
console.log('web ready', await run("({visualizer:typeof SonyVisualizer,options:document.querySelectorAll('[data-vis^=sony]').length})"));
console.log('fixture', await run(`(async()=>{
 window.glDraws=[];window.separateVboDraws=0;
 const gp=WebGLRenderingContext.prototype,bindings=new WeakMap(),attrs=new Map(),enabled=new Set();let nextBuffer=1,currentBuffer=0;
 const bind=gp.bindBuffer;gp.bindBuffer=function(target,buffer){if(target===34962){if(buffer&&!bindings.has(buffer))bindings.set(buffer,nextBuffer++);currentBuffer=buffer?bindings.get(buffer):0;}return bind.call(this,target,buffer);};
 const pointer=gp.vertexAttribPointer;gp.vertexAttribPointer=function(index,size,type,normalized,stride,offset){attrs.set(index,{size,type,stride,offset,buffer:currentBuffer});return pointer.call(this,index,size,type,normalized,stride,offset);};
 const enable=gp.enableVertexAttribArray;gp.enableVertexAttribArray=function(index){enabled.add(index);return enable.call(this,index);};
 const disable=gp.disableVertexAttribArray;gp.disableVertexAttribArray=function(index){enabled.delete(index);return disable.call(this,index);};
 const originalDraw=WebGLRenderingContext.prototype.drawArrays;WebGLRenderingContext.prototype.drawArrays=function(mode,first,count){const active=[...enabled].map(index=>attrs.get(index)).filter(Boolean);const position=active.find(a=>a.size===3&&a.type===5126),uv=active.find(a=>a.size===2&&a.type===5126);if(count>0&&position&&uv&&position.buffer&&uv.buffer&&position.buffer!==uv.buffer&&position.stride===16&&uv.stride===8)window.separateVboDraws++;if(window.glDraws.length<6){window.glDraws.push({mode,count});}return originalDraw.call(this,mode,first,count);};
 const sampleRate=44100,count=sampleRate*30,bytes=new Uint8Array(44+count*2),v=new DataView(bytes.buffer);
 const text=(off,s)=>{for(let i=0;i<s.length;i++)bytes[off+i]=s.charCodeAt(i)};
 text(0,'RIFF');v.setUint32(4,36+count*2,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,count*2,true);
 for(let i=0;i<count;i++)v.setInt16(44+i*2,Math.sin(i*2*Math.PI*220/sampleRate)*3000,true);
 const cover=document.createElement('canvas');cover.width=cover.height=128;const c=cover.getContext('2d');c.fillStyle='#ec276b';c.fillRect(0,0,128,128);c.fillStyle='#1b3e92';c.fillRect(0,0,64,64);
 playlist=[{Id:'fixture',Name:'Prueba á日本',Artists:['Walkman'],Album:'Local fixture',IsLocal:true,coverUrl:cover.toDataURL(),RunTimeTicks:300000000}];currentTrackIndex=0;audio.src=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));audio.loop=true;await audio.play();
 document.getElementById('emby-modal').style.display='none';toggleVisualizerView();setVisStyle('sony-0');return {playing:!audio.paused};
})()`));
for(let i=0;i<300;i++){let status=await run("({text:document.querySelector('.visualizer-canvas-container [role=status]')?.textContent,visible:document.querySelector('.visualizer-canvas-container [role=status]')?.style.display})");if(status.visible==='none' || status.text.includes('Could not')){console.log('load status',status);break;}await new Promise(r=>setTimeout(r,200));}
await new Promise(r=>setTimeout(r,2500));
assert.equal(await run("document.getElementById('sony-visualizer-canvas').dataset.sonyRevision"),'gate-rectangles-3');
console.log('loaded',await run("({playing:!audio.paused,time:audio.currentTime,draws:window.glDraws,status:[...document.querySelectorAll('[role=status]')].map(e=>({text:e.textContent,display:e.style.display}))})"));

await run(`(()=>{const first=playlist[0],src=audio.src;playlist=[0,1,2].map(i=>{const cover=document.createElement('canvas');cover.width=cover.height=128;const ctx=cover.getContext('2d');ctx.fillStyle=['#ee3344','#33aa88','#3344ee'][i];ctx.fillRect(0,0,128,128);return {...first,Id:'track-'+i,Name:'Track '+i+' á日本',Album:'Album '+i,objUrl:src,coverUrl:cover.toDataURL()}});})()`);
for(let theme=0;theme<8;theme++){
 await run(`setVisStyle('sony-${theme}')`);await new Promise(r=>setTimeout(r,500));
 for(const index of [1,2,0,2,1]){
  await run(`(async()=>{window.glDraws=[];playTrack(${index},true);await audio.play()})()`);await new Promise(r=>setTimeout(r,350));
  const inspect=()=>run("({draws:window.glDraws.length,playing:!audio.paused,title:playlist[currentTrackIndex].Name,error:document.querySelector('.visualizer-canvas-container [role=status]').style.display,text:document.querySelector('.visualizer-canvas-container [role=status]').textContent})");
  let state=await inspect();
  for(let attempt=0;state.draws===0&&state.error==='none'&&attempt<50;attempt++){await new Promise(r=>setTimeout(r,100));state=await inspect();}
  assert.equal(state.error,'none','Track change broke theme '+theme+': '+JSON.stringify(state));assert(state.playing);assert(state.draws>0,'No rendering after track change in theme '+theme);
 }
 console.log('PASS theme',theme,'five track changes with different titles and covers');
}
if(fileMode){assert(requests.some(url=>new URL(url).pathname.endsWith('/visualizer-file.js')));assert(!requests.some(url=>/\/visualizer\.(wasm|data)(?:$|[?#])/.test(url)));console.log('PASS direct file opening without external WASM/data requests');}
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
