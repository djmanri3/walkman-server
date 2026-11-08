const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({document:{getElementById:()=>({addEventListener(){}})}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js/effects.js'),'utf8'),context);
const run=code=>vm.runInContext(code,context);
function envelope(hz,sensitivity=2) {
 return run(`(()=>{
  resetZ1BeatEnvelope();beatGlowSens=${sensitivity};
  const bands=new Uint8Array(128);bands[1]=200;bands.fill(60,2,6);
  const samples=[],frames=[];
  for(let frame=1;frame<=${hz*2};frame++){
   const level=updateZ1BeatEnvelope(frame<=${hz/2}?bands:null,1/${hz},172.265625);
   frames.push(level);if(frame%${hz/10}===0)samples.push(level);
  }
  return {samples,frames};
 })()`);
}
const reference=envelope(60);
for(const hz of [30,60,120]) {
 const state=envelope(hz);
 state.samples.forEach((level,i)=>{
  assert(Number.isFinite(level)&&level>=0&&level<=.72);
  assert(Math.abs(level-reference.samples[i])<.04,'Glow changes with refresh rate');
 });
 assert(Math.max(...state.frames)>.25,'Glow is too subtle');
 assert(state.samples.at(-1)<.005,'Glow freezes after pause/silence');
 for(let i=1;i<state.frames.length;i++)assert(Math.abs(state.frames[i]-state.frames[i-1])<.2,'Abrupt flash');
}
const peaks=[1,2,3].map(s=>Math.max(...envelope(60,s).frames));
assert(peaks[0]<peaks[1]&&peaks[1]<peaks[2],'Sensitivity levels should increase smoothly');
assert(run(`(()=>{resetZ1BeatEnvelope();const bands=new Uint8Array(128);bands.fill(255,10);for(let i=0;i<120;i++)updateZ1BeatEnvelope(bands,1/60,172.265625);return z1BeatLevel===0})()`),'High frequencies should not create a full-screen flash');
assert(run(`(()=>{resetZ1BeatEnvelope();const bands=new Uint8Array(128);bands[1]=200;for(let i=0;i<300;i++)updateZ1BeatEnvelope(bands,1/60,172.265625);return z1BeatLevel<.04})()`),'A sustained bass note should settle rather than stay bright');
for(const hz of [30,60,120]) {
 const modulation=run(`(()=>{resetZ1BeatEnvelope();const values=[];for(let frame=0;frame<${hz*6};frame++){const bands=new Uint8Array(128);bands[1]=Math.round(190+8*Math.sin(2*Math.PI*2*frame/${hz}));bands.fill(50,2,6);const value=updateZ1BeatEnvelope(bands,1/${hz},172.265625);if(frame>${hz*3})values.push(value)}return Math.max(...values)-Math.min(...values)})()`);
 assert(modulation>.05,'Continuous music stopped pulsing after adaptation at '+hz+' Hz: '+modulation);
}
console.log('PASS Z1 smooth attack/release, bass response, bounded brightness, silence, sensitivity and 30/60/120 Hz timing');
