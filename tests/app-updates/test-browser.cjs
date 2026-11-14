const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),WebSocket=require('ws'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'app-updates-evidence-'));console.log('Evidence',artifacts);
let revision=58,manifestMode='online';
const server=http.createServer((q,r)=>{
 const name=decodeURIComponent(new URL(q.url,'http://local').pathname);
 r.setHeader('Cache-Control','no-store');
 if(name==='/version.json') {
  r.setHeader('Content-Type','application/json');
  if(manifestMode==='offline'){r.statusCode=503;r.end('{}');return;}
  if(manifestMode==='invalid'){r.end('{"version":"invalid","cacheVersion":"evil"}');return;}
  r.end(JSON.stringify({version:revision===58?'3.0':'3.1',cacheVersion:'walkman-v'+revision}));return;
 }
 try {
  const file=path.join(root,name==='/'?'index.html':name);
  let data=fs.readFileSync(file);
  r.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream');
  if(name==='/sw.js') {
   data=data.toString().replace("const CACHE_NAME = 'walkman-v59'", "const CACHE_NAME = 'walkman-v"+revision+"'")
    .replace("'https://unpkg.com/colorthief@3/dist/umd/color-thief.global.js'", "'./js/utils.js?test=external-script'")
    .replace("'https://fonts.googleapis.com/icon?family=Material+Icons'", "'./css/styles.css?test=external-font'");
  }
  if(name==='/' || name==='/index.html') {
   data=data.toString().replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link href="https:\/\/fonts.googleapis.com[^>]+>/g,'');
   if(revision===58)data=data.replace(/<span>3.1<\/span>/g,'<span>3.0</span>');
  }
  r.end(data);
 } catch {r.statusCode=404;r.end();}
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let chrome;try{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'app-updates-test-'));
chrome=spawn('/usr/bin/google-chrome',['--headless','--disable-background-timer-throttling','--disable-renderer-backgrounding','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
let tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0,pending=new Map();ws.on('message',raw=>{let m=JSON.parse(raw);if(m.method==='Runtime.consoleAPICalled')console.log('CONSOLE',JSON.stringify(m.params.args));if(m.method==='Runtime.exceptionThrown')console.error('EXCEPTION',JSON.stringify(m.params.exceptionDetails));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
const command=(method,params={})=>new Promise((resolve,reject)=>{let n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const run=async expression=>{let r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await command('Runtime.enable');
await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
const url='http://127.0.0.1:'+server.address().port+'/';
const until=async(expression,label)=>{for(let i=0;i<400;i++){try{if(await run(expression))return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+label)};
await command('Page.navigate',{url});
await until("typeof installedAppRelease!=='undefined' && installedAppRelease?.cacheVersion==='walkman-v58' && navigator.serviceWorker.controller",'first install');
assert(await run("document.getElementById('app-update-banner').hidden"),'First visit showed an update notice');
assert.equal(await run('navigator.serviceWorker.controller.state'),'activated');
manifestMode='offline';await run('checkForAppUpdate()');assert(await run("document.getElementById('app-update-banner').hidden"),'Offline check produced a false notice');
manifestMode='invalid';await run('checkForAppUpdate()');assert(await run("document.getElementById('app-update-banner').hidden"),'Malformed metadata produced a false notice');
manifestMode='online';
await run("localStorage.removeItem('walkman_installed_release');saveLS('walkman_accent',JSON.stringify({mode:'custom',custom:'#00ffbb'}));saveLS('walkman_server_config','saved-server');caches.open('another-app-cache')");
revision=59;
await command('Page.reload');
await until("typeof pendingAppRelease!=='undefined' && pendingAppRelease?.cacheVersion==='walkman-v59' && appUpdateRegistration?.waiting",'available update');
assert.equal(await run('installedAppRelease.cacheVersion'),'walkman-v58','Old cache was not detected');
assert.equal(await run('installedAppRelease.version'),'3.0','Version was not read from the old cached page');
assert.equal(await run('appUpdateRegistration.active.state'),'activated');
assert(await run("(async()=> (await caches.keys()).includes('walkman-v58'))()"),'Old version was deleted before approval');
for(const lang of ['en','es','fr','de','it','pt']) {
 await run(`setLang('${lang}')`);
 assert.equal(await run("document.getElementById('app-update-title').textContent"),await run(`I18N.${lang}.appUpdateAvailable`));
 assert.equal(await run("document.getElementById('app-update-now').textContent"),await run(`I18N.${lang}.appUpdateNow`));
 assert.equal(await run("document.getElementById('app-update-later').textContent"),await run(`I18N.${lang}.appUpdateLater`));
 assert(await run("document.getElementById('app-update-versions').textContent.includes('3.0 (v58)') && document.getElementById('app-update-versions').textContent.includes('3.1 (v59)')"));
}
await run("setLang('es');document.getElementById('emby-modal').style.display='none'");
const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'update-banner-mobile.png'),Buffer.from(shot.data,'base64'));
assert.equal(await run("document.querySelector('#app-update-banner a').href"),'https://github.com/djmanri3/walkman-server');
assert(await run("(()=>{const r=document.getElementById('app-update-banner').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"),'Banner overflows mobile');
await run("document.getElementById('app-update-later').click()");
assert(await run("document.getElementById('app-update-banner').hidden"));
assert(await run('!!appUpdateRegistration.waiting'),'Later activated the update');
await run("localStorage.removeItem('walkman_installed_release')");
await command('Page.reload');
await until("typeof pendingAppRelease!=='undefined' && !!pendingAppRelease && !document.getElementById('app-update-banner').hidden",'notice after Later');
// Failed installation keeps settings and the old version, with a retry button.
manifestMode='offline';
await run("window.originalUpdate=appUpdateRegistration.update.bind(appUpdateRegistration);appUpdateRegistration.update=async()=>{throw Error('offline')};applyAppUpdate()");
await until("typeof appUpdateError!=='undefined' && appUpdateError",'retry notice');
assert(await run("!document.getElementById('app-update-error').hidden && !document.getElementById('app-update-now').disabled"));
assert.equal(await run("loadLS('walkman_server_config')"),'saved-server');
manifestMode='online';await run('appUpdateRegistration.update=originalUpdate');
await run("document.getElementById('app-update-now').click()");
await until("location.search.includes('v=walkman-v59') && typeof installedAppRelease!=='undefined' && installedAppRelease?.cacheVersion==='walkman-v59'",'updated reload');
await until("typeof appUpdateRegistration!=='undefined' && !!appUpdateRegistration",'registration after reload');
assert(await run("document.getElementById('app-update-banner').hidden"),'Update notice loops after accepting');
assert.deepEqual(JSON.parse(await run("loadLS('walkman_accent')")),{mode:'custom',custom:'#00ffbb'});
assert.equal(await run("loadLS('walkman_server_config')"),'saved-server');
const keys=await run('caches.keys()');assert(keys.includes('another-app-cache'));assert(keys.includes('walkman-v59'));assert(!keys.includes('walkman-v58'));
// Local files use the embedded bundle metadata, without a service worker.
await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});
await command('Page.navigate',{url:require('node:url').pathToFileURL(path.join(root,'index.html')).href});
await until("typeof installedAppRelease!=='undefined' && installedAppRelease?.cacheVersion==='walkman-v59'",'local baseline');
assert(await run("document.getElementById('app-update-banner').hidden"),'First local load invented an update');
assert.equal(await run('appUpdateRegistration'),null);
await run("saveLS('walkman_installed_release',JSON.stringify({version:'3.0',cacheVersion:'walkman-v58'}));saveLS('walkman_local_test_preference','keep-me')");
await command('Page.reload');
await until("typeof pendingAppRelease!=='undefined' && pendingAppRelease?.cacheVersion==='walkman-v59' && !document.getElementById('app-update-banner').hidden",'local bundle upgrade notice');
await run("document.getElementById('app-update-later').click()");
assert(await run("document.getElementById('app-update-banner').hidden"));
await command('Page.reload');
await until("typeof pendingAppRelease!=='undefined' && !!pendingAppRelease",'local notice after Later');
await run("document.getElementById('app-update-now').click()");
await until("location.search.includes('v=walkman-v59') && typeof installedAppRelease!=='undefined' && installedAppRelease?.cacheVersion==='walkman-v59'",'local update reload');
assert(await run("document.getElementById('app-update-banner').hidden"),'Local update loops');
assert.equal(await run("loadLS('walkman_local_test_preference')"),'keep-me');
console.log('PASS file:// baseline, changed bundle detection, Later, update reload and preserved preferences');
console.log('PASS first install, cache migration, offline/malformed checks, six languages, Later, retry, explicit activation, cache cleanup, preserved preferences and no reload loop');
ws.close();}finally{chrome?.kill();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
