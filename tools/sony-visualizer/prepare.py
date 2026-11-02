from pathlib import Path
import re,json,shutil,os
web=Path(__file__).resolve().parent
root=Path(os.environ.get('SONY_VISUALIZER_ROOT',web.parent)).resolve();out=root/'build/web';out.mkdir(parents=True,exist_ok=True)
skia=root/'tools/skia-src/android-5.0.2_r1'
s=(root/'build/skia64/CMakeLists.txt').read_text().split('add_library(UXGraphicsCore')[0]
s=s.replace('project(UXSkia LANGUAGES C CXX)','project(UXWeb LANGUAGES C CXX ASM)')
s=s.replace('add_library(UXSkia SHARED','add_library(UXSkia STATIC')
s=re.sub(r'^"[^"\n]*/src/opts/[^"\n]+"\n','',s,flags=re.M)
opts='\n'.join('"'+str(p)+'"' for p in (skia/'src/opts').glob('*_none.cpp'))
s=s.replace('add_library(UXSkia STATIC\n','add_library(UXSkia STATIC\n'+opts+'\n')
s=s.replace(str(root/'build/skia64/compat/jmem-private.c'),str(root/'tools/skia-src/jpeg/jmemnobs.c'))
s=s.replace('AVOID_TABLES ANDROID_TILE_BASED_DECODE USE_ANDROID_ASHMEM','AVOID_TABLES ANDROID_TILE_BASED_DECODE')
s=s.replace(' z log)', ' z)')
s=re.sub(r'target_link_options\(UXSkia[^\n]*\n','',s)
# Preserve Android pixel/font configuration, but route logging to stderr.
compat=out/'compat';(compat/'android').mkdir(parents=True,exist_ok=True)
(compat/'sys').mkdir(exist_ok=True)
(compat/'sys/system_properties.h').write_text('#pragma once\n#define PROP_VALUE_MAX 92\nstatic inline int __system_property_get(const char*,char* out){out[0]=0;return 0;}\n')
(compat/'SkUserConfig.h').write_text((root/'build/skia64/compat/SkUserConfig.h').read_text().replace('__BYTE_ORDER == __BIG_ENDIAN','__BYTE_ORDER__ == __ORDER_BIG_ENDIAN__'))
shutil.copy2(root/'build/skia64/compat/SkForceLinking.cpp',compat/'SkForceLinking.cpp')
s=s.replace(str(root/'build/skia64/compat'),str(compat))
(compat/'android/log.h').write_text('''#pragma once
#include <stdio.h>
#include <stdarg.h>
#define ANDROID_LOG_DEBUG 3
#define ANDROID_LOG_INFO 4
#define ANDROID_LOG_WARN 5
#define ANDROID_LOG_ERROR 6
#define ANDROID_LOG_FATAL 7
static inline int __android_log_vprint(int,const char* tag,const char* fmt,va_list ap){fprintf(stderr,"%s: ",tag);return vfprintf(stderr,fmt,ap);}
static inline int __android_log_print(int,const char* tag,const char* fmt,...){va_list ap;va_start(ap,fmt);fprintf(stderr,"%s: ",tag);int n=vfprintf(stderr,fmt,ap);va_end(ap);return n;}
''')
s=s.replace('add_compile_options(-O2','include_directories("'+str(compat)+'")\nadd_compile_options(-fexceptions -sUSE_ZLIB=1 -O2')
# Native engine translation and data image; no Android JNI in the browser.
native=root/'arm64/recompiler';generated=root/'build/recompiled'
files=[generated/p for p in json.loads((generated/'sources.json').read_text())]
files += [native/'program.cpp',web/'platform.cpp',native/'host_bridge.cpp',native/'graphics_bridge.cpp',out/'image.S',web/'entry.cpp']
# wasm assembly has no ELF section flags or @progbits syntax.
(out/'image.S').write_text('.section .rodata.uxdata,"",@\n.p2align 4\n.globl ux_original_data_start\nux_original_data_start:\n.incbin "'+str(generated/'image.bin')+'"\n.globl ux_original_data_end\nux_original_data_end:\n.size ux_original_data_start, ux_original_data_end-ux_original_data_start\n.size ux_original_data_end, 0\n')
s+='\nset(CMAKE_CXX_STANDARD 17)\nadd_executable(visualizer\n'+'\n'.join('"'+str(p)+'"' for p in files)+'\n)\n'
s+='target_include_directories(visualizer PRIVATE "'+str(native)+'" "'+str(generated)+'")\n'
s+='target_link_libraries(visualizer PRIVATE UXSkia)\n'
s+='target_link_options(visualizer PRIVATE -fexceptions -sUSE_ZLIB=1 -sLEGACY_GL_EMULATION=1 -sGL_UNSAFE_OPTS=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=402653184 -sSTACK_SIZE=8388608 -sMODULARIZE=1 -sEXPORT_NAME=createSonyVisualizer -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,FS,HEAPU8 -sEXPORTED_FUNCTIONS=_ux_init,_ux_theme,_ux_frame,_ux_music,_ux_cover,_ux_play,_ux_resize,_ux_touch,_malloc,_free -sENVIRONMENT=web "--preload-file" "'+str(root/'build/web/data')+'@/data")\n'
(out/'CMakeLists.txt').write_text(s)
print(out)
