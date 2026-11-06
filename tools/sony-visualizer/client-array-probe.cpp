#include <emscripten.h>
#include <emscripten/html5.h>
#include <GLES/gl.h>
#include <cstdio>
#include <cstring>
#include <cstdlib>
static void begin(){
 glClearColor(0,0,0,1);glClear(GL_COLOR_BUFFER_BIT);glViewport(0,0,64,64);
 glDisable(GL_DEPTH_TEST);glDisable(GL_CULL_FACE);glDisable(GL_TEXTURE_2D);
 glMatrixMode(GL_PROJECTION);glLoadIdentity();glMatrixMode(GL_MODELVIEW);glLoadIdentity();
 glEnableClientState(GL_VERTEX_ARRAY);glEnableClientState(GL_COLOR_ARRAY);glDisableClientState(GL_TEXTURE_COORD_ARRAY);
}
static unsigned sample(int x=32,int y=32){unsigned char pixel[4];glReadPixels(x,y,1,1,GL_RGBA,GL_UNSIGNED_BYTE,pixel);return (unsigned(pixel[0])<<16)|(unsigned(pixel[1])<<8)|pixel[2];}
static void report(const char* name,unsigned actual,unsigned expected){printf("%s pixel=%06x expected=%06x %s\n",name,actual,expected,actual==expected?"PASS":"FAIL");}
extern "C" int ux_probe(){
 EmscriptenWebGLContextAttributes a;emscripten_webgl_init_context_attributes(&a);a.majorVersion=1;a.alpha=false;a.antialias=false;a.preserveDrawingBuffer=true;
 auto context=emscripten_webgl_create_context("#sony-visualizer-canvas",&a);emscripten_webgl_make_context_current(context);
 EM_ASM({ Browser.useWebGL=true; Module.ctx=GLctx; Browser.moduleContextCreatedCallbacks.forEach(function(f){f();}); });
 unsigned success=0;
 // Equal strides do not imply interleaving: these arrays are 1024 bytes apart.
 auto memory=(unsigned char*)malloc(2048);memset(memory,0,2048);
 float xy[6]={-.8f,-.8f,.8f,-.8f,0,.8f};
 for(int i=0;i<3;i++){memcpy(memory+12*i,xy+2*i,8);unsigned char rgba[4]={255,0,255,255};memcpy(memory+1024+12*i,rgba,4);}
 begin();glVertexPointer(2,GL_FLOAT,12,memory);glColorPointer(4,GL_UNSIGNED_BYTE,12,memory+1024);glDrawArrays(GL_TRIANGLES,0,3);
 auto result=sample();report("equal-stride separate arrays",result,0xff00ff);if(result==0xff00ff)success|=1;
 // Reusing pointers is legal; the application can mutate their data each draw.
 float positions[6];memcpy(positions,xy,sizeof(xy));unsigned char colors[12];for(int i=0;i<3;i++){colors[i*4]=0;colors[i*4+1]=255;colors[i*4+2]=0;colors[i*4+3]=255;}
 begin();glVertexPointer(2,GL_FLOAT,0,positions);glColorPointer(4,GL_UNSIGNED_BYTE,0,colors);glDrawArrays(GL_TRIANGLES,0,3);
 for(int i=0;i<3;i++){colors[i*4]=255;colors[i*4+1]=0;}
 glClear(GL_COLOR_BUFFER_BIT);glDrawArrays(GL_TRIANGLES,0,3);
 result=sample();report("mutable arrays without rebinding",result,0xff0000);if(result==0xff0000)success|=2;
 // Interleaved input must continue to work.
 for(int i=0;i<3;i++){memcpy(memory+12*i,xy+2*i,8);unsigned char rgba[4]={0,0,255,255};memcpy(memory+12*i+8,rgba,4);}
 begin();glVertexPointer(2,GL_FLOAT,12,memory);glColorPointer(4,GL_UNSIGNED_BYTE,12,memory+8);glDrawArrays(GL_TRIANGLES,0,3);
 result=sample();report("interleaved arrays",result,0x0000ff);if(result==0x0000ff)success|=4;
 // Texture coordinates also remain client-owned and mutable.
 float quad[8]={-1,-1,1,-1,1,1,-1,1},uv[8]={0,0,1,0,1,1,0,1};unsigned char white[16];memset(white,255,sizeof(white));
 unsigned char image[8]={255,0,0,255,0,0,255,255};GLuint texture;
 begin();glEnable(GL_TEXTURE_2D);glGenTextures(1,&texture);glBindTexture(GL_TEXTURE_2D,texture);
 glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
 glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA,2,1,0,GL_RGBA,GL_UNSIGNED_BYTE,image);
 glVertexPointer(2,GL_FLOAT,0,quad);glColorPointer(4,GL_UNSIGNED_BYTE,0,white);glEnableClientState(GL_TEXTURE_COORD_ARRAY);glTexCoordPointer(2,GL_FLOAT,0,uv);glDrawArrays(GL_TRIANGLE_FAN,0,4);
 for(int i=0;i<4;i++)uv[i*2]=1-uv[i*2];
 glClear(GL_COLOR_BUFFER_BIT);glDrawArrays(GL_TRIANGLE_FAN,0,4);result=sample(8,32);report("mutable texture coordinates",result,0x0000ff);if(result==0x0000ff)success|=8;
 // Same layout as Sony: position/color in one VBO, UVs in another.
 struct Vertex {float x,y;unsigned char color[4];};
 Vertex vertices[4]={};for(int i=0;i<4;i++){vertices[i].x=quad[i*2];vertices[i].y=quad[i*2+1];memset(vertices[i].color,255,4);}
 GLuint buffers[2];glGenBuffers(2,buffers);
 glBindBuffer(GL_ARRAY_BUFFER,buffers[1]);glBufferData(GL_ARRAY_BUFFER,sizeof(uv),uv,GL_STATIC_DRAW);glTexCoordPointer(2,GL_FLOAT,8,(void*)0);
 glBindBuffer(GL_ARRAY_BUFFER,buffers[0]);glBufferData(GL_ARRAY_BUFFER,sizeof(vertices),vertices,GL_STATIC_DRAW);glVertexPointer(2,GL_FLOAT,sizeof(Vertex),(void*)0);glColorPointer(4,GL_UNSIGNED_BYTE,sizeof(Vertex),(void*)8);
 glClear(GL_COLOR_BUFFER_BIT);glDrawArrays(GL_TRIANGLE_FAN,0,4);result=sample(8,32);report("separate position/color and UV VBOs",result,0x0000ff);if(result==0x0000ff)success|=16;
 // Unbinding ARRAY_BUFFER does not change recorded attribute buffer bindings.
 glBindBuffer(GL_ARRAY_BUFFER,0);glClear(GL_COLOR_BUFFER_BIT);glDrawArrays(GL_TRIANGLE_FAN,0,4);result=sample(8,32);report("VBO pointers survive unbinding",result,0x0000ff);if(result==0x0000ff)success|=32;
 glDeleteBuffers(2,buffers);glDeleteTextures(1,&texture);free(memory);return success;
}
