/* SPDX-License-Identifier: GPL-3.0-only */
const assert = require('node:assert/strict');
const path = require('node:path');
const { OpenBassDSP, design } = require(process.argv[2] || path.join(__dirname, '../../js/open-bass-core.js'));
const TAU = 2 * Math.PI;

function responseDb(rate, level, hz) {
  let gain = 0;
  for (const p of design(level)) {
    const a = 10 ** (p.gain / 40), w = TAU * p.frequency / rate;
    const alpha = Math.sin(w) / (2 * p.q), c = Math.cos(w);
    const b = [1 + alpha * a, -2 * c, 1 - alpha * a];
    const d = [1 + alpha / a, -2 * c, 1 - alpha / a];
    const angle = TAU * hz / rate;
    const power = x => (x[0] + x[1] * Math.cos(angle) + x[2] * Math.cos(2 * angle)) ** 2
      + (x[1] * Math.sin(angle) + x[2] * Math.sin(2 * angle)) ** 2;
    gain += 10 * Math.log10(power(b) / power(d));
  }
  return gain;
}
function render(rate, level, left, right, chunks = [128]) {
  const dsp = new OpenBassDSP(rate, level), l = new Float32Array(left.length), r = new Float32Array(left.length);
  let cursor = 0, block = 0;
  while (cursor < left.length) {
    const end = Math.min(left.length, cursor + chunks[block++ % chunks.length]);
    dsp.process(left.subarray(cursor, end), right?.subarray(cursor, end), l.subarray(cursor, end), r.subarray(cursor, end));
    cursor = end;
  }
  return { l, r, delay: dsp.delayFrames };
}
let seed = 123;
const noise = n => Float32Array.from({ length: n }, () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return (seed / 2147483648 - 1) * 1.2;
});
for (const rate of [8000, 22050, 44100, 48000, 96000, 192000]) {
  const left = noise(7000), right = noise(7000);
  const bypass = render(rate, 0, left, right, [1, 17, 128, 511]);
  for (let i = 0; i < left.length; i++) {
    assert.equal(bypass.l[i], i < bypass.delay ? 0 : left[i - bypass.delay]);
    assert.equal(bypass.r[i], i < bypass.delay ? 0 : right[i - bypass.delay]);
  }
  for (let level = -10; level <= 10; level++) {
    const { l, r } = render(rate, level, left, right);
    for (const channel of [l, r]) for (const value of channel) {
      assert(Number.isFinite(value));
      assert(Math.abs(value) < 10, 'unstable filter output');
    }
  }
}
console.log('PASS: all 21 levels at six sample rates; finite filter output and exact bypass.');
for (const level of [-10, -5, 2, 5, 10]) {
  for (const hz of [20, 50, 60, 100, 200, 400, 1000, 2000]) {
    const rate = 48000, input = Float32Array.from({ length: rate }, (_, i) => 0.02 * Math.sin(TAU * hz * i / rate));
    const { l, r, delay } = render(rate, level, input, new Float32Array(rate));
    let sin = 0, cos = 0;
    for (let i = rate / 2; i < rate; i++) { sin += l[i] * Math.sin(TAU * hz * (i - delay) / rate); cos += l[i] * Math.cos(TAU * hz * (i - delay) / rate); assert.equal(r[i], 0); }
    const measured = 20 * Math.log10(4 * Math.hypot(sin, cos) / rate / 0.02);
    assert(Math.abs(measured - responseDb(rate, level, hz)) < 0.015, `${level}, ${hz}: ${measured}`);
  }
}
console.log('PASS: rendered low-level response agrees with the public filter equations; no stereo crosstalk.');
const mono = Float32Array.from({ length: 24000 }, (_, i) => .8 * Math.sin(TAU * 55 * i / 48000));
const negative = Float32Array.from(mono, x => -x);
const linked = render(48000, 10, mono, negative);
for (let i = 0; i < mono.length; i++) assert.equal(linked.l[i], -linked.r[i] || 0);
assert(linked.l.every(Number.isFinite));
const duplicated = render(48000, 5, mono);
assert.deepEqual(duplicated.l, duplicated.r);
console.log('PASS: stereo symmetry and mono handling.');
const changing = new OpenBassDSP(48000, 0), outL = new Float32Array(128), outR = new Float32Array(128);
const block = new Float32Array(128).fill(.2);
for (const level of [10, -10, 5, 0]) {
  changing.setLevel(level);
  for (let i = 0; i < 200; i++) { changing.process(block, block, outL, outR); for (const v of outL) assert(Number.isFinite(v) && Math.abs(v) <= .980001); }
}
assert.equal(changing.level, 0);
for (const value of outL) assert.equal(value, block[0]);
assert.throws(() => new OpenBassDSP(0), RangeError);
changing.setLevel(NaN); assert.equal(changing.targetLevel, 0);
changing.setLevel(100); assert.equal(changing.targetLevel, 10);
const dirty = new Float32Array(128);dirty[0] = NaN;dirty[1] = Infinity;dirty[2] = -Infinity;
changing.process(dirty, dirty, outL, outR);changing.process(dirty, dirty, outL, outR);
assert(outL.every(Number.isFinite));
console.log('PASS: live changes, settled zero bypass, invalid controls and non-finite inputs.');
module.exports = { responseDb, render };
