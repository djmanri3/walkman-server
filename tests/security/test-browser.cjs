const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.SECURITY_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'security-evidence-'));console.log('Evidence',artifacts);
let networkOffline=false;
const server=http.createServer((q,r)=>{if(networkOffline){q.socket.destroy();return;}let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'security-test-'));
chrome=spawn('/usr/bin/google-chrome',['--headless','--disable-background-timer-throttling','--disable-renderer-backgrounding','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
let tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',raw=>{let m=JSON.parse(raw);if(m.method==='Runtime.consoleAPICalled')console.log('CONSOLE',JSON.stringify(m.params.args));if(m.method==='Runtime.exceptionThrown')console.error('EXCEPTION',JSON.stringify(m.params.exceptionDetails));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{let n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{let r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1900,height:700,deviceScaleFactor:1,mobile:false});
await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});

for(let i=0;i<100;i++){if(await run("typeof toggleVisualizerView==='function' && typeof audio!=='undefined'"))break;await new Promise(r=>setTimeout(r,100));}


const payload='Audit <img src="data:," onerror="window.__xss++"> & \' á日本';
await run(`(()=>{
 window.__xss=0;window.auditPayload=${JSON.stringify(payload)};
 const cover=document.createElement('canvas');cover.width=cover.height=8;window.auditCover=cover.toDataURL();window.auditCanvas=cover;
 window.auditRaw={Id:'audit',Type:'Audio',Name:auditPayload,Artists:[auditPayload],Album:auditPayload,AlbumArtist:auditPayload,Path:auditPayload+'.flac',ImageTags:{Primary:'cover'},MediaSources:[{Container:'flac',MediaStreams:[{Type:'Audio',Codec:'flac',SampleRate:96000,Channels:2}]}]};
 const realFetch=window.fetch.bind(window);
 window.fetch=async(input,options)=>{
  const url=String(input.url||input);
  if(url.startsWith(location.origin+'/audit/')){
   if(url.includes('/plex/'))return new Response(JSON.stringify({MediaContainer:{Metadata:[{ratingKey:'audit',type:10,title:auditPayload,grandparentTitle:auditPayload,parentTitle:auditPayload,thumb:'/cover.png',Media:[{audioCodec:'flac',audioSampleRate:96000,Part:[{id:'part',file:auditPayload+'.flac'}]}]}]}}),{headers:{'Content-Type':'application/json'}});
   return new Response(JSON.stringify({Items:[auditRaw],TotalRecordCount:1}),{headers:{'Content-Type':'application/json'}});
  }
  return realFetch(input,options);
 };
 saveLS('walkman_server_config',{token:'AUDIT_FAKE_TOKEN'});
 document.getElementById('emby-modal').style.display='none';
})()`);
for(const type of ['emby','jellyfin','plex','local']) {
 await run(`(async()=>{
  embyConfig={...embyConfig,serverType:'${type}',host:location.origin+'/audit/${type}',token:'AUDIT_FAKE_TOKEN',userId:'user',libraryId:'library'};
  localTracks=[{...auditRaw,IsLocal:true,coverUrl:auditCover}];
  await loadCategory('Songs');
  window.auditTrack=currentCategoryItems[0];
 })()`);
 assert.equal(await run("document.querySelector('#items-container .list-item:not(.list-item-shuffle) .list-item-title').firstChild.textContent"),payload,type+' category metadata changed');
 assert.equal(await run("document.querySelectorAll('#items-container .list-item-title img').length"),0);
 assert(await run("!!document.querySelector('#items-container .list-hires-icon')"),'Hi-Res badge lost for '+type);
 await run('playlist=[auditTrack];currentTrackIndex=0;renderQueueList();ctxMenuItem=auditTrack;ctxShowInfo()');
 assert.equal(await run("document.querySelector('.queue-item-title').textContent"),payload);
 assert(await run("document.getElementById('ctx-menu-info').textContent.includes(auditPayload)"));
 assert.equal(await run("document.getElementById('ctx-menu-info').querySelectorAll('img').length"),0);
 await run('renderTrackList([auditTrack])');
 assert.equal(await run("document.querySelector('#items-container .list-item:not(.list-item-shuffle) .list-item-title').firstChild.textContent"),payload);
 await run('fetchFavorites=async()=>[auditTrack];loadFavorites("Songs")');await new Promise(r=>setTimeout(r,100));
 assert.equal(await run("document.querySelector('#items-container .list-item:not(.list-item-shuffle) .list-item-title').firstChild.textContent"),payload);
 await run('handleSearch("audit")');await new Promise(r=>setTimeout(r,600));
 assert.equal(await run("document.querySelector('#search-results-container .list-item-title').textContent"),payload);
 const url=await run('getEmbyImageUrl(auditTrack)');
 if(type==='local')assert(url.startsWith('data:image/'));else assert(url.includes(type==='plex'?'X-Plex-Token=':'api_key='),'Image authentication changed');
 assert.equal(await run('window.__xss'),0);
 console.log('PASS',type,'adapter, category, tracks, favorites, search, queue, information and Hi-Res with hostile metadata');
}
await run(`(()=>{
 featuredSlides=[{img:auditPayload,title:auditPayload,artist:auditPayload}];buildFeaturedSlides();
 const div=document.createElement('div');document.body.appendChild(div);renderMediaRow(div,'data:," onerror="window.__xss++',auditPayload,auditPayload);
})()`);
await new Promise(r=>setTimeout(r,150));
assert.equal(await run("document.querySelector('.featured-slide-title').textContent"),payload);
assert.equal(await run("document.querySelectorAll('.featured-slide img').length"),0);
assert.equal(await run('window.__xss'),0);
// Actual browser Files, Blob URLs and image decoding exercise the local cover reader.
assert(await run(`(async()=>{
 const png=new Uint8Array(await(await new Promise(resolve=>auditCanvas.toBlob(resolve))).arrayBuffer());
 const u32=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n);return b};
 const mime=new TextEncoder().encode('image/png');
 const payload=new Blob([u32(3),u32(mime.length),mime,u32(0),u32(8),u32(8),u32(24),u32(0),u32(png.length),png]);
 const data=new Uint8Array(await payload.arrayBuffer());
 const file=new File([new TextEncoder().encode('fLaC'),new Uint8Array([134,data.length>>16,(data.length>>8)&255,data.length&255]),data],'test.flac');
 const url=await extractCoverManually(file);const img=new Image();img.src=url;await img.decode();URL.revokeObjectURL(url);
 return img.naturalWidth===8;
})()`));
console.log('PASS slideshow/URL injection prevention and real FLAC cover decoding');
await run(`(async()=>{
 await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service worker not ready')),15000))]);
 if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
 for(const path of ['js/utils.js','vendor/sony-visualizer/visualizer.wasm']){
  const url=new URL(path,location.href).href;await(await fetch(url)).arrayBuffer();
  for(let i=0;i<100;i++){if(await caches.match(url))break;await new Promise(r=>setTimeout(r,50))}
  if(!await caches.match(url))throw Error('Missing cached asset: '+path);
 }
})()`);
networkOffline=true;
await command('Network.enable');
await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
const offline=await run(`(async()=>{
 const script=await(await fetch('js/utils.js')).text();
 const wasm=await fetch('vendor/sony-visualizer/visualizer.wasm');
 let privateBlocked=false,missingBlocked=false;
 try{await fetch('js/utils.js',{cache:'no-store',headers:{Authorization:'Bearer AUDIT_FAKE_TOKEN'}})}catch{privateBlocked=true}
 try{await fetch('vendor/sony-visualizer/visualizer.wasm?uncached=1')}catch{missingBlocked=true}
 return {script:script.includes('function escapeHtml'),wasmType:wasm.headers.get('Content-Type'),wasmBytes:(await wasm.arrayBuffer()).byteLength,privateBlocked,missingBlocked};
})()`);
assert(offline.script&&offline.wasmBytes>1000000);assert.equal(offline.wasmType,'application/wasm');assert(offline.privateBlocked&&offline.missingBlocked);
networkOffline=false;
await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
console.log('PASS real service worker offline JS/WASM and rejection of authenticated or uncached requests');

ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
