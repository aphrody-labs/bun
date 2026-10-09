import { dlopen, FFIType } from "bun:ffi";

export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export const structs = {
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
} as const;
export const enums = {
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
} as const;
export const wideAliases = {
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
} as const;
export const signatures = {
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
} as const;
const libraries = {
  "setupapi.dll": {
    "SetupGetInfInformationA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetInfInformationW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueryInfFileInformationA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueryInfFileInformationW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueryInfOriginalFileInformationA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueryInfOriginalFileInformationW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueryInfVersionInformationA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueryInfVersionInformationW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetInfDriverStoreLocationA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetInfDriverStoreLocationW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetInfPublishedNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetInfPublishedNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetInfFileListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetInfFileListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupOpenInfFileW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupOpenInfFileA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupOpenMasterInf": {
      "args": [],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupOpenAppendInfFileW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupOpenAppendInfFileA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupCloseInfFile": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetupFindFirstLineA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupFindFirstLineW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupFindNextLine": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupFindNextMatchLineA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupFindNextMatchLineW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetLineByIndexA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetLineByIndexW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetLineCountA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetLineCountW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetLineTextA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetLineTextW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetFieldCount": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupGetStringFieldA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetStringFieldW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetIntField": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetMultiSzFieldA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetMultiSzFieldW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetBinaryField": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetFileCompressionInfoA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupGetFileCompressionInfoW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupGetFileCompressionInfoExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetFileCompressionInfoExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDecompressOrCopyFileA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupDecompressOrCopyFileW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupGetSourceFileLocationA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetSourceFileLocationW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetSourceFileSizeA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetSourceFileSizeW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetTargetPathA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetTargetPathW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetSourceListA": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetSourceListW": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupCancelTemporarySourceList": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupAddToSourceListA": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupAddToSourceListW": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupRemoveFromSourceListA": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupRemoveFromSourceListW": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQuerySourceListA": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQuerySourceListW": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupFreeSourceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupFreeSourceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupPromptForDiskA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupPromptForDiskW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupCopyErrorA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupCopyErrorW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupRenameErrorA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupRenameErrorW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupDeleteErrorA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupDeleteErrorW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupBackupErrorA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupBackupErrorW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupSetDirectoryIdA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetDirectoryIdW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetDirectoryIdExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetDirectoryIdExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetSourceInfoA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetSourceInfoW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallFileA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallFileW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallFileExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallFileExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupOpenFileQueue": {
      "args": [],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupCloseFileQueue": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetFileQueueAlternatePlatformA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetFileQueueAlternatePlatformW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetPlatformPathOverrideA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetPlatformPathOverrideW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueCopyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueCopyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueCopyIndirectA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueCopyIndirectW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueDefaultCopyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueDefaultCopyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueCopySectionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueCopySectionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueDeleteA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueDeleteW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueDeleteSectionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueDeleteSectionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueRenameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueRenameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueRenameSectionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueueRenameSectionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupCommitFileQueueA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupCommitFileQueueW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupScanFileQueueA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupScanFileQueueW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetFileQueueCount": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetFileQueueFlags": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetFileQueueFlags": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupCopyOEMInfA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupCopyOEMInfW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupUninstallOEMInfA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupUninstallOEMInfW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupUninstallNewlyCopiedInfs": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupCreateDiskSpaceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupCreateDiskSpaceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDuplicateDiskSpaceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDuplicateDiskSpaceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDestroyDiskSpaceList": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueryDrivesInDiskSpaceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueryDrivesInDiskSpaceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQuerySpaceRequiredOnDriveA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQuerySpaceRequiredOnDriveW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupAdjustDiskSpaceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i64",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupAdjustDiskSpaceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i64",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupAddToDiskSpaceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i64",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupAddToDiskSpaceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i64",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupAddSectionToDiskSpaceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupAddSectionToDiskSpaceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupAddInstallSectionToDiskSpaceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupAddInstallSectionToDiskSpaceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupRemoveFromDiskSpaceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupRemoveFromDiskSpaceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupRemoveSectionFromDiskSpaceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupRemoveSectionFromDiskSpaceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupRemoveInstallSectionFromDiskSpaceListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupRemoveInstallSectionFromDiskSpaceListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupIterateCabinetA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupIterateCabinetW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupPromptReboot": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInitDefaultQueueCallback": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupInitDefaultQueueCallbackEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupTermDefaultQueueCallback": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetupDefaultQueueCallbackA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.usize",
        "FFIType.usize"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupDefaultQueueCallbackW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.usize",
        "FFIType.usize"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetupInstallFromInfSectionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallFromInfSectionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallFilesFromInfSectionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallFilesFromInfSectionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallServicesFromInfSectionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallServicesFromInfSectionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallServicesFromInfSectionExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupInstallServicesFromInfSectionExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "InstallHinfSectionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "InstallHinfSectionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetupInitializeFileLogA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupInitializeFileLogW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupTerminateFileLog": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupLogFileA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupLogFileW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupRemoveFileLogEntryA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupRemoveFileLogEntryW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueryFileLogA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupQueryFileLogW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupOpenLog": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupLogErrorA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupLogErrorW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupCloseLog": {
      "args": [],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetupGetThreadLogToken": {
      "args": [],
      "returns": "FFIType.u64",
      "setLastError": false
    },
    "SetupSetThreadLogToken": {
      "args": [
        "FFIType.u64"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetupWriteTextLog": {
      "args": [
        "FFIType.u64",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetupWriteTextLogError": {
      "args": [
        "FFIType.u64",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetupWriteTextLogInfLine": {
      "args": [
        "FFIType.u64",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetupGetBackupInformationA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetBackupInformationW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupPrepareQueueForRestoreA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupPrepareQueueForRestoreW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupSetNonInteractiveMode": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupGetNonInteractiveMode": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiCreateDeviceInfoList": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.isize",
      "setLastError": false
    },
    "SetupDiCreateDeviceInfoListExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.isize",
      "setLastError": false
    },
    "SetupDiCreateDeviceInfoListExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.isize",
      "setLastError": false
    },
    "SetupDiGetDeviceInfoListClass": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInfoListDetailA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInfoListDetailW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiCreateDeviceInfoA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiCreateDeviceInfoW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiOpenDeviceInfoA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiOpenDeviceInfoW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInstanceIdA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInstanceIdW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiDeleteDeviceInfo": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiEnumDeviceInfo": {
      "args": [
        "FFIType.isize",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiDestroyDeviceInfoList": {
      "args": [
        "FFIType.isize"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiEnumDeviceInterfaces": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiCreateDeviceInterfaceA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiCreateDeviceInterfaceW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiOpenDeviceInterfaceA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiOpenDeviceInterfaceW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInterfaceAlias": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiDeleteDeviceInterfaceData": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiRemoveDeviceInterface": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInterfaceDetailA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInterfaceDetailW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiInstallDeviceInterfaces": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetDeviceInterfaceDefault": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiRegisterDeviceInfo": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiBuildDriverInfoList": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiCancelDriverInfoSearch": {
      "args": [
        "FFIType.isize"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiEnumDriverInfoA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiEnumDriverInfoW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetSelectedDriverA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetSelectedDriverW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetSelectedDriverA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetSelectedDriverW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDriverInfoDetailA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDriverInfoDetailW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiDestroyDriverInfoList": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassDevsA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.isize",
      "setLastError": false
    },
    "SetupDiGetClassDevsW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.isize",
      "setLastError": false
    },
    "SetupDiGetClassDevsExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.isize",
      "setLastError": false
    },
    "SetupDiGetClassDevsExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.isize",
      "setLastError": false
    },
    "SetupDiGetINFClassA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetINFClassW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiBuildClassInfoList": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiBuildClassInfoListExA": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiBuildClassInfoListExW": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassDescriptionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassDescriptionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassDescriptionExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassDescriptionExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiCallClassInstaller": {
      "args": [
        "FFIType.u32",
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSelectDevice": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSelectBestCompatDrv": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiInstallDevice": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiInstallDriverFiles": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiRegisterCoDeviceInstallers": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiRemoveDevice": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiUnremoveDevice": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiRestartDevices": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiChangeState": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiInstallClassA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiInstallClassW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiInstallClassExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiInstallClassExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiOpenClassRegKey": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDiOpenClassRegKeyExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDiOpenClassRegKeyExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDiCreateDeviceInterfaceRegKeyA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDiCreateDeviceInterfaceRegKeyW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDiOpenDeviceInterfaceRegKey": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDiDeleteDeviceInterfaceRegKey": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiCreateDevRegKeyA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDiCreateDevRegKeyW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDiOpenDevRegKey": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDiDeleteDevRegKey": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetHwProfileList": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetHwProfileListExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetHwProfileListExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDevicePropertyKeys": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDevicePropertyW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetDevicePropertyW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInterfacePropertyKeys": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInterfacePropertyW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetDeviceInterfacePropertyW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassPropertyKeys": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassPropertyKeysExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassPropertyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassPropertyExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetClassPropertyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetClassPropertyExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceRegistryPropertyA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceRegistryPropertyW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassRegistryPropertyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassRegistryPropertyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetDeviceRegistryPropertyA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetDeviceRegistryPropertyW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetClassRegistryPropertyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetClassRegistryPropertyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInstallParamsA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDeviceInstallParamsW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassInstallParamsA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassInstallParamsW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetDeviceInstallParamsA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetDeviceInstallParamsW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetClassInstallParamsA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetClassInstallParamsW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDriverInstallParamsA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetDriverInstallParamsW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetDriverInstallParamsA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetDriverInstallParamsW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiLoadClassIcon": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiLoadDeviceIcon": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiDrawMiniIcon": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassBitmapIndex": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassImageList": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassImageListExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassImageListExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassImageIndex": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiDestroyClassImageList": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassDevPropertySheetsA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetClassDevPropertySheetsW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiAskForOEMDisk": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSelectOEMDrv": {
      "args": [
        "FFIType.ptr",
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiClassNameFromGuidA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiClassNameFromGuidW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiClassNameFromGuidExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiClassNameFromGuidExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiClassGuidsFromNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiClassGuidsFromNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiClassGuidsFromNameExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiClassGuidsFromNameExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetHwProfileFriendlyNameA": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetHwProfileFriendlyNameW": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetHwProfileFriendlyNameExA": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetHwProfileFriendlyNameExW": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetWizardPage": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetupDiGetSelectedDevice": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiSetSelectedDevice": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetActualModelsSectionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetActualModelsSectionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetActualSectionToInstallA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetActualSectionToInstallW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetActualSectionToInstallExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetActualSectionToInstallExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupEnumInfSectionsA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupEnumInfSectionsW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupVerifyInfFileA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupVerifyInfFileW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetCustomDevicePropertyA": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupDiGetCustomDevicePropertyW": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupConfigureWmiFromInfSectionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetupConfigureWmiFromInfSectionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    }
  }
} as const;
const defaults = {
  "setupapi.dll": {
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
  }
} as const;

export function open() {
  const result: Record<string, unknown> = {};
  for (const [dll, symbols] of Object.entries(libraries)) {
    const library = dlopen(dll, symbols as any);
    const defaultSymbols = { ...library.symbols };
    for (const [alias, wide] of Object.entries(defaults[dll as keyof typeof defaults] ?? {})) defaultSymbols[alias] = defaultSymbols[wide];
    result[dll] = { ...library, symbols: defaultSymbols };
  }
  return result as { "setupapi.dll": setupapiLibrary };
}
