"""Bundle the identical WASM and resource bytes for file:// without fetch/XHR."""
from pathlib import Path
import base64,os
root=Path(os.environ.get('SONY_VISUALIZER_ROOT',Path(__file__).resolve().parents[1]))
out=root/'build/web/out'
wrapper=r'''
;(() => {
  const factory = createSonyVisualizer;
  function decode(encoded) {
    const result = new Uint8Array(encoded.length * 3 / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0));
    let offset = 0;
    // Decode in bounded chunks to avoid a second full-size binary string.
    for (let start = 0; start < encoded.length; start += 65536) {
      const chunk = atob(encoded.slice(start, start + 65536));
      for (let i = 0; i < chunk.length; i++) result[offset++] = chunk.charCodeAt(i);
    }
    return result;
  }
  window.createSonyVisualizer = options => factory({
    ...options,
    wasmBinary: decode('__WASM__'),
    getPreloadedPackage: () => decode('__DATA__').buffer
  });
})();
'''
wrapper=wrapper.replace('__WASM__',base64.b64encode((out/'visualizer.wasm').read_bytes()).decode('ascii')).replace('__DATA__',base64.b64encode((out/'visualizer.data').read_bytes()).decode('ascii'))
(out/'visualizer-file.js').write_text((out/'visualizer.js').read_text()+'\n'+wrapper)
print('Bundled identical WASM/data for file://:',(out/'visualizer-file.js').stat().st_size,'bytes')
