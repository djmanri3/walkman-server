const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'z1-beat-glow-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'z1-beat-glow-test-'));
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
 for(let i=0;i<count;i++){const envelope=.72+.18*Math.exp(-(i%(rate*.5))/(rate*.055));v.setInt16(44+i*2,(Math.sin(i*2*Math.PI*220/rate)+Math.sin(i*2*Math.PI*880/rate))*6000*envelope,true);}
 audio.src=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));audio.loop=true;
 initAudioContext();await audioCtx.resume();await audio.play();
 document.getElementById('emby-modal').style.display='none';
})()`);

await run(`(()=>{
 const cover=color=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="'+color+'"/><path d="M160 80v190a35 35 0 1 1-20-32V100l120-20v150a35 35 0 1 1-20-32V60z" fill="white"/></svg>');
 playlist=['#dc7a32','#b6bf60','#244f6f'].map((color,i)=>({Id:'theme-'+i,Name:['1000 Faces','Second song','Third song'][i],Artists:['Jason Ross, Dia Frampton'],Album:'1000 Faces (Single)',IsLocal:true,coverUrl:cover(color),objUrl:audio.src}));
 currentTrackIndex=0;playTrack(0);return true;
})()`);


await run("setPlayingTheme('z1');toggleBeatGlow()");
// Exclude the initial playback attack: the glow must follow continuous music.
await new Promise(r=>setTimeout(r,3500));
const initial=await run("({base:document.getElementById('bg-container').style.backgroundImage,color:document.getElementById('bg-container').style.getPropertyValue('--z1-beat-color')})");
const values=await run(`(async()=>{const samples=[];for(let i=0;i<70;i++){const bg=document.getElementById('bg-container');samples.push({level:Number(bg.style.getPropertyValue('--z1-beat-level')),base:bg.style.backgroundImage,color:bg.style.getPropertyValue('--z1-beat-color'),opacity:Number(getComputedStyle(bg,'::before').opacity)});await new Promise(r=>setTimeout(r,25))}return samples})()`);
assert(values.every(v=>v.level>=0&&v.level<=.72&&Math.abs(v.level-v.opacity)<.002));
assert(values.every(v=>v.base===initial.base&&v.color===initial.color),'Beats changed the album hue or base gradient');
assert(Math.max(...values.map(v=>v.level))-Math.min(...values.map(v=>v.level))>.06,'Glow does not follow the rhythm strongly enough');
assert(Math.max(...values.map(v=>v.level))>.12,'Glow remains too subtle');
const menus=await run(`(()=>{const selectors=['.header-secondary-actions','.settings-menu','.settings-submenu','.audio-enhancements-menu','.search-overlay','.modal-content','.context-menu','.queue-drawer','.library-picker','.vis-style-menu'];return selectors.map(selector=>{const style=getComputedStyle(document.querySelector(selector));return {selector,color:style.backgroundColor,filter:style.backdropFilter}})})()`);
for(const menu of menus)assert(menu.color==='rgba(25, 35, 37, 0.45)'&&menu.filter.includes('blur(24px)'),JSON.stringify(menu));
for(const [width,height] of [[1341,772],[390,844]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,200));
 const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'z1-beat-'+width+'.png'),Buffer.from(shot.data,'base64'));
}
await run('toggleSettingsMenu()');
const menuShot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'z1-glass-settings.png'),Buffer.from(menuShot.data,'base64'));
await run('closeSettingsMenu()');
await run('audio.pause()');await new Promise(r=>setTimeout(r,1700));
assert((await run("Number(document.getElementById('bg-container').style.getPropertyValue('--z1-beat-level'))"))<.005,'Paused glow remains lit');
await run('audio.play()');await new Promise(r=>setTimeout(r,400));
await run('audio.volume=0');await new Promise(r=>setTimeout(r,1700));
assert((await run("Number(document.getElementById('bg-container').style.getPropertyValue('--z1-beat-level'))"))<.01,'Glow remains lit in silence');
await run('audio.volume=1;nextTrack()');await new Promise(r=>setTimeout(r,600));
assert.notEqual(await run("document.getElementById('bg-container').style.getPropertyValue('--z1-beat-color')"),initial.color,'Glow palette did not follow the new cover');
await run("setPlayingTheme('modern')");assert.equal(await run("getComputedStyle(document.getElementById('bg-container'),'::before').content"),'none');
assert.notEqual(await run("getComputedStyle(document.querySelector('.settings-menu')).backgroundColor"),'rgba(25, 35, 37, 0.45)','Z1 glass styling leaked into Modern');
await run("setPlayingTheme('z1');toggleBeatGlow()");
await run(`(()=>{
 window.glowPending=new Set();const raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
 window.requestAnimationFrame=callback=>{const id=raf(time=>{glowPending.delete(id);callback(time)});if(callback===beatGlowLoop)glowPending.add(id);return id};
 window.cancelAnimationFrame=id=>{glowPending.delete(id);cancel(id)};
 for(let i=0;i<5;i++){toggleBeatGlow();toggleBeatGlow()}toggleBeatGlow();
})()`);
await new Promise(r=>setTimeout(r,100));assert.equal(await run('glowPending.size'),1,'Multiple glow animation loops');
await run('toggleBeatGlow()');assert.equal(await run('glowPending.size'),0);
assert.equal(await run("Number(document.getElementById('bg-container').style.getPropertyValue('--z1-beat-level'))"),0);
console.log('PASS Z1 stable hue, rhythmic opacity, pause/silence, artwork changes, theme isolation and one RAF loop');
await run("setPlayingTheme('music');audio.volume=1;audio.play();toggleBeatGlow()");
await new Promise(r=>setTimeout(r,1800));
const musicSamples=await run(`(async()=>{
 const samples=[];
 for(let i=0;i<60;i++){
  const bg=document.getElementById('bg-container');
  samples.push({level:Number(bg.style.getPropertyValue('--z1-beat-level')),overlay:getComputedStyle(bg,'::after').backgroundImage});
  await new Promise(r=>setTimeout(r,35));
 }
 return samples;
})()`);
assert(Math.max(...musicSamples.map(s=>s.level))-Math.min(...musicSamples.map(s=>s.level))>.06,'Music glow does not follow the rhythm');
assert(new Set(musicSamples.map(s=>s.overlay)).size>5,'Music glow remains hidden behind the artwork');
assert.equal(await run("getComputedStyle(document.getElementById('music-album-background')).display"),'block','Music lost its blurred artwork');
await run('audio.pause()');await new Promise(r=>setTimeout(r,1700));
assert((await run("Number(document.getElementById('bg-container').style.getPropertyValue('--z1-beat-level'))"))<.005,'Music glow remains lit when paused');
await run('toggleBeatGlow()');
assert.equal(await run("Number(document.getElementById('bg-container').style.getPropertyValue('--z1-beat-level'))"),0,'Music glow remains lit when disabled');
console.log('PASS Music visible rhythmic overlay above blurred artwork, pause decay and disabled reset');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
