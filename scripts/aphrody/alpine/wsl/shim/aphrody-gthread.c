// glibc symbols that WSL's GPU user-mode drivers probe and that neither musl nor gcompat export.
//
// libnvidia-gpucomp.so links libstdc++ statically; its __gthread_active_p() tests the weak
// reference __pthread_key_create@GLIBC_2.2.5 to decide whether the process is multithreaded.
// Under musl that reference is null, so std::thread/std::call_once throw std::system_error
// and the first D3D12 device aborts (Mesa d3d12 Gallium, dozen). Exporting the symbol makes
// the probe true; it forwards to musl's pthread_key_create.
//
//   LD_PRELOAD=/usr/lib/libaphrody-gthread.so (set by /etc/profile.d/aphrody-wslg.sh)
#include <pthread.h>

int __pthread_key_create(pthread_key_t *key, void (*destructor)(void *)) {
  return pthread_key_create(key, destructor);
}
