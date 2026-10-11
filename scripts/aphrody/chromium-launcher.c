#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shlobj.h>
#include <stdio.h>
#include <wchar.h>

static int has_profile(int count, const wchar_t* const* args) {
    for (int i = 1; i < count; ++i) {
        if (!wcscmp(args[i], L"--user-data-dir") || !wcsncmp(args[i], L"--user-data-dir=", 16)) return 1;
    }
    return 0;
}

static int append(wchar_t* output, size_t* used, wchar_t value) {
    if (*used >= 32766) return 0;
    output[(*used)++] = value;
    output[*used] = 0;
    return 1;
}

static int argument(wchar_t* output, size_t* used, const wchar_t* value) {
    size_t slashes = 0;
    if (*used && !append(output, used, L' ')) return 0;
    if (!append(output, used, L'"')) return 0;
    for (;;) {
        if (*value == L'\\') { ++slashes; ++value; continue; }
        if (*value == L'"' || !*value) slashes *= 2;
        while (slashes) { if (!append(output, used, L'\\')) return 0; --slashes; }
        if (!*value) break;
        if (*value == L'"' && !append(output, used, L'\\')) return 0;
        if (!append(output, used, *value++)) return 0;
    }
    return append(output, used, L'"');
}

#ifdef BUN_CHROMIUM_LAUNCHER_TEST
int wmain(void) {
    const wchar_t* cases[] = { L"", L"simple", L"C:\\Program Files\\BunChromium\\", L"a\"b", L"a\\\"b", L"\"", L"\\\\", L"donn\x00e9" L"es du profil", L"https://example.invalid/?a=1&b=2" };
    wchar_t line[32768];
    for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i) {
        size_t used = 0;
        int count = 0;
        line[0] = 0;
        if (!argument(line, &used, L"browser.exe") || !argument(line, &used, cases[i])) return 1;
        wchar_t** parsed = CommandLineToArgvW(line, &count);
        int valid = parsed && count == 2 && !wcscmp(parsed[1], cases[i]);
        if (parsed) LocalFree(parsed);
        if (!valid) return 2;
    }
    size_t used = 32766;
    if (append(line, &used, L'x')) return 3;
    const wchar_t* equals[] = { L"launcher.exe", L"--user-data-dir=C:\\fresh" };
    const wchar_t* separate[] = { L"launcher.exe", L"--user-data-dir", L"C:\\fresh" };
    const wchar_t* other[] = { L"launcher.exe", L"--user-data-directory=C:\\fresh" };
    if (!has_profile(2, equals) || !has_profile(3, separate) || has_profile(2, other)) return 4;
    puts("9 Windows argument round trips and command length boundary passed");
    return 0;
}
#else
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR command, int show) {
    PWSTR programFiles = NULL, local = NULL;
    wchar_t browser[MAX_PATH], profile[32768];
    wchar_t* line = NULL;
    wchar_t** args = NULL;
    int count = 0, result = 1, explicitProfile = 0;
    size_t used = 0;
    STARTUPINFOW startup = {0};
    PROCESS_INFORMATION process = {0};
    (void)instance; (void)previous; (void)command; (void)show;
    if (FAILED(SHGetKnownFolderPath(&FOLDERID_ProgramFiles, 0, NULL, &programFiles)) ||
        FAILED(SHGetKnownFolderPath(&FOLDERID_LocalAppData, 0, NULL, &local))) goto done;
    if (swprintf_s(browser, MAX_PATH, L"%ls\\BunChromium\\Application\\chrome.exe", programFiles) < 0 ||
        swprintf_s(profile, 32768, L"--user-data-dir=%ls\\Chromium\\User Data", local) < 0) goto done;
    if (GetFileAttributesW(browser) == INVALID_FILE_ATTRIBUTES) { result = 2; goto done; }
    args = CommandLineToArgvW(GetCommandLineW(), &count);
    if (args) explicitProfile = has_profile(count, (const wchar_t* const*)args);
    line = (wchar_t*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, 32768 * sizeof(wchar_t));
    if (!args || !line || !argument(line, &used, browser) || (!explicitProfile && !argument(line, &used, profile)) ||
        !argument(line, &used, L"--enable-features=WebGPUService")) goto done;
    for (int i = 1; i < count; ++i) if (!argument(line, &used, args[i])) { result = 64; goto done; }
    startup.cb = sizeof(startup);
    if (!CreateProcessW(browser, line, NULL, NULL, FALSE, 0, NULL, programFiles, &startup, &process)) {
        result = (int)GetLastError(); goto done;
    }
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    result = 0;
done:
    if (line) HeapFree(GetProcessHeap(), 0, line);
    if (args) LocalFree(args);
    if (local) CoTaskMemFree(local);
    if (programFiles) CoTaskMemFree(programFiles);
    return result;
}
#endif
