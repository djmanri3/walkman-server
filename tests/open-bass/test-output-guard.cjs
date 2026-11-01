/* SPDX-License-Identifier: GPL-3.0-only */
const assert = require('node:assert/strict');
const { OpenBassDSP, OutputLimiterDSP } = require('../../js/open-bass-core.js');
function harmonicDistortion(data, rate, frequency) {
  const n = rate / 2, start = data.length - n;
  let fundamental = 0, harmonics = 0;
  for (let h = 1; h <= 10; h++) {
    let sin = 0, cos = 0;
    for (let i = start; i < data.length; i++) {
      const angle = 2 * Math.PI * frequency * h * i / rate;
      sin += data[i] * Math.sin(angle); cos += data[i] * Math.cos(angle);
    }
    const power = sin * sin + cos * cos;
    if (h === 1) fundamental = power; else harmonics += power;
  }
  return 100 * Math.sqrt(harmonics / fundamental);
}
for (const rate of [44100, 48000, 96000]) for (const bass of [0, 10]) {
  const n = rate * 2;
  // Input above full scale is valid between floating-point Web Audio EQ nodes.
  const x = Float32Array.from({ length: n }, (_, i) => 1.6 * Math.sin(2 * Math.PI * 1000 * i / rate));
  const filtered = new Float32Array(n), unused = new Float32Array(n), output = new Float32Array(n), right = new Float32Array(n);
  const dsp = new OpenBassDSP(rate, bass), guard = new OutputLimiterDSP(rate);
  dsp.process(x, x, filtered, unused);
  for (let offset = 0; offset < n; offset += 127) {
    const end = Math.min(n, offset + 127);
    guard.process(filtered.subarray(offset, end), filtered.subarray(offset, end), output.subarray(offset, end), right.subarray(offset, end));
  }
  assert(output.every(v => Number.isFinite(v) && Math.abs(v) <= .990001));
  assert.deepEqual(output, right);
  assert(harmonicDistortion(output, rate, 1000) < .01, `clipping regression: ${rate}, ${bass}`);
}
console.log('PASS: overscale EQ output is gain-limited with THD < 0.01%, at three sample rates and bass 0/+10.');
const guard = new OutputLimiterDSP(48000), x = new Float32Array(48000).fill(4), y = new Float32Array(48000), z = new Float32Array(48000);
guard.process(x, x, y, z);
assert(y.every(v => Math.abs(v) <= .990001));
const reduced = guard.gain;
const silence = new Float32Array(48000);guard.process(silence, silence, y, z);
const recoveryDb = 20 * Math.log10(guard.gain / reduced);
assert(recoveryDb > .68 && recoveryDb < .76, `recovery ${recoveryDb}`);
const low = Float32Array.from({ length: 1000 }, (_, i) => .2 * Math.sin(i));
const clean = new OutputLimiterDSP(48000), a = new Float32Array(1000), b = new Float32Array(1000);
clean.process(low, low, a, b);
for (let i = 0; i < a.length; i++) assert.equal(a[i], i < clean.delayFrames ? 0 : low[i - clean.delayFrames]);
console.log('PASS: controlled slow recovery, overload safety and exact delayed low-level passthrough.');
