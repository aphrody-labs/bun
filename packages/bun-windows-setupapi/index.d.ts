export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export interface setupapiSymbols {
    "SetupGetInfInformationA": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupGetInfInformationW": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupQueryInfFileInformationA": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupQueryInfFileInformationW": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupQueryInfOriginalFileInformationA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "SetupQueryInfOriginalFileInformationW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "SetupQueryInfVersionInformationA": (...args: [Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupQueryInfVersionInformationW": (...args: [Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetInfDriverStoreLocationA": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetInfDriverStoreLocationW": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetInfPublishedNameA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupGetInfPublishedNameW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupGetInfFileListA": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupGetInfFileListW": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupOpenInfFileW": (...args: [Pointer, Pointer, number, Pointer]) => Pointer;
    "SetupOpenInfFileA": (...args: [Pointer, Pointer, number, Pointer]) => Pointer;
    "SetupOpenMasterInf": (...args: []) => Pointer;
    "SetupOpenAppendInfFileW": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupOpenAppendInfFileA": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupCloseInfFile": (...args: [Pointer]) => void;
    "SetupFindFirstLineA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupFindFirstLineW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupFindNextLine": (...args: [Pointer, Pointer]) => number;
    "SetupFindNextMatchLineA": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupFindNextMatchLineW": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupGetLineByIndexA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupGetLineByIndexW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupGetLineCountA": (...args: [Pointer, Pointer]) => number;
    "SetupGetLineCountW": (...args: [Pointer, Pointer]) => number;
    "SetupGetLineTextA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetLineTextW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetFieldCount": (...args: [Pointer]) => number;
    "SetupGetStringFieldA": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupGetStringFieldW": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupGetIntField": (...args: [Pointer, number, Pointer]) => number;
    "SetupGetMultiSzFieldA": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupGetMultiSzFieldW": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupGetBinaryField": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupGetFileCompressionInfoA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupGetFileCompressionInfoW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupGetFileCompressionInfoExA": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupGetFileCompressionInfoExW": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDecompressOrCopyFileA": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupDecompressOrCopyFileW": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupGetSourceFileLocationA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetSourceFileLocationW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetSourceFileSizeA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupGetSourceFileSizeW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupGetTargetPathA": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetTargetPathW": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupSetSourceListA": (...args: [number, Pointer, number]) => number;
    "SetupSetSourceListW": (...args: [number, Pointer, number]) => number;
    "SetupCancelTemporarySourceList": (...args: []) => number;
    "SetupAddToSourceListA": (...args: [number, Pointer]) => number;
    "SetupAddToSourceListW": (...args: [number, Pointer]) => number;
    "SetupRemoveFromSourceListA": (...args: [number, Pointer]) => number;
    "SetupRemoveFromSourceListW": (...args: [number, Pointer]) => number;
    "SetupQuerySourceListA": (...args: [number, Pointer, Pointer]) => number;
    "SetupQuerySourceListW": (...args: [number, Pointer, Pointer]) => number;
    "SetupFreeSourceListA": (...args: [Pointer, number]) => number;
    "SetupFreeSourceListW": (...args: [Pointer, number]) => number;
    "SetupPromptForDiskA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "SetupPromptForDiskW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "SetupCopyErrorA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, Pointer, number, Pointer]) => number;
    "SetupCopyErrorW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, Pointer, number, Pointer]) => number;
    "SetupRenameErrorA": (...args: [Pointer, Pointer, Pointer, Pointer, number, number]) => number;
    "SetupRenameErrorW": (...args: [Pointer, Pointer, Pointer, Pointer, number, number]) => number;
    "SetupDeleteErrorA": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "SetupDeleteErrorW": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "SetupBackupErrorA": (...args: [Pointer, Pointer, Pointer, Pointer, number, number]) => number;
    "SetupBackupErrorW": (...args: [Pointer, Pointer, Pointer, Pointer, number, number]) => number;
    "SetupSetDirectoryIdA": (...args: [Pointer, number, Pointer]) => number;
    "SetupSetDirectoryIdW": (...args: [Pointer, number, Pointer]) => number;
    "SetupSetDirectoryIdExA": (...args: [Pointer, number, Pointer, number, number, Pointer]) => number;
    "SetupSetDirectoryIdExW": (...args: [Pointer, number, Pointer, number, number, Pointer]) => number;
    "SetupGetSourceInfoA": (...args: [Pointer, number, number, Pointer, number, Pointer]) => number;
    "SetupGetSourceInfoW": (...args: [Pointer, number, number, Pointer, number, Pointer]) => number;
    "SetupInstallFileA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupInstallFileW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupInstallFileExA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupInstallFileExW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupOpenFileQueue": (...args: []) => Pointer;
    "SetupCloseFileQueue": (...args: [Pointer]) => number;
    "SetupSetFileQueueAlternatePlatformA": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupSetFileQueueAlternatePlatformW": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupSetPlatformPathOverrideA": (...args: [Pointer]) => number;
    "SetupSetPlatformPathOverrideW": (...args: [Pointer]) => number;
    "SetupQueueCopyA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupQueueCopyW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupQueueCopyIndirectA": (...args: [Pointer]) => number;
    "SetupQueueCopyIndirectW": (...args: [Pointer]) => number;
    "SetupQueueDefaultCopyA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupQueueDefaultCopyW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupQueueCopySectionA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupQueueCopySectionW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupQueueDeleteA": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupQueueDeleteW": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupQueueDeleteSectionA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupQueueDeleteSectionW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupQueueRenameA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupQueueRenameW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupQueueRenameSectionA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupQueueRenameSectionW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupCommitFileQueueA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupCommitFileQueueW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupScanFileQueueA": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupScanFileQueueW": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupGetFileQueueCount": (...args: [Pointer, number, Pointer]) => number;
    "SetupGetFileQueueFlags": (...args: [Pointer, Pointer]) => number;
    "SetupSetFileQueueFlags": (...args: [Pointer, number, number]) => number;
    "SetupCopyOEMInfA": (...args: [Pointer, Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "SetupCopyOEMInfW": (...args: [Pointer, Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "SetupUninstallOEMInfA": (...args: [Pointer, number, Pointer]) => number;
    "SetupUninstallOEMInfW": (...args: [Pointer, number, Pointer]) => number;
    "SetupUninstallNewlyCopiedInfs": (...args: [Pointer, number, Pointer]) => number;
    "SetupCreateDiskSpaceListA": (...args: [Pointer, number, number]) => Pointer;
    "SetupCreateDiskSpaceListW": (...args: [Pointer, number, number]) => Pointer;
    "SetupDuplicateDiskSpaceListA": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "SetupDuplicateDiskSpaceListW": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "SetupDestroyDiskSpaceList": (...args: [Pointer]) => number;
    "SetupQueryDrivesInDiskSpaceListA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupQueryDrivesInDiskSpaceListW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupQuerySpaceRequiredOnDriveA": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupQuerySpaceRequiredOnDriveW": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupAdjustDiskSpaceListA": (...args: [Pointer, Pointer, bigint, Pointer, number]) => number;
    "SetupAdjustDiskSpaceListW": (...args: [Pointer, Pointer, bigint, Pointer, number]) => number;
    "SetupAddToDiskSpaceListA": (...args: [Pointer, Pointer, bigint, number, Pointer, number]) => number;
    "SetupAddToDiskSpaceListW": (...args: [Pointer, Pointer, bigint, number, Pointer, number]) => number;
    "SetupAddSectionToDiskSpaceListA": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupAddSectionToDiskSpaceListW": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupAddInstallSectionToDiskSpaceListA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupAddInstallSectionToDiskSpaceListW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupRemoveFromDiskSpaceListA": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "SetupRemoveFromDiskSpaceListW": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "SetupRemoveSectionFromDiskSpaceListA": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupRemoveSectionFromDiskSpaceListW": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupRemoveInstallSectionFromDiskSpaceListA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupRemoveInstallSectionFromDiskSpaceListW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupIterateCabinetA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "SetupIterateCabinetW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "SetupPromptReboot": (...args: [Pointer, Pointer, number]) => number;
    "SetupInitDefaultQueueCallback": (...args: [Pointer]) => Pointer;
    "SetupInitDefaultQueueCallbackEx": (...args: [Pointer, Pointer, number, number, Pointer]) => Pointer;
    "SetupTermDefaultQueueCallback": (...args: [Pointer]) => void;
    "SetupDefaultQueueCallbackA": (...args: [Pointer, number, number, number]) => number;
    "SetupDefaultQueueCallbackW": (...args: [Pointer, number, number, number]) => number;
    "SetupInstallFromInfSectionA": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupInstallFromInfSectionW": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupInstallFilesFromInfSectionA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupInstallFilesFromInfSectionW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupInstallServicesFromInfSectionA": (...args: [Pointer, Pointer, number]) => number;
    "SetupInstallServicesFromInfSectionW": (...args: [Pointer, Pointer, number]) => number;
    "SetupInstallServicesFromInfSectionExA": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "SetupInstallServicesFromInfSectionExW": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "InstallHinfSectionA": (...args: [Pointer, Pointer, Pointer, number]) => void;
    "InstallHinfSectionW": (...args: [Pointer, Pointer, Pointer, number]) => void;
    "SetupInitializeFileLogA": (...args: [Pointer, number]) => Pointer;
    "SetupInitializeFileLogW": (...args: [Pointer, number]) => Pointer;
    "SetupTerminateFileLog": (...args: [Pointer]) => number;
    "SetupLogFileA": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer, number]) => number;
    "SetupLogFileW": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer, number]) => number;
    "SetupRemoveFileLogEntryA": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupRemoveFileLogEntryW": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupQueryFileLogA": (...args: [Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "SetupQueryFileLogW": (...args: [Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "SetupOpenLog": (...args: [number]) => number;
    "SetupLogErrorA": (...args: [Pointer, number]) => number;
    "SetupLogErrorW": (...args: [Pointer, number]) => number;
    "SetupCloseLog": (...args: []) => void;
    "SetupGetThreadLogToken": (...args: []) => bigint;
    "SetupSetThreadLogToken": (...args: [bigint]) => void;
    "SetupWriteTextLog": (...args: [bigint, number, number, Pointer]) => void;
    "SetupWriteTextLogError": (...args: [bigint, number, number, number, Pointer]) => void;
    "SetupWriteTextLogInfLine": (...args: [bigint, number, Pointer, Pointer]) => void;
    "SetupGetBackupInformationA": (...args: [Pointer, Pointer]) => number;
    "SetupGetBackupInformationW": (...args: [Pointer, Pointer]) => number;
    "SetupPrepareQueueForRestoreA": (...args: [Pointer, Pointer, number]) => number;
    "SetupPrepareQueueForRestoreW": (...args: [Pointer, Pointer, number]) => number;
    "SetupSetNonInteractiveMode": (...args: [number]) => number;
    "SetupGetNonInteractiveMode": (...args: []) => number;
    "SetupDiCreateDeviceInfoList": (...args: [Pointer, Pointer]) => number;
    "SetupDiCreateDeviceInfoListExA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDiCreateDeviceInfoListExW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetDeviceInfoListClass": (...args: [number, Pointer]) => number;
    "SetupDiGetDeviceInfoListDetailA": (...args: [number, Pointer]) => number;
    "SetupDiGetDeviceInfoListDetailW": (...args: [number, Pointer]) => number;
    "SetupDiCreateDeviceInfoA": (...args: [number, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiCreateDeviceInfoW": (...args: [number, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiOpenDeviceInfoA": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiOpenDeviceInfoW": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetDeviceInstanceIdA": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetDeviceInstanceIdW": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiDeleteDeviceInfo": (...args: [number, Pointer]) => number;
    "SetupDiEnumDeviceInfo": (...args: [number, number, Pointer]) => number;
    "SetupDiDestroyDeviceInfoList": (...args: [number]) => number;
    "SetupDiEnumDeviceInterfaces": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiCreateDeviceInterfaceA": (...args: [number, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiCreateDeviceInterfaceW": (...args: [number, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiOpenDeviceInterfaceA": (...args: [number, Pointer, number, Pointer]) => number;
    "SetupDiOpenDeviceInterfaceW": (...args: [number, Pointer, number, Pointer]) => number;
    "SetupDiGetDeviceInterfaceAlias": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SetupDiDeleteDeviceInterfaceData": (...args: [number, Pointer]) => number;
    "SetupDiRemoveDeviceInterface": (...args: [number, Pointer]) => number;
    "SetupDiGetDeviceInterfaceDetailA": (...args: [number, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetDeviceInterfaceDetailW": (...args: [number, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiInstallDeviceInterfaces": (...args: [number, Pointer]) => number;
    "SetupDiSetDeviceInterfaceDefault": (...args: [number, Pointer, number, Pointer]) => number;
    "SetupDiRegisterDeviceInfo": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiBuildDriverInfoList": (...args: [number, Pointer, number]) => number;
    "SetupDiCancelDriverInfoSearch": (...args: [number]) => number;
    "SetupDiEnumDriverInfoA": (...args: [number, Pointer, number, number, Pointer]) => number;
    "SetupDiEnumDriverInfoW": (...args: [number, Pointer, number, number, Pointer]) => number;
    "SetupDiGetSelectedDriverA": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiGetSelectedDriverW": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiSetSelectedDriverA": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiSetSelectedDriverW": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiGetDriverInfoDetailA": (...args: [number, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetDriverInfoDetailW": (...args: [number, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiDestroyDriverInfoList": (...args: [number, Pointer, number]) => number;
    "SetupDiGetClassDevsA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "SetupDiGetClassDevsW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "SetupDiGetClassDevsExA": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, Pointer]) => number;
    "SetupDiGetClassDevsExW": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, Pointer]) => number;
    "SetupDiGetINFClassA": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetINFClassW": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiBuildClassInfoList": (...args: [number, Pointer, number, Pointer]) => number;
    "SetupDiBuildClassInfoListExA": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiBuildClassInfoListExW": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetClassDescriptionA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetClassDescriptionW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetClassDescriptionExA": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetClassDescriptionExW": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiCallClassInstaller": (...args: [number, number, Pointer]) => number;
    "SetupDiSelectDevice": (...args: [number, Pointer]) => number;
    "SetupDiSelectBestCompatDrv": (...args: [number, Pointer]) => number;
    "SetupDiInstallDevice": (...args: [number, Pointer]) => number;
    "SetupDiInstallDriverFiles": (...args: [number, Pointer]) => number;
    "SetupDiRegisterCoDeviceInstallers": (...args: [number, Pointer]) => number;
    "SetupDiRemoveDevice": (...args: [number, Pointer]) => number;
    "SetupDiUnremoveDevice": (...args: [number, Pointer]) => number;
    "SetupDiRestartDevices": (...args: [number, Pointer]) => number;
    "SetupDiChangeState": (...args: [number, Pointer]) => number;
    "SetupDiInstallClassA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiInstallClassW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiInstallClassExA": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDiInstallClassExW": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDiOpenClassRegKey": (...args: [Pointer, number]) => Pointer;
    "SetupDiOpenClassRegKeyExA": (...args: [Pointer, number, number, Pointer, Pointer]) => Pointer;
    "SetupDiOpenClassRegKeyExW": (...args: [Pointer, number, number, Pointer, Pointer]) => Pointer;
    "SetupDiCreateDeviceInterfaceRegKeyA": (...args: [number, Pointer, number, number, Pointer, Pointer]) => Pointer;
    "SetupDiCreateDeviceInterfaceRegKeyW": (...args: [number, Pointer, number, number, Pointer, Pointer]) => Pointer;
    "SetupDiOpenDeviceInterfaceRegKey": (...args: [number, Pointer, number, number]) => Pointer;
    "SetupDiDeleteDeviceInterfaceRegKey": (...args: [number, Pointer, number]) => number;
    "SetupDiCreateDevRegKeyA": (...args: [number, Pointer, number, number, number, Pointer, Pointer]) => Pointer;
    "SetupDiCreateDevRegKeyW": (...args: [number, Pointer, number, number, number, Pointer, Pointer]) => Pointer;
    "SetupDiOpenDevRegKey": (...args: [number, Pointer, number, number, number, number]) => Pointer;
    "SetupDiDeleteDevRegKey": (...args: [number, Pointer, number, number, number]) => number;
    "SetupDiGetHwProfileList": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetHwProfileListExA": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetHwProfileListExW": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetDevicePropertyKeys": (...args: [number, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupDiGetDevicePropertyW": (...args: [number, Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupDiSetDevicePropertyW": (...args: [number, Pointer, Pointer, number, Pointer, number, number]) => number;
    "SetupDiGetDeviceInterfacePropertyKeys": (...args: [number, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupDiGetDeviceInterfacePropertyW": (...args: [number, Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupDiSetDeviceInterfacePropertyW": (...args: [number, Pointer, Pointer, number, Pointer, number, number]) => number;
    "SetupDiGetClassPropertyKeys": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "SetupDiGetClassPropertyKeysExW": (...args: [Pointer, Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetClassPropertyW": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupDiGetClassPropertyExW": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiSetClassPropertyW": (...args: [Pointer, Pointer, number, Pointer, number, number]) => number;
    "SetupDiSetClassPropertyExW": (...args: [Pointer, Pointer, number, Pointer, number, number, Pointer, Pointer]) => number;
    "SetupDiGetDeviceRegistryPropertyA": (...args: [number, Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetDeviceRegistryPropertyW": (...args: [number, Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetClassRegistryPropertyA": (...args: [Pointer, number, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetClassRegistryPropertyW": (...args: [Pointer, number, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiSetDeviceRegistryPropertyA": (...args: [number, Pointer, number, Pointer, number]) => number;
    "SetupDiSetDeviceRegistryPropertyW": (...args: [number, Pointer, number, Pointer, number]) => number;
    "SetupDiSetClassRegistryPropertyA": (...args: [Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiSetClassRegistryPropertyW": (...args: [Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetDeviceInstallParamsA": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiGetDeviceInstallParamsW": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiGetClassInstallParamsA": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetClassInstallParamsW": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiSetDeviceInstallParamsA": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiSetDeviceInstallParamsW": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiSetClassInstallParamsA": (...args: [number, Pointer, Pointer, number]) => number;
    "SetupDiSetClassInstallParamsW": (...args: [number, Pointer, Pointer, number]) => number;
    "SetupDiGetDriverInstallParamsA": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetDriverInstallParamsW": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SetupDiSetDriverInstallParamsA": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SetupDiSetDriverInstallParamsW": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SetupDiLoadClassIcon": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupDiLoadDeviceIcon": (...args: [number, Pointer, number, number, number, Pointer]) => number;
    "SetupDiDrawMiniIcon": (...args: [Pointer, Pointer, number, number]) => number;
    "SetupDiGetClassBitmapIndex": (...args: [Pointer, Pointer]) => number;
    "SetupDiGetClassImageList": (...args: [Pointer]) => number;
    "SetupDiGetClassImageListExA": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupDiGetClassImageListExW": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupDiGetClassImageIndex": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupDiDestroyClassImageList": (...args: [Pointer]) => number;
    "SetupDiGetClassDevPropertySheetsA": (...args: [number, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupDiGetClassDevPropertySheetsW": (...args: [number, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupDiAskForOEMDisk": (...args: [number, Pointer]) => number;
    "SetupDiSelectOEMDrv": (...args: [Pointer, number, Pointer]) => number;
    "SetupDiClassNameFromGuidA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiClassNameFromGuidW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiClassNameFromGuidExA": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiClassNameFromGuidExW": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiClassGuidsFromNameA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiClassGuidsFromNameW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiClassGuidsFromNameExA": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiClassGuidsFromNameExW": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetHwProfileFriendlyNameA": (...args: [number, Pointer, number, Pointer]) => number;
    "SetupDiGetHwProfileFriendlyNameW": (...args: [number, Pointer, number, Pointer]) => number;
    "SetupDiGetHwProfileFriendlyNameExA": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetHwProfileFriendlyNameExW": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetWizardPage": (...args: [number, Pointer, Pointer, number, number]) => Pointer;
    "SetupDiGetSelectedDevice": (...args: [number, Pointer]) => number;
    "SetupDiSetSelectedDevice": (...args: [number, Pointer]) => number;
    "SetupDiGetActualModelsSectionA": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetActualModelsSectionW": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetActualSectionToInstallA": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetActualSectionToInstallW": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetActualSectionToInstallExA": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetActualSectionToInstallExW": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupEnumInfSectionsA": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupEnumInfSectionsW": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupVerifyInfFileA": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupVerifyInfFileW": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupDiGetCustomDevicePropertyA": (...args: [number, Pointer, Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetCustomDevicePropertyW": (...args: [number, Pointer, Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupConfigureWmiFromInfSectionA": (...args: [Pointer, Pointer, number]) => number;
    "SetupConfigureWmiFromInfSectionW": (...args: [Pointer, Pointer, number]) => number;
    "SetupGetInfInformation": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupQueryInfFileInformation": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupQueryInfOriginalFileInformation": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "SetupQueryInfVersionInformation": (...args: [Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetInfDriverStoreLocation": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetInfPublishedName": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupGetInfFileList": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupOpenInfFile": (...args: [Pointer, Pointer, number, Pointer]) => Pointer;
    "SetupOpenAppendInfFile": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupFindFirstLine": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupFindNextMatchLine": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupGetLineByIndex": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupGetLineCount": (...args: [Pointer, Pointer]) => number;
    "SetupGetLineText": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetStringField": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupGetMultiSzField": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupGetFileCompressionInfo": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupGetFileCompressionInfoEx": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDecompressOrCopyFile": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupGetSourceFileLocation": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupGetSourceFileSize": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupGetTargetPath": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupSetSourceList": (...args: [number, Pointer, number]) => number;
    "SetupAddToSourceList": (...args: [number, Pointer]) => number;
    "SetupRemoveFromSourceList": (...args: [number, Pointer]) => number;
    "SetupQuerySourceList": (...args: [number, Pointer, Pointer]) => number;
    "SetupFreeSourceList": (...args: [Pointer, number]) => number;
    "SetupPromptForDisk": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "SetupCopyError": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, Pointer, number, Pointer]) => number;
    "SetupRenameError": (...args: [Pointer, Pointer, Pointer, Pointer, number, number]) => number;
    "SetupDeleteError": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "SetupBackupError": (...args: [Pointer, Pointer, Pointer, Pointer, number, number]) => number;
    "SetupSetDirectoryId": (...args: [Pointer, number, Pointer]) => number;
    "SetupSetDirectoryIdEx": (...args: [Pointer, number, Pointer, number, number, Pointer]) => number;
    "SetupGetSourceInfo": (...args: [Pointer, number, number, Pointer, number, Pointer]) => number;
    "SetupInstallFile": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupInstallFileEx": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupSetFileQueueAlternatePlatform": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupSetPlatformPathOverride": (...args: [Pointer]) => number;
    "SetupQueueCopy": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupQueueCopyIndirect": (...args: [Pointer]) => number;
    "SetupQueueDefaultCopy": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupQueueCopySection": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupQueueDelete": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupQueueDeleteSection": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupQueueRename": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupQueueRenameSection": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupCommitFileQueue": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupScanFileQueue": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupCopyOEMInf": (...args: [Pointer, Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "SetupUninstallOEMInf": (...args: [Pointer, number, Pointer]) => number;
    "SetupCreateDiskSpaceList": (...args: [Pointer, number, number]) => Pointer;
    "SetupDuplicateDiskSpaceList": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "SetupQueryDrivesInDiskSpaceList": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupQuerySpaceRequiredOnDrive": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupAdjustDiskSpaceList": (...args: [Pointer, Pointer, bigint, Pointer, number]) => number;
    "SetupAddToDiskSpaceList": (...args: [Pointer, Pointer, bigint, number, Pointer, number]) => number;
    "SetupAddSectionToDiskSpaceList": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupAddInstallSectionToDiskSpaceList": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupRemoveFromDiskSpaceList": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "SetupRemoveSectionFromDiskSpaceList": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupRemoveInstallSectionFromDiskSpaceList": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupIterateCabinet": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "SetupDefaultQueueCallback": (...args: [Pointer, number, number, number]) => number;
    "SetupInstallFromInfSection": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupInstallFilesFromInfSection": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetupInstallServicesFromInfSection": (...args: [Pointer, Pointer, number]) => number;
    "SetupInstallServicesFromInfSectionEx": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "InstallHinfSection": (...args: [Pointer, Pointer, Pointer, number]) => void;
    "SetupInitializeFileLog": (...args: [Pointer, number]) => Pointer;
    "SetupLogFile": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer, number]) => number;
    "SetupRemoveFileLogEntry": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupQueryFileLog": (...args: [Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "SetupLogError": (...args: [Pointer, number]) => number;
    "SetupGetBackupInformation": (...args: [Pointer, Pointer]) => number;
    "SetupPrepareQueueForRestore": (...args: [Pointer, Pointer, number]) => number;
    "SetupDiCreateDeviceInfoListEx": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetDeviceInfoListDetail": (...args: [number, Pointer]) => number;
    "SetupDiCreateDeviceInfo": (...args: [number, Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiOpenDeviceInfo": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetDeviceInstanceId": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiCreateDeviceInterface": (...args: [number, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiOpenDeviceInterface": (...args: [number, Pointer, number, Pointer]) => number;
    "SetupDiGetDeviceInterfaceDetail": (...args: [number, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiEnumDriverInfo": (...args: [number, Pointer, number, number, Pointer]) => number;
    "SetupDiGetSelectedDriver": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiSetSelectedDriver": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiGetDriverInfoDetail": (...args: [number, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetClassDevs": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "SetupDiGetClassDevsEx": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, Pointer]) => number;
    "SetupDiGetINFClass": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiBuildClassInfoListEx": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetClassDescription": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetClassDescriptionEx": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiInstallClass": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiInstallClassEx": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDiOpenClassRegKeyEx": (...args: [Pointer, number, number, Pointer, Pointer]) => Pointer;
    "SetupDiCreateDeviceInterfaceRegKey": (...args: [number, Pointer, number, number, Pointer, Pointer]) => Pointer;
    "SetupDiCreateDevRegKey": (...args: [number, Pointer, number, number, number, Pointer, Pointer]) => Pointer;
    "SetupDiGetHwProfileListEx": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetDeviceRegistryProperty": (...args: [number, Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiGetClassRegistryProperty": (...args: [Pointer, number, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiSetDeviceRegistryProperty": (...args: [number, Pointer, number, Pointer, number]) => number;
    "SetupDiSetClassRegistryProperty": (...args: [Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetDeviceInstallParams": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiGetClassInstallParams": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "SetupDiSetDeviceInstallParams": (...args: [number, Pointer, Pointer]) => number;
    "SetupDiSetClassInstallParams": (...args: [number, Pointer, Pointer, number]) => number;
    "SetupDiGetDriverInstallParams": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SetupDiSetDriverInstallParams": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetClassImageListEx": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupDiGetClassDevPropertySheets": (...args: [number, Pointer, Pointer, number, Pointer, number]) => number;
    "SetupDiClassNameFromGuid": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiClassNameFromGuidEx": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiClassGuidsFromName": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "SetupDiClassGuidsFromNameEx": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetHwProfileFriendlyName": (...args: [number, Pointer, number, Pointer]) => number;
    "SetupDiGetHwProfileFriendlyNameEx": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupDiGetActualModelsSection": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetActualSectionToInstall": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetupDiGetActualSectionToInstallEx": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "SetupEnumInfSections": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetupVerifyInfFile": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetupDiGetCustomDeviceProperty": (...args: [number, Pointer, Pointer, number, Pointer, Pointer, number, Pointer]) => number;
    "SetupConfigureWmiFromInfSection": (...args: [Pointer, Pointer, number]) => number;
}
export interface setupapiLibrary { readonly symbols: setupapiSymbols; close(): void; }
export declare const structs: {
  "SP_DEVINFO_DATA": {
    "size": 32,
    "fields": [
      {
        "name": "cbSize",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "ClassGuid",
        "offset": 4,
        "type": "System.Guid"
      },
      {
        "name": "DevInst",
        "offset": 20,
        "type": "u32"
      },
      {
        "name": "Reserved",
        "offset": 24,
        "type": "usize"
      }
    ]
  },
  "SP_DEVICE_INTERFACE_DATA": {
    "size": 32,
    "fields": [
      {
        "name": "cbSize",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "InterfaceClassGuid",
        "offset": 4,
        "type": "System.Guid"
      },
      {
        "name": "Flags",
        "offset": 20,
        "type": "u32"
      },
      {
        "name": "Reserved",
        "offset": 24,
        "type": "usize"
      }
    ]
  }
};
export declare const enums: {
  "SP_COPY_STYLE": {
    "SP_COPY_DELETESOURCE": 1,
    "SP_COPY_REPLACEONLY": 2,
    "SP_COPY_NEWER": 4,
    "SP_COPY_NEWER_OR_SAME": 4,
    "SP_COPY_NOOVERWRITE": 8,
    "SP_COPY_NODECOMP": 16,
    "SP_COPY_LANGUAGEAWARE": 32,
    "SP_COPY_SOURCE_ABSOLUTE": 64,
    "SP_COPY_SOURCEPATH_ABSOLUTE": 128,
    "SP_COPY_IN_USE_NEEDS_REBOOT": 256,
    "SP_COPY_FORCE_IN_USE": 512,
    "SP_COPY_NOSKIP": 1024,
    "SP_COPY_FORCE_NOOVERWRITE": 4096,
    "SP_COPY_FORCE_NEWER": 8192,
    "SP_COPY_WARNIFSKIP": 16384,
    "SP_COPY_NOBROWSE": 32768,
    "SP_COPY_NEWER_ONLY": 65536,
    "SP_COPY_RESERVED": 131072,
    "SP_COPY_OEMINF_CATALOG_ONLY": 262144,
    "SP_COPY_REPLACE_BOOT_FILE": 524288,
    "SP_COPY_NOPRUNE": 1048576,
    "SP_COPY_OEM_F6_INF": 2097152,
    "SP_COPY_ALREADYDECOMP": 4194304,
    "SP_COPY_WINDOWS_SIGNED": 16777216,
    "SP_COPY_PNPLOCKED": 33554432,
    "SP_COPY_IN_USE_TRY_RENAME": 67108864,
    "SP_COPY_INBOX_INF": 134217728,
    "SP_COPY_HARDLINK": 268435456
  },
  "SETUP_FILE_OPERATION": {
    "FILEOP_DELETE": 2,
    "FILEOP_COPY": 0
  },
  "OEM_SOURCE_MEDIA_TYPE": {
    "SPOST_NONE": 0,
    "SPOST_PATH": 1,
    "SPOST_URL": 2
  },
  "SETUP_DI_DRIVER_TYPE": {
    "SPDIT_CLASSDRIVER": 1,
    "SPDIT_COMPATDRIVER": 2
  },
  "INF_STYLE": {
    "INF_STYLE_NONE": 0,
    "INF_STYLE_OLDNT": 1,
    "INF_STYLE_WIN4": 2,
    "INF_STYLE_CACHE_ENABLE": 16,
    "INF_STYLE_CACHE_DISABLE": 32,
    "INF_STYLE_CACHE_IGNORE": 64
  },
  "SETUPSCANFILEQUEUE_FLAGS": {
    "SPQ_SCAN_FILE_PRESENCE": 1,
    "SPQ_SCAN_FILE_VALIDITY": 2,
    "SPQ_SCAN_USE_CALLBACK": 4,
    "SPQ_SCAN_USE_CALLBACKEX": 8,
    "SPQ_SCAN_INFORM_USER": 16,
    "SPQ_SCAN_PRUNE_COPY_QUEUE": 32,
    "SPQ_SCAN_USE_CALLBACK_SIGNERINFO": 64,
    "SPQ_SCAN_PRUNE_DELREN": 128,
    "SPQ_SCAN_FILE_PRESENCE_WITHOUT_SOURCE": 256,
    "SPQ_SCAN_FILE_COMPARISON": 512,
    "SPQ_SCAN_ACTIVATE_DRP": 1024,
    "SPQ_SCAN_USE_OEM_CATALOGS": 2048
  },
  "SPSVCINST_FLAGS": {
    "SPSVCINST_TAGTOFRONT": 1,
    "SPSVCINST_ASSOCSERVICE": 2,
    "SPSVCINST_DELETEEVENTLOGENTRY": 4,
    "SPSVCINST_NOCLOBBER_DISPLAYNAME": 8,
    "SPSVCINST_NOCLOBBER_STARTTYPE": 16,
    "SPSVCINST_NOCLOBBER_ERRORCONTROL": 32,
    "SPSVCINST_NOCLOBBER_LOADORDERGROUP": 64,
    "SPSVCINST_NOCLOBBER_DEPENDENCIES": 128,
    "SPSVCINST_NOCLOBBER_DESCRIPTION": 256,
    "SPSVCINST_STOPSERVICE": 512,
    "SPSVCINST_CLOBBER_SECURITY": 1024,
    "SPSVCINST_STARTSERVICE": 2048,
    "SPSVCINST_NOCLOBBER_REQUIREDPRIVILEGES": 4096,
    "SPSVCINST_NOCLOBBER_TRIGGERS": 8192,
    "SPSVCINST_NOCLOBBER_SERVICESIDTYPE": 16384,
    "SPSVCINST_NOCLOBBER_DELAYEDAUTOSTART": 32768,
    "SPSVCINST_UNIQUE_NAME": 65536,
    "SPSVCINST_NOCLOBBER_FAILUREACTIONS": 131072,
    "SPSVCINST_NOCLOBBER_BOOTFLAGS": 262144
  },
  "SETUP_DI_REGISTRY_PROPERTY": {
    "SPDRP_DEVICEDESC": 0,
    "SPDRP_HARDWAREID": 1,
    "SPDRP_COMPATIBLEIDS": 2,
    "SPDRP_UNUSED0": 3,
    "SPDRP_SERVICE": 4,
    "SPDRP_UNUSED1": 5,
    "SPDRP_UNUSED2": 6,
    "SPDRP_CLASS": 7,
    "SPDRP_CLASSGUID": 8,
    "SPDRP_DRIVER": 9,
    "SPDRP_CONFIGFLAGS": 10,
    "SPDRP_MFG": 11,
    "SPDRP_FRIENDLYNAME": 12,
    "SPDRP_LOCATION_INFORMATION": 13,
    "SPDRP_PHYSICAL_DEVICE_OBJECT_NAME": 14,
    "SPDRP_CAPABILITIES": 15,
    "SPDRP_UI_NUMBER": 16,
    "SPDRP_UPPERFILTERS": 17,
    "SPDRP_LOWERFILTERS": 18,
    "SPDRP_BUSTYPEGUID": 19,
    "SPDRP_LEGACYBUSTYPE": 20,
    "SPDRP_BUSNUMBER": 21,
    "SPDRP_ENUMERATOR_NAME": 22,
    "SPDRP_SECURITY": 23,
    "SPDRP_SECURITY_SDS": 24,
    "SPDRP_DEVTYPE": 25,
    "SPDRP_EXCLUSIVE": 26,
    "SPDRP_CHARACTERISTICS": 27,
    "SPDRP_ADDRESS": 28,
    "SPDRP_UI_NUMBER_DESC_FORMAT": 29,
    "SPDRP_DEVICE_POWER_DATA": 30,
    "SPDRP_REMOVAL_POLICY": 31,
    "SPDRP_REMOVAL_POLICY_HW_DEFAULT": 32,
    "SPDRP_REMOVAL_POLICY_OVERRIDE": 33,
    "SPDRP_INSTALL_STATE": 34,
    "SPDRP_LOCATION_PATHS": 35,
    "SPDRP_BASE_CONTAINERID": 36,
    "SPDRP_MAXIMUM_PROPERTY": 37
  },
  "SETUP_DI_DEVICE_CREATION_FLAGS": {
    "DICD_GENERATE_ID": 1,
    "DICD_INHERIT_CLASSDRVS": 2
  },
  "SETUP_DI_GET_CLASS_DEVS_FLAGS": {
    "DIGCF_DEFAULT": 1,
    "DIGCF_PRESENT": 2,
    "DIGCF_ALLCLASSES": 4,
    "DIGCF_PROFILE": 8,
    "DIGCF_DEVICEINTERFACE": 16,
    "DIGCF_INTERFACEDEVICE": 16
  },
  "DI_FUNCTION": {
    "DIF_SELECTDEVICE": 1,
    "DIF_INSTALLDEVICE": 2,
    "DIF_ASSIGNRESOURCES": 3,
    "DIF_PROPERTIES": 4,
    "DIF_REMOVE": 5,
    "DIF_FIRSTTIMESETUP": 6,
    "DIF_FOUNDDEVICE": 7,
    "DIF_SELECTCLASSDRIVERS": 8,
    "DIF_VALIDATECLASSDRIVERS": 9,
    "DIF_INSTALLCLASSDRIVERS": 10,
    "DIF_CALCDISKSPACE": 11,
    "DIF_DESTROYPRIVATEDATA": 12,
    "DIF_VALIDATEDRIVER": 13,
    "DIF_DETECT": 15,
    "DIF_INSTALLWIZARD": 16,
    "DIF_DESTROYWIZARDDATA": 17,
    "DIF_PROPERTYCHANGE": 18,
    "DIF_ENABLECLASS": 19,
    "DIF_DETECTVERIFY": 20,
    "DIF_INSTALLDEVICEFILES": 21,
    "DIF_UNREMOVE": 22,
    "DIF_SELECTBESTCOMPATDRV": 23,
    "DIF_ALLOW_INSTALL": 24,
    "DIF_REGISTERDEVICE": 25,
    "DIF_NEWDEVICEWIZARD_PRESELECT": 26,
    "DIF_NEWDEVICEWIZARD_SELECT": 27,
    "DIF_NEWDEVICEWIZARD_PREANALYZE": 28,
    "DIF_NEWDEVICEWIZARD_POSTANALYZE": 29,
    "DIF_NEWDEVICEWIZARD_FINISHINSTALL": 30,
    "DIF_UNUSED1": 31,
    "DIF_INSTALLINTERFACES": 32,
    "DIF_DETECTCANCEL": 33,
    "DIF_REGISTER_COINSTALLERS": 34,
    "DIF_ADDPROPERTYPAGE_ADVANCED": 35,
    "DIF_ADDPROPERTYPAGE_BASIC": 36,
    "DIF_RESERVED1": 37,
    "DIF_TROUBLESHOOTER": 38,
    "DIF_POWERMESSAGEWAKE": 39,
    "DIF_ADDREMOTEPROPERTYPAGE_ADVANCED": 40,
    "DIF_UPDATEDRIVER_UI": 41,
    "DIF_FINISHINSTALL_ACTION": 42,
    "DIF_RESERVED2": 48,
    "DIF_MOVEDEVICE": 14
  },
  "FILE_COMPRESSION_TYPE": {
    "FILE_COMPRESSION_NONE": 0,
    "FILE_COMPRESSION_WINLZA": 1,
    "FILE_COMPRESSION_MSZIP": 2,
    "FILE_COMPRESSION_NTCAB": 3
  },
  "DEVPROPTYPE": {
    "DEVPROP_TYPEMOD_ARRAY": 4096,
    "DEVPROP_TYPEMOD_LIST": 8192,
    "DEVPROP_TYPE_EMPTY": 0,
    "DEVPROP_TYPE_NULL": 1,
    "DEVPROP_TYPE_SBYTE": 2,
    "DEVPROP_TYPE_BYTE": 3,
    "DEVPROP_TYPE_INT16": 4,
    "DEVPROP_TYPE_UINT16": 5,
    "DEVPROP_TYPE_INT32": 6,
    "DEVPROP_TYPE_UINT32": 7,
    "DEVPROP_TYPE_INT64": 8,
    "DEVPROP_TYPE_UINT64": 9,
    "DEVPROP_TYPE_FLOAT": 10,
    "DEVPROP_TYPE_DOUBLE": 11,
    "DEVPROP_TYPE_DECIMAL": 12,
    "DEVPROP_TYPE_GUID": 13,
    "DEVPROP_TYPE_CURRENCY": 14,
    "DEVPROP_TYPE_DATE": 15,
    "DEVPROP_TYPE_FILETIME": 16,
    "DEVPROP_TYPE_BOOLEAN": 17,
    "DEVPROP_TYPE_STRING": 18,
    "DEVPROP_TYPE_STRING_LIST": 8210,
    "DEVPROP_TYPE_SECURITY_DESCRIPTOR": 19,
    "DEVPROP_TYPE_SECURITY_DESCRIPTOR_STRING": 20,
    "DEVPROP_TYPE_DEVPROPKEY": 21,
    "DEVPROP_TYPE_DEVPROPTYPE": 22,
    "DEVPROP_TYPE_BINARY": 4099,
    "DEVPROP_TYPE_ERROR": 23,
    "DEVPROP_TYPE_NTSTATUS": 24,
    "DEVPROP_TYPE_STRING_INDIRECT": 25
  },
  "SetupFileLogInfo": {
    "SetupFileLogSourceFilename": 0,
    "SetupFileLogChecksum": 1,
    "SetupFileLogDiskTagfile": 2,
    "SetupFileLogDiskDescription": 3,
    "SetupFileLogOtherInfo": 4,
    "SetupFileLogMax": 5
  }
};
export declare const wideAliases: {
  "SetupGetInfInformation": "SetupGetInfInformationW",
  "SetupQueryInfFileInformation": "SetupQueryInfFileInformationW",
  "SetupQueryInfOriginalFileInformation": "SetupQueryInfOriginalFileInformationW",
  "SetupQueryInfVersionInformation": "SetupQueryInfVersionInformationW",
  "SetupGetInfDriverStoreLocation": "SetupGetInfDriverStoreLocationW",
  "SetupGetInfPublishedName": "SetupGetInfPublishedNameW",
  "SetupGetInfFileList": "SetupGetInfFileListW",
  "SetupOpenInfFile": "SetupOpenInfFileW",
  "SetupOpenAppendInfFile": "SetupOpenAppendInfFileW",
  "SetupFindFirstLine": "SetupFindFirstLineW",
  "SetupFindNextMatchLine": "SetupFindNextMatchLineW",
  "SetupGetLineByIndex": "SetupGetLineByIndexW",
  "SetupGetLineCount": "SetupGetLineCountW",
  "SetupGetLineText": "SetupGetLineTextW",
  "SetupGetStringField": "SetupGetStringFieldW",
  "SetupGetMultiSzField": "SetupGetMultiSzFieldW",
  "SetupGetFileCompressionInfo": "SetupGetFileCompressionInfoW",
  "SetupGetFileCompressionInfoEx": "SetupGetFileCompressionInfoExW",
  "SetupDecompressOrCopyFile": "SetupDecompressOrCopyFileW",
  "SetupGetSourceFileLocation": "SetupGetSourceFileLocationW",
  "SetupGetSourceFileSize": "SetupGetSourceFileSizeW",
  "SetupGetTargetPath": "SetupGetTargetPathW",
  "SetupSetSourceList": "SetupSetSourceListW",
  "SetupAddToSourceList": "SetupAddToSourceListW",
  "SetupRemoveFromSourceList": "SetupRemoveFromSourceListW",
  "SetupQuerySourceList": "SetupQuerySourceListW",
  "SetupFreeSourceList": "SetupFreeSourceListW",
  "SetupPromptForDisk": "SetupPromptForDiskW",
  "SetupCopyError": "SetupCopyErrorW",
  "SetupRenameError": "SetupRenameErrorW",
  "SetupDeleteError": "SetupDeleteErrorW",
  "SetupBackupError": "SetupBackupErrorW",
  "SetupSetDirectoryId": "SetupSetDirectoryIdW",
  "SetupSetDirectoryIdEx": "SetupSetDirectoryIdExW",
  "SetupGetSourceInfo": "SetupGetSourceInfoW",
  "SetupInstallFile": "SetupInstallFileW",
  "SetupInstallFileEx": "SetupInstallFileExW",
  "SetupSetFileQueueAlternatePlatform": "SetupSetFileQueueAlternatePlatformW",
  "SetupSetPlatformPathOverride": "SetupSetPlatformPathOverrideW",
  "SetupQueueCopy": "SetupQueueCopyW",
  "SetupQueueCopyIndirect": "SetupQueueCopyIndirectW",
  "SetupQueueDefaultCopy": "SetupQueueDefaultCopyW",
  "SetupQueueCopySection": "SetupQueueCopySectionW",
  "SetupQueueDelete": "SetupQueueDeleteW",
  "SetupQueueDeleteSection": "SetupQueueDeleteSectionW",
  "SetupQueueRename": "SetupQueueRenameW",
  "SetupQueueRenameSection": "SetupQueueRenameSectionW",
  "SetupCommitFileQueue": "SetupCommitFileQueueW",
  "SetupScanFileQueue": "SetupScanFileQueueW",
  "SetupCopyOEMInf": "SetupCopyOEMInfW",
  "SetupUninstallOEMInf": "SetupUninstallOEMInfW",
  "SetupCreateDiskSpaceList": "SetupCreateDiskSpaceListW",
  "SetupDuplicateDiskSpaceList": "SetupDuplicateDiskSpaceListW",
  "SetupQueryDrivesInDiskSpaceList": "SetupQueryDrivesInDiskSpaceListW",
  "SetupQuerySpaceRequiredOnDrive": "SetupQuerySpaceRequiredOnDriveW",
  "SetupAdjustDiskSpaceList": "SetupAdjustDiskSpaceListW",
  "SetupAddToDiskSpaceList": "SetupAddToDiskSpaceListW",
  "SetupAddSectionToDiskSpaceList": "SetupAddSectionToDiskSpaceListW",
  "SetupAddInstallSectionToDiskSpaceList": "SetupAddInstallSectionToDiskSpaceListW",
  "SetupRemoveFromDiskSpaceList": "SetupRemoveFromDiskSpaceListW",
  "SetupRemoveSectionFromDiskSpaceList": "SetupRemoveSectionFromDiskSpaceListW",
  "SetupRemoveInstallSectionFromDiskSpaceList": "SetupRemoveInstallSectionFromDiskSpaceListW",
  "SetupIterateCabinet": "SetupIterateCabinetW",
  "SetupDefaultQueueCallback": "SetupDefaultQueueCallbackW",
  "SetupInstallFromInfSection": "SetupInstallFromInfSectionW",
  "SetupInstallFilesFromInfSection": "SetupInstallFilesFromInfSectionW",
  "SetupInstallServicesFromInfSection": "SetupInstallServicesFromInfSectionW",
  "SetupInstallServicesFromInfSectionEx": "SetupInstallServicesFromInfSectionExW",
  "InstallHinfSection": "InstallHinfSectionW",
  "SetupInitializeFileLog": "SetupInitializeFileLogW",
  "SetupLogFile": "SetupLogFileW",
  "SetupRemoveFileLogEntry": "SetupRemoveFileLogEntryW",
  "SetupQueryFileLog": "SetupQueryFileLogW",
  "SetupLogError": "SetupLogErrorW",
  "SetupGetBackupInformation": "SetupGetBackupInformationW",
  "SetupPrepareQueueForRestore": "SetupPrepareQueueForRestoreW",
  "SetupDiCreateDeviceInfoListEx": "SetupDiCreateDeviceInfoListExW",
  "SetupDiGetDeviceInfoListDetail": "SetupDiGetDeviceInfoListDetailW",
  "SetupDiCreateDeviceInfo": "SetupDiCreateDeviceInfoW",
  "SetupDiOpenDeviceInfo": "SetupDiOpenDeviceInfoW",
  "SetupDiGetDeviceInstanceId": "SetupDiGetDeviceInstanceIdW",
  "SetupDiCreateDeviceInterface": "SetupDiCreateDeviceInterfaceW",
  "SetupDiOpenDeviceInterface": "SetupDiOpenDeviceInterfaceW",
  "SetupDiGetDeviceInterfaceDetail": "SetupDiGetDeviceInterfaceDetailW",
  "SetupDiEnumDriverInfo": "SetupDiEnumDriverInfoW",
  "SetupDiGetSelectedDriver": "SetupDiGetSelectedDriverW",
  "SetupDiSetSelectedDriver": "SetupDiSetSelectedDriverW",
  "SetupDiGetDriverInfoDetail": "SetupDiGetDriverInfoDetailW",
  "SetupDiGetClassDevs": "SetupDiGetClassDevsW",
  "SetupDiGetClassDevsEx": "SetupDiGetClassDevsExW",
  "SetupDiGetINFClass": "SetupDiGetINFClassW",
  "SetupDiBuildClassInfoListEx": "SetupDiBuildClassInfoListExW",
  "SetupDiGetClassDescription": "SetupDiGetClassDescriptionW",
  "SetupDiGetClassDescriptionEx": "SetupDiGetClassDescriptionExW",
  "SetupDiInstallClass": "SetupDiInstallClassW",
  "SetupDiInstallClassEx": "SetupDiInstallClassExW",
  "SetupDiOpenClassRegKeyEx": "SetupDiOpenClassRegKeyExW",
  "SetupDiCreateDeviceInterfaceRegKey": "SetupDiCreateDeviceInterfaceRegKeyW",
  "SetupDiCreateDevRegKey": "SetupDiCreateDevRegKeyW",
  "SetupDiGetHwProfileListEx": "SetupDiGetHwProfileListExW",
  "SetupDiGetDeviceRegistryProperty": "SetupDiGetDeviceRegistryPropertyW",
  "SetupDiGetClassRegistryProperty": "SetupDiGetClassRegistryPropertyW",
  "SetupDiSetDeviceRegistryProperty": "SetupDiSetDeviceRegistryPropertyW",
  "SetupDiSetClassRegistryProperty": "SetupDiSetClassRegistryPropertyW",
  "SetupDiGetDeviceInstallParams": "SetupDiGetDeviceInstallParamsW",
  "SetupDiGetClassInstallParams": "SetupDiGetClassInstallParamsW",
  "SetupDiSetDeviceInstallParams": "SetupDiSetDeviceInstallParamsW",
  "SetupDiSetClassInstallParams": "SetupDiSetClassInstallParamsW",
  "SetupDiGetDriverInstallParams": "SetupDiGetDriverInstallParamsW",
  "SetupDiSetDriverInstallParams": "SetupDiSetDriverInstallParamsW",
  "SetupDiGetClassImageListEx": "SetupDiGetClassImageListExW",
  "SetupDiGetClassDevPropertySheets": "SetupDiGetClassDevPropertySheetsW",
  "SetupDiClassNameFromGuid": "SetupDiClassNameFromGuidW",
  "SetupDiClassNameFromGuidEx": "SetupDiClassNameFromGuidExW",
  "SetupDiClassGuidsFromName": "SetupDiClassGuidsFromNameW",
  "SetupDiClassGuidsFromNameEx": "SetupDiClassGuidsFromNameExW",
  "SetupDiGetHwProfileFriendlyName": "SetupDiGetHwProfileFriendlyNameW",
  "SetupDiGetHwProfileFriendlyNameEx": "SetupDiGetHwProfileFriendlyNameExW",
  "SetupDiGetActualModelsSection": "SetupDiGetActualModelsSectionW",
  "SetupDiGetActualSectionToInstall": "SetupDiGetActualSectionToInstallW",
  "SetupDiGetActualSectionToInstallEx": "SetupDiGetActualSectionToInstallExW",
  "SetupEnumInfSections": "SetupEnumInfSectionsW",
  "SetupVerifyInfFile": "SetupVerifyInfFileW",
  "SetupDiGetCustomDeviceProperty": "SetupDiGetCustomDevicePropertyW",
  "SetupConfigureWmiFromInfSection": "SetupConfigureWmiFromInfSectionW"
};
export declare const signatures: {
  "setupapi.dll": {
    "SetupGetInfInformationA": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INF_INFORMATION*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetInfInformationW": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INF_INFORMATION*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueryInfFileInformationA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INF_INFORMATION*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueryInfFileInformationW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INF_INFORMATION*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueryInfOriginalFileInformationA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INF_INFORMATION*",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ORIGINAL_FILE_INFO_A*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueryInfOriginalFileInformationW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INF_INFORMATION*",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ORIGINAL_FILE_INFO_W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueryInfVersionInformationA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INF_INFORMATION*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueryInfVersionInformationW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INF_INFORMATION*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetInfDriverStoreLocationA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetInfDriverStoreLocationW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetInfPublishedNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetInfPublishedNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetInfFileListA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INF_STYLE",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetInfFileListW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INF_STYLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupOpenInfFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INF_STYLE",
        "u32*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetupOpenInfFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INF_STYLE",
        "u32*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetupOpenMasterInf": {
      "args": [],
      "returns": "void*",
      "setLastError": false
    },
    "SetupOpenAppendInfFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupOpenAppendInfFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupCloseInfFile": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetupFindFirstLineA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupFindFirstLineW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupFindNextLine": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupFindNextMatchLineA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupFindNextMatchLineW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetLineByIndexA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetLineByIndexW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetLineCountA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetupGetLineCountW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetupGetLineTextA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetLineTextW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetFieldCount": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupGetStringFieldA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetStringFieldW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetIntField": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "u32",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetMultiSzFieldA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetMultiSzFieldW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetBinaryField": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "u32",
        "u8*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetFileCompressionInfoA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR*",
        "u32*",
        "u32*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.FILE_COMPRESSION_TYPE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupGetFileCompressionInfoW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR*",
        "u32*",
        "u32*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.FILE_COMPRESSION_TYPE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupGetFileCompressionInfoExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.FILE_COMPRESSION_TYPE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetFileCompressionInfoExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.FILE_COMPRESSION_TYPE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDecompressOrCopyFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.FILE_COMPRESSION_TYPE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupDecompressOrCopyFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.FILE_COMPRESSION_TYPE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupGetSourceFileLocationA": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetSourceFileLocationW": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetSourceFileSizeA": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetSourceFileSizeW": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetTargetPathA": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetTargetPathW": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetSourceListA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetSourceListW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupCancelTemporarySourceList": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupAddToSourceListA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupAddToSourceListW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupRemoveFromSourceListA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupRemoveFromSourceListW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQuerySourceListA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQuerySourceListW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupFreeSourceListA": {
      "args": [
        "Windows.Win32.Foundation.PSTR**",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupFreeSourceListW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR**",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupPromptForDiskA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupPromptForDiskW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupCopyErrorA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupCopyErrorW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupRenameErrorA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupRenameErrorW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupDeleteErrorA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupDeleteErrorW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupBackupErrorA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupBackupErrorW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupSetDirectoryIdA": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetDirectoryIdW": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetDirectoryIdExA": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetDirectoryIdExW": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetSourceInfoA": {
      "args": [
        "void*",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetSourceInfoW": {
      "args": [
        "void*",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallFileA": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_COPY_STYLE",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_A",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallFileW": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_COPY_STYLE",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_W",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallFileExA": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_COPY_STYLE",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_A",
        "void*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallFileExW": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_COPY_STYLE",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_W",
        "void*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupOpenFileQueue": {
      "args": [],
      "returns": "void*",
      "setLastError": false
    },
    "SetupCloseFileQueue": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetFileQueueAlternatePlatformA": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetFileQueueAlternatePlatformW": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetPlatformPathOverrideA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetPlatformPathOverrideW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueCopyA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueCopyW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueCopyIndirectA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_FILE_COPY_PARAMS_A*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueCopyIndirectW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_FILE_COPY_PARAMS_W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueDefaultCopyA": {
      "args": [
        "void*",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueDefaultCopyW": {
      "args": [
        "void*",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueCopySectionA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueCopySectionW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueDeleteA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueDeleteW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueDeleteSectionA": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueDeleteSectionW": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueRenameA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueRenameW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueRenameSectionA": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueueRenameSectionW": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupCommitFileQueueA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_A",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupCommitFileQueueW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_W",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupScanFileQueueA": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUPSCANFILEQUEUE_FLAGS",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_A",
        "void*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupScanFileQueueW": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUPSCANFILEQUEUE_FLAGS",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_W",
        "void*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetFileQueueCount": {
      "args": [
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetFileQueueFlags": {
      "args": [
        "void*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetFileQueueFlags": {
      "args": [
        "void*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupCopyOEMInfA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.OEM_SOURCE_MEDIA_TYPE",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_COPY_STYLE",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupCopyOEMInfW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.OEM_SOURCE_MEDIA_TYPE",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_COPY_STYLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupUninstallOEMInfA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupUninstallOEMInfW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupUninstallNewlyCopiedInfs": {
      "args": [
        "void*",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupCreateDiskSpaceListA": {
      "args": [
        "void*",
        "u32",
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetupCreateDiskSpaceListW": {
      "args": [
        "void*",
        "u32",
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetupDuplicateDiskSpaceListA": {
      "args": [
        "void*",
        "void*",
        "u32",
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetupDuplicateDiskSpaceListW": {
      "args": [
        "void*",
        "void*",
        "u32",
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetupDestroyDiskSpaceList": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueryDrivesInDiskSpaceListA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueryDrivesInDiskSpaceListW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQuerySpaceRequiredOnDriveA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "i64*",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQuerySpaceRequiredOnDriveW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "i64*",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupAdjustDiskSpaceListA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "i64",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupAdjustDiskSpaceListW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "i64",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupAddToDiskSpaceListA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "i64",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_FILE_OPERATION",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupAddToDiskSpaceListW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "i64",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_FILE_OPERATION",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupAddSectionToDiskSpaceListA": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_FILE_OPERATION",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupAddSectionToDiskSpaceListW": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_FILE_OPERATION",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupAddInstallSectionToDiskSpaceListA": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupAddInstallSectionToDiskSpaceListW": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupRemoveFromDiskSpaceListA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_FILE_OPERATION",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupRemoveFromDiskSpaceListW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_FILE_OPERATION",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupRemoveSectionFromDiskSpaceListA": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_FILE_OPERATION",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupRemoveSectionFromDiskSpaceListW": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_FILE_OPERATION",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupRemoveInstallSectionFromDiskSpaceListA": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupRemoveInstallSectionFromDiskSpaceListW": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupIterateCabinetA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_A",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupIterateCabinetW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_W",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupPromptReboot": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetupInitDefaultQueueCallback": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetupInitDefaultQueueCallbackEx": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "u32",
        "void*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetupTermDefaultQueueCallback": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetupDefaultQueueCallbackA": {
      "args": [
        "void*",
        "u32",
        "usize",
        "usize"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupDefaultQueueCallbackW": {
      "args": [
        "void*",
        "u32",
        "usize",
        "usize"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetupInstallFromInfSectionA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_A",
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallFromInfSectionW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_FILE_CALLBACK_W",
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallFilesFromInfSectionA": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallFilesFromInfSectionW": {
      "args": [
        "void*",
        "void*",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallServicesFromInfSectionA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SPSVCINST_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallServicesFromInfSectionW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SPSVCINST_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallServicesFromInfSectionExA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SPSVCINST_FLAGS",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "void*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupInstallServicesFromInfSectionExW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SPSVCINST_FLAGS",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "void*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InstallHinfSectionA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "InstallHinfSectionW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetupInitializeFileLogA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetupInitializeFileLogW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SetupTerminateFileLog": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupLogFileA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupLogFileW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupRemoveFileLogEntryA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupRemoveFileLogEntryW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueryFileLogA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SetupFileLogInfo",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupQueryFileLogW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SetupFileLogInfo",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupOpenLog": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupLogErrorA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupLogErrorW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupCloseLog": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "SetupGetThreadLogToken": {
      "args": [],
      "returns": "u64",
      "setLastError": false
    },
    "SetupSetThreadLogToken": {
      "args": [
        "u64"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetupWriteTextLog": {
      "args": [
        "u64",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetupWriteTextLogError": {
      "args": [
        "u64",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetupWriteTextLogInfLine": {
      "args": [
        "u64",
        "u32",
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetupGetBackupInformationA": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_BACKUP_QUEUE_PARAMS_V2_A*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetBackupInformationW": {
      "args": [
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_BACKUP_QUEUE_PARAMS_V2_W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupPrepareQueueForRestoreA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupPrepareQueueForRestoreW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupSetNonInteractiveMode": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupGetNonInteractiveMode": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiCreateDeviceInfoList": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
      "setLastError": false
    },
    "SetupDiCreateDeviceInfoListExA": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
      "setLastError": false
    },
    "SetupDiCreateDeviceInfoListExW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
      "setLastError": false
    },
    "SetupDiGetDeviceInfoListClass": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInfoListDetailA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_LIST_DETAIL_DATA_A*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInfoListDetailW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_LIST_DETAIL_DATA_W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiCreateDeviceInfoA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Foundation.PSTR",
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_DEVICE_CREATION_FLAGS",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiCreateDeviceInfoW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_DEVICE_CREATION_FLAGS",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiOpenDeviceInfoA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiOpenDeviceInfoW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInstanceIdA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInstanceIdW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiDeleteDeviceInfo": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiEnumDeviceInfo": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiDestroyDeviceInfoList": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiEnumDeviceInterfaces": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "System.Guid*",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiCreateDeviceInterfaceA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiCreateDeviceInterfaceW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiOpenDeviceInterfaceA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiOpenDeviceInterfaceW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInterfaceAlias": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "System.Guid*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiDeleteDeviceInterfaceData": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiRemoveDeviceInterface": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInterfaceDetailA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DETAIL_DATA_A*",
        "u32",
        "u32*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInterfaceDetailW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DETAIL_DATA_W*",
        "u32",
        "u32*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiInstallDeviceInterfaces": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetDeviceInterfaceDefault": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiRegisterDeviceInfo": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.PSP_DETSIG_CMPPROC",
        "void*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiBuildDriverInfoList": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_DRIVER_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiCancelDriverInfoSearch": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiEnumDriverInfoA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_DRIVER_TYPE",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_A*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiEnumDriverInfoW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_DRIVER_TYPE",
        "u32",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetSelectedDriverA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_A*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetSelectedDriverW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetSelectedDriverA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_A*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetSelectedDriverW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDriverInfoDetailA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_A*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DETAIL_DATA_A*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDriverInfoDetailW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_W*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DETAIL_DATA_W*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiDestroyDriverInfoList": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_DRIVER_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassDevsA": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_GET_CLASS_DEVS_FLAGS"
      ],
      "returns": "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
      "setLastError": false
    },
    "SetupDiGetClassDevsW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_GET_CLASS_DEVS_FLAGS"
      ],
      "returns": "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
      "setLastError": false
    },
    "SetupDiGetClassDevsExA": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_GET_CLASS_DEVS_FLAGS",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
      "setLastError": false
    },
    "SetupDiGetClassDevsExW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_GET_CLASS_DEVS_FLAGS",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
      "setLastError": false
    },
    "SetupDiGetINFClassA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetINFClassW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiBuildClassInfoList": {
      "args": [
        "u32",
        "System.Guid*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiBuildClassInfoListExA": {
      "args": [
        "u32",
        "System.Guid*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiBuildClassInfoListExW": {
      "args": [
        "u32",
        "System.Guid*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassDescriptionA": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassDescriptionW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassDescriptionExA": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassDescriptionExW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiCallClassInstaller": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.DI_FUNCTION",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSelectDevice": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSelectBestCompatDrv": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiInstallDevice": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiInstallDriverFiles": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiRegisterCoDeviceInstallers": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiRemoveDevice": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiUnremoveDevice": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiRestartDevices": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiChangeState": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiInstallClassA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiInstallClassW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiInstallClassExA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "void*",
        "System.Guid*",
        "void*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiInstallClassExW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "void*",
        "System.Guid*",
        "void*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiOpenClassRegKey": {
      "args": [
        "System.Guid*",
        "u32"
      ],
      "returns": "Windows.Win32.System.Registry.HKEY",
      "setLastError": false
    },
    "SetupDiOpenClassRegKeyExA": {
      "args": [
        "System.Guid*",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.System.Registry.HKEY",
      "setLastError": false
    },
    "SetupDiOpenClassRegKeyExW": {
      "args": [
        "System.Guid*",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.System.Registry.HKEY",
      "setLastError": false
    },
    "SetupDiCreateDeviceInterfaceRegKeyA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "u32",
        "u32",
        "void*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.System.Registry.HKEY",
      "setLastError": false
    },
    "SetupDiCreateDeviceInterfaceRegKeyW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "u32",
        "u32",
        "void*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.System.Registry.HKEY",
      "setLastError": false
    },
    "SetupDiOpenDeviceInterfaceRegKey": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.System.Registry.HKEY",
      "setLastError": false
    },
    "SetupDiDeleteDeviceInterfaceRegKey": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiCreateDevRegKeyA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "u32",
        "u32",
        "u32",
        "void*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.System.Registry.HKEY",
      "setLastError": false
    },
    "SetupDiCreateDevRegKeyW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "u32",
        "u32",
        "u32",
        "void*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.System.Registry.HKEY",
      "setLastError": false
    },
    "SetupDiOpenDevRegKey": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "u32",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.System.Registry.HKEY",
      "setLastError": false
    },
    "SetupDiDeleteDevRegKey": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetHwProfileList": {
      "args": [
        "u32*",
        "u32",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetHwProfileListExA": {
      "args": [
        "u32*",
        "u32",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetHwProfileListExW": {
      "args": [
        "u32*",
        "u32",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDevicePropertyKeys": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDevicePropertyW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "Windows.Win32.Devices.Properties.DEVPROPTYPE*",
        "u8*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetDevicePropertyW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "Windows.Win32.Devices.Properties.DEVPROPTYPE",
        "u8*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInterfacePropertyKeys": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInterfacePropertyW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "Windows.Win32.Devices.Properties.DEVPROPTYPE*",
        "u8*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetDeviceInterfacePropertyW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVICE_INTERFACE_DATA*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "Windows.Win32.Devices.Properties.DEVPROPTYPE",
        "u8*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassPropertyKeys": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassPropertyKeysExW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "u32",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassPropertyW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "Windows.Win32.Devices.Properties.DEVPROPTYPE*",
        "u8*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassPropertyExW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "Windows.Win32.Devices.Properties.DEVPROPTYPE*",
        "u8*",
        "u32",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetClassPropertyW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "Windows.Win32.Devices.Properties.DEVPROPTYPE",
        "u8*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetClassPropertyExW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.DEVPROPKEY*",
        "Windows.Win32.Devices.Properties.DEVPROPTYPE",
        "u8*",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceRegistryPropertyA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_REGISTRY_PROPERTY",
        "u32*",
        "u8*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceRegistryPropertyW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_REGISTRY_PROPERTY",
        "u32*",
        "u8*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassRegistryPropertyA": {
      "args": [
        "System.Guid*",
        "u32",
        "u32*",
        "u8*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassRegistryPropertyW": {
      "args": [
        "System.Guid*",
        "u32",
        "u32*",
        "u8*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetDeviceRegistryPropertyA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_REGISTRY_PROPERTY",
        "u8*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetDeviceRegistryPropertyW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SETUP_DI_REGISTRY_PROPERTY",
        "u8*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetClassRegistryPropertyA": {
      "args": [
        "System.Guid*",
        "u32",
        "u8*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetClassRegistryPropertyW": {
      "args": [
        "System.Guid*",
        "u32",
        "u8*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInstallParamsA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINSTALL_PARAMS_A*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDeviceInstallParamsW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINSTALL_PARAMS_W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassInstallParamsA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_CLASSINSTALL_HEADER*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassInstallParamsW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_CLASSINSTALL_HEADER*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetDeviceInstallParamsA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINSTALL_PARAMS_A*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetDeviceInstallParamsW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINSTALL_PARAMS_W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetClassInstallParamsA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_CLASSINSTALL_HEADER*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetClassInstallParamsW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_CLASSINSTALL_HEADER*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDriverInstallParamsA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_A*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINSTALL_PARAMS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetDriverInstallParamsW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_W*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINSTALL_PARAMS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetDriverInstallParamsA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_A*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINSTALL_PARAMS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetDriverInstallParamsW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINFO_DATA_V2_W*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DRVINSTALL_PARAMS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiLoadClassIcon": {
      "args": [
        "System.Guid*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiLoadDeviceIcon": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiDrawMiniIcon": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT",
        "i32",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetupDiGetClassBitmapIndex": {
      "args": [
        "System.Guid*",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassImageList": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_CLASSIMAGELIST_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassImageListExA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_CLASSIMAGELIST_DATA*",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassImageListExW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_CLASSIMAGELIST_DATA*",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassImageIndex": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_CLASSIMAGELIST_DATA*",
        "System.Guid*",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiDestroyClassImageList": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_CLASSIMAGELIST_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassDevPropertySheetsA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.UI.Controls.PROPSHEETHEADERA_V2*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetClassDevPropertySheetsW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.UI.Controls.PROPSHEETHEADERW_V2*",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiAskForOEMDisk": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSelectOEMDrv": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiClassNameFromGuidA": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiClassNameFromGuidW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiClassNameFromGuidExA": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiClassNameFromGuidExW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiClassGuidsFromNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "System.Guid*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiClassGuidsFromNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiClassGuidsFromNameExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "System.Guid*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiClassGuidsFromNameExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetHwProfileFriendlyNameA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetHwProfileFriendlyNameW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetHwProfileFriendlyNameExA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetHwProfileFriendlyNameExW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetWizardPage": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INSTALLWIZARD_DATA*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.UI.Controls.HPROPSHEETPAGE",
      "setLastError": false
    },
    "SetupDiGetSelectedDevice": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiSetSelectedDevice": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetActualModelsSectionA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetActualModelsSectionW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.INFCONTEXT*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetActualSectionToInstallA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetActualSectionToInstallW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetActualSectionToInstallExA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetActualSectionToInstallExW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupEnumInfSectionsA": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupEnumInfSectionsW": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupVerifyInfFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INF_SIGNER_INFO_V2_A*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupVerifyInfFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_ALTPLATFORM_INFO_V2*",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_INF_SIGNER_INFO_V2_W*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetCustomDevicePropertyA": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "u8*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupDiGetCustomDevicePropertyW": {
      "args": [
        "Windows.Win32.Devices.DeviceAndDriverInstallation.HDEVINFO",
        "Windows.Win32.Devices.DeviceAndDriverInstallation.SP_DEVINFO_DATA*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "u8*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupConfigureWmiFromInfSectionA": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetupConfigureWmiFromInfSectionW": {
      "args": [
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    }
  }
};
export declare function open(): { "setupapi.dll": setupapiLibrary };
