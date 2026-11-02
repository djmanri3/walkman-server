from pathlib import Path
import os
p=Path(os.environ.get('SONY_VISUALIZER_ROOT',Path(__file__).resolve().parents[1]))/'tools/emsdk/upstream/emscripten/src/lib/libglemu.js'
s=p.read_text()
if 'sonyPointAttenuation' not in s:
 s=s.replace('pointSize: 1.0,','pointSize: 1.0,\n    sonyPointAttenuation: [1, 0, 0],')
 s=s.replace("vsPointSizeDefs = 'uniform float u_pointSize;\\n';", "vsPointSizeDefs = 'uniform float u_pointSize; uniform vec3 u_pointAttenuation;\\n';")
 s=s.replace("vsPointSizeInit = '  gl_PointSize = u_pointSize;\\n';", "vsPointSizeInit = '  float d = length(ecPosition.xyz); gl_PointSize = u_pointSize * inversesqrt(max(dot(u_pointAttenuation, vec3(1.0,d,d*d)), 0.000001));\\n';")
 s=s.replace("this.pointSizeLocation = GLctx.getUniformLocation(this.program, 'u_pointSize');", "this.pointSizeLocation = GLctx.getUniformLocation(this.program, 'u_pointSize');\n          this.pointAttenuationLocation = GLctx.getUniformLocation(this.program, 'u_pointAttenuation');")
 s=s.replace('GLctx.uniform1f(this.pointSizeLocation, GLEmulation.pointSize);', 'GLctx.uniform1f(this.pointSizeLocation, GLEmulation.pointSize);\n              GLctx.uniform3fv(this.pointAttenuationLocation, GLEmulation.sonyPointAttenuation);')
 s=s.replace('var texCoordExpr = TEX_COORD_VARYING_PREFIX + texUnitID;', "var texCoordExpr = GLImmediate.mode == GLctx.POINTS ? 'vec4(gl_PointCoord,0.0,1.0)' : TEX_COORD_VARYING_PREFIX + texUnitID;")
 p.write_text(s)

s=p.read_text()
if "Re-evaluate point vs triangle" not in s:
 p.write_text(s.replace("    GLImmediate.mode = mode;", "    GLImmediate.currentRenderer = null; // Re-evaluate point vs triangle shaders.\n    GLImmediate.mode = mode;"))

s=p.read_text()
if 'sonyClientArrays' not in s:
 s=s.replace('      if (!GLImmediate.modifiedClientAttributes) {', '''      // CPU arrays can be planar even when their strides match. Also refresh
      // mutable CPU data each draw without changing the caller's pointers.
      const sonyClientArrays = !GLctx.currentArrayBufferBinding && !beginEnd;
      if (!GLImmediate.modifiedClientAttributes && !sonyClientArrays) {''')
 s=s.replace('      if ((minStride != maxStride || maxStride < bytes) && !beginEnd) {', '      if ((sonyClientArrays || minStride != maxStride || maxStride < bytes) && !beginEnd) {')
 s=s.replace('          attr.pointer = start + attr.offset;', '          // Keep attr.pointer as the original client address for the next draw.')
 p.write_text(s)

# ES1 records the ARRAY_BUFFER at each pointer call, not at draw time.
# The original engine uses one VBO for position/color and another for UVs.
# Upstream legacy emulation assumes a single VBO and restrides their offsets
# as though they were CPU pointers, producing the visible diagonal meshes.
s=p.read_text()
if 'sonyVertexAttribPointer' not in s:
 import re
 s=s.replace('      GLImmediate.modifiedClientAttributes = true;\n    },\n\n    // Renderers', '''      GLImmediate.clientAttributes[name].sonyBuffer = GLctx.currentArrayBufferBinding || 0;
      GLImmediate.modifiedClientAttributes = true;
    },

    sonyVertexAttribPointer(index, attr, normalized) {
      if (GLImmediate.sonyVboArrays) GLctx.bindBuffer(GLctx.ARRAY_BUFFER, GL.buffers[attr.sonyBuffer]);
      GLctx.vertexAttribPointer(index, attr.size, attr.type, normalized,
        GLImmediate.sonyVboArrays ? attr.stride : GLImmediate.stride, attr.offset);
    },

    // Renderers''')
 s=s.replace('      if (!GLImmediate.modifiedClientAttributes && !sonyClientArrays) {', '      if (false && !GLImmediate.modifiedClientAttributes && !sonyClientArrays) {')
 needle='      if ((sonyClientArrays || minStride != maxStride || maxStride < bytes) && !beginEnd) {'
 assert needle in s
 s=s.replace(needle, '''      GLImmediate.sonyVboArrays = !beginEnd && attributes.length > 0 && attributes.every(attr => attr.sonyBuffer);
      if (GLImmediate.sonyVboArrays) {
        const position = GLImmediate.clientAttributes[GLImmediate.VERTEX];
        GLImmediate.stride = position.stride || position.sizeBytes;
        GLImmediate.vertexPointer = 0;
        for (const attr of attributes) attr.offset = attr.pointer;
        GLImmediate.vertexCounter = GLImmediate.stride * count / 4;
        return;
      }
''' +needle)
 s=re.sub(r'GLctx.vertexAttribPointer\(([^,]+), (\w+)\.size, \2\.type, (true|false), GLImmediate.stride, \2\.offset\);',r'GLImmediate.sonyVertexAttribPointer(\1, \2, \3);',s)
 s=s.replace('          if (this.hasFog) {', '''          if (GLImmediate.sonyVboArrays) GLctx.bindBuffer(GLctx.ARRAY_BUFFER, GL.buffers[GLctx.currentArrayBufferBinding] || null);
          if (this.hasFog) {''')
 # Preserve pointer-owned VBOs even after an application unbinds ARRAY_BUFFER.
 s=s.replace('if (!GLctx.currentArrayBufferBinding) {', 'if (!GLctx.currentArrayBufferBinding && !GLImmediate.sonyVboArrays) {')
 p.write_text(s)
