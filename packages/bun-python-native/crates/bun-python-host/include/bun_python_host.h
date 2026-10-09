/* SPDX-License-Identifier: Apache-2.0 */
#ifndef BUN_PYTHON_HOST_H
#define BUN_PYTHON_HOST_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
#define BUN_PYTHON_HOST_ABI_VERSION 1u
uint32_t bun_py_abi_version(void);
/* Optional capability bit 0: contiguous writable Python buffer leases. */
uint64_t bun_py_capabilities(void);
typedef struct BunPyBuffer {
  uint32_t size;
  uint32_t flags;
  void *data;
  uintptr_t length;
  uint64_t lease;
} BunPyBuffer;
/* Set size=sizeof(BunPyBuffer), flags=1. Keep lease live while using the
 * bytes; serialize writes with Python. Detach JS views before release. */
int32_t bun_py_buffer_acquire(const char *expression, uint32_t flags, BunPyBuffer *out);
int32_t bun_py_buffer_release(uint64_t lease);
/* Bun external-ArrayBuffer GC callback: queues release, never calls Python/JS
 * on a collector thread. Supply lease as deallocatorContext. */
void bun_py_buffer_deallocator(void *bytes, void *deallocatorContext);
/* UTF-8 argv including selected Python executable. Returns host status;
 * If CPython returns, writes its actual result. This terminal CLI entry can
 * terminate the process (notably SystemExit on CPython 3.12, and os._exit).
 * It is not an embedded evaluation API. No initialized interpreter may be
 * replaced. Library stays loaded. */
int32_t bun_py_main(int32_t argc, const char *const *argv, int32_t *exit_code);
int32_t aphrody_py_load(const char *library);
int32_t aphrody_py_init(void);
int32_t aphrody_py_run(const char *code);
int32_t aphrody_py_eval(const char *expression, char **result);
int32_t aphrody_py_call(const char *module, const char *function, const char *argument, char **result);
int32_t aphrody_py_version(char **result);
int32_t aphrody_py_finalize(void);
char *aphrody_py_last_error(void);
void aphrody_py_string_free(char *result);
#ifdef __cplusplus
}
#endif
#endif
