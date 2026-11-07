# Sony Visualizer in Walkman Server

Open Visualizer, then the style menu. The `Sony ·` entries run the original recovered UXVisualizerCore engine compiled to WebAssembly: Gate, Balloon, Glow, Animal, Albums, Graffiti, Ink and Random. The existing web styles remain available. For HTTP/HTTPS, the roughly 34 MB runtime is fetched only when a Sony style is first selected; the service worker caches fetched files for later use.

The adapter follows the current web player's track, play/pause state, position, title, artist, album and artwork. It reuses `getEmbyImageUrl`, which already handles Emby, Jellyfin, Plex and local cover URLs. Up to twelve different queue images feed Albums. Servers must permit cross-origin image reads; otherwise the engine uses its original fallback artwork. No additional credentials are stored or sent to a new service.

The engine uses its original fallback music timeline when Sony SensMe analysis is absent, as in the Android port. This is not new FFT artwork or a JavaScript imitation of its scenes. Matching every pixel to the APK across different graphics implementations has not been established.

## Opening index.html directly

For `file://`, the adapter automatically loads `vendor/sony-visualizer/visualizer-file.js` (about 46 MB). This self-contained script embeds exactly the same WASM and resource bytes and provides them to Emscripten in memory. It makes no fetch/XHR requests for `.wasm` or `.data`, and needs no browser security overrides or local web server. Keep the vendor directory beside index.html and reload the page after updating. Ordinary HTTP/HTTPS hosting continues to use the separate, smaller files.

## Implementation and provenance

- `js/sony-visualizer.js`: lazy loader and adapter, separate WebGL canvas, no extra audio route.
- `vendor/sony-visualizer/visualizer.{js,wasm,data}`: ready-to-serve runtime. Serve `.wasm` as `application/wasm` and `.data` as binary.
- `vendor/sony-visualizer/manifest.json`: toolchain, adaptations and SHA-256 fingerprints.
- `tools/sony-visualizer/`: browser entry points, platform adapter and build preparation.

The recovered instruction semantics/data and original visual assets are the same inputs used by the native ARM64 APK, whose engine was recovered from Sony's 2.3.A.0.7 firmware. Identity to an external 2.3.A.0.9 engine has not been proven. Skia and its dependencies come from AOSP android-5.0.2_r1; Droid Sans regular/bold come from [AOSP android-2.3.7_r1](https://android.googlesource.com/platform/frameworks/base/+/android-2.3.7_r1/data/fonts/). The Sony engine/assets and third-party fonts and libraries retain their respective provenance and licenses; this port does not relicense them as the web application's own code.

The OpenGL ES 1 path is implemented by Emscripten's WebGL compatibility layer with explicit fixes for point attenuation, sprite coordinates and shader selection on primitive changes. Finite worker jobs execute synchronously on separate engine stacks, so the web server needs no COOP/COEP or SharedArrayBuffer configuration. Switching a complex effect can briefly occupy the main thread. WebAssembly and WebGL are required; mobile browser performance and visual equivalence remain to be tested.

The page CSP adds only `wasm-unsafe-eval`; it does not enable JavaScript `unsafe-eval`. When a self-hosted proxy also sets CSP, it must allow the same WebAssembly operation. The existing audio graph is unchanged, including the app's existing iOS audio-processing policy.

## Rebuilding

Requires the recovered native-engine build workspace (`walkman-dlna/Visualizer`) with `build/recompiled`, `build/skia64` and source dependencies already prepared, plus Emscripten SDK 4.0.19 activated under its `tools/emsdk` directory. It is not an independent clean-room rebuild from Sony source.

```sh
SONY_VISUALIZER_ROOT=/path/to/walkman-dlna/Visualizer bash tools/sony-visualizer/build.sh
```

The build also generates `visualizer-file.js` for direct file opening. Copy it into `vendor/sony-visualizer/` as well. Copy the three generated `build/web/out/visualizer.{js,wasm,data}` files into `vendor/sony-visualizer/` together, then refresh the fingerprints. No Android APK installation is needed.

## Validation

Chromium desktop with software WebGL, over HTTP and direct file:// (without allow-file-access flags): seven original scenes render, local WAV playback continues through theme changes, local cover appears in Albums, existing style selection and close/reopen work. Metadata checks cover empty strings, accents and Japanese text. The integration browser test uses only synthetic audio and images; it does not connect to a user's media server.

```sh
node tests/sony-visualizer/test-browser.cjs
SONY_TEST_FILE=1 node tests/sony-visualizer/test-browser.cjs
```

Requires Chrome and Node's `ws` module. It starts a temporary loopback server and an isolated browser profile. Remote server libraries and physical Android/iOS browsers have not been tested in this pass.

## Independent vertex buffers (graphics revision 2)

Sony's textured scenes bind position/color data in one VBO (stride 16) and texture coordinates in a different VBO (stride 8). Emscripten's upstream ES1 compatibility assumed one buffer and interpreted these offsets using a combined stride, producing the diagonal/noisy triangles in Gate, Balloon, Animal, Graffiti and Ink. `patch-gl.py` now records the buffer at each pointer call and binds each attribute's own buffer/stride/offset when setting up the shader. Unbinding ARRAY_BUFFER after pointer setup also preserves those bindings, as required by the ES1 model.

CPU arrays are independently repacked without assuming that matching strides mean shared storage, and their caller-owned pointers remain unchanged so in-place updates work on subsequent draws.

The geometry probe checks known framebuffer colors for separate CPU arrays, mutable CPU data, interleaved data, mutable UVs, separate position/color and UV VBOs, and VBO pointers after unbinding. The previous VBO implementation fails the final two cases; all six pass with this revision. The real-scene browser suite also records attribute bindings and checks independent VBOs for the five affected themes at 1900×700, in addition to playback and visible output. Screenshots were manually reviewed to verify that the noisy triangular meshes are gone.

```sh
SONY_VISUALIZER_ROOT=/path/to/walkman-dlna/Visualizer bash tools/sony-visualizer/test-geometry.sh
```

## Gate rectangular variant (graphics revision 3)

The recovered Gate implementation randomly picks either Box or Circle textures in `RGGlowBeatGate::loadImage`. That can show rings even when all geometry is correct. The web menu's Sony Gate now always selects the original rectangular Box_Regular_01.png and Box_Bar_01.png assets. `rectangularGates` verifies the recovered table names and aliases only the two Gate image-table entries in the web runtime's private engine memory; it does not rewrite the original PNG pixels or change their animation routines. The Android APK is unaffected.

The adapter and runtime URLs include `gate-rectangles-3`. The initialized engine exports that revision and the adapter verifies it before playback, so an outdated renderer does not silently masquerade as the current one. The service worker precaches the same adapter URL used by index.html.

`test-gate.cjs` verifies opening Gate, seeking to two minutes and returning from Ink using a long local audio fixture. It captures the actual 512×512 RGBA texture uploads and checks the Regular/Bar pixel hashes against the native ARM64 Skia reference, then records screenshots. Both rectangular images must be present in each scenario; merely checking for non-black output is insufficient.

```sh
SONY_TEST_FILE=1 node tests/sony-visualizer/test-gate.cjs
node tests/sony-visualizer/test-gate.cjs
```

## Changing tracks while an effect is open

The adapter reapplies the selected scene before replacing its music data, including when the effect name stays the same. The recovered scenes retain per-song resources; replacing music without this scene reset could leave stale references and stop rendering after repeated track changes. Artwork is prepared before that reset, then metadata and the complete cover collection are installed together before the first native frame. While images are loading, the last complete frame stays visible. Failed or timed-out image reads are skipped; if no image is readable, the engine uses its original fallback. This resets the scene inside the existing runtime and does not reload WebAssembly or change the player's audio route.

The track-change regression uses different titles and cover images, checks continued drawing and playback, and exercises all seven scenes plus Random. It supports HTTP and direct file opening:

```sh
node tests/sony-visualizer/test-track-changes.cjs
SONY_TEST_FILE=1 node tests/sony-visualizer/test-track-changes.cjs
```

The Albums regression verifies the actual uploaded textures for three distinct covers after repeated track changes, rather than accepting any non-black output:

```sh
node tests/sony-visualizer/test-albums.cjs
SONY_TEST_FILE=1 node tests/sony-visualizer/test-albums.cjs
```
