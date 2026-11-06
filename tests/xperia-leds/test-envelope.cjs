const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ document: { getElementById: () => ({ addEventListener() {} }) } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/effects.js'), 'utf8'), context);
const run = code => vm.runInContext(code, context);
function envelope(hz, sensitivity = 2, bass = 150, body = 70) {
  return run(`(() => {
    resetXpspLedLevels(); xpspLedSens=${sensitivity};
    const bands=new Uint8Array(128); bands[1]=${bass}; bands.fill(${body},2,11);
    const samples=[];
    for(let frame=1;frame<=${hz};frame++) {
      updateXpspLedLevels(frame<=${hz/2}?bands:new Uint8Array(128),1/${hz},172.265625);
      if(frame % ${hz/10}===0)samples.push(Array.from(xpspLedLevels));
    }
    return samples;
  })()`);
}
const reference=envelope(60);
for(const hz of [30, 120]) {
  const samples=envelope(hz);
  samples.forEach((levels,t) => levels.forEach((level,i) => {
    assert(Number.isFinite(level) && level>=0 && level<=1);
    assert(Math.abs(level-reference[t][i])<0.08, 'Envelope changes with refresh rate');
  }));
}
assert(reference[0].some(level=>level>0.2), 'Missing fast attack');
assert(reference[5][0] < reference[4][0], 'No release after silence');
assert(reference[9].every(level=>level<0.02), 'Lights stay lit during silence');
const low=envelope(60,1,64,32)[4], high=envelope(60,3,64,32)[4];
assert(high.every((value,i)=>value>low[i]), 'Sensitivity has no effect');
for (const levels of reference) assert.equal(levels[0],levels[2],'Side flashes must stay paired');
const held=envelope(60,2,120,120)[4];
assert(held[1]>held[0],'Center should retain more light between attacks');
const flash=run(`(() => {
 resetXpspLedLevels();xpspLedSens=2;const bands=new Uint8Array(128);bands.fill(60,1,11);
 for(let i=0;i<120;i++)updateXpspLedLevels(bands,1/60,172.265625);
 const before=xpspLedLevels[0];bands.fill(180,1,11);
 for(let i=0;i<3;i++)updateXpspLedLevels(bands,1/60,172.265625);
 const peak=xpspLedLevels[0];
 for(let i=0;i<90;i++)updateXpspLedLevels(bands,1/60,172.265625);
 return {before,peak,held:xpspLedLevels[0]};
})()`);
assert(flash.peak>flash.before+0.3,'Missing a flash on a musical attack');
assert(flash.held<flash.peak*0.25,'A sustained note should not hold the side flash on');
run('resetXpspLedLevels()');
assert(run('xpspLedLevels.every(level=>level===0)'));
console.log('PASS: attack/release, silence, sensitivity, paired side flashes and center afterglow, reset and 30/60/120 Hz');
