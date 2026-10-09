export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export interface kernel32Symbols {
    "CreateActCtxA": (...args: [Pointer]) => Pointer;
    "CreateActCtxW": (...args: [Pointer]) => Pointer;
    "AddRefActCtx": (...args: [Pointer]) => void;
    "ReleaseActCtx": (...args: [Pointer]) => void;
    "ZombifyActCtx": (...args: [Pointer]) => number;
    "ActivateActCtx": (...args: [Pointer, Pointer]) => number;
    "DeactivateActCtx": (...args: [number, number]) => number;
    "GetCurrentActCtx": (...args: [Pointer]) => number;
    "FindActCtxSectionStringA": (...args: [number, Pointer, number, Pointer, Pointer]) => number;
    "FindActCtxSectionStringW": (...args: [number, Pointer, number, Pointer, Pointer]) => number;
    "FindActCtxSectionGuid": (...args: [number, Pointer, number, Pointer, Pointer]) => number;
    "QueryActCtxW": (...args: [number, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "QueryActCtxSettingsW": (...args: [number, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "GetCurrentPackageId": (...args: [Pointer, Pointer]) => number;
    "GetCurrentPackageFullName": (...args: [Pointer, Pointer]) => number;
    "GetCurrentPackageFamilyName": (...args: [Pointer, Pointer]) => number;
    "GetCurrentPackagePath": (...args: [Pointer, Pointer]) => number;
    "GetPackageId": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetPackageFullName": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetPackageFamilyName": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetPackagePath": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetPackagePathByFullName": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetStagedPackagePathByFullName": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetCurrentApplicationUserModelId": (...args: [Pointer, Pointer]) => number;
    "GetApplicationUserModelId": (...args: [Pointer, Pointer, Pointer]) => number;
    "PackageIdFromFullName": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "PackageFullNameFromId": (...args: [Pointer, Pointer, Pointer]) => number;
    "PackageFamilyNameFromId": (...args: [Pointer, Pointer, Pointer]) => number;
    "PackageFamilyNameFromFullName": (...args: [Pointer, Pointer, Pointer]) => number;
    "PackageNameAndPublisherIdFromFamilyName": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "FormatApplicationUserModelId": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "ParseApplicationUserModelId": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetPackagesByPackageFamily": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "FindPackagesByPackageFamily": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetCurrentPackageInfo": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "OpenPackageInfoByFullName": (...args: [Pointer, number, Pointer]) => number;
    "ClosePackageInfo": (...args: [Pointer]) => number;
    "GetPackageInfo": (...args: [Pointer, number, Pointer, Pointer, Pointer]) => number;
    "GetPackageApplicationIds": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "CheckIsMSIXPackage": (...args: [Pointer, Pointer]) => number;
    "AppPolicyGetLifecycleManagement": (...args: [Pointer, Pointer]) => number;
    "AppPolicyGetWindowingModel": (...args: [Pointer, Pointer]) => number;
    "AppPolicyGetMediaFoundationCodecLoading": (...args: [Pointer, Pointer]) => number;
    "AppPolicyGetClrCompat": (...args: [Pointer, Pointer]) => number;
    "AppPolicyGetThreadInitializationType": (...args: [Pointer, Pointer]) => number;
    "AppPolicyGetShowDeveloperDiagnostic": (...args: [Pointer, Pointer]) => number;
    "AppPolicyGetProcessTerminationMethod": (...args: [Pointer, Pointer]) => number;
    "AppPolicyGetCreateFileAccess": (...args: [Pointer, Pointer]) => number;
    "CreatePackageVirtualizationContext": (...args: [Pointer, Pointer]) => number;
    "ActivatePackageVirtualizationContext": (...args: [Pointer, Pointer]) => number;
    "ReleasePackageVirtualizationContext": (...args: [Pointer]) => void;
    "DeactivatePackageVirtualizationContext": (...args: [number]) => void;
    "DuplicatePackageVirtualizationContext": (...args: [Pointer, Pointer]) => number;
    "GetCurrentPackageVirtualizationContext": (...args: []) => Pointer;
    "GetProcessesInVirtualizationContext": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetCurrentPackageInfo3": (...args: [number, number, Pointer, Pointer, Pointer]) => number;
    "RtlAddFunctionTable": (...args: [Pointer, number, number]) => number;
    "RtlDeleteFunctionTable": (...args: [Pointer]) => number;
    "RtlInstallFunctionTableCallback": (...args: [bigint, bigint, number, Pointer, Pointer, Pointer]) => number;
    "RtlLookupFunctionEntry": (...args: [number, Pointer, Pointer]) => Pointer;
    "RtlVirtualUnwind": (...args: [number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "ReadProcessMemory": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "WriteProcessMemory": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "GetThreadContext": (...args: [Pointer, Pointer]) => number;
    "SetThreadContext": (...args: [Pointer, Pointer]) => number;
    "FlushInstructionCache": (...args: [Pointer, Pointer, number]) => number;
    "Wow64GetThreadContext": (...args: [Pointer, Pointer]) => number;
    "Wow64SetThreadContext": (...args: [Pointer, Pointer]) => number;
    "RtlCaptureContext2": (...args: [Pointer]) => void;
    "RtlAddFunctionTable": (...args: [Pointer, number, bigint]) => number;
    "RtlDeleteFunctionTable": (...args: [Pointer]) => number;
    "RtlInstallFunctionTableCallback": (...args: [bigint, bigint, number, Pointer, Pointer, Pointer]) => number;
    "RtlLookupFunctionEntry": (...args: [bigint, Pointer, Pointer]) => Pointer;
    "RtlUnwindEx": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => void;
    "RtlVirtualUnwind": (...args: [number, bigint, bigint, Pointer, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "RtlCaptureStackBackTrace": (...args: [number, number, Pointer, Pointer]) => number;
    "RtlCaptureContext": (...args: [Pointer]) => void;
    "RtlUnwind": (...args: [Pointer, Pointer, Pointer, Pointer]) => void;
    "RtlRestoreContext": (...args: [Pointer, Pointer]) => void;
    "RtlRaiseException": (...args: [Pointer]) => void;
    "RtlPcToFileHeader": (...args: [Pointer, Pointer]) => Pointer;
    "IsDebuggerPresent": (...args: []) => number;
    "DebugBreak": (...args: []) => void;
    "OutputDebugStringA": (...args: [Pointer]) => void;
    "OutputDebugStringW": (...args: [Pointer]) => void;
    "ContinueDebugEvent": (...args: [number, number, number]) => number;
    "WaitForDebugEvent": (...args: [Pointer, number]) => number;
    "DebugActiveProcess": (...args: [number]) => number;
    "DebugActiveProcessStop": (...args: [number]) => number;
    "CheckRemoteDebuggerPresent": (...args: [Pointer, Pointer]) => number;
    "WaitForDebugEventEx": (...args: [Pointer, number]) => number;
    "EncodePointer": (...args: [Pointer]) => Pointer;
    "DecodePointer": (...args: [Pointer]) => Pointer;
    "EncodeSystemPointer": (...args: [Pointer]) => Pointer;
    "DecodeSystemPointer": (...args: [Pointer]) => Pointer;
    "Beep": (...args: [number, number]) => number;
    "RaiseException": (...args: [number, number, number, Pointer]) => void;
    "UnhandledExceptionFilter": (...args: [Pointer]) => number;
    "SetUnhandledExceptionFilter": (...args: [Pointer]) => Pointer;
    "GetErrorMode": (...args: []) => number;
    "SetErrorMode": (...args: [number]) => number;
    "AddVectoredExceptionHandler": (...args: [number, Pointer]) => Pointer;
    "RemoveVectoredExceptionHandler": (...args: [Pointer]) => number;
    "AddVectoredContinueHandler": (...args: [number, Pointer]) => Pointer;
    "RemoveVectoredContinueHandler": (...args: [Pointer]) => number;
    "RaiseFailFastException": (...args: [Pointer, Pointer, number]) => void;
    "FatalAppExitA": (...args: [number, Pointer]) => void;
    "FatalAppExitW": (...args: [number, Pointer]) => void;
    "GetThreadErrorMode": (...args: []) => number;
    "SetThreadErrorMode": (...args: [number, Pointer]) => number;
    "FatalExit": (...args: [number]) => void;
    "GetThreadSelectorEntry": (...args: [Pointer, number, Pointer]) => number;
    "Wow64GetThreadSelectorEntry": (...args: [Pointer, number, Pointer]) => number;
    "DebugSetProcessKillOnExit": (...args: [number]) => number;
    "DebugBreakProcess": (...args: [Pointer]) => number;
    "FormatMessageA": (...args: [number, Pointer, number, number, Pointer, number, Pointer]) => number;
    "FormatMessageW": (...args: [number, Pointer, number, number, Pointer, number, Pointer]) => number;
    "CopyContext": (...args: [Pointer, number, Pointer]) => number;
    "InitializeContext": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "InitializeContext2": (...args: [Pointer, number, Pointer, Pointer, bigint]) => number;
    "GetEnabledXStateFeatures": (...args: []) => bigint;
    "GetXStateFeaturesMask": (...args: [Pointer, Pointer]) => number;
    "LocateXStateFeature": (...args: [Pointer, number, Pointer]) => Pointer;
    "SetXStateFeaturesMask": (...args: [Pointer, bigint]) => number;
    "SearchPathW": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SearchPathA": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "CompareFileTime": (...args: [Pointer, Pointer]) => number;
    "CreateDirectoryA": (...args: [Pointer, Pointer]) => number;
    "CreateDirectoryW": (...args: [Pointer, Pointer]) => number;
    "CreateFileA": (...args: [Pointer, number, number, Pointer, number, number, Pointer]) => Pointer;
    "CreateFileW": (...args: [Pointer, number, number, Pointer, number, number, Pointer]) => Pointer;
    "DefineDosDeviceW": (...args: [number, Pointer, Pointer]) => number;
    "DeleteFileA": (...args: [Pointer]) => number;
    "DeleteFileW": (...args: [Pointer]) => number;
    "DeleteVolumeMountPointW": (...args: [Pointer]) => number;
    "FileTimeToLocalFileTime": (...args: [Pointer, Pointer]) => number;
    "FindClose": (...args: [Pointer]) => number;
    "FindCloseChangeNotification": (...args: [Pointer]) => number;
    "FindFirstChangeNotificationA": (...args: [Pointer, number, number]) => Pointer;
    "FindFirstChangeNotificationW": (...args: [Pointer, number, number]) => Pointer;
    "FindFirstFileA": (...args: [Pointer, Pointer]) => Pointer;
    "FindFirstFileW": (...args: [Pointer, Pointer]) => Pointer;
    "FindFirstFileExA": (...args: [Pointer, number, Pointer, number, Pointer, number]) => Pointer;
    "FindFirstFileExW": (...args: [Pointer, number, Pointer, number, Pointer, number]) => Pointer;
    "FindFirstVolumeW": (...args: [Pointer, number]) => Pointer;
    "FindNextChangeNotification": (...args: [Pointer]) => number;
    "FindNextFileA": (...args: [Pointer, Pointer]) => number;
    "FindNextFileW": (...args: [Pointer, Pointer]) => number;
    "FindNextVolumeW": (...args: [Pointer, Pointer, number]) => number;
    "FindVolumeClose": (...args: [Pointer]) => number;
    "FlushFileBuffers": (...args: [Pointer]) => number;
    "GetDiskFreeSpaceA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetDiskFreeSpaceW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetDiskFreeSpaceExA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetDiskFreeSpaceExW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetDiskSpaceInformationA": (...args: [Pointer, Pointer]) => number;
    "GetDiskSpaceInformationW": (...args: [Pointer, Pointer]) => number;
    "GetDriveTypeA": (...args: [Pointer]) => number;
    "GetDriveTypeW": (...args: [Pointer]) => number;
    "GetFileAttributesA": (...args: [Pointer]) => number;
    "GetFileAttributesW": (...args: [Pointer]) => number;
    "GetFileAttributesExA": (...args: [Pointer, number, Pointer]) => number;
    "GetFileAttributesExW": (...args: [Pointer, number, Pointer]) => number;
    "GetFileInformationByHandle": (...args: [Pointer, Pointer]) => number;
    "GetFileSize": (...args: [Pointer, Pointer]) => number;
    "GetFileSizeEx": (...args: [Pointer, Pointer]) => number;
    "GetFileType": (...args: [Pointer]) => number;
    "GetFinalPathNameByHandleA": (...args: [Pointer, Pointer, number, number]) => number;
    "GetFinalPathNameByHandleW": (...args: [Pointer, Pointer, number, number]) => number;
    "GetFileTime": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetFullPathNameW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetFullPathNameA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetLogicalDrives": (...args: []) => number;
    "GetLogicalDriveStringsW": (...args: [number, Pointer]) => number;
    "GetLongPathNameA": (...args: [Pointer, Pointer, number]) => number;
    "GetLongPathNameW": (...args: [Pointer, Pointer, number]) => number;
    "AreShortNamesEnabled": (...args: [Pointer, Pointer]) => number;
    "GetShortPathNameW": (...args: [Pointer, Pointer, number]) => number;
    "GetTempFileNameW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetVolumeInformationByHandleW": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "GetVolumeInformationW": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "GetVolumePathNameW": (...args: [Pointer, Pointer, number]) => number;
    "LocalFileTimeToFileTime": (...args: [Pointer, Pointer]) => number;
    "LockFile": (...args: [Pointer, number, number, number, number]) => number;
    "LockFileEx": (...args: [Pointer, number, number, number, number, Pointer]) => number;
    "QueryDosDeviceW": (...args: [Pointer, Pointer, number]) => number;
    "ReadFile": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "ReadFileEx": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "ReadFileScatter": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "RemoveDirectoryA": (...args: [Pointer]) => number;
    "RemoveDirectoryW": (...args: [Pointer]) => number;
    "SetEndOfFile": (...args: [Pointer]) => number;
    "SetFileAttributesA": (...args: [Pointer, number]) => number;
    "SetFileAttributesW": (...args: [Pointer, number]) => number;
    "SetFileInformationByHandle": (...args: [Pointer, number, Pointer, number]) => number;
    "SetFilePointer": (...args: [Pointer, number, Pointer, number]) => number;
    "SetFilePointerEx": (...args: [Pointer, bigint, Pointer, number]) => number;
    "SetFileTime": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetFileValidData": (...args: [Pointer, bigint]) => number;
    "UnlockFile": (...args: [Pointer, number, number, number, number]) => number;
    "UnlockFileEx": (...args: [Pointer, number, number, number, Pointer]) => number;
    "WriteFile": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "WriteFileEx": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "WriteFileGather": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "GetTempPathW": (...args: [number, Pointer]) => number;
    "GetVolumeNameForVolumeMountPointW": (...args: [Pointer, Pointer, number]) => number;
    "GetVolumePathNamesForVolumeNameW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "CreateFile2": (...args: [Pointer, number, number, number, Pointer]) => Pointer;
    "SetFileIoOverlappedRange": (...args: [Pointer, Pointer, number]) => number;
    "GetCompressedFileSizeA": (...args: [Pointer, Pointer]) => number;
    "GetCompressedFileSizeW": (...args: [Pointer, Pointer]) => number;
    "FindFirstStreamW": (...args: [Pointer, number, Pointer, number]) => Pointer;
    "FindNextStreamW": (...args: [Pointer, Pointer]) => number;
    "AreFileApisANSI": (...args: []) => number;
    "GetTempPathA": (...args: [number, Pointer]) => number;
    "FindFirstFileNameW": (...args: [Pointer, number, Pointer, Pointer]) => Pointer;
    "FindNextFileNameW": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetVolumeInformationA": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "GetTempFileNameA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetFileApisToOEM": (...args: []) => void;
    "SetFileApisToANSI": (...args: []) => void;
    "GetTempPath2W": (...args: [number, Pointer]) => number;
    "GetTempPath2A": (...args: [number, Pointer]) => number;
    "CreateFile3": (...args: [Pointer, number, number, number, Pointer]) => Pointer;
    "CreateDirectory2A": (...args: [Pointer, number, number, number, Pointer]) => Pointer;
    "CreateDirectory2W": (...args: [Pointer, number, number, number, Pointer]) => Pointer;
    "RemoveDirectory2A": (...args: [Pointer, number]) => number;
    "RemoveDirectory2W": (...args: [Pointer, number]) => number;
    "DeleteFile2A": (...args: [Pointer, number]) => number;
    "DeleteFile2W": (...args: [Pointer, number]) => number;
    "VerLanguageNameA": (...args: [number, Pointer, number]) => number;
    "VerLanguageNameW": (...args: [number, Pointer, number]) => number;
    "LZStart": (...args: []) => number;
    "LZDone": (...args: []) => void;
    "CopyLZFile": (...args: [number, number]) => number;
    "LZCopy": (...args: [number, number]) => number;
    "LZInit": (...args: [number]) => number;
    "GetExpandedNameA": (...args: [Pointer, Pointer]) => number;
    "GetExpandedNameW": (...args: [Pointer, Pointer]) => number;
    "LZOpenFileA": (...args: [Pointer, Pointer, number]) => number;
    "LZOpenFileW": (...args: [Pointer, Pointer, number]) => number;
    "LZSeek": (...args: [number, number, number]) => number;
    "LZRead": (...args: [number, Pointer, number]) => number;
    "LZClose": (...args: [number]) => void;
    "BuildIoRingWriteFile": (...args: [Pointer, Pointer, Pointer, number, bigint, number, number, number]) => number;
    "BuildIoRingFlushFile": (...args: [Pointer, Pointer, number, number, number]) => number;
    "BuildIoRingReadFileScatter": (...args: [Pointer, Pointer, number, Pointer, number, bigint, number, number]) => number;
    "BuildIoRingWriteFileGather": (...args: [Pointer, Pointer, number, Pointer, number, bigint, number, number, number]) => number;
    "Wow64EnableWow64FsRedirection": (...args: [number]) => number;
    "Wow64DisableWow64FsRedirection": (...args: [Pointer]) => number;
    "Wow64RevertWow64FsRedirection": (...args: [Pointer]) => number;
    "GetBinaryTypeA": (...args: [Pointer, Pointer]) => number;
    "GetBinaryTypeW": (...args: [Pointer, Pointer]) => number;
    "GetShortPathNameA": (...args: [Pointer, Pointer, number]) => number;
    "GetLongPathNameTransactedA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetLongPathNameTransactedW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetFileCompletionNotificationModes": (...args: [Pointer, number]) => number;
    "SetFileShortNameA": (...args: [Pointer, Pointer]) => number;
    "SetFileShortNameW": (...args: [Pointer, Pointer]) => number;
    "SetTapePosition": (...args: [Pointer, number, number, number, number, number]) => number;
    "GetTapePosition": (...args: [Pointer, number, Pointer, Pointer, Pointer]) => number;
    "PrepareTape": (...args: [Pointer, number, number]) => number;
    "EraseTape": (...args: [Pointer, number, number]) => number;
    "CreateTapePartition": (...args: [Pointer, number, number, number]) => number;
    "WriteTapemark": (...args: [Pointer, number, number, number]) => number;
    "GetTapeStatus": (...args: [Pointer]) => number;
    "GetTapeParameters": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "SetTapeParameters": (...args: [Pointer, number, Pointer]) => number;
    "OpenFile": (...args: [Pointer, Pointer, number]) => number;
    "BackupRead": (...args: [Pointer, Pointer, number, Pointer, number, number, Pointer]) => number;
    "BackupSeek": (...args: [Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "BackupWrite": (...args: [Pointer, Pointer, number, Pointer, number, number, Pointer]) => number;
    "GetLogicalDriveStringsA": (...args: [number, Pointer]) => number;
    "SetSearchPathMode": (...args: [number]) => number;
    "CreateDirectoryExA": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateDirectoryExW": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateDirectoryTransactedA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "CreateDirectoryTransactedW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RemoveDirectoryTransactedA": (...args: [Pointer, Pointer]) => number;
    "RemoveDirectoryTransactedW": (...args: [Pointer, Pointer]) => number;
    "GetFullPathNameTransactedA": (...args: [Pointer, number, Pointer, Pointer, Pointer]) => number;
    "GetFullPathNameTransactedW": (...args: [Pointer, number, Pointer, Pointer, Pointer]) => number;
    "DefineDosDeviceA": (...args: [number, Pointer, Pointer]) => number;
    "QueryDosDeviceA": (...args: [Pointer, Pointer, number]) => number;
    "CreateFileTransactedA": (...args: [Pointer, number, number, Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateFileTransactedW": (...args: [Pointer, number, number, Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "ReOpenFile": (...args: [Pointer, number, number, number]) => Pointer;
    "SetFileAttributesTransactedA": (...args: [Pointer, number, Pointer]) => number;
    "SetFileAttributesTransactedW": (...args: [Pointer, number, Pointer]) => number;
    "GetFileAttributesTransactedA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetFileAttributesTransactedW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetCompressedFileSizeTransactedA": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetCompressedFileSizeTransactedW": (...args: [Pointer, Pointer, Pointer]) => number;
    "DeleteFileTransactedA": (...args: [Pointer, Pointer]) => number;
    "DeleteFileTransactedW": (...args: [Pointer, Pointer]) => number;
    "CheckNameLegalDOS8Dot3A": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "CheckNameLegalDOS8Dot3W": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "FindFirstFileTransactedA": (...args: [Pointer, number, Pointer, number, Pointer, number, Pointer]) => Pointer;
    "FindFirstFileTransactedW": (...args: [Pointer, number, Pointer, number, Pointer, number, Pointer]) => Pointer;
    "CopyFileA": (...args: [Pointer, Pointer, number]) => number;
    "CopyFileW": (...args: [Pointer, Pointer, number]) => number;
    "CopyFileExA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "CopyFileExW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "CopyFileTransactedA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "CopyFileTransactedW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "CopyFile2": (...args: [Pointer, Pointer, Pointer]) => number;
    "MoveFileA": (...args: [Pointer, Pointer]) => number;
    "MoveFileW": (...args: [Pointer, Pointer]) => number;
    "MoveFileExA": (...args: [Pointer, Pointer, number]) => number;
    "MoveFileExW": (...args: [Pointer, Pointer, number]) => number;
    "MoveFileWithProgressA": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "MoveFileWithProgressW": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "MoveFileTransactedA": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "MoveFileTransactedW": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "ReplaceFileA": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "ReplaceFileW": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "CreateHardLinkA": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateHardLinkW": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateHardLinkTransactedA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "CreateHardLinkTransactedW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "FindFirstStreamTransactedW": (...args: [Pointer, number, Pointer, number, Pointer]) => Pointer;
    "FindFirstFileNameTransactedW": (...args: [Pointer, number, Pointer, Pointer, Pointer]) => Pointer;
    "SetVolumeLabelA": (...args: [Pointer, Pointer]) => number;
    "SetVolumeLabelW": (...args: [Pointer, Pointer]) => number;
    "SetFileBandwidthReservation": (...args: [Pointer, number, number, number, Pointer, Pointer]) => number;
    "GetFileBandwidthReservation": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "ReadDirectoryChangesW": (...args: [Pointer, Pointer, number, number, number, Pointer, Pointer, Pointer]) => number;
    "ReadDirectoryChangesExW": (...args: [Pointer, Pointer, number, number, number, Pointer, Pointer, Pointer, number]) => number;
    "FindFirstVolumeA": (...args: [Pointer, number]) => Pointer;
    "FindNextVolumeA": (...args: [Pointer, Pointer, number]) => number;
    "FindFirstVolumeMountPointA": (...args: [Pointer, Pointer, number]) => Pointer;
    "FindFirstVolumeMountPointW": (...args: [Pointer, Pointer, number]) => Pointer;
    "FindNextVolumeMountPointA": (...args: [Pointer, Pointer, number]) => number;
    "FindNextVolumeMountPointW": (...args: [Pointer, Pointer, number]) => number;
    "FindVolumeMountPointClose": (...args: [Pointer]) => number;
    "SetVolumeMountPointA": (...args: [Pointer, Pointer]) => number;
    "SetVolumeMountPointW": (...args: [Pointer, Pointer]) => number;
    "DeleteVolumeMountPointA": (...args: [Pointer]) => number;
    "GetVolumeNameForVolumeMountPointA": (...args: [Pointer, Pointer, number]) => number;
    "GetVolumePathNameA": (...args: [Pointer, Pointer, number]) => number;
    "GetVolumePathNamesForVolumeNameA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetFileInformationByHandleEx": (...args: [Pointer, number, Pointer, number]) => number;
    "GetFileInformationByName": (...args: [Pointer, number, Pointer, number]) => number;
    "OpenFileById": (...args: [Pointer, Pointer, number, number, Pointer, number]) => Pointer;
    "CreateSymbolicLinkA": (...args: [Pointer, Pointer, number]) => number;
    "CreateSymbolicLinkW": (...args: [Pointer, Pointer, number]) => number;
    "CreateSymbolicLinkTransactedA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "CreateSymbolicLinkTransactedW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "CloseHandle": (...args: [Pointer]) => number;
    "DuplicateHandle": (...args: [Pointer, Pointer, Pointer, Pointer, number, number, number]) => number;
    "GetHandleInformation": (...args: [Pointer, Pointer]) => number;
    "SetHandleInformation": (...args: [Pointer, number, number]) => number;
    "FreeLibrary": (...args: [Pointer]) => number;
    "GetLastError": (...args: []) => number;
    "SetLastError": (...args: [number]) => void;
    "GlobalFree": (...args: [Pointer]) => Pointer;
    "LocalFree": (...args: [Pointer]) => Pointer;
    "GetDateFormatA": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "GetDateFormatW": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "GetTimeFormatA": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "GetTimeFormatW": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "GetTimeFormatEx": (...args: [Pointer, number, Pointer, Pointer, Pointer, number]) => number;
    "GetDateFormatEx": (...args: [Pointer, number, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "GetDurationFormatEx": (...args: [Pointer, number, Pointer, bigint, Pointer, Pointer, number]) => number;
    "CompareStringEx": (...args: [Pointer, number, Pointer, number, Pointer, number, Pointer, Pointer, number]) => number;
    "CompareStringOrdinal": (...args: [Pointer, number, Pointer, number, number]) => number;
    "CompareStringW": (...args: [number, number, Pointer, number, Pointer, number]) => number;
    "FoldStringW": (...args: [number, Pointer, number, Pointer, number]) => number;
    "GetStringTypeExW": (...args: [number, number, Pointer, number, Pointer]) => number;
    "GetStringTypeW": (...args: [number, Pointer, number, Pointer]) => number;
    "MultiByteToWideChar": (...args: [number, number, Pointer, number, Pointer, number]) => number;
    "WideCharToMultiByte": (...args: [number, number, Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "IsValidCodePage": (...args: [number]) => number;
    "GetACP": (...args: []) => number;
    "GetOEMCP": (...args: []) => number;
    "GetCPInfo": (...args: [number, Pointer]) => number;
    "GetCPInfoExA": (...args: [number, number, Pointer]) => number;
    "GetCPInfoExW": (...args: [number, number, Pointer]) => number;
    "CompareStringA": (...args: [number, number, Pointer, number, Pointer, number]) => number;
    "FindNLSString": (...args: [number, number, Pointer, number, Pointer, number, Pointer]) => number;
    "LCMapStringW": (...args: [number, number, Pointer, number, Pointer, number]) => number;
    "LCMapStringA": (...args: [number, number, Pointer, number, Pointer, number]) => number;
    "GetLocaleInfoW": (...args: [number, number, Pointer, number]) => number;
    "GetLocaleInfoA": (...args: [number, number, Pointer, number]) => number;
    "SetLocaleInfoA": (...args: [number, number, Pointer]) => number;
    "SetLocaleInfoW": (...args: [number, number, Pointer]) => number;
    "GetCalendarInfoA": (...args: [number, number, number, Pointer, number, Pointer]) => number;
    "GetCalendarInfoW": (...args: [number, number, number, Pointer, number, Pointer]) => number;
    "SetCalendarInfoA": (...args: [number, number, number, Pointer]) => number;
    "SetCalendarInfoW": (...args: [number, number, number, Pointer]) => number;
    "IsDBCSLeadByte": (...args: [number]) => number;
    "IsDBCSLeadByteEx": (...args: [number, number]) => number;
    "LocaleNameToLCID": (...args: [Pointer, number]) => number;
    "LCIDToLocaleName": (...args: [number, Pointer, number, number]) => number;
    "GetDurationFormat": (...args: [number, number, Pointer, bigint, Pointer, Pointer, number]) => number;
    "GetNumberFormatA": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "GetNumberFormatW": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "GetCurrencyFormatA": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "GetCurrencyFormatW": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "EnumCalendarInfoA": (...args: [Pointer, number, number, number]) => number;
    "EnumCalendarInfoW": (...args: [Pointer, number, number, number]) => number;
    "EnumCalendarInfoExA": (...args: [Pointer, number, number, number]) => number;
    "EnumCalendarInfoExW": (...args: [Pointer, number, number, number]) => number;
    "EnumTimeFormatsA": (...args: [Pointer, number, number]) => number;
    "EnumTimeFormatsW": (...args: [Pointer, number, number]) => number;
    "EnumDateFormatsA": (...args: [Pointer, number, number]) => number;
    "EnumDateFormatsW": (...args: [Pointer, number, number]) => number;
    "EnumDateFormatsExA": (...args: [Pointer, number, number]) => number;
    "EnumDateFormatsExW": (...args: [Pointer, number, number]) => number;
    "IsValidLanguageGroup": (...args: [number, number]) => number;
    "GetNLSVersion": (...args: [number, number, Pointer]) => number;
    "IsValidLocale": (...args: [number, number]) => number;
    "GetGeoInfoA": (...args: [number, number, Pointer, number, number]) => number;
    "GetGeoInfoW": (...args: [number, number, Pointer, number, number]) => number;
    "GetGeoInfoEx": (...args: [Pointer, number, Pointer, number]) => number;
    "EnumSystemGeoID": (...args: [number, number, Pointer]) => number;
    "EnumSystemGeoNames": (...args: [number, Pointer, number]) => number;
    "GetUserGeoID": (...args: [number]) => number;
    "GetUserDefaultGeoName": (...args: [Pointer, number]) => number;
    "SetUserGeoID": (...args: [number]) => number;
    "SetUserGeoName": (...args: [Pointer]) => number;
    "ConvertDefaultLocale": (...args: [number]) => number;
    "GetSystemDefaultUILanguage": (...args: []) => number;
    "GetThreadLocale": (...args: []) => number;
    "SetThreadLocale": (...args: [number]) => number;
    "GetUserDefaultUILanguage": (...args: []) => number;
    "GetUserDefaultLangID": (...args: []) => number;
    "GetSystemDefaultLangID": (...args: []) => number;
    "GetSystemDefaultLCID": (...args: []) => number;
    "GetUserDefaultLCID": (...args: []) => number;
    "SetThreadUILanguage": (...args: [number]) => number;
    "GetThreadUILanguage": (...args: []) => number;
    "GetProcessPreferredUILanguages": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SetProcessPreferredUILanguages": (...args: [number, Pointer, Pointer]) => number;
    "GetUserPreferredUILanguages": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "GetSystemPreferredUILanguages": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "GetThreadPreferredUILanguages": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SetThreadPreferredUILanguages": (...args: [number, Pointer, Pointer]) => number;
    "GetFileMUIInfo": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "GetFileMUIPath": (...args: [number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetUILanguageInfo": (...args: [number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetThreadPreferredUILanguages2": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "RestoreThreadPreferredUILanguages": (...args: [Pointer]) => void;
    "NotifyUILanguageChange": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "GetStringTypeExA": (...args: [number, number, Pointer, number, Pointer]) => number;
    "GetStringTypeA": (...args: [number, number, Pointer, number, Pointer]) => number;
    "FoldStringA": (...args: [number, Pointer, number, Pointer, number]) => number;
    "EnumSystemLocalesA": (...args: [Pointer, number]) => number;
    "EnumSystemLocalesW": (...args: [Pointer, number]) => number;
    "EnumSystemLanguageGroupsA": (...args: [Pointer, number, number]) => number;
    "EnumSystemLanguageGroupsW": (...args: [Pointer, number, number]) => number;
    "EnumLanguageGroupLocalesA": (...args: [Pointer, number, number, number]) => number;
    "EnumLanguageGroupLocalesW": (...args: [Pointer, number, number, number]) => number;
    "EnumUILanguagesA": (...args: [Pointer, number, number]) => number;
    "EnumUILanguagesW": (...args: [Pointer, number, number]) => number;
    "EnumSystemCodePagesA": (...args: [Pointer, number]) => number;
    "EnumSystemCodePagesW": (...args: [Pointer, number]) => number;
    "IdnToNameprepUnicode": (...args: [number, Pointer, number, Pointer, number]) => number;
    "NormalizeString": (...args: [number, Pointer, number, Pointer, number]) => number;
    "IsNormalizedString": (...args: [number, Pointer, number]) => number;
    "VerifyScripts": (...args: [number, Pointer, number, Pointer, number]) => number;
    "GetStringScripts": (...args: [number, Pointer, number, Pointer, number]) => number;
    "GetLocaleInfoEx": (...args: [Pointer, number, Pointer, number]) => number;
    "GetCalendarInfoEx": (...args: [Pointer, number, Pointer, number, Pointer, number, Pointer]) => number;
    "GetNumberFormatEx": (...args: [Pointer, number, Pointer, Pointer, Pointer, number]) => number;
    "GetCurrencyFormatEx": (...args: [Pointer, number, Pointer, Pointer, Pointer, number]) => number;
    "GetUserDefaultLocaleName": (...args: [Pointer, number]) => number;
    "GetSystemDefaultLocaleName": (...args: [Pointer, number]) => number;
    "IsNLSDefinedString": (...args: [number, number, Pointer, Pointer, number]) => number;
    "GetNLSVersionEx": (...args: [number, Pointer, Pointer]) => number;
    "IsValidNLSVersion": (...args: [number, Pointer, Pointer]) => number;
    "FindNLSStringEx": (...args: [Pointer, number, Pointer, number, Pointer, number, Pointer, Pointer, Pointer, number]) => number;
    "LCMapStringEx": (...args: [Pointer, number, Pointer, number, Pointer, number, Pointer, Pointer, number]) => number;
    "IsValidLocaleName": (...args: [Pointer]) => number;
    "EnumCalendarInfoExEx": (...args: [Pointer, Pointer, number, Pointer, number, number]) => number;
    "EnumDateFormatsExEx": (...args: [Pointer, Pointer, number, number]) => number;
    "EnumTimeFormatsEx": (...args: [Pointer, Pointer, number, number]) => number;
    "EnumSystemLocalesEx": (...args: [Pointer, number, number, Pointer]) => number;
    "ResolveLocaleName": (...args: [Pointer, Pointer, number]) => number;
    "GetCalendarSupportedDateRange": (...args: [number, Pointer, Pointer]) => number;
    "GetCalendarDateFormatEx": (...args: [Pointer, number, Pointer, Pointer, Pointer, number]) => number;
    "ConvertSystemTimeToCalDateTime": (...args: [Pointer, number, Pointer]) => number;
    "UpdateCalendarDayOfWeek": (...args: [Pointer]) => number;
    "AdjustCalendarDate": (...args: [Pointer, number, number]) => number;
    "ConvertCalDateTimeToSystemTime": (...args: [Pointer, Pointer]) => number;
    "IsCalendarLeapYear": (...args: [number, number, number]) => number;
    "FindStringOrdinal": (...args: [number, Pointer, number, Pointer, number, number]) => number;
    "lstrcmpA": (...args: [Pointer, Pointer]) => number;
    "lstrcmpW": (...args: [Pointer, Pointer]) => number;
    "lstrcmpiA": (...args: [Pointer, Pointer]) => number;
    "lstrcmpiW": (...args: [Pointer, Pointer]) => number;
    "lstrcpynA": (...args: [Pointer, Pointer, number]) => Pointer;
    "lstrcpynW": (...args: [Pointer, Pointer, number]) => Pointer;
    "lstrcpyA": (...args: [Pointer, Pointer]) => Pointer;
    "lstrcpyW": (...args: [Pointer, Pointer]) => Pointer;
    "lstrcatA": (...args: [Pointer, Pointer]) => Pointer;
    "lstrcatW": (...args: [Pointer, Pointer]) => Pointer;
    "lstrlenA": (...args: [Pointer]) => number;
    "lstrlenW": (...args: [Pointer]) => number;
    "ProcessIdToSessionId": (...args: [number, Pointer]) => number;
    "WTSGetActiveConsoleSessionId": (...args: []) => number;
    "AddResourceAttributeAce": (...args: [Pointer, number, number, number, Pointer, Pointer, Pointer]) => number;
    "AddScopedPolicyIDAce": (...args: [Pointer, number, number, number, Pointer]) => number;
    "CheckTokenCapability": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetAppContainerAce": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "CheckTokenMembershipEx": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetCachedSigningLevel": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCachedSigningLevel": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GlobalMemoryStatusEx": (...args: [Pointer]) => number;
    "GetSystemInfo": (...args: [Pointer]) => void;
    "GetSystemTime": (...args: [Pointer]) => void;
    "GetSystemTimeAsFileTime": (...args: [Pointer]) => void;
    "GetLocalTime": (...args: [Pointer]) => void;
    "IsUserCetAvailableInEnvironment": (...args: [number]) => number;
    "GetSystemLeapSecondInformation": (...args: [Pointer, Pointer]) => number;
    "GetVersion": (...args: []) => number;
    "SetLocalTime": (...args: [Pointer]) => number;
    "GetTickCount": (...args: []) => number;
    "GetTickCount64": (...args: []) => bigint;
    "GetSystemTimeAdjustment": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetSystemDirectoryA": (...args: [Pointer, number]) => number;
    "GetSystemDirectoryW": (...args: [Pointer, number]) => number;
    "GetWindowsDirectoryA": (...args: [Pointer, number]) => number;
    "GetWindowsDirectoryW": (...args: [Pointer, number]) => number;
    "GetSystemWindowsDirectoryA": (...args: [Pointer, number]) => number;
    "GetSystemWindowsDirectoryW": (...args: [Pointer, number]) => number;
    "GetComputerNameExA": (...args: [number, Pointer, Pointer]) => number;
    "GetComputerNameExW": (...args: [number, Pointer, Pointer]) => number;
    "SetComputerNameExW": (...args: [number, Pointer]) => number;
    "SetSystemTime": (...args: [Pointer]) => number;
    "GetVersionExA": (...args: [Pointer]) => number;
    "GetVersionExW": (...args: [Pointer]) => number;
    "GetLogicalProcessorInformation": (...args: [Pointer, Pointer]) => number;
    "GetLogicalProcessorInformationEx": (...args: [number, Pointer, Pointer]) => number;
    "GetNativeSystemInfo": (...args: [Pointer]) => void;
    "GetSystemTimePreciseAsFileTime": (...args: [Pointer]) => void;
    "GetProductInfo": (...args: [number, number, number, number, Pointer]) => number;
    "VerSetConditionMask": (...args: [bigint, number, number]) => bigint;
    "EnumSystemFirmwareTables": (...args: [number, Pointer, number]) => number;
    "GetSystemFirmwareTable": (...args: [number, number, Pointer, number]) => number;
    "DnsHostnameToComputerNameExW": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetPhysicallyInstalledSystemMemory": (...args: [Pointer]) => number;
    "SetComputerNameEx2W": (...args: [number, number, Pointer]) => number;
    "SetSystemTimeAdjustment": (...args: [number, number]) => number;
    "GetProcessorSystemCycleTime": (...args: [number, Pointer, Pointer]) => number;
    "SetComputerNameA": (...args: [Pointer]) => number;
    "SetComputerNameW": (...args: [Pointer]) => number;
    "SetComputerNameExA": (...args: [number, Pointer]) => number;
    "GetRuntimeAttestationReport": (...args: [Pointer, number, bigint, Pointer, Pointer]) => number;
    "GetSystemCpuSetInformation": (...args: [Pointer, number, Pointer, Pointer, number]) => number;
    "GetSystemWow64DirectoryA": (...args: [Pointer, number]) => number;
    "GetSystemWow64DirectoryW": (...args: [Pointer, number]) => number;
    "IsWow64GuestMachineSupported": (...args: [number, Pointer]) => number;
    "GlobalMemoryStatus": (...args: [Pointer]) => void;
    "GetSystemDEPPolicy": (...args: []) => number;
    "GetFirmwareType": (...args: [Pointer]) => number;
    "VerifyVersionInfoA": (...args: [Pointer, number, bigint]) => number;
    "VerifyVersionInfoW": (...args: [Pointer, number, bigint]) => number;
    "GetProcessWorkingSetSize": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetProcessWorkingSetSize": (...args: [Pointer, number, number]) => number;
    "FlsAlloc": (...args: [Pointer]) => number;
    "FlsGetValue": (...args: [number]) => Pointer;
    "FlsSetValue": (...args: [number, Pointer]) => number;
    "FlsFree": (...args: [number]) => number;
    "IsThreadAFiber": (...args: []) => number;
    "FlsGetValue2": (...args: [number]) => Pointer;
    "InitializeSRWLock": (...args: [Pointer]) => void;
    "ReleaseSRWLockExclusive": (...args: [Pointer]) => void;
    "ReleaseSRWLockShared": (...args: [Pointer]) => void;
    "AcquireSRWLockExclusive": (...args: [Pointer]) => void;
    "AcquireSRWLockShared": (...args: [Pointer]) => void;
    "TryAcquireSRWLockExclusive": (...args: [Pointer]) => number;
    "TryAcquireSRWLockShared": (...args: [Pointer]) => number;
    "InitializeCriticalSection": (...args: [Pointer]) => void;
    "EnterCriticalSection": (...args: [Pointer]) => void;
    "LeaveCriticalSection": (...args: [Pointer]) => void;
    "InitializeCriticalSectionAndSpinCount": (...args: [Pointer, number]) => number;
    "InitializeCriticalSectionEx": (...args: [Pointer, number, number]) => number;
    "SetCriticalSectionSpinCount": (...args: [Pointer, number]) => number;
    "TryEnterCriticalSection": (...args: [Pointer]) => number;
    "DeleteCriticalSection": (...args: [Pointer]) => void;
    "InitOnceInitialize": (...args: [Pointer]) => void;
    "InitOnceExecuteOnce": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "InitOnceBeginInitialize": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "InitOnceComplete": (...args: [Pointer, number, Pointer]) => number;
    "InitializeConditionVariable": (...args: [Pointer]) => void;
    "WakeConditionVariable": (...args: [Pointer]) => void;
    "WakeAllConditionVariable": (...args: [Pointer]) => void;
    "SleepConditionVariableCS": (...args: [Pointer, Pointer, number]) => number;
    "SleepConditionVariableSRW": (...args: [Pointer, Pointer, number, number]) => number;
    "SetEvent": (...args: [Pointer]) => number;
    "ResetEvent": (...args: [Pointer]) => number;
    "ReleaseSemaphore": (...args: [Pointer, number, Pointer]) => number;
    "ReleaseMutex": (...args: [Pointer]) => number;
    "WaitForSingleObject": (...args: [Pointer, number]) => number;
    "SleepEx": (...args: [number, number]) => number;
    "WaitForSingleObjectEx": (...args: [Pointer, number, number]) => number;
    "WaitForMultipleObjectsEx": (...args: [number, Pointer, number, number, number]) => number;
    "CreateMutexA": (...args: [Pointer, number, Pointer]) => Pointer;
    "CreateMutexW": (...args: [Pointer, number, Pointer]) => Pointer;
    "OpenMutexW": (...args: [number, number, Pointer]) => Pointer;
    "CreateEventA": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "CreateEventW": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "OpenEventA": (...args: [number, number, Pointer]) => Pointer;
    "OpenEventW": (...args: [number, number, Pointer]) => Pointer;
    "OpenSemaphoreW": (...args: [number, number, Pointer]) => Pointer;
    "OpenWaitableTimerW": (...args: [number, number, Pointer]) => Pointer;
    "SetWaitableTimerEx": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, number]) => number;
    "SetWaitableTimer": (...args: [Pointer, Pointer, number, Pointer, Pointer, number]) => number;
    "CancelWaitableTimer": (...args: [Pointer]) => number;
    "CreateMutexExA": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "CreateMutexExW": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "CreateEventExA": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "CreateEventExW": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "CreateSemaphoreExW": (...args: [Pointer, number, number, Pointer, number, number]) => Pointer;
    "CreateWaitableTimerExW": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "EnterSynchronizationBarrier": (...args: [Pointer, number]) => number;
    "InitializeSynchronizationBarrier": (...args: [Pointer, number, number]) => number;
    "DeleteSynchronizationBarrier": (...args: [Pointer]) => number;
    "Sleep": (...args: [number]) => void;
    "WaitForMultipleObjects": (...args: [number, Pointer, number, number]) => number;
    "CreateSemaphoreW": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "CreateWaitableTimerW": (...args: [Pointer, number, Pointer]) => Pointer;
    "InitializeSListHead": (...args: [Pointer]) => void;
    "InterlockedPopEntrySList": (...args: [Pointer]) => Pointer;
    "InterlockedPushEntrySList": (...args: [Pointer, Pointer]) => Pointer;
    "InterlockedPushListSListEx": (...args: [Pointer, Pointer, Pointer, number]) => Pointer;
    "InterlockedFlushSList": (...args: [Pointer]) => Pointer;
    "QueryDepthSList": (...args: [Pointer]) => number;
    "QueueUserAPC": (...args: [Pointer, Pointer, number]) => number;
    "QueueUserAPC2": (...args: [Pointer, Pointer, number, number]) => number;
    "GetProcessTimes": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetCurrentProcess": (...args: []) => Pointer;
    "GetCurrentProcessId": (...args: []) => number;
    "ExitProcess": (...args: [number]) => void;
    "TerminateProcess": (...args: [Pointer, number]) => number;
    "GetExitCodeProcess": (...args: [Pointer, Pointer]) => number;
    "SwitchToThread": (...args: []) => number;
    "CreateThread": (...args: [Pointer, number, Pointer, Pointer, number, Pointer]) => Pointer;
    "CreateRemoteThread": (...args: [Pointer, Pointer, number, Pointer, Pointer, number, Pointer]) => Pointer;
    "GetCurrentThread": (...args: []) => Pointer;
    "GetCurrentThreadId": (...args: []) => number;
    "OpenThread": (...args: [number, number, number]) => Pointer;
    "SetThreadPriority": (...args: [Pointer, number]) => number;
    "SetThreadPriorityBoost": (...args: [Pointer, number]) => number;
    "GetThreadPriorityBoost": (...args: [Pointer, Pointer]) => number;
    "GetThreadPriority": (...args: [Pointer]) => number;
    "ExitThread": (...args: [number]) => void;
    "TerminateThread": (...args: [Pointer, number]) => number;
    "GetExitCodeThread": (...args: [Pointer, Pointer]) => number;
    "SuspendThread": (...args: [Pointer]) => number;
    "ResumeThread": (...args: [Pointer]) => number;
    "TlsAlloc": (...args: []) => number;
    "TlsGetValue": (...args: [number]) => Pointer;
    "TlsSetValue": (...args: [number, Pointer]) => number;
    "TlsFree": (...args: [number]) => number;
    "CreateProcessA": (...args: [Pointer, Pointer, Pointer, Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "CreateProcessW": (...args: [Pointer, Pointer, Pointer, Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetProcessShutdownParameters": (...args: [number, number]) => number;
    "GetProcessVersion": (...args: [number]) => number;
    "GetStartupInfoW": (...args: [Pointer]) => void;
    "SetPriorityClass": (...args: [Pointer, number]) => number;
    "GetPriorityClass": (...args: [Pointer]) => number;
    "SetThreadStackGuarantee": (...args: [Pointer]) => number;
    "GetProcessId": (...args: [Pointer]) => number;
    "GetThreadId": (...args: [Pointer]) => number;
    "FlushProcessWriteBuffers": (...args: []) => void;
    "GetProcessIdOfThread": (...args: [Pointer]) => number;
    "InitializeProcThreadAttributeList": (...args: [Pointer, number, number, Pointer]) => number;
    "DeleteProcThreadAttributeList": (...args: [Pointer]) => void;
    "UpdateProcThreadAttribute": (...args: [Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "SetProcessDynamicEHContinuationTargets": (...args: [Pointer, number, Pointer]) => number;
    "SetProcessDynamicEnforcedCetCompatibleRanges": (...args: [Pointer, number, Pointer]) => number;
    "SetProcessAffinityUpdateMode": (...args: [Pointer, number]) => number;
    "QueryProcessAffinityUpdateMode": (...args: [Pointer, Pointer]) => number;
    "CreateRemoteThreadEx": (...args: [Pointer, Pointer, number, Pointer, Pointer, number, Pointer, Pointer]) => Pointer;
    "GetCurrentThreadStackLimits": (...args: [Pointer, Pointer]) => void;
    "GetProcessMitigationPolicy": (...args: [Pointer, number, Pointer, number]) => number;
    "SetProcessMitigationPolicy": (...args: [number, Pointer, number]) => number;
    "GetThreadTimes": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "OpenProcess": (...args: [number, number, number]) => Pointer;
    "IsProcessorFeaturePresent": (...args: [number]) => number;
    "GetProcessHandleCount": (...args: [Pointer, Pointer]) => number;
    "GetCurrentProcessorNumber": (...args: []) => number;
    "SetThreadIdealProcessorEx": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetThreadIdealProcessorEx": (...args: [Pointer, Pointer]) => number;
    "GetCurrentProcessorNumberEx": (...args: [Pointer]) => void;
    "GetProcessPriorityBoost": (...args: [Pointer, Pointer]) => number;
    "SetProcessPriorityBoost": (...args: [Pointer, number]) => number;
    "GetThreadIOPendingFlag": (...args: [Pointer, Pointer]) => number;
    "GetSystemTimes": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetThreadInformation": (...args: [Pointer, number, Pointer, number]) => number;
    "SetThreadInformation": (...args: [Pointer, number, Pointer, number]) => number;
    "IsProcessCritical": (...args: [Pointer, Pointer]) => number;
    "SetProtectedPolicy": (...args: [Pointer, number, Pointer]) => number;
    "QueryProtectedPolicy": (...args: [Pointer, Pointer]) => number;
    "SetThreadIdealProcessor": (...args: [Pointer, number]) => number;
    "SetProcessInformation": (...args: [Pointer, number, Pointer, number]) => number;
    "GetProcessInformation": (...args: [Pointer, number, Pointer, number]) => number;
    "GetProcessDefaultCpuSets": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetProcessDefaultCpuSets": (...args: [Pointer, Pointer, number]) => number;
    "GetThreadSelectedCpuSets": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetThreadSelectedCpuSets": (...args: [Pointer, Pointer, number]) => number;
    "GetProcessShutdownParameters": (...args: [Pointer, Pointer]) => number;
    "GetProcessDefaultCpuSetMasks": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetProcessDefaultCpuSetMasks": (...args: [Pointer, Pointer, number]) => number;
    "GetThreadSelectedCpuSetMasks": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetThreadSelectedCpuSetMasks": (...args: [Pointer, Pointer, number]) => number;
    "GetMachineTypeAttributes": (...args: [number, Pointer]) => number;
    "SetThreadDescription": (...args: [Pointer, Pointer]) => number;
    "GetThreadDescription": (...args: [Pointer, Pointer]) => number;
    "TlsGetValue2": (...args: [number]) => Pointer;
    "QueueUserWorkItem": (...args: [Pointer, Pointer, number]) => number;
    "UnregisterWaitEx": (...args: [Pointer, Pointer]) => number;
    "CreateTimerQueue": (...args: []) => Pointer;
    "CreateTimerQueueTimer": (...args: [Pointer, Pointer, Pointer, Pointer, number, number, number]) => number;
    "ChangeTimerQueueTimer": (...args: [Pointer, Pointer, number, number]) => number;
    "DeleteTimerQueueTimer": (...args: [Pointer, Pointer, Pointer]) => number;
    "DeleteTimerQueue": (...args: [Pointer]) => number;
    "DeleteTimerQueueEx": (...args: [Pointer, Pointer]) => number;
    "CreateThreadpool": (...args: [Pointer]) => number;
    "SetThreadpoolThreadMaximum": (...args: [number, number]) => void;
    "SetThreadpoolThreadMinimum": (...args: [number, number]) => number;
    "SetThreadpoolStackInformation": (...args: [number, Pointer]) => number;
    "QueryThreadpoolStackInformation": (...args: [number, Pointer]) => number;
    "CloseThreadpool": (...args: [number]) => void;
    "CreateThreadpoolCleanupGroup": (...args: []) => number;
    "CloseThreadpoolCleanupGroupMembers": (...args: [number, number, Pointer]) => void;
    "CloseThreadpoolCleanupGroup": (...args: [number]) => void;
    "SetEventWhenCallbackReturns": (...args: [number, Pointer]) => void;
    "ReleaseSemaphoreWhenCallbackReturns": (...args: [number, Pointer, number]) => void;
    "ReleaseMutexWhenCallbackReturns": (...args: [number, Pointer]) => void;
    "LeaveCriticalSectionWhenCallbackReturns": (...args: [number, Pointer]) => void;
    "FreeLibraryWhenCallbackReturns": (...args: [number, Pointer]) => void;
    "CallbackMayRunLong": (...args: [number]) => number;
    "DisassociateCurrentThreadFromCallback": (...args: [number]) => void;
    "TrySubmitThreadpoolCallback": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateThreadpoolWork": (...args: [Pointer, Pointer, Pointer]) => number;
    "SubmitThreadpoolWork": (...args: [number]) => void;
    "WaitForThreadpoolWorkCallbacks": (...args: [number, number]) => void;
    "CloseThreadpoolWork": (...args: [number]) => void;
    "CreateThreadpoolTimer": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetThreadpoolTimer": (...args: [number, Pointer, number, number]) => void;
    "IsThreadpoolTimerSet": (...args: [number]) => number;
    "WaitForThreadpoolTimerCallbacks": (...args: [number, number]) => void;
    "CloseThreadpoolTimer": (...args: [number]) => void;
    "CreateThreadpoolWait": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetThreadpoolWait": (...args: [number, Pointer, Pointer]) => void;
    "WaitForThreadpoolWaitCallbacks": (...args: [number, number]) => void;
    "CloseThreadpoolWait": (...args: [number]) => void;
    "CreateThreadpoolIo": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "StartThreadpoolIo": (...args: [number]) => void;
    "CancelThreadpoolIo": (...args: [number]) => void;
    "WaitForThreadpoolIoCallbacks": (...args: [number, number]) => void;
    "CloseThreadpoolIo": (...args: [number]) => void;
    "SetThreadpoolTimerEx": (...args: [number, Pointer, number, number]) => number;
    "SetThreadpoolWaitEx": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "IsWow64Process": (...args: [Pointer, Pointer]) => number;
    "IsWow64Process2": (...args: [Pointer, Pointer, Pointer]) => number;
    "Wow64SuspendThread": (...args: [Pointer]) => number;
    "CreatePrivateNamespaceW": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "OpenPrivateNamespaceW": (...args: [Pointer, Pointer]) => Pointer;
    "ClosePrivateNamespace": (...args: [Pointer, number]) => number;
    "CreateBoundaryDescriptorW": (...args: [Pointer, number]) => Pointer;
    "AddSIDToBoundaryDescriptor": (...args: [Pointer, Pointer]) => number;
    "DeleteBoundaryDescriptor": (...args: [Pointer]) => void;
    "GetNumaHighestNodeNumber": (...args: [Pointer]) => number;
    "GetNumaNodeProcessorMaskEx": (...args: [number, Pointer]) => number;
    "GetNumaNodeProcessorMask2": (...args: [number, Pointer, number, Pointer]) => number;
    "GetNumaProximityNodeEx": (...args: [number, Pointer]) => number;
    "GetProcessGroupAffinity": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetThreadGroupAffinity": (...args: [Pointer, Pointer]) => number;
    "SetThreadGroupAffinity": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetProcessAffinityMask": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetProcessAffinityMask": (...args: [Pointer, number]) => number;
    "GetProcessIoCounters": (...args: [Pointer, Pointer]) => number;
    "SwitchToFiber": (...args: [Pointer]) => void;
    "DeleteFiber": (...args: [Pointer]) => void;
    "ConvertFiberToThread": (...args: []) => number;
    "CreateFiberEx": (...args: [number, number, number, Pointer, Pointer]) => Pointer;
    "ConvertThreadToFiberEx": (...args: [Pointer, number]) => Pointer;
    "CreateFiber": (...args: [number, Pointer, Pointer]) => Pointer;
    "ConvertThreadToFiber": (...args: [Pointer]) => Pointer;
    "CreateUmsCompletionList": (...args: [Pointer]) => number;
    "DequeueUmsCompletionListItems": (...args: [Pointer, number, Pointer]) => number;
    "GetUmsCompletionListEvent": (...args: [Pointer, Pointer]) => number;
    "ExecuteUmsThread": (...args: [Pointer]) => number;
    "UmsThreadYield": (...args: [Pointer]) => number;
    "DeleteUmsCompletionList": (...args: [Pointer]) => number;
    "GetCurrentUmsThread": (...args: []) => Pointer;
    "GetNextUmsListItem": (...args: [Pointer]) => Pointer;
    "QueryUmsThreadInformation": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetUmsThreadInformation": (...args: [Pointer, number, Pointer, number]) => number;
    "DeleteUmsThreadContext": (...args: [Pointer]) => number;
    "CreateUmsThreadContext": (...args: [Pointer]) => number;
    "EnterUmsSchedulingMode": (...args: [Pointer]) => number;
    "GetUmsSystemThreadInformation": (...args: [Pointer, Pointer]) => number;
    "SetThreadAffinityMask": (...args: [Pointer, number]) => number;
    "SetProcessDEPPolicy": (...args: [number]) => number;
    "GetProcessDEPPolicy": (...args: [Pointer, Pointer, Pointer]) => number;
    "PulseEvent": (...args: [Pointer]) => number;
    "WinExec": (...args: [Pointer, number]) => number;
    "SignalObjectAndWait": (...args: [Pointer, Pointer, number, number]) => number;
    "CreateSemaphoreA": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "CreateWaitableTimerA": (...args: [Pointer, number, Pointer]) => Pointer;
    "OpenWaitableTimerA": (...args: [number, number, Pointer]) => Pointer;
    "CreateSemaphoreExA": (...args: [Pointer, number, number, Pointer, number, number]) => Pointer;
    "CreateWaitableTimerExA": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "QueryFullProcessImageNameA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "QueryFullProcessImageNameW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetStartupInfoA": (...args: [Pointer]) => void;
    "RegisterWaitForSingleObject": (...args: [Pointer, Pointer, Pointer, Pointer, number, number]) => number;
    "UnregisterWait": (...args: [Pointer]) => number;
    "SetTimerQueueTimer": (...args: [Pointer, Pointer, Pointer, number, number, number]) => Pointer;
    "CancelTimerQueueTimer": (...args: [Pointer, Pointer]) => number;
    "CreatePrivateNamespaceA": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "OpenPrivateNamespaceA": (...args: [Pointer, Pointer]) => Pointer;
    "CreateBoundaryDescriptorA": (...args: [Pointer, number]) => Pointer;
    "AddIntegrityLabelToBoundaryDescriptor": (...args: [Pointer, Pointer]) => number;
    "GetActiveProcessorGroupCount": (...args: []) => number;
    "GetMaximumProcessorGroupCount": (...args: []) => number;
    "GetActiveProcessorCount": (...args: [number]) => number;
    "GetMaximumProcessorCount": (...args: [number]) => number;
    "GetNumaProcessorNode": (...args: [number, Pointer]) => number;
    "GetNumaNodeNumberFromHandle": (...args: [Pointer, Pointer]) => number;
    "GetNumaProcessorNodeEx": (...args: [Pointer, Pointer]) => number;
    "GetNumaNodeProcessorMask": (...args: [number, Pointer]) => number;
    "GetNumaAvailableMemoryNode": (...args: [number, Pointer]) => number;
    "GetNumaAvailableMemoryNodeEx": (...args: [number, Pointer]) => number;
    "GetNumaProximityNode": (...args: [number, Pointer]) => number;
    "ClearCommBreak": (...args: [Pointer]) => number;
    "ClearCommError": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupComm": (...args: [Pointer, number, number]) => number;
    "EscapeCommFunction": (...args: [Pointer, number]) => number;
    "GetCommConfig": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetCommMask": (...args: [Pointer, Pointer]) => number;
    "GetCommProperties": (...args: [Pointer, Pointer]) => number;
    "GetCommModemStatus": (...args: [Pointer, Pointer]) => number;
    "GetCommState": (...args: [Pointer, Pointer]) => number;
    "GetCommTimeouts": (...args: [Pointer, Pointer]) => number;
    "PurgeComm": (...args: [Pointer, number]) => number;
    "SetCommBreak": (...args: [Pointer]) => number;
    "SetCommConfig": (...args: [Pointer, Pointer, number]) => number;
    "SetCommMask": (...args: [Pointer, number]) => number;
    "SetCommState": (...args: [Pointer, Pointer]) => number;
    "SetCommTimeouts": (...args: [Pointer, Pointer]) => number;
    "TransmitCommChar": (...args: [Pointer, number]) => number;
    "WaitCommEvent": (...args: [Pointer, Pointer, Pointer]) => number;
    "BuildCommDCBA": (...args: [Pointer, Pointer]) => number;
    "BuildCommDCBW": (...args: [Pointer, Pointer]) => number;
    "BuildCommDCBAndTimeoutsA": (...args: [Pointer, Pointer, Pointer]) => number;
    "BuildCommDCBAndTimeoutsW": (...args: [Pointer, Pointer, Pointer]) => number;
    "CommConfigDialogA": (...args: [Pointer, Pointer, Pointer]) => number;
    "CommConfigDialogW": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetDefaultCommConfigA": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetDefaultCommConfigW": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetDefaultCommConfigA": (...args: [Pointer, Pointer, number]) => number;
    "SetDefaultCommConfigW": (...args: [Pointer, Pointer, number]) => number;
    "GetAppContainerNamedObjectPath": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "AllocConsole": (...args: []) => number;
    "AllocConsoleWithOptions": (...args: [Pointer, Pointer]) => number;
    "FreeConsole": (...args: []) => number;
    "AttachConsole": (...args: [number]) => number;
    "GetConsoleCP": (...args: []) => number;
    "GetConsoleOutputCP": (...args: []) => number;
    "GetConsoleMode": (...args: [Pointer, Pointer]) => number;
    "SetConsoleMode": (...args: [Pointer, number]) => number;
    "GetNumberOfConsoleInputEvents": (...args: [Pointer, Pointer]) => number;
    "ReadConsoleInputA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "ReadConsoleInputW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "PeekConsoleInputA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "PeekConsoleInputW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "ReadConsoleA": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "ReadConsoleW": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "WriteConsoleA": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "WriteConsoleW": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetConsoleCtrlHandler": (...args: [Pointer, number]) => number;
    "CreatePseudoConsole": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "ResizePseudoConsole": (...args: [number, Pointer]) => number;
    "ClosePseudoConsole": (...args: [number]) => void;
    "ReleasePseudoConsole": (...args: [number]) => number;
    "FillConsoleOutputCharacterA": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "FillConsoleOutputCharacterW": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "FillConsoleOutputAttribute": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "GenerateConsoleCtrlEvent": (...args: [number, number]) => number;
    "CreateConsoleScreenBuffer": (...args: [number, number, Pointer, number, Pointer]) => Pointer;
    "SetConsoleActiveScreenBuffer": (...args: [Pointer]) => number;
    "FlushConsoleInputBuffer": (...args: [Pointer]) => number;
    "SetConsoleCP": (...args: [number]) => number;
    "SetConsoleOutputCP": (...args: [number]) => number;
    "GetConsoleCursorInfo": (...args: [Pointer, Pointer]) => number;
    "SetConsoleCursorInfo": (...args: [Pointer, Pointer]) => number;
    "GetConsoleScreenBufferInfo": (...args: [Pointer, Pointer]) => number;
    "GetConsoleScreenBufferInfoEx": (...args: [Pointer, Pointer]) => number;
    "SetConsoleScreenBufferInfoEx": (...args: [Pointer, Pointer]) => number;
    "SetConsoleScreenBufferSize": (...args: [Pointer, Pointer]) => number;
    "SetConsoleCursorPosition": (...args: [Pointer, Pointer]) => number;
    "GetLargestConsoleWindowSize": (...args: [Pointer]) => Pointer;
    "SetConsoleTextAttribute": (...args: [Pointer, number]) => number;
    "SetConsoleWindowInfo": (...args: [Pointer, number, Pointer]) => number;
    "WriteConsoleOutputCharacterA": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "WriteConsoleOutputCharacterW": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "WriteConsoleOutputAttribute": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "ReadConsoleOutputCharacterA": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "ReadConsoleOutputCharacterW": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "ReadConsoleOutputAttribute": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "WriteConsoleInputA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "WriteConsoleInputW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "ScrollConsoleScreenBufferA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "ScrollConsoleScreenBufferW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "WriteConsoleOutputA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "WriteConsoleOutputW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "ReadConsoleOutputA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "ReadConsoleOutputW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetConsoleTitleA": (...args: [Pointer, number]) => number;
    "GetConsoleTitleW": (...args: [Pointer, number]) => number;
    "GetConsoleOriginalTitleA": (...args: [Pointer, number]) => number;
    "GetConsoleOriginalTitleW": (...args: [Pointer, number]) => number;
    "SetConsoleTitleA": (...args: [Pointer]) => number;
    "SetConsoleTitleW": (...args: [Pointer]) => number;
    "GetNumberOfConsoleMouseButtons": (...args: [Pointer]) => number;
    "GetConsoleFontSize": (...args: [Pointer, number]) => Pointer;
    "GetCurrentConsoleFont": (...args: [Pointer, number, Pointer]) => number;
    "GetCurrentConsoleFontEx": (...args: [Pointer, number, Pointer]) => number;
    "SetCurrentConsoleFontEx": (...args: [Pointer, number, Pointer]) => number;
    "GetConsoleSelectionInfo": (...args: [Pointer]) => number;
    "GetConsoleHistoryInfo": (...args: [Pointer]) => number;
    "SetConsoleHistoryInfo": (...args: [Pointer]) => number;
    "GetConsoleDisplayMode": (...args: [Pointer]) => number;
    "SetConsoleDisplayMode": (...args: [Pointer, number, Pointer]) => number;
    "GetConsoleWindow": (...args: []) => Pointer;
    "AddConsoleAliasA": (...args: [Pointer, Pointer, Pointer]) => number;
    "AddConsoleAliasW": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetConsoleAliasA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetConsoleAliasW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetConsoleAliasesLengthA": (...args: [Pointer]) => number;
    "GetConsoleAliasesLengthW": (...args: [Pointer]) => number;
    "GetConsoleAliasExesLengthA": (...args: []) => number;
    "GetConsoleAliasExesLengthW": (...args: []) => number;
    "GetConsoleAliasesA": (...args: [Pointer, number, Pointer]) => number;
    "GetConsoleAliasesW": (...args: [Pointer, number, Pointer]) => number;
    "GetConsoleAliasExesA": (...args: [Pointer, number]) => number;
    "GetConsoleAliasExesW": (...args: [Pointer, number]) => number;
    "ExpungeConsoleCommandHistoryA": (...args: [Pointer]) => void;
    "ExpungeConsoleCommandHistoryW": (...args: [Pointer]) => void;
    "SetConsoleNumberOfCommandsA": (...args: [number, Pointer]) => number;
    "SetConsoleNumberOfCommandsW": (...args: [number, Pointer]) => number;
    "GetConsoleCommandHistoryLengthA": (...args: [Pointer]) => number;
    "GetConsoleCommandHistoryLengthW": (...args: [Pointer]) => number;
    "GetConsoleCommandHistoryA": (...args: [Pointer, number, Pointer]) => number;
    "GetConsoleCommandHistoryW": (...args: [Pointer, number, Pointer]) => number;
    "GetConsoleProcessList": (...args: [Pointer, number]) => number;
    "InvalidateConsoleDIBits": (...args: [Pointer, Pointer]) => number;
    "SetLastConsoleEventActive": (...args: []) => void;
    "VDMConsoleOperation": (...args: [number, Pointer]) => number;
    "SetConsoleIcon": (...args: [Pointer]) => number;
    "SetConsoleFont": (...args: [Pointer, number]) => number;
    "GetConsoleFontInfo": (...args: [Pointer, number, number, Pointer]) => number;
    "GetNumberOfConsoleFonts": (...args: []) => number;
    "SetConsoleCursor": (...args: [Pointer, Pointer]) => number;
    "ShowConsoleCursor": (...args: [Pointer, number]) => number;
    "ConsoleMenuControl": (...args: [Pointer, number, number]) => Pointer;
    "SetConsolePalette": (...args: [Pointer, Pointer, number]) => number;
    "RegisterConsoleVDM": (...args: [number, Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetConsoleHardwareState": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetConsoleHardwareState": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetConsoleKeyShortcuts": (...args: [number, number, Pointer, number]) => number;
    "SetConsoleMenuClose": (...args: [number]) => number;
    "GetConsoleInputExeNameA": (...args: [number, Pointer]) => number;
    "GetConsoleInputExeNameW": (...args: [number, Pointer]) => number;
    "SetConsoleInputExeNameA": (...args: [Pointer]) => number;
    "SetConsoleInputExeNameW": (...args: [Pointer]) => number;
    "ReadConsoleInputExA": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "ReadConsoleInputExW": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "WriteConsoleInputVDMA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "WriteConsoleInputVDMW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetConsoleNlsMode": (...args: [Pointer, Pointer]) => number;
    "SetConsoleNlsMode": (...args: [Pointer, number]) => number;
    "GetConsoleCharType": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetConsoleLocalEUDC": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "SetConsoleCursorMode": (...args: [Pointer, number, number]) => number;
    "GetConsoleCursorMode": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegisterConsoleOS2": (...args: [number]) => number;
    "SetConsoleOS2OemFormat": (...args: [number]) => number;
    "RegisterConsoleIME": (...args: [Pointer, Pointer]) => number;
    "UnregisterConsoleIME": (...args: []) => number;
    "OpenConsoleW": (...args: [Pointer, number, number, number]) => Pointer;
    "DuplicateConsoleHandle": (...args: [Pointer, number, number, number]) => Pointer;
    "CloseConsoleHandle": (...args: [Pointer]) => number;
    "VerifyConsoleIoHandle": (...args: [Pointer]) => number;
    "GetConsoleInputWaitHandle": (...args: []) => Pointer;
    "GetStdHandle": (...args: [number]) => Pointer;
    "SetStdHandle": (...args: [number, Pointer]) => number;
    "SetStdHandleEx": (...args: [number, Pointer, Pointer]) => number;
    "GlobalDeleteAtom": (...args: [number]) => number;
    "InitAtomTable": (...args: [number]) => number;
    "DeleteAtom": (...args: [number]) => number;
    "GlobalAddAtomA": (...args: [Pointer]) => number;
    "GlobalAddAtomW": (...args: [Pointer]) => number;
    "GlobalAddAtomExA": (...args: [Pointer, number]) => number;
    "GlobalAddAtomExW": (...args: [Pointer, number]) => number;
    "GlobalFindAtomA": (...args: [Pointer]) => number;
    "GlobalFindAtomW": (...args: [Pointer]) => number;
    "GlobalGetAtomNameA": (...args: [number, Pointer, number]) => number;
    "GlobalGetAtomNameW": (...args: [number, Pointer, number]) => number;
    "AddAtomA": (...args: [Pointer]) => number;
    "AddAtomW": (...args: [Pointer]) => number;
    "FindAtomA": (...args: [Pointer]) => number;
    "FindAtomW": (...args: [Pointer]) => number;
    "GetAtomNameA": (...args: [number, Pointer, number]) => number;
    "GetAtomNameW": (...args: [number, Pointer, number]) => number;
    "PssCaptureSnapshot": (...args: [Pointer, number, number, Pointer]) => number;
    "PssFreeSnapshot": (...args: [Pointer, Pointer]) => number;
    "PssQuerySnapshot": (...args: [Pointer, number, Pointer, number]) => number;
    "PssWalkSnapshot": (...args: [Pointer, number, Pointer, Pointer, number]) => number;
    "PssDuplicateSnapshot": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "PssWalkMarkerCreate": (...args: [Pointer, Pointer]) => number;
    "PssWalkMarkerFree": (...args: [Pointer]) => number;
    "PssWalkMarkerGetPosition": (...args: [Pointer, Pointer]) => number;
    "PssWalkMarkerSetPosition": (...args: [Pointer, number]) => number;
    "PssWalkMarkerSeekToBeginning": (...args: [Pointer]) => number;
    "CreateToolhelp32Snapshot": (...args: [number, number]) => Pointer;
    "Heap32ListFirst": (...args: [Pointer, Pointer]) => number;
    "Heap32ListNext": (...args: [Pointer, Pointer]) => number;
    "Heap32First": (...args: [Pointer, number, number]) => number;
    "Heap32Next": (...args: [Pointer]) => number;
    "Toolhelp32ReadProcessMemory": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "Process32FirstW": (...args: [Pointer, Pointer]) => number;
    "Process32NextW": (...args: [Pointer, Pointer]) => number;
    "Process32First": (...args: [Pointer, Pointer]) => number;
    "Process32Next": (...args: [Pointer, Pointer]) => number;
    "Thread32First": (...args: [Pointer, Pointer]) => number;
    "Thread32Next": (...args: [Pointer, Pointer]) => number;
    "Module32FirstW": (...args: [Pointer, Pointer]) => number;
    "Module32NextW": (...args: [Pointer, Pointer]) => number;
    "Module32First": (...args: [Pointer, Pointer]) => number;
    "Module32Next": (...args: [Pointer, Pointer]) => number;
    "SetEnvironmentStringsW": (...args: [Pointer]) => number;
    "GetCommandLineA": (...args: []) => Pointer;
    "GetCommandLineW": (...args: []) => Pointer;
    "GetEnvironmentStrings": (...args: []) => Pointer;
    "GetEnvironmentStringsW": (...args: []) => Pointer;
    "FreeEnvironmentStringsA": (...args: [Pointer]) => number;
    "FreeEnvironmentStringsW": (...args: [Pointer]) => number;
    "GetEnvironmentVariableA": (...args: [Pointer, Pointer, number]) => number;
    "GetEnvironmentVariableW": (...args: [Pointer, Pointer, number]) => number;
    "SetEnvironmentVariableA": (...args: [Pointer, Pointer]) => number;
    "SetEnvironmentVariableW": (...args: [Pointer, Pointer]) => number;
    "ExpandEnvironmentStringsA": (...args: [Pointer, Pointer, number]) => number;
    "ExpandEnvironmentStringsW": (...args: [Pointer, Pointer, number]) => number;
    "SetCurrentDirectoryA": (...args: [Pointer]) => number;
    "SetCurrentDirectoryW": (...args: [Pointer]) => number;
    "GetCurrentDirectoryA": (...args: [number, Pointer]) => number;
    "GetCurrentDirectoryW": (...args: [number, Pointer]) => number;
    "NeedCurrentDirectoryForExePathA": (...args: [Pointer]) => number;
    "NeedCurrentDirectoryForExePathW": (...args: [Pointer]) => number;
    "IsEnclaveTypeSupported": (...args: [number]) => number;
    "CreateEnclave": (...args: [Pointer, Pointer, number, number, number, Pointer, number, Pointer]) => Pointer;
    "LoadEnclaveData": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "InitializeEnclave": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "WerRegisterFile": (...args: [Pointer, number, number]) => number;
    "WerUnregisterFile": (...args: [Pointer]) => number;
    "WerRegisterMemoryBlock": (...args: [Pointer, number]) => number;
    "WerUnregisterMemoryBlock": (...args: [Pointer]) => number;
    "WerRegisterExcludedMemoryBlock": (...args: [Pointer, number]) => number;
    "WerUnregisterExcludedMemoryBlock": (...args: [Pointer]) => number;
    "WerRegisterCustomMetadata": (...args: [Pointer, Pointer]) => number;
    "WerUnregisterCustomMetadata": (...args: [Pointer]) => number;
    "WerRegisterAdditionalProcess": (...args: [number, number]) => number;
    "WerUnregisterAdditionalProcess": (...args: [number]) => number;
    "WerRegisterAppLocalDump": (...args: [Pointer]) => number;
    "WerUnregisterAppLocalDump": (...args: []) => number;
    "WerSetFlags": (...args: [number]) => number;
    "WerGetFlags": (...args: [Pointer, Pointer]) => number;
    "WerRegisterRuntimeExceptionModule": (...args: [Pointer, Pointer]) => number;
    "WerUnregisterRuntimeExceptionModule": (...args: [Pointer, Pointer]) => number;
    "DisableThreadLibraryCalls": (...args: [Pointer]) => number;
    "FindResourceExW": (...args: [Pointer, Pointer, Pointer, number]) => Pointer;
    "FreeLibraryAndExitThread": (...args: [Pointer, number]) => void;
    "FreeResource": (...args: [Pointer]) => number;
    "GetModuleFileNameA": (...args: [Pointer, Pointer, number]) => number;
    "GetModuleFileNameW": (...args: [Pointer, Pointer, number]) => number;
    "GetModuleHandleA": (...args: [Pointer]) => Pointer;
    "GetModuleHandleW": (...args: [Pointer]) => Pointer;
    "GetModuleHandleExA": (...args: [number, Pointer, Pointer]) => number;
    "GetModuleHandleExW": (...args: [number, Pointer, Pointer]) => number;
    "GetProcAddress": (...args: [Pointer, Pointer]) => Pointer;
    "LoadLibraryExA": (...args: [Pointer, Pointer, number]) => Pointer;
    "LoadLibraryExW": (...args: [Pointer, Pointer, number]) => Pointer;
    "LoadResource": (...args: [Pointer, Pointer]) => Pointer;
    "LockResource": (...args: [Pointer]) => Pointer;
    "SizeofResource": (...args: [Pointer, Pointer]) => number;
    "AddDllDirectory": (...args: [Pointer]) => Pointer;
    "RemoveDllDirectory": (...args: [Pointer]) => number;
    "SetDefaultDllDirectories": (...args: [number]) => number;
    "EnumResourceLanguagesExA": (...args: [Pointer, Pointer, Pointer, Pointer, number, number, number]) => number;
    "EnumResourceLanguagesExW": (...args: [Pointer, Pointer, Pointer, Pointer, number, number, number]) => number;
    "EnumResourceNamesExA": (...args: [Pointer, Pointer, Pointer, number, number, number]) => number;
    "EnumResourceNamesExW": (...args: [Pointer, Pointer, Pointer, number, number, number]) => number;
    "EnumResourceTypesExA": (...args: [Pointer, Pointer, number, number, number]) => number;
    "EnumResourceTypesExW": (...args: [Pointer, Pointer, number, number, number]) => number;
    "FindResourceW": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "LoadLibraryA": (...args: [Pointer]) => Pointer;
    "LoadLibraryW": (...args: [Pointer]) => Pointer;
    "EnumResourceNamesW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "EnumResourceNamesA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "LoadPackagedLibrary": (...args: [Pointer, number]) => Pointer;
    "LoadModule": (...args: [Pointer, Pointer]) => number;
    "FindResourceA": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "FindResourceExA": (...args: [Pointer, Pointer, Pointer, number]) => Pointer;
    "EnumResourceTypesA": (...args: [Pointer, Pointer, number]) => number;
    "EnumResourceTypesW": (...args: [Pointer, Pointer, number]) => number;
    "EnumResourceLanguagesA": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "EnumResourceLanguagesW": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "BeginUpdateResourceA": (...args: [Pointer, number]) => Pointer;
    "BeginUpdateResourceW": (...args: [Pointer, number]) => Pointer;
    "UpdateResourceA": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "UpdateResourceW": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "EndUpdateResourceA": (...args: [Pointer, number]) => number;
    "EndUpdateResourceW": (...args: [Pointer, number]) => number;
    "SetDllDirectoryA": (...args: [Pointer]) => number;
    "SetDllDirectoryW": (...args: [Pointer]) => number;
    "GetDllDirectoryA": (...args: [number, Pointer]) => number;
    "GetDllDirectoryW": (...args: [number, Pointer]) => number;
    "HeapCreate": (...args: [number, number, number]) => Pointer;
    "HeapDestroy": (...args: [Pointer]) => number;
    "HeapAlloc": (...args: [Pointer, number, number]) => Pointer;
    "HeapReAlloc": (...args: [Pointer, number, Pointer, number]) => Pointer;
    "HeapFree": (...args: [Pointer, number, Pointer]) => number;
    "HeapSize": (...args: [Pointer, number, Pointer]) => number;
    "GetProcessHeap": (...args: []) => Pointer;
    "HeapCompact": (...args: [Pointer, number]) => number;
    "HeapSetInformation": (...args: [Pointer, number, Pointer, number]) => number;
    "HeapValidate": (...args: [Pointer, number, Pointer]) => number;
    "HeapSummary": (...args: [Pointer, number, Pointer]) => number;
    "GetProcessHeaps": (...args: [number, Pointer]) => number;
    "HeapLock": (...args: [Pointer]) => number;
    "HeapUnlock": (...args: [Pointer]) => number;
    "HeapWalk": (...args: [Pointer, Pointer]) => number;
    "HeapQueryInformation": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "VirtualAlloc": (...args: [Pointer, number, number, number]) => Pointer;
    "VirtualProtect": (...args: [Pointer, number, number, Pointer]) => number;
    "VirtualFree": (...args: [Pointer, number, number]) => number;
    "VirtualQuery": (...args: [Pointer, Pointer, number]) => number;
    "VirtualAllocEx": (...args: [Pointer, Pointer, number, number, number]) => Pointer;
    "VirtualProtectEx": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "VirtualQueryEx": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "CreateFileMappingW": (...args: [Pointer, Pointer, number, number, number, Pointer]) => Pointer;
    "OpenFileMappingW": (...args: [number, number, Pointer]) => Pointer;
    "MapViewOfFile": (...args: [Pointer, number, number, number, number]) => Pointer;
    "MapViewOfFileEx": (...args: [Pointer, number, number, number, number, Pointer]) => Pointer;
    "VirtualFreeEx": (...args: [Pointer, Pointer, number, number]) => number;
    "FlushViewOfFile": (...args: [Pointer, number]) => number;
    "UnmapViewOfFile": (...args: [Pointer]) => number;
    "GetLargePageMinimum": (...args: []) => number;
    "GetProcessWorkingSetSizeEx": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetProcessWorkingSetSizeEx": (...args: [Pointer, number, number, number]) => number;
    "VirtualLock": (...args: [Pointer, number]) => number;
    "VirtualUnlock": (...args: [Pointer, number]) => number;
    "GetWriteWatch": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "ResetWriteWatch": (...args: [Pointer, number]) => number;
    "CreateMemoryResourceNotification": (...args: [number]) => Pointer;
    "QueryMemoryResourceNotification": (...args: [Pointer, Pointer]) => number;
    "GetSystemFileCacheSize": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetSystemFileCacheSize": (...args: [number, number, number]) => number;
    "CreateFileMappingNumaW": (...args: [Pointer, Pointer, number, number, number, Pointer, number]) => Pointer;
    "PrefetchVirtualMemory": (...args: [Pointer, number, Pointer, number]) => number;
    "CreateFileMappingFromApp": (...args: [Pointer, Pointer, number, bigint, Pointer]) => Pointer;
    "MapViewOfFileFromApp": (...args: [Pointer, number, bigint, number]) => Pointer;
    "UnmapViewOfFileEx": (...args: [Pointer, number]) => number;
    "AllocateUserPhysicalPages": (...args: [Pointer, Pointer, Pointer]) => number;
    "FreeUserPhysicalPages": (...args: [Pointer, Pointer, Pointer]) => number;
    "MapUserPhysicalPages": (...args: [Pointer, number, Pointer]) => number;
    "AllocateUserPhysicalPagesNuma": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "VirtualAllocExNuma": (...args: [Pointer, Pointer, number, number, number, number]) => Pointer;
    "GetMemoryErrorHandlingCapabilities": (...args: [Pointer]) => number;
    "RegisterBadMemoryNotification": (...args: [Pointer]) => Pointer;
    "UnregisterBadMemoryNotification": (...args: [Pointer]) => number;
    "OfferVirtualMemory": (...args: [Pointer, number, number]) => number;
    "ReclaimVirtualMemory": (...args: [Pointer, number]) => number;
    "DiscardVirtualMemory": (...args: [Pointer, number]) => number;
    "RtlCompareMemory": (...args: [Pointer, Pointer, number]) => number;
    "GlobalAlloc": (...args: [number, number]) => Pointer;
    "GlobalReAlloc": (...args: [Pointer, number, number]) => Pointer;
    "GlobalSize": (...args: [Pointer]) => number;
    "GlobalUnlock": (...args: [Pointer]) => number;
    "GlobalLock": (...args: [Pointer]) => Pointer;
    "GlobalFlags": (...args: [Pointer]) => number;
    "GlobalHandle": (...args: [Pointer]) => Pointer;
    "LocalAlloc": (...args: [number, number]) => Pointer;
    "LocalReAlloc": (...args: [Pointer, number, number]) => Pointer;
    "LocalLock": (...args: [Pointer]) => Pointer;
    "LocalHandle": (...args: [Pointer]) => Pointer;
    "LocalUnlock": (...args: [Pointer]) => number;
    "LocalSize": (...args: [Pointer]) => number;
    "LocalFlags": (...args: [Pointer]) => number;
    "CreateFileMappingA": (...args: [Pointer, Pointer, number, number, number, Pointer]) => Pointer;
    "CreateFileMappingNumaA": (...args: [Pointer, Pointer, number, number, number, Pointer, number]) => Pointer;
    "OpenFileMappingA": (...args: [number, number, Pointer]) => Pointer;
    "MapViewOfFileExNuma": (...args: [Pointer, number, number, number, number, Pointer, number]) => Pointer;
    "IsBadReadPtr": (...args: [Pointer, number]) => number;
    "IsBadWritePtr": (...args: [Pointer, number]) => number;
    "IsBadCodePtr": (...args: [Pointer]) => number;
    "IsBadStringPtrA": (...args: [Pointer, number]) => number;
    "IsBadStringPtrW": (...args: [Pointer, number]) => number;
    "MapUserPhysicalPagesScatter": (...args: [Pointer, number, Pointer]) => number;
    "AddSecureMemoryCacheCallback": (...args: [Pointer]) => number;
    "RemoveSecureMemoryCacheCallback": (...args: [Pointer]) => number;
    "QueryPerformanceCounter": (...args: [Pointer]) => number;
    "QueryPerformanceFrequency": (...args: [Pointer]) => number;
    "CreatePipe": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "ConnectNamedPipe": (...args: [Pointer, Pointer]) => number;
    "DisconnectNamedPipe": (...args: [Pointer]) => number;
    "SetNamedPipeHandleState": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "PeekNamedPipe": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "TransactNamedPipe": (...args: [Pointer, Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "CreateNamedPipeW": (...args: [Pointer, number, number, number, number, number, number, Pointer]) => Pointer;
    "WaitNamedPipeW": (...args: [Pointer, number]) => number;
    "GetNamedPipeClientComputerNameW": (...args: [Pointer, Pointer, number]) => number;
    "GetNamedPipeInfo": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetNamedPipeHandleStateW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "CallNamedPipeW": (...args: [Pointer, Pointer, number, Pointer, number, Pointer, number]) => number;
    "CreateNamedPipeA": (...args: [Pointer, number, number, number, number, number, number, Pointer]) => Pointer;
    "GetNamedPipeHandleStateA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "CallNamedPipeA": (...args: [Pointer, Pointer, number, Pointer, number, Pointer, number]) => number;
    "WaitNamedPipeA": (...args: [Pointer, number]) => number;
    "GetNamedPipeClientComputerNameA": (...args: [Pointer, Pointer, number]) => number;
    "GetNamedPipeClientProcessId": (...args: [Pointer, Pointer]) => number;
    "GetNamedPipeClientSessionId": (...args: [Pointer, Pointer]) => number;
    "GetNamedPipeServerProcessId": (...args: [Pointer, Pointer]) => number;
    "GetNamedPipeServerSessionId": (...args: [Pointer, Pointer]) => number;
    "RequestWakeupLatency": (...args: [number]) => number;
    "IsSystemResumeAutomatic": (...args: []) => number;
    "SetThreadExecutionState": (...args: [number]) => number;
    "PowerCreateRequest": (...args: [Pointer]) => Pointer;
    "PowerSetRequest": (...args: [Pointer, number]) => number;
    "PowerClearRequest": (...args: [Pointer, number]) => number;
    "GetDevicePowerState": (...args: [Pointer, Pointer]) => number;
    "SetSystemPowerState": (...args: [number, number]) => number;
    "GetSystemPowerStatus": (...args: [Pointer]) => number;
    "K32EnumProcesses": (...args: [Pointer, number, Pointer]) => number;
    "K32EnumProcessModules": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "K32EnumProcessModulesEx": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "K32GetModuleBaseNameA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "K32GetModuleBaseNameW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "K32GetModuleFileNameExA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "K32GetModuleFileNameExW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "K32GetModuleInformation": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "K32EmptyWorkingSet": (...args: [Pointer]) => number;
    "K32InitializeProcessForWsWatch": (...args: [Pointer]) => number;
    "K32GetWsChanges": (...args: [Pointer, Pointer, number]) => number;
    "K32GetWsChangesEx": (...args: [Pointer, Pointer, Pointer]) => number;
    "K32GetMappedFileNameW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "K32GetMappedFileNameA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "K32EnumDeviceDrivers": (...args: [Pointer, number, Pointer]) => number;
    "K32GetDeviceDriverBaseNameA": (...args: [Pointer, Pointer, number]) => number;
    "K32GetDeviceDriverBaseNameW": (...args: [Pointer, Pointer, number]) => number;
    "K32GetDeviceDriverFileNameA": (...args: [Pointer, Pointer, number]) => number;
    "K32GetDeviceDriverFileNameW": (...args: [Pointer, Pointer, number]) => number;
    "K32QueryWorkingSet": (...args: [Pointer, Pointer, number]) => number;
    "K32QueryWorkingSetEx": (...args: [Pointer, Pointer, number]) => number;
    "K32GetProcessMemoryInfo": (...args: [Pointer, Pointer, number]) => number;
    "K32GetPerformanceInfo": (...args: [Pointer, number]) => number;
    "K32EnumPageFilesW": (...args: [Pointer, Pointer]) => number;
    "K32EnumPageFilesA": (...args: [Pointer, Pointer]) => number;
    "K32GetProcessImageFileNameA": (...args: [Pointer, Pointer, number]) => number;
    "K32GetProcessImageFileNameW": (...args: [Pointer, Pointer, number]) => number;
    "SystemTimeToTzSpecificLocalTime": (...args: [Pointer, Pointer, Pointer]) => number;
    "TzSpecificLocalTimeToSystemTime": (...args: [Pointer, Pointer, Pointer]) => number;
    "FileTimeToSystemTime": (...args: [Pointer, Pointer]) => number;
    "SystemTimeToFileTime": (...args: [Pointer, Pointer]) => number;
    "GetTimeZoneInformation": (...args: [Pointer]) => number;
    "SetTimeZoneInformation": (...args: [Pointer]) => number;
    "SetDynamicTimeZoneInformation": (...args: [Pointer]) => number;
    "GetDynamicTimeZoneInformation": (...args: [Pointer]) => number;
    "GetTimeZoneInformationForYear": (...args: [number, Pointer, Pointer]) => number;
    "SystemTimeToTzSpecificLocalTimeEx": (...args: [Pointer, Pointer, Pointer]) => number;
    "TzSpecificLocalTimeToSystemTimeEx": (...args: [Pointer, Pointer, Pointer]) => number;
    "LocalFileTimeToLocalSystemTime": (...args: [Pointer, Pointer, Pointer]) => number;
    "LocalSystemTimeToLocalFileTime": (...args: [Pointer, Pointer, Pointer]) => number;
    "uaw_lstrcmpW": (...args: [Pointer, Pointer]) => number;
    "uaw_lstrcmpiW": (...args: [Pointer, Pointer]) => number;
    "uaw_lstrlenW": (...args: [Pointer]) => number;
    "uaw_wcschr": (...args: [Pointer, number]) => Pointer;
    "uaw_wcscpy": (...args: [Pointer, Pointer]) => Pointer;
    "uaw_wcsicmp": (...args: [Pointer, Pointer]) => number;
    "uaw_wcslen": (...args: [Pointer]) => number;
    "uaw_wcsrchr": (...args: [Pointer, number]) => Pointer;
    "QueryThreadCycleTime": (...args: [Pointer, Pointer]) => number;
    "QueryProcessCycleTime": (...args: [Pointer, Pointer]) => number;
    "QueryIdleProcessorCycleTime": (...args: [Pointer, Pointer]) => number;
    "QueryIdleProcessorCycleTimeEx": (...args: [number, Pointer, Pointer]) => number;
    "QueryUnbiasedInterruptTime": (...args: [Pointer]) => number;
    "GlobalCompact": (...args: [number]) => number;
    "GlobalFix": (...args: [Pointer]) => void;
    "GlobalUnfix": (...args: [Pointer]) => void;
    "GlobalWire": (...args: [Pointer]) => Pointer;
    "GlobalUnWire": (...args: [Pointer]) => number;
    "LocalShrink": (...args: [Pointer, number]) => number;
    "LocalCompact": (...args: [number]) => number;
    "SetEnvironmentStringsA": (...args: [Pointer]) => number;
    "SetHandleCount": (...args: [number]) => number;
    "RequestDeviceWakeup": (...args: [Pointer]) => number;
    "CancelDeviceWakeupRequest": (...args: [Pointer]) => number;
    "SetMessageWaitingIndicator": (...args: [Pointer, number]) => number;
    "MulDiv": (...args: [number, number, number]) => number;
    "GetSystemRegistryQuota": (...args: [Pointer, Pointer]) => number;
    "FileTimeToDosDateTime": (...args: [Pointer, Pointer, Pointer]) => number;
    "DosDateTimeToFileTime": (...args: [number, number, Pointer]) => number;
    "_lopen": (...args: [Pointer, number]) => number;
    "_lcreat": (...args: [Pointer, number]) => number;
    "_lread": (...args: [number, Pointer, number]) => number;
    "_lwrite": (...args: [number, Pointer, number]) => number;
    "_hread": (...args: [number, Pointer, number]) => number;
    "_hwrite": (...args: [number, Pointer, number]) => number;
    "_lclose": (...args: [number]) => number;
    "_llseek": (...args: [number, number, number]) => number;
    "OpenMutexA": (...args: [number, number, Pointer]) => Pointer;
    "OpenSemaphoreA": (...args: [number, number, Pointer]) => Pointer;
    "GetFirmwareEnvironmentVariableA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "GetFirmwareEnvironmentVariableW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "GetFirmwareEnvironmentVariableExA": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "GetFirmwareEnvironmentVariableExW": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetFirmwareEnvironmentVariableA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "SetFirmwareEnvironmentVariableW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "SetFirmwareEnvironmentVariableExA": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "SetFirmwareEnvironmentVariableExW": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "IsNativeVhdBoot": (...args: [Pointer]) => number;
    "GetProfileIntA": (...args: [Pointer, Pointer, number]) => number;
    "GetProfileIntW": (...args: [Pointer, Pointer, number]) => number;
    "GetProfileStringA": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "GetProfileStringW": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "WriteProfileStringA": (...args: [Pointer, Pointer, Pointer]) => number;
    "WriteProfileStringW": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetProfileSectionA": (...args: [Pointer, Pointer, number]) => number;
    "GetProfileSectionW": (...args: [Pointer, Pointer, number]) => number;
    "WriteProfileSectionA": (...args: [Pointer, Pointer]) => number;
    "WriteProfileSectionW": (...args: [Pointer, Pointer]) => number;
    "GetPrivateProfileIntA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetPrivateProfileIntW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetPrivateProfileStringA": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "GetPrivateProfileStringW": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "WritePrivateProfileStringA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "WritePrivateProfileStringW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetPrivateProfileSectionA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetPrivateProfileSectionW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "WritePrivateProfileSectionA": (...args: [Pointer, Pointer, Pointer]) => number;
    "WritePrivateProfileSectionW": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetPrivateProfileSectionNamesA": (...args: [Pointer, number, Pointer]) => number;
    "GetPrivateProfileSectionNamesW": (...args: [Pointer, number, Pointer]) => number;
    "GetPrivateProfileStructA": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "GetPrivateProfileStructW": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "WritePrivateProfileStructA": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "WritePrivateProfileStructW": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "IsBadHugeReadPtr": (...args: [Pointer, number]) => number;
    "IsBadHugeWritePtr": (...args: [Pointer, number]) => number;
    "GetComputerNameA": (...args: [Pointer, Pointer]) => number;
    "GetComputerNameW": (...args: [Pointer, Pointer]) => number;
    "DnsHostnameToComputerNameA": (...args: [Pointer, Pointer, Pointer]) => number;
    "DnsHostnameToComputerNameW": (...args: [Pointer, Pointer, Pointer]) => number;
    "ReplacePartitionUnit": (...args: [Pointer, Pointer, number]) => number;
    "GetThreadEnabledXStateFeatures": (...args: []) => bigint;
    "EnableProcessOptionalXStateFeatures": (...args: [bigint]) => number;
    "InstallELAMCertificateInfo": (...args: [Pointer]) => number;
    "CeipIsOptedIn": (...args: []) => number;
    "CreateIoCompletionPort": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "GetQueuedCompletionStatus": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "GetQueuedCompletionStatusEx": (...args: [Pointer, Pointer, number, Pointer, number, number]) => number;
    "PostQueuedCompletionStatus": (...args: [Pointer, number, number, Pointer]) => number;
    "DeviceIoControl": (...args: [Pointer, number, Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "GetOverlappedResult": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "CancelIoEx": (...args: [Pointer, Pointer]) => number;
    "CancelIo": (...args: [Pointer]) => number;
    "GetOverlappedResultEx": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "CancelSynchronousIo": (...args: [Pointer]) => number;
    "BindIoCompletionCallback": (...args: [Pointer, Pointer, number]) => number;
    "IsProcessInJob": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateJobObjectW": (...args: [Pointer, Pointer]) => Pointer;
    "FreeMemoryJobObject": (...args: [Pointer]) => void;
    "OpenJobObjectW": (...args: [number, number, Pointer]) => Pointer;
    "AssignProcessToJobObject": (...args: [Pointer, Pointer]) => number;
    "TerminateJobObject": (...args: [Pointer, number]) => number;
    "SetInformationJobObject": (...args: [Pointer, number, Pointer, number]) => number;
    "SetIoRateControlInformationJobObject": (...args: [Pointer, Pointer]) => number;
    "QueryInformationJobObject": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "QueryIoRateControlInformationJobObject": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "CreateJobObjectA": (...args: [Pointer, Pointer]) => Pointer;
    "OpenJobObjectA": (...args: [number, number, Pointer]) => Pointer;
    "CreateJobSet": (...args: [number, Pointer, number]) => number;
    "OOBEComplete": (...args: [Pointer]) => number;
    "RegisterWaitUntilOOBECompleted": (...args: [Pointer, Pointer, Pointer]) => number;
    "UnregisterWaitUntilOOBECompleted": (...args: [Pointer]) => number;
    "CreateMailslotA": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "CreateMailslotW": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "GetMailslotInfo": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetMailslotInfo": (...args: [Pointer, number]) => number;
    "RegisterApplicationRecoveryCallback": (...args: [Pointer, Pointer, number, number]) => number;
    "UnregisterApplicationRecoveryCallback": (...args: []) => number;
    "RegisterApplicationRestart": (...args: [Pointer, number]) => number;
    "UnregisterApplicationRestart": (...args: []) => number;
    "GetApplicationRecoveryCallback": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetApplicationRestartSettings": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "ApplicationRecoveryInProgress": (...args: [Pointer]) => number;
    "ApplicationRecoveryFinished": (...args: [number]) => void;
    "EnableThreadProfiling": (...args: [Pointer, number, bigint, Pointer]) => number;
    "DisableThreadProfiling": (...args: [Pointer]) => number;
    "QueryThreadProfiling": (...args: [Pointer, Pointer]) => number;
    "ReadThreadProfilingData": (...args: [Pointer, number, Pointer]) => number;
    "CreateActCtx": (...args: [Pointer]) => Pointer;
    "FindActCtxSectionString": (...args: [number, Pointer, number, Pointer, Pointer]) => number;
    "OutputDebugString": (...args: [Pointer]) => void;
    "FatalAppExit": (...args: [number, Pointer]) => void;
    "FormatMessage": (...args: [number, Pointer, number, number, Pointer, number, Pointer]) => number;
    "SearchPath": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "CreateDirectory": (...args: [Pointer, Pointer]) => number;
    "CreateFile": (...args: [Pointer, number, number, Pointer, number, number, Pointer]) => Pointer;
    "DeleteFile": (...args: [Pointer]) => number;
    "FindFirstChangeNotification": (...args: [Pointer, number, number]) => Pointer;
    "FindFirstFile": (...args: [Pointer, Pointer]) => Pointer;
    "FindFirstFileEx": (...args: [Pointer, number, Pointer, number, Pointer, number]) => Pointer;
    "FindNextFile": (...args: [Pointer, Pointer]) => number;
    "GetDiskFreeSpace": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetDiskFreeSpaceEx": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetDiskSpaceInformation": (...args: [Pointer, Pointer]) => number;
    "GetDriveType": (...args: [Pointer]) => number;
    "GetFileAttributes": (...args: [Pointer]) => number;
    "GetFileAttributesEx": (...args: [Pointer, number, Pointer]) => number;
    "GetFinalPathNameByHandle": (...args: [Pointer, Pointer, number, number]) => number;
    "GetFullPathName": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetLongPathName": (...args: [Pointer, Pointer, number]) => number;
    "RemoveDirectory": (...args: [Pointer]) => number;
    "SetFileAttributes": (...args: [Pointer, number]) => number;
    "GetCompressedFileSize": (...args: [Pointer, Pointer]) => number;
    "GetTempPath": (...args: [number, Pointer]) => number;
    "GetVolumeInformation": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "GetTempFileName": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetTempPath2": (...args: [number, Pointer]) => number;
    "CreateDirectory2": (...args: [Pointer, number, number, number, Pointer]) => Pointer;
    "RemoveDirectory2": (...args: [Pointer, number]) => number;
    "DeleteFile2": (...args: [Pointer, number]) => number;
    "VerLanguageName": (...args: [number, Pointer, number]) => number;
    "GetExpandedName": (...args: [Pointer, Pointer]) => number;
    "LZOpenFile": (...args: [Pointer, Pointer, number]) => number;
    "GetBinaryType": (...args: [Pointer, Pointer]) => number;
    "GetShortPathName": (...args: [Pointer, Pointer, number]) => number;
    "GetLongPathNameTransacted": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetFileShortName": (...args: [Pointer, Pointer]) => number;
    "GetLogicalDriveStrings": (...args: [number, Pointer]) => number;
    "CreateDirectoryEx": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateDirectoryTransacted": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RemoveDirectoryTransacted": (...args: [Pointer, Pointer]) => number;
    "GetFullPathNameTransacted": (...args: [Pointer, number, Pointer, Pointer, Pointer]) => number;
    "DefineDosDevice": (...args: [number, Pointer, Pointer]) => number;
    "QueryDosDevice": (...args: [Pointer, Pointer, number]) => number;
    "CreateFileTransacted": (...args: [Pointer, number, number, Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "SetFileAttributesTransacted": (...args: [Pointer, number, Pointer]) => number;
    "GetFileAttributesTransacted": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetCompressedFileSizeTransacted": (...args: [Pointer, Pointer, Pointer]) => number;
    "DeleteFileTransacted": (...args: [Pointer, Pointer]) => number;
    "CheckNameLegalDOS8Dot3": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "FindFirstFileTransacted": (...args: [Pointer, number, Pointer, number, Pointer, number, Pointer]) => Pointer;
    "CopyFile": (...args: [Pointer, Pointer, number]) => number;
    "CopyFileEx": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "CopyFileTransacted": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "MoveFile": (...args: [Pointer, Pointer]) => number;
    "MoveFileEx": (...args: [Pointer, Pointer, number]) => number;
    "MoveFileWithProgress": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "MoveFileTransacted": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "ReplaceFile": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "CreateHardLink": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateHardLinkTransacted": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetVolumeLabel": (...args: [Pointer, Pointer]) => number;
    "FindFirstVolume": (...args: [Pointer, number]) => Pointer;
    "FindNextVolume": (...args: [Pointer, Pointer, number]) => number;
    "FindFirstVolumeMountPoint": (...args: [Pointer, Pointer, number]) => Pointer;
    "FindNextVolumeMountPoint": (...args: [Pointer, Pointer, number]) => number;
    "SetVolumeMountPoint": (...args: [Pointer, Pointer]) => number;
    "DeleteVolumeMountPoint": (...args: [Pointer]) => number;
    "GetVolumeNameForVolumeMountPoint": (...args: [Pointer, Pointer, number]) => number;
    "GetVolumePathName": (...args: [Pointer, Pointer, number]) => number;
    "GetVolumePathNamesForVolumeName": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "CreateSymbolicLink": (...args: [Pointer, Pointer, number]) => number;
    "CreateSymbolicLinkTransacted": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetDateFormat": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "GetTimeFormat": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "GetCPInfoEx": (...args: [number, number, Pointer]) => number;
    "CompareString": (...args: [number, number, Pointer, number, Pointer, number]) => number;
    "LCMapString": (...args: [number, number, Pointer, number, Pointer, number]) => number;
    "GetLocaleInfo": (...args: [number, number, Pointer, number]) => number;
    "SetLocaleInfo": (...args: [number, number, Pointer]) => number;
    "GetCalendarInfo": (...args: [number, number, number, Pointer, number, Pointer]) => number;
    "SetCalendarInfo": (...args: [number, number, number, Pointer]) => number;
    "GetNumberFormat": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "GetCurrencyFormat": (...args: [number, number, Pointer, Pointer, Pointer, number]) => number;
    "EnumCalendarInfo": (...args: [Pointer, number, number, number]) => number;
    "EnumCalendarInfoEx": (...args: [Pointer, number, number, number]) => number;
    "EnumTimeFormats": (...args: [Pointer, number, number]) => number;
    "EnumDateFormats": (...args: [Pointer, number, number]) => number;
    "EnumDateFormatsEx": (...args: [Pointer, number, number]) => number;
    "GetGeoInfo": (...args: [number, number, Pointer, number, number]) => number;
    "GetStringTypeEx": (...args: [number, number, Pointer, number, Pointer]) => number;
    "GetStringType": (...args: [number, Pointer, number, Pointer]) => number;
    "FoldString": (...args: [number, Pointer, number, Pointer, number]) => number;
    "EnumSystemLocales": (...args: [Pointer, number]) => number;
    "EnumSystemLanguageGroups": (...args: [Pointer, number, number]) => number;
    "EnumLanguageGroupLocales": (...args: [Pointer, number, number, number]) => number;
    "EnumUILanguages": (...args: [Pointer, number, number]) => number;
    "EnumSystemCodePages": (...args: [Pointer, number]) => number;
    "lstrcmp": (...args: [Pointer, Pointer]) => number;
    "lstrcmpi": (...args: [Pointer, Pointer]) => number;
    "lstrcpyn": (...args: [Pointer, Pointer, number]) => Pointer;
    "lstrcpy": (...args: [Pointer, Pointer]) => Pointer;
    "lstrcat": (...args: [Pointer, Pointer]) => Pointer;
    "lstrlen": (...args: [Pointer]) => number;
    "GetSystemDirectory": (...args: [Pointer, number]) => number;
    "GetWindowsDirectory": (...args: [Pointer, number]) => number;
    "GetSystemWindowsDirectory": (...args: [Pointer, number]) => number;
    "GetComputerNameEx": (...args: [number, Pointer, Pointer]) => number;
    "GetVersionEx": (...args: [Pointer]) => number;
    "SetComputerName": (...args: [Pointer]) => number;
    "SetComputerNameEx": (...args: [number, Pointer]) => number;
    "GetSystemWow64Directory": (...args: [Pointer, number]) => number;
    "VerifyVersionInfo": (...args: [Pointer, number, bigint]) => number;
    "CreateMutex": (...args: [Pointer, number, Pointer]) => Pointer;
    "CreateEvent": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "OpenEvent": (...args: [number, number, Pointer]) => Pointer;
    "CreateMutexEx": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "CreateEventEx": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "CreateProcess": (...args: [Pointer, Pointer, Pointer, Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "CreateSemaphore": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "CreateWaitableTimer": (...args: [Pointer, number, Pointer]) => Pointer;
    "OpenWaitableTimer": (...args: [number, number, Pointer]) => Pointer;
    "CreateSemaphoreEx": (...args: [Pointer, number, number, Pointer, number, number]) => Pointer;
    "CreateWaitableTimerEx": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "QueryFullProcessImageName": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetStartupInfo": (...args: [Pointer]) => void;
    "CreatePrivateNamespace": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "OpenPrivateNamespace": (...args: [Pointer, Pointer]) => Pointer;
    "CreateBoundaryDescriptor": (...args: [Pointer, number]) => Pointer;
    "BuildCommDCB": (...args: [Pointer, Pointer]) => number;
    "BuildCommDCBAndTimeouts": (...args: [Pointer, Pointer, Pointer]) => number;
    "CommConfigDialog": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetDefaultCommConfig": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetDefaultCommConfig": (...args: [Pointer, Pointer, number]) => number;
    "ReadConsoleInput": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "PeekConsoleInput": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "ReadConsole": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "WriteConsole": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "FillConsoleOutputCharacter": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "WriteConsoleOutputCharacter": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "ReadConsoleOutputCharacter": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "WriteConsoleInput": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "ScrollConsoleScreenBuffer": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "WriteConsoleOutput": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "ReadConsoleOutput": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetConsoleTitle": (...args: [Pointer, number]) => number;
    "GetConsoleOriginalTitle": (...args: [Pointer, number]) => number;
    "SetConsoleTitle": (...args: [Pointer]) => number;
    "AddConsoleAlias": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetConsoleAlias": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetConsoleAliasesLength": (...args: [Pointer]) => number;
    "GetConsoleAliasExesLength": (...args: []) => number;
    "GetConsoleAliases": (...args: [Pointer, number, Pointer]) => number;
    "GetConsoleAliasExes": (...args: [Pointer, number]) => number;
    "ExpungeConsoleCommandHistory": (...args: [Pointer]) => void;
    "SetConsoleNumberOfCommands": (...args: [number, Pointer]) => number;
    "GetConsoleCommandHistoryLength": (...args: [Pointer]) => number;
    "GetConsoleCommandHistory": (...args: [Pointer, number, Pointer]) => number;
    "GetConsoleInputExeName": (...args: [number, Pointer]) => number;
    "SetConsoleInputExeName": (...args: [Pointer]) => number;
    "ReadConsoleInputEx": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "WriteConsoleInputVDM": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GlobalAddAtom": (...args: [Pointer]) => number;
    "GlobalAddAtomEx": (...args: [Pointer, number]) => number;
    "GlobalFindAtom": (...args: [Pointer]) => number;
    "GlobalGetAtomName": (...args: [number, Pointer, number]) => number;
    "AddAtom": (...args: [Pointer]) => number;
    "FindAtom": (...args: [Pointer]) => number;
    "GetAtomName": (...args: [number, Pointer, number]) => number;
    "GetCommandLine": (...args: []) => Pointer;
    "FreeEnvironmentStrings": (...args: [Pointer]) => number;
    "GetEnvironmentVariable": (...args: [Pointer, Pointer, number]) => number;
    "SetEnvironmentVariable": (...args: [Pointer, Pointer]) => number;
    "ExpandEnvironmentStrings": (...args: [Pointer, Pointer, number]) => number;
    "SetCurrentDirectory": (...args: [Pointer]) => number;
    "GetCurrentDirectory": (...args: [number, Pointer]) => number;
    "NeedCurrentDirectoryForExePath": (...args: [Pointer]) => number;
    "GetModuleFileName": (...args: [Pointer, Pointer, number]) => number;
    "GetModuleHandle": (...args: [Pointer]) => Pointer;
    "GetModuleHandleEx": (...args: [number, Pointer, Pointer]) => number;
    "LoadLibraryEx": (...args: [Pointer, Pointer, number]) => Pointer;
    "EnumResourceLanguagesEx": (...args: [Pointer, Pointer, Pointer, Pointer, number, number, number]) => number;
    "EnumResourceNamesEx": (...args: [Pointer, Pointer, Pointer, number, number, number]) => number;
    "EnumResourceTypesEx": (...args: [Pointer, Pointer, number, number, number]) => number;
    "LoadLibrary": (...args: [Pointer]) => Pointer;
    "EnumResourceNames": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "FindResource": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "FindResourceEx": (...args: [Pointer, Pointer, Pointer, number]) => Pointer;
    "EnumResourceTypes": (...args: [Pointer, Pointer, number]) => number;
    "EnumResourceLanguages": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "BeginUpdateResource": (...args: [Pointer, number]) => Pointer;
    "UpdateResource": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "EndUpdateResource": (...args: [Pointer, number]) => number;
    "SetDllDirectory": (...args: [Pointer]) => number;
    "GetDllDirectory": (...args: [number, Pointer]) => number;
    "CreateFileMapping": (...args: [Pointer, Pointer, number, number, number, Pointer]) => Pointer;
    "CreateFileMappingNuma": (...args: [Pointer, Pointer, number, number, number, Pointer, number]) => Pointer;
    "OpenFileMapping": (...args: [number, number, Pointer]) => Pointer;
    "IsBadStringPtr": (...args: [Pointer, number]) => number;
    "CreateNamedPipe": (...args: [Pointer, number, number, number, number, number, number, Pointer]) => Pointer;
    "GetNamedPipeHandleState": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "CallNamedPipe": (...args: [Pointer, Pointer, number, Pointer, number, Pointer, number]) => number;
    "WaitNamedPipe": (...args: [Pointer, number]) => number;
    "GetNamedPipeClientComputerName": (...args: [Pointer, Pointer, number]) => number;
    "K32GetModuleBaseName": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "K32GetModuleFileNameEx": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "K32GetMappedFileName": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "K32GetDeviceDriverBaseName": (...args: [Pointer, Pointer, number]) => number;
    "K32GetDeviceDriverFileName": (...args: [Pointer, Pointer, number]) => number;
    "K32EnumPageFiles": (...args: [Pointer, Pointer]) => number;
    "K32GetProcessImageFileName": (...args: [Pointer, Pointer, number]) => number;
    "SetEnvironmentStrings": (...args: [Pointer]) => number;
    "OpenMutex": (...args: [number, number, Pointer]) => Pointer;
    "OpenSemaphore": (...args: [number, number, Pointer]) => Pointer;
    "GetFirmwareEnvironmentVariable": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "GetFirmwareEnvironmentVariableEx": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetFirmwareEnvironmentVariable": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "SetFirmwareEnvironmentVariableEx": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "GetProfileInt": (...args: [Pointer, Pointer, number]) => number;
    "GetProfileString": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "WriteProfileString": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetProfileSection": (...args: [Pointer, Pointer, number]) => number;
    "WriteProfileSection": (...args: [Pointer, Pointer]) => number;
    "GetPrivateProfileInt": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetPrivateProfileString": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "WritePrivateProfileString": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetPrivateProfileSection": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "WritePrivateProfileSection": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetPrivateProfileSectionNames": (...args: [Pointer, number, Pointer]) => number;
    "GetPrivateProfileStruct": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "WritePrivateProfileStruct": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "GetComputerName": (...args: [Pointer, Pointer]) => number;
    "DnsHostnameToComputerName": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateJobObject": (...args: [Pointer, Pointer]) => Pointer;
    "OpenJobObject": (...args: [number, number, Pointer]) => Pointer;
    "CreateMailslot": (...args: [Pointer, number, number, Pointer]) => Pointer;
}
export interface kernel32Library { readonly symbols: kernel32Symbols; close(): void; }
export interface kernelbaseSymbols {
    "TryCreatePackageDependency": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, number, Pointer]) => number;
    "DeletePackageDependency": (...args: [Pointer]) => number;
    "AddPackageDependency": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "RemovePackageDependency": (...args: [Pointer]) => number;
    "GetResolvedPackageFullNameForPackageDependency": (...args: [Pointer, Pointer]) => number;
    "GetIdForPackageDependencyContext": (...args: [Pointer, Pointer]) => number;

}
export interface kernelbaseLibrary { readonly symbols: kernelbaseSymbols; close(): void; }
export declare const structs: {
  "SECURITY_ATTRIBUTES": {
    "size": 24,
    "fields": [
      {
        "name": "nLength",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "lpSecurityDescriptor",
        "offset": 8,
        "type": "void*"
      },
      {
        "name": "bInheritHandle",
        "offset": 16,
        "type": "Windows.Win32.Foundation.BOOL"
      }
    ]
  },
  "OVERLAPPED": {
    "size": 32,
    "fields": [
      {
        "name": "Internal",
        "offset": 0,
        "type": "usize"
      },
      {
        "name": "InternalHigh",
        "offset": 8,
        "type": "usize"
      },
      {
        "name": "Anonymous",
        "offset": 16,
        "type": "_Anonymous_e__Union"
      },
      {
        "name": "hEvent",
        "offset": 24,
        "type": "Windows.Win32.Foundation.HANDLE"
      }
    ]
  },
  "SYSTEMTIME": {
    "size": 16,
    "fields": [
      {
        "name": "wYear",
        "offset": 0,
        "type": "u16"
      },
      {
        "name": "wMonth",
        "offset": 2,
        "type": "u16"
      },
      {
        "name": "wDayOfWeek",
        "offset": 4,
        "type": "u16"
      },
      {
        "name": "wDay",
        "offset": 6,
        "type": "u16"
      },
      {
        "name": "wHour",
        "offset": 8,
        "type": "u16"
      },
      {
        "name": "wMinute",
        "offset": 10,
        "type": "u16"
      },
      {
        "name": "wSecond",
        "offset": 12,
        "type": "u16"
      },
      {
        "name": "wMilliseconds",
        "offset": 14,
        "type": "u16"
      }
    ]
  },
  "WIN32_FIND_DATAW": {
    "size": 64,
    "fields": [
      {
        "name": "dwFileAttributes",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "ftCreationTime",
        "offset": 8,
        "type": "Windows.Win32.Foundation.FILETIME"
      },
      {
        "name": "ftLastAccessTime",
        "offset": 16,
        "type": "Windows.Win32.Foundation.FILETIME"
      },
      {
        "name": "ftLastWriteTime",
        "offset": 24,
        "type": "Windows.Win32.Foundation.FILETIME"
      },
      {
        "name": "nFileSizeHigh",
        "offset": 32,
        "type": "u32"
      },
      {
        "name": "nFileSizeLow",
        "offset": 36,
        "type": "u32"
      },
      {
        "name": "dwReserved0",
        "offset": 40,
        "type": "u32"
      },
      {
        "name": "dwReserved1",
        "offset": 44,
        "type": "u32"
      },
      {
        "name": "cFileName",
        "offset": 48,
        "type": "u16[1]"
      },
      {
        "name": "cAlternateFileName",
        "offset": 56,
        "type": "u16[1]"
      }
    ]
  },
  "FILETIME": {
    "size": 8,
    "fields": [
      {
        "name": "dwLowDateTime",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "dwHighDateTime",
        "offset": 4,
        "type": "u32"
      }
    ]
  },
  "PROCESS_INFORMATION": {
    "size": 24,
    "fields": [
      {
        "name": "hProcess",
        "offset": 0,
        "type": "Windows.Win32.Foundation.HANDLE"
      },
      {
        "name": "hThread",
        "offset": 8,
        "type": "Windows.Win32.Foundation.HANDLE"
      },
      {
        "name": "dwProcessId",
        "offset": 16,
        "type": "u32"
      },
      {
        "name": "dwThreadId",
        "offset": 20,
        "type": "u32"
      }
    ]
  },
  "STARTUPINFOW": {
    "size": 104,
    "fields": [
      {
        "name": "cb",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "lpReserved",
        "offset": 8,
        "type": "Windows.Win32.Foundation.PWSTR"
      },
      {
        "name": "lpDesktop",
        "offset": 16,
        "type": "Windows.Win32.Foundation.PWSTR"
      },
      {
        "name": "lpTitle",
        "offset": 24,
        "type": "Windows.Win32.Foundation.PWSTR"
      },
      {
        "name": "dwX",
        "offset": 32,
        "type": "u32"
      },
      {
        "name": "dwY",
        "offset": 36,
        "type": "u32"
      },
      {
        "name": "dwXSize",
        "offset": 40,
        "type": "u32"
      },
      {
        "name": "dwYSize",
        "offset": 44,
        "type": "u32"
      },
      {
        "name": "dwXCountChars",
        "offset": 48,
        "type": "u32"
      },
      {
        "name": "dwYCountChars",
        "offset": 52,
        "type": "u32"
      },
      {
        "name": "dwFillAttribute",
        "offset": 56,
        "type": "u32"
      },
      {
        "name": "dwFlags",
        "offset": 60,
        "type": "Windows.Win32.System.Threading.STARTUPINFOW_FLAGS"
      },
      {
        "name": "wShowWindow",
        "offset": 64,
        "type": "u16"
      },
      {
        "name": "cbReserved2",
        "offset": 66,
        "type": "u16"
      },
      {
        "name": "lpReserved2",
        "offset": 72,
        "type": "u8*"
      },
      {
        "name": "hStdInput",
        "offset": 80,
        "type": "Windows.Win32.Foundation.HANDLE"
      },
      {
        "name": "hStdOutput",
        "offset": 88,
        "type": "Windows.Win32.Foundation.HANDLE"
      },
      {
        "name": "hStdError",
        "offset": 96,
        "type": "Windows.Win32.Foundation.HANDLE"
      }
    ]
  }
};
export declare const enums: {
  "CONSOLE_MODE": {
    "ENABLE_PROCESSED_INPUT": 1,
    "ENABLE_LINE_INPUT": 2,
    "ENABLE_ECHO_INPUT": 4,
    "ENABLE_WINDOW_INPUT": 8,
    "ENABLE_MOUSE_INPUT": 16,
    "ENABLE_INSERT_MODE": 32,
    "ENABLE_QUICK_EDIT_MODE": 64,
    "ENABLE_EXTENDED_FLAGS": 128,
    "ENABLE_AUTO_POSITION": 256,
    "ENABLE_VIRTUAL_TERMINAL_INPUT": 512,
    "ENABLE_PROCESSED_OUTPUT": 1,
    "ENABLE_WRAP_AT_EOL_OUTPUT": 2,
    "ENABLE_VIRTUAL_TERMINAL_PROCESSING": 4,
    "DISABLE_NEWLINE_AUTO_RETURN": 8,
    "ENABLE_LVB_GRID_WORLDWIDE": 16
  },
  "STD_HANDLE": {
    "STD_INPUT_HANDLE": 4294967286,
    "STD_OUTPUT_HANDLE": 4294967285,
    "STD_ERROR_HANDLE": 4294967284
  },
  "MODEM_STATUS_FLAGS": {
    "MS_CTS_ON": 16,
    "MS_DSR_ON": 32,
    "MS_RING_ON": 64,
    "MS_RLSD_ON": 128
  },
  "CLEAR_COMM_ERROR_FLAGS": {
    "CE_BREAK": 16,
    "CE_FRAME": 8,
    "CE_OVERRUN": 2,
    "CE_RXOVER": 1,
    "CE_RXPARITY": 4
  },
  "PURGE_COMM_FLAGS": {
    "PURGE_RXABORT": 2,
    "PURGE_RXCLEAR": 8,
    "PURGE_TXABORT": 1,
    "PURGE_TXCLEAR": 4
  },
  "COMM_EVENT_MASK": {
    "EV_BREAK": 64,
    "EV_CTS": 8,
    "EV_DSR": 16,
    "EV_ERR": 128,
    "EV_EVENT1": 2048,
    "EV_EVENT2": 4096,
    "EV_PERR": 512,
    "EV_RING": 256,
    "EV_RLSD": 32,
    "EV_RX80FULL": 1024,
    "EV_RXCHAR": 1,
    "EV_RXFLAG": 2,
    "EV_TXEMPTY": 4
  },
  "ESCAPE_COMM_FUNCTION": {
    "CLRBREAK": 9,
    "CLRDTR": 6,
    "CLRRTS": 4,
    "SETBREAK": 8,
    "SETDTR": 5,
    "SETRTS": 3,
    "SETXOFF": 1,
    "SETXON": 2
  },
  "FIND_FIRST_EX_FLAGS": {
    "FIND_FIRST_EX_CASE_SENSITIVE": 1,
    "FIND_FIRST_EX_LARGE_FETCH": 2,
    "FIND_FIRST_EX_ON_DISK_ENTRIES_ONLY": 4
  },
  "DEFINE_DOS_DEVICE_FLAGS": {
    "DDD_RAW_TARGET_PATH": 1,
    "DDD_REMOVE_DEFINITION": 2,
    "DDD_EXACT_MATCH_ON_REMOVE": 4,
    "DDD_NO_BROADCAST_SYSTEM": 8,
    "DDD_LUID_BROADCAST_DRIVE": 16
  },
  "FILE_FLAGS_AND_ATTRIBUTES": {
    "FILE_ATTRIBUTE_READONLY": 1,
    "FILE_ATTRIBUTE_HIDDEN": 2,
    "FILE_ATTRIBUTE_SYSTEM": 4,
    "FILE_ATTRIBUTE_DIRECTORY": 16,
    "FILE_ATTRIBUTE_ARCHIVE": 32,
    "FILE_ATTRIBUTE_DEVICE": 64,
    "FILE_ATTRIBUTE_NORMAL": 128,
    "FILE_ATTRIBUTE_TEMPORARY": 256,
    "FILE_ATTRIBUTE_SPARSE_FILE": 512,
    "FILE_ATTRIBUTE_REPARSE_POINT": 1024,
    "FILE_ATTRIBUTE_COMPRESSED": 2048,
    "FILE_ATTRIBUTE_OFFLINE": 4096,
    "FILE_ATTRIBUTE_NOT_CONTENT_INDEXED": 8192,
    "FILE_ATTRIBUTE_ENCRYPTED": 16384,
    "FILE_ATTRIBUTE_INTEGRITY_STREAM": 32768,
    "FILE_ATTRIBUTE_VIRTUAL": 65536,
    "FILE_ATTRIBUTE_NO_SCRUB_DATA": 131072,
    "FILE_ATTRIBUTE_EA": 262144,
    "FILE_ATTRIBUTE_PINNED": 524288,
    "FILE_ATTRIBUTE_UNPINNED": 1048576,
    "FILE_ATTRIBUTE_RECALL_ON_OPEN": 262144,
    "FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS": 4194304,
    "FILE_FLAG_WRITE_THROUGH": 2147483648,
    "FILE_FLAG_OVERLAPPED": 1073741824,
    "FILE_FLAG_NO_BUFFERING": 536870912,
    "FILE_FLAG_RANDOM_ACCESS": 268435456,
    "FILE_FLAG_SEQUENTIAL_SCAN": 134217728,
    "FILE_FLAG_DELETE_ON_CLOSE": 67108864,
    "FILE_FLAG_BACKUP_SEMANTICS": 33554432,
    "FILE_FLAG_POSIX_SEMANTICS": 16777216,
    "FILE_FLAG_SESSION_AWARE": 8388608,
    "FILE_FLAG_OPEN_REPARSE_POINT": 2097152,
    "FILE_FLAG_OPEN_NO_RECALL": 1048576,
    "FILE_FLAG_FIRST_PIPE_INSTANCE": 524288,
    "PIPE_ACCESS_DUPLEX": 3,
    "PIPE_ACCESS_INBOUND": 1,
    "PIPE_ACCESS_OUTBOUND": 2,
    "SECURITY_ANONYMOUS": 0,
    "SECURITY_IDENTIFICATION": 65536,
    "SECURITY_IMPERSONATION": 131072,
    "SECURITY_DELEGATION": 196608,
    "SECURITY_CONTEXT_TRACKING": 262144,
    "SECURITY_EFFECTIVE_ONLY": 524288,
    "SECURITY_SQOS_PRESENT": 1048576,
    "SECURITY_VALID_SQOS_FLAGS": 2031616
  },
  "WAIT_EVENT": {
    "WAIT_OBJECT_0": 0,
    "WAIT_ABANDONED": 128,
    "WAIT_ABANDONED_0": 128,
    "WAIT_IO_COMPLETION": 192,
    "WAIT_TIMEOUT": 258,
    "WAIT_FAILED": 4294967295
  },
  "DUPLICATE_HANDLE_OPTIONS": {
    "DUPLICATE_CLOSE_SOURCE": 1,
    "DUPLICATE_SAME_ACCESS": 2
  },
  "HANDLE_FLAGS": {
    "HANDLE_FLAG_INHERIT": 1,
    "HANDLE_FLAG_PROTECT_FROM_CLOSE": 2
  },
  "FOLD_STRING_MAP_FLAGS": {
    "MAP_COMPOSITE": 64,
    "MAP_EXPAND_LIGATURES": 8192,
    "MAP_FOLDCZONE": 16,
    "MAP_FOLDDIGITS": 128,
    "MAP_PRECOMPOSED": 32
  },
  "ENUM_DATE_FORMATS_FLAGS": {
    "DATE_SHORTDATE": 1,
    "DATE_LONGDATE": 2,
    "DATE_YEARMONTH": 8,
    "DATE_MONTHDAY": 128,
    "DATE_AUTOLAYOUT": 64,
    "DATE_LTRREADING": 16,
    "DATE_RTLREADING": 32,
    "DATE_USE_ALT_CALENDAR": 4
  },
  "TIME_FORMAT_FLAGS": {
    "TIME_NOMINUTESORSECONDS": 1,
    "TIME_NOSECONDS": 2,
    "TIME_NOTIMEMARKER": 4,
    "TIME_FORCE24HOURFORMAT": 8
  },
  "ENUM_SYSTEM_LANGUAGE_GROUPS_FLAGS": {
    "LGRPID_INSTALLED": 1,
    "LGRPID_SUPPORTED": 2
  },
  "MULTI_BYTE_TO_WIDE_CHAR_FLAGS": {
    "MB_COMPOSITE": 2,
    "MB_ERR_INVALID_CHARS": 8,
    "MB_PRECOMPOSED": 1,
    "MB_USEGLYPHCHARS": 4
  },
  "COMPARE_STRING_FLAGS": {
    "LINGUISTIC_IGNORECASE": 16,
    "LINGUISTIC_IGNOREDIACRITIC": 32,
    "NORM_IGNORECASE": 1,
    "NORM_IGNOREKANATYPE": 65536,
    "NORM_IGNORENONSPACE": 2,
    "NORM_IGNORESYMBOLS": 4,
    "NORM_IGNOREWIDTH": 131072,
    "NORM_LINGUISTIC_CASING": 134217728,
    "SORT_DIGITSASNUMBERS": 8,
    "SORT_STRINGSORT": 4096
  },
  "IS_VALID_LOCALE_FLAGS": {
    "LCID_INSTALLED": 1,
    "LCID_SUPPORTED": 2
  },
  "ENUM_SYSTEM_CODE_PAGES_FLAGS": {
    "CP_INSTALLED": 1,
    "CP_SUPPORTED": 2
  },
  "COMPARESTRING_RESULT": {
    "CSTR_LESS_THAN": 1,
    "CSTR_EQUAL": 2,
    "CSTR_GREATER_THAN": 3
  },
  "ACE_FLAGS": {
    "CONTAINER_INHERIT_ACE": 2,
    "FAILED_ACCESS_ACE_FLAG": 128,
    "INHERIT_ONLY_ACE": 8,
    "INHERITED_ACE": 16,
    "NO_PROPAGATE_INHERIT_ACE": 4,
    "OBJECT_INHERIT_ACE": 1,
    "SUCCESSFUL_ACCESS_ACE_FLAG": 64,
    "SUB_CONTAINERS_AND_OBJECTS_INHERIT": 3,
    "SUB_CONTAINERS_ONLY_INHERIT": 2,
    "SUB_OBJECTS_ONLY_INHERIT": 1,
    "INHERIT_NO_PROPAGATE": 4,
    "INHERIT_ONLY": 8,
    "NO_INHERITANCE": 0
  },
  "ACE_REVISION": {
    "ACL_REVISION": 2,
    "ACL_REVISION_DS": 4
  },
  "FILE_CREATION_DISPOSITION": {
    "CREATE_NEW": 1,
    "CREATE_ALWAYS": 2,
    "OPEN_EXISTING": 3,
    "OPEN_ALWAYS": 4,
    "TRUNCATE_EXISTING": 5
  },
  "FILE_SHARE_MODE": {
    "FILE_SHARE_NONE": 0,
    "FILE_SHARE_DELETE": 4,
    "FILE_SHARE_READ": 1,
    "FILE_SHARE_WRITE": 2
  },
  "SET_FILE_POINTER_MOVE_METHOD": {
    "FILE_BEGIN": 0,
    "FILE_CURRENT": 1,
    "FILE_END": 2
  },
  "MOVE_FILE_FLAGS": {
    "MOVEFILE_COPY_ALLOWED": 2,
    "MOVEFILE_CREATE_HARDLINK": 16,
    "MOVEFILE_DELAY_UNTIL_REBOOT": 4,
    "MOVEFILE_REPLACE_EXISTING": 1,
    "MOVEFILE_WRITE_THROUGH": 8,
    "MOVEFILE_FAIL_IF_NOT_TRACKABLE": 32
  },
  "GETFINALPATHNAMEBYHANDLE_FLAGS": {
    "VOLUME_NAME_DOS": 0,
    "VOLUME_NAME_GUID": 1,
    "VOLUME_NAME_NT": 2,
    "VOLUME_NAME_NONE": 4,
    "FILE_NAME_NORMALIZED": 0,
    "FILE_NAME_OPENED": 8
  },
  "LZOPENFILE_STYLE": {
    "OF_CANCEL": 2048,
    "OF_CREATE": 4096,
    "OF_DELETE": 512,
    "OF_EXIST": 16384,
    "OF_PARSE": 256,
    "OF_PROMPT": 8192,
    "OF_READ": 0,
    "OF_READWRITE": 2,
    "OF_REOPEN": 32768,
    "OF_SHARE_DENY_NONE": 64,
    "OF_SHARE_DENY_READ": 48,
    "OF_SHARE_DENY_WRITE": 32,
    "OF_SHARE_EXCLUSIVE": 16,
    "OF_WRITE": 1,
    "OF_SHARE_COMPAT": 0,
    "OF_VERIFY": 1024
  },
  "FILE_NOTIFY_CHANGE": {
    "FILE_NOTIFY_CHANGE_FILE_NAME": 1,
    "FILE_NOTIFY_CHANGE_DIR_NAME": 2,
    "FILE_NOTIFY_CHANGE_ATTRIBUTES": 4,
    "FILE_NOTIFY_CHANGE_SIZE": 8,
    "FILE_NOTIFY_CHANGE_LAST_WRITE": 16,
    "FILE_NOTIFY_CHANGE_LAST_ACCESS": 32,
    "FILE_NOTIFY_CHANGE_CREATION": 64,
    "FILE_NOTIFY_CHANGE_SECURITY": 256
  },
  "TXFS_MINIVERSION": {
    "TXFS_MINIVERSION_COMMITTED_VIEW": 0,
    "TXFS_MINIVERSION_DIRTY_VIEW": 65535,
    "TXFS_MINIVERSION_DEFAULT_VIEW": 65534
  },
  "TAPE_POSITION_TYPE": {
    "TAPE_ABSOLUTE_POSITION": 0,
    "TAPE_LOGICAL_POSITION": 1
  },
  "CREATE_TAPE_PARTITION_METHOD": {
    "TAPE_FIXED_PARTITIONS": 0,
    "TAPE_INITIATOR_PARTITIONS": 2,
    "TAPE_SELECT_PARTITIONS": 1
  },
  "REPLACE_FILE_FLAGS": {
    "REPLACEFILE_WRITE_THROUGH": 1,
    "REPLACEFILE_IGNORE_MERGE_ERRORS": 2,
    "REPLACEFILE_IGNORE_ACL_ERRORS": 4
  },
  "TAPEMARK_TYPE": {
    "TAPE_FILEMARKS": 1,
    "TAPE_LONG_FILEMARKS": 3,
    "TAPE_SETMARKS": 0,
    "TAPE_SHORT_FILEMARKS": 2
  },
  "TAPE_POSITION_METHOD": {
    "TAPE_ABSOLUTE_BLOCK": 1,
    "TAPE_LOGICAL_BLOCK": 2,
    "TAPE_REWIND": 0,
    "TAPE_SPACE_END_OF_DATA": 4,
    "TAPE_SPACE_FILEMARKS": 6,
    "TAPE_SPACE_RELATIVE_BLOCKS": 5,
    "TAPE_SPACE_SEQUENTIAL_FMKS": 7,
    "TAPE_SPACE_SEQUENTIAL_SMKS": 9,
    "TAPE_SPACE_SETMARKS": 8
  },
  "TAPE_INFORMATION_TYPE": {
    "SET_TAPE_DRIVE_INFORMATION": 1,
    "SET_TAPE_MEDIA_INFORMATION": 0
  },
  "LOCK_FILE_FLAGS": {
    "LOCKFILE_EXCLUSIVE_LOCK": 2,
    "LOCKFILE_FAIL_IMMEDIATELY": 1
  },
  "PREPARE_TAPE_OPERATION": {
    "TAPE_FORMAT": 5,
    "TAPE_LOAD": 0,
    "TAPE_LOCK": 3,
    "TAPE_TENSION": 2,
    "TAPE_UNLOAD": 1,
    "TAPE_UNLOCK": 4
  },
  "GET_TAPE_DRIVE_PARAMETERS_OPERATION": {
    "GET_TAPE_DRIVE_INFORMATION": 1,
    "GET_TAPE_MEDIA_INFORMATION": 0
  },
  "ERASE_TAPE_TYPE": {
    "TAPE_ERASE_LONG": 1,
    "TAPE_ERASE_SHORT": 0
  },
  "SYMBOLIC_LINK_FLAGS": {
    "SYMBOLIC_LINK_FLAG_DIRECTORY": 1,
    "SYMBOLIC_LINK_FLAG_ALLOW_UNPRIVILEGED_CREATE": 2
  },
  "FILE_TYPE": {
    "FILE_TYPE_UNKNOWN": 0,
    "FILE_TYPE_DISK": 1,
    "FILE_TYPE_CHAR": 2,
    "FILE_TYPE_PIPE": 3,
    "FILE_TYPE_REMOTE": 32768
  },
  "COPYFILE_FLAGS": {
    "COPY_FILE_FAIL_IF_EXISTS": 1,
    "COPY_FILE_RESTARTABLE": 2,
    "COPY_FILE_OPEN_SOURCE_FOR_WRITE": 4,
    "COPY_FILE_ALLOW_DECRYPTED_DESTINATION": 8,
    "COPY_FILE_COPY_SYMLINK": 2048,
    "COPY_FILE_NO_BUFFERING": 4096,
    "COPY_FILE_REQUEST_SECURITY_PRIVILEGES": 8192,
    "COPY_FILE_RESUME_FROM_PAUSE": 16384,
    "COPY_FILE_NO_OFFLOAD": 262144,
    "COPY_FILE_IGNORE_EDP_BLOCK": 4194304,
    "COPY_FILE_IGNORE_SOURCE_ENCRYPTION": 8388608,
    "COPY_FILE_DONT_REQUEST_DEST_WRITE_DAC": 33554432,
    "COPY_FILE_REQUEST_COMPRESSED_TRAFFIC": 268435456,
    "COPY_FILE_OPEN_AND_COPY_REPARSE_POINT": 2097152,
    "COPY_FILE_DIRECTORY": 128,
    "COPY_FILE_SKIP_ALTERNATE_STREAMS": 32768,
    "COPY_FILE_DISABLE_PRE_ALLOCATION": 67108864,
    "COPY_FILE_ENABLE_LOW_FREE_SPACE_MODE": 134217728,
    "COPY_FILE_ENABLE_SPARSE_COPY": 536870912,
    "COPY_FILE_DISABLE_SPARSE_COPY": 2147483648
  },
  "CONSOLE_CHARACTER_ATTRIBUTES": {
    "FOREGROUND_BLUE": 1,
    "FOREGROUND_GREEN": 2,
    "FOREGROUND_RED": 4,
    "FOREGROUND_INTENSITY": 8,
    "BACKGROUND_BLUE": 16,
    "BACKGROUND_GREEN": 32,
    "BACKGROUND_RED": 64,
    "BACKGROUND_INTENSITY": 128,
    "COMMON_LVB_LEADING_BYTE": 256,
    "COMMON_LVB_TRAILING_BYTE": 512,
    "COMMON_LVB_GRID_HORIZONTAL": 1024,
    "COMMON_LVB_GRID_LVERTICAL": 2048,
    "COMMON_LVB_GRID_RVERTICAL": 4096,
    "COMMON_LVB_REVERSE_VIDEO": 16384,
    "COMMON_LVB_UNDERSCORE": 32768,
    "COMMON_LVB_SBCSDBCS": 768
  },
  "THREAD_ERROR_MODE": {
    "SEM_ALL_ERRORS": 0,
    "SEM_FAILCRITICALERRORS": 1,
    "SEM_NOGPFAULTERRORBOX": 2,
    "SEM_NOOPENFILEERRORBOX": 32768,
    "SEM_NOALIGNMENTFAULTEXCEPT": 4
  },
  "FORMAT_MESSAGE_OPTIONS": {
    "FORMAT_MESSAGE_ALLOCATE_BUFFER": 256,
    "FORMAT_MESSAGE_ARGUMENT_ARRAY": 8192,
    "FORMAT_MESSAGE_FROM_HMODULE": 2048,
    "FORMAT_MESSAGE_FROM_STRING": 1024,
    "FORMAT_MESSAGE_FROM_SYSTEM": 4096,
    "FORMAT_MESSAGE_IGNORE_INSERTS": 512
  },
  "RTL_VIRTUAL_UNWIND_HANDLER_TYPE": {
    "UNW_FLAG_NHANDLER": 0,
    "UNW_FLAG_EHANDLER": 1,
    "UNW_FLAG_UHANDLER": 2,
    "UNW_FLAG_CHAININFO": 4
  },
  "CONTEXT_FLAGS": {
    "CONTEXT_AMD64": 1048576,
    "CONTEXT_CONTROL_AMD64": 1048577,
    "CONTEXT_INTEGER_AMD64": 1048578,
    "CONTEXT_SEGMENTS_AMD64": 1048580,
    "CONTEXT_FLOATING_POINT_AMD64": 1048584,
    "CONTEXT_DEBUG_REGISTERS_AMD64": 1048592,
    "CONTEXT_FULL_AMD64": 1048587,
    "CONTEXT_ALL_AMD64": 1048607,
    "CONTEXT_XSTATE_AMD64": 1048640,
    "CONTEXT_KERNEL_CET_AMD64": 1048704,
    "CONTEXT_KERNEL_DEBUGGER_AMD64": 67108864,
    "CONTEXT_EXCEPTION_ACTIVE_AMD64": 134217728,
    "CONTEXT_SERVICE_ACTIVE_AMD64": 268435456,
    "CONTEXT_EXCEPTION_REQUEST_AMD64": 1073741824,
    "CONTEXT_EXCEPTION_REPORTING_AMD64": 2147483648,
    "CONTEXT_UNWOUND_TO_CALL_AMD64": 536870912,
    "CONTEXT_X86": 65536,
    "CONTEXT_CONTROL_X86": 65537,
    "CONTEXT_INTEGER_X86": 65538,
    "CONTEXT_SEGMENTS_X86": 65540,
    "CONTEXT_FLOATING_POINT_X86": 65544,
    "CONTEXT_DEBUG_REGISTERS_X86": 65552,
    "CONTEXT_EXTENDED_REGISTERS_X86": 65568,
    "CONTEXT_FULL_X86": 65543,
    "CONTEXT_ALL_X86": 65599,
    "CONTEXT_XSTATE_X86": 65600,
    "CONTEXT_EXCEPTION_ACTIVE_X86": 134217728,
    "CONTEXT_SERVICE_ACTIVE_X86": 268435456,
    "CONTEXT_EXCEPTION_REQUEST_X86": 1073741824,
    "CONTEXT_EXCEPTION_REPORTING_X86": 2147483648,
    "CONTEXT_ARM64": 4194304,
    "CONTEXT_CONTROL_ARM64": 4194305,
    "CONTEXT_INTEGER_ARM64": 4194306,
    "CONTEXT_FLOATING_POINT_ARM64": 4194308,
    "CONTEXT_DEBUG_REGISTERS_ARM64": 4194312,
    "CONTEXT_X18_ARM64": 4194320,
    "CONTEXT_FULL_ARM64": 4194311,
    "CONTEXT_ALL_ARM64": 4194335,
    "CONTEXT_EXCEPTION_ACTIVE_ARM64": 134217728,
    "CONTEXT_SERVICE_ACTIVE_ARM64": 268435456,
    "CONTEXT_EXCEPTION_REQUEST_ARM64": 1073741824,
    "CONTEXT_EXCEPTION_REPORTING_ARM64": 2147483648,
    "CONTEXT_UNWOUND_TO_CALL_ARM64": 536870912,
    "CONTEXT_RET_TO_GUEST_ARM64": 1073741824,
    "CONTEXT_ARM": 2097152,
    "CONTEXT_CONTROL_ARM": 2097153,
    "CONTEXT_INTEGER_ARM": 2097154,
    "CONTEXT_FLOATING_POINT_ARM": 2097156,
    "CONTEXT_DEBUG_REGISTERS_ARM": 2097160,
    "CONTEXT_FULL_ARM": 2097159,
    "CONTEXT_ALL_ARM": 2097167,
    "CONTEXT_EXCEPTION_ACTIVE_ARM": 134217728,
    "CONTEXT_SERVICE_ACTIVE_ARM": 268435456,
    "CONTEXT_EXCEPTION_REQUEST_ARM": 1073741824,
    "CONTEXT_EXCEPTION_REPORTING_ARM": 2147483648,
    "CONTEXT_UNWOUND_TO_CALL_ARM": 536870912
  },
  "CREATE_TOOLHELP_SNAPSHOT_FLAGS": {
    "TH32CS_INHERIT": 2147483648,
    "TH32CS_SNAPALL": 15,
    "TH32CS_SNAPHEAPLIST": 1,
    "TH32CS_SNAPMODULE": 8,
    "TH32CS_SNAPMODULE32": 16,
    "TH32CS_SNAPPROCESS": 2,
    "TH32CS_SNAPTHREAD": 4
  },
  "WER_FILE": {
    "WER_FILE_ANONYMOUS_DATA": 2,
    "WER_FILE_DELETE_WHEN_DONE": 1
  },
  "WER_FAULT_REPORTING": {
    "WER_FAULT_REPORTING_FLAG_DISABLE_THREAD_SUSPENSION": 4,
    "WER_FAULT_REPORTING_FLAG_NOHEAP": 1,
    "WER_FAULT_REPORTING_FLAG_QUEUE": 2,
    "WER_FAULT_REPORTING_FLAG_QUEUE_UPLOAD": 8,
    "WER_FAULT_REPORTING_ALWAYS_SHOW_UI": 16
  },
  "LOAD_LIBRARY_FLAGS": {
    "DONT_RESOLVE_DLL_REFERENCES": 1,
    "LOAD_LIBRARY_AS_DATAFILE": 2,
    "LOAD_WITH_ALTERED_SEARCH_PATH": 8,
    "LOAD_IGNORE_CODE_AUTHZ_LEVEL": 16,
    "LOAD_LIBRARY_AS_IMAGE_RESOURCE": 32,
    "LOAD_LIBRARY_AS_DATAFILE_EXCLUSIVE": 64,
    "LOAD_LIBRARY_REQUIRE_SIGNED_TARGET": 128,
    "LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR": 256,
    "LOAD_LIBRARY_SEARCH_APPLICATION_DIR": 512,
    "LOAD_LIBRARY_SEARCH_USER_DIRS": 1024,
    "LOAD_LIBRARY_SEARCH_SYSTEM32": 2048,
    "LOAD_LIBRARY_SEARCH_DEFAULT_DIRS": 4096,
    "LOAD_LIBRARY_SAFE_CURRENT_DIRS": 8192,
    "LOAD_LIBRARY_SEARCH_SYSTEM32_NO_FORWARDER": 16384
  },
  "FILE_MAP": {
    "FILE_MAP_WRITE": 2,
    "FILE_MAP_READ": 4,
    "FILE_MAP_ALL_ACCESS": 983071,
    "FILE_MAP_EXECUTE": 32,
    "FILE_MAP_COPY": 1,
    "FILE_MAP_RESERVE": 2147483648,
    "FILE_MAP_TARGETS_INVALID": 1073741824,
    "FILE_MAP_LARGE_PAGES": 536870912
  },
  "HEAP_FLAGS": {
    "HEAP_NONE": 0,
    "HEAP_NO_SERIALIZE": 1,
    "HEAP_GROWABLE": 2,
    "HEAP_GENERATE_EXCEPTIONS": 4,
    "HEAP_ZERO_MEMORY": 8,
    "HEAP_REALLOC_IN_PLACE_ONLY": 16,
    "HEAP_TAIL_CHECKING_ENABLED": 32,
    "HEAP_FREE_CHECKING_ENABLED": 64,
    "HEAP_DISABLE_COALESCE_ON_FREE": 128,
    "HEAP_CREATE_ALIGN_16": 65536,
    "HEAP_CREATE_ENABLE_TRACING": 131072,
    "HEAP_CREATE_ENABLE_EXECUTE": 262144,
    "HEAP_MAXIMUM_TAG": 4095,
    "HEAP_PSEUDO_TAG_FLAG": 32768,
    "HEAP_TAG_SHIFT": 18,
    "HEAP_CREATE_SEGMENT_HEAP": 256,
    "HEAP_CREATE_HARDENED": 512
  },
  "PAGE_PROTECTION_FLAGS": {
    "PAGE_NOACCESS": 1,
    "PAGE_READONLY": 2,
    "PAGE_READWRITE": 4,
    "PAGE_WRITECOPY": 8,
    "PAGE_EXECUTE": 16,
    "PAGE_EXECUTE_READ": 32,
    "PAGE_EXECUTE_READWRITE": 64,
    "PAGE_EXECUTE_WRITECOPY": 128,
    "PAGE_GUARD": 256,
    "PAGE_NOCACHE": 512,
    "PAGE_WRITECOMBINE": 1024,
    "PAGE_GRAPHICS_NOACCESS": 2048,
    "PAGE_GRAPHICS_READONLY": 4096,
    "PAGE_GRAPHICS_READWRITE": 8192,
    "PAGE_GRAPHICS_EXECUTE": 16384,
    "PAGE_GRAPHICS_EXECUTE_READ": 32768,
    "PAGE_GRAPHICS_EXECUTE_READWRITE": 65536,
    "PAGE_GRAPHICS_COHERENT": 131072,
    "PAGE_GRAPHICS_NOCACHE": 262144,
    "PAGE_ENCLAVE_THREAD_CONTROL": 2147483648,
    "PAGE_REVERT_TO_FILE_MAP": 2147483648,
    "PAGE_TARGETS_NO_UPDATE": 1073741824,
    "PAGE_TARGETS_INVALID": 1073741824,
    "PAGE_ENCLAVE_UNVALIDATED": 536870912,
    "PAGE_ENCLAVE_MASK": 268435456,
    "PAGE_ENCLAVE_DECOMMIT": 268435456,
    "PAGE_ENCLAVE_SS_FIRST": 268435457,
    "PAGE_ENCLAVE_SS_REST": 268435458,
    "SEC_PARTITION_OWNER_HANDLE": 262144,
    "SEC_64K_PAGES": 524288,
    "SEC_FILE": 8388608,
    "SEC_IMAGE": 16777216,
    "SEC_PROTECTED_IMAGE": 33554432,
    "SEC_RESERVE": 67108864,
    "SEC_COMMIT": 134217728,
    "SEC_NOCACHE": 268435456,
    "SEC_WRITECOMBINE": 1073741824,
    "SEC_LARGE_PAGES": 2147483648,
    "SEC_IMAGE_NO_EXECUTE": 285212672
  },
  "UNMAP_VIEW_OF_FILE_FLAGS": {
    "MEM_UNMAP_NONE": 0,
    "MEM_UNMAP_WITH_TRANSIENT_BOOST": 1,
    "MEM_PRESERVE_PLACEHOLDER": 2
  },
  "VIRTUAL_FREE_TYPE": {
    "MEM_DECOMMIT": 16384,
    "MEM_RELEASE": 32768
  },
  "VIRTUAL_ALLOCATION_TYPE": {
    "MEM_COMMIT": 4096,
    "MEM_RESERVE": 8192,
    "MEM_RESET": 524288,
    "MEM_RESET_UNDO": 16777216,
    "MEM_REPLACE_PLACEHOLDER": 16384,
    "MEM_LARGE_PAGES": 536870912,
    "MEM_RESERVE_PLACEHOLDER": 262144,
    "MEM_FREE": 65536
  },
  "LOCAL_ALLOC_FLAGS": {
    "LHND": 66,
    "LMEM_FIXED": 0,
    "LMEM_MOVEABLE": 2,
    "LMEM_ZEROINIT": 64,
    "LPTR": 64,
    "NONZEROLHND": 2,
    "NONZEROLPTR": 0
  },
  "GLOBAL_ALLOC_FLAGS": {
    "GHND": 66,
    "GMEM_FIXED": 0,
    "GMEM_MOVEABLE": 2,
    "GMEM_ZEROINIT": 64,
    "GPTR": 64
  },
  "SETPROCESSWORKINGSETSIZEEX_FLAGS": {
    "QUOTA_LIMITS_HARDWS_MIN_ENABLE": 1,
    "QUOTA_LIMITS_HARDWS_MIN_DISABLE": 2,
    "QUOTA_LIMITS_HARDWS_MAX_ENABLE": 4,
    "QUOTA_LIMITS_HARDWS_MAX_DISABLE": 8
  },
  "NAMED_PIPE_MODE": {
    "PIPE_WAIT": 0,
    "PIPE_NOWAIT": 1,
    "PIPE_READMODE_BYTE": 0,
    "PIPE_READMODE_MESSAGE": 2,
    "PIPE_CLIENT_END": 0,
    "PIPE_SERVER_END": 1,
    "PIPE_TYPE_BYTE": 0,
    "PIPE_TYPE_MESSAGE": 4,
    "PIPE_ACCEPT_REMOTE_CLIENTS": 0,
    "PIPE_REJECT_REMOTE_CLIENTS": 8
  },
  "EXECUTION_STATE": {
    "ES_AWAYMODE_REQUIRED": 64,
    "ES_CONTINUOUS": 2147483648,
    "ES_DISPLAY_REQUIRED": 2,
    "ES_SYSTEM_REQUIRED": 1,
    "ES_USER_PRESENT": 4
  },
  "REGISTER_APPLICATION_RESTART_FLAGS": {
    "RESTART_NO_CRASH": 1,
    "RESTART_NO_HANG": 2,
    "RESTART_NO_PATCH": 4,
    "RESTART_NO_REBOOT": 8
  },
  "VER_FLAGS": {
    "VER_MINORVERSION": 1,
    "VER_MAJORVERSION": 2,
    "VER_BUILDNUMBER": 4,
    "VER_PLATFORMID": 8,
    "VER_SERVICEPACKMINOR": 16,
    "VER_SERVICEPACKMAJOR": 32,
    "VER_SUITENAME": 64,
    "VER_PRODUCT_TYPE": 128
  },
  "IMAGE_FILE_MACHINE": {
    "IMAGE_FILE_MACHINE_AXP64": 644,
    "IMAGE_FILE_MACHINE_I386": 332,
    "IMAGE_FILE_MACHINE_IA64": 512,
    "IMAGE_FILE_MACHINE_AMD64": 34404,
    "IMAGE_FILE_MACHINE_UNKNOWN": 0,
    "IMAGE_FILE_MACHINE_TARGET_HOST": 1,
    "IMAGE_FILE_MACHINE_R3000": 354,
    "IMAGE_FILE_MACHINE_R4000": 358,
    "IMAGE_FILE_MACHINE_R10000": 360,
    "IMAGE_FILE_MACHINE_WCEMIPSV2": 361,
    "IMAGE_FILE_MACHINE_ALPHA": 388,
    "IMAGE_FILE_MACHINE_SH3": 418,
    "IMAGE_FILE_MACHINE_SH3DSP": 419,
    "IMAGE_FILE_MACHINE_SH3E": 420,
    "IMAGE_FILE_MACHINE_SH4": 422,
    "IMAGE_FILE_MACHINE_SH5": 424,
    "IMAGE_FILE_MACHINE_ARM": 448,
    "IMAGE_FILE_MACHINE_THUMB": 450,
    "IMAGE_FILE_MACHINE_ARMNT": 452,
    "IMAGE_FILE_MACHINE_AM33": 467,
    "IMAGE_FILE_MACHINE_POWERPC": 496,
    "IMAGE_FILE_MACHINE_POWERPCFP": 497,
    "IMAGE_FILE_MACHINE_MIPS16": 614,
    "IMAGE_FILE_MACHINE_ALPHA64": 644,
    "IMAGE_FILE_MACHINE_MIPSFPU": 870,
    "IMAGE_FILE_MACHINE_MIPSFPU16": 1126,
    "IMAGE_FILE_MACHINE_TRICORE": 1312,
    "IMAGE_FILE_MACHINE_CEF": 3311,
    "IMAGE_FILE_MACHINE_EBC": 3772,
    "IMAGE_FILE_MACHINE_M32R": 36929,
    "IMAGE_FILE_MACHINE_ARM64": 43620,
    "IMAGE_FILE_MACHINE_CEE": 49390
  },
  "FIRMWARE_TABLE_PROVIDER": {
    "ACPI": 1094930505,
    "FIRM": 1179210317,
    "RSMB": 1381190978
  },
  "USER_CET_ENVIRONMENT": {
    "USER_CET_ENVIRONMENT_WIN32_PROCESS": 0,
    "USER_CET_ENVIRONMENT_SGX2_ENCLAVE": 2,
    "USER_CET_ENVIRONMENT_VBS_ENCLAVE": 16,
    "USER_CET_ENVIRONMENT_VBS_BASIC_ENCLAVE": 17
  },
  "OS_PRODUCT_TYPE": {
    "PRODUCT_UNDEFINED": 0,
    "PRODUCT_ULTIMATE": 1,
    "PRODUCT_HOME_BASIC": 2,
    "PRODUCT_HOME_PREMIUM": 3,
    "PRODUCT_ENTERPRISE": 4,
    "PRODUCT_HOME_BASIC_N": 5,
    "PRODUCT_BUSINESS": 6,
    "PRODUCT_STANDARD_SERVER": 7,
    "PRODUCT_DATACENTER_SERVER": 8,
    "PRODUCT_SMALLBUSINESS_SERVER": 9,
    "PRODUCT_ENTERPRISE_SERVER": 10,
    "PRODUCT_STARTER": 11,
    "PRODUCT_DATACENTER_SERVER_CORE": 12,
    "PRODUCT_STANDARD_SERVER_CORE": 13,
    "PRODUCT_ENTERPRISE_SERVER_CORE": 14,
    "PRODUCT_ENTERPRISE_SERVER_IA64": 15,
    "PRODUCT_BUSINESS_N": 16,
    "PRODUCT_WEB_SERVER": 17,
    "PRODUCT_CLUSTER_SERVER": 18,
    "PRODUCT_HOME_SERVER": 19,
    "PRODUCT_STORAGE_EXPRESS_SERVER": 20,
    "PRODUCT_STORAGE_STANDARD_SERVER": 21,
    "PRODUCT_STORAGE_WORKGROUP_SERVER": 22,
    "PRODUCT_STORAGE_ENTERPRISE_SERVER": 23,
    "PRODUCT_SERVER_FOR_SMALLBUSINESS": 24,
    "PRODUCT_SMALLBUSINESS_SERVER_PREMIUM": 25,
    "PRODUCT_HOME_PREMIUM_N": 26,
    "PRODUCT_ENTERPRISE_N": 27,
    "PRODUCT_ULTIMATE_N": 28,
    "PRODUCT_WEB_SERVER_CORE": 29,
    "PRODUCT_MEDIUMBUSINESS_SERVER_MANAGEMENT": 30,
    "PRODUCT_MEDIUMBUSINESS_SERVER_SECURITY": 31,
    "PRODUCT_MEDIUMBUSINESS_SERVER_MESSAGING": 32,
    "PRODUCT_SERVER_FOUNDATION": 33,
    "PRODUCT_HOME_PREMIUM_SERVER": 34,
    "PRODUCT_SERVER_FOR_SMALLBUSINESS_V": 35,
    "PRODUCT_STANDARD_SERVER_V": 36,
    "PRODUCT_DATACENTER_SERVER_V": 37,
    "PRODUCT_ENTERPRISE_SERVER_V": 38,
    "PRODUCT_DATACENTER_SERVER_CORE_V": 39,
    "PRODUCT_STANDARD_SERVER_CORE_V": 40,
    "PRODUCT_ENTERPRISE_SERVER_CORE_V": 41,
    "PRODUCT_HYPERV": 42,
    "PRODUCT_STORAGE_EXPRESS_SERVER_CORE": 43,
    "PRODUCT_STORAGE_STANDARD_SERVER_CORE": 44,
    "PRODUCT_STORAGE_WORKGROUP_SERVER_CORE": 45,
    "PRODUCT_STORAGE_ENTERPRISE_SERVER_CORE": 46,
    "PRODUCT_STARTER_N": 47,
    "PRODUCT_PROFESSIONAL": 48,
    "PRODUCT_PROFESSIONAL_N": 49,
    "PRODUCT_SB_SOLUTION_SERVER": 50,
    "PRODUCT_SERVER_FOR_SB_SOLUTIONS": 51,
    "PRODUCT_STANDARD_SERVER_SOLUTIONS": 52,
    "PRODUCT_STANDARD_SERVER_SOLUTIONS_CORE": 53,
    "PRODUCT_SB_SOLUTION_SERVER_EM": 54,
    "PRODUCT_SERVER_FOR_SB_SOLUTIONS_EM": 55,
    "PRODUCT_SOLUTION_EMBEDDEDSERVER": 56,
    "PRODUCT_SOLUTION_EMBEDDEDSERVER_CORE": 57,
    "PRODUCT_PROFESSIONAL_EMBEDDED": 58,
    "PRODUCT_ESSENTIALBUSINESS_SERVER_MGMT": 59,
    "PRODUCT_ESSENTIALBUSINESS_SERVER_ADDL": 60,
    "PRODUCT_ESSENTIALBUSINESS_SERVER_MGMTSVC": 61,
    "PRODUCT_ESSENTIALBUSINESS_SERVER_ADDLSVC": 62,
    "PRODUCT_SMALLBUSINESS_SERVER_PREMIUM_CORE": 63,
    "PRODUCT_CLUSTER_SERVER_V": 64,
    "PRODUCT_EMBEDDED": 65,
    "PRODUCT_STARTER_E": 66,
    "PRODUCT_HOME_BASIC_E": 67,
    "PRODUCT_HOME_PREMIUM_E": 68,
    "PRODUCT_PROFESSIONAL_E": 69,
    "PRODUCT_ENTERPRISE_E": 70,
    "PRODUCT_ULTIMATE_E": 71,
    "PRODUCT_ENTERPRISE_EVALUATION": 72,
    "PRODUCT_MULTIPOINT_STANDARD_SERVER": 76,
    "PRODUCT_MULTIPOINT_PREMIUM_SERVER": 77,
    "PRODUCT_STANDARD_EVALUATION_SERVER": 79,
    "PRODUCT_DATACENTER_EVALUATION_SERVER": 80,
    "PRODUCT_ENTERPRISE_N_EVALUATION": 84,
    "PRODUCT_EMBEDDED_AUTOMOTIVE": 85,
    "PRODUCT_EMBEDDED_INDUSTRY_A": 86,
    "PRODUCT_THINPC": 87,
    "PRODUCT_EMBEDDED_A": 88,
    "PRODUCT_EMBEDDED_INDUSTRY": 89,
    "PRODUCT_EMBEDDED_E": 90,
    "PRODUCT_EMBEDDED_INDUSTRY_E": 91,
    "PRODUCT_EMBEDDED_INDUSTRY_A_E": 92,
    "PRODUCT_STORAGE_WORKGROUP_EVALUATION_SERVER": 95,
    "PRODUCT_STORAGE_STANDARD_EVALUATION_SERVER": 96,
    "PRODUCT_CORE_ARM": 97,
    "PRODUCT_CORE_N": 98,
    "PRODUCT_CORE_COUNTRYSPECIFIC": 99,
    "PRODUCT_CORE_SINGLELANGUAGE": 100,
    "PRODUCT_CORE": 101,
    "PRODUCT_PROFESSIONAL_WMC": 103,
    "PRODUCT_EMBEDDED_INDUSTRY_EVAL": 105,
    "PRODUCT_EMBEDDED_INDUSTRY_E_EVAL": 106,
    "PRODUCT_EMBEDDED_EVAL": 107,
    "PRODUCT_EMBEDDED_E_EVAL": 108,
    "PRODUCT_NANO_SERVER": 109,
    "PRODUCT_CLOUD_STORAGE_SERVER": 110,
    "PRODUCT_CORE_CONNECTED": 111,
    "PRODUCT_PROFESSIONAL_STUDENT": 112,
    "PRODUCT_CORE_CONNECTED_N": 113,
    "PRODUCT_PROFESSIONAL_STUDENT_N": 114,
    "PRODUCT_CORE_CONNECTED_SINGLELANGUAGE": 115,
    "PRODUCT_CORE_CONNECTED_COUNTRYSPECIFIC": 116,
    "PRODUCT_CONNECTED_CAR": 117,
    "PRODUCT_INDUSTRY_HANDHELD": 118,
    "PRODUCT_PPI_PRO": 119,
    "PRODUCT_ARM64_SERVER": 120,
    "PRODUCT_EDUCATION": 121,
    "PRODUCT_EDUCATION_N": 122,
    "PRODUCT_IOTUAP": 123,
    "PRODUCT_CLOUD_HOST_INFRASTRUCTURE_SERVER": 124,
    "PRODUCT_ENTERPRISE_S": 125,
    "PRODUCT_ENTERPRISE_S_N": 126,
    "PRODUCT_PROFESSIONAL_S": 127,
    "PRODUCT_PROFESSIONAL_S_N": 128,
    "PRODUCT_ENTERPRISE_S_EVALUATION": 129,
    "PRODUCT_ENTERPRISE_S_N_EVALUATION": 130,
    "PRODUCT_HOLOGRAPHIC": 135,
    "PRODUCT_HOLOGRAPHIC_BUSINESS": 136,
    "PRODUCT_PRO_SINGLE_LANGUAGE": 138,
    "PRODUCT_PRO_CHINA": 139,
    "PRODUCT_ENTERPRISE_SUBSCRIPTION": 140,
    "PRODUCT_ENTERPRISE_SUBSCRIPTION_N": 141,
    "PRODUCT_DATACENTER_NANO_SERVER": 143,
    "PRODUCT_STANDARD_NANO_SERVER": 144,
    "PRODUCT_DATACENTER_A_SERVER_CORE": 145,
    "PRODUCT_STANDARD_A_SERVER_CORE": 146,
    "PRODUCT_DATACENTER_WS_SERVER_CORE": 147,
    "PRODUCT_STANDARD_WS_SERVER_CORE": 148,
    "PRODUCT_UTILITY_VM": 149,
    "PRODUCT_DATACENTER_EVALUATION_SERVER_CORE": 159,
    "PRODUCT_STANDARD_EVALUATION_SERVER_CORE": 160,
    "PRODUCT_PRO_WORKSTATION": 161,
    "PRODUCT_PRO_WORKSTATION_N": 162,
    "PRODUCT_PRO_FOR_EDUCATION": 164,
    "PRODUCT_PRO_FOR_EDUCATION_N": 165,
    "PRODUCT_AZURE_SERVER_CORE": 168,
    "PRODUCT_AZURE_NANO_SERVER": 169,
    "PRODUCT_ENTERPRISEG": 171,
    "PRODUCT_ENTERPRISEGN": 172,
    "PRODUCT_SERVERRDSH": 175,
    "PRODUCT_CLOUD": 178,
    "PRODUCT_CLOUDN": 179,
    "PRODUCT_HUBOS": 180,
    "PRODUCT_ONECOREUPDATEOS": 182,
    "PRODUCT_CLOUDE": 183,
    "PRODUCT_IOTOS": 185,
    "PRODUCT_CLOUDEN": 186,
    "PRODUCT_IOTEDGEOS": 187,
    "PRODUCT_IOTENTERPRISE": 188,
    "PRODUCT_LITE": 189,
    "PRODUCT_IOTENTERPRISES": 191,
    "PRODUCT_XBOX_SYSTEMOS": 192,
    "PRODUCT_XBOX_GAMEOS": 194,
    "PRODUCT_XBOX_ERAOS": 195,
    "PRODUCT_XBOX_DURANGOHOSTOS": 196,
    "PRODUCT_XBOX_SCARLETTHOSTOS": 197,
    "PRODUCT_XBOX_KEYSTONE": 198,
    "PRODUCT_AZURE_SERVER_CLOUDHOST": 199,
    "PRODUCT_AZURE_SERVER_CLOUDMOS": 200,
    "PRODUCT_CLOUDEDITIONN": 202,
    "PRODUCT_CLOUDEDITION": 203,
    "PRODUCT_VALIDATION": 204,
    "PRODUCT_IOTENTERPRISESK": 205,
    "PRODUCT_IOTENTERPRISEK": 206,
    "PRODUCT_IOTENTERPRISESEVAL": 207,
    "PRODUCT_AZURE_SERVER_AGENTBRIDGE": 208,
    "PRODUCT_AZURE_SERVER_NANOHOST": 209,
    "PRODUCT_WNC": 210,
    "PRODUCT_AZURESTACKHCI_SERVER_CORE": 406,
    "PRODUCT_DATACENTER_SERVER_AZURE_EDITION": 407,
    "PRODUCT_DATACENTER_SERVER_CORE_AZURE_EDITION": 408,
    "PRODUCT_DATACENTER_WS_SERVER_CORE_AZURE_EDITION": 409,
    "PRODUCT_UNLICENSED": 2882382797
  },
  "THREAD_CREATION_FLAGS": {
    "THREAD_CREATE_RUN_IMMEDIATELY": 0,
    "THREAD_CREATE_SUSPENDED": 4,
    "STACK_SIZE_PARAM_IS_A_RESERVATION": 65536
  },
  "THREAD_PRIORITY": {
    "THREAD_MODE_BACKGROUND_BEGIN": 65536,
    "THREAD_MODE_BACKGROUND_END": 131072,
    "THREAD_PRIORITY_ABOVE_NORMAL": 1,
    "THREAD_PRIORITY_BELOW_NORMAL": -1,
    "THREAD_PRIORITY_HIGHEST": 2,
    "THREAD_PRIORITY_IDLE": -15,
    "THREAD_PRIORITY_MIN": -2,
    "THREAD_PRIORITY_LOWEST": -2,
    "THREAD_PRIORITY_NORMAL": 0,
    "THREAD_PRIORITY_TIME_CRITICAL": 15
  },
  "WORKER_THREAD_FLAGS": {
    "WT_EXECUTEDEFAULT": 0,
    "WT_EXECUTEINIOTHREAD": 1,
    "WT_EXECUTEINPERSISTENTTHREAD": 128,
    "WT_EXECUTEINWAITTHREAD": 4,
    "WT_EXECUTELONGFUNCTION": 16,
    "WT_EXECUTEONLYONCE": 8,
    "WT_TRANSFER_IMPERSONATION": 256,
    "WT_EXECUTEINTIMERTHREAD": 32
  },
  "CREATE_EVENT": {
    "CREATE_EVENT_INITIAL_SET": 2,
    "CREATE_EVENT_MANUAL_RESET": 1
  },
  "PROCESS_AFFINITY_AUTO_UPDATE_FLAGS": {
    "PROCESS_AFFINITY_DISABLE_AUTO_UPDATE": 0,
    "PROCESS_AFFINITY_ENABLE_AUTO_UPDATE": 1
  },
  "PROCESS_DEP_FLAGS": {
    "PROCESS_DEP_ENABLE": 1,
    "PROCESS_DEP_DISABLE_ATL_THUNK_EMULATION": 2,
    "PROCESS_DEP_NONE": 0
  },
  "PROCESS_NAME_FORMAT": {
    "PROCESS_NAME_WIN32": 0,
    "PROCESS_NAME_NATIVE": 1
  },
  "PROCESSOR_FEATURE_ID": {
    "PF_FLOATING_POINT_PRECISION_ERRATA": 0,
    "PF_FLOATING_POINT_EMULATED": 1,
    "PF_COMPARE_EXCHANGE_DOUBLE": 2,
    "PF_MMX_INSTRUCTIONS_AVAILABLE": 3,
    "PF_PPC_MOVEMEM_64BIT_OK": 4,
    "PF_ALPHA_BYTE_INSTRUCTIONS": 5,
    "PF_XMMI_INSTRUCTIONS_AVAILABLE": 6,
    "PF_3DNOW_INSTRUCTIONS_AVAILABLE": 7,
    "PF_RDTSC_INSTRUCTION_AVAILABLE": 8,
    "PF_PAE_ENABLED": 9,
    "PF_XMMI64_INSTRUCTIONS_AVAILABLE": 10,
    "PF_SSE_DAZ_MODE_AVAILABLE": 11,
    "PF_NX_ENABLED": 12,
    "PF_SSE3_INSTRUCTIONS_AVAILABLE": 13,
    "PF_COMPARE_EXCHANGE128": 14,
    "PF_COMPARE64_EXCHANGE128": 15,
    "PF_CHANNELS_ENABLED": 16,
    "PF_XSAVE_ENABLED": 17,
    "PF_ARM_VFP_32_REGISTERS_AVAILABLE": 18,
    "PF_ARM_NEON_INSTRUCTIONS_AVAILABLE": 19,
    "PF_SECOND_LEVEL_ADDRESS_TRANSLATION": 20,
    "PF_VIRT_FIRMWARE_ENABLED": 21,
    "PF_RDWRFSGSBASE_AVAILABLE": 22,
    "PF_FASTFAIL_AVAILABLE": 23,
    "PF_ARM_DIVIDE_INSTRUCTION_AVAILABLE": 24,
    "PF_ARM_64BIT_LOADSTORE_ATOMIC": 25,
    "PF_ARM_EXTERNAL_CACHE_AVAILABLE": 26,
    "PF_ARM_FMAC_INSTRUCTIONS_AVAILABLE": 27,
    "PF_RDRAND_INSTRUCTION_AVAILABLE": 28,
    "PF_ARM_V8_INSTRUCTIONS_AVAILABLE": 29,
    "PF_ARM_V8_CRYPTO_INSTRUCTIONS_AVAILABLE": 30,
    "PF_ARM_V8_CRC32_INSTRUCTIONS_AVAILABLE": 31,
    "PF_RDTSCP_INSTRUCTION_AVAILABLE": 32,
    "PF_RDPID_INSTRUCTION_AVAILABLE": 33,
    "PF_ARM_V81_ATOMIC_INSTRUCTIONS_AVAILABLE": 34,
    "PF_MONITORX_INSTRUCTION_AVAILABLE": 35,
    "PF_SSSE3_INSTRUCTIONS_AVAILABLE": 36,
    "PF_SSE4_1_INSTRUCTIONS_AVAILABLE": 37,
    "PF_SSE4_2_INSTRUCTIONS_AVAILABLE": 38,
    "PF_AVX_INSTRUCTIONS_AVAILABLE": 39,
    "PF_AVX2_INSTRUCTIONS_AVAILABLE": 40,
    "PF_AVX512F_INSTRUCTIONS_AVAILABLE": 41,
    "PF_ERMS_AVAILABLE": 42,
    "PF_ARM_V82_DP_INSTRUCTIONS_AVAILABLE": 43,
    "PF_ARM_V83_JSCVT_INSTRUCTIONS_AVAILABLE": 44,
    "PF_ARM_V83_LRCPC_INSTRUCTIONS_AVAILABLE": 45,
    "PF_ARM_SVE_INSTRUCTIONS_AVAILABLE": 46,
    "PF_ARM_SVE2_INSTRUCTIONS_AVAILABLE": 47,
    "PF_ARM_SVE2_1_INSTRUCTIONS_AVAILABLE": 48,
    "PF_ARM_SVE_AES_INSTRUCTIONS_AVAILABLE": 49,
    "PF_ARM_SVE_PMULL128_INSTRUCTIONS_AVAILABLE": 50,
    "PF_ARM_SVE_BITPERM_INSTRUCTIONS_AVAILABLE": 51,
    "PF_ARM_SVE_BF16_INSTRUCTIONS_AVAILABLE": 52,
    "PF_ARM_SVE_EBF16_INSTRUCTIONS_AVAILABLE": 53,
    "PF_ARM_SVE_B16B16_INSTRUCTIONS_AVAILABLE": 54,
    "PF_ARM_SVE_SHA3_INSTRUCTIONS_AVAILABLE": 55,
    "PF_ARM_SVE_SM4_INSTRUCTIONS_AVAILABLE": 56,
    "PF_ARM_SVE_I8MM_INSTRUCTIONS_AVAILABLE": 57,
    "PF_ARM_SVE_F32MM_INSTRUCTIONS_AVAILABLE": 58,
    "PF_ARM_SVE_F64MM_INSTRUCTIONS_AVAILABLE": 59,
    "PF_BMI2_INSTRUCTIONS_AVAILABLE": 60,
    "PF_MOVDIR64B_INSTRUCTION_AVAILABLE": 61,
    "PF_ARM_LSE2_AVAILABLE": 62,
    "PF_RESERVED_FEATURE": 63,
    "PF_ARM_SHA3_INSTRUCTIONS_AVAILABLE": 64,
    "PF_ARM_SHA512_INSTRUCTIONS_AVAILABLE": 65,
    "PF_ARM_V82_I8MM_INSTRUCTIONS_AVAILABLE": 66,
    "PF_ARM_V82_FP16_INSTRUCTIONS_AVAILABLE": 67,
    "PF_ARM_V86_BF16_INSTRUCTIONS_AVAILABLE": 68,
    "PF_ARM_V86_EBF16_INSTRUCTIONS_AVAILABLE": 69,
    "PF_ARM_SME_INSTRUCTIONS_AVAILABLE": 70,
    "PF_ARM_SME2_INSTRUCTIONS_AVAILABLE": 71,
    "PF_ARM_SME2_1_INSTRUCTIONS_AVAILABLE": 72,
    "PF_ARM_SME2_2_INSTRUCTIONS_AVAILABLE": 73,
    "PF_ARM_SME_AES_INSTRUCTIONS_AVAILABLE": 74,
    "PF_ARM_SME_SBITPERM_INSTRUCTIONS_AVAILABLE": 75,
    "PF_ARM_SME_SF8MM4_INSTRUCTIONS_AVAILABLE": 76,
    "PF_ARM_SME_SF8MM8_INSTRUCTIONS_AVAILABLE": 77,
    "PF_ARM_SME_SF8DP2_INSTRUCTIONS_AVAILABLE": 78,
    "PF_ARM_SME_SF8DP4_INSTRUCTIONS_AVAILABLE": 79,
    "PF_ARM_SME_SF8FMA_INSTRUCTIONS_AVAILABLE": 80,
    "PF_ARM_SME_F8F32_INSTRUCTIONS_AVAILABLE": 81,
    "PF_ARM_SME_F8F16_INSTRUCTIONS_AVAILABLE": 82,
    "PF_ARM_SME_F16F16_INSTRUCTIONS_AVAILABLE": 83,
    "PF_ARM_SME_B16B16_INSTRUCTIONS_AVAILABLE": 84,
    "PF_ARM_SME_F64F64_INSTRUCTIONS_AVAILABLE": 85,
    "PF_ARM_SME_I16I64_INSTRUCTIONS_AVAILABLE": 86,
    "PF_ARM_SME_LUTv2_INSTRUCTIONS_AVAILABLE": 87,
    "PF_ARM_SME_FA64_INSTRUCTIONS_AVAILABLE": 88
  },
  "STARTUPINFOW_FLAGS": {
    "STARTF_FORCEONFEEDBACK": 64,
    "STARTF_FORCEOFFFEEDBACK": 128,
    "STARTF_PREVENTPINNING": 8192,
    "STARTF_RUNFULLSCREEN": 32,
    "STARTF_TITLEISAPPID": 4096,
    "STARTF_TITLEISLINKNAME": 2048,
    "STARTF_UNTRUSTEDSOURCE": 32768,
    "STARTF_USECOUNTCHARS": 8,
    "STARTF_USEFILLATTRIBUTE": 16,
    "STARTF_USEHOTKEY": 512,
    "STARTF_USEPOSITION": 4,
    "STARTF_USESHOWWINDOW": 1,
    "STARTF_USESIZE": 2,
    "STARTF_USESTDHANDLES": 256
  },
  "THREAD_ACCESS_RIGHTS": {
    "THREAD_TERMINATE": 1,
    "THREAD_SUSPEND_RESUME": 2,
    "THREAD_GET_CONTEXT": 8,
    "THREAD_SET_CONTEXT": 16,
    "THREAD_SET_INFORMATION": 32,
    "THREAD_QUERY_INFORMATION": 64,
    "THREAD_SET_THREAD_TOKEN": 128,
    "THREAD_IMPERSONATE": 256,
    "THREAD_DIRECT_IMPERSONATION": 512,
    "THREAD_SET_LIMITED_INFORMATION": 1024,
    "THREAD_QUERY_LIMITED_INFORMATION": 2048,
    "THREAD_RESUME": 4096,
    "THREAD_ALL_ACCESS": 2097151,
    "THREAD_DELETE": 65536,
    "THREAD_READ_CONTROL": 131072,
    "THREAD_WRITE_DAC": 262144,
    "THREAD_WRITE_OWNER": 524288,
    "THREAD_SYNCHRONIZE": 1048576,
    "THREAD_STANDARD_RIGHTS_REQUIRED": 983040
  },
  "SYNCHRONIZATION_ACCESS_RIGHTS": {
    "EVENT_ALL_ACCESS": 2031619,
    "EVENT_MODIFY_STATE": 2,
    "MUTEX_ALL_ACCESS": 2031617,
    "MUTEX_MODIFY_STATE": 1,
    "SEMAPHORE_ALL_ACCESS": 2031619,
    "SEMAPHORE_MODIFY_STATE": 2,
    "TIMER_ALL_ACCESS": 2031619,
    "TIMER_MODIFY_STATE": 2,
    "TIMER_QUERY_STATE": 1,
    "SYNCHRONIZATION_DELETE": 65536,
    "SYNCHRONIZATION_READ_CONTROL": 131072,
    "SYNCHRONIZATION_WRITE_DAC": 262144,
    "SYNCHRONIZATION_WRITE_OWNER": 524288,
    "SYNCHRONIZATION_SYNCHRONIZE": 1048576
  },
  "PROCESS_CREATION_FLAGS": {
    "DEBUG_PROCESS": 1,
    "DEBUG_ONLY_THIS_PROCESS": 2,
    "CREATE_SUSPENDED": 4,
    "DETACHED_PROCESS": 8,
    "CREATE_NEW_CONSOLE": 16,
    "NORMAL_PRIORITY_CLASS": 32,
    "IDLE_PRIORITY_CLASS": 64,
    "HIGH_PRIORITY_CLASS": 128,
    "REALTIME_PRIORITY_CLASS": 256,
    "CREATE_NEW_PROCESS_GROUP": 512,
    "CREATE_UNICODE_ENVIRONMENT": 1024,
    "CREATE_SEPARATE_WOW_VDM": 2048,
    "CREATE_SHARED_WOW_VDM": 4096,
    "CREATE_FORCEDOS": 8192,
    "BELOW_NORMAL_PRIORITY_CLASS": 16384,
    "ABOVE_NORMAL_PRIORITY_CLASS": 32768,
    "INHERIT_PARENT_AFFINITY": 65536,
    "INHERIT_CALLER_PRIORITY": 131072,
    "CREATE_PROTECTED_PROCESS": 262144,
    "EXTENDED_STARTUPINFO_PRESENT": 524288,
    "PROCESS_MODE_BACKGROUND_BEGIN": 1048576,
    "PROCESS_MODE_BACKGROUND_END": 2097152,
    "CREATE_SECURE_PROCESS": 4194304,
    "CREATE_BREAKAWAY_FROM_JOB": 16777216,
    "CREATE_PRESERVE_CODE_AUTHZ_LEVEL": 33554432,
    "CREATE_DEFAULT_ERROR_MODE": 67108864,
    "CREATE_NO_WINDOW": 134217728,
    "PROFILE_USER": 268435456,
    "PROFILE_KERNEL": 536870912,
    "PROFILE_SERVER": 1073741824,
    "CREATE_IGNORE_SYSTEM_DEFAULT": 2147483648
  },
  "PROCESS_ACCESS_RIGHTS": {
    "PROCESS_TERMINATE": 1,
    "PROCESS_CREATE_THREAD": 2,
    "PROCESS_SET_SESSIONID": 4,
    "PROCESS_VM_OPERATION": 8,
    "PROCESS_VM_READ": 16,
    "PROCESS_VM_WRITE": 32,
    "PROCESS_DUP_HANDLE": 64,
    "PROCESS_CREATE_PROCESS": 128,
    "PROCESS_SET_QUOTA": 256,
    "PROCESS_SET_INFORMATION": 512,
    "PROCESS_QUERY_INFORMATION": 1024,
    "PROCESS_SUSPEND_RESUME": 2048,
    "PROCESS_QUERY_LIMITED_INFORMATION": 4096,
    "PROCESS_SET_LIMITED_INFORMATION": 8192,
    "PROCESS_ALL_ACCESS": 2097151,
    "PROCESS_DELETE": 65536,
    "PROCESS_READ_CONTROL": 131072,
    "PROCESS_WRITE_DAC": 262144,
    "PROCESS_WRITE_OWNER": 524288,
    "PROCESS_SYNCHRONIZE": 1048576,
    "PROCESS_STANDARD_RIGHTS_REQUIRED": 983040
  },
  "FINDEX_INFO_LEVELS": {
    "FindExInfoStandard": 0,
    "FindExInfoBasic": 1,
    "FindExInfoMaxInfoLevel": 2
  },
  "FINDEX_SEARCH_OPS": {
    "FindExSearchNameMatch": 0,
    "FindExSearchLimitToDirectories": 1,
    "FindExSearchLimitToDevices": 2,
    "FindExSearchMaxSearchOp": 3
  },
  "READ_DIRECTORY_NOTIFY_INFORMATION_CLASS": {
    "ReadDirectoryNotifyInformation": 1,
    "ReadDirectoryNotifyExtendedInformation": 2,
    "ReadDirectoryNotifyFullInformation": 3,
    "ReadDirectoryNotifyMaximumInformation": 4
  },
  "GET_FILEEX_INFO_LEVELS": {
    "GetFileExInfoStandard": 0,
    "GetFileExMaxInfoLevel": 1
  },
  "FILE_INFO_BY_HANDLE_CLASS": {
    "FileBasicInfo": 0,
    "FileStandardInfo": 1,
    "FileNameInfo": 2,
    "FileRenameInfo": 3,
    "FileDispositionInfo": 4,
    "FileAllocationInfo": 5,
    "FileEndOfFileInfo": 6,
    "FileStreamInfo": 7,
    "FileCompressionInfo": 8,
    "FileAttributeTagInfo": 9,
    "FileIdBothDirectoryInfo": 10,
    "FileIdBothDirectoryRestartInfo": 11,
    "FileIoPriorityHintInfo": 12,
    "FileRemoteProtocolInfo": 13,
    "FileFullDirectoryInfo": 14,
    "FileFullDirectoryRestartInfo": 15,
    "FileStorageInfo": 16,
    "FileAlignmentInfo": 17,
    "FileIdInfo": 18,
    "FileIdExtdDirectoryInfo": 19,
    "FileIdExtdDirectoryRestartInfo": 20,
    "FileDispositionInfoEx": 21,
    "FileRenameInfoEx": 22,
    "FileCaseSensitiveInfo": 23,
    "FileNormalizedNameInfo": 24,
    "MaximumFileInfoByHandleClass": 25
  },
  "FILE_INFO_BY_NAME_CLASS": {
    "FileStatByNameInfo": 0,
    "FileStatLxByNameInfo": 1,
    "FileCaseSensitiveByNameInfo": 2,
    "FileStatBasicByNameInfo": 3,
    "MaximumFileInfoByNameClass": 4
  },
  "ALLOC_CONSOLE_RESULT": {
    "ALLOC_CONSOLE_RESULT_NO_CONSOLE": 0,
    "ALLOC_CONSOLE_RESULT_NEW_CONSOLE": 1,
    "ALLOC_CONSOLE_RESULT_EXISTING_CONSOLE": 2
  },
  "STREAM_INFO_LEVELS": {
    "FindStreamInfoStandard": 0,
    "FindStreamInfoMaxInfoLevel": 1
  },
  "DIRECTORY_FLAGS": {
    "DIRECTORY_FLAGS_NONE": 0,
    "DIRECTORY_FLAGS_DISALLOW_PATH_REDIRECTS": 1
  },
  "IORING_SQE_FLAGS": {
    "IOSQE_FLAGS_NONE": 0,
    "IOSQE_FLAGS_DRAIN_PRECEDING_OPS": 1
  },
  "SYSGEOTYPE": {
    "GEO_NATION": 1,
    "GEO_LATITUDE": 2,
    "GEO_LONGITUDE": 3,
    "GEO_ISO2": 4,
    "GEO_ISO3": 5,
    "GEO_RFC1766": 6,
    "GEO_LCID": 7,
    "GEO_FRIENDLYNAME": 8,
    "GEO_OFFICIALNAME": 9,
    "GEO_TIMEZONES": 10,
    "GEO_OFFICIALLANGUAGES": 11,
    "GEO_ISO_UN_NUMBER": 12,
    "GEO_PARENT": 13,
    "GEO_DIALINGCODE": 14,
    "GEO_CURRENCYCODE": 15,
    "GEO_CURRENCYSYMBOL": 16,
    "GEO_NAME": 17,
    "GEO_ID": 18
  },
  "SYSGEOCLASS": {
    "GEOCLASS_NATION": 16,
    "GEOCLASS_REGION": 14,
    "GEOCLASS_ALL": 0
  },
  "NORM_FORM": {
    "NormalizationOther": 0,
    "NormalizationC": 1,
    "NormalizationD": 2,
    "NormalizationKC": 5,
    "NormalizationKD": 6
  },
  "CALDATETIME_DATEUNIT": {
    "EraUnit": 0,
    "YearUnit": 1,
    "MonthUnit": 2,
    "WeekUnit": 3,
    "DayUnit": 4,
    "HourUnit": 5,
    "MinuteUnit": 6,
    "SecondUnit": 7,
    "TickUnit": 8
  },
  "MEMORY_RESOURCE_NOTIFICATION_TYPE": {
    "LowMemoryResourceNotification": 0,
    "HighMemoryResourceNotification": 1
  },
  "OFFER_PRIORITY": {
    "VmOfferPriorityVeryLow": 1,
    "VmOfferPriorityLow": 2,
    "VmOfferPriorityBelowNormal": 3,
    "VmOfferPriorityNormal": 4
  },
  "PSS_CAPTURE_FLAGS": {
    "PSS_CAPTURE_NONE": 0,
    "PSS_CAPTURE_VA_CLONE": 1,
    "PSS_CAPTURE_RESERVED_00000002": 2,
    "PSS_CAPTURE_HANDLES": 4,
    "PSS_CAPTURE_HANDLE_NAME_INFORMATION": 8,
    "PSS_CAPTURE_HANDLE_BASIC_INFORMATION": 16,
    "PSS_CAPTURE_HANDLE_TYPE_SPECIFIC_INFORMATION": 32,
    "PSS_CAPTURE_HANDLE_TRACE": 64,
    "PSS_CAPTURE_THREADS": 128,
    "PSS_CAPTURE_THREAD_CONTEXT": 256,
    "PSS_CAPTURE_THREAD_CONTEXT_EXTENDED": 512,
    "PSS_CAPTURE_RESERVED_00000400": 1024,
    "PSS_CAPTURE_VA_SPACE": 2048,
    "PSS_CAPTURE_VA_SPACE_SECTION_INFORMATION": 4096,
    "PSS_CAPTURE_IPT_TRACE": 8192,
    "PSS_CAPTURE_RESERVED_00004000": 16384,
    "PSS_CREATE_BREAKAWAY_OPTIONAL": 67108864,
    "PSS_CREATE_BREAKAWAY": 134217728,
    "PSS_CREATE_FORCE_BREAKAWAY": 268435456,
    "PSS_CREATE_USE_VM_ALLOCATIONS": 536870912,
    "PSS_CREATE_MEASURE_PERFORMANCE": 1073741824,
    "PSS_CREATE_RELEASE_SECTION": 2147483648
  },
  "PSS_QUERY_INFORMATION_CLASS": {
    "PSS_QUERY_PROCESS_INFORMATION": 0,
    "PSS_QUERY_VA_CLONE_INFORMATION": 1,
    "PSS_QUERY_AUXILIARY_PAGES_INFORMATION": 2,
    "PSS_QUERY_VA_SPACE_INFORMATION": 3,
    "PSS_QUERY_HANDLE_INFORMATION": 4,
    "PSS_QUERY_THREAD_INFORMATION": 5,
    "PSS_QUERY_HANDLE_TRACE_INFORMATION": 6,
    "PSS_QUERY_PERFORMANCE_COUNTERS": 7
  },
  "PSS_WALK_INFORMATION_CLASS": {
    "PSS_WALK_AUXILIARY_PAGES": 0,
    "PSS_WALK_VA_SPACE": 1,
    "PSS_WALK_HANDLES": 2,
    "PSS_WALK_THREADS": 3,
    "PSS_WALK_THREAD_NAME": 4
  },
  "PSS_DUPLICATE_FLAGS": {
    "PSS_DUPLICATE_NONE": 0,
    "PSS_DUPLICATE_CLOSE_SOURCE": 1
  },
  "COMPUTER_NAME_FORMAT": {
    "ComputerNameNetBIOS": 0,
    "ComputerNameDnsHostname": 1,
    "ComputerNameDnsDomain": 2,
    "ComputerNameDnsFullyQualified": 3,
    "ComputerNamePhysicalNetBIOS": 4,
    "ComputerNamePhysicalDnsHostname": 5,
    "ComputerNamePhysicalDnsDomain": 6,
    "ComputerNamePhysicalDnsFullyQualified": 7,
    "ComputerNameMax": 8
  },
  "QUEUE_USER_APC_FLAGS": {
    "QUEUE_USER_APC_FLAGS_NONE": 0,
    "QUEUE_USER_APC_FLAGS_SPECIAL_USER_APC": 1,
    "QUEUE_USER_APC_CALLBACK_DATA_CONTEXT": 65536
  },
  "THREAD_INFORMATION_CLASS": {
    "ThreadMemoryPriority": 0,
    "ThreadAbsoluteCpuPriority": 1,
    "ThreadDynamicCodePolicy": 2,
    "ThreadPowerThrottling": 3,
    "ThreadInformationClassMax": 4
  },
  "PROCESS_INFORMATION_CLASS": {
    "ProcessMemoryPriority": 0,
    "ProcessMemoryExhaustionInfo": 1,
    "ProcessAppMemoryInfo": 2,
    "ProcessInPrivateInfo": 3,
    "ProcessPowerThrottling": 4,
    "ProcessReservedValue1": 5,
    "ProcessTelemetryCoverageInfo": 6,
    "ProcessProtectionLevelInfo": 7,
    "ProcessLeapSecondInfo": 8,
    "ProcessMachineTypeInfo": 9,
    "ProcessOverrideSubsequentPrefetchParameter": 10,
    "ProcessMaxOverridePrefetchParameter": 11,
    "ProcessInformationClassMax": 12
  },
  "MACHINE_ATTRIBUTES": {
    "UserEnabled": 1,
    "KernelEnabled": 2,
    "Wow64Container": 4
  },
  "WER_REGISTER_FILE_TYPE": {
    "WerRegFileTypeUserDocument": 1,
    "WerRegFileTypeOther": 2,
    "WerRegFileTypeMax": 3
  },
  "CreatePackageDependencyOptions": {
    "CreatePackageDependencyOptions_None": 0,
    "CreatePackageDependencyOptions_DoNotVerifyDependencyResolution": 1,
    "CreatePackageDependencyOptions_ScopeIsSystem": 2
  },
  "PackageDependencyLifetimeKind": {
    "PackageDependencyLifetimeKind_Process": 0,
    "PackageDependencyLifetimeKind_FilePath": 1,
    "PackageDependencyLifetimeKind_RegistryKey": 2
  },
  "AddPackageDependencyOptions": {
    "AddPackageDependencyOptions_None": 0,
    "AddPackageDependencyOptions_PrependIfRankCollision": 1
  },
  "PackageDependencyProcessorArchitectures": {
    "PackageDependencyProcessorArchitectures_None": 0,
    "PackageDependencyProcessorArchitectures_Neutral": 1,
    "PackageDependencyProcessorArchitectures_X86": 2,
    "PackageDependencyProcessorArchitectures_X64": 4,
    "PackageDependencyProcessorArchitectures_Arm": 8,
    "PackageDependencyProcessorArchitectures_Arm64": 16,
    "PackageDependencyProcessorArchitectures_X86A64": 32
  },
  "AppPolicyLifecycleManagement": {
    "AppPolicyLifecycleManagement_Unmanaged": 0,
    "AppPolicyLifecycleManagement_Managed": 1
  },
  "AppPolicyWindowingModel": {
    "AppPolicyWindowingModel_None": 0,
    "AppPolicyWindowingModel_Universal": 1,
    "AppPolicyWindowingModel_ClassicDesktop": 2,
    "AppPolicyWindowingModel_ClassicPhone": 3
  },
  "AppPolicyMediaFoundationCodecLoading": {
    "AppPolicyMediaFoundationCodecLoading_All": 0,
    "AppPolicyMediaFoundationCodecLoading_InboxOnly": 1
  },
  "AppPolicyClrCompat": {
    "AppPolicyClrCompat_Other": 0,
    "AppPolicyClrCompat_ClassicDesktop": 1,
    "AppPolicyClrCompat_Universal": 2,
    "AppPolicyClrCompat_PackagedDesktop": 3
  },
  "AppPolicyThreadInitializationType": {
    "AppPolicyThreadInitializationType_None": 0,
    "AppPolicyThreadInitializationType_InitializeWinRT": 1
  },
  "AppPolicyShowDeveloperDiagnostic": {
    "AppPolicyShowDeveloperDiagnostic_None": 0,
    "AppPolicyShowDeveloperDiagnostic_ShowUI": 1
  },
  "AppPolicyProcessTerminationMethod": {
    "AppPolicyProcessTerminationMethod_ExitProcess": 0,
    "AppPolicyProcessTerminationMethod_TerminateProcess": 1
  },
  "AppPolicyCreateFileAccess": {
    "AppPolicyCreateFileAccess_Full": 0,
    "AppPolicyCreateFileAccess_Limited": 1
  },
  "JOBOBJECTINFOCLASS": {
    "JobObjectBasicAccountingInformation": 1,
    "JobObjectBasicLimitInformation": 2,
    "JobObjectBasicProcessIdList": 3,
    "JobObjectBasicUIRestrictions": 4,
    "JobObjectSecurityLimitInformation": 5,
    "JobObjectEndOfJobTimeInformation": 6,
    "JobObjectAssociateCompletionPortInformation": 7,
    "JobObjectBasicAndIoAccountingInformation": 8,
    "JobObjectExtendedLimitInformation": 9,
    "JobObjectJobSetInformation": 10,
    "JobObjectGroupInformation": 11,
    "JobObjectNotificationLimitInformation": 12,
    "JobObjectLimitViolationInformation": 13,
    "JobObjectGroupInformationEx": 14,
    "JobObjectCpuRateControlInformation": 15,
    "JobObjectCompletionFilter": 16,
    "JobObjectCompletionCounter": 17,
    "JobObjectReserved1Information": 18,
    "JobObjectReserved2Information": 19,
    "JobObjectReserved3Information": 20,
    "JobObjectReserved4Information": 21,
    "JobObjectReserved5Information": 22,
    "JobObjectReserved6Information": 23,
    "JobObjectReserved7Information": 24,
    "JobObjectReserved8Information": 25,
    "JobObjectReserved9Information": 26,
    "JobObjectReserved10Information": 27,
    "JobObjectReserved11Information": 28,
    "JobObjectReserved12Information": 29,
    "JobObjectReserved13Information": 30,
    "JobObjectReserved14Information": 31,
    "JobObjectNetRateControlInformation": 32,
    "JobObjectNotificationLimitInformation2": 33,
    "JobObjectLimitViolationInformation2": 34,
    "JobObjectCreateSilo": 35,
    "JobObjectSiloBasicInformation": 36,
    "JobObjectReserved15Information": 37,
    "JobObjectReserved16Information": 38,
    "JobObjectReserved17Information": 39,
    "JobObjectReserved18Information": 40,
    "JobObjectReserved19Information": 41,
    "JobObjectReserved20Information": 42,
    "JobObjectReserved21Information": 43,
    "JobObjectReserved22Information": 44,
    "JobObjectReserved23Information": 45,
    "JobObjectReserved24Information": 46,
    "JobObjectReserved25Information": 47,
    "JobObjectReserved26Information": 48,
    "JobObjectReserved27Information": 49,
    "JobObjectReserved28Information": 50,
    "JobObjectNetworkAccountingInformation": 51,
    "MaxJobObjectInfoClass": 52
  },
  "PROCESS_MITIGATION_POLICY": {
    "ProcessDEPPolicy": 0,
    "ProcessASLRPolicy": 1,
    "ProcessDynamicCodePolicy": 2,
    "ProcessStrictHandleCheckPolicy": 3,
    "ProcessSystemCallDisablePolicy": 4,
    "ProcessMitigationOptionsMask": 5,
    "ProcessExtensionPointDisablePolicy": 6,
    "ProcessControlFlowGuardPolicy": 7,
    "ProcessSignaturePolicy": 8,
    "ProcessFontDisablePolicy": 9,
    "ProcessImageLoadPolicy": 10,
    "ProcessSystemCallFilterPolicy": 11,
    "ProcessPayloadRestrictionPolicy": 12,
    "ProcessChildProcessPolicy": 13,
    "ProcessSideChannelIsolationPolicy": 14,
    "ProcessUserShadowStackPolicy": 15,
    "ProcessRedirectionTrustPolicy": 16,
    "ProcessUserPointerAuthPolicy": 17,
    "ProcessSEHOPPolicy": 18,
    "MaxProcessMitigationPolicy": 19
  },
  "UMS_THREAD_INFO_CLASS": {
    "UmsThreadInvalidInfoClass": 0,
    "UmsThreadUserContext": 1,
    "UmsThreadPriority": 2,
    "UmsThreadAffinity": 3,
    "UmsThreadTeb": 4,
    "UmsThreadIsSuspended": 5,
    "UmsThreadIsTerminated": 6,
    "UmsThreadMaxInfoClass": 7
  },
  "FIRMWARE_TYPE": {
    "FirmwareTypeUnknown": 0,
    "FirmwareTypeBios": 1,
    "FirmwareTypeUefi": 2,
    "FirmwareTypeMax": 3
  },
  "LOGICAL_PROCESSOR_RELATIONSHIP": {
    "RelationProcessorCore": 0,
    "RelationNumaNode": 1,
    "RelationCache": 2,
    "RelationProcessorPackage": 3,
    "RelationGroup": 4,
    "RelationProcessorDie": 5,
    "RelationNumaNodeEx": 6,
    "RelationProcessorModule": 7,
    "RelationAll": 65535
  },
  "HEAP_INFORMATION_CLASS": {
    "HeapCompatibilityInformation": 0,
    "HeapEnableTerminationOnCorruption": 1,
    "HeapOptimizeResources": 3,
    "HeapTag": 7
  },
  "LATENCY_TIME": {
    "LT_DONT_CARE": 0,
    "LT_LOWEST_LATENCY": 1
  },
  "POWER_REQUEST_TYPE": {
    "PowerRequestDisplayRequired": 0,
    "PowerRequestSystemRequired": 1,
    "PowerRequestAwayModeRequired": 2,
    "PowerRequestExecutionRequired": 3
  },
  "FILE_WRITE_FLAGS": {
    "FILE_WRITE_FLAGS_NONE": 0,
    "FILE_WRITE_FLAGS_WRITE_THROUGH": 1
  },
  "FILE_FLUSH_MODE": {
    "FILE_FLUSH_DEFAULT": 0,
    "FILE_FLUSH_DATA": 1,
    "FILE_FLUSH_MIN_METADATA": 2,
    "FILE_FLUSH_NO_SYNC": 3
  },
  "DEP_SYSTEM_POLICY_TYPE": {
    "DEPPolicyAlwaysOff": 0,
    "DEPPolicyAlwaysOn": 1,
    "DEPPolicyOptIn": 2,
    "DEPPolicyOptOut": 3,
    "DEPTotalPolicyCount": 4
  }
};
export declare const wideAliases: {
  "CreateActCtx": "CreateActCtxW",
  "FindActCtxSectionString": "FindActCtxSectionStringW",
  "OutputDebugString": "OutputDebugStringW",
  "FatalAppExit": "FatalAppExitW",
  "FormatMessage": "FormatMessageW",
  "SearchPath": "SearchPathW",
  "CreateDirectory": "CreateDirectoryW",
  "CreateFile": "CreateFileW",
  "DeleteFile": "DeleteFileW",
  "FindFirstChangeNotification": "FindFirstChangeNotificationW",
  "FindFirstFile": "FindFirstFileW",
  "FindFirstFileEx": "FindFirstFileExW",
  "FindNextFile": "FindNextFileW",
  "GetDiskFreeSpace": "GetDiskFreeSpaceW",
  "GetDiskFreeSpaceEx": "GetDiskFreeSpaceExW",
  "GetDiskSpaceInformation": "GetDiskSpaceInformationW",
  "GetDriveType": "GetDriveTypeW",
  "GetFileAttributes": "GetFileAttributesW",
  "GetFileAttributesEx": "GetFileAttributesExW",
  "GetFinalPathNameByHandle": "GetFinalPathNameByHandleW",
  "GetFullPathName": "GetFullPathNameW",
  "GetLongPathName": "GetLongPathNameW",
  "RemoveDirectory": "RemoveDirectoryW",
  "SetFileAttributes": "SetFileAttributesW",
  "GetCompressedFileSize": "GetCompressedFileSizeW",
  "GetTempPath": "GetTempPathW",
  "GetVolumeInformation": "GetVolumeInformationW",
  "GetTempFileName": "GetTempFileNameW",
  "GetTempPath2": "GetTempPath2W",
  "CreateDirectory2": "CreateDirectory2W",
  "RemoveDirectory2": "RemoveDirectory2W",
  "DeleteFile2": "DeleteFile2W",
  "VerLanguageName": "VerLanguageNameW",
  "GetExpandedName": "GetExpandedNameW",
  "LZOpenFile": "LZOpenFileW",
  "GetBinaryType": "GetBinaryTypeW",
  "GetShortPathName": "GetShortPathNameW",
  "GetLongPathNameTransacted": "GetLongPathNameTransactedW",
  "SetFileShortName": "SetFileShortNameW",
  "GetLogicalDriveStrings": "GetLogicalDriveStringsW",
  "CreateDirectoryEx": "CreateDirectoryExW",
  "CreateDirectoryTransacted": "CreateDirectoryTransactedW",
  "RemoveDirectoryTransacted": "RemoveDirectoryTransactedW",
  "GetFullPathNameTransacted": "GetFullPathNameTransactedW",
  "DefineDosDevice": "DefineDosDeviceW",
  "QueryDosDevice": "QueryDosDeviceW",
  "CreateFileTransacted": "CreateFileTransactedW",
  "SetFileAttributesTransacted": "SetFileAttributesTransactedW",
  "GetFileAttributesTransacted": "GetFileAttributesTransactedW",
  "GetCompressedFileSizeTransacted": "GetCompressedFileSizeTransactedW",
  "DeleteFileTransacted": "DeleteFileTransactedW",
  "CheckNameLegalDOS8Dot3": "CheckNameLegalDOS8Dot3W",
  "FindFirstFileTransacted": "FindFirstFileTransactedW",
  "CopyFile": "CopyFileW",
  "CopyFileEx": "CopyFileExW",
  "CopyFileTransacted": "CopyFileTransactedW",
  "MoveFile": "MoveFileW",
  "MoveFileEx": "MoveFileExW",
  "MoveFileWithProgress": "MoveFileWithProgressW",
  "MoveFileTransacted": "MoveFileTransactedW",
  "ReplaceFile": "ReplaceFileW",
  "CreateHardLink": "CreateHardLinkW",
  "CreateHardLinkTransacted": "CreateHardLinkTransactedW",
  "SetVolumeLabel": "SetVolumeLabelW",
  "FindFirstVolume": "FindFirstVolumeW",
  "FindNextVolume": "FindNextVolumeW",
  "FindFirstVolumeMountPoint": "FindFirstVolumeMountPointW",
  "FindNextVolumeMountPoint": "FindNextVolumeMountPointW",
  "SetVolumeMountPoint": "SetVolumeMountPointW",
  "DeleteVolumeMountPoint": "DeleteVolumeMountPointW",
  "GetVolumeNameForVolumeMountPoint": "GetVolumeNameForVolumeMountPointW",
  "GetVolumePathName": "GetVolumePathNameW",
  "GetVolumePathNamesForVolumeName": "GetVolumePathNamesForVolumeNameW",
  "CreateSymbolicLink": "CreateSymbolicLinkW",
  "CreateSymbolicLinkTransacted": "CreateSymbolicLinkTransactedW",
  "GetDateFormat": "GetDateFormatW",
  "GetTimeFormat": "GetTimeFormatW",
  "GetCPInfoEx": "GetCPInfoExW",
  "CompareString": "CompareStringW",
  "LCMapString": "LCMapStringW",
  "GetLocaleInfo": "GetLocaleInfoW",
  "SetLocaleInfo": "SetLocaleInfoW",
  "GetCalendarInfo": "GetCalendarInfoW",
  "SetCalendarInfo": "SetCalendarInfoW",
  "GetNumberFormat": "GetNumberFormatW",
  "GetCurrencyFormat": "GetCurrencyFormatW",
  "EnumCalendarInfo": "EnumCalendarInfoW",
  "EnumCalendarInfoEx": "EnumCalendarInfoExW",
  "EnumTimeFormats": "EnumTimeFormatsW",
  "EnumDateFormats": "EnumDateFormatsW",
  "EnumDateFormatsEx": "EnumDateFormatsExW",
  "GetGeoInfo": "GetGeoInfoW",
  "GetStringTypeEx": "GetStringTypeExW",
  "GetStringType": "GetStringTypeW",
  "FoldString": "FoldStringW",
  "EnumSystemLocales": "EnumSystemLocalesW",
  "EnumSystemLanguageGroups": "EnumSystemLanguageGroupsW",
  "EnumLanguageGroupLocales": "EnumLanguageGroupLocalesW",
  "EnumUILanguages": "EnumUILanguagesW",
  "EnumSystemCodePages": "EnumSystemCodePagesW",
  "lstrcmp": "lstrcmpW",
  "lstrcmpi": "lstrcmpiW",
  "lstrcpyn": "lstrcpynW",
  "lstrcpy": "lstrcpyW",
  "lstrcat": "lstrcatW",
  "lstrlen": "lstrlenW",
  "GetSystemDirectory": "GetSystemDirectoryW",
  "GetWindowsDirectory": "GetWindowsDirectoryW",
  "GetSystemWindowsDirectory": "GetSystemWindowsDirectoryW",
  "GetComputerNameEx": "GetComputerNameExW",
  "GetVersionEx": "GetVersionExW",
  "SetComputerName": "SetComputerNameW",
  "SetComputerNameEx": "SetComputerNameExW",
  "GetSystemWow64Directory": "GetSystemWow64DirectoryW",
  "VerifyVersionInfo": "VerifyVersionInfoW",
  "CreateMutex": "CreateMutexW",
  "CreateEvent": "CreateEventW",
  "OpenEvent": "OpenEventW",
  "CreateMutexEx": "CreateMutexExW",
  "CreateEventEx": "CreateEventExW",
  "CreateProcess": "CreateProcessW",
  "CreateSemaphore": "CreateSemaphoreW",
  "CreateWaitableTimer": "CreateWaitableTimerW",
  "OpenWaitableTimer": "OpenWaitableTimerW",
  "CreateSemaphoreEx": "CreateSemaphoreExW",
  "CreateWaitableTimerEx": "CreateWaitableTimerExW",
  "QueryFullProcessImageName": "QueryFullProcessImageNameW",
  "GetStartupInfo": "GetStartupInfoW",
  "CreatePrivateNamespace": "CreatePrivateNamespaceW",
  "OpenPrivateNamespace": "OpenPrivateNamespaceW",
  "CreateBoundaryDescriptor": "CreateBoundaryDescriptorW",
  "BuildCommDCB": "BuildCommDCBW",
  "BuildCommDCBAndTimeouts": "BuildCommDCBAndTimeoutsW",
  "CommConfigDialog": "CommConfigDialogW",
  "GetDefaultCommConfig": "GetDefaultCommConfigW",
  "SetDefaultCommConfig": "SetDefaultCommConfigW",
  "ReadConsoleInput": "ReadConsoleInputW",
  "PeekConsoleInput": "PeekConsoleInputW",
  "ReadConsole": "ReadConsoleW",
  "WriteConsole": "WriteConsoleW",
  "FillConsoleOutputCharacter": "FillConsoleOutputCharacterW",
  "WriteConsoleOutputCharacter": "WriteConsoleOutputCharacterW",
  "ReadConsoleOutputCharacter": "ReadConsoleOutputCharacterW",
  "WriteConsoleInput": "WriteConsoleInputW",
  "ScrollConsoleScreenBuffer": "ScrollConsoleScreenBufferW",
  "WriteConsoleOutput": "WriteConsoleOutputW",
  "ReadConsoleOutput": "ReadConsoleOutputW",
  "GetConsoleTitle": "GetConsoleTitleW",
  "GetConsoleOriginalTitle": "GetConsoleOriginalTitleW",
  "SetConsoleTitle": "SetConsoleTitleW",
  "AddConsoleAlias": "AddConsoleAliasW",
  "GetConsoleAlias": "GetConsoleAliasW",
  "GetConsoleAliasesLength": "GetConsoleAliasesLengthW",
  "GetConsoleAliasExesLength": "GetConsoleAliasExesLengthW",
  "GetConsoleAliases": "GetConsoleAliasesW",
  "GetConsoleAliasExes": "GetConsoleAliasExesW",
  "ExpungeConsoleCommandHistory": "ExpungeConsoleCommandHistoryW",
  "SetConsoleNumberOfCommands": "SetConsoleNumberOfCommandsW",
  "GetConsoleCommandHistoryLength": "GetConsoleCommandHistoryLengthW",
  "GetConsoleCommandHistory": "GetConsoleCommandHistoryW",
  "GetConsoleInputExeName": "GetConsoleInputExeNameW",
  "SetConsoleInputExeName": "SetConsoleInputExeNameW",
  "ReadConsoleInputEx": "ReadConsoleInputExW",
  "WriteConsoleInputVDM": "WriteConsoleInputVDMW",
  "GlobalAddAtom": "GlobalAddAtomW",
  "GlobalAddAtomEx": "GlobalAddAtomExW",
  "GlobalFindAtom": "GlobalFindAtomW",
  "GlobalGetAtomName": "GlobalGetAtomNameW",
  "AddAtom": "AddAtomW",
  "FindAtom": "FindAtomW",
  "GetAtomName": "GetAtomNameW",
  "GetCommandLine": "GetCommandLineW",
  "FreeEnvironmentStrings": "FreeEnvironmentStringsW",
  "GetEnvironmentVariable": "GetEnvironmentVariableW",
  "SetEnvironmentVariable": "SetEnvironmentVariableW",
  "ExpandEnvironmentStrings": "ExpandEnvironmentStringsW",
  "SetCurrentDirectory": "SetCurrentDirectoryW",
  "GetCurrentDirectory": "GetCurrentDirectoryW",
  "NeedCurrentDirectoryForExePath": "NeedCurrentDirectoryForExePathW",
  "GetModuleFileName": "GetModuleFileNameW",
  "GetModuleHandle": "GetModuleHandleW",
  "GetModuleHandleEx": "GetModuleHandleExW",
  "LoadLibraryEx": "LoadLibraryExW",
  "EnumResourceLanguagesEx": "EnumResourceLanguagesExW",
  "EnumResourceNamesEx": "EnumResourceNamesExW",
  "EnumResourceTypesEx": "EnumResourceTypesExW",
  "LoadLibrary": "LoadLibraryW",
  "EnumResourceNames": "EnumResourceNamesW",
  "FindResource": "FindResourceW",
  "FindResourceEx": "FindResourceExW",
  "EnumResourceTypes": "EnumResourceTypesW",
  "EnumResourceLanguages": "EnumResourceLanguagesW",
  "BeginUpdateResource": "BeginUpdateResourceW",
  "UpdateResource": "UpdateResourceW",
  "EndUpdateResource": "EndUpdateResourceW",
  "SetDllDirectory": "SetDllDirectoryW",
  "GetDllDirectory": "GetDllDirectoryW",
  "CreateFileMapping": "CreateFileMappingW",
  "CreateFileMappingNuma": "CreateFileMappingNumaW",
  "OpenFileMapping": "OpenFileMappingW",
  "IsBadStringPtr": "IsBadStringPtrW",
  "CreateNamedPipe": "CreateNamedPipeW",
  "GetNamedPipeHandleState": "GetNamedPipeHandleStateW",
  "CallNamedPipe": "CallNamedPipeW",
  "WaitNamedPipe": "WaitNamedPipeW",
  "GetNamedPipeClientComputerName": "GetNamedPipeClientComputerNameW",
  "K32GetModuleBaseName": "K32GetModuleBaseNameW",
  "K32GetModuleFileNameEx": "K32GetModuleFileNameExW",
  "K32GetMappedFileName": "K32GetMappedFileNameW",
  "K32GetDeviceDriverBaseName": "K32GetDeviceDriverBaseNameW",
  "K32GetDeviceDriverFileName": "K32GetDeviceDriverFileNameW",
  "K32EnumPageFiles": "K32EnumPageFilesW",
  "K32GetProcessImageFileName": "K32GetProcessImageFileNameW",
  "SetEnvironmentStrings": "SetEnvironmentStringsW",
  "OpenMutex": "OpenMutexW",
  "OpenSemaphore": "OpenSemaphoreW",
  "GetFirmwareEnvironmentVariable": "GetFirmwareEnvironmentVariableW",
  "GetFirmwareEnvironmentVariableEx": "GetFirmwareEnvironmentVariableExW",
  "SetFirmwareEnvironmentVariable": "SetFirmwareEnvironmentVariableW",
  "SetFirmwareEnvironmentVariableEx": "SetFirmwareEnvironmentVariableExW",
  "GetProfileInt": "GetProfileIntW",
  "GetProfileString": "GetProfileStringW",
  "WriteProfileString": "WriteProfileStringW",
  "GetProfileSection": "GetProfileSectionW",
  "WriteProfileSection": "WriteProfileSectionW",
  "GetPrivateProfileInt": "GetPrivateProfileIntW",
  "GetPrivateProfileString": "GetPrivateProfileStringW",
  "WritePrivateProfileString": "WritePrivateProfileStringW",
  "GetPrivateProfileSection": "GetPrivateProfileSectionW",
  "WritePrivateProfileSection": "WritePrivateProfileSectionW",
  "GetPrivateProfileSectionNames": "GetPrivateProfileSectionNamesW",
  "GetPrivateProfileStruct": "GetPrivateProfileStructW",
  "WritePrivateProfileStruct": "WritePrivateProfileStructW",
  "GetComputerName": "GetComputerNameW",
  "DnsHostnameToComputerName": "DnsHostnameToComputerNameW",
  "CreateJobObject": "CreateJobObjectW",
  "OpenJobObject": "OpenJobObjectW",
  "CreateMailslot": "CreateMailslotW"
};
export declare const signatures: {
  "kernel32.dll": {
    "CreateActCtxA": {
      "args": [
        "Windows.Win32.System.ApplicationInstallationAndServicing.ACTCTXA*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateActCtxW": {
      "args": [
        "Windows.Win32.System.ApplicationInstallationAndServicing.ACTCTXW*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "AddRefActCtx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ReleaseActCtx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ZombifyActCtx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ActivateActCtx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeactivateActCtx": {
      "args": [
        "u32",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentActCtx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindActCtxSectionStringA": {
      "args": [
        "u32",
        "System.Guid*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.ApplicationInstallationAndServicing.ACTCTX_SECTION_KEYED_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindActCtxSectionStringW": {
      "args": [
        "u32",
        "System.Guid*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.ApplicationInstallationAndServicing.ACTCTX_SECTION_KEYED_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindActCtxSectionGuid": {
      "args": [
        "u32",
        "System.Guid*",
        "u32",
        "System.Guid*",
        "Windows.Win32.System.ApplicationInstallationAndServicing.ACTCTX_SECTION_KEYED_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryActCtxW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "void*",
        "usize",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryActCtxSettingsW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "usize",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentPackageId": {
      "args": [
        "u32*",
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetCurrentPackageFullName": {
      "args": [
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetCurrentPackageFamilyName": {
      "args": [
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetCurrentPackagePath": {
      "args": [
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetPackageId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetPackageFullName": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetPackageFamilyName": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetPackagePath": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx.PACKAGE_ID*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetPackagePathByFullName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetStagedPackagePathByFullName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetCurrentApplicationUserModelId": {
      "args": [
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetApplicationUserModelId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "PackageIdFromFullName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "PackageFullNameFromId": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx.PACKAGE_ID*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "PackageFamilyNameFromId": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx.PACKAGE_ID*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "PackageFamilyNameFromFullName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "PackageNameAndPublisherIdFromFamilyName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "FormatApplicationUserModelId": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ParseApplicationUserModelId": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetPackagesByPackageFamily": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "FindPackagesByPackageFamily": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetCurrentPackageInfo": {
      "args": [
        "u32",
        "u32*",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "OpenPackageInfoByFullName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Storage.Packaging.Appx._PACKAGE_INFO_REFERENCE**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ClosePackageInfo": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx._PACKAGE_INFO_REFERENCE*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetPackageInfo": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx._PACKAGE_INFO_REFERENCE*",
        "u32",
        "u32*",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetPackageApplicationIds": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx._PACKAGE_INFO_REFERENCE*",
        "u32*",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "CheckIsMSIXPackage": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "AppPolicyGetLifecycleManagement": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.Packaging.Appx.AppPolicyLifecycleManagement*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "AppPolicyGetWindowingModel": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.Packaging.Appx.AppPolicyWindowingModel*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "AppPolicyGetMediaFoundationCodecLoading": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.Packaging.Appx.AppPolicyMediaFoundationCodecLoading*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "AppPolicyGetClrCompat": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.Packaging.Appx.AppPolicyClrCompat*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "AppPolicyGetThreadInitializationType": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.Packaging.Appx.AppPolicyThreadInitializationType*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "AppPolicyGetShowDeveloperDiagnostic": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.Packaging.Appx.AppPolicyShowDeveloperDiagnostic*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "AppPolicyGetProcessTerminationMethod": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.Packaging.Appx.AppPolicyProcessTerminationMethod*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "AppPolicyGetCreateFileAccess": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.Packaging.Appx.AppPolicyCreateFileAccess*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "CreatePackageVirtualizationContext": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.Packaging.Appx.PACKAGE_VIRTUALIZATION_CONTEXT_HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ActivatePackageVirtualizationContext": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx.PACKAGE_VIRTUALIZATION_CONTEXT_HANDLE",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ReleasePackageVirtualizationContext": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx.PACKAGE_VIRTUALIZATION_CONTEXT_HANDLE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "DeactivatePackageVirtualizationContext": {
      "args": [
        "usize"
      ],
      "returns": "void",
      "setLastError": false
    },
    "DuplicatePackageVirtualizationContext": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx.PACKAGE_VIRTUALIZATION_CONTEXT_HANDLE",
        "Windows.Win32.Storage.Packaging.Appx.PACKAGE_VIRTUALIZATION_CONTEXT_HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetCurrentPackageVirtualizationContext": {
      "args": [],
      "returns": "Windows.Win32.Storage.Packaging.Appx.PACKAGE_VIRTUALIZATION_CONTEXT_HANDLE",
      "setLastError": false
    },
    "GetProcessesInVirtualizationContext": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.HANDLE**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetCurrentPackageInfo3": {
      "args": [
        "u32",
        "Windows.Win32.Storage.Packaging.Appx.PackageInfo3Type",
        "u32*",
        "void*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "RtlAddFunctionTable": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.IMAGE_RUNTIME_FUNCTION_ENTRY*",
        "u32",
        "u64"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "RtlDeleteFunctionTable": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.IMAGE_RUNTIME_FUNCTION_ENTRY*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "RtlInstallFunctionTableCallback": {
      "args": [
        "u64",
        "u64",
        "u32",
        "Windows.Win32.System.Diagnostics.Debug.PGET_RUNTIME_FUNCTION_CALLBACK",
        "void*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "RtlLookupFunctionEntry": {
      "args": [
        "u64",
        "u64*",
        "Windows.Win32.System.Diagnostics.Debug.UNWIND_HISTORY_TABLE*"
      ],
      "returns": "Windows.Win32.System.Diagnostics.Debug.IMAGE_RUNTIME_FUNCTION_ENTRY*",
      "setLastError": false
    },
    "RtlVirtualUnwind": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.RTL_VIRTUAL_UNWIND_HANDLER_TYPE",
        "u64",
        "u64",
        "Windows.Win32.System.Diagnostics.Debug.IMAGE_RUNTIME_FUNCTION_ENTRY*",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*",
        "void**",
        "u64*",
        "Windows.Win32.System.Diagnostics.Debug.KNONVOLATILE_CONTEXT_POINTERS*"
      ],
      "returns": "Windows.Win32.System.Kernel.EXCEPTION_ROUTINE",
      "setLastError": false
    },
    "ReadProcessMemory": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "void*",
        "usize",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteProcessMemory": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "void*",
        "usize",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadContext": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadContext": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FlushInstructionCache": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Wow64GetThreadContext": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.Debug.WOW64_CONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Wow64SetThreadContext": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.Debug.WOW64_CONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RtlCaptureContext2": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlUnwindEx": {
      "args": [
        "void*",
        "void*",
        "Windows.Win32.System.Diagnostics.Debug.EXCEPTION_RECORD*",
        "void*",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*",
        "Windows.Win32.System.Diagnostics.Debug.UNWIND_HISTORY_TABLE*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlCaptureStackBackTrace": {
      "args": [
        "u32",
        "u32",
        "void**",
        "u32*"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "RtlCaptureContext": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlUnwind": {
      "args": [
        "void*",
        "void*",
        "Windows.Win32.System.Diagnostics.Debug.EXCEPTION_RECORD*",
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlRestoreContext": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*",
        "Windows.Win32.System.Diagnostics.Debug.EXCEPTION_RECORD*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlRaiseException": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.EXCEPTION_RECORD*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlPcToFileHeader": {
      "args": [
        "void*",
        "void**"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "IsDebuggerPresent": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DebugBreak": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "OutputDebugStringA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "OutputDebugStringW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ContinueDebugEvent": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.NTSTATUS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WaitForDebugEvent": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.DEBUG_EVENT*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DebugActiveProcess": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DebugActiveProcessStop": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CheckRemoteDebuggerPresent": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WaitForDebugEventEx": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.DEBUG_EVENT*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EncodePointer": {
      "args": [
        "void*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "DecodePointer": {
      "args": [
        "void*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "EncodeSystemPointer": {
      "args": [
        "void*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "DecodeSystemPointer": {
      "args": [
        "void*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "Beep": {
      "args": [
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RaiseException": {
      "args": [
        "u32",
        "u32",
        "u32",
        "usize*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "UnhandledExceptionFilter": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.EXCEPTION_POINTERS*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetUnhandledExceptionFilter": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.LPTOP_LEVEL_EXCEPTION_FILTER"
      ],
      "returns": "Windows.Win32.System.Diagnostics.Debug.LPTOP_LEVEL_EXCEPTION_FILTER",
      "setLastError": false
    },
    "GetErrorMode": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "SetErrorMode": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.THREAD_ERROR_MODE"
      ],
      "returns": "Windows.Win32.System.Diagnostics.Debug.THREAD_ERROR_MODE",
      "setLastError": false
    },
    "AddVectoredExceptionHandler": {
      "args": [
        "u32",
        "Windows.Win32.System.Diagnostics.Debug.PVECTORED_EXCEPTION_HANDLER"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "RemoveVectoredExceptionHandler": {
      "args": [
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "AddVectoredContinueHandler": {
      "args": [
        "u32",
        "Windows.Win32.System.Diagnostics.Debug.PVECTORED_EXCEPTION_HANDLER"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "RemoveVectoredContinueHandler": {
      "args": [
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RaiseFailFastException": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.EXCEPTION_RECORD*",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "FatalAppExitA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "FatalAppExitW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetThreadErrorMode": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "SetThreadErrorMode": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.THREAD_ERROR_MODE",
        "Windows.Win32.System.Diagnostics.Debug.THREAD_ERROR_MODE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FatalExit": {
      "args": [
        "i32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetThreadSelectorEntry": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.System.Diagnostics.Debug.LDT_ENTRY*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Wow64GetThreadSelectorEntry": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.System.Diagnostics.Debug.WOW64_LDT_ENTRY*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DebugSetProcessKillOnExit": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DebugBreakProcess": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FormatMessageA": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.FORMAT_MESSAGE_OPTIONS",
        "void*",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "i8**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FormatMessageW": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.FORMAT_MESSAGE_OPTIONS",
        "void*",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "i8**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CopyContext": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT_FLAGS",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitializeContext": {
      "args": [
        "void*",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT_FLAGS",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitializeContext2": {
      "args": [
        "void*",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT_FLAGS",
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT**",
        "u32*",
        "u64"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetEnabledXStateFeatures": {
      "args": [],
      "returns": "u64",
      "setLastError": false
    },
    "GetXStateFeaturesMask": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LocateXStateFeature": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*",
        "u32",
        "u32*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetXStateFeaturesMask": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.CONTEXT*",
        "u64"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SearchPathW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SearchPathA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CompareFileTime": {
      "args": [
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "CreateDirectoryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateDirectoryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Storage.FileSystem.FILE_SHARE_MODE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Storage.FileSystem.FILE_CREATION_DISPOSITION",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Storage.FileSystem.FILE_SHARE_MODE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Storage.FileSystem.FILE_CREATION_DISPOSITION",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "DefineDosDeviceW": {
      "args": [
        "Windows.Win32.Storage.FileSystem.DEFINE_DOS_DEVICE_FLAGS",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteVolumeMountPointW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FileTimeToLocalFileTime": {
      "args": [
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindClose": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindCloseChangeNotification": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindFirstChangeNotificationA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Storage.FileSystem.FILE_NOTIFY_CHANGE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindFirstChangeNotificationW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Storage.FileSystem.FILE_NOTIFY_CHANGE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindFirstFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.WIN32_FIND_DATAA*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindFirstFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.WIN32_FIND_DATAW*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindFirstFileExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.FINDEX_INFO_LEVELS",
        "void*",
        "Windows.Win32.Storage.FileSystem.FINDEX_SEARCH_OPS",
        "void*",
        "Windows.Win32.Storage.FileSystem.FIND_FIRST_EX_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindFirstFileExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.FINDEX_INFO_LEVELS",
        "void*",
        "Windows.Win32.Storage.FileSystem.FINDEX_SEARCH_OPS",
        "void*",
        "Windows.Win32.Storage.FileSystem.FIND_FIRST_EX_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindFirstVolumeW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindNextChangeNotification": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindNextFileA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.WIN32_FIND_DATAA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindNextFileW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.WIN32_FIND_DATAW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindNextVolumeW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindVolumeClose": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FlushFileBuffers": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDiskFreeSpaceA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "u32*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDiskFreeSpaceW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "u32*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDiskFreeSpaceExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u64*",
        "u64*",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDiskFreeSpaceExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u64*",
        "u64*",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDiskSpaceInformationA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.DISK_SPACE_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetDiskSpaceInformationW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.DISK_SPACE_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetDriveTypeA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetDriveTypeW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFileAttributesA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFileAttributesW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFileAttributesExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.GET_FILEEX_INFO_LEVELS",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileAttributesExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.GET_FILEEX_INFO_LEVELS",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileInformationByHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.BY_HANDLE_FILE_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileSize": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFileSizeEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "i64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileType": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Storage.FileSystem.FILE_TYPE",
      "setLastError": false
    },
    "GetFinalPathNameByHandleA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Storage.FileSystem.GETFINALPATHNAMEBYHANDLE_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFinalPathNameByHandleW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Storage.FileSystem.GETFINALPATHNAMEBYHANDLE_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFileTime": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFullPathNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFullPathNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetLogicalDrives": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetLogicalDriveStringsW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetLongPathNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetLongPathNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "AreShortNamesEnabled": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetShortPathNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTempFileNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetVolumeInformationByHandleW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetVolumeInformationW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetVolumePathNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LocalFileTimeToFileTime": {
      "args": [
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LockFile": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LockFileEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.LOCK_FILE_FLAGS",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryDosDeviceW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ReadFile": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u8*",
        "u32",
        "u32*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadFileEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u8*",
        "u32",
        "Windows.Win32.System.IO.OVERLAPPED*",
        "Windows.Win32.System.IO.LPOVERLAPPED_COMPLETION_ROUTINE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadFileScatter": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.FILE_SEGMENT_ELEMENT*",
        "u32",
        "u32*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RemoveDirectoryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RemoveDirectoryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetEndOfFile": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileAttributesA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileAttributesW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileInformationByHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.FILE_INFO_BY_HANDLE_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFilePointer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "i32",
        "i32*",
        "Windows.Win32.Storage.FileSystem.SET_FILE_POINTER_MOVE_METHOD"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetFilePointerEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "i64",
        "i64*",
        "Windows.Win32.Storage.FileSystem.SET_FILE_POINTER_MOVE_METHOD"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileTime": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileValidData": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "i64"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnlockFile": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnlockFileEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteFile": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u8*",
        "u32",
        "u32*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteFileEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u8*",
        "u32",
        "Windows.Win32.System.IO.OVERLAPPED*",
        "Windows.Win32.System.IO.LPOVERLAPPED_COMPLETION_ROUTINE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteFileGather": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.FILE_SEGMENT_ELEMENT*",
        "u32",
        "u32*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTempPathW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetVolumeNameForVolumeMountPointW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetVolumePathNamesForVolumeNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateFile2": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Storage.FileSystem.FILE_SHARE_MODE",
        "Windows.Win32.Storage.FileSystem.FILE_CREATION_DISPOSITION",
        "Windows.Win32.Storage.FileSystem.CREATEFILE2_EXTENDED_PARAMETERS*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "SetFileIoOverlappedRange": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u8*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCompressedFileSizeA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetCompressedFileSizeW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FindFirstStreamW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.STREAM_INFO_LEVELS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindNextStreamW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AreFileApisANSI": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTempPathA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FindFirstFileNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindNextFileNameW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetVolumeInformationA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTempFileNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetFileApisToOEM": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "SetFileApisToANSI": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "GetTempPath2W": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTempPath2A": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateFile3": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Storage.FileSystem.CREATEFILE3_EXTENDED_PARAMETERS*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateDirectory2A": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32",
        "Windows.Win32.Storage.FileSystem.DIRECTORY_FLAGS",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateDirectory2W": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32",
        "Windows.Win32.Storage.FileSystem.DIRECTORY_FLAGS",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "RemoveDirectory2A": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.DIRECTORY_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RemoveDirectory2W": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.DIRECTORY_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteFile2A": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteFile2W": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VerLanguageNameA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "VerLanguageNameW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "LZStart": {
      "args": [],
      "returns": "i32",
      "setLastError": false
    },
    "LZDone": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "CopyLZFile": {
      "args": [
        "i32",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LZCopy": {
      "args": [
        "i32",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LZInit": {
      "args": [
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetExpandedNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetExpandedNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LZOpenFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.OFSTRUCT*",
        "Windows.Win32.Storage.FileSystem.LZOPENFILE_STYLE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LZOpenFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.OFSTRUCT*",
        "Windows.Win32.Storage.FileSystem.LZOPENFILE_STYLE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LZSeek": {
      "args": [
        "i32",
        "i32",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LZRead": {
      "args": [
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LZClose": {
      "args": [
        "i32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildIoRingWriteFile": {
      "args": [
        "Windows.Win32.Storage.FileSystem.HIORING",
        "Windows.Win32.Storage.FileSystem.IORING_HANDLE_REF",
        "Windows.Win32.Storage.FileSystem.IORING_BUFFER_REF",
        "u32",
        "u64",
        "Windows.Win32.Storage.FileSystem.FILE_WRITE_FLAGS",
        "usize",
        "Windows.Win32.Storage.FileSystem.IORING_SQE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "BuildIoRingFlushFile": {
      "args": [
        "Windows.Win32.Storage.FileSystem.HIORING",
        "Windows.Win32.Storage.FileSystem.IORING_HANDLE_REF",
        "Windows.Win32.Storage.FileSystem.FILE_FLUSH_MODE",
        "usize",
        "Windows.Win32.Storage.FileSystem.IORING_SQE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "BuildIoRingReadFileScatter": {
      "args": [
        "Windows.Win32.Storage.FileSystem.HIORING",
        "Windows.Win32.Storage.FileSystem.IORING_HANDLE_REF",
        "u32",
        "Windows.Win32.Storage.FileSystem.FILE_SEGMENT_ELEMENT*",
        "u32",
        "u64",
        "usize",
        "Windows.Win32.Storage.FileSystem.IORING_SQE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "BuildIoRingWriteFileGather": {
      "args": [
        "Windows.Win32.Storage.FileSystem.HIORING",
        "Windows.Win32.Storage.FileSystem.IORING_HANDLE_REF",
        "u32",
        "Windows.Win32.Storage.FileSystem.FILE_SEGMENT_ELEMENT*",
        "u32",
        "u64",
        "Windows.Win32.Storage.FileSystem.FILE_WRITE_FLAGS",
        "usize",
        "Windows.Win32.Storage.FileSystem.IORING_SQE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "Wow64EnableWow64FsRedirection": {
      "args": [
        "Windows.Win32.Foundation.BOOLEAN"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "Wow64DisableWow64FsRedirection": {
      "args": [
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Wow64RevertWow64FsRedirection": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetBinaryTypeA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetBinaryTypeW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetShortPathNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetLongPathNameTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetLongPathNameTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetFileCompletionNotificationModes": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u8"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileShortNameA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileShortNameW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetTapePosition": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.TAPE_POSITION_METHOD",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTapePosition": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.TAPE_POSITION_TYPE",
        "u32*",
        "u32*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PrepareTape": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.PREPARE_TAPE_OPERATION",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EraseTape": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.ERASE_TAPE_TYPE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateTapePartition": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.CREATE_TAPE_PARTITION_METHOD",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "WriteTapemark": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.TAPEMARK_TYPE",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTapeStatus": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTapeParameters": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.GET_TAPE_DRIVE_PARAMETERS_OPERATION",
        "u32*",
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetTapeParameters": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.TAPE_INFORMATION_TYPE",
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "OpenFile": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.OFSTRUCT*",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "BackupRead": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u8*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BackupSeek": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "u32*",
        "u32*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BackupWrite": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u8*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetLogicalDriveStringsA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetSearchPathMode": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateDirectoryExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateDirectoryExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateDirectoryTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateDirectoryTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RemoveDirectoryTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RemoveDirectoryTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFullPathNameTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFullPathNameTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DefineDosDeviceA": {
      "args": [
        "Windows.Win32.Storage.FileSystem.DEFINE_DOS_DEVICE_FLAGS",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryDosDeviceA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateFileTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Storage.FileSystem.FILE_SHARE_MODE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Storage.FileSystem.FILE_CREATION_DISPOSITION",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.TXFS_MINIVERSION*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateFileTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Storage.FileSystem.FILE_SHARE_MODE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Storage.FileSystem.FILE_CREATION_DISPOSITION",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.TXFS_MINIVERSION*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "ReOpenFile": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Storage.FileSystem.FILE_SHARE_MODE",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "SetFileAttributesTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileAttributesTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileAttributesTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.GET_FILEEX_INFO_LEVELS",
        "void*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileAttributesTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.GET_FILEEX_INFO_LEVELS",
        "void*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCompressedFileSizeTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetCompressedFileSizeTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DeleteFileTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteFileTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CheckNameLegalDOS8Dot3A": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CheckNameLegalDOS8Dot3W": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindFirstFileTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.FINDEX_INFO_LEVELS",
        "void*",
        "Windows.Win32.Storage.FileSystem.FINDEX_SEARCH_OPS",
        "void*",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindFirstFileTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.FINDEX_INFO_LEVELS",
        "void*",
        "Windows.Win32.Storage.FileSystem.FINDEX_SEARCH_OPS",
        "void*",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CopyFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CopyFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CopyFileExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.LPPROGRESS_ROUTINE",
        "void*",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Storage.FileSystem.COPYFILE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CopyFileExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.LPPROGRESS_ROUTINE",
        "void*",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Storage.FileSystem.COPYFILE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CopyFileTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.LPPROGRESS_ROUTINE",
        "void*",
        "Windows.Win32.Foundation.BOOL*",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CopyFileTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.LPPROGRESS_ROUTINE",
        "void*",
        "Windows.Win32.Foundation.BOOL*",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CopyFile2": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.COPYFILE2_EXTENDED_PARAMETERS*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "MoveFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MoveFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MoveFileExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.MOVE_FILE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MoveFileExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.MOVE_FILE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MoveFileWithProgressA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.LPPROGRESS_ROUTINE",
        "void*",
        "Windows.Win32.Storage.FileSystem.MOVE_FILE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MoveFileWithProgressW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.LPPROGRESS_ROUTINE",
        "void*",
        "Windows.Win32.Storage.FileSystem.MOVE_FILE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MoveFileTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.LPPROGRESS_ROUTINE",
        "void*",
        "Windows.Win32.Storage.FileSystem.MOVE_FILE_FLAGS",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MoveFileTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.LPPROGRESS_ROUTINE",
        "void*",
        "Windows.Win32.Storage.FileSystem.MOVE_FILE_FLAGS",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReplaceFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.REPLACE_FILE_FLAGS",
        "void*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReplaceFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.REPLACE_FILE_FLAGS",
        "void*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateHardLinkA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateHardLinkW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateHardLinkTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateHardLinkTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindFirstStreamTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.STREAM_INFO_LEVELS",
        "void*",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindFirstFileNameTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "SetVolumeLabelA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetVolumeLabelW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileBandwidthReservation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileBandwidthReservation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.BOOL*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadDirectoryChangesW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Storage.FileSystem.FILE_NOTIFY_CHANGE",
        "u32*",
        "Windows.Win32.System.IO.OVERLAPPED*",
        "Windows.Win32.System.IO.LPOVERLAPPED_COMPLETION_ROUTINE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadDirectoryChangesExW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Storage.FileSystem.FILE_NOTIFY_CHANGE",
        "u32*",
        "Windows.Win32.System.IO.OVERLAPPED*",
        "Windows.Win32.System.IO.LPOVERLAPPED_COMPLETION_ROUTINE",
        "Windows.Win32.Storage.FileSystem.READ_DIRECTORY_NOTIFY_INFORMATION_CLASS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindFirstVolumeA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindNextVolumeA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindFirstVolumeMountPointA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindFirstVolumeMountPointW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FindNextVolumeMountPointA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindNextVolumeMountPointW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindVolumeMountPointClose": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetVolumeMountPointA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetVolumeMountPointW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteVolumeMountPointA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetVolumeNameForVolumeMountPointA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetVolumePathNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetVolumePathNamesForVolumeNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileInformationByHandleEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.FILE_INFO_BY_HANDLE_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileInformationByName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.FILE_INFO_BY_NAME_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OpenFileById": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.FileSystem.FILE_ID_DESCRIPTOR*",
        "u32",
        "Windows.Win32.Storage.FileSystem.FILE_SHARE_MODE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateSymbolicLinkA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.SYMBOLIC_LINK_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "CreateSymbolicLinkW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.SYMBOLIC_LINK_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "CreateSymbolicLinkTransactedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.SYMBOLIC_LINK_FLAGS",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "CreateSymbolicLinkTransactedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.SYMBOLIC_LINK_FLAGS",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "CloseHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DuplicateHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE*",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.DUPLICATE_HANDLE_OPTIONS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetHandleInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetHandleInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.HANDLE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FreeLibrary": {
      "args": [
        "Windows.Win32.Foundation.HMODULE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetLastError": {
      "args": [],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetLastError": {
      "args": [
        "Windows.Win32.Foundation.WIN32_ERROR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GlobalFree": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "Windows.Win32.Foundation.HGLOBAL",
      "setLastError": false
    },
    "LocalFree": {
      "args": [
        "Windows.Win32.Foundation.HLOCAL"
      ],
      "returns": "Windows.Win32.Foundation.HLOCAL",
      "setLastError": false
    },
    "GetDateFormatA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetDateFormatW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetTimeFormatA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetTimeFormatW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetTimeFormatEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.TIME_FORMAT_FLAGS",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetDateFormatEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.ENUM_DATE_FORMATS_FLAGS",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetDurationFormatEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "u64",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "CompareStringEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.COMPARE_STRING_FLAGS",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Globalization.NLSVERSIONINFO*",
        "void*",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Globalization.COMPARESTRING_RESULT",
      "setLastError": false
    },
    "CompareStringOrdinal": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Globalization.COMPARESTRING_RESULT",
      "setLastError": false
    },
    "CompareStringW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Globalization.COMPARESTRING_RESULT",
      "setLastError": false
    },
    "FoldStringW": {
      "args": [
        "Windows.Win32.Globalization.FOLD_STRING_MAP_FLAGS",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetStringTypeExW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetStringTypeW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MultiByteToWideChar": {
      "args": [
        "u32",
        "Windows.Win32.Globalization.MULTI_BYTE_TO_WIDE_CHAR_FLAGS",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "WideCharToMultiByte": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "IsValidCodePage": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetACP": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetOEMCP": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetCPInfo": {
      "args": [
        "u32",
        "Windows.Win32.Globalization.CPINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCPInfoExA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Globalization.CPINFOEXA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCPInfoExW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Globalization.CPINFOEXW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CompareStringA": {
      "args": [
        "u32",
        "u32",
        "i8*",
        "i32",
        "i8*",
        "i32"
      ],
      "returns": "Windows.Win32.Globalization.COMPARESTRING_RESULT",
      "setLastError": false
    },
    "FindNLSString": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LCMapStringW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LCMapStringA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetLocaleInfoW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetLocaleInfoA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetLocaleInfoA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetLocaleInfoW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCalendarInfoA": {
      "args": [
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "u32*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetCalendarInfoW": {
      "args": [
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u32*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetCalendarInfoA": {
      "args": [
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCalendarInfoW": {
      "args": [
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsDBCSLeadByte": {
      "args": [
        "u8"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsDBCSLeadByteEx": {
      "args": [
        "u32",
        "u8"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LocaleNameToLCID": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "LCIDToLocaleName": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetDurationFormat": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "u64",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetNumberFormatA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Globalization.NUMBERFMTA*",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetNumberFormatW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.NUMBERFMTW*",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetCurrencyFormatA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Globalization.CURRENCYFMTA*",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetCurrencyFormatW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.CURRENCYFMTW*",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumCalendarInfoA": {
      "args": [
        "Windows.Win32.Globalization.CALINFO_ENUMPROCA",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumCalendarInfoW": {
      "args": [
        "Windows.Win32.Globalization.CALINFO_ENUMPROCW",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumCalendarInfoExA": {
      "args": [
        "Windows.Win32.Globalization.CALINFO_ENUMPROCEXA",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumCalendarInfoExW": {
      "args": [
        "Windows.Win32.Globalization.CALINFO_ENUMPROCEXW",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumTimeFormatsA": {
      "args": [
        "Windows.Win32.Globalization.TIMEFMT_ENUMPROCA",
        "u32",
        "Windows.Win32.Globalization.TIME_FORMAT_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumTimeFormatsW": {
      "args": [
        "Windows.Win32.Globalization.TIMEFMT_ENUMPROCW",
        "u32",
        "Windows.Win32.Globalization.TIME_FORMAT_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDateFormatsA": {
      "args": [
        "Windows.Win32.Globalization.DATEFMT_ENUMPROCA",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDateFormatsW": {
      "args": [
        "Windows.Win32.Globalization.DATEFMT_ENUMPROCW",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDateFormatsExA": {
      "args": [
        "Windows.Win32.Globalization.DATEFMT_ENUMPROCEXA",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDateFormatsExW": {
      "args": [
        "Windows.Win32.Globalization.DATEFMT_ENUMPROCEXW",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsValidLanguageGroup": {
      "args": [
        "u32",
        "Windows.Win32.Globalization.ENUM_SYSTEM_LANGUAGE_GROUPS_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNLSVersion": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Globalization.NLSVERSIONINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsValidLocale": {
      "args": [
        "u32",
        "Windows.Win32.Globalization.IS_VALID_LOCALE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetGeoInfoA": {
      "args": [
        "i32",
        "Windows.Win32.Globalization.SYSGEOTYPE",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "u16"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetGeoInfoW": {
      "args": [
        "i32",
        "Windows.Win32.Globalization.SYSGEOTYPE",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u16"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetGeoInfoEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.SYSGEOTYPE",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumSystemGeoID": {
      "args": [
        "u32",
        "i32",
        "Windows.Win32.Globalization.GEO_ENUMPROC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumSystemGeoNames": {
      "args": [
        "u32",
        "Windows.Win32.Globalization.GEO_ENUMNAMEPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUserGeoID": {
      "args": [
        "Windows.Win32.Globalization.SYSGEOCLASS"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetUserDefaultGeoName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetUserGeoID": {
      "args": [
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetUserGeoName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertDefaultLocale": {
      "args": [
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSystemDefaultUILanguage": {
      "args": [],
      "returns": "u16",
      "setLastError": false
    },
    "GetThreadLocale": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "SetThreadLocale": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUserDefaultUILanguage": {
      "args": [],
      "returns": "u16",
      "setLastError": false
    },
    "GetUserDefaultLangID": {
      "args": [],
      "returns": "u16",
      "setLastError": false
    },
    "GetSystemDefaultLangID": {
      "args": [],
      "returns": "u16",
      "setLastError": false
    },
    "GetSystemDefaultLCID": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetUserDefaultLCID": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "SetThreadUILanguage": {
      "args": [
        "u16"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GetThreadUILanguage": {
      "args": [],
      "returns": "u16",
      "setLastError": false
    },
    "GetProcessPreferredUILanguages": {
      "args": [
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessPreferredUILanguages": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUserPreferredUILanguages": {
      "args": [
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSystemPreferredUILanguages": {
      "args": [
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadPreferredUILanguages": {
      "args": [
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadPreferredUILanguages": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileMUIInfo": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.FILEMUIINFO*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileMUIPath": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUILanguageInfo": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadPreferredUILanguages2": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Globalization.HSAVEDUILANGUAGES*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RestoreThreadPreferredUILanguages": {
      "args": [
        "Windows.Win32.Globalization.HSAVEDUILANGUAGES"
      ],
      "returns": "void",
      "setLastError": false
    },
    "NotifyUILanguageChange": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetStringTypeExA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetStringTypeA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FoldStringA": {
      "args": [
        "Windows.Win32.Globalization.FOLD_STRING_MAP_FLAGS",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumSystemLocalesA": {
      "args": [
        "Windows.Win32.Globalization.LOCALE_ENUMPROCA",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumSystemLocalesW": {
      "args": [
        "Windows.Win32.Globalization.LOCALE_ENUMPROCW",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumSystemLanguageGroupsA": {
      "args": [
        "Windows.Win32.Globalization.LANGUAGEGROUP_ENUMPROCA",
        "Windows.Win32.Globalization.ENUM_SYSTEM_LANGUAGE_GROUPS_FLAGS",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumSystemLanguageGroupsW": {
      "args": [
        "Windows.Win32.Globalization.LANGUAGEGROUP_ENUMPROCW",
        "Windows.Win32.Globalization.ENUM_SYSTEM_LANGUAGE_GROUPS_FLAGS",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumLanguageGroupLocalesA": {
      "args": [
        "Windows.Win32.Globalization.LANGGROUPLOCALE_ENUMPROCA",
        "u32",
        "u32",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumLanguageGroupLocalesW": {
      "args": [
        "Windows.Win32.Globalization.LANGGROUPLOCALE_ENUMPROCW",
        "u32",
        "u32",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumUILanguagesA": {
      "args": [
        "Windows.Win32.Globalization.UILANGUAGE_ENUMPROCA",
        "u32",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumUILanguagesW": {
      "args": [
        "Windows.Win32.Globalization.UILANGUAGE_ENUMPROCW",
        "u32",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumSystemCodePagesA": {
      "args": [
        "Windows.Win32.Globalization.CODEPAGE_ENUMPROCA",
        "Windows.Win32.Globalization.ENUM_SYSTEM_CODE_PAGES_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumSystemCodePagesW": {
      "args": [
        "Windows.Win32.Globalization.CODEPAGE_ENUMPROCW",
        "Windows.Win32.Globalization.ENUM_SYSTEM_CODE_PAGES_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IdnToNameprepUnicode": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "NormalizeString": {
      "args": [
        "Windows.Win32.Globalization.NORM_FORM",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "IsNormalizedString": {
      "args": [
        "Windows.Win32.Globalization.NORM_FORM",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VerifyScripts": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetStringScripts": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetLocaleInfoEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetCalendarInfoEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u32*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetNumberFormatEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.NUMBERFMTW*",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetCurrencyFormatEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.CURRENCYFMTW*",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetUserDefaultLocaleName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetSystemDefaultLocaleName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "IsNLSDefinedString": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Globalization.NLSVERSIONINFO*",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNLSVersionEx": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.NLSVERSIONINFOEX*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsValidNLSVersion": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.NLSVERSIONINFOEX*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FindNLSStringEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32*",
        "Windows.Win32.Globalization.NLSVERSIONINFO*",
        "void*",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LCMapStringEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Globalization.NLSVERSIONINFO*",
        "void*",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "IsValidLocaleName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumCalendarInfoExEx": {
      "args": [
        "Windows.Win32.Globalization.CALINFO_ENUMPROCEXEX",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDateFormatsExEx": {
      "args": [
        "Windows.Win32.Globalization.DATEFMT_ENUMPROCEXEX",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Globalization.ENUM_DATE_FORMATS_FLAGS",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumTimeFormatsEx": {
      "args": [
        "Windows.Win32.Globalization.TIMEFMT_ENUMPROCEX",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumSystemLocalesEx": {
      "args": [
        "Windows.Win32.Globalization.LOCALE_ENUMPROCEX",
        "u32",
        "Windows.Win32.Foundation.LPARAM",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ResolveLocaleName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetCalendarSupportedDateRange": {
      "args": [
        "u32",
        "Windows.Win32.Globalization.CALDATETIME*",
        "Windows.Win32.Globalization.CALDATETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCalendarDateFormatEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Globalization.CALDATETIME*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertSystemTimeToCalDateTime": {
      "args": [
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "u32",
        "Windows.Win32.Globalization.CALDATETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UpdateCalendarDayOfWeek": {
      "args": [
        "Windows.Win32.Globalization.CALDATETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AdjustCalendarDate": {
      "args": [
        "Windows.Win32.Globalization.CALDATETIME*",
        "Windows.Win32.Globalization.CALDATETIME_DATEUNIT",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertCalDateTimeToSystemTime": {
      "args": [
        "Windows.Win32.Globalization.CALDATETIME*",
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsCalendarLeapYear": {
      "args": [
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindStringOrdinal": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "lstrcmpA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "lstrcmpW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "lstrcmpiA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "lstrcmpiW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "lstrcpynA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "lstrcpynW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "lstrcpyA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "lstrcpyW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "lstrcatA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "lstrcatW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "lstrlenA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "lstrlenW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "ProcessIdToSessionId": {
      "args": [
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSGetActiveConsoleSessionId": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "AddResourceAttributeAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "Windows.Win32.Security.ACE_FLAGS",
        "u32",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.CLAIM_SECURITY_ATTRIBUTES_INFORMATION*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddScopedPolicyIDAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "Windows.Win32.Security.ACE_FLAGS",
        "u32",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CheckTokenCapability": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetAppContainerAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "u32",
        "void**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CheckTokenMembershipEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.PSID",
        "u32",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCachedSigningLevel": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "u32",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCachedSigningLevel": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32*",
        "u8*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GlobalMemoryStatusEx": {
      "args": [
        "Windows.Win32.System.SystemInformation.MEMORYSTATUSEX*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSystemInfo": {
      "args": [
        "Windows.Win32.System.SystemInformation.SYSTEM_INFO*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetSystemTime": {
      "args": [
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetSystemTimeAsFileTime": {
      "args": [
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetLocalTime": {
      "args": [
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "IsUserCetAvailableInEnvironment": {
      "args": [
        "Windows.Win32.System.SystemInformation.USER_CET_ENVIRONMENT"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSystemLeapSecondInformation": {
      "args": [
        "Windows.Win32.Foundation.BOOL*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetVersion": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "SetLocalTime": {
      "args": [
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTickCount": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetTickCount64": {
      "args": [],
      "returns": "u64",
      "setLastError": false
    },
    "GetSystemTimeAdjustment": {
      "args": [
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSystemDirectoryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSystemDirectoryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetWindowsDirectoryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetWindowsDirectoryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSystemWindowsDirectoryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSystemWindowsDirectoryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetComputerNameExA": {
      "args": [
        "Windows.Win32.System.SystemInformation.COMPUTER_NAME_FORMAT",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetComputerNameExW": {
      "args": [
        "Windows.Win32.System.SystemInformation.COMPUTER_NAME_FORMAT",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetComputerNameExW": {
      "args": [
        "Windows.Win32.System.SystemInformation.COMPUTER_NAME_FORMAT",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetSystemTime": {
      "args": [
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetVersionExA": {
      "args": [
        "Windows.Win32.System.SystemInformation.OSVERSIONINFOA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetVersionExW": {
      "args": [
        "Windows.Win32.System.SystemInformation.OSVERSIONINFOW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetLogicalProcessorInformation": {
      "args": [
        "Windows.Win32.System.SystemInformation.SYSTEM_LOGICAL_PROCESSOR_INFORMATION*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetLogicalProcessorInformationEx": {
      "args": [
        "Windows.Win32.System.SystemInformation.LOGICAL_PROCESSOR_RELATIONSHIP",
        "Windows.Win32.System.SystemInformation.SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNativeSystemInfo": {
      "args": [
        "Windows.Win32.System.SystemInformation.SYSTEM_INFO*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetSystemTimePreciseAsFileTime": {
      "args": [
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetProductInfo": {
      "args": [
        "u32",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.System.SystemInformation.OS_PRODUCT_TYPE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VerSetConditionMask": {
      "args": [
        "u64",
        "Windows.Win32.System.SystemInformation.VER_FLAGS",
        "u8"
      ],
      "returns": "u64",
      "setLastError": false
    },
    "EnumSystemFirmwareTables": {
      "args": [
        "Windows.Win32.System.SystemInformation.FIRMWARE_TABLE_PROVIDER",
        "u8*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSystemFirmwareTable": {
      "args": [
        "Windows.Win32.System.SystemInformation.FIRMWARE_TABLE_PROVIDER",
        "u32",
        "u8*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DnsHostnameToComputerNameExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPhysicallyInstalledSystemMemory": {
      "args": [
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetComputerNameEx2W": {
      "args": [
        "Windows.Win32.System.SystemInformation.COMPUTER_NAME_FORMAT",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetSystemTimeAdjustment": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessorSystemCycleTime": {
      "args": [
        "u16",
        "Windows.Win32.System.SystemInformation.SYSTEM_PROCESSOR_CYCLE_TIME_INFORMATION*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetComputerNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetComputerNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetComputerNameExA": {
      "args": [
        "Windows.Win32.System.SystemInformation.COMPUTER_NAME_FORMAT",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetRuntimeAttestationReport": {
      "args": [
        "u8*",
        "u16",
        "u64",
        "void*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSystemCpuSetInformation": {
      "args": [
        "Windows.Win32.System.SystemInformation.SYSTEM_CPU_SET_INFORMATION*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSystemWow64DirectoryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSystemWow64DirectoryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "IsWow64GuestMachineSupported": {
      "args": [
        "Windows.Win32.System.SystemInformation.IMAGE_FILE_MACHINE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GlobalMemoryStatus": {
      "args": [
        "Windows.Win32.System.SystemInformation.MEMORYSTATUS*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetSystemDEPPolicy": {
      "args": [],
      "returns": "Windows.Win32.System.SystemInformation.DEP_SYSTEM_POLICY_TYPE",
      "setLastError": false
    },
    "GetFirmwareType": {
      "args": [
        "Windows.Win32.System.SystemInformation.FIRMWARE_TYPE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VerifyVersionInfoA": {
      "args": [
        "Windows.Win32.System.SystemInformation.OSVERSIONINFOEXA*",
        "Windows.Win32.System.SystemInformation.VER_FLAGS",
        "u64"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VerifyVersionInfoW": {
      "args": [
        "Windows.Win32.System.SystemInformation.OSVERSIONINFOEXW*",
        "Windows.Win32.System.SystemInformation.VER_FLAGS",
        "u64"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessWorkingSetSize": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize*",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessWorkingSetSize": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FlsAlloc": {
      "args": [
        "Windows.Win32.System.Threading.PFLS_CALLBACK_FUNCTION"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FlsGetValue": {
      "args": [
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "FlsSetValue": {
      "args": [
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FlsFree": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsThreadAFiber": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FlsGetValue2": {
      "args": [
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "InitializeSRWLock": {
      "args": [
        "Windows.Win32.System.Threading.SRWLOCK*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ReleaseSRWLockExclusive": {
      "args": [
        "Windows.Win32.System.Threading.SRWLOCK*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ReleaseSRWLockShared": {
      "args": [
        "Windows.Win32.System.Threading.SRWLOCK*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "AcquireSRWLockExclusive": {
      "args": [
        "Windows.Win32.System.Threading.SRWLOCK*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "AcquireSRWLockShared": {
      "args": [
        "Windows.Win32.System.Threading.SRWLOCK*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "TryAcquireSRWLockExclusive": {
      "args": [
        "Windows.Win32.System.Threading.SRWLOCK*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "TryAcquireSRWLockShared": {
      "args": [
        "Windows.Win32.System.Threading.SRWLOCK*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "InitializeCriticalSection": {
      "args": [
        "Windows.Win32.System.Threading.CRITICAL_SECTION*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EnterCriticalSection": {
      "args": [
        "Windows.Win32.System.Threading.CRITICAL_SECTION*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "LeaveCriticalSection": {
      "args": [
        "Windows.Win32.System.Threading.CRITICAL_SECTION*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "InitializeCriticalSectionAndSpinCount": {
      "args": [
        "Windows.Win32.System.Threading.CRITICAL_SECTION*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitializeCriticalSectionEx": {
      "args": [
        "Windows.Win32.System.Threading.CRITICAL_SECTION*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCriticalSectionSpinCount": {
      "args": [
        "Windows.Win32.System.Threading.CRITICAL_SECTION*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "TryEnterCriticalSection": {
      "args": [
        "Windows.Win32.System.Threading.CRITICAL_SECTION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteCriticalSection": {
      "args": [
        "Windows.Win32.System.Threading.CRITICAL_SECTION*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "InitOnceInitialize": {
      "args": [
        "Windows.Win32.System.Threading.INIT_ONCE*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "InitOnceExecuteOnce": {
      "args": [
        "Windows.Win32.System.Threading.INIT_ONCE*",
        "Windows.Win32.System.Threading.PINIT_ONCE_FN",
        "void*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitOnceBeginInitialize": {
      "args": [
        "Windows.Win32.System.Threading.INIT_ONCE*",
        "u32",
        "Windows.Win32.Foundation.BOOL*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitOnceComplete": {
      "args": [
        "Windows.Win32.System.Threading.INIT_ONCE*",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitializeConditionVariable": {
      "args": [
        "Windows.Win32.System.Threading.CONDITION_VARIABLE*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "WakeConditionVariable": {
      "args": [
        "Windows.Win32.System.Threading.CONDITION_VARIABLE*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "WakeAllConditionVariable": {
      "args": [
        "Windows.Win32.System.Threading.CONDITION_VARIABLE*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SleepConditionVariableCS": {
      "args": [
        "Windows.Win32.System.Threading.CONDITION_VARIABLE*",
        "Windows.Win32.System.Threading.CRITICAL_SECTION*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SleepConditionVariableSRW": {
      "args": [
        "Windows.Win32.System.Threading.CONDITION_VARIABLE*",
        "Windows.Win32.System.Threading.SRWLOCK*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetEvent": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ResetEvent": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReleaseSemaphore": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "i32",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReleaseMutex": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WaitForSingleObject": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WAIT_EVENT",
      "setLastError": false
    },
    "SleepEx": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "WaitForSingleObjectEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.WAIT_EVENT",
      "setLastError": false
    },
    "WaitForMultipleObjectsEx": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Foundation.BOOL",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.WAIT_EVENT",
      "setLastError": false
    },
    "CreateMutexA": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateMutexW": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenMutexW": {
      "args": [
        "Windows.Win32.System.Threading.SYNCHRONIZATION_ACCESS_RIGHTS",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateEventA": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateEventW": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenEventA": {
      "args": [
        "Windows.Win32.System.Threading.SYNCHRONIZATION_ACCESS_RIGHTS",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenEventW": {
      "args": [
        "Windows.Win32.System.Threading.SYNCHRONIZATION_ACCESS_RIGHTS",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenSemaphoreW": {
      "args": [
        "Windows.Win32.System.Threading.SYNCHRONIZATION_ACCESS_RIGHTS",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenWaitableTimerW": {
      "args": [
        "Windows.Win32.System.Threading.SYNCHRONIZATION_ACCESS_RIGHTS",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "SetWaitableTimerEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "i64*",
        "i32",
        "Windows.Win32.System.Threading.PTIMERAPCROUTINE",
        "void*",
        "Windows.Win32.System.Threading.REASON_CONTEXT*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWaitableTimer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "i64*",
        "i32",
        "Windows.Win32.System.Threading.PTIMERAPCROUTINE",
        "void*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CancelWaitableTimer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateMutexExA": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateMutexExW": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateEventExA": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Threading.CREATE_EVENT",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateEventExW": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Threading.CREATE_EVENT",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateSemaphoreExW": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateWaitableTimerExW": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "EnterSynchronizationBarrier": {
      "args": [
        "Windows.Win32.System.Threading.SYNCHRONIZATION_BARRIER*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitializeSynchronizationBarrier": {
      "args": [
        "Windows.Win32.System.Threading.SYNCHRONIZATION_BARRIER*",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteSynchronizationBarrier": {
      "args": [
        "Windows.Win32.System.Threading.SYNCHRONIZATION_BARRIER*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Sleep": {
      "args": [
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "WaitForMultipleObjects": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Foundation.BOOL",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WAIT_EVENT",
      "setLastError": false
    },
    "CreateSemaphoreW": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateWaitableTimerW": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "InitializeSListHead": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "InterlockedPopEntrySList": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*"
      ],
      "returns": "Windows.Win32.System.Kernel.SLIST_ENTRY*",
      "setLastError": false
    },
    "InterlockedPushEntrySList": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*",
        "Windows.Win32.System.Kernel.SLIST_ENTRY*"
      ],
      "returns": "Windows.Win32.System.Kernel.SLIST_ENTRY*",
      "setLastError": false
    },
    "InterlockedPushListSListEx": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*",
        "Windows.Win32.System.Kernel.SLIST_ENTRY*",
        "Windows.Win32.System.Kernel.SLIST_ENTRY*",
        "u32"
      ],
      "returns": "Windows.Win32.System.Kernel.SLIST_ENTRY*",
      "setLastError": false
    },
    "InterlockedFlushSList": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*"
      ],
      "returns": "Windows.Win32.System.Kernel.SLIST_ENTRY*",
      "setLastError": false
    },
    "QueryDepthSList": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "QueueUserAPC": {
      "args": [
        "Windows.Win32.Foundation.PAPCFUNC",
        "Windows.Win32.Foundation.HANDLE",
        "usize"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "QueueUserAPC2": {
      "args": [
        "Windows.Win32.Foundation.PAPCFUNC",
        "Windows.Win32.Foundation.HANDLE",
        "usize",
        "Windows.Win32.System.Threading.QUEUE_USER_APC_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessTimes": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentProcess": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetCurrentProcessId": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "ExitProcess": {
      "args": [
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "TerminateProcess": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetExitCodeProcess": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SwitchToThread": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateThread": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "usize",
        "Windows.Win32.System.Threading.LPTHREAD_START_ROUTINE",
        "void*",
        "Windows.Win32.System.Threading.THREAD_CREATION_FLAGS",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateRemoteThread": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "usize",
        "Windows.Win32.System.Threading.LPTHREAD_START_ROUTINE",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetCurrentThread": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetCurrentThreadId": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "OpenThread": {
      "args": [
        "Windows.Win32.System.Threading.THREAD_ACCESS_RIGHTS",
        "Windows.Win32.Foundation.BOOL",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "SetThreadPriority": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.THREAD_PRIORITY"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadPriorityBoost": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadPriorityBoost": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadPriority": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "ExitThread": {
      "args": [
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "TerminateThread": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetExitCodeThread": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SuspendThread": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ResumeThread": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "TlsAlloc": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "TlsGetValue": {
      "args": [
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "TlsSetValue": {
      "args": [
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TlsFree": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateProcessA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Threading.PROCESS_CREATION_FLAGS",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Threading.STARTUPINFOA*",
        "Windows.Win32.System.Threading.PROCESS_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateProcessW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Threading.PROCESS_CREATION_FLAGS",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Threading.STARTUPINFOW*",
        "Windows.Win32.System.Threading.PROCESS_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessShutdownParameters": {
      "args": [
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessVersion": {
      "args": [
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetStartupInfoW": {
      "args": [
        "Windows.Win32.System.Threading.STARTUPINFOW*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetPriorityClass": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.PROCESS_CREATION_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPriorityClass": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetThreadStackGuarantee": {
      "args": [
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetThreadId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FlushProcessWriteBuffers": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "GetProcessIdOfThread": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "InitializeProcThreadAttributeList": {
      "args": [
        "Windows.Win32.System.Threading.LPPROC_THREAD_ATTRIBUTE_LIST",
        "u32",
        "u32",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteProcThreadAttributeList": {
      "args": [
        "Windows.Win32.System.Threading.LPPROC_THREAD_ATTRIBUTE_LIST"
      ],
      "returns": "void",
      "setLastError": false
    },
    "UpdateProcThreadAttribute": {
      "args": [
        "Windows.Win32.System.Threading.LPPROC_THREAD_ATTRIBUTE_LIST",
        "u32",
        "usize",
        "void*",
        "usize",
        "void*",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessDynamicEHContinuationTargets": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u16",
        "Windows.Win32.System.Threading.PROCESS_DYNAMIC_EH_CONTINUATION_TARGET*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessDynamicEnforcedCetCompatibleRanges": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u16",
        "Windows.Win32.System.Threading.PROCESS_DYNAMIC_ENFORCED_ADDRESS_RANGE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessAffinityUpdateMode": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.PROCESS_AFFINITY_AUTO_UPDATE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryProcessAffinityUpdateMode": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.PROCESS_AFFINITY_AUTO_UPDATE_FLAGS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateRemoteThreadEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "usize",
        "Windows.Win32.System.Threading.LPTHREAD_START_ROUTINE",
        "void*",
        "u32",
        "Windows.Win32.System.Threading.LPPROC_THREAD_ATTRIBUTE_LIST",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetCurrentThreadStackLimits": {
      "args": [
        "usize*",
        "usize*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetProcessMitigationPolicy": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.PROCESS_MITIGATION_POLICY",
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessMitigationPolicy": {
      "args": [
        "Windows.Win32.System.Threading.PROCESS_MITIGATION_POLICY",
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadTimes": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OpenProcess": {
      "args": [
        "Windows.Win32.System.Threading.PROCESS_ACCESS_RIGHTS",
        "Windows.Win32.Foundation.BOOL",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "IsProcessorFeaturePresent": {
      "args": [
        "Windows.Win32.System.Threading.PROCESSOR_FEATURE_ID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessHandleCount": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentProcessorNumber": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "SetThreadIdealProcessorEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Kernel.PROCESSOR_NUMBER*",
        "Windows.Win32.System.Kernel.PROCESSOR_NUMBER*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadIdealProcessorEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Kernel.PROCESSOR_NUMBER*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentProcessorNumberEx": {
      "args": [
        "Windows.Win32.System.Kernel.PROCESSOR_NUMBER*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetProcessPriorityBoost": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessPriorityBoost": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadIOPendingFlag": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSystemTimes": {
      "args": [
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.THREAD_INFORMATION_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.THREAD_INFORMATION_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsProcessCritical": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProtectedPolicy": {
      "args": [
        "System.Guid*",
        "usize",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryProtectedPolicy": {
      "args": [
        "System.Guid*",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadIdealProcessor": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetProcessInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.PROCESS_INFORMATION_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.PROCESS_INFORMATION_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessDefaultCpuSets": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessDefaultCpuSets": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadSelectedCpuSets": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadSelectedCpuSets": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessShutdownParameters": {
      "args": [
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessDefaultCpuSetMasks": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.SystemInformation.GROUP_AFFINITY*",
        "u16",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessDefaultCpuSetMasks": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.SystemInformation.GROUP_AFFINITY*",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadSelectedCpuSetMasks": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.SystemInformation.GROUP_AFFINITY*",
        "u16",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadSelectedCpuSetMasks": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.SystemInformation.GROUP_AFFINITY*",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMachineTypeAttributes": {
      "args": [
        "u16",
        "Windows.Win32.System.Threading.MACHINE_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SetThreadDescription": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetThreadDescription": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "TlsGetValue2": {
      "args": [
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "QueueUserWorkItem": {
      "args": [
        "Windows.Win32.System.Threading.LPTHREAD_START_ROUTINE",
        "void*",
        "Windows.Win32.System.Threading.WORKER_THREAD_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnregisterWaitEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateTimerQueue": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateTimerQueueTimer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.WAITORTIMERCALLBACK",
        "void*",
        "u32",
        "u32",
        "Windows.Win32.System.Threading.WORKER_THREAD_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChangeTimerQueueTimer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteTimerQueueTimer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteTimerQueue": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteTimerQueueEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateThreadpool": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.System.Threading.PTP_POOL",
      "setLastError": false
    },
    "SetThreadpoolThreadMaximum": {
      "args": [
        "Windows.Win32.System.Threading.PTP_POOL",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetThreadpoolThreadMinimum": {
      "args": [
        "Windows.Win32.System.Threading.PTP_POOL",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadpoolStackInformation": {
      "args": [
        "Windows.Win32.System.Threading.PTP_POOL",
        "Windows.Win32.System.Threading.TP_POOL_STACK_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryThreadpoolStackInformation": {
      "args": [
        "Windows.Win32.System.Threading.PTP_POOL",
        "Windows.Win32.System.Threading.TP_POOL_STACK_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseThreadpool": {
      "args": [
        "Windows.Win32.System.Threading.PTP_POOL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CreateThreadpoolCleanupGroup": {
      "args": [],
      "returns": "Windows.Win32.System.Threading.PTP_CLEANUP_GROUP",
      "setLastError": false
    },
    "CloseThreadpoolCleanupGroupMembers": {
      "args": [
        "Windows.Win32.System.Threading.PTP_CLEANUP_GROUP",
        "Windows.Win32.Foundation.BOOL",
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CloseThreadpoolCleanupGroup": {
      "args": [
        "Windows.Win32.System.Threading.PTP_CLEANUP_GROUP"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetEventWhenCallbackReturns": {
      "args": [
        "Windows.Win32.System.Threading.PTP_CALLBACK_INSTANCE",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ReleaseSemaphoreWhenCallbackReturns": {
      "args": [
        "Windows.Win32.System.Threading.PTP_CALLBACK_INSTANCE",
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ReleaseMutexWhenCallbackReturns": {
      "args": [
        "Windows.Win32.System.Threading.PTP_CALLBACK_INSTANCE",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "LeaveCriticalSectionWhenCallbackReturns": {
      "args": [
        "Windows.Win32.System.Threading.PTP_CALLBACK_INSTANCE",
        "Windows.Win32.System.Threading.CRITICAL_SECTION*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "FreeLibraryWhenCallbackReturns": {
      "args": [
        "Windows.Win32.System.Threading.PTP_CALLBACK_INSTANCE",
        "Windows.Win32.Foundation.HMODULE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CallbackMayRunLong": {
      "args": [
        "Windows.Win32.System.Threading.PTP_CALLBACK_INSTANCE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DisassociateCurrentThreadFromCallback": {
      "args": [
        "Windows.Win32.System.Threading.PTP_CALLBACK_INSTANCE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "TrySubmitThreadpoolCallback": {
      "args": [
        "Windows.Win32.System.Threading.PTP_SIMPLE_CALLBACK",
        "void*",
        "Windows.Win32.System.Threading.TP_CALLBACK_ENVIRON_V3*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateThreadpoolWork": {
      "args": [
        "Windows.Win32.System.Threading.PTP_WORK_CALLBACK",
        "void*",
        "Windows.Win32.System.Threading.TP_CALLBACK_ENVIRON_V3*"
      ],
      "returns": "Windows.Win32.System.Threading.PTP_WORK",
      "setLastError": false
    },
    "SubmitThreadpoolWork": {
      "args": [
        "Windows.Win32.System.Threading.PTP_WORK"
      ],
      "returns": "void",
      "setLastError": false
    },
    "WaitForThreadpoolWorkCallbacks": {
      "args": [
        "Windows.Win32.System.Threading.PTP_WORK",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CloseThreadpoolWork": {
      "args": [
        "Windows.Win32.System.Threading.PTP_WORK"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CreateThreadpoolTimer": {
      "args": [
        "Windows.Win32.System.Threading.PTP_TIMER_CALLBACK",
        "void*",
        "Windows.Win32.System.Threading.TP_CALLBACK_ENVIRON_V3*"
      ],
      "returns": "Windows.Win32.System.Threading.PTP_TIMER",
      "setLastError": false
    },
    "SetThreadpoolTimer": {
      "args": [
        "Windows.Win32.System.Threading.PTP_TIMER",
        "Windows.Win32.Foundation.FILETIME*",
        "u32",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "IsThreadpoolTimerSet": {
      "args": [
        "Windows.Win32.System.Threading.PTP_TIMER"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WaitForThreadpoolTimerCallbacks": {
      "args": [
        "Windows.Win32.System.Threading.PTP_TIMER",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CloseThreadpoolTimer": {
      "args": [
        "Windows.Win32.System.Threading.PTP_TIMER"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CreateThreadpoolWait": {
      "args": [
        "Windows.Win32.System.Threading.PTP_WAIT_CALLBACK",
        "void*",
        "Windows.Win32.System.Threading.TP_CALLBACK_ENVIRON_V3*"
      ],
      "returns": "Windows.Win32.System.Threading.PTP_WAIT",
      "setLastError": false
    },
    "SetThreadpoolWait": {
      "args": [
        "Windows.Win32.System.Threading.PTP_WAIT",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "WaitForThreadpoolWaitCallbacks": {
      "args": [
        "Windows.Win32.System.Threading.PTP_WAIT",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CloseThreadpoolWait": {
      "args": [
        "Windows.Win32.System.Threading.PTP_WAIT"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CreateThreadpoolIo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.PTP_WIN32_IO_CALLBACK",
        "void*",
        "Windows.Win32.System.Threading.TP_CALLBACK_ENVIRON_V3*"
      ],
      "returns": "Windows.Win32.System.Threading.PTP_IO",
      "setLastError": false
    },
    "StartThreadpoolIo": {
      "args": [
        "Windows.Win32.System.Threading.PTP_IO"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CancelThreadpoolIo": {
      "args": [
        "Windows.Win32.System.Threading.PTP_IO"
      ],
      "returns": "void",
      "setLastError": false
    },
    "WaitForThreadpoolIoCallbacks": {
      "args": [
        "Windows.Win32.System.Threading.PTP_IO",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CloseThreadpoolIo": {
      "args": [
        "Windows.Win32.System.Threading.PTP_IO"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetThreadpoolTimerEx": {
      "args": [
        "Windows.Win32.System.Threading.PTP_TIMER",
        "Windows.Win32.Foundation.FILETIME*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadpoolWaitEx": {
      "args": [
        "Windows.Win32.System.Threading.PTP_WAIT",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.FILETIME*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsWow64Process": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsWow64Process2": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.SystemInformation.IMAGE_FILE_MACHINE*",
        "Windows.Win32.System.SystemInformation.IMAGE_FILE_MACHINE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Wow64SuspendThread": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreatePrivateNamespaceW": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "void*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenPrivateNamespaceW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "ClosePrivateNamespace": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "CreateBoundaryDescriptorW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "AddSIDToBoundaryDescriptor": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteBoundaryDescriptor": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetNumaHighestNodeNumber": {
      "args": [
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumaNodeProcessorMaskEx": {
      "args": [
        "u16",
        "Windows.Win32.System.SystemInformation.GROUP_AFFINITY*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumaNodeProcessorMask2": {
      "args": [
        "u16",
        "Windows.Win32.System.SystemInformation.GROUP_AFFINITY*",
        "u16",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumaProximityNodeEx": {
      "args": [
        "u32",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessGroupAffinity": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u16*",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadGroupAffinity": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.SystemInformation.GROUP_AFFINITY*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadGroupAffinity": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.SystemInformation.GROUP_AFFINITY*",
        "Windows.Win32.System.SystemInformation.GROUP_AFFINITY*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessAffinityMask": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize*",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessAffinityMask": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessIoCounters": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.IO_COUNTERS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SwitchToFiber": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "DeleteFiber": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ConvertFiberToThread": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateFiberEx": {
      "args": [
        "usize",
        "usize",
        "u32",
        "Windows.Win32.System.Threading.LPFIBER_START_ROUTINE",
        "void*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "ConvertThreadToFiberEx": {
      "args": [
        "void*",
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "CreateFiber": {
      "args": [
        "usize",
        "Windows.Win32.System.Threading.LPFIBER_START_ROUTINE",
        "void*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "ConvertThreadToFiber": {
      "args": [
        "void*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "CreateUmsCompletionList": {
      "args": [
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DequeueUmsCompletionListItems": {
      "args": [
        "void*",
        "u32",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUmsCompletionListEvent": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ExecuteUmsThread": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UmsThreadYield": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteUmsCompletionList": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentUmsThread": {
      "args": [],
      "returns": "void*",
      "setLastError": false
    },
    "GetNextUmsListItem": {
      "args": [
        "void*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "QueryUmsThreadInformation": {
      "args": [
        "void*",
        "Windows.Win32.System.Threading.UMS_THREAD_INFO_CLASS",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetUmsThreadInformation": {
      "args": [
        "void*",
        "Windows.Win32.System.Threading.UMS_THREAD_INFO_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteUmsThreadContext": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateUmsThreadContext": {
      "args": [
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnterUmsSchedulingMode": {
      "args": [
        "Windows.Win32.System.Threading.UMS_SCHEDULER_STARTUP_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUmsSystemThreadInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.UMS_SYSTEM_THREAD_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadAffinityMask": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "SetProcessDEPPolicy": {
      "args": [
        "Windows.Win32.System.Threading.PROCESS_DEP_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessDEPPolicy": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PulseEvent": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WinExec": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SignalObjectAndWait": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.WAIT_EVENT",
      "setLastError": false
    },
    "CreateSemaphoreA": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateWaitableTimerA": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenWaitableTimerA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateSemaphoreExA": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateWaitableTimerExA": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "QueryFullProcessImageNameA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.PROCESS_NAME_FORMAT",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryFullProcessImageNameW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.PROCESS_NAME_FORMAT",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetStartupInfoA": {
      "args": [
        "Windows.Win32.System.Threading.STARTUPINFOA*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RegisterWaitForSingleObject": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.WAITORTIMERCALLBACK",
        "void*",
        "u32",
        "Windows.Win32.System.Threading.WORKER_THREAD_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnregisterWait": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetTimerQueueTimer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.WAITORTIMERCALLBACK",
        "void*",
        "u32",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CancelTimerQueueTimer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreatePrivateNamespaceA": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "void*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenPrivateNamespaceA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateBoundaryDescriptorA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "AddIntegrityLabelToBoundaryDescriptor": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetActiveProcessorGroupCount": {
      "args": [],
      "returns": "u16",
      "setLastError": false
    },
    "GetMaximumProcessorGroupCount": {
      "args": [],
      "returns": "u16",
      "setLastError": false
    },
    "GetActiveProcessorCount": {
      "args": [
        "u16"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetMaximumProcessorCount": {
      "args": [
        "u16"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetNumaProcessorNode": {
      "args": [
        "u8",
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumaNodeNumberFromHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumaProcessorNodeEx": {
      "args": [
        "Windows.Win32.System.Kernel.PROCESSOR_NUMBER*",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumaNodeProcessorMask": {
      "args": [
        "u8",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumaAvailableMemoryNode": {
      "args": [
        "u8",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumaAvailableMemoryNodeEx": {
      "args": [
        "u16",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumaProximityNode": {
      "args": [
        "u32",
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ClearCommBreak": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ClearCommError": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.CLEAR_COMM_ERROR_FLAGS*",
        "Windows.Win32.Devices.Communication.COMSTAT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupComm": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EscapeCommFunction": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.ESCAPE_COMM_FUNCTION"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCommConfig": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.COMMCONFIG*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCommMask": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.COMM_EVENT_MASK*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCommProperties": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.COMMPROP*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCommModemStatus": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.MODEM_STATUS_FLAGS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCommState": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.DCB*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCommTimeouts": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.COMMTIMEOUTS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PurgeComm": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.PURGE_COMM_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCommBreak": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCommConfig": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.COMMCONFIG*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCommMask": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.COMM_EVENT_MASK"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCommState": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.DCB*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCommTimeouts": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.COMMTIMEOUTS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TransmitCommChar": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.CHAR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WaitCommEvent": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Devices.Communication.COMM_EVENT_MASK*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BuildCommDCBA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.Communication.DCB*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BuildCommDCBW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.Communication.DCB*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BuildCommDCBAndTimeoutsA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.Communication.DCB*",
        "Windows.Win32.Devices.Communication.COMMTIMEOUTS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BuildCommDCBAndTimeoutsW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.Communication.DCB*",
        "Windows.Win32.Devices.Communication.COMMTIMEOUTS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CommConfigDialogA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.Communication.COMMCONFIG*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CommConfigDialogW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.Communication.COMMCONFIG*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDefaultCommConfigA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.Communication.COMMCONFIG*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDefaultCommConfigW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.Communication.COMMCONFIG*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDefaultCommConfigA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.Communication.COMMCONFIG*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDefaultCommConfigW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.Communication.COMMCONFIG*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetAppContainerNamedObjectPath": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.PSID",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AllocConsole": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AllocConsoleWithOptions": {
      "args": [
        "Windows.Win32.System.Console.ALLOC_CONSOLE_OPTIONS*",
        "Windows.Win32.System.Console.ALLOC_CONSOLE_RESULT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "FreeConsole": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AttachConsole": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleCP": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleOutputCP": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleMode": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CONSOLE_MODE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleMode": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CONSOLE_MODE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumberOfConsoleInputEvents": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleInputA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.INPUT_RECORD*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleInputW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.INPUT_RECORD*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PeekConsoleInputA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.INPUT_RECORD*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PeekConsoleInputW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.INPUT_RECORD*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "u32*",
        "Windows.Win32.System.Console.CONSOLE_READCONSOLE_CONTROL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "u32*",
        "Windows.Win32.System.Console.CONSOLE_READCONSOLE_CONTROL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleCtrlHandler": {
      "args": [
        "Windows.Win32.System.Console.PHANDLER_ROUTINE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreatePseudoConsole": {
      "args": [
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.System.Console.HPCON*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ResizePseudoConsole": {
      "args": [
        "Windows.Win32.System.Console.HPCON",
        "Windows.Win32.System.Console.COORD"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ClosePseudoConsole": {
      "args": [
        "Windows.Win32.System.Console.HPCON"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ReleasePseudoConsole": {
      "args": [
        "Windows.Win32.System.Console.HPCON"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "FillConsoleOutputCharacterA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.CHAR",
        "u32",
        "Windows.Win32.System.Console.COORD",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FillConsoleOutputCharacterW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u16",
        "u32",
        "Windows.Win32.System.Console.COORD",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FillConsoleOutputAttribute": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u16",
        "u32",
        "Windows.Win32.System.Console.COORD",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GenerateConsoleCtrlEvent": {
      "args": [
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateConsoleScreenBuffer": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "SetConsoleActiveScreenBuffer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FlushConsoleInputBuffer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleCP": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleOutputCP": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleCursorInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CONSOLE_CURSOR_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleCursorInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CONSOLE_CURSOR_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleScreenBufferInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CONSOLE_SCREEN_BUFFER_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleScreenBufferInfoEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CONSOLE_SCREEN_BUFFER_INFOEX*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleScreenBufferInfoEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CONSOLE_SCREEN_BUFFER_INFOEX*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleScreenBufferSize": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.COORD"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleCursorPosition": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.COORD"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetLargestConsoleWindowSize": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.System.Console.COORD",
      "setLastError": false
    },
    "SetConsoleTextAttribute": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CONSOLE_CHARACTER_ATTRIBUTES"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleWindowInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Console.SMALL_RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleOutputCharacterA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.System.Console.COORD",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleOutputCharacterW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.System.Console.COORD",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleOutputAttribute": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u16*",
        "u32",
        "Windows.Win32.System.Console.COORD",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleOutputCharacterA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.System.Console.COORD",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleOutputCharacterW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.System.Console.COORD",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleOutputAttribute": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u16*",
        "u32",
        "Windows.Win32.System.Console.COORD",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleInputA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.INPUT_RECORD*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleInputW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.INPUT_RECORD*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ScrollConsoleScreenBufferA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.SMALL_RECT*",
        "Windows.Win32.System.Console.SMALL_RECT*",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.CHAR_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ScrollConsoleScreenBufferW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.SMALL_RECT*",
        "Windows.Win32.System.Console.SMALL_RECT*",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.CHAR_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleOutputA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CHAR_INFO*",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.SMALL_RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleOutputW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CHAR_INFO*",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.SMALL_RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleOutputA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CHAR_INFO*",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.SMALL_RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleOutputW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.CHAR_INFO*",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.SMALL_RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleTitleA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleTitleW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleOriginalTitleA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleOriginalTitleW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetConsoleTitleA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleTitleW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumberOfConsoleMouseButtons": {
      "args": [
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleFontSize": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.System.Console.COORD",
      "setLastError": false
    },
    "GetCurrentConsoleFont": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Console.CONSOLE_FONT_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentConsoleFontEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Console.CONSOLE_FONT_INFOEX*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCurrentConsoleFontEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Console.CONSOLE_FONT_INFOEX*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleSelectionInfo": {
      "args": [
        "Windows.Win32.System.Console.CONSOLE_SELECTION_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleHistoryInfo": {
      "args": [
        "Windows.Win32.System.Console.CONSOLE_HISTORY_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleHistoryInfo": {
      "args": [
        "Windows.Win32.System.Console.CONSOLE_HISTORY_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleDisplayMode": {
      "args": [
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleDisplayMode": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.System.Console.COORD*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleWindow": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "AddConsoleAliasA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddConsoleAliasW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleAliasA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleAliasW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleAliasesLengthA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleAliasesLengthW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleAliasExesLengthA": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleAliasExesLengthW": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleAliasesA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleAliasesW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleAliasExesA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleAliasExesW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ExpungeConsoleCommandHistoryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ExpungeConsoleCommandHistoryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetConsoleNumberOfCommandsA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleNumberOfCommandsW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleCommandHistoryLengthA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleCommandHistoryLengthW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleCommandHistoryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleCommandHistoryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleProcessList": {
      "args": [
        "u32*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "InvalidateConsoleDIBits": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.SMALL_RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetLastConsoleEventActive": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "VDMConsoleOperation": {
      "args": [
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleIcon": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HICON"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleFont": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleFontInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL",
        "u32",
        "Windows.Win32.System.Console.CONSOLE_FONT_INFO*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetNumberOfConsoleFonts": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "SetConsoleCursor": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.UI.WindowsAndMessaging.HCURSOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ShowConsoleCursor": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "ConsoleMenuControl": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HMENU",
      "setLastError": false
    },
    "SetConsolePalette": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Graphics.Gdi.HPALETTE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterConsoleVDM": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32*",
        "void**",
        "Windows.Win32.System.Console.COORD",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleHardwareState": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.COORD*",
        "Windows.Win32.System.Console.COORD*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleHardwareState": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.System.Console.COORD"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleKeyShortcuts": {
      "args": [
        "Windows.Win32.Foundation.BOOL",
        "u8",
        "Windows.Win32.System.Console.APPKEY*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleMenuClose": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleInputExeNameA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetConsoleInputExeNameW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetConsoleInputExeNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleInputExeNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleInputExA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.INPUT_RECORD*",
        "u32",
        "u32*",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadConsoleInputExW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.INPUT_RECORD*",
        "u32",
        "u32*",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleInputVDMA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.INPUT_RECORD*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteConsoleInputVDMW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.INPUT_RECORD*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleNlsMode": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleNlsMode": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleCharType": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Console.COORD",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleLocalEUDC": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u16",
        "Windows.Win32.System.Console.COORD",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleCursorMode": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleCursorMode": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterConsoleOS2": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetConsoleOS2OemFormat": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterConsoleIME": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnregisterConsoleIME": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OpenConsoleW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "DuplicateConsoleHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CloseConsoleHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VerifyConsoleIoHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleInputWaitHandle": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetStdHandle": {
      "args": [
        "Windows.Win32.System.Console.STD_HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "SetStdHandle": {
      "args": [
        "Windows.Win32.System.Console.STD_HANDLE",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetStdHandleEx": {
      "args": [
        "Windows.Win32.System.Console.STD_HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GlobalDeleteAtom": {
      "args": [
        "u16"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "InitAtomTable": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteAtom": {
      "args": [
        "u16"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GlobalAddAtomA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GlobalAddAtomW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GlobalAddAtomExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GlobalAddAtomExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GlobalFindAtomA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GlobalFindAtomW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GlobalGetAtomNameA": {
      "args": [
        "u16",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GlobalGetAtomNameW": {
      "args": [
        "u16",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "AddAtomA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "AddAtomW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "FindAtomA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "FindAtomW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GetAtomNameA": {
      "args": [
        "u16",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetAtomNameW": {
      "args": [
        "u16",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PssCaptureSnapshot": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.PSS_CAPTURE_FLAGS",
        "u32",
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSS*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PssFreeSnapshot": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PssQuerySnapshot": {
      "args": [
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSS",
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.PSS_QUERY_INFORMATION_CLASS",
        "void*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PssWalkSnapshot": {
      "args": [
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSS",
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.PSS_WALK_INFORMATION_CLASS",
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSSWALK",
        "void*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PssDuplicateSnapshot": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSS",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSS*",
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.PSS_DUPLICATE_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PssWalkMarkerCreate": {
      "args": [
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.PSS_ALLOCATOR*",
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSSWALK*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PssWalkMarkerFree": {
      "args": [
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSSWALK"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PssWalkMarkerGetPosition": {
      "args": [
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSSWALK",
        "usize*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PssWalkMarkerSetPosition": {
      "args": [
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSSWALK",
        "usize"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PssWalkMarkerSeekToBeginning": {
      "args": [
        "Windows.Win32.System.Diagnostics.ProcessSnapshotting.HPSSWALK"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateToolhelp32Snapshot": {
      "args": [
        "Windows.Win32.System.Diagnostics.ToolHelp.CREATE_TOOLHELP_SNAPSHOT_FLAGS",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "Heap32ListFirst": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.HEAPLIST32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Heap32ListNext": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.HEAPLIST32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Heap32First": {
      "args": [
        "Windows.Win32.System.Diagnostics.ToolHelp.HEAPENTRY32*",
        "u32",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Heap32Next": {
      "args": [
        "Windows.Win32.System.Diagnostics.ToolHelp.HEAPENTRY32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Toolhelp32ReadProcessMemory": {
      "args": [
        "u32",
        "void*",
        "void*",
        "usize",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Process32FirstW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.PROCESSENTRY32W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Process32NextW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.PROCESSENTRY32W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Process32First": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.PROCESSENTRY32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Process32Next": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.PROCESSENTRY32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Thread32First": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.THREADENTRY32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Thread32Next": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.THREADENTRY32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Module32FirstW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.MODULEENTRY32W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Module32NextW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.MODULEENTRY32W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Module32First": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.MODULEENTRY32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Module32Next": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.ToolHelp.MODULEENTRY32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetEnvironmentStringsW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCommandLineA": {
      "args": [],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "GetCommandLineW": {
      "args": [],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "GetEnvironmentStrings": {
      "args": [],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "GetEnvironmentStringsW": {
      "args": [],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "FreeEnvironmentStringsA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FreeEnvironmentStringsW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetEnvironmentVariableA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetEnvironmentVariableW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetEnvironmentVariableA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetEnvironmentVariableW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ExpandEnvironmentStringsA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ExpandEnvironmentStringsW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetCurrentDirectoryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCurrentDirectoryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentDirectoryA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetCurrentDirectoryW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "NeedCurrentDirectoryForExePathA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "NeedCurrentDirectoryForExePathW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsEnclaveTypeSupported": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateEnclave": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "usize",
        "usize",
        "u32",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "LoadEnclaveData": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "void*",
        "usize",
        "u32",
        "void*",
        "u32",
        "usize*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitializeEnclave": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WerRegisterFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.ErrorReporting.WER_REGISTER_FILE_TYPE",
        "Windows.Win32.System.ErrorReporting.WER_FILE"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerUnregisterFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerRegisterMemoryBlock": {
      "args": [
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerUnregisterMemoryBlock": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerRegisterExcludedMemoryBlock": {
      "args": [
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerUnregisterExcludedMemoryBlock": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerRegisterCustomMetadata": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerUnregisterCustomMetadata": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerRegisterAdditionalProcess": {
      "args": [
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerUnregisterAdditionalProcess": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerRegisterAppLocalDump": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerUnregisterAppLocalDump": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerSetFlags": {
      "args": [
        "Windows.Win32.System.ErrorReporting.WER_FAULT_REPORTING"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerGetFlags": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.ErrorReporting.WER_FAULT_REPORTING*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerRegisterRuntimeExceptionModule": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WerUnregisterRuntimeExceptionModule": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DisableThreadLibraryCalls": {
      "args": [
        "Windows.Win32.Foundation.HMODULE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindResourceExW": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.HRSRC",
      "setLastError": false
    },
    "FreeLibraryAndExitThread": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "FreeResource": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetModuleFileNameA": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetModuleFileNameW": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetModuleHandleA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HMODULE",
      "setLastError": false
    },
    "GetModuleHandleW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HMODULE",
      "setLastError": false
    },
    "GetModuleHandleExA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HMODULE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetModuleHandleExW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HMODULE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcAddress": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.FARPROC",
      "setLastError": false
    },
    "LoadLibraryExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.LibraryLoader.LOAD_LIBRARY_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HMODULE",
      "setLastError": false
    },
    "LoadLibraryExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.LibraryLoader.LOAD_LIBRARY_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HMODULE",
      "setLastError": false
    },
    "LoadResource": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.HRSRC"
      ],
      "returns": "Windows.Win32.Foundation.HGLOBAL",
      "setLastError": false
    },
    "LockResource": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SizeofResource": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.HRSRC"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "AddDllDirectory": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "RemoveDllDirectory": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDefaultDllDirectories": {
      "args": [
        "Windows.Win32.System.LibraryLoader.LOAD_LIBRARY_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumResourceLanguagesExA": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.LibraryLoader.ENUMRESLANGPROCA",
        "isize",
        "u32",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumResourceLanguagesExW": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.LibraryLoader.ENUMRESLANGPROCW",
        "isize",
        "u32",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumResourceNamesExA": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.LibraryLoader.ENUMRESNAMEPROCA",
        "isize",
        "u32",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumResourceNamesExW": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.LibraryLoader.ENUMRESNAMEPROCW",
        "isize",
        "u32",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumResourceTypesExA": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.System.LibraryLoader.ENUMRESTYPEPROCA",
        "isize",
        "u32",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumResourceTypesExW": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.System.LibraryLoader.ENUMRESTYPEPROCW",
        "isize",
        "u32",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindResourceW": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRSRC",
      "setLastError": false
    },
    "LoadLibraryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HMODULE",
      "setLastError": false
    },
    "LoadLibraryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HMODULE",
      "setLastError": false
    },
    "EnumResourceNamesW": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.LibraryLoader.ENUMRESNAMEPROCW",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumResourceNamesA": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.LibraryLoader.ENUMRESNAMEPROCA",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LoadPackagedLibrary": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HMODULE",
      "setLastError": false
    },
    "LoadModule": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FindResourceA": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRSRC",
      "setLastError": false
    },
    "FindResourceExA": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.HRSRC",
      "setLastError": false
    },
    "EnumResourceTypesA": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.System.LibraryLoader.ENUMRESTYPEPROCA",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumResourceTypesW": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.System.LibraryLoader.ENUMRESTYPEPROCW",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumResourceLanguagesA": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.LibraryLoader.ENUMRESLANGPROCA",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumResourceLanguagesW": {
      "args": [
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.LibraryLoader.ENUMRESLANGPROCW",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BeginUpdateResourceA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "BeginUpdateResourceW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "UpdateResourceA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u16",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UpdateResourceW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u16",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EndUpdateResourceA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EndUpdateResourceW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDllDirectoryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDllDirectoryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDllDirectoryA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetDllDirectoryW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HeapCreate": {
      "args": [
        "Windows.Win32.System.Memory.HEAP_FLAGS",
        "usize",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "HeapDestroy": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "HeapAlloc": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.HEAP_FLAGS",
        "usize"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "HeapReAlloc": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.HEAP_FLAGS",
        "void*",
        "usize"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "HeapFree": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.HEAP_FLAGS",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "HeapSize": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.HEAP_FLAGS",
        "void*"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "GetProcessHeap": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "HeapCompact": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.HEAP_FLAGS"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "HeapSetInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.HEAP_INFORMATION_CLASS",
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "HeapValidate": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.HEAP_FLAGS",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "HeapSummary": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.System.Memory.HEAP_SUMMARY*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessHeaps": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HeapLock": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "HeapUnlock": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "HeapWalk": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.PROCESS_HEAP_ENTRY*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "HeapQueryInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.HEAP_INFORMATION_CLASS",
        "void*",
        "usize",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VirtualAlloc": {
      "args": [
        "void*",
        "usize",
        "Windows.Win32.System.Memory.VIRTUAL_ALLOCATION_TYPE",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "VirtualProtect": {
      "args": [
        "void*",
        "usize",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VirtualFree": {
      "args": [
        "void*",
        "usize",
        "Windows.Win32.System.Memory.VIRTUAL_FREE_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VirtualQuery": {
      "args": [
        "void*",
        "Windows.Win32.System.Memory.MEMORY_BASIC_INFORMATION*",
        "usize"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "VirtualAllocEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "usize",
        "Windows.Win32.System.Memory.VIRTUAL_ALLOCATION_TYPE",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "VirtualProtectEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "usize",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VirtualQueryEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "Windows.Win32.System.Memory.MEMORY_BASIC_INFORMATION*",
        "usize"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "CreateFileMappingW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenFileMappingW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "MapViewOfFile": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.FILE_MAP",
        "u32",
        "u32",
        "usize"
      ],
      "returns": "Windows.Win32.System.Memory.MEMORY_MAPPED_VIEW_ADDRESS",
      "setLastError": false
    },
    "MapViewOfFileEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.FILE_MAP",
        "u32",
        "u32",
        "usize",
        "void*"
      ],
      "returns": "Windows.Win32.System.Memory.MEMORY_MAPPED_VIEW_ADDRESS",
      "setLastError": false
    },
    "VirtualFreeEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "usize",
        "Windows.Win32.System.Memory.VIRTUAL_FREE_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FlushViewOfFile": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnmapViewOfFile": {
      "args": [
        "Windows.Win32.System.Memory.MEMORY_MAPPED_VIEW_ADDRESS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetLargePageMinimum": {
      "args": [],
      "returns": "usize",
      "setLastError": false
    },
    "GetProcessWorkingSetSizeEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize*",
        "usize*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessWorkingSetSizeEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize",
        "usize",
        "Windows.Win32.System.Memory.SETPROCESSWORKINGSETSIZEEX_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VirtualLock": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VirtualUnlock": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWriteWatch": {
      "args": [
        "u32",
        "void*",
        "usize",
        "void**",
        "usize*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ResetWriteWatch": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateMemoryResourceNotification": {
      "args": [
        "Windows.Win32.System.Memory.MEMORY_RESOURCE_NOTIFICATION_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "QueryMemoryResourceNotification": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSystemFileCacheSize": {
      "args": [
        "usize*",
        "usize*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetSystemFileCacheSize": {
      "args": [
        "usize",
        "usize",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateFileMappingNumaW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "PrefetchVirtualMemory": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize",
        "Windows.Win32.System.Memory.WIN32_MEMORY_RANGE_ENTRY*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateFileMappingFromApp": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS",
        "u64",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "MapViewOfFileFromApp": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.FILE_MAP",
        "u64",
        "usize"
      ],
      "returns": "Windows.Win32.System.Memory.MEMORY_MAPPED_VIEW_ADDRESS",
      "setLastError": false
    },
    "UnmapViewOfFileEx": {
      "args": [
        "Windows.Win32.System.Memory.MEMORY_MAPPED_VIEW_ADDRESS",
        "Windows.Win32.System.Memory.UNMAP_VIEW_OF_FILE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AllocateUserPhysicalPages": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize*",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FreeUserPhysicalPages": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize*",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MapUserPhysicalPages": {
      "args": [
        "void*",
        "usize",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AllocateUserPhysicalPagesNuma": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "usize*",
        "usize*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "VirtualAllocExNuma": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "usize",
        "Windows.Win32.System.Memory.VIRTUAL_ALLOCATION_TYPE",
        "u32",
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "GetMemoryErrorHandlingCapabilities": {
      "args": [
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterBadMemoryNotification": {
      "args": [
        "Windows.Win32.System.Memory.PBAD_MEMORY_CALLBACK_ROUTINE"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "UnregisterBadMemoryNotification": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OfferVirtualMemory": {
      "args": [
        "void*",
        "usize",
        "Windows.Win32.System.Memory.OFFER_PRIORITY"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ReclaimVirtualMemory": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DiscardVirtualMemory": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlCompareMemory": {
      "args": [
        "void*",
        "void*",
        "usize"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "GlobalAlloc": {
      "args": [
        "Windows.Win32.System.Memory.GLOBAL_ALLOC_FLAGS",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.HGLOBAL",
      "setLastError": false
    },
    "GlobalReAlloc": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL",
        "usize",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HGLOBAL",
      "setLastError": false
    },
    "GlobalSize": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "GlobalUnlock": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GlobalLock": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "GlobalFlags": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GlobalHandle": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HGLOBAL",
      "setLastError": false
    },
    "LocalAlloc": {
      "args": [
        "Windows.Win32.System.Memory.LOCAL_ALLOC_FLAGS",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.HLOCAL",
      "setLastError": false
    },
    "LocalReAlloc": {
      "args": [
        "Windows.Win32.Foundation.HLOCAL",
        "usize",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HLOCAL",
      "setLastError": false
    },
    "LocalLock": {
      "args": [
        "Windows.Win32.Foundation.HLOCAL"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "LocalHandle": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HLOCAL",
      "setLastError": false
    },
    "LocalUnlock": {
      "args": [
        "Windows.Win32.Foundation.HLOCAL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LocalSize": {
      "args": [
        "Windows.Win32.Foundation.HLOCAL"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "LocalFlags": {
      "args": [
        "Windows.Win32.Foundation.HLOCAL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateFileMappingA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateFileMappingNumaA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Memory.PAGE_PROTECTION_FLAGS",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenFileMappingA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "MapViewOfFileExNuma": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Memory.FILE_MAP",
        "u32",
        "u32",
        "usize",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.System.Memory.MEMORY_MAPPED_VIEW_ADDRESS",
      "setLastError": false
    },
    "IsBadReadPtr": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsBadWritePtr": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsBadCodePtr": {
      "args": [
        "Windows.Win32.Foundation.FARPROC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsBadStringPtrA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsBadStringPtrW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MapUserPhysicalPagesScatter": {
      "args": [
        "void**",
        "usize",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddSecureMemoryCacheCallback": {
      "args": [
        "Windows.Win32.System.Memory.PSECURE_MEMORY_CACHE_CALLBACK"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RemoveSecureMemoryCacheCallback": {
      "args": [
        "Windows.Win32.System.Memory.PSECURE_MEMORY_CACHE_CALLBACK"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryPerformanceCounter": {
      "args": [
        "i64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryPerformanceFrequency": {
      "args": [
        "i64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreatePipe": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConnectNamedPipe": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DisconnectNamedPipe": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetNamedPipeHandleState": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Pipes.NAMED_PIPE_MODE*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PeekNamedPipe": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "u32*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TransactNamedPipe": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "void*",
        "u32",
        "u32*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateNamedPipeW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES",
        "Windows.Win32.System.Pipes.NAMED_PIPE_MODE",
        "u32",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "WaitNamedPipeW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNamedPipeClientComputerNameW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNamedPipeInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Pipes.NAMED_PIPE_MODE*",
        "u32*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNamedPipeHandleStateW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Pipes.NAMED_PIPE_MODE*",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CallNamedPipeW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "u32",
        "void*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateNamedPipeA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES",
        "Windows.Win32.System.Pipes.NAMED_PIPE_MODE",
        "u32",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetNamedPipeHandleStateA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Pipes.NAMED_PIPE_MODE*",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CallNamedPipeA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "u32",
        "void*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WaitNamedPipeA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNamedPipeClientComputerNameA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNamedPipeClientProcessId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNamedPipeClientSessionId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNamedPipeServerProcessId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNamedPipeServerSessionId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RequestWakeupLatency": {
      "args": [
        "Windows.Win32.System.Power.LATENCY_TIME"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsSystemResumeAutomatic": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadExecutionState": {
      "args": [
        "Windows.Win32.System.Power.EXECUTION_STATE"
      ],
      "returns": "Windows.Win32.System.Power.EXECUTION_STATE",
      "setLastError": false
    },
    "PowerCreateRequest": {
      "args": [
        "Windows.Win32.System.Threading.REASON_CONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "PowerSetRequest": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Power.POWER_REQUEST_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PowerClearRequest": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Power.POWER_REQUEST_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDevicePowerState": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetSystemPowerState": {
      "args": [
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSystemPowerStatus": {
      "args": [
        "Windows.Win32.System.Power.SYSTEM_POWER_STATUS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32EnumProcesses": {
      "args": [
        "u32*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32EnumProcessModules": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HMODULE*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32EnumProcessModulesEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HMODULE*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32GetModuleBaseNameA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32GetModuleBaseNameW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32GetModuleFileNameExA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32GetModuleFileNameExW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32GetModuleInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.System.ProcessStatus.MODULEINFO*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32EmptyWorkingSet": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32InitializeProcessForWsWatch": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32GetWsChanges": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.ProcessStatus.PSAPI_WS_WATCH_INFORMATION*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32GetWsChangesEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.ProcessStatus.PSAPI_WS_WATCH_INFORMATION_EX*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32GetMappedFileNameW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32GetMappedFileNameA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32EnumDeviceDrivers": {
      "args": [
        "void**",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32GetDeviceDriverBaseNameA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32GetDeviceDriverBaseNameW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32GetDeviceDriverFileNameA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32GetDeviceDriverFileNameW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32QueryWorkingSet": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32QueryWorkingSetEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32GetProcessMemoryInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.ProcessStatus.PROCESS_MEMORY_COUNTERS*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32GetPerformanceInfo": {
      "args": [
        "Windows.Win32.System.ProcessStatus.PERFORMANCE_INFORMATION*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32EnumPageFilesW": {
      "args": [
        "Windows.Win32.System.ProcessStatus.PENUM_PAGE_FILE_CALLBACKW",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32EnumPageFilesA": {
      "args": [
        "Windows.Win32.System.ProcessStatus.PENUM_PAGE_FILE_CALLBACKA",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "K32GetProcessImageFileNameA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "K32GetProcessImageFileNameW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SystemTimeToTzSpecificLocalTime": {
      "args": [
        "Windows.Win32.System.Time.TIME_ZONE_INFORMATION*",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TzSpecificLocalTimeToSystemTime": {
      "args": [
        "Windows.Win32.System.Time.TIME_ZONE_INFORMATION*",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FileTimeToSystemTime": {
      "args": [
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SystemTimeToFileTime": {
      "args": [
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTimeZoneInformation": {
      "args": [
        "Windows.Win32.System.Time.TIME_ZONE_INFORMATION*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetTimeZoneInformation": {
      "args": [
        "Windows.Win32.System.Time.TIME_ZONE_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDynamicTimeZoneInformation": {
      "args": [
        "Windows.Win32.System.Time.DYNAMIC_TIME_ZONE_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDynamicTimeZoneInformation": {
      "args": [
        "Windows.Win32.System.Time.DYNAMIC_TIME_ZONE_INFORMATION*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTimeZoneInformationForYear": {
      "args": [
        "u16",
        "Windows.Win32.System.Time.DYNAMIC_TIME_ZONE_INFORMATION*",
        "Windows.Win32.System.Time.TIME_ZONE_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SystemTimeToTzSpecificLocalTimeEx": {
      "args": [
        "Windows.Win32.System.Time.DYNAMIC_TIME_ZONE_INFORMATION*",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TzSpecificLocalTimeToSystemTimeEx": {
      "args": [
        "Windows.Win32.System.Time.DYNAMIC_TIME_ZONE_INFORMATION*",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LocalFileTimeToLocalSystemTime": {
      "args": [
        "Windows.Win32.System.Time.TIME_ZONE_INFORMATION*",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.SYSTEMTIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LocalSystemTimeToLocalFileTime": {
      "args": [
        "Windows.Win32.System.Time.TIME_ZONE_INFORMATION*",
        "Windows.Win32.Foundation.SYSTEMTIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "uaw_lstrcmpW": {
      "args": [
        "u16*",
        "u16*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "uaw_lstrcmpiW": {
      "args": [
        "u16*",
        "u16*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "uaw_lstrlenW": {
      "args": [
        "u16*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "uaw_wcschr": {
      "args": [
        "u16*",
        "u16"
      ],
      "returns": "u16*",
      "setLastError": false
    },
    "uaw_wcscpy": {
      "args": [
        "u16*",
        "u16*"
      ],
      "returns": "u16*",
      "setLastError": false
    },
    "uaw_wcsicmp": {
      "args": [
        "u16*",
        "u16*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "uaw_wcslen": {
      "args": [
        "u16*"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "uaw_wcsrchr": {
      "args": [
        "u16*",
        "u16"
      ],
      "returns": "u16*",
      "setLastError": false
    },
    "QueryThreadCycleTime": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryProcessCycleTime": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryIdleProcessorCycleTime": {
      "args": [
        "u32*",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryIdleProcessorCycleTimeEx": {
      "args": [
        "u16",
        "u32*",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryUnbiasedInterruptTime": {
      "args": [
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GlobalCompact": {
      "args": [
        "u32"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "GlobalFix": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GlobalUnfix": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GlobalWire": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "GlobalUnWire": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LocalShrink": {
      "args": [
        "Windows.Win32.Foundation.HLOCAL",
        "u32"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "LocalCompact": {
      "args": [
        "u32"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "SetEnvironmentStringsA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetHandleCount": {
      "args": [
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RequestDeviceWakeup": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CancelDeviceWakeupRequest": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetMessageWaitingIndicator": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MulDiv": {
      "args": [
        "i32",
        "i32",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetSystemRegistryQuota": {
      "args": [
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FileTimeToDosDateTime": {
      "args": [
        "Windows.Win32.Foundation.FILETIME*",
        "u16*",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DosDateTimeToFileTime": {
      "args": [
        "u16",
        "u16",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "_lopen": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "_lcreat": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "_lread": {
      "args": [
        "i32",
        "void*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "_lwrite": {
      "args": [
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "_hread": {
      "args": [
        "i32",
        "void*",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "_hwrite": {
      "args": [
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "_lclose": {
      "args": [
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "_llseek": {
      "args": [
        "i32",
        "i32",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "OpenMutexA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenSemaphoreA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetFirmwareEnvironmentVariableA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFirmwareEnvironmentVariableW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFirmwareEnvironmentVariableExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFirmwareEnvironmentVariableExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetFirmwareEnvironmentVariableA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFirmwareEnvironmentVariableW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFirmwareEnvironmentVariableExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFirmwareEnvironmentVariableExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsNativeVhdBoot": {
      "args": [
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProfileIntA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetProfileIntW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetProfileStringA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetProfileStringW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "WriteProfileStringA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteProfileStringW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProfileSectionA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetProfileSectionW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "WriteProfileSectionA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteProfileSectionW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPrivateProfileIntA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPrivateProfileIntW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetPrivateProfileStringA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPrivateProfileStringW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "WritePrivateProfileStringA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WritePrivateProfileStringW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPrivateProfileSectionA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPrivateProfileSectionW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "WritePrivateProfileSectionA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WritePrivateProfileSectionW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPrivateProfileSectionNamesA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPrivateProfileSectionNamesW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPrivateProfileStructA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPrivateProfileStructW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WritePrivateProfileStructA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WritePrivateProfileStructW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsBadHugeReadPtr": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsBadHugeWritePtr": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetComputerNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetComputerNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DnsHostnameToComputerNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DnsHostnameToComputerNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReplacePartitionUnit": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadEnabledXStateFeatures": {
      "args": [],
      "returns": "u64",
      "setLastError": false
    },
    "EnableProcessOptionalXStateFeatures": {
      "args": [
        "u64"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InstallELAMCertificateInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CeipIsOptedIn": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateIoCompletionPort": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "usize",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetQueuedCompletionStatus": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "usize*",
        "Windows.Win32.System.IO.OVERLAPPED**",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetQueuedCompletionStatusEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.IO.OVERLAPPED_ENTRY*",
        "u32",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PostQueuedCompletionStatus": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "usize",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeviceIoControl": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "void*",
        "u32",
        "void*",
        "u32",
        "u32*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetOverlappedResult": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.IO.OVERLAPPED*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CancelIoEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CancelIo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetOverlappedResultEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.IO.OVERLAPPED*",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CancelSynchronousIo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BindIoCompletionCallback": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.IO.LPOVERLAPPED_COMPLETION_ROUTINE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsProcessInJob": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateJobObjectW": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "FreeMemoryJobObject": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "OpenJobObjectW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "AssignProcessToJobObject": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TerminateJobObject": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetInformationJobObject": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.JobObjects.JOBOBJECTINFOCLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetIoRateControlInformationJobObject": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.JobObjects.JOBOBJECT_IO_RATE_CONTROL_INFORMATION*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "QueryInformationJobObject": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.JobObjects.JOBOBJECTINFOCLASS",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryIoRateControlInformationJobObject": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.JobObjects.JOBOBJECT_IO_RATE_CONTROL_INFORMATION**",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateJobObjectA": {
      "args": [
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenJobObjectA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateJobSet": {
      "args": [
        "u32",
        "Windows.Win32.System.JobObjects.JOB_SET_ARRAY*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OOBEComplete": {
      "args": [
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterWaitUntilOOBECompleted": {
      "args": [
        "Windows.Win32.System.SetupAndMigration.OOBE_COMPLETED_CALLBACK",
        "void*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnregisterWaitUntilOOBECompleted": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateMailslotA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CreateMailslotW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetMailslotInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetMailslotInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterApplicationRecoveryCallback": {
      "args": [
        "Windows.Win32.System.WindowsProgramming.APPLICATION_RECOVERY_CALLBACK",
        "void*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "UnregisterApplicationRecoveryCallback": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "RegisterApplicationRestart": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Recovery.REGISTER_APPLICATION_RESTART_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "UnregisterApplicationRestart": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetApplicationRecoveryCallback": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.WindowsProgramming.APPLICATION_RECOVERY_CALLBACK*",
        "void**",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetApplicationRestartSettings": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ApplicationRecoveryInProgress": {
      "args": [
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ApplicationRecoveryFinished": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EnableThreadProfiling": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u64",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DisableThreadProfiling": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "QueryThreadProfiling": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOLEAN*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ReadThreadProfilingData": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.System.Performance.HardwareCounterProfiling.PERFORMANCE_DATA*"
      ],
      "returns": "u32",
      "setLastError": false
    }
  },
  "kernelbase.dll": {
    "TryCreatePackageDependency": {
      "args": [
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.Packaging.Appx.PACKAGE_VERSION",
        "Windows.Win32.Storage.Packaging.Appx.PackageDependencyProcessorArchitectures",
        "Windows.Win32.Storage.Packaging.Appx.PackageDependencyLifetimeKind",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.Packaging.Appx.CreatePackageDependencyOptions",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DeletePackageDependency": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "AddPackageDependency": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Storage.Packaging.Appx.AddPackageDependencyOptions",
        "Windows.Win32.Storage.Packaging.Appx.PACKAGEDEPENDENCY_CONTEXT*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "RemovePackageDependency": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx.PACKAGEDEPENDENCY_CONTEXT"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetResolvedPackageFullNameForPackageDependency": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetIdForPackageDependencyContext": {
      "args": [
        "Windows.Win32.Storage.Packaging.Appx.PACKAGEDEPENDENCY_CONTEXT",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    }
  }
};
export declare function open(): { "kernel32.dll": kernel32Library; "kernelbase.dll": kernelbaseLibrary };
