// SDK links use the same math ABI versions as Bun's missing-symbols owner.
#define _GNU_SOURCE
#define _LARGEFILE64_SOURCE
#include <features.h>
#if defined(__GLIBC__)
#include <fcntl.h>
#include <glob.h>
#include <math.h>
#include <stddef.h>
#include <sys/types.h>

#if defined(__x86_64__)
#define MEDIA_GLIBC_BASE "GLIBC_2.2.5"
#elif defined(__aarch64__)
#define MEDIA_GLIBC_BASE "GLIBC_2.17"
#else
#error Unsupported GNU media SDK architecture
#endif

#define MEDIA_SYMVER(name)                                                     \
  __asm__(".symver " #name "," #name "@" MEDIA_GLIBC_BASE)
MEDIA_SYMVER(exp);
MEDIA_SYMVER(exp2);
MEDIA_SYMVER(expf);
MEDIA_SYMVER(exp2f);
MEDIA_SYMVER(log);
MEDIA_SYMVER(log2);
MEDIA_SYMVER(logf);
MEDIA_SYMVER(log2f);
MEDIA_SYMVER(pow);
MEDIA_SYMVER(powf);

double __wrap_exp(double x) { return exp(x); }
double __wrap_exp2(double x) { return exp2(x); }
float __wrap_expf(float x) { return expf(x); }
float __wrap_exp2f(float x) { return exp2f(x); }
double __wrap_log(double x) { return log(x); }
double __wrap_log2(double x) { return log2(x); }
float __wrap_logf(float x) { return logf(x); }
float __wrap_log2f(float x) { return log2f(x); }
double __wrap_pow(double x, double y) { return pow(x, y); }
float __wrap_powf(float x, float y) { return powf(x, y); }

_Static_assert(sizeof(off_t) == 8,
               "fcntl forwarding requires the native 64-bit ABI");
_Static_assert(sizeof(struct flock) == sizeof(struct flock64),
               "fcntl lock layouts differ");
_Static_assert(offsetof(struct flock, l_start) ==
                   offsetof(struct flock64, l_start),
               "fcntl lock offset differs");
_Static_assert(offsetof(struct flock, l_len) == offsetof(struct flock64, l_len),
               "fcntl lock length differs");
_Static_assert(F_GETLK == F_GETLK64 && F_SETLK == F_SETLK64 &&
                   F_SETLKW == F_SETLKW64,
               "fcntl commands differ");
__asm__(".symver bun_media_fcntl,fcntl@" MEDIA_GLIBC_BASE);
// A tail branch preserves every variadic argument, including commands with
// none.
#if defined(__x86_64__)
__asm__(".pushsection .text\n"
        ".globl __wrap_fcntl64\n"
        ".type __wrap_fcntl64,@function\n"
        "__wrap_fcntl64:\n"
        "jmp bun_media_fcntl@PLT\n"
        ".size __wrap_fcntl64,.-__wrap_fcntl64\n"
        ".popsection\n");
#else
__asm__(".pushsection .text\n"
        ".globl __wrap_fcntl64\n"
        ".type __wrap_fcntl64,%function\n"
        "__wrap_fcntl64:\n"
        "b bun_media_fcntl\n"
        ".size __wrap_fcntl64,.-__wrap_fcntl64\n"
        ".popsection\n");
#endif

extern int bun_media_glob64(const char *, int, int (*)(const char *, int),
                            glob64_t *);
__asm__(".symver bun_media_glob64,glob64@" MEDIA_GLIBC_BASE);
int __wrap_glob64(const char *pattern, int flags,
                  int (*error)(const char *, int), glob64_t *result) {
  return bun_media_glob64(pattern, flags, error, result);
}
#endif
