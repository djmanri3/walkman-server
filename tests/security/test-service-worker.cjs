const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const listeners={},stores=new Map(),scope='https://walkman.test/player/';
const key=request=>typeof request==='string'?new URL(request,scope).href:request.url;
function cache(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return {async put(request,response){data.set(key(request),response)},async match(request){return data.get(key(request))?.clone()},async addAll(urls){for(const url of urls)data.set(key(url),new Response('static'))}}}
let offline=false,nextHeaders={},redirected=false,fetches=0,activations=0;
const caches={async open(name){return cache(name)},async keys(){return [...stores.keys()]},async delete(name){return stores.delete(name)},async match(request){for(const name of stores.keys()){const value=await cache(name).match(request);if(value)return value}}};
const context=vm.createContext({URL,Request,Response,Set,caches,fetch:async request=>{fetches++;if(offline)throw Error('offline');const response=new Response('network',{headers:nextHeaders});if(redirected)Object.defineProperty(response,'redirected',{value:true});return response},self:{registration:{scope},skipWaiting(){activations++;return Promise.resolve()},clients:{claim(){}},addEventListener(type,handler){listeners[type]=handler}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../sw.js'),'utf8'),context);
const currentCache=vm.runInContext('CACHE_NAME',context);
assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,'../../version.json'),'utf8')).cacheVersion,currentCache,'Release metadata and service worker cache must match');
assert(fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8').includes('name="walkman-cache-version" content="'+currentCache+'"'),'Local bundle metadata and service worker cache must match');
async function dispatch(url,{headers={},method='GET',navigate=false,cacheMode='default'}={}){
 const pending=[];let reply;
 const request=new Request(new URL(url,scope),{headers,method,cache:cacheMode});
 if(navigate)Object.defineProperty(request,'mode',{value:'navigate'});
 listeners.fetch({request,respondWith(promise){reply=promise},waitUntil(promise){pending.push(promise)}});
 const response=reply?await reply:null;
 for(let i=0;i<pending.length;i++)await pending[i];
 return response;
}
(async()=>{
 let installPending=[];listeners.install({waitUntil(promise){installPending.push(promise)}});await Promise.all(installPending);
 assert.equal(activations,0,'Installation activated an update without user approval');
 listeners.message({data:{type:'UNKNOWN'},waitUntil(){throw Error('Unexpected activation')}});assert.equal(activations,0);
 let activation;listeners.message({data:{type:'ACTIVATE_UPDATE'},waitUntil(promise){activation=promise}});await activation;assert.equal(activations,1);
 const old=await caches.open('walkman-v40');await old.put('https://media.test/UserFavoriteItems?api_key=private',new Response('private'));
 await caches.open('another-app-cache');let pending=[];
 listeners.activate({waitUntil(promise){pending.push(promise)}});await Promise.all(pending);
 assert(!stores.has('walkman-v40'));assert(stores.has('another-app-cache'));
 for(const url of [
  'https://emby.test/Users/u/Items?api_key=fake','http://jellyfin.test/UserFavoriteItems?api_key=fake',
  'https://plex.test/library/metadata/1?X-Plex-Token=fake','http://media.test/Audio/1/stream?api_key=fake',
  scope+'emby/Users/u/Items',scope+'jellyfin/UserFavoriteItems',scope+'plex/library/sections',
  'https://walkman.test.evil.example/player/js/ui.js','https://images.example/cover.jpg',
  scope+'js/ui.js?token=fake',scope+'js/ui.js?X-Plex-Token=fake',scope+'js/ui.js?api_key=fake',
  scope+'js/ui.js?AuthToken=fake',scope+'js/unknown.js',scope+'vendor/sony-visualizer/../private.json'
 ]){assert.equal(await dispatch(url),null,'Intercepted private or unknown URL: '+url);}
 for(const header of ['Authorization','X-Emby-Token','X-Emby-Authorization','X-Plex-Token'])assert.equal(await dispatch('js/ui.js',{headers:{[header]:'fake'}}),null);
 assert.equal(await dispatch('js/ui.js',{method:'POST'}),null);
 assert.equal(await dispatch('js/ui.js',{cacheMode:'no-store'}),null);
 for(const url of ['js/ui.js','css/styles.css','config.js','vendor/sony-visualizer/visualizer.wasm?v=gate-rectangles-3','vendor/sony-visualizer/visualizer.data?v=gate-rectangles-3','icons/Walkman.png','images/default-album-cover.png','images/z1/artists-variant.png','images/z1/songs-variant.png','images/z1/albums-variant.png','images/z1/playlists-variant.png','images/z1/favorites-variant.png','images/music-previews/songs.png','images/music-previews/albums.png','images/music-previews/artists.png','images/music-previews/playlists.png','images/music-previews/favorites.png']){
  assert.equal(await (await dispatch(url)).text(),'network');
  offline=true;assert.equal(await (await dispatch(url)).text(),'network','Static asset missing offline');offline=false;
 }
 for(const control of ['private, max-age=60','no-store']){
  nextHeaders={'Cache-Control':control};const url='js/audio.js?test='+encodeURIComponent(control);
  await dispatch(url);assert.equal(await caches.match(new URL(url,scope).href),undefined);nextHeaders={};
 }
 redirected=true;await dispatch('js/audio.js?redirected=1');assert.equal(await caches.match(scope+'js/audio.js?redirected=1'),undefined);redirected=false;
 await (await caches.open(currentCache)).put(scope+'index.html',new Response('offline index'));
 offline=true;assert.equal(await (await dispatch('./',{navigate:true})).text(),'offline index');
 const missing=await dispatch('vendor/sony-visualizer/visualizer.js?uncached=1');assert.equal(missing.type,'error','WASM/script fallback must not return HTML');
 assert.equal(await dispatch('jellyfin/UserFavoriteItems',{navigate:true}),null);
 offline=false;assert(await dispatch('https://fonts.gstatic.com/s/materialicons/v1/font.woff2'));
 console.log('PASS Emby/Jellyfin/Plex/private bypass, exact origins, static/WASM/data offline cache, privacy headers, navigation and legacy cache cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
