// SPDX-License-Identifier: Apache-2.0
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef int32_t (*bun_py_main_fn)(int32_t, const char *const *, int32_t *);
typedef uint32_t (*bun_py_abi_version_fn)(void);

static void *open_host(const char *path) {
  return dlopen(path, RTLD_NOW | RTLD_LOCAL);
}

static int probe(const char *path) {
  void *host = open_host(path);
  if (host == NULL) {
    fprintf(stderr, "%s\n", dlerror());
    return 2;
  }
  bun_py_abi_version_fn abi_version = (bun_py_abi_version_fn)dlsym(host, "bun_py_abi_version");
  bun_py_main_fn py_main = (bun_py_main_fn)dlsym(host, "bun_py_main");
  if (abi_version == NULL || py_main == NULL) {
    puts("{\"available\":false,\"reason\":\"required ABI v1 symbols are absent\"}");
    dlclose(host);
    return 86;
  }
  uint32_t version = abi_version();
  printf("{\"available\":%s,\"abi_version\":%u}\n", version == 1 ? "true" : "false", version);
  dlclose(host);
  return version == 1 ? 0 : 87;
}

int main(int argc, char **argv) {
  if (argc == 3 && strcmp(argv[1], "--probe") == 0)
    return probe(argv[2]);
  if (argc < 5 || strcmp(argv[1], "--invoke") != 0 || strcmp(argv[3], "--") != 0) {
    fputs("usage: driver --probe <host> | --invoke <host> -- <python argv...>\n", stderr);
    return 64;
  }

  void *host = open_host(argv[2]);
  if (host == NULL) {
    fprintf(stderr, "%s\n", dlerror());
    return 2;
  }
  bun_py_main_fn py_main = (bun_py_main_fn)dlsym(host, "bun_py_main");
  if (py_main == NULL) {
    fputs("bun_py_main is absent after a successful ABI probe\n", stderr);
    dlclose(host);
    return 86;
  }

  int32_t exit_code = 0;
  int32_t status = py_main((int32_t)(argc - 4), (const char *const *)&argv[4], &exit_code);
  fprintf(stderr, "BUN_PY_CONFORMANCE host_status=%d python_exit=%d\n", status, exit_code);
  return status == 0 ? 0 : 125;
}
