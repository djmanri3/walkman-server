const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'player-theme-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'player-theme-test-'));
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

await run(`(()=>{
 const cover=color=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="'+color+'"/><path d="M160 80v190a35 35 0 1 1-20-32V100l120-20v150a35 35 0 1 1-20-32V60z" fill="white"/></svg>');
 playlist=['#ac00c8','#b6bf60','#244f6f'].map((color,i)=>({Id:'theme-'+i,Name:['1000 Faces','Second song','Third song'][i],Artists:['Jason Ross, Dia Frampton'],Album:'1000 Faces (Single)',IsLocal:true,coverUrl:cover(color),objUrl:audio.src}));
 currentTrackIndex=0;playTrack(0);return true;
})()`);
await new Promise(r=>setTimeout(r,500));
assert.equal(await run("document.getElementById('view-playing').dataset.theme"),'modern');
await run("toggleSettingsMenu();openSettingsSection('customization')");
assert.equal(await run("document.querySelectorAll('.playing-theme-option svg.playing-theme-preview').length"),2);
await run("document.querySelector('[data-playing-theme=classic]').click()");
assert.equal(await run("document.querySelector('[data-playing-theme=classic]').getAttribute('aria-pressed')"),'true');
const screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));};
await new Promise(r=>setTimeout(r,650));await screenshot('settings');await run('closeSettingsMenu()');
for(const [width,height] of [[1341,772],[880,400],[390,844],[844,390]]) {
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 await new Promise(r=>setTimeout(r,350));
 const layout=await run(`(()=>{
  const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  return {art:rect('#card-current'),near:rect('#card-prev'),far:rect('#card-next'),title:rect('#track-title'),controls:rect('.controls'),volume:rect('#volume-bar'),progress:rect('#progress-bar'),scroll:document.body.scrollWidth,playing:!audio.paused,album:document.querySelector('#track-album').textContent};
 })()`);
 assert(layout.playing);assert.equal(layout.album,'1000 Faces (Single)');
 assert(layout.volume.width>30 && layout.progress.width>50);
 assert(layout.scroll<=width+1,'Horizontal overflow');
 for(const id of ['art','title','controls','volume','progress']) {
  const box=layout[id];assert(box.x>=0&&box.right<=width+1,id+' outside screen at '+width);
  assert(box.y>=0&&box.bottom<=height+1,id+' below screen at '+width);
 }
 assert(layout.near.right-layout.art.right>layout.art.width*.19,'Next artwork is hidden behind the current cover');
 assert(layout.far.right-layout.near.right>layout.art.width*.13,'Second upcoming artwork is hidden');
 assert(layout.far.right<=width+1,'Stack exceeds viewport');
 if(width>680)assert(layout.far.right<layout.title.x,'Classic stack overlaps the track information');
 await screenshot('classic-'+width);console.log('PASS Classic layout',width,height);
}
assert(await run("document.querySelector('#img-prev').src===playlist[1].coverUrl&&document.querySelector('#img-next').src===playlist[2].coverUrl"));
const firstBackground=await run("document.getElementById('bg-container').style.backgroundImage");
assert.equal(await run("getComputedStyle(document.getElementById('view-playing')).backgroundImage"),'none','Classic hides the adaptive background');
assert.equal(await run("getComputedStyle(document.getElementById('view-playing')).backgroundColor"),'rgba(0, 0, 0, 0)');
await run('nextTrack()');await new Promise(r=>setTimeout(r,800));
assert.notEqual(await run("document.getElementById('bg-container').style.backgroundImage"),firstBackground,'Background did not follow the new artwork');
console.log('PASS Classic adaptive background follows album artwork');
assert.equal(await run("document.querySelector('#playing-queue-position').textContent"),'2/3');
assert.equal(await run("document.querySelector('#track-title').textContent"),'Second song');
assert(await run("document.getElementById('card-next').style.display==='none'"),'End of queue should hide missing upcoming artwork');
await run('(async()=>{playTrack(0);await audio.play();document.getElementById("card-next").click();await audio.play()})()');
assert.equal(await run('currentTrackIndex'),2,'Far artwork must play the second upcoming track');
await run('(async()=>{playTrack(0);await audio.play();document.getElementById("card-prev").click();await audio.play()})()');
assert.equal(await run('currentTrackIndex'),1,'Near artwork must play the next track');
const before=await run('audio.currentTime');
await run("setPlayingTheme('modern')");
assert(await run(`!audio.paused&&audio.currentTime>=${before}`));
assert.equal(await run("getComputedStyle(document.querySelector('#view-playing')).display"),'flex');
assert(await run("document.querySelector('#img-prev').src===playlist[0].coverUrl&&document.querySelector('#img-next').src===playlist[2].coverUrl"));
await screenshot('modern');
// A focused theme button must use native Space activation, without toggling playback.
await run("toggleSettingsMenu();openSettingsSection('customization');document.querySelector('[data-playing-theme=classic]').focus()");
await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
assert.equal(await run("document.querySelector('#view-playing').dataset.theme"),'classic');
assert(await run('!audio.paused'));
await command('Page.reload');
for(let i=0;i<100;i++){if(await run("document.querySelector('#view-playing')?.dataset.theme==='classic'"))break;await new Promise(r=>setTimeout(r,100));}
assert.equal(await run("document.querySelector('#view-playing').dataset.theme"),'classic');
await run("applyPlayingTheme('invalid')");
assert.equal(await run("document.querySelector('#view-playing').dataset.theme"),'modern');
console.log('PASS theme switching, playback, queue metadata, keyboard and saved preference');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
