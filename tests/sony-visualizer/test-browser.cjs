const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.SONY_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.SONY_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'sony-web-evidence-'));console.log('Evidence',artifacts);
const harness=`<!doctype html><canvas id="sony-visualizer-canvas" width="512" height="512"></canvas><script src="visualizer.js"></script><script>window.messages=[];window.ready=createSonyVisualizer({canvas:document.querySelector('canvas'),printErr:m=>messages.push(m)}).then(m=>window.module=m).catch(e=>{window.failure=String(e)})</script>`;
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
for(let theme=0;theme<7;theme++){
 await run(`window.glDraws=[];window.separateVboDraws=0;setVisStyle('sony-${theme}')`);await new Promise(r=>setTimeout(r,1800));
 const inspectTheme=()=>run("(()=>{const source=document.getElementById('sony-visualizer-canvas'),copy=document.createElement('canvas');copy.width=source.width;copy.height=source.height;const ctx=copy.getContext('2d');ctx.drawImage(source,0,0);const px=ctx.getImageData(0,0,copy.width,copy.height).data;let lit=0;for(let i=0;i<px.length;i+=4)if(px[i]+px[i+1]+px[i+2]>12)lit++;return {playing:!audio.paused,time:audio.currentTime,draws:window.glDraws,separateVboDraws:window.separateVboDraws,lit,status:document.querySelector('.visualizer-canvas-container [role=status]').style.display}})()");
 let themeState=await inspectTheme();
 for(let attempt=0;!themeState.lit&&attempt<25;attempt++){await new Promise(r=>setTimeout(r,200));themeState=await inspectTheme();}
 assert(themeState.playing, 'Playback stopped on theme '+theme);
 assert(themeState.draws.length>0, 'No drawing on theme '+theme);
 assert(themeState.lit>0, 'Black scene on theme '+theme);
 if([0,1,3,5,6].includes(theme))assert(themeState.separateVboDraws>0, 'Lost independent position/UV buffers on theme '+theme);
 assert.equal(themeState.status,'none', 'Engine error on theme '+theme);
 console.log('PASS theme',theme,themeState);

 const png=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'webapp-theme-'+theme+'.png'),Buffer.from(png.data,'base64'));
}
console.log('existing and reopen',await run("(()=>{setVisStyle('rings');const hidden=document.getElementById('sony-visualizer-canvas').style.display==='none';toggleVisualizerView();toggleVisualizerView();setVisStyle('sony-4');return {hidden,playing:!audio.paused}})()"));
await new Promise(r=>setTimeout(r,1500));
console.log('end',await run("({playing:!audio.paused,status:[...document.querySelectorAll('[role=status]')].map(e=>({text:e.textContent,display:e.style.display}))})"));
const pause=await run("(async()=>{audio.pause();let before=audio.currentTime;await new Promise(r=>setTimeout(r,350));return {stopped:audio.paused&&Math.abs(audio.currentTime-before)<.05,status:document.querySelector('.visualizer-canvas-container [role=status]').style.display}})()");assert(pause.stopped);assert.equal(pause.status,'none');
await run("audio.play()");await command('Emulation.setDeviceMetricsOverride',{width:420,height:850,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,1000));
await run("playlist[0].Name='';playlist[0].Artists=[];playlist[0].Album='';setVisStyle('sony-7')");await new Promise(r=>setTimeout(r,1000));
const endState=await run("({playing:!audio.paused,status:document.querySelector('.visualizer-canvas-container [role=status]').style.display})");assert(endState.playing);assert.equal(endState.status,'none');
console.log('PASS pause/resume, mobile viewport resize, random and empty metadata');
if(fileMode){assert(requests.some(url=>new URL(url).pathname.endsWith('/visualizer-file.js')), 'Standalone runtime was not loaded');assert(!requests.some(url=>/\/visualizer\.(wasm|data)(?:$|[?#])/.test(url)), 'Standalone runtime requested external WASM/data');console.log('PASS file:// with no external WASM/data requests and no browser security overrides');}
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
