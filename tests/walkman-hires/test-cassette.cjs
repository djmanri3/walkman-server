const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'hires-cassette-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'hires-cassette-test-'));
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

await run("setPlayingTheme('walkmanhires');setLang('es')");
assert.equal(await run('isWalkmanHiResCassetteEnabled()'),false);
assert.equal(await run('getWalkmanHiResCassetteDelay()'),10);
await run("setWalkmanHiResCassetteDelay(1);setWalkmanHiResCassetteEnabled(true)");
assert.equal(await run('getWalkmanHiResCassetteDelay()'),3);
await run("toggleSettingsMenu();openSettingsSection('customization')");
assert.equal(await run("getComputedStyle(document.getElementById('walkman-hires-cassette-settings')).display"),'block');
assert.equal(await run("document.getElementById('walkman-hires-cassette-toggle').getAttribute('aria-pressed')"),'true');
const screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));};
await run("document.getElementById('walkman-hires-cassette-settings').scrollIntoView({block:'center'})");
await screenshot('settings');
const visible=()=>run("!document.getElementById('walkman-hires-cassette').hidden");
await new Promise(r=>setTimeout(r,3200));assert(!await visible(),'Cassette interrupted Settings');
await run('closeSettingsMenu()');
await new Promise(r=>setTimeout(r,3300));assert(await visible(),'Cassette did not appear on idle playback');
assert.equal(await run("document.getElementById('walkman-hires-cassette-title').textContent"),'1000 Faces');
assert.equal(await run("getComputedStyle(document.querySelector('.walkman-hires-cassette-spool')).animationPlayState"),'running');
for(const [width,height] of [[393,851],[320,640],[844,390],[1280,720]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,100));
 const bounds=await run("(()=>{const r=document.querySelector('.walkman-hires-cassette-stage').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()");
 assert(bounds.x>=0 && bounds.right<=width+1 && bounds.y>=0 && bounds.bottom<=height+1,'Cassette outside viewport at '+width);
 await screenshot('cassette-'+width+'x'+height);
}
await run('audio.pause()');
assert(await visible(),'Pausing should leave the cassette visible with stopped reels');
assert.equal(await run("getComputedStyle(document.querySelector('.walkman-hires-cassette-spool')).animationPlayState"),'paused');
await run("document.getElementById('walkman-hires-cassette').click()");
assert(!await visible());
await new Promise(r=>setTimeout(r,3200));assert(!await visible(),'Cassette should not open during paused playback');
await run('audio.play()');
await new Promise(r=>setTimeout(r,1800));
await run("document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true}))");
await new Promise(r=>setTimeout(r,1700));assert(!await visible(),'Interaction did not reset the delay');
await new Promise(r=>setTimeout(r,1600));assert(await visible());
await run("playlist[currentTrackIndex].Name='Actualización de canción';updatePlayingThemeData()");
assert.equal(await run("document.getElementById('walkman-hires-cassette-title').textContent"),'Actualización de canción');
await run("applyPlayingTheme('modern')");
assert(!await visible());
assert.equal(await run("getComputedStyle(document.getElementById('walkman-hires-cassette-settings')).display"),'none');
await new Promise(r=>setTimeout(r,3200));assert(!await visible(),'Cassette appeared in another theme');
await run("applyPlayingTheme('walkmanhires');switchTab('music')");
await new Promise(r=>setTimeout(r,3200));assert(!await visible(),'Cassette covered My Music');
await run("switchTab('playing');toggleQueueDrawer()");
await new Promise(r=>setTimeout(r,3200));assert(!await visible(),'Cassette covered the queue');
await run('toggleQueueDrawer();setWalkmanHiResCassetteEnabled(false)');
await new Promise(r=>setTimeout(r,3200));assert(!await visible(),'Disabled cassette screen appeared');
await run('setWalkmanHiResCassetteEnabled(true);audio.pause()');
await command('Page.reload');
for(let i=0;i<100;i++){if(await run("document.querySelector('#view-playing')?.dataset.theme==='walkmanhires'"))break;await new Promise(r=>setTimeout(r,100));}
assert.equal(await run('isWalkmanHiResCassetteEnabled()'),true);
assert.equal(await run('getWalkmanHiResCassetteDelay()'),3);
assert(!await visible());
console.log('PASS cassette idle delay, Settings guard, animation, pause, dismissal, metadata, responsiveness, other-theme isolation and saved preferences');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
