/* SPDX-License-Identifier: GPL-3.0-only */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const profile=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'open-bass-browser-'));
const harness=`<!doctype html><audio id="audio-player"></audio><input id="cb-slider" value="5"><span id="cb-engine-status"></span><script>function t(s){return s}function loadLS(){return null}function saveLS(){};</script><script src="/js/open-bass-core.js"></script><script src="/js/audio.js"></script>`;
let failWorklet=false;
const server=http.createServer((req,res)=>{if(new URL(req.url,'http://localhost').pathname==='/test'){failWorklet=req.url.includes('?fallback');res.setHeader('Content-Type','text/html');res.end(harness);return;} if(failWorklet&&req.url==='/js/open-bass-worklet.js'){res.statusCode=404;res.end('Simulated module failure');return;}const p=path.join(root,new URL(req.url,'http://localhost').pathname);try{res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'text/plain');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});
(async()=>{
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const baseURL='http://127.0.0.1:'+server.address().port;
const chrome=spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--mute-audio','--no-proxy-server','--host-resolver-rules=MAP openbass.test 127.0.0.1','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
try{
let tabs;for(let i=0;i<80;i++){try{const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();break;}catch{await new Promise(r=>setTimeout(r,100));}}
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',data=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')console.error('BROWSER',JSON.stringify(m.params));if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
await command('Runtime.enable');
await command('Page.navigate',{url:baseURL+'/test'});
for(let i=0;i<60;i++){const r=await command('Runtime.evaluate',{expression:'typeof initAudioContext'});if(r.result.value==='function')break;if(i===59)console.log(await command('Runtime.evaluate',{expression:'document.documentElement.outerHTML',returnByValue:true}));await new Promise(r=>setTimeout(r,50));}
const run=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const actual=await run(`(async()=>{
Object.defineProperty(window,'WebAssembly',{value:undefined});
initAudioContext();
for(let i=0;i<200&&openBassBackend!=='worklet';i++)await new Promise(r=>setTimeout(r,20));
if(openBassBackend!=='worklet')throw Error('Worklet did not start: '+document.getElementById('cb-engine-status').textContent);
const loaded={status:document.getElementById('cb-engine-status').textContent,filterGain:clearBassFilter.gain.value,guard:!!outputGuardNode};
const runs=[];
for(const rate of [44100,48000,96000])for(const level of [0,10,-10]){
 const delay=Math.round(rate*.005),ctx=new OfflineAudioContext(2,8192,rate);await ctx.audioWorklet.addModule('/js/open-bass-worklet.js');
 const options={outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'};
 const node=new AudioWorkletNode(ctx,'open-bass',{...options,processorOptions:{level}});
 const guard=new AudioWorkletNode(ctx,'open-bass',{...options,processorOptions:{mode:'limiter'}});
 const buffer=ctx.createBuffer(2,8192,rate);for(let ch=0;ch<2;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=.05*Math.sin(2*Math.PI*60*i/rate);}
 const source=ctx.createBufferSource();source.buffer=buffer;source.connect(node);node.connect(guard);guard.connect(ctx.destination);source.start();
 const rendered=await ctx.startRendering();let maxError=0,energy=0;const d=rendered.getChannelData(0),ref=buffer.getChannelData(0);
 for(let i=delay;i<8192;i++){maxError=Math.max(maxError,Math.abs(d[i]-ref[i-delay]));energy+=d[i]*d[i];if(!Number.isFinite(d[i]))throw Error('Non-finite output');}
 runs.push({rate,level,maxError,rms:Math.sqrt(energy/(8192-delay))});
}
outputGuardNode.dispatchEvent(new Event('processorerror'));
return {loaded,runs,recovery:{backend:openBassBackend,status:document.getElementById('cb-engine-status').textContent,gain:clearBassFilter.gain.value,guard:!!outputGuardNode}};
})()`);
assert.equal(actual.loaded.status,'cbEngineOpen');assert.equal(actual.loaded.filterGain,0);assert(actual.loaded.guard);
for(let i=0;i<actual.runs.length;i+=3){assert.equal(actual.runs[i].maxError,0);assert(actual.runs[i+1].rms>actual.runs[i].rms*1.2);assert(actual.runs[i+2].rms<actual.runs[i].rms*.9);}
assert.equal(actual.recovery.backend,'compatible');assert.equal(actual.recovery.status,'cbEngineCompatible');assert.equal(actual.recovery.gain,0);assert(actual.recovery.guard);
console.log('PASS browser: worklet bass + final guard at 44.1/48/96 kHz, exact flat passthrough, and compatible recovery.');
async function navigate(url){await command('Page.navigate',{url});for(let i=0;i<100;i++){const r=await command('Runtime.evaluate',{expression:"location.href==="+JSON.stringify(url)+" && typeof initAudioContext==='function'"});if(r.result.value===true)return;await new Promise(r=>setTimeout(r,30));}throw Error('page load timeout');}
await navigate(baseURL+'/test?fallback');
const fallback=await run(`(async()=>{
initAudioContext();await new Promise(r=>setTimeout(r,100));
return {backend:openBassBackend,status:document.getElementById('cb-engine-status').dataset.i18n,gain:clearBassFilter.gain.value,guard:!!outputGuardNode};
})()`);
assert.equal(fallback.backend,'compatible');assert.equal(fallback.status,'cbEngineCompatible');assert.equal(fallback.gain,0);assert(fallback.guard);
console.log('PASS browser: module download failure retains the identical compatible DSP and final guard.');
const insecure=baseURL.replace('127.0.0.1','openbass.test');
await navigate(insecure+'/test?http');
const httpResult=await run(`(async()=>{
initAudioContext();await audioCtx.resume();document.getElementById('cb-slider').value='10';setClearBassLevel(10);
const chunks=[],node=outputGuardNode,original=node.onaudioprocess;
node.onaudioprocess=event=>{original(event);chunks.push(new Float32Array(event.outputBuffer.getChannelData(0)));};
const tone=audioCtx.createOscillator(),gain=audioCtx.createGain();tone.frequency.value=1000;gain.gain.value=1.6;tone.connect(gain);gain.connect(processingPreamp);tone.start();
await new Promise(r=>setTimeout(r,1300));tone.stop();
const rate=audioCtx.sampleRate,total=chunks.reduce((n,x)=>n+x.length,0),data=new Float32Array(total);let at=0;for(const x of chunks){data.set(x,at);at+=x.length;}
const n=Math.floor(rate/4),start=Math.floor(total/2);if(total<rate*.8||start+n>total)throw Error('No compatible audio callbacks');
let fundamental=0,harmonics=0,peak=0;for(let i=0;i<total;i++)peak=Math.max(peak,Math.abs(data[i]));
for(let h=1;h<=10;h++){let a=0,b=0;for(let i=start;i<start+n;i++){const phase=2*Math.PI*1000*h*i/rate;a+=data[i]*Math.sin(phase);b+=data[i]*Math.cos(phase);}const energy=a*a+b*b;if(h===1)fundamental=energy;else harmonics+=energy;}
const result={secure:isSecureContext,worklet:!!audioCtx.audioWorklet,backend:openBassBackend,status:document.getElementById('cb-engine-status').dataset.i18n,peak,thdPercent:100*Math.sqrt(harmonics/fundamental),frames:total};await audioCtx.close();return result;
})()`);
assert.equal(httpResult.secure,false);assert.equal(httpResult.worklet,false);assert.equal(httpResult.backend,'compatible');assert.equal(httpResult.status,'cbEngineCompatible');assert(httpResult.peak<=.990001);assert(httpResult.thdPercent<.1);
console.log(JSON.stringify(httpResult,null,2));
console.log('PASS browser: actual insecure HTTP renders the independent DSP, with no clipped overscale EQ tone.');
ws.close();
}finally{chrome.kill();server.close();await new Promise(r=>chrome.once('exit',r));fs.rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
