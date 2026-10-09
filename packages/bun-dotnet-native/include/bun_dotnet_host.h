/* SPDX-License-Identifier: MIT */
#ifndef BUN_DOTNET_HOST_H
#define BUN_DOTNET_HOST_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
#define BUN_DOTNET_HOST_ABI_VERSION 1u
/* Status: 0 ok, -1 argument, -2 no .NET install/hostfxr, -4 .NET failure, -5 panic.
 * Strings are UTF-8; returned strings are freed with bun_dotnet_string_free. */
uint32_t bun_dotnet_abi_version(void);
/* dotnet_root NULL: DOTNET_ROOT_<ARCH>, DOTNET_ROOT, registered and default install
 * locations (nethost get_hostfxr_path order), then dotnet on PATH and ~/.dotnet.
 * BUN_DOTNET_HOSTFXR / BUN_DOTNET_NETHOST override the lookup. */
int32_t bun_dotnet_locate(const char *dotnet_root, char **root_out, char **hostfxr_out);
/* The dotnet muxer in this process (hostfxr_main_startupinfo); argv excludes the program
 * name. Not available once the CLR runs in the process. */
int32_t bun_dotnet_main(int32_t argc, const char *const *argv, int32_t *exit_code);
/* Starts the CLR once (hostfxr_initialize_for_runtime_config). runtime_config NULL:
 * BUN_DOTNET_RUNTIME_CONFIG or a generated config for the newest Microsoft.NETCore.App.
 * Returns 0 (started), 1 or 2 (already running), or a negative status. */
int32_t bun_dotnet_initialize(const char *runtime_config);
/* load_assembly_and_get_function_pointer (assembly set) or get_function_pointer
 * (assembly NULL, default load context). delegate_type NULL: UNMANAGEDCALLERSONLY_METHOD. */
int32_t bun_dotnet_function_pointer(const char *assembly, const char *type_name,
                                    const char *method, const char *delegate_type, void **out);
int32_t bun_dotnet_load_assembly(const char *assembly);
char *bun_dotnet_last_error(void);
void bun_dotnet_string_free(char *value);
#ifdef __cplusplus
}
#endif
#endif
