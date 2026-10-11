#include <windows.h>
#include <vss.h>
#include <vswriter.h>
#include <vsbackup.h>
#include <stdio.h>
#include <string>
#include <vector>

static int inventory(const wchar_t* root) {
    std::vector<std::wstring> directories = {root};
    unsigned long long files = 0, bytes = 0, streams = 0, streamBytes = 0;
    while (!directories.empty()) {
        std::wstring directory = directories.back();
        directories.pop_back();
        WIN32_FIND_DATAW found;
        HANDLE search = FindFirstFileW((directory + L"\\*").c_str(), &found);
        if (search == INVALID_HANDLE_VALUE) return 1;
        do {
            if (!wcscmp(found.cFileName, L".") || !wcscmp(found.cFileName, L"..")) continue;
            std::wstring path = directory + L"\\" + found.cFileName;
            if (found.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) { FindClose(search); return 2; }
            WIN32_FIND_STREAM_DATA data;
            HANDLE stream = FindFirstStreamW(path.c_str(), FindStreamInfoStandard, &data, 0);
            if (stream == INVALID_HANDLE_VALUE) {
                if (GetLastError() != ERROR_HANDLE_EOF) { FindClose(search); return 3; }
            } else {
                do {
                    if (wcscmp(data.cStreamName, L"::$DATA")) { ++streams; streamBytes += data.StreamSize.QuadPart; }
                } while (FindNextStreamW(stream, &data));
                DWORD error = GetLastError();
                FindClose(stream);
                if (error != ERROR_HANDLE_EOF) { FindClose(search); return 4; }
            }
            if (found.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) directories.push_back(path);
            else {
                ++files;
                HANDLE file = CreateFileW(path.c_str(), FILE_READ_ATTRIBUTES, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                                          nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
                LARGE_INTEGER size;
                if (file == INVALID_HANDLE_VALUE) { FindClose(search); return 5; }
                BOOL sized = GetFileSizeEx(file, &size);
                CloseHandle(file);
                if (!sized) { FindClose(search); return 6; }
                bytes += size.QuadPart;
            }
        } while (FindNextFileW(search, &found));
        DWORD error = GetLastError();
        FindClose(search);
        if (error != ERROR_NO_MORE_FILES) return 7;
    }
    wprintf(L"{\"Files\":%llu,\"Bytes\":%llu,\"NamedStreams\":%llu,\"NamedStreamBytes\":%llu}\n", files, bytes, streams, streamBytes);
    return 0;
}

static bool check(HRESULT hr, const wchar_t* operation) {
    if (FAILED(hr)) fwprintf(stderr, L"%ls failed: 0x%08lX\n", operation, (unsigned long)hr);
    return SUCCEEDED(hr);
}

int wmain(int argc, wchar_t** argv) {
    if (argc == 3 && !wcscmp(argv[1], L"inventory")) return inventory(argv[2]);
    if (argc != 3 || (wcscmp(argv[1], L"create") && wcscmp(argv[1], L"delete"))) return 64;
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (!check(hr, L"CoInitializeEx")) return 1;
    hr = CoInitializeSecurity(nullptr, -1, nullptr, nullptr, RPC_C_AUTHN_LEVEL_PKT_PRIVACY,
                              RPC_C_IMP_LEVEL_IMPERSONATE, nullptr, EOAC_NONE, nullptr);
    IVssBackupComponents* components = nullptr;
    VSS_ID snapshot = GUID_NULL;
    int result = 1;
    if (!check(hr, L"CoInitializeSecurity") ||
        !check(CreateVssBackupComponents(&components), L"CreateVssBackupComponents")) goto done;
    if (!check(components->InitializeForBackup(), L"InitializeForBackup")) goto done;
    if (!wcscmp(argv[1], L"delete")) {
        LONG deleted = 0;
        VSS_ID nondeleted = GUID_NULL;
        if (!check(CLSIDFromString(argv[2], &snapshot), L"snapshot ID")) goto done;
        if (!check(components->SetContext(VSS_CTX_ALL), L"SetContext")) goto done;
        result = check(components->DeleteSnapshots(snapshot, VSS_OBJECT_SNAPSHOT, FALSE,
                        &deleted, &nondeleted), L"DeleteSnapshots") && deleted == 1 ? 0 : 1;
        goto done;
    }
    if (wcslen(argv[2]) != 3 || argv[2][1] != L':' || argv[2][2] != L'\\') goto done;
    if (!check(components->SetContext(VSS_CTX_CLIENT_ACCESSIBLE), L"SetContext")) goto done;
    {
        VSS_ID set;
        IVssAsync* async = nullptr;
        HRESULT status = E_FAIL;
        VSS_SNAPSHOT_PROP property = {};
        wchar_t id[40];
        if (!check(components->StartSnapshotSet(&set), L"StartSnapshotSet") ||
            !check(components->AddToSnapshotSet(argv[2], GUID_NULL, &snapshot), L"AddToSnapshotSet")) goto done;
        hr = components->DoSnapshotSet(&async);
        if (check(hr, L"DoSnapshotSet")) {
            hr = async->Wait();
            if (SUCCEEDED(hr)) hr = async->QueryStatus(&status, nullptr);
            async->Release();
            if (SUCCEEDED(hr) && status != VSS_S_ASYNC_FINISHED) hr = status;
        }
        if (!check(hr, L"snapshot completion")) goto done;
        if (!check(components->GetSnapshotProperties(snapshot, &property), L"GetSnapshotProperties")) goto done;
        StringFromGUID2(snapshot, id, 40);
        wprintf(L"%ls\n%ls\n", id, property.m_pwszSnapshotDeviceObject);
        VssFreeSnapshotProperties(&property);
        result = 0;
    }
done:
    if (result && components && snapshot != GUID_NULL && !wcscmp(argv[1], L"create")) {
        LONG deleted; VSS_ID nondeleted;
        components->DeleteSnapshots(snapshot, VSS_OBJECT_SNAPSHOT, FALSE, &deleted, &nondeleted);
    }
    if (components) components->Release();
    CoUninitialize();
    return result;
}
