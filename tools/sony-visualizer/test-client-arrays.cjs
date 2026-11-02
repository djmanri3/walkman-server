const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),WebSocket=require('ws');
const root=process.env.SONY_PROBE_ROOT || path.resolve(__dirname,'../build/web/out');
const harness=`<!doctype html><canvas id="sony-visualizer-canvas" width="512" height="512"></canvas><script src="client-probe.js"></script><script>window.messages=[];window.ready=createClientArrayProbe({canvas:document.querySelector('canvas'),print:m=>messages.push(m),printErr:m=>messages.push(m)}).then(m=>window.module=m).catch(e=>{window.failure=String(e)})</script>`;
const server=http.createServer((q,r)=>{let name=decodeURIComponent(new URL(q.url,'http://local').pathname);if(name==='/'){r.setHeader('Content-Type','text/html');r.end(harness);return;}try{let file=path.join(root,name);r.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');r.end(fs.readFileSync(file));}catch{r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sony-web-test-'));
chrome=spawn('/usr/bin/google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
let tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',raw=>{let m=JSON.parse(raw);if(m.method==='Runtime.exceptionThrown')console.error('EXCEPTION',JSON.stringify(m.params.exceptionDetails));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{let n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{let r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await command('Runtime.enable');await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
for(let i=0;i<300;i++){if(await run('!!window.module || !!window.failure'))break;await new Promise(r=>setTimeout(r,200));}
console.log('ready',await run('({ready:!!window.module,failure:window.failure,messages})'));
const result=await run('module._ux_probe()');if(result!==63)throw Error('Geometry fixtures failed, bitmask='+result);console.log('PASS all six geometry fixtures');console.log('DETAILS',await run('messages'));
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
