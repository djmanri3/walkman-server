#include "program.h"
#include "host_bridge.h"
#include <emscripten.h>
#include <emscripten/html5.h>
#include <GLES2/gl2.h>
#include <memory>
#include <cstdio>
#include <vector>
#include <codecvt>
#include <locale>
using namespace ux_recompiled;
static std::unique_ptr<Program> engine;
static std::unique_ptr<HostBridge> bridge;
static uint32_t core;
static int width,height;
static void rectangularGates(Program& p){
 // RGGlowBeatGate randomly selects Box/Circle from two original UXFileData
 // tables. Gate in the web menu always selects the original rectangular
 // Regular/Bar pair; the image pixels and animation routines stay original.
 const uint32_t tables[]={0x0a0d60,0x0a0d80};
 const char* expected[]={"Box_Regular_01.png","Box_Bar_01.png"};
 auto s=p.state();
 for(unsigned i=0;i<2;i++){
  uint32_t name=s.load<uint32_t>(tables[i]+4,0);
  if(name>=p.memorySize||strcmp((char*)p.memory+name,expected[i]))throw std::runtime_error("Gate image table does not match the recovered engine");
  memcpy(p.memory+tables[i]+16,p.memory+tables[i],16);
 }
}

static std::vector<std::vector<unsigned char>> covers;
static State state;
static void call(uint32_t pc,std::initializer_list<uint32_t> args) {
 unsigned i=0;for(auto w:args){if(i<4)state.arg(i,w);else state.store<uint32_t>(state.arg(13)+4*(i-4),w,0);i++;}
 engine->call(state,pc);
 if(state.arg(0))throw std::runtime_error("Core status "+std::to_string(state.arg(0))+" at "+std::to_string(pc));
}
template<class F>static int guard(F f){try{f();return 0;}catch(const std::exception&e){fprintf(stderr,"Sony Visualizer: %s\n",e.what());return -1;}}
extern "C" {
int ux_init(int w,int h,int theme){return guard([&]{
 width=w;height=h;
 EM_ASM({ Module["sonyGraphicsRevision"]="gate-rectangles-3"; });
 EmscriptenWebGLContextAttributes attributes;emscripten_webgl_init_context_attributes(&attributes);attributes.majorVersion=1;attributes.alpha=false;attributes.depth=true;attributes.antialias=false;attributes.preserveDrawingBuffer=true;
 auto context=emscripten_webgl_create_context("#sony-visualizer-canvas",&attributes);if(context<=0)throw std::runtime_error("WebGL unavailable");emscripten_webgl_make_context_current(context);
 EM_ASM({ Browser.useWebGL=true; Module.ctx=GLctx; Browser.moduleContextCreatedCallbacks.forEach(function(f){f();}); });
 engine.reset(new Program);rectangularGates(*engine);bridge.reset(new HostBridge(*engine,true));engine->user=bridge.get();engine->hook=[](State&s,const char*n,void*v){if(!((HostBridge*)v)->invoke(s,n))throw std::runtime_error(std::string("Missing web import ")+n);};bridge->configure("/data");state=engine->state();engine->initialize(state);
 call(0x48484,{0,0});for(auto block:engine->allocations)if(state.load<uint32_t>(block.first,0)==engine->symbol("_ZTV16UXVisualizerCore")+8)core=block.first;
 if(!core)throw std::runtime_error("Core singleton missing");call(0x48348,{0,0,(uint32_t)theme});call(0x483dc,{0,0,(uint32_t)w,(uint32_t)h});
 });}
int ux_theme(int theme){return guard([&]{call(0x48348,{0,0,(uint32_t)theme});call(0x483dc,{0,0,(uint32_t)width,(uint32_t)height});});}
int ux_resize(int w,int h){return guard([&]{width=w;height=h;call(0x483dc,{0,0,(uint32_t)w,(uint32_t)h});});}
int ux_play(int playing){return guard([&]{call(0x4825c,{0,0,playing?0u:1u});});}
int ux_touch(int x,int y){return guard([&]{call(0x482f8,{0,0,(uint32_t)x,(uint32_t)y});});}
int ux_frame(int ms){return guard([&]{
 state.arg(0,core);engine->call(state,engine->symbol("_ZN16UXVisualizerCore20checkCoverArtRequestEv"));
 if(state.arg(0)){
 unsigned count=std::max(size_t(1),covers.size());uint32_t array=engine->allocate(count*4);
 for(unsigned j=0;j<count;j++){
 uint32_t item=engine->allocate(24);state.arg(0,item);engine->call(state,engine->symbol("_ZN14UXCoverArtDataC1Ev"));
 if(!covers.empty()){uint32_t pixels=engine->allocate(128*128*4);memcpy(engine->memory+pixels,covers[j].data(),128*128*4);state.store<uint32_t>(item+12,pixels,0);state.store<uint32_t>(item+16,128*128*4,0);state.store<uint32_t>(item+20,128*128*4,0);}
 state.store<uint32_t>(array+j*4,item,0);
 }
 call(engine->symbol("_ZN16UXVisualizerCore17onCoverArtFetchedEjPP14UXCoverArtDataj"),{core,count,array,count*4});
 }
 call(0x48398,{0,0,(uint32_t)ms,0,0});});}
int ux_music(const char* title,const char* artist,const char* album,int duration){return guard([&]{
 covers.clear();
 uint32_t chars[3];const char* texts[]={title,artist,album};
 for(unsigned j=0;j<3;j++){chars[j]=engine->allocate(8);state.arg(0,chars[j]);engine->call(state,engine->symbol("_ZN15UXCharCodeArrayC1Ev"));std::wstring_convert<std::codecvt_utf8_utf16<char16_t>,char16_t> convert;auto units=convert.from_bytes(texts[j]);if(units.empty())units=u" ";unsigned n=units.size();uint32_t data=engine->allocate(n*4);for(unsigned i=0;i<n;i++)state.store<uint32_t>(data+i*4,units[i],0);call(engine->symbol("_ZN15UXCharCodeArray26initializeFromIntegerArrayEPij"),{chars[j],data,n});engine->release(data);}
 call(0x47784,{core,toBits<uint32_t>(30.f),(uint32_t)duration,0,chars[0],chars[1],chars[2],0,0,0,0,0,0,0,0,0,1,0,1});
 for(auto c:chars){state.arg(0,c);engine->call(state,engine->symbol("_ZN15UXCharCodeArrayD1Ev"));engine->release(c);}
 });}
int ux_cover(const unsigned char* rgba,int index,int total){return guard([&]{
 if(total<1||total>12||index<0||index>=total)throw std::runtime_error("Invalid cover slot");
 covers.resize(total);covers[index].assign(rgba,rgba+128*128*4);
 for(auto& cover:covers)if(cover.empty())cover=covers[index];
 if(index==0){uint32_t pixels=engine->allocate(128*128*4);memcpy(engine->memory+pixels,rgba,128*128*4);uint32_t manager=state.load<uint32_t>(core+0x3c,0);state.arg(0,manager);state.arg(1,0);state.arg(2,pixels);engine->call(state,engine->symbol("_ZN17UXCoverArtManager18setCurrentCoverArtEPcPv"));engine->release(pixels);}
 });}
}
// Linked for the engine's ES1 fallback; shader paths implement attenuation themselves.
extern "C" void glPointParameterfv(GLenum, const GLfloat* values){
 EM_ASM({ if(GLImmediate.lastRenderer) GLImmediate.lastRenderer.cleanup(); GLEmulation.sonyPointAttenuation=Array.from(HEAPF32.subarray($0>>2,($0>>2)+3)); },values);
}
