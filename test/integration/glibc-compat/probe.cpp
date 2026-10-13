// Runs against the real central compatibility owner, including injected syscall
// failures.
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <unistd.h>

extern "C" pid_t __wrap_gettid();
#ifdef __GLIBC__
#include <dirent.h>
#include <dlfcn.h>
#include <glob.h>
extern "C" int __wrap_getentropy(void *, size_t);
extern "C" void __wrap___explicit_bzero_chk(void *, size_t, size_t);
extern "C" int __wrap_glob64(const char *, int, int (*)(const char *, int),
                             glob64_t *);
extern "C" long __real_syscall(long, ...);
static bool force_enosys, deny_open, regular_device, empty_read;
static int interrupt_open, interrupt_read, interrupt_random, opened, closed;
static const char *regular_path;
extern "C" long __wrap_syscall(long number, ...) {
  va_list arguments;
  va_start(arguments, number);
  long result = -1;
  if (number == SYS_gettid) {
    result = __real_syscall(number);
  } else if (number == SYS_getrandom) {
    void *buffer = va_arg(arguments, void *);
    size_t count = va_arg(arguments, size_t);
    unsigned flags = va_arg(arguments, unsigned);
    if (interrupt_random) {
      --interrupt_random;
      errno = EINTR;
    } else if (force_enosys)
      errno = ENOSYS;
    else
      result = __real_syscall(number, buffer, count, flags);
  } else if (number == SYS_openat) {
    int directory = va_arg(arguments, int);
    const char *path = va_arg(arguments, const char *);
    int flags = va_arg(arguments, int);
    int mode = va_arg(arguments, int);
    if (interrupt_open) {
      --interrupt_open;
      errno = EINTR;
    } else if (deny_open)
      errno = EACCES;
    else {
      result = __real_syscall(
          number, directory, regular_device ? regular_path : path, flags, mode);
      if (result >= 0)
        ++opened;
    }
  } else if (number == SYS_read) {
    int fd = va_arg(arguments, int);
    void *buffer = va_arg(arguments, void *);
    size_t count = va_arg(arguments, size_t);
    if (interrupt_read) {
      --interrupt_read;
      errno = EINTR;
    } else if (empty_read)
      result = 0;
    else
      result = __real_syscall(number, fd, buffer, count);
  } else if (number == SYS_ioctl) {
    int fd = va_arg(arguments, int);
    unsigned request = va_arg(arguments, unsigned);
    void *data = va_arg(arguments, void *);
    result = __real_syscall(number, fd, request, data);
  } else if (number == SYS_close) {
    result = __real_syscall(number, va_arg(arguments, int));
    if (result == 0)
      ++closed;
  } else {
    assert(!"Unexpected syscall in the isolated compatibility probe");
  }
  va_end(arguments);
  return result;
}
static void entropy_probe(int mode) {
  unsigned char storage[258];
  memset(storage, 0xa5, sizeof(storage));
  unsigned char *buffer = storage + 1;
  assert(__wrap_getentropy(nullptr, 0) == 0);
  errno = 0;
  assert(__wrap_getentropy(buffer, 257) == -1 && errno == EIO);
  for (unsigned char byte : storage)
    assert(byte == 0xa5);
  assert(__wrap_getentropy(nullptr, 1) == -1 && errno == EFAULT);
  force_enosys = mode >= 2;
  interrupt_random = mode == 1 ? 3 : 0;
  interrupt_open = mode == 2 ? 2 : 0;
  interrupt_read = mode == 2 ? 2 : 0;
  regular_device = mode == 3;
  deny_open = mode == 4;
  empty_read = mode == 5;
  int status = __wrap_getentropy(buffer, 256);
  if (mode >= 3) {
    assert(status == -1 && errno == (mode == 4 ? EACCES : EIO));
    for (unsigned char byte : storage)
      assert(byte == 0xa5);
  } else {
    assert(status == 0);
    assert(storage[0] == 0xa5 && storage[257] == 0xa5);
    unsigned char second[256];
    assert(__wrap_getentropy(second, sizeof(second)) == 0);
    assert(memcmp(buffer, second, sizeof(second)) != 0);
    assert(interrupt_random == 0 && interrupt_open == 0 && interrupt_read == 0);
  }
  assert(opened == closed);
}
static int alternate_position, alternate_stat_count, alternate_lstat_count;
static void *alternate_open(const char *) {
  alternate_position = 0;
  return &alternate_position;
}
static void alternate_close(void *) {}
static struct dirent64 *alternate_read(void *) {
  static struct dirent64 entry;
  if (alternate_position >= 2)
    return nullptr;
  memset(&entry, 0, sizeof(entry));
  entry.d_ino = (1ULL << 48) + alternate_position + 1;
  entry.d_type = DT_UNKNOWN;
  strcpy(entry.d_name, alternate_position++ ? "directory.probe" : "wide.probe");
  return &entry;
}
static int alternate_stat(const char *path, struct stat64 *result) {
  ++alternate_stat_count;
  memset(result, 0, sizeof(*result));
  result->st_ino = (1ULL << 52) + 1;
  result->st_size = 1ULL << 40;
  result->st_mode =
      strstr(path, "directory.probe") ? S_IFDIR | 0700 : S_IFREG | 0600;
  return 0;
}
static int alternate_lstat(const char *path, struct stat64 *result) {
  ++alternate_lstat_count;
  return alternate_stat(path, result);
}
static void glob_probe(const char *directory) {
  char pattern[1024];
  snprintf(pattern, sizeof(pattern), "%s/*.probe", directory);
  glob64_t result{};
  assert(__wrap_glob64(pattern, 0, nullptr, &result) == 0);
  assert(result.gl_pathc == 2 && strstr(result.gl_pathv[0], "a.probe") &&
         strstr(result.gl_pathv[1], "z.probe"));
  globfree64(&result);
  result = {};
  result.gl_opendir = alternate_open;
  result.gl_closedir = alternate_close;
  result.gl_readdir = alternate_read;
  result.gl_stat = alternate_stat;
  result.gl_lstat = alternate_lstat;
  assert(__wrap_glob64("virtual/*.probe", GLOB_ALTDIRFUNC | GLOB_MARK, nullptr,
                       &result) == 0);
  assert(result.gl_pathc == 2 &&
         !strcmp(result.gl_pathv[0], "virtual/directory.probe/") &&
         !strcmp(result.gl_pathv[1], "virtual/wide.probe"));
  assert(alternate_stat_count > 0);
  globfree64(&result);
  result = {};
  result.gl_opendir = alternate_open;
  result.gl_closedir = alternate_close;
  result.gl_readdir = alternate_read;
  result.gl_stat = alternate_stat;
  result.gl_lstat = alternate_lstat;
  using glob_fn =
      int (*)(const char *, int, int (*)(const char *, int), glob64_t *);
  auto native = reinterpret_cast<glob_fn>(dlsym(RTLD_NEXT, "glob64"));
  assert(native);
  int before_stat = alternate_stat_count, before_lstat = alternate_lstat_count;
  assert(native("virtual/wide.probe", GLOB_ALTDIRFUNC | GLOB_MARK, nullptr,
                &result) == 0);
  assert(result.gl_pathc == 1 &&
         !strcmp(result.gl_pathv[0], "virtual/wide.probe"));
  int native_stat = alternate_stat_count - before_stat,
      native_lstat = alternate_lstat_count - before_lstat;
  globfree64(&result);
  result = {};
  result.gl_opendir = alternate_open;
  result.gl_closedir = alternate_close;
  result.gl_readdir = alternate_read;
  result.gl_stat = alternate_stat;
  result.gl_lstat = alternate_lstat;
  before_stat = alternate_stat_count;
  before_lstat = alternate_lstat_count;
  assert(__wrap_glob64("virtual/wide.probe", GLOB_ALTDIRFUNC | GLOB_MARK,
                       nullptr, &result) == 0);
  assert(result.gl_pathc == 1 &&
         !strcmp(result.gl_pathv[0], "virtual/wide.probe"));
  assert(alternate_stat_count - before_stat == native_stat &&
         alternate_lstat_count - before_lstat == native_lstat);
  printf("glob64 native callback parity stat=%d lstat=%d\n", native_stat,
         native_lstat);
  globfree64(&result);
}
#endif
int main() {
  assert(__wrap_gettid() == syscall(SYS_gettid));
#ifdef __GLIBC__
  char directory[] = "/tmp/bun-glibc-compat-XXXXXX";
  assert(mkdtemp(directory));
  char a[1024], z[1024], regular[1024];
  snprintf(a, sizeof(a), "%s/a.probe", directory);
  snprintf(z, sizeof(z), "%s/z.probe", directory);
  snprintf(regular, sizeof(regular), "%s/device", directory);
  const char *paths[] = {a, z, regular};
  for (const char *path : paths) {
    int fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
    assert(fd >= 0);
    close(fd);
  }
  regular_path = regular;
  for (int mode = 0; mode < 6; mode++) {
    pid_t child = fork();
    assert(child >= 0);
    if (!child) {
      entropy_probe(mode);
      _exit(0);
    }
    int status;
    assert(waitpid(child, &status, 0) == child && WIFEXITED(status) &&
           WEXITSTATUS(status) == 0);
  }
  unsigned char bytes[64];
  memset(bytes, 0xa5, sizeof(bytes));
  __wrap___explicit_bzero_chk(bytes, 32, sizeof(bytes));
  for (int i = 0; i < 64; i++)
    assert(bytes[i] == (i < 32 ? 0 : 0xa5));
  __wrap___explicit_bzero_chk(nullptr, 0, 0);
  pid_t child = fork();
  assert(child >= 0);
  if (!child) {
    struct rlimit core{0, 0};
    setrlimit(RLIMIT_CORE, &core);
    __wrap___explicit_bzero_chk(bytes, 33, 32);
    _exit(7);
  }
  int status;
  assert(waitpid(child, &status, 0) == child && WIFSIGNALED(status) &&
         WTERMSIG(status) == SIGABRT);
  glob_probe(directory);
  assert(unlink(a) == 0 && unlink(z) == 0 && unlink(regular) == 0 &&
         rmdir(directory) == 0);
  puts("GNU "
       "gettid/entropy256/EINTR/ENOSYS/device/errno/EOF/FD/fortify/erase/"
       "glob64/ALTDIR/stat64 PASS");
#else
  puts("musl gettid PASS; GNU-only compatibility adapters excluded");
#endif
}
