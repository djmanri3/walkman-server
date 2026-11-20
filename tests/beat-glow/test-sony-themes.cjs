const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'sony-themes-beat-evidence-'));console.log('Evidence',artifacts);
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



await command('Emulation.setDeviceMetricsOverride',{width:393,height:851,deviceScaleFactor:1,mobile:true});
const screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));};
for(const theme of ['ericsony','walkmanhires']) {
 await run(`setPlayingTheme('${theme}');switchTab('playing');audio.play()`);
 await new Promise(r=>setTimeout(r,350));
 const baseline=await run("({background:document.getElementById('bg-container').style.backgroundImage,wash:document.body.style.getPropertyValue('--walkman-hires-wash'),mini:document.body.style.getPropertyValue('--walkman-hires-mini-wash')})");
 await run('if(!beatGlowEnabled)toggleBeatGlow()');
 const samples=await run(`(async()=>{
  const values=[];
  for(let i=0;i<120;i++) {
   values.push({level:Number(document.body.style.getPropertyValue('--walkman-beat-level')),opacity:Number(getComputedStyle(document.getElementById('bg-container'),'::before').opacity)});
   await new Promise(r=>setTimeout(r,25));
  }
  return values;
 })()`);
 const levels=samples.map(sample=>sample.level);
 assert(Math.max(...levels)>.2,theme+' glow is not visible');
 assert(Math.max(...levels)-Math.min(...levels)>.05,theme+' glow is not reacting to beats');
 assert(samples.every(sample=>Math.abs(sample.opacity-sample.level)<.002),theme+' glow layer is hidden');
 const after=await run("({background:document.getElementById('bg-container').style.backgroundImage,wash:document.body.style.getPropertyValue('--walkman-hires-wash'),mini:document.body.style.getPropertyValue('--walkman-hires-mini-wash')})");
 assert.deepEqual(after,baseline,theme+' beat loop repainted the artwork palette');
 await screenshot(theme+'-glow');
 if(theme==='walkmanhires') {
  await run("switchTab('music')");
  await new Promise(r=>setTimeout(r,600));
  assert.equal(await run("Number(getComputedStyle(document.getElementById('bg-container'),'::before').opacity)"),0,'Library should remain black');
  const miniLevels=await run(`(async()=>{const values=[];for(let i=0;i<60;i++){values.push(Number(getComputedStyle(document.getElementById('z1-mini-player'),'::after').opacity));await new Promise(r=>setTimeout(r,25))}return values})()`);
  assert(Math.max(...miniLevels)>.1,'Library mini-player does not glow');
  await screenshot('hires-library-glow');
  await run("switchTab('playing')");
 }
 await run('audio.pause()');
 await new Promise(r=>setTimeout(r,1800));
 assert(await run("Number(document.body.style.getPropertyValue('--walkman-beat-level'))<.01"),theme+' glow is frozen after pause');
 if(theme==='walkmanhires') assert.equal(await run("Number(getComputedStyle(document.getElementById('bg-container'),'::before').opacity)"),0);
 await run('toggleBeatGlow()');
 assert.equal(await run("Number(document.body.style.getPropertyValue('--walkman-beat-level'))"),0);
 assert.equal(await run("Number(getComputedStyle(document.getElementById('bg-container'),'::before').opacity)"),0);
 console.log('PASS',theme,'audio-driven beat variation, stable palette, pause and disabled state');
}
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
