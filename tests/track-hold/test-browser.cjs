const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.THEME_WEBAPP_ROOT || path.resolve(__dirname,'../..');
const fileMode = process.env.THEME_TEST_FILE === '1';
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'track-hold-evidence-'));console.log('Evidence',artifacts);
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(fs.readFileSync(path.join(root,'index.html')));return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'track-hold-test-'));
chrome=spawn('/usr/bin/google-chrome',['--headless','--disable-background-timer-throttling','--disable-renderer-backgrounding','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
let tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',raw=>{let m=JSON.parse(raw);if(m.method==='Runtime.consoleAPICalled')console.log('CONSOLE',JSON.stringify(m.params.args));if(m.method==='Runtime.exceptionThrown')console.error('EXCEPTION',JSON.stringify(m.params.exceptionDetails));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{let n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{let r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1900,height:700,deviceScaleFactor:1,mobile:false});
await command('Page.navigate',{url:fileMode?require('node:url').pathToFileURL(path.join(root,'index.html')).href:'http://127.0.0.1:'+server.address().port+'/'});

for(let i=0;i<100;i++){if(await run("typeof toggleVisualizerView==='function' && typeof audio!=='undefined'"))break;await new Promise(r=>setTimeout(r,100));}

await run(`(async()=>{
 const rate=8000,count=rate*30,bytes=new Uint8Array(44+count*2),v=new DataView(bytes.buffer);
 const text=(off,s)=>{for(let i=0;i<s.length;i++)bytes[off+i]=s.charCodeAt(i)};
 text(0,'RIFF');v.setUint32(4,36+count*2,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,count*2,true);
 audio.src=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
 await new Promise(resolve=>audio.addEventListener('loadedmetadata',resolve,{once:true}));
 window.trackClicks=0;prevTrack=nextTrack=()=>window.trackClicks++;
 document.getElementById('emby-modal').style.display='none';
 switchTab('playing');
})()`);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const buttons=await run(`document.querySelectorAll('[data-seek-direction]').length`);
assert.equal(buttons,6);
for(let tested=0;tested<buttons;tested++) {
 const i=0;
 // Put each real control in the viewport, including normally hidden overlays.
 await run(`(()=>{
  document.querySelectorAll('[data-seek-direction]').forEach((b,j)=>{
   if(j===${i}) { document.body.appendChild(b); b.style.cssText='position:fixed;display:flex;left:100px;top:100px;width:60px;height:60px;z-index:999999'; b.id='hold-test'; }
  });
  audio.currentTime=12; window.trackClicks=0;
 })()`);
 const direction=await run(`Number(document.getElementById('hold-test').dataset.seekDirection)`);
 const mouse=type=>command('Input.dispatchMouseEvent',{type,x:130,y:130,button:'left',clickCount:1});
 await mouse('mousePressed');await wait(80);await mouse('mouseReleased');
 assert.equal(await run('trackClicks'),1,'Short click must change track');
 assert.equal(await run('audio.currentTime'),12,'Short click must not seek');
 await run('window.trackClicks=0');
 await mouse('mousePressed');await wait(650);
 assert.equal(await run("document.getElementById('track-seek-popup').hidden"),false,'Hold must show popup');
 assert.equal(await run("document.getElementById('track-seek-time').textContent"),(direction<0?'−':'+')+'0:05','Popup must show cumulative seek time');
 const box=await run("(()=>{const r=document.getElementById('track-seek-popup').getBoundingClientRect();return {w:r.width,h:r.height}})()");
 assert(box.h>=48 && box.h<60,'Seek popup must fit the counter vertically');
 if(tested===2) {
  const png=await command('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(artifacts,'seek-popup.png'),Buffer.from(png.data,'base64'));
 }
 await mouse('mouseReleased');
 assert.equal(await run("document.getElementById('track-seek-popup').hidden"),true,'Release must hide popup');
 assert.equal(await run('audio.currentTime'),12+5*direction,'Hold must seek exactly five seconds');
 assert.equal(await run('trackClicks'),0,'Releasing a hold must not change track');
 await wait(600);
 assert.equal(await run('audio.currentTime'),12+5*direction,'Seeking must stop on release');
 await run(`audio.currentTime=${direction<0?2:28}`);
 await mouse('mousePressed');await wait(1150);
 assert.equal(await run("document.getElementById('track-seek-time').textContent"),(direction<0?'−':'+')+'0:02','Popup must count actual movement at boundaries');
 await mouse('mouseReleased');
 assert.equal(await run('audio.currentTime'),direction<0?0:30,'Repeated seeking must clamp at track boundaries');
 await run('audio.currentTime=12');
 await mouse('mousePressed');await run("window.dispatchEvent(new Event('blur'))");await wait(650);await mouse('mouseReleased');
 assert.equal(await run('audio.currentTime'),12,'Blur must cancel hold');
 await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 await run('audio.currentTime=12;window.trackClicks=0');
 await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:130,id:0}]});
 await wait(650);
 await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait(100);
 assert.equal(await run('audio.currentTime'),12+5*direction,'Touch hold must seek five seconds');
 assert.equal(await run('trackClicks'),0,'Touch release must not change track');
 await run('audio.currentTime=12');
 await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:130,id:0}]});
 await command('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await wait(650);
 assert.equal(await run('audio.currentTime'),12,'Touch cancellation must stop seeking');
 await command('Emulation.setTouchEmulationEnabled',{enabled:false});
 await run("document.getElementById('hold-test').remove()");
 // Removing the tested button shifts the next control to index zero.
 if(await run("document.querySelectorAll('[data-seek-direction]').length")===0)break;
}
console.log('PASS: all six controls preserve clicks, seek in five-second steps, clamp and cancel.');
ws.close();
}finally{if(chrome)chrome.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
