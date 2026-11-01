/* SPDX-License-Identifier: GPL-3.0-only
 * Open Bass: independently written floating-point bass enhancement.
 * Filters use the public RBJ peaking-EQ equations documented by W3C:
 * https://www.w3.org/TR/audio-eq-cookbook/
 * No disassembled instructions, vendor coefficient tables, or binary assets.
 */
(function (root) {
  'use strict';
  const clampLevel = value => Number.isFinite(Number(value)) ? Math.max(-10, Math.min(10, Number(value))) : 0;

  // These are design parameters fitted to external response measurements, not
  // coefficients extracted from an executable. Biquad coefficients are calculated
  // from the public equations at the actual browser sample rate.
  function design(level) {
    level = clampLevel(level);
    return [
      { frequency: 60, q: 0.44, gain: 1.065 * level },
      { frequency: 200, q: 0.79, gain: -level * (0.435 + 0.03 * (level / 10) ** 2) }
    ];
  }

  class PeakingFilter {
    constructor() {
      this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
      this.x1 = new Float64Array(2); this.x2 = new Float64Array(2);
      this.y1 = new Float64Array(2); this.y2 = new Float64Array(2);
    }
    configure(rate, frequency, q, gain) {
      const a = Math.pow(10, gain / 40);
      const angle = 2 * Math.PI * frequency / rate;
      const alpha = Math.sin(angle) / (2 * q);
      const denominator = 1 + alpha / a;
      this.b0 = (1 + alpha * a) / denominator;
      this.b1 = -2 * Math.cos(angle) / denominator;
      this.b2 = (1 - alpha * a) / denominator;
      this.a1 = this.b1;
      this.a2 = (1 - alpha / a) / denominator;
    }
    tick(input, channel) {
      const output = this.b0 * input + this.b1 * this.x1[channel] + this.b2 * this.x2[channel]
        - this.a1 * this.y1[channel] - this.a2 * this.y2[channel];
      this.x2[channel] = this.x1[channel]; this.x1[channel] = input;
      this.y2[channel] = this.y1[channel]; this.y1[channel] = output;
      return output;
    }
    clear() {
      this.x1.fill(0); this.x2.fill(0); this.y1.fill(0); this.y2.fill(0);
    }
  }

  class OpenBassDSP {
    constructor(rate, level = 0) {
      if (!Number.isFinite(rate) || rate < 8000 || rate > 192000) throw new RangeError('Unsupported sample rate');
      this.rate = rate;
      this.targetLevel = this.level = clampLevel(level);
      this.filters = [new PeakingFilter(), new PeakingFilter()];
      this.delayFrames = 0;
      this.smoothing = 1 - Math.exp(-32 / (rate * 0.015));
      this.updateCountdown = 32;
      this.configure();
    }
    setLevel(value) { this.targetLevel = clampLevel(value); }
    configure() {
      const parameters = design(this.level);
      for (let i = 0; i < 2; i++) {
        const p = parameters[i];
        this.filters[i].configure(this.rate, p.frequency, p.q, p.gain);
      }
      if (this.level === 0) for (const filter of this.filters) filter.clear();
    }
    process(left, right, outputLeft, outputRight, frames = outputLeft.length) {
      const second = right || left;
      for (let i = 0; i < frames; i++) {
        if (--this.updateCountdown === 0) {
          const previous = this.level;
          this.level += (this.targetLevel - this.level) * this.smoothing;
          if (Math.abs(this.targetLevel - this.level) < 0.00001) this.level = this.targetLevel;
          if (this.level !== previous) this.configure();
          this.updateCountdown = 32;
        }
        let l = left ? left[i] : 0, r = second ? second[i] : 0;
        if (!Number.isFinite(l)) l = 0;
        if (!Number.isFinite(r)) r = 0;
        if (this.level !== 0) {
          for (const filter of this.filters) { l = filter.tick(l, 0); r = filter.tick(r, 1); }
        }
        // Keep floating-point headroom here. The final output limiter, after EQ
        // and VPT are mixed, applies linked gain instead of hard-clipping samples.
        outputLeft[i] = l;
        if (outputRight) outputRight[i] = r;
      }
    }
  }

  // A final floating-point guard for the complete EQ + bass + ambience mix.
  // A lookahead window and held, stereo-linked gain prevent hard clipping,
  // including when upstream EQ nodes legitimately produce values outside [-1, 1].
  class OutputLimiterDSP {
    constructor(rate) {
      if (!Number.isFinite(rate) || rate < 8000 || rate > 192000) throw new RangeError('Unsupported sample rate');
      this.delayFrames = Math.max(1, Math.round(rate * 0.005));
      this.left = new Float64Array(this.delayFrames);
      this.right = new Float64Array(this.delayFrames);
      this.capacity = this.delayFrames + 2;
      this.times = new Float64Array(this.capacity);
      this.values = new Float64Array(this.capacity);
      this.head = 0; this.tail = 0; this.position = 0; this.clock = 0;
      this.gain = 1; this.hold = 0;
      this.holdFrames = Math.round(rate * 0.04);
      // Independently chosen slow dB recovery, calibrated against device output.
      this.releaseStep = Math.pow(10, 0.75 / (20 * rate));
    }
    process(left, right, outputLeft, outputRight, frames = outputLeft.length) {
      const second = right || left;
      for (let i = 0; i < frames; i++) {
        let l = left ? left[i] : 0, r = second ? second[i] : 0;
        if (!Number.isFinite(l)) l = 0;
        if (!Number.isFinite(r)) r = 0;
        const peak = Math.max(Math.abs(l), Math.abs(r));
        const allowed = peak > 0.99 ? 0.99 / peak : 1;
        while (this.head !== this.tail && this.times[this.head] < this.clock - this.delayFrames) this.head = (this.head + 1) % this.capacity;
        while (this.head !== this.tail) {
          const last = (this.tail + this.capacity - 1) % this.capacity;
          if (this.values[last] < allowed) break;
          this.tail = last;
        }
        this.values[this.tail] = allowed; this.times[this.tail] = this.clock;
        this.tail = (this.tail + 1) % this.capacity;
        const desired = this.values[this.head];
        if (desired < this.gain) { this.gain = desired; this.hold = this.holdFrames; }
        else if (this.hold > 0) this.hold--;
        else this.gain = Math.min(desired, this.gain * this.releaseStep);
        const slot = this.position;
        outputLeft[i] = this.left[slot] * this.gain;
        if (outputRight) outputRight[i] = this.right[slot] * this.gain;
        this.left[slot] = l; this.right[slot] = r;
        this.position = (slot + 1) % this.delayFrames;
        this.clock++;
      }
    }
  }

  const api = { OpenBassDSP, OutputLimiterDSP, design, PeakingFilter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OpenBass = api;
})(globalThis);
