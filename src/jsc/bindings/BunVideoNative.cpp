#include "BunVideoNative.h"

#include <cstring>

#if OS(WINDOWS)
#include <windows.h>
#else
#include <dlfcn.h>
#include <limits.h>
#include <unistd.h>
#endif

namespace Bun::Video {

void* loadAdjacentEngine(const char* name)
{
#if OS(WINDOWS)
    wchar_t modulePath[MAX_PATH];
    const DWORD length = GetModuleFileNameW(nullptr, modulePath, MAX_PATH);
    if (!length || length >= MAX_PATH)
        return nullptr;
    wchar_t* slash = wcsrchr(modulePath, L'\\');
    if (!slash)
        return nullptr;
    ++slash;
    wchar_t wideName[MAX_PATH];
    if (!MultiByteToWideChar(CP_UTF8, 0, name, -1, wideName, MAX_PATH))
        return nullptr;
    wcscpy_s(slash, MAX_PATH - (slash - modulePath), wideName);
    return reinterpret_cast<void*>(LoadLibraryExW(modulePath, nullptr, LOAD_WITH_ALTERED_SEARCH_PATH));
#else
    char modulePath[PATH_MAX];
    const ssize_t length = readlink("/proc/self/exe", modulePath, sizeof(modulePath) - 1);
    if (length <= 0)
        return nullptr;
    modulePath[length] = 0;
    char* slash = strrchr(modulePath, '/');
    if (!slash)
        return nullptr;
    slash[1] = 0;
    strncat(modulePath, name, sizeof(modulePath) - strlen(modulePath) - 1);
    return dlopen(modulePath, RTLD_NOW | RTLD_LOCAL);
#endif
}

} // namespace Bun::Video
