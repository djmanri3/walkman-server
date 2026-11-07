const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'xperia-led-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xperia-led-test-'));
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
 for(let i=0;i<count;i++){const envelope=.12+.88*Math.exp(-(i%(rate*.5))/(rate*.055));v.setInt16(44+i*2,(Math.sin(i*2*Math.PI*220/rate)+Math.sin(i*2*Math.PI*880/rate))*6000*envelope,true);}
 audio.src=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));audio.loop=true;
 initAudioContext();await audioCtx.resume();await audio.play();
 document.getElementById('emby-modal').style.display='none';
})()`);

await run(`(()=>{
 const cover=color=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="'+color+'"/><path d="M160 80v190a35 35 0 1 1-20-32V100l120-20v150a35 35 0 1 1-20-32V60z" fill="white"/></svg>');
 playlist=['#dc7a32','#b6bf60','#244f6f'].map((color,i)=>({Id:'theme-'+i,Name:['1000 Faces','Second song','Third song'][i],Artists:['Jason Ross, Dia Frampton'],Album:'1000 Faces (Single)',IsLocal:true,coverUrl:cover(color),objUrl:audio.src}));
 currentTrackIndex=0;playTrack(0);return true;
})()`);

await run("setPlayingTheme('classic');toggleXpspLeds()");
await new Promise(r=>setTimeout(r,500));
for(const [width,height] of [[1341,772],[390,844]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,300));
 const state=await run(`(()=>{
  const strip=document.getElementById('xpsp-led-strip'),r=strip.getBoundingClientRect();
  return {height:r.height,bottom:r.bottom,levels:xpspLedEls.map(e=>Number(e.style.opacity)),background:getComputedStyle(xpspLedEls[0]).backgroundImage,color:strip.style.getPropertyValue('--xpsp-rgb'),expected:[visAlbumColor.r,visAlbumColor.g,visAlbumColor.b].join(', '),playing:!audio.paused};
 })()`);
 assert(state.height>=10 && state.height<=16,'Light bar should stay narrow');assert(Math.abs(state.bottom-height)<1);
 assert(state.levels.every(v=>v>0&&v<=1));assert.equal(state.levels[0],state.levels[2],'Side LEDs must flash together');
 assert.equal(state.color,state.expected,'Light color does not match album artwork');assert(state.background.includes(state.color),'Diffuser does not use the album color');assert(state.playing);
 const png=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'leds-'+width+'.png'),Buffer.from(png.data,'base64'));
 console.log('PASS narrow light bar and coordinated emitters',width,state.levels);
}
const pulses=await run(`(async()=>{const values=[];for(let i=0;i<24;i++){values.push([...xpspLedLevels]);await new Promise(r=>setTimeout(r,50))}return values})()`);
assert(pulses.every(v=>v[0]===v[2]),'Side flashes drift out of sync');
assert(Math.max(...pulses.map(v=>v[0]))-Math.min(...pulses.map(v=>v[0]))>0.15,'Side lights do not pulse with musical attacks');
assert(pulses.some(v=>v[1]>v[0]+0.1),'Missing the center glow between attacks');
console.log('PASS paired flashes on attacks and center glow between beats');
const firstColor=await run("document.getElementById('xpsp-led-strip').style.getPropertyValue('--xpsp-rgb')");
await run('nextTrack()');await new Promise(r=>setTimeout(r,800));
const newColor=await run("document.getElementById('xpsp-led-strip').style.getPropertyValue('--xpsp-rgb')");
assert.notEqual(newColor,firstColor,'LED color did not change with the next cover');
assert.equal(newColor,await run("[visAlbumColor.r,visAlbumColor.g,visAlbumColor.b].join(', ')"));
console.log('PASS LED color follows album artwork across tracks');
// Silence with a playing media element must extinguish the lights too.
await run('audio.volume=0');await new Promise(r=>setTimeout(r,1300));
assert(await run('xpspLedLevels.every(level=>level<0.01)'),'LEDs remain lit in silence');
await run('audio.volume=1');await new Promise(r=>setTimeout(r,400));
assert(await run('xpspLedLevels.some(level=>level>0.1)'),'No response after unmuting');
await run('audio.pause()');await new Promise(r=>setTimeout(r,100));
assert(await run("xpspLedEls.every(e=>Number(e.style.opacity)===0)&&!document.getElementById('xpsp-led-strip').classList.contains('on')"));
// Track the LED's RAF callbacks across rapid disable/re-enable.
await run(`(()=>{
 toggleXpspLeds();window.ledPending=new Set();
 const raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
 window.requestAnimationFrame=callback=>{let id=raf(time=>{ledPending.delete(id);callback(time)});if(callback===xpspLedLoop)ledPending.add(id);return id};
 window.cancelAnimationFrame=id=>{ledPending.delete(id);cancel(id)};
 for(let i=0;i<5;i++){toggleXpspLeds();toggleXpspLeds()}
 toggleXpspLeds();
})()`);
await new Promise(r=>setTimeout(r,100));
assert.equal(await run('ledPending.size'),1,'Multiple LED animation loops');
await run('toggleXpspLeds()');assert.equal(await run('ledPending.size'),0);
assert.equal(await run("document.getElementById('xpsp-led-strip').style.display"),'none');
console.log('PASS silence, resume, pause and a single RAF loop across repeated toggles');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
