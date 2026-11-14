const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),blocked=process.env.PLAYBACK_TEST_BLOCKED==='1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'playback-restore-evidence-'));console.log('Evidence',artifacts,'blocked',blocked);
const rate=44100,count=rate*30,wav=Buffer.alloc(44+count*2);wav.write('RIFF',0);wav.writeUInt32LE(36+count*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/rate)*4000),44+i*2);
let mediaRequests=[];
const server=http.createServer((q,r)=>{
 const name=decodeURIComponent(new URL(q.url,'http://local').pathname);
 if(name.startsWith('/api/')) {
  if(name.includes('/stream')){
   mediaRequests.push(name);r.setHeader('Content-Type','audio/wav');r.setHeader('Accept-Ranges','bytes');
   const range=q.headers.range?.match(/bytes=(\d+)-(\d*)/);
   if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),wav.length-1):wav.length-1;r.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${wav.length}`,'Content-Length':end-start+1});r.end(wav.subarray(start,end+1));}
   else {r.setHeader('Content-Length',wav.length);r.end(wav);}return;
  }
  r.setHeader('Content-Type','application/json');r.end(JSON.stringify({Items:[],TotalRecordCount:0,MediaContainer:{Metadata:[],Directory:[]}}));return;
 }
 try {
  const file=path.join(root,name==='/'?'index.html':name);let data=fs.readFileSync(file);
  r.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'application/octet-stream');
  if(name==='/' || name==='/index.html')data=data.toString().replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link href="https:\/\/fonts.googleapis.com[^>]+>/g,'');
  r.end(data);
 } catch {r.statusCode=404;r.end();}
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'playback-restore-test-'));
chrome=spawn('/usr/bin/google-chrome',['--headless','--disable-background-timer-throttling','--disable-renderer-backgrounding','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server',blocked?'--autoplay-policy=document-user-activation-required':'--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
let tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',raw=>{let m=JSON.parse(raw);if(m.method==='Runtime.consoleAPICalled')console.log('CONSOLE',JSON.stringify(m.params.args));if(m.method==='Runtime.exceptionThrown')console.error('EXCEPTION',JSON.stringify(m.params.exceptionDetails));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{let n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{let r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1000,height:800,deviceScaleFactor:1,mobile:false});
const until=async(expression,label)=>{for(let i=0;i<400;i++){try{if(await run(expression))return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+label+' '+await run("({src:audio.src,paused:audio.paused,time:audio.currentTime,error:audio.error?.message,queue:localStorage.getItem('walkman_queue'),playback:localStorage.getItem('walkman_playback')})"));};
await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
await until("typeof restoreQueuedPlayback==='function' && document.getElementById('emby-modal').style.display==='flex'",'startup');
await run(`(()=>{
 playlist=Array.from({length:3},(_,i)=>({Id:'song-'+i,Name:'Song '+i,Artists:['Artist'],Album:'Album',_plexPartId:'part-'+i}));originalPlaylist=[...playlist];currentTrackIndex=1;isShuffle=true;repeatMode=2;
 embyConfig={...embyConfig,serverType:'emby',host:location.origin+'/api',token:'test-only-token',userId:'user',libraryId:'library'};
 saveLS('walkman_server_config',embyConfig);document.getElementById('emby-modal').style.display='none';
})()`);
if(blocked) {
 await run(`saveQueueNow();saveLS('walkman_playback',{source:playbackSource(),trackId:'song-1',position:8,playing:true})`);
 await command('Page.reload');
 await until("typeof audio!=='undefined' && audio.readyState>=1 && audio._resumeWanted && audio.paused && Math.abs(audio.currentTime-8)<.1",'autoplay blocked with position ready');
 assert.equal(await run("document.getElementById('play-icon').textContent"),'play_arrow');
 const box=await run("(()=>{const r=document.querySelector('.control-btn.play').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await command('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',clickCount:1});
 await until('!audio.paused && audio.currentTime>=8 && audioCtx.state==="running"','resume after Play');
 assert.equal(await run('currentTrackIndex'),1);assert.equal(await run('audio._resumeWanted'),false);
 console.log('PASS blocked autoplay: saved position and paused UI, trusted Play gesture resumes without toggling back to pause');
} else {
 for(const type of ['emby','jellyfin','plex']) {
  await run(`embyConfig.serverType='${type}';saveLS('walkman_server_config',embyConfig);playTrack(1,true)`);
  await until('!audio.paused && audio.readyState>=2','initial playback '+type);
  await run('audio.currentTime=8');await until('Math.abs(audio.currentTime-8)<.3','seek before reload');
  // Reload before the 300 ms queue debounce can run.
  await command('Page.reload');
  await until('typeof audio!=="undefined" && !audio.paused && audio.currentTime>=8 && audio.currentTime<12','playing reload '+type);
  assert.equal(await run('currentTrackIndex'),1);assert.equal(await run('playlist.length'),3);assert.equal(await run('isShuffle'),true);assert.equal(await run('repeatMode'),2);
  assert.equal(await run("document.getElementById('track-title-text').textContent"),'Song 1');
  assert.equal(await run("document.getElementById('track-album').textContent"),'Album');
  assert.equal(await run("document.getElementById('play-icon').textContent"),'pause');
  assert((await run('audio.src')).includes(type==='plex'?'/library/parts/part-1/stream':'/Audio/song-1/stream'));
  await run('togglePlay();audio.currentTime=12');await until('Math.abs(audio.currentTime-12)<.1','paused seek');
  await command('Page.reload');
  await until('typeof audio!=="undefined" && audio.readyState>=1 && Math.abs(audio.currentTime-12)<.1','paused reload '+type);
  assert.equal(await run('audio.paused'),true,'Paused playback started after reload');
  assert.equal(await run("document.getElementById('play-icon').textContent"),'play_arrow');
  console.log('PASS',type,'same track, queue, metadata, position and playing/paused intent after reload');
 }
 // Legacy queues without a playback snapshot should still load a usable source.
 await run("saveQueueNow();const q=JSON.parse(loadLS('walkman_queue'));delete q.source;q.v=2;saveLS('walkman_queue',q);localStorage.removeItem('walkman_playback');playlist=[];originalPlaylist=[]");
 await command('Page.reload');await until('typeof audio!=="undefined" && audio.readyState>=1','legacy queue source');assert(await run('audio.paused && audio.currentTime===0'));
 // Never resume an old server's track against a different library.
 await run("saveQueueNow();const config=JSON.parse(loadLS('walkman_server_config'));config.libraryId='other-library';saveLS('walkman_server_config',config)");
 await command('Page.reload');await until("typeof playlist!=='undefined' && document.getElementById('emby-modal').style.display==='none'",'different library');
 assert.equal(await run('audio.src'),'');assert.equal(await run('playlist.length'),0);
 console.log('PASS legacy queue compatibility and source isolation');
 await run("playlist=[{Id:'clear-test',Name:'Clear test',Artists:[],Album:'Album',_plexPartId:'part-clear'}];originalPlaylist=[...playlist];currentTrackIndex=0;playTrack(0,true)");
 await until('!audio.paused && audio.readyState>=2','playback before Clear cache');
 await run('saveQueueNow();clearCache()');
 await until("location.search.includes('v=') && typeof audio!=='undefined' && !audio.src && document.getElementById('emby-modal').style.display==='flex'",'clear-cache reload');
 assert.equal(await run("loadLS('walkman_queue')"),null);assert.equal(await run("loadLS('walkman_playback')"),null);
 console.log('PASS explicit cache reset is not undone by pagehide session persistence');

}
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
