const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const blobs=[];
const context=vm.createContext({window:{},Blob,Uint8Array,DataView,TextDecoder,URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:cover-'+blobs.length}},console:{warn(){}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js/local.js'),'utf8'),context);
const parse=context.extractCoverManually;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b};
const block=(type,data,last=true)=>Buffer.concat([Buffer.from([(last?128:0)|type,(data.length>>16)&255,(data.length>>8)&255,data.length&255]),data]);
const picture=(mime='image/png',description='á日本')=>Buffer.concat([u32(3),u32(Buffer.byteLength(mime)),Buffer.from(mime),u32(Buffer.byteLength(description)),Buffer.from(description),u32(1),u32(1),u32(24),u32(0),u32(png.length),png]);
const flac=data=>Buffer.concat([Buffer.from('fLaC'),data]);
function file(bytes,name='fixture.flac',virtualSize=bytes.length) {
 const blob=new Blob([bytes]);const reads=[];
 return {name,size:virtualSize,reads,slice(start,end){reads.push([start,end]);return blob.slice(start,end)},arrayBuffer(){throw Error('Whole audio file must not be read')}};
}
const syncsafe=n=>Buffer.from([(n>>21)&127,(n>>14)&127,(n>>7)&127,n&127]);
function mp3(version=3){const data=Buffer.concat([Buffer.from([0]),Buffer.from('image/png'),Buffer.from([0,3,0]),png]);const frame=Buffer.concat([Buffer.from('APIC'),version===4?syncsafe(data.length):u32(data.length),Buffer.alloc(2),data]);return Buffer.concat([Buffer.from([73,68,51,version,0,0]),syncsafe(frame.length),frame]);}
(async()=>{
 for(const data of [flac(block(6,picture())),flac(Buffer.concat([block(0,Buffer.alloc(34),false),block(6,picture())]))]){
  const fixture=file(data,'large.flac',2**32);assert(await parse(fixture));
  assert.deepEqual(Buffer.from(await blobs.at(-1).arrayBuffer()),png);
  assert(fixture.reads.every(([start,end])=>end<=data.length),'Read beyond metadata into a large audio file');
 }
 for(const version of [3,4]){
  const data=mp3(version),fixture=file(data,'fixture.mp3',2**32);
  assert(await parse(fixture));assert.deepEqual(Buffer.from(await blobs.at(-1).arrayBuffer()),png);
  assert(fixture.reads.every(([start,end])=>end<=data.length));
 }
 const bad=[Buffer.from('fLaC'),Buffer.from([102,76,97,67,0,255,255,255,252]),flac(block(6,Buffer.alloc(3))),flac(block(6,Buffer.concat([u32(3),u32(0xffffffff)]))),flac(block(6,picture().subarray(0,-1))),Buffer.from('not flac')];
 for(const data of bad)assert.equal(await parse(file(data)),'');
 const emptyBlocks=file(flac(Buffer.alloc(4*4100)));assert.equal(await parse(emptyBlocks),'');assert(emptyBlocks.reads.length<=4097);
 const corrupt=mp3();corrupt.fill(255,14,18);assert.equal(await parse(file(corrupt,'bad.mp3')),'');
 const oversized=file(Buffer.from([73,68,51,3,0,0,127,127,127,127]),'bad.mp3',2**32);assert.equal(await parse(oversized),'');assert.equal(oversized.reads.length,1);
 console.log('PASS FLAC/MP3 covers, exact image bytes, large audio metadata-only reads, truncated/oversized/negative lengths and bounded traversal');
})().catch(error=>{console.error(error);process.exitCode=1});
