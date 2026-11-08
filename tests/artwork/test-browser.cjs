const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'artwork-fallback-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'artwork-fallback-test-'));
chrome=spawn('/usr/bin/google-chrome',['--headless','--disable-background-timer-throttling','--disable-renderer-backgrounding','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
let tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',raw=>{let m=JSON.parse(raw);if(m.method==='Runtime.consoleAPICalled')console.log('CONSOLE',JSON.stringify(m.params.args));if(m.method==='Runtime.exceptionThrown')console.error('EXCEPTION',JSON.stringify(m.params.exceptionDetails));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{let n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{let r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1900,height:700,deviceScaleFactor:1,mobile:false});
await command('Page.navigate',{url:fileMode?require('node:url').pathToFileURL(path.join(root,'index.html')).href:'http://127.0.0.1:'+server.address().port+'/'});

for(let i=0;i<100;i++){if(await run("typeof toggleVisualizerView==='function' && typeof audio!=='undefined'"))break;await new Promise(r=>setTimeout(r,100));}

assert(await run("(async()=>{const img=document.getElementById('img-current');await img.decode();return img.naturalWidth>0&&img.src===defaultPlaceholder})()"),'Initial Select a song artwork must load');
if(process.env.ARTWORK_STARTUP_ONLY==='1'){console.log('PASS initial Select a song artwork');ws.close();return;}

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

const loaded=async id=>{
 for(let i=0;i<100;i++){
  if(await run(`(()=>{const img=document.getElementById('${id}');return img.complete&&img.naturalWidth>0&&img.src===defaultPlaceholder})()`))return;
  await new Promise(r=>setTimeout(r,20));
 }
 throw Error('Default album artwork did not load: '+id);
};
for(const type of ['emby','jellyfin','plex','local']) {
 await run(`embyConfig.serverType='${type}';embyConfig.host=location.origin;embyConfig.token='FAKE';setCardImg(document.getElementById('img-current'),getEmbyImageUrl({Id:'missing-${type}',Type:'Audio',AlbumId:'missing-album',IsLocal:${type==='local'}}))`);
 await loaded('img-current');
}
await run("document.getElementById('img-current').src=location.origin+'/missing-again.png'");await loaded('img-current');
for(const theme of ['modern','classic','z1']) {
 await run(`setPlayingTheme('${theme}')`);
 await loaded('img-current');
 await new Promise(r=>setTimeout(r,650));
 const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,theme+'-default-cover.png'),Buffer.from(shot.data,'base64'));
}
await run("embyConfig.serverType='local';playlist[0].coverUrl=location.origin+'/missing-mini.png';switchTab('music')");await loaded('z1-mini-cover');
await run("switchTab('playing');handleArtworkError(document.getElementById('img-current'))");
assert(await run("(async()=>{const img=document.getElementById('img-current');await img.decode();return img.src===emergencyPlaceholder&&img.onerror===null})()"),'Missing packaged artwork must terminate at an embedded fallback');
await run("setCardImg(document.getElementById('img-current'),defaultPlaceholder)");await loaded('img-current');
console.log('PASS new default cover for Emby/Jellyfin/Plex/local, Modern/Classic/Z1, repeated errors, mini player and safe embedded last resort');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
