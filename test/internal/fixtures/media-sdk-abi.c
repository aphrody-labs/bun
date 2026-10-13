#define _GNU_SOURCE
#define _LARGEFILE64_SOURCE
#include <fcntl.h>
#include <glob.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/types.h>
#include <unistd.h>
#if !defined(__GLIBC__)
#define fcntl64 fcntl
#endif

#define CHECK(condition)                                                       \
  do {                                                                         \
    if (!(condition)) {                                                        \
      fprintf(stderr, "ABI probe failed at line %d\n", __LINE__);              \
      return 1;                                                                \
    }                                                                          \
  } while (0)

int main(void) {
  volatile double two = 2.0, zero = 0.0, eight = 8.0;
  volatile float twof = 2.0f, zerof = 0.0f, eightf = 8.0f;
  CHECK(exp(zero) == 1.0 && exp2(two) == 4.0 && pow(two, 3.0) == eight);
  CHECK(fabs(log(exp(two)) - two) < 1e-12 && log2(eight) == 3.0);
  CHECK(expf(zerof) == 1.0f && exp2f(twof) == 4.0f &&
        powf(twof, 3.0f) == eightf);
  CHECK(fabsf(logf(expf(twof)) - twof) < 1e-5f && log2f(eightf) == 3.0f);
  char directory[] = "/tmp/bun-media-abi-XXXXXX";
  CHECK(mkdtemp(directory) != NULL);
  char first[128], second[128], pattern[128];
  CHECK(snprintf(first, sizeof(first), "%s/a.file", directory) > 0);
  CHECK(snprintf(second, sizeof(second), "%s/a.second", directory) > 0);
  CHECK(snprintf(pattern, sizeof(pattern), "%s/a.*", directory) > 0);
  int fd = open(first, O_CREAT | O_EXCL | O_RDWR, 0600);
  CHECK(fd >= 0);
  CHECK(fcntl64(fd, F_GETFD) == 0);
  CHECK(fcntl64(fd, F_SETFD, FD_CLOEXEC) == 0 &&
        fcntl64(fd, F_GETFD) == FD_CLOEXEC);
  const off_t large = (off_t)5 * 1024 * 1024 * 1024;
  CHECK(ftruncate(fd, large) == 0);
  struct flock64 lock = {.l_type = F_WRLCK,
                         .l_whence = SEEK_SET,
                         .l_start = large - 1,
                         .l_len = 1};
  CHECK(fcntl64(fd, F_GETLK64, &lock) == 0 && lock.l_type == F_UNLCK);
  CHECK(close(fd) == 0);
  fd = open(second, O_CREAT | O_EXCL | O_RDWR, 0600);
  CHECK(fd >= 0 && close(fd) == 0);
  glob64_t matches = {.gl_offs = 1};
  CHECK(glob64(pattern, GLOB_DOOFFS, NULL, &matches) == 0);
  CHECK(matches.gl_pathc == 2 && matches.gl_pathv[0] == NULL &&
        matches.gl_pathv[1] != NULL);
  globfree64(&matches);
  CHECK(unlink(first) == 0 && unlink(second) == 0 && rmdir(directory) == 0);
  puts("ABI_FUNCTIONAL_PASS math=10 fcntl=noarg,int,64bit-lock "
       "glob=offsets,two-paths");
  return 0;
}
