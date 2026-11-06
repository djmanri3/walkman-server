# Open Bass: design, provenance and validation

Open Bass is an independently written bass effect for this web player. Its source
uses public DSP equations and coefficients computed at runtime. It does not load,
translate, ship, or reconstruct vendor machine instructions or coefficient tables.
The earlier experimental ARM-to-WebAssembly translation was removed before commit.
No C translation, vendor-derived Wasm, extraction tool, binary library, original
coefficient array, or original PCM regression fixture is part of this integration.

This describes the technical provenance of this change, not a legal certification
or a review of the rest of the Walkman-themed app. The implementation author had
previously examined the original DSP; this is **not** represented as a formal
clean-room process involving unexposed developers.

## Public mathematical basis

The filters are two standard peaking biquads using the equations in the
[W3C Audio EQ Cookbook](https://www.w3.org/TR/audio-eq-cookbook/), by Robert
Bristow-Johnson, adapted by W3C with permission. The implementation of those
mathematical equations and the streaming/dynamics code were written for this
project; no third-party implementation was copied. The new source files carry
`SPDX-License-Identifier: GPL-3.0-only`, matching the repository's GPLv3 license.

The parameter design is intentionally small and auditable. For slider position
`L` in `[-10, 10]`, the sections use:

| Section | Frequency | Q | Gain (dB) |
| --- | --- | --- | --- |
| Deep bass | 60 Hz | 0.44 | `1.065 * L` |
| Low-mid correction | 200 Hz | 0.79 | `-L * (0.435 + 0.03 * (L / 10)^2)` |

These are our rounded design parameters fitted to externally observed tonal
responses. They are not extracted IIR coefficients. Every biquad coefficient is
calculated from `sin`, `cos`, the public equations, and the actual sample rate.
No lookup table is used. The flat point is an exact delayed passthrough.

## Dynamics and streaming

The two filters operate in floating point. A 15 ms control smoother updates the
filter configuration every 32 samples when the user moves the slider. The level is
clamped to the supported range; non-finite control/audio inputs are handled safely.

The bass stage retains floating-point headroom instead of clipping values to the
output range. A separate stereo-linked lookahead limiter follows the **complete**
EQ + bass + dry/wet VPT mix. This matters because ordinary Web Audio EQ nodes may
legitimately output values above full scale. Clamping those samples creates distortion.

The final guard has a 5 ms lookahead, a 0.99 peak ceiling, a 40 ms gain hold and a slow
0.75 dB/second recovery. It reduces the whole stereo signal coherently. These are
our design choices, calibrated against output measurements from the reference device;
no limiter implementation was copied. Level zero bypasses the bass filters exactly.
The common output guard still provides its 5 ms delay and protects oversized EQ/VPT
output, even when the bass slider is zero.

The implementation supports sample rates from 8 to 192 kHz, preserves stereo channels,
and duplicates mono input. No WebAssembly or Android runtime is required. The existing
VPT sound-generation algorithm was not changed; its output now passes through the
same final protection as the rest of the mix.

## Comparison with the reference effect

Local black-box experiments supplied test audio to the reference effect and measured
its output; original implementation data was not used in the new runtime. Those
private reference tools and the original library remain outside this repository.
The published measurements below are aggregate results, not vendor data tables.

Calibration used 15 tones between 20 Hz and 2 kHz at positive levels 2, 5 and 10,
at 44.1/48 kHz. The independently selected validation tones were:
23, 37, 55, 72, 90, 112, 140, 180, 225, 280, 355, 450, 710, 1400 and 2800 Hz.
Validation covered all 21 integer levels and both rates, totaling 630 cases.
Each case used a 0.02-peak steady sine; the fundamental was fitted in the second
half of a 16,384-frame render after settling. The public filter transfer function
was compared against the measured reference gain.

| Held-out tonal validation | Difference |
| --- | --- |
| RMS over 630 cases | 0.0413 dB |
| Maximum absolute error | 0.1406 dB |

Separate automated tests check that the actual DSP render agrees with its analytic
transfer function within 0.015 dB on a selected frequency grid. These results show
a close **low-level magnitude response**, not equal PCM, matching phase, identical
compression, or proven perceptual indistinguishability on arbitrary music. The
reference measurement scripts/binary are deliberately not redistributed.

## Measurement on the connected Android device

A private, temporary instrumentation helper captured the PCM delivered by the already
installed WalkmanZ1 3.20 engine on an SM-F971B, using Music Center EQ 1.13. Capture
was before AudioTrack volume/mixer processing, with playback muted for the experiment.
This verifies the app DSP output; it is not an acoustic measurement of the speakers,
headphones, Bluetooth path or Samsung system effects. The helper was removed and no
saved equalizer preferences were changed.

The source was a 48 kHz PCM16 stereo probe containing quiet/loud 60 Hz and 1 kHz
tones, a near-full-scale 1 kHz tone, and a multitone segment. Captures covered flat,
bass +5, bass +10, EQ +6, EQ +6/bass +10 and an additional Club configuration.
Dynamic calibration/comparison used the first three profiles (no VPT), six settled
analysis windows each. The maximum RMS level difference across these **18 windows**
was 0.24 dB. No original reference PCM is shipped in the repository.

This is a useful level/behavior comparison, not proof of identical timbre, phase,
transients or sound on arbitrary recordings. In particular, the existing VPT is
still an approximation and was not matched to the Android profiles in this change.

## Runtime integration

- `js/open-bass-core.js`: complete readable implementation; also loadable in Node.
- `js/open-bass-worklet.js`: adapters for both the bass DSP and the final limiter.
- `js/audio.js`: bass processing after EQ; common limiter after the VPT dry/wet sum.
- On HTTPS/localhost, AudioWorklet is preferred. On ordinary HTTP, the **same classes**
  run through a ScriptProcessor compatibility backend. The UI reports independent
  DSP in compatible mode instead of falling back to the old basic bass filter.
- Compatibility processing uses 2048-frame callback buffers for each of the two
  nodes. This adds latency and can be affected by a heavily blocked main thread.
  AudioWorklet remains preferable where available. ScriptProcessor is deprecated
  but deliberately supported here for this user's plain-HTTP setup.
- Module load or worklet processor failures retain/recover the compatible backend.
  If neither backend works, the basic filter reserves conservative pre-EQ headroom
  based on all positive gains and ambience, instead of applying an unprotected boost.
- A classic script loads the common DSP before the app audio script, so HTTP mode
  does not require ES-module loading or WebAssembly on the page.
- The existing iOS Web Audio bypass remains for background playback.
- Both new assets are cached by the service worker, whose version is advanced.

## Reproducible tests

From the repository root, with Node.js:

```sh
node tests/open-bass/test-dsp.cjs
node tests/open-bass/test-output-guard.cjs
```

These check all 21 positions at six sample rates, filter stability, exact bass bypass,
the public filter response, stereo isolation, mono handling, live changes and invalid
inputs. A regression test sends a 1.6-peak 1 kHz tone (representative of boosted EQ
output) through bass 0/+10 and the final guard at three sample rates. Output remains
within the ceiling and steady-state THD is below 0.01%, rather than the old hard
clip. The suite also verifies the slow gain recovery and low-level passthrough. It does not
need a proprietary binary or reference fixture.

The browser test additionally needs Chrome and the Node `ws` package (for example,
the distribution's `node-ws` package). Set `CHROME_BIN` if Chrome is elsewhere:

```sh
node tests/open-bass/test-browser.cjs
```

It starts a temporary localhost server and isolated Chrome profile, loads the real
AudioWorklet with the final guard, checks boost/cut and bypass at 44.1/48/96 kHz,
and verifies compatible recovery after load/processor errors. It also navigates to
a genuinely insecure HTTP origin, where AudioWorklet is unavailable, renders an
oversized tone through the real compatibility callbacks and measures peak/THD. Chrome and its profile
are cleaned up after testing. No user accounts, music servers or copyrighted test
recordings are needed. Firefox, Safari and physical mobile devices have not been
validated in this change.
