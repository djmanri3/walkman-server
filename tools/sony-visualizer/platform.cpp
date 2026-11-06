#include "program.h"
#include <pthread.h>
#include <errno.h>
#include <sys/time.h>
#include <unistd.h>
#include <ctime>
#include <dlfcn.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <unordered_map>
#include <vector>
#include <atomic>
#include <algorithm>
namespace ux_recompiled {
struct Mutex {pthread_mutex_t value;};
struct Thread {pthread_t value{};};
struct Guard {std::mutex mutex;};
struct Finalizer {uint32_t function,argument,handle;};
struct Platform {
 std::mutex registry;
 std::atomic<uint32_t> nextThread{1};uint32_t nextFile=0xe4000000u;
 std::unordered_map<uint32_t,std::shared_ptr<Mutex>> mutexes;
 std::unordered_map<uint32_t,std::shared_ptr<Guard>> guards;
 std::unordered_map<uint32_t,std::shared_ptr<Thread>> threads;
 std::unordered_map<uint32_t,FILE*> files;
 std::unordered_map<uint32_t,unsigned> stackSlots;
 std::vector<Finalizer> finalizers;
};
static thread_local std::unordered_map<Program*,uint32_t> selfKeys;
void* createPlatform(){return new Platform;}
void destroyPlatform(void* p){auto* platform=(Platform*)p;for(auto& f:platform->files)fclose(f.second);delete platform;}
static uint32_t threadId(Program& program){auto it=selfKeys.find(&program);if(it!=selfKeys.end())return it->second;auto& p=*(Platform*)program.platform;uint32_t key=p.nextThread.fetch_add(1);selfKeys[&program]=key;return key;}
uint32_t platformStack(Program& program){auto key=threadId(program);auto& p=*(Platform*)program.platform;std::lock_guard<std::mutex> lock(p.registry);auto it=p.stackSlots.find(key);if(it!=p.stackSlots.end())return 0x0f000000u-it->second*0x200000u;for(unsigned slot=1;slot<64;slot++){bool used=false;for(auto entry:p.stackSlots)if(entry.second==slot){used=true;break;}if(!used){p.stackSlots[key]=slot;return 0x0f000000u-slot*0x200000u;}}throw std::runtime_error("Too many concurrent engine stacks");}
void platformReleaseStack(Program& program){auto key=threadId(program);auto& p=*(Platform*)program.platform;std::lock_guard<std::mutex> lock(p.registry);p.stackSlots.erase(key);}
static const char* string(Program& p,uint32_t address){if(address<imageBase||address>=p.memorySize)throw std::runtime_error("Native string offset invalid");auto* text=(char*)p.memory+address;if(!memchr(text,0,p.memorySize-address))throw std::runtime_error("Native string has no terminator");return text;}
static void* pointer(Program& p,uint32_t address,size_t size=1){if(!address)return nullptr;if(address<imageBase||uint64_t(address)+size>p.memorySize)throw std::runtime_error("Native pointer offset invalid");return p.memory+address;}
struct Arguments {State& s;unsigned index;uint32_t word(){unsigned i=index++;return i<4?s.arg(i):s.load<uint32_t>(s.arg(13)+(i-4)*4,s.pc);}uint64_t wide(){index=(index+1)&~1u;uint64_t a=word();return a|(uint64_t(word())<<32);}};
static std::string redirected(Program& p,const char* path){if(p.resourceRoot.empty())return path;if(!strncmp(path,"/system/fonts/",14))return p.resourceRoot+"/fonts/"+(path+14);if(!strcmp(path,"/system/etc/system_fonts.xml"))return p.resourceRoot+"/etc/system_fonts.xml";if(!strcmp(path,"/system/etc/fallback_fonts.xml"))return p.resourceRoot+"/etc/fallback_fonts.xml";if(!strcmp(path,"/vendor/etc/fallback_fonts.xml"))return p.resourceRoot+"/etc/vendor_fallback_fonts.xml";return path;}
struct Start {Program* program;uint32_t key,function,argument;};
static void* threadStart(void* data){std::unique_ptr<Start> start((Start*)data);selfKeys[start->program]=start->key;struct Release {Program* p;~Release(){platformReleaseStack(*p);}} release{start->program};auto state=start->program->state();state.arg(0,start->argument);try{start->program->call(state,start->function);return (void*)(uintptr_t)state.arg(0);}catch(const std::exception& error){fprintf(stderr,"Recompiled worker failure: %s\n",error.what());return (void*)uintptr_t(0x80000003u);}}
static thread_local State* sorting=nullptr;static thread_local uint32_t comparator=0;
static int compare(const void* a,const void* b){auto& parent=*sorting;auto& program=*(Program*)parent.user;State child=parent;child.arg(13,parent.arg(13)-4096);child.arg(0,uint32_t((const unsigned char*)a-program.memory));child.arg(1,uint32_t((const unsigned char*)b-program.memory));program.call(child,comparator);return int32_t(child.arg(0));}
static std::string formatted(Program& program,State& s){
 const char* format=string(program,s.arg(2));Arguments arguments{s,3};std::string result;
 for(size_t i=0;format[i];){if(format[i]!='%'){result+=format[i++];continue;}size_t first=i++;if(format[i]=='%'){result+='%';i++;continue;}std::string spec="%";while(format[i]&&strchr("-+ #0",format[i]))spec+=format[i++];
  if(format[i]=='*'){spec+=std::to_string(int32_t(arguments.word()));i++;}else while(format[i]>='0'&&format[i]<='9')spec+=format[i++];
  if(format[i]=='.'){i++;if(format[i]=='*'){int n=int32_t(arguments.word());if(n>=0)spec+='.'+std::to_string(n);i++;}else{spec+='.';while(format[i]>='0'&&format[i]<='9')spec+=format[i++];}}
  std::string length;while(format[i]&&strchr("hljztL",format[i]))length+=format[i++];char conversion=format[i++];
  auto append=[&](auto value,const std::string& f){int n=snprintf(nullptr,0,f.c_str(),value);if(n<0)throw std::runtime_error("Native formatting failed");std::vector<char> text(size_t(n)+1);snprintf(text.data(),text.size(),f.c_str(),value);result.append(text.data(),size_t(n));};
  if(conversion=='s'){if(!length.empty())throw std::runtime_error("Wide native format unsupported");uint32_t ptr=arguments.word();append(ptr?string(program,ptr):"(null)",spec+conversion);}
  else if(conversion=='d'||conversion=='i'){int64_t value=length=="ll"||length=="j"?int64_t(arguments.wide()):int32_t(arguments.word());append((long long)value,spec+"ll"+conversion);}
  else if(strchr("uoxX",conversion)){uint64_t value=length=="ll"||length=="j"?arguments.wide():arguments.word();append((unsigned long long)value,spec+"ll"+conversion);}
  else if(strchr("fFeEgGaA",conversion)){uint64_t bits=arguments.wide();append(fromBits<double>(bits),spec+conversion);}
  else if(conversion=='c')append(int(arguments.word()),spec+conversion);
  else if(conversion=='p')append((void*)(uintptr_t)arguments.word(),spec+conversion);
  else if(conversion=='n'){uint32_t ptr=arguments.word();if(length=="ll")s.store<uint64_t>(ptr,result.size(),s.pc);else if(length=="h")s.store<uint16_t>(ptr,result.size(),s.pc);else if(length=="hh")s.store<uint8_t>(ptr,result.size(),s.pc);else s.store<uint32_t>(ptr,result.size(),s.pc);}
  else throw std::runtime_error("Unsupported native formatting at "+std::to_string(first));
 }
 return result;
}
bool platformStandard(Program& program,State& s,const char* name){auto& p=*(Platform*)program.platform;uint32_t a=s.arg(0),b=s.arg(1),c=s.arg(2),d=s.arg(3);
#define NAME(x) !strcmp(name,x)
 if(NAME("strlen")){s.arg(0,strlen(string(program,a)));return true;}if(NAME("strnlen")){s.arg(0,strnlen((const char*)pointer(program,a,b),b));return true;}if(NAME("strncmp")){s.arg(0,strncmp((const char*)pointer(program,a,c),(const char*)pointer(program,b,c),c));return true;}if(NAME("memcmp")){s.arg(0,memcmp(pointer(program,a,c),pointer(program,b,c),c));return true;}if(NAME("strchr")){auto* start=string(program,a);auto* found=strchr(start,int(b));s.arg(0,found?a+uint32_t(found-start):0);return true;}
 if(NAME("atof")){uint64_t value=toBits<uint64_t>(atof(string(program,a)));s.arg(0,uint32_t(value));s.arg(1,uint32_t(value>>32));return true;}
 if(NAME("srand")){srand(a);return true;}if(NAME("rand")){s.arg(0,rand());return true;}
 if(NAME("gettimeofday")){timeval time{};int code=gettimeofday(&time,nullptr);if(a){s.store<uint32_t>(a,uint32_t(time.tv_sec),s.pc);s.store<uint32_t>(a+4,uint32_t(time.tv_usec),s.pc);}if(b){s.store<uint32_t>(b,0,s.pc);s.store<uint32_t>(b+4,0,s.pc);}s.arg(0,code);return true;}
 if(NAME("time")){uint32_t now=uint32_t(::time(nullptr));if(a)s.store<uint32_t>(a,now,s.pc);s.arg(0,now);return true;}if(NAME("usleep")){s.arg(0,::usleep(a));return true;}
 if(NAME("snprintf")){std::string output=formatted(program,s);if(b){size_t n=std::min(size_t(b-1),output.size());memcpy(pointer(program,a,n+1),output.data(),n);program.memory[a+n]=0;}s.arg(0,uint32_t(output.size()));return true;}
 if(NAME("__aeabi_ul2d")||NAME("__aeabi_ul2f")){uint64_t input=(uint64_t(b)<<32)|a;if(NAME("__aeabi_ul2d")){uint64_t value=toBits<uint64_t>(double(input));s.arg(0,uint32_t(value));s.arg(1,uint32_t(value>>32));}else s.arg(0,toBits<uint32_t>(float(input)));return true;}
 if(NAME("__aeabi_f2ulz")){float f=fromBits<float>(a);uint64_t value=std::isnan(f)||f<=0?0:f>=18446744073709551616.0f?UINT64_MAX:uint64_t(f);s.arg(0,uint32_t(value));s.arg(1,uint32_t(value>>32));return true;}
 if(NAME("__aeabi_atexit")||NAME("__cxa_atexit")){std::lock_guard<std::mutex> lock(p.registry);p.finalizers.push_back({NAME("__aeabi_atexit")?b:a,NAME("__aeabi_atexit")?a:b,c});s.arg(0,0);return true;}
 if(NAME("__cxa_finalize")){std::vector<Finalizer> callbacks;{std::lock_guard<std::mutex> lock(p.registry);for(auto it=p.finalizers.begin();it!=p.finalizers.end();)if(!a||it->handle==a){callbacks.push_back(*it);it=p.finalizers.erase(it);}else ++it;}for(auto it=callbacks.rbegin();it!=callbacks.rend();++it){auto child=s;child.arg(13,s.arg(13)-4096);child.arg(0,it->argument);program.call(child,it->function);}return true;}
 if(NAME("__cxa_guard_acquire")||NAME("__cxa_guard_release")||NAME("__cxa_guard_abort")){std::shared_ptr<Guard> guard;{std::lock_guard<std::mutex> lock(p.registry);auto& slot=p.guards[a];if(!slot)slot=std::make_shared<Guard>();guard=slot;}if(NAME("__cxa_guard_acquire")){guard->mutex.lock();if(s.load<uint8_t>(a,s.pc)){guard->mutex.unlock();s.arg(0,0);}else s.arg(0,1);}else{if(NAME("__cxa_guard_release"))s.store<uint8_t>(a,1,s.pc);guard->mutex.unlock();}return true;}
 if(NAME("pthread_mutexattr_init")){pthread_mutexattr_t native{};int code=pthread_mutexattr_init(&native);if(!code){uint32_t bits=0;memcpy(&bits,&native,std::min(sizeof(native),size_t(4)));s.store<uint32_t>(a,bits,s.pc);}s.arg(0,code);return true;}
 if(NAME("pthread_mutex_init")){auto mutex=std::make_shared<Mutex>();pthread_mutexattr_t native{};if(b){uint32_t bits=s.load<uint32_t>(b,s.pc);memcpy(&native,&bits,std::min(sizeof(native),size_t(4)));}int code=pthread_mutex_init(&mutex->value,b?&native:nullptr);if(!code){std::lock_guard<std::mutex> lock(p.registry);p.mutexes[a]=mutex;s.store<uint32_t>(a,0,s.pc);}s.arg(0,code);return true;}
 if(NAME("pthread_mutex_lock")||NAME("pthread_mutex_unlock")||NAME("pthread_mutex_destroy")){std::shared_ptr<Mutex> mutex;{std::lock_guard<std::mutex> lock(p.registry);auto it=p.mutexes.find(a);if(it==p.mutexes.end())throw std::runtime_error("Native mutex not initialized");mutex=it->second;}int code=NAME("pthread_mutex_lock")?pthread_mutex_lock(&mutex->value):NAME("pthread_mutex_unlock")?pthread_mutex_unlock(&mutex->value):pthread_mutex_destroy(&mutex->value);if(NAME("pthread_mutex_destroy")&&!code){std::lock_guard<std::mutex> lock(p.registry);p.mutexes.erase(a);}s.arg(0,code);return true;}
 if(NAME("pthread_self")){s.arg(0,threadId(program));return true;}
 // The engine workers are finite glyph/body-generation jobs. Run them to
 // completion on a separate engine stack, so ordinary hosting needs no COOP/COEP.
 if(NAME("pthread_create")){
  if(b)throw std::runtime_error("Custom worker attributes unsupported");
  uint32_t key=p.nextThread.fetch_add(1);s.store<uint32_t>(a,key,s.pc);
  auto child=s;child.arg(13,s.arg(13)-0x40000);child.arg(0,d);program.call(child,c);
  s.arg(0,0);return true;
 }
 if(NAME("pthread_join")){if(b)s.store<uint32_t>(b,0,s.pc);s.arg(0,0);return true;}
 if(NAME("fopen")){std::string path=redirected(program,string(program,a));FILE* file=fopen(path.c_str(),string(program,b));if(!file)s.arg(0,0);else{std::lock_guard<std::mutex> lock(p.registry);uint32_t handle=p.nextFile+=4;p.files[handle]=file;s.arg(0,handle);}return true;}
 if(NAME("fclose")||NAME("feof")||NAME("fread")){uint32_t handle=NAME("fread")?d:a;FILE* file;{std::lock_guard<std::mutex> lock(p.registry);auto it=p.files.find(handle);if(it==p.files.end())throw std::runtime_error("Native file handle invalid");file=it->second;if(NAME("fclose"))p.files.erase(it);}if(NAME("fclose"))s.arg(0,fclose(file));else if(NAME("feof"))s.arg(0,feof(file));else{s.arg(0,uint32_t(fread(pointer(program,a,uint64_t(b)*c),b,c,file)));}return true;}
 if(NAME("qsort")){auto* previous=sorting;auto function=comparator;sorting=&s;comparator=d;try{qsort(pointer(program,a,uint64_t(b)*c),b,c,compare);}catch(...){sorting=previous;comparator=function;throw;}sorting=previous;comparator=function;return true;}
#undef NAME
 return false;
}
}
