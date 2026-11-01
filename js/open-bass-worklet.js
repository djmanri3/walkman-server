/* SPDX-License-Identifier: GPL-3.0-only */
import './open-bass-core.js';

class OpenBassProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.dsp = options.processorOptions?.mode === 'limiter'
      ? new globalThis.OpenBass.OutputLimiterDSP(sampleRate)
      : new globalThis.OpenBass.OpenBassDSP(sampleRate, options.processorOptions?.level ?? 0);
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'level' && this.dsp.setLevel) this.dsp.setLevel(data.value);
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output?.[0]) return true;
    const input = inputs[0] || [];
    this.dsp.process(input[0], input[1], output[0], output[1]);
    return true;
  }
}
registerProcessor('open-bass', OpenBassProcessor);
