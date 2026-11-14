const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'progress-particles-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'progress-particles-test-'));
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

assert.equal(await run('progressParticlesEnabled'), false);
await run("audio.currentTime=5;audio.playbackRate=.25;toggleProgressParticles()");
await new Promise(r=>setTimeout(r,500));
await command('Emulation.setDeviceMetricsOverride',{width:1341,height:1000,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,300));
// A coarse slider update must not drag particles that are already rising.
const continuity=await run(`(()=>{
 clearProgressParticles();
 const layer=progressParticleLayers[0],originalValue=layer.bar.value;
 const particle={x:.2,rise:0,age:0,life:2,speed:20,radius:1,drift:0};
 layer.particles=[particle];layer.emission=1;
 const positions=[],arc=layer.ctx.arc;
 layer.ctx.arc=function(x,...args){positions.push(x);return arc.call(this,x,...args)};
 const now=performance.now();
 try {
  layer.bar.value=0;
  drawProgressParticles(now);
  const count=layer.particles.length;
  cancelAnimationFrame(progressParticlesFrame);progressParticlesFrame=null;
  const first=positions[0];positions.length=0;
  layer.bar.value=90;
  drawProgressParticles(now+16);
  return {first,second:positions[0],count};
 } finally {layer.ctx.arc=arc;layer.bar.value=originalValue;}
})()`);
assert(continuity.count>1,'Emission is still using the stepped slider instead of the media clock');
assert(Math.abs(continuity.first-continuity.second)<.01,'Slider updates drag existing particles sideways');
for (const theme of ['modern','classic','music','z1']) {
 for (const [width,height] of [[1341,772],[390,844]]) {
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
  await run(`setPlayingTheme('${theme}')`);
  await new Promise(r=>setTimeout(r,1200));
  const state=await run(`(()=>{const l=progressParticleLayers[0];return {hit:document.elementFromPoint(l.bar.getBoundingClientRect().x+l.bar.clientWidth/2,l.bar.getBoundingClientRect().y+10)?.outerHTML.slice(0,250),hidden:l.canvas.hidden,count:l.particles.length,rise:l.particles[0]?.rise,rect:l.bar.getBoundingClientRect().toJSON(),canvas:l.canvas.getBoundingClientRect().toJSON()}})()`);
  assert(!state.hidden && state.count>0,theme+' '+width+': no particles '+JSON.stringify(state));
  assert(state.rise>0,'Particles did not rise');
  assert(Math.abs(state.rect.x-state.canvas.x)<1,'Canvas moved away from slider');
  const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,theme+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
 }
}
await run('toggleVisualizerView()');
await new Promise(r=>setTimeout(r,700));
assert(await run('!progressParticleLayers[1].canvas.hidden && progressParticleLayers[1].particles.length>0'),'Visualizer particles missing');
await run('toggleVisualizerView();document.querySelector(".z1-header-back").click()');
await new Promise(r=>setTimeout(r,700));
assert(await run('!progressParticleLayers[2].canvas.hidden && progressParticleLayers[2].particles.length>0'),'Mini player particles missing');
await run('document.querySelector(".z1-mini-track").click()');
await new Promise(r=>setTimeout(r,400));
await run("toggleSettingsMenu();openSettingsSection('effects');window.previewParticle=progressParticleLayers[0].particles[0];window.previewAge=previewParticle.age");
await new Promise(r=>setTimeout(r,150));
assert(await run('!progressParticleLayers[0].canvas.hidden && progressParticleLayers[0].particles.includes(previewParticle) && previewParticle.age>previewAge'),'Particles stopped when opening Settings > Effects');
await run("setCustomAccent('#ff3300');setProgressParticlesColorMode('custom');setProgressParticlesCustomColor('#00ffbb')");
assert.equal(await run("document.getElementById('particles-custom-color-row').style.display"),'flex');
assert.equal(await run("document.getElementById('particles-color-custom').getAttribute('aria-pressed')"),'true');
assert.equal(await run("getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim()"),'#ff3300','Particle color changed global accent');
await new Promise(r=>setTimeout(r,100));
assert(await run(`(()=>{const l=progressParticleLayers[0],d=l.ctx.getImageData(0,0,l.canvas.width,l.canvas.height).data;for(let i=0;i<d.length;i+=4)if(d[i+3]>30 && d[i+1]>240 && d[i+2]>170 && d[i]<10)return true;return false})()`),'Particle pixels did not follow their custom color');
await run('toggleProgressParticlesRgb()');
assert.equal(await run("document.getElementById('particles-rgb-btn').getAttribute('aria-pressed')"),'true');
assert.equal(await run("document.getElementById('particles-custom-color-row').style.display"),'none');
assert.equal(await run("document.getElementById('particles-rgb-effect-row').style.display"),'flex');
for (const effect of ['rainbow','cycle','breathing','wave']) {
 await run(`document.getElementById('particles-rgb-effect').value='${effect}';document.getElementById('particles-rgb-effect').dispatchEvent(new Event('change'))`);
 await new Promise(r=>setTimeout(r,150));
 assert.equal(await run('progressParticlesRgbEffect'),effect);
 assert(await run('!progressParticleLayers[0].canvas.hidden && progressParticleLayers[0].particles.length>0'),'RGB preview stopped');
 assert(await run(`(()=>{const l=progressParticleLayers[0],d=l.ctx.getImageData(0,0,l.canvas.width,l.canvas.height).data;return d.some((v,i)=>i%4===3 && v>5)})()`),'RGB did not render');
 assert(await run('JSON.stringify(getProgressParticlesRgb(0,.2))!==JSON.stringify(getProgressParticlesRgb(1000,.2))'),'RGB effect did not animate');
}
await run("setProgressParticlesRgbEffect('rainbow')");
assert(await run('getProgressParticlesRgb(0,.1).color!==getProgressParticlesRgb(0,.7).color'),'Rainbow has no spatial colors');
await new Promise(r=>setTimeout(r,100));
const rgbShot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'rgb-settings.png'),Buffer.from(rgbShot.data,'base64'));
await run('toggleProgressParticlesRgb()');
assert.equal(await run("document.getElementById('particles-custom-color-row').style.display"),'flex');
assert.equal(await run('progressParticlesCustomColor'),'#00ffbb','RGB lost the fixed color');
await run("toggleProgressParticlesRgb();setProgressParticlesRgbEffect('wave')");
await run('closeSettingsMenu()');
await run("setProgressParticlesColorMode('dynamic')");
assert.equal(await run("document.getElementById('particles-custom-color-row').style.display"),'none');
assert(await run("getProgressParticlesColor() === `rgb(${visAlbumColor.r}, ${visAlbumColor.g}, ${visAlbumColor.b})`"));
await new Promise(r=>setTimeout(r,100));
assert.notEqual(await run("getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim()"),'#00ffbb');
for (const shape of ['square','round']) {
 await run(`document.getElementById('particles-shape-${shape}').click()`);
 assert.equal(await run('progressParticlesShape'),shape);
 assert.equal(await run(`document.getElementById('particles-shape-${shape}').getAttribute('aria-pressed')`),'true');
 const drawing=await run(`(async()=>{
  const ctx=progressParticleLayers[0].ctx,arc=ctx.arc,rect=ctx.fillRect;let circles=0,squares=0;
  ctx.arc=function(...args){circles++;return arc.apply(this,args)};
  ctx.fillRect=function(...args){squares++;return rect.apply(this,args)};
  try {await new Promise(r=>setTimeout(r,100));return {circles,squares};}
  finally {ctx.arc=arc;ctx.fillRect=rect;}
 })()`);
 assert(shape==='square' ? drawing.squares>0 && drawing.circles===0 : drawing.circles>0 && drawing.squares===0,'Wrong rendered shape: '+JSON.stringify(drawing));
}
await run("setProgressParticlesShape('square')");
await run('audio.pause()');
await new Promise(r=>setTimeout(r,2600));
assert.equal(await run('progressParticleLayers.reduce((n,l)=>n+l.particles.length,0)'),0,'Particles did not fade after pause');
assert.equal(await run('progressParticlesFrame'),null,'Paused animation keeps running');
await run('audio.play()');await new Promise(r=>setTimeout(r,400));
assert((await run('progressParticleLayers[0].particles.length'))>0,'Resume failed');
await run("setProgressParticlesColorMode('custom');toggleProgressParticles()");
assert.equal(await run("document.getElementById('progress-particles-color-options').style.display"),'none');
assert.equal(await run('progressParticlesFrame'),null);
assert(await run('progressParticleLayers.every(l=>l.canvas.hidden && l.particles.length===0)'));
await run('toggleProgressParticles()');
assert.equal(await run("loadLS('walkman_progress_particles')"),'on');
await command('Page.reload');
await new Promise(r=>setTimeout(r,1000));
assert.equal(await run('progressParticlesEnabled'),true,'Setting did not persist');
assert.equal(await run('progressParticlesShape'),'square');
assert.equal(await run('progressParticlesColorMode'),'custom');
assert.equal(await run('progressParticlesCustomColor'),'#00ffbb');
assert.equal(await run('progressParticlesRgbEnabled'),true);
assert.equal(await run('progressParticlesRgbEffect'),'wave');
assert.equal(await run("document.getElementById('particles-color-input').value"),'#00ffbb');
assert.equal(await run("document.getElementById('progress-particles-btn').getAttribute('aria-pressed')"),'true');
console.log('PASS progress particles: all themes, mobile/desktop, upward motion, accent modes, RGB effects, pause/resume, cleanup and persistence');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
