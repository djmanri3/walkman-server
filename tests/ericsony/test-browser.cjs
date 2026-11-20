const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'ericsony-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ericsony-test-'));
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

await run("setPlayingTheme('ericsony')");
assert.equal(await run("document.querySelector('[data-playing-theme=ericsony]').getAttribute('aria-pressed')"),'true');
const screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));};
for (const [width,height] of [[1170,540],[1900,900],[390,844],[320,640],[844,390],[768,1024]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,350));
 const boxes=await run(`(()=>{
  const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  return {art:rect('#card-current'),artist:rect('#track-artist'),title:rect('#track-title'),transport:rect('.controls'),progress:rect('#progress-bar'),shortcuts:rect('.ericsony-shortcuts'),view:rect('#view-playing'),scroll:document.body.scrollWidth};
 })()`);
 console.log(width,height,JSON.stringify(boxes));
 assert(boxes.artist.y<boxes.title.y,'Artist should precede song title');
 if(width/height<=1.2) {
  assert(boxes.title.bottom<boxes.art.y,'Portrait metadata should be above the sleeve');
  assert(boxes.transport.y<boxes.art.bottom && boxes.transport.bottom>boxes.art.bottom,'Portrait transport should straddle the sleeve edge');
  assert(boxes.progress.y>boxes.transport.bottom,'Portrait seek bar should sit below the sleeve transport');
  assert(boxes.progress.y>height*.8,'Portrait seek bar should stay near the bottom');
 }
 assert(Math.abs(boxes.art.width-boxes.art.height)<1,'Artwork should be square');
 assert(boxes.transport.y>=boxes.title.bottom-1 || boxes.transport.x>=boxes.art.right,'Transport overlaps metadata');
 for (const key of ['art','artist','title','transport','progress','shortcuts']) {
  const b=boxes[key];assert(b.x>=0 && b.right<=width+1,key+' outside viewport at '+width);
  assert(b.bottom<=height+1,key+' below viewport at '+width);
 }
 assert(boxes.progress.width>100);assert(boxes.scroll<=width);
 await screenshot(width+'x'+height);
}
// Seeking must move the colored segment with the knob, including both ends.
await run('audio.pause()');
for (const progress of [0,45,100]) {
 await run(`seekTrack(${progress})`);
 assert.equal(await run("Number(document.getElementById('progress-bar').value)"),progress);
 assert.equal(await run("Number(document.getElementById('progress-bar').style.getPropertyValue('--played-fraction'))"),progress/100);
 assert(Math.abs(await run('audio.currentTime/audio.duration*100')-progress)<.1);
 if(progress===45) await screenshot('seek-45-percent');
}
await run('seekTrack(0);audio.play()');
console.log('PASS colored track follows playback seeking at start, middle and end');
// Real artwork loads must recolor all three surfaces, even with a custom accent.
assert.equal(await run("document.querySelector('.playing-theme-option').dataset.playingTheme"),'ericsony');
await command('Emulation.setDeviceMetricsOverride',{width:1170,height:540,deviceScaleFactor:1,mobile:false});
await run("setAccentMode('custom');setCustomAccent('#ffaa00')");
const palettes=[];
for (const index of [0,1,2]) {
 await run(`playTrack(${index})`);
 for(let i=0;i<100;i++) {
  if(await run(`imgCurrent.complete && imgCurrent.naturalWidth>0 && imgCurrent.getAttribute('src')===playlist[${index}].coverUrl`))break;
  await new Promise(r=>setTimeout(r,30));
 }
 await new Promise(r=>setTimeout(r,100));
 const palette=await run(`(()=>{
  const bg=document.getElementById('bg-container');
  const style=getComputedStyle(document.getElementById('progress-bar'),'::-webkit-slider-runnable-track');
  return {background:bg.style.backgroundImage,title:getComputedStyle(document.getElementById('track-title')).color,bar:style.backgroundImage,accent:getComputedStyle(document.body).getPropertyValue('--ericsony-accent').trim(),filter:getComputedStyle(bg).filter};
 })()`);
 assert(palette.background.includes('25% 48%'),'Missing Ericsson spotlight');
 assert.equal(palette.filter,'none','Artwork palette should not be desaturated');
 assert.notEqual(palette.title,'rgb(255, 170, 0)','Global custom accent leaked into artwork palette');
 if(palettes.length) {
  assert.notEqual(palette.background,palettes.at(-1).background,'Background did not follow artwork');
  assert.notEqual(palette.title,palettes.at(-1).title,'Title did not follow artwork');
  assert.notEqual(palette.accent,palettes.at(-1).accent,'Seek color did not follow artwork');
 }
 palettes.push(palette);
 await screenshot('palette-'+index);
}
await run("applyPlayingTheme('modern');applyPlayingTheme('ericsony')");
assert.equal(await run("getComputedStyle(document.getElementById('track-title')).color"),palettes.at(-1).title,'Theme switch lost artwork palette');
await run("playTrack(0);setAccentMode('dynamic')");
console.log('PASS artwork changes recolor spotlight, title and seek bar independently of custom accent');
await run("document.querySelector('.ericsony-shortcuts button:last-child').click()");
assert(await run("document.getElementById('queue-drawer').classList.contains('open')"));
await run('toggleQueueDrawer()');
await run("document.querySelector('.ericsony-shortcuts button:first-child').click()");
assert(await run("document.getElementById('view-music').classList.contains('active')"));
await run("switchTab('playing');setLang('en')");
assert.equal(await run("document.getElementById('track-title-text').textContent"),'1000 Faces');
for (const theme of ['modern','classic','z1','music','ericsony']) {
 await run(`setPlayingTheme('${theme}')`);
 assert(await run('!audio.paused'),'Theme switch interrupted playback');
 assert.equal(await run("document.body.dataset.theme"),theme);
}
await command('Page.reload');
for(let i=0;i<100;i++){if(await run("document.querySelector('#view-playing')?.dataset.theme==='ericsony'"))break;await new Promise(r=>setTimeout(r,100));}
assert.equal(await run("document.body.dataset.theme"),'ericsony');
console.log('PASS ericsony responsive layout, navigation, language, playback and saved preference');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
