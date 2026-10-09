import { dlopen, FFIType } from "bun:ffi";

export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export const structs = {
  "UNICODE_STRING": {
    "size": 16,
    "fields": [
      {
        "name": "Length",
        "offset": 0,
        "type": "u16"
      },
      {
        "name": "MaximumLength",
        "offset": 2,
        "type": "u16"
      },
      {
        "name": "Buffer",
        "offset": 8,
        "type": "Windows.Win32.Foundation.PWSTR"
      }
    ]
  },
  "IO_STATUS_BLOCK": {
    "size": 16,
    "fields": [
      {
        "name": "Anonymous",
        "offset": 0,
        "type": "_Anonymous_e__Union"
      },
      {
        "name": "Information",
        "offset": 8,
        "type": "usize"
      }
    ]
  }
} as const;
export const enums = {
  "DEVICEFAMILYINFOENUM": {
    "DEVICEFAMILYINFOENUM_UAP": 0,
    "DEVICEFAMILYINFOENUM_WINDOWS_8X": 1,
    "DEVICEFAMILYINFOENUM_WINDOWS_PHONE_8X": 2,
    "DEVICEFAMILYINFOENUM_DESKTOP": 3,
    "DEVICEFAMILYINFOENUM_MOBILE": 4,
    "DEVICEFAMILYINFOENUM_XBOX": 5,
    "DEVICEFAMILYINFOENUM_TEAM": 6,
    "DEVICEFAMILYINFOENUM_IOT": 7,
    "DEVICEFAMILYINFOENUM_IOT_HEADLESS": 8,
    "DEVICEFAMILYINFOENUM_SERVER": 9,
    "DEVICEFAMILYINFOENUM_HOLOGRAPHIC": 10,
    "DEVICEFAMILYINFOENUM_XBOXSRA": 11,
    "DEVICEFAMILYINFOENUM_XBOXERA": 12,
    "DEVICEFAMILYINFOENUM_SERVER_NANO": 13,
    "DEVICEFAMILYINFOENUM_8828080": 14,
    "DEVICEFAMILYINFOENUM_7067329": 15,
    "DEVICEFAMILYINFOENUM_WINDOWS_CORE": 16,
    "DEVICEFAMILYINFOENUM_WINDOWS_CORE_HEADLESS": 17,
    "DEVICEFAMILYINFOENUM_MAX": 17
  },
  "DEVICEFAMILYDEVICEFORM": {
    "DEVICEFAMILYDEVICEFORM_UNKNOWN": 0,
    "DEVICEFAMILYDEVICEFORM_PHONE": 1,
    "DEVICEFAMILYDEVICEFORM_TABLET": 2,
    "DEVICEFAMILYDEVICEFORM_DESKTOP": 3,
    "DEVICEFAMILYDEVICEFORM_NOTEBOOK": 4,
    "DEVICEFAMILYDEVICEFORM_CONVERTIBLE": 5,
    "DEVICEFAMILYDEVICEFORM_DETACHABLE": 6,
    "DEVICEFAMILYDEVICEFORM_ALLINONE": 7,
    "DEVICEFAMILYDEVICEFORM_STICKPC": 8,
    "DEVICEFAMILYDEVICEFORM_PUCK": 9,
    "DEVICEFAMILYDEVICEFORM_LARGESCREEN": 10,
    "DEVICEFAMILYDEVICEFORM_HMD": 11,
    "DEVICEFAMILYDEVICEFORM_INDUSTRY_HANDHELD": 12,
    "DEVICEFAMILYDEVICEFORM_INDUSTRY_TABLET": 13,
    "DEVICEFAMILYDEVICEFORM_BANKING": 14,
    "DEVICEFAMILYDEVICEFORM_BUILDING_AUTOMATION": 15,
    "DEVICEFAMILYDEVICEFORM_DIGITAL_SIGNAGE": 16,
    "DEVICEFAMILYDEVICEFORM_GAMING": 17,
    "DEVICEFAMILYDEVICEFORM_HOME_AUTOMATION": 18,
    "DEVICEFAMILYDEVICEFORM_INDUSTRIAL_AUTOMATION": 19,
    "DEVICEFAMILYDEVICEFORM_KIOSK": 20,
    "DEVICEFAMILYDEVICEFORM_MAKER_BOARD": 21,
    "DEVICEFAMILYDEVICEFORM_MEDICAL": 22,
    "DEVICEFAMILYDEVICEFORM_NETWORKING": 23,
    "DEVICEFAMILYDEVICEFORM_POINT_OF_SERVICE": 24,
    "DEVICEFAMILYDEVICEFORM_PRINTING": 25,
    "DEVICEFAMILYDEVICEFORM_THIN_CLIENT": 26,
    "DEVICEFAMILYDEVICEFORM_TOY": 27,
    "DEVICEFAMILYDEVICEFORM_VENDING": 28,
    "DEVICEFAMILYDEVICEFORM_INDUSTRY_OTHER": 29,
    "DEVICEFAMILYDEVICEFORM_XBOX_ONE": 30,
    "DEVICEFAMILYDEVICEFORM_XBOX_ONE_S": 31,
    "DEVICEFAMILYDEVICEFORM_XBOX_ONE_X": 32,
    "DEVICEFAMILYDEVICEFORM_XBOX_ONE_X_DEVKIT": 33,
    "DEVICEFAMILYDEVICEFORM_XBOX_SERIES_X": 34,
    "DEVICEFAMILYDEVICEFORM_XBOX_SERIES_X_DEVKIT": 35,
    "DEVICEFAMILYDEVICEFORM_XBOX_SERIES_S": 36,
    "DEVICEFAMILYDEVICEFORM_XBOX_RESERVED_01": 37,
    "DEVICEFAMILYDEVICEFORM_XBOX_RESERVED_02": 38,
    "DEVICEFAMILYDEVICEFORM_XBOX_RESERVED_03": 39,
    "DEVICEFAMILYDEVICEFORM_XBOX_RESERVED_04": 40,
    "DEVICEFAMILYDEVICEFORM_XBOX_RESERVED_05": 41,
    "DEVICEFAMILYDEVICEFORM_XBOX_RESERVED_06": 42,
    "DEVICEFAMILYDEVICEFORM_XBOX_RESERVED_07": 43,
    "DEVICEFAMILYDEVICEFORM_XBOX_RESERVED_08": 44,
    "DEVICEFAMILYDEVICEFORM_XBOX_RESERVED_09": 45,
    "DEVICEFAMILYDEVICEFORM_GAMING_HANDHELD": 46,
    "DEVICEFAMILYDEVICEFORM_GAMING_CONSOLE": 47,
    "DEVICEFAMILYDEVICEFORM_MAX": 47
  },
  "OS_DEPLOYEMENT_STATE_VALUES": {
    "OS_DEPLOYMENT_STANDARD": 1,
    "OS_DEPLOYMENT_COMPACT": 2
  }
} as const;
export const wideAliases = {
  "RtlIpv4AddressToString": "RtlIpv4AddressToStringW",
  "RtlIpv4AddressToStringEx": "RtlIpv4AddressToStringExW",
  "RtlIpv4StringToAddress": "RtlIpv4StringToAddressW",
  "RtlIpv4StringToAddressEx": "RtlIpv4StringToAddressExW",
  "RtlIpv6AddressToString": "RtlIpv6AddressToStringW",
  "RtlIpv6AddressToStringEx": "RtlIpv6AddressToStringExW",
  "RtlIpv6StringToAddress": "RtlIpv6StringToAddressW",
  "RtlIpv6StringToAddressEx": "RtlIpv6StringToAddressExW",
  "RtlEthernetAddressToString": "RtlEthernetAddressToStringW",
  "RtlEthernetStringToAddress": "RtlEthernetStringToAddressW"
} as const;
export const signatures = {
  "ntdll.dll": {
    "RtlAddGrowableFunctionTable": {
      "args": [
        "void**",
        "Windows.Win32.System.Diagnostics.Debug.IMAGE_RUNTIME_FUNCTION_ENTRY*",
        "u32",
        "u32",
        "usize",
        "usize"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlGrowFunctionTable": {
      "args": [
        "void*",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlDeleteGrowableFunctionTable": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlNtStatusToDosError": {
      "args": [
        "Windows.Win32.Foundation.NTSTATUS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlNormalizeSecurityDescriptor": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*",
        "u32",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*",
        "u32*",
        "Windows.Win32.Foundation.BOOLEAN"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "RtlConvertSidToUnicodeString": {
      "args": [
        "Windows.Win32.Foundation.UNICODE_STRING*",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.BOOLEAN"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "RtlGetProductInfo": {
      "args": [
        "u32",
        "u32",
        "u32",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "RtlOsDeploymentState": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.System.SystemInformation.OS_DEPLOYEMENT_STATE_VALUES",
      "setLastError": false
    },
    "RtlGetDeviceFamilyInfoEnum": {
      "args": [
        "u64*",
        "Windows.Win32.System.SystemInformation.DEVICEFAMILYINFOENUM*",
        "Windows.Win32.System.SystemInformation.DEVICEFAMILYDEVICEFORM*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlConvertDeviceFamilyInfoToString": {
      "args": [
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlSwitchedVVI": {
      "args": [
        "Windows.Win32.System.SystemInformation.OSVERSIONINFOEXW*",
        "u32",
        "u64"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlIpv4AddressToStringA": {
      "args": [
        "Windows.Win32.Networking.WinSock.IN_ADDR*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "RtlIpv4AddressToStringExA": {
      "args": [
        "Windows.Win32.Networking.WinSock.IN_ADDR*",
        "u16",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv4AddressToStringW": {
      "args": [
        "Windows.Win32.Networking.WinSock.IN_ADDR*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "RtlIpv4AddressToStringExW": {
      "args": [
        "Windows.Win32.Networking.WinSock.IN_ADDR*",
        "u16",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv4StringToAddressA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Foundation.PSTR*",
        "Windows.Win32.Networking.WinSock.IN_ADDR*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv4StringToAddressExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Networking.WinSock.IN_ADDR*",
        "u16*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv4StringToAddressW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Foundation.PWSTR*",
        "Windows.Win32.Networking.WinSock.IN_ADDR*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv4StringToAddressExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Networking.WinSock.IN_ADDR*",
        "u16*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv6AddressToStringA": {
      "args": [
        "Windows.Win32.Networking.WinSock.IN6_ADDR*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "RtlIpv6AddressToStringExA": {
      "args": [
        "Windows.Win32.Networking.WinSock.IN6_ADDR*",
        "u32",
        "u16",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv6AddressToStringW": {
      "args": [
        "Windows.Win32.Networking.WinSock.IN6_ADDR*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "RtlIpv6AddressToStringExW": {
      "args": [
        "Windows.Win32.Networking.WinSock.IN6_ADDR*",
        "u32",
        "u16",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv6StringToAddressA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR*",
        "Windows.Win32.Networking.WinSock.IN6_ADDR*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv6StringToAddressExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Networking.WinSock.IN6_ADDR*",
        "u32*",
        "u16*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv6StringToAddressW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR*",
        "Windows.Win32.Networking.WinSock.IN6_ADDR*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlIpv6StringToAddressExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Networking.WinSock.IN6_ADDR*",
        "u32*",
        "u16*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlEthernetAddressToStringA": {
      "args": [
        "Windows.Win32.Networking.WinSock.DL_EUI48*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "RtlEthernetAddressToStringW": {
      "args": [
        "Windows.Win32.Networking.WinSock.DL_EUI48*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "RtlEthernetStringToAddressA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR*",
        "Windows.Win32.Networking.WinSock.DL_EUI48*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlEthernetStringToAddressW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR*",
        "Windows.Win32.Networking.WinSock.DL_EUI48*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RtlInitializeCorrelationVector": {
      "args": [
        "Windows.Win32.System.CorrelationVector.CORRELATION_VECTOR*",
        "i32",
        "System.Guid*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlIncrementCorrelationVector": {
      "args": [
        "Windows.Win32.System.CorrelationVector.CORRELATION_VECTOR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlExtendCorrelationVector": {
      "args": [
        "Windows.Win32.System.CorrelationVector.CORRELATION_VECTOR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlValidateCorrelationVector": {
      "args": [
        "Windows.Win32.System.CorrelationVector.CORRELATION_VECTOR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlInitializeSListHead": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlFirstEntrySList": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*"
      ],
      "returns": "Windows.Win32.System.Kernel.SLIST_ENTRY*",
      "setLastError": false
    },
    "RtlInterlockedPopEntrySList": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*"
      ],
      "returns": "Windows.Win32.System.Kernel.SLIST_ENTRY*",
      "setLastError": false
    },
    "RtlInterlockedPushEntrySList": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*",
        "Windows.Win32.System.Kernel.SLIST_ENTRY*"
      ],
      "returns": "Windows.Win32.System.Kernel.SLIST_ENTRY*",
      "setLastError": false
    },
    "RtlInterlockedPushListSListEx": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*",
        "Windows.Win32.System.Kernel.SLIST_ENTRY*",
        "Windows.Win32.System.Kernel.SLIST_ENTRY*",
        "u32"
      ],
      "returns": "Windows.Win32.System.Kernel.SLIST_ENTRY*",
      "setLastError": false
    },
    "RtlInterlockedFlushSList": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*"
      ],
      "returns": "Windows.Win32.System.Kernel.SLIST_ENTRY*",
      "setLastError": false
    },
    "RtlQueryDepthSList": {
      "args": [
        "Windows.Win32.System.Kernel.SLIST_HEADER*"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "RtlCrc32": {
      "args": [
        "void*",
        "usize",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlCrc64": {
      "args": [
        "void*",
        "usize",
        "u64"
      ],
      "returns": "u64",
      "setLastError": false
    },
    "RtlIsZeroMemory": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "RtlGetReturnAddressHijackTarget": {
      "args": [],
      "returns": "usize",
      "setLastError": false
    },
    "RtlRaiseCustomSystemEventTrigger": {
      "args": [
        "Windows.Win32.System.WindowsProgramming.CUSTOM_SYSTEM_EVENT_TRIGGER_CONFIG*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlIsNameLegalDOS8Dot3": {
      "args": [
        "Windows.Win32.Foundation.UNICODE_STRING*",
        "Windows.Win32.System.Kernel.STRING*",
        "Windows.Win32.Foundation.BOOLEAN*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "RtlLocalTimeToSystemTime": {
      "args": [
        "i64*",
        "i64*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "RtlTimeToSecondsSince1970": {
      "args": [
        "i64*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "RtlFreeAnsiString": {
      "args": [
        "Windows.Win32.System.Kernel.STRING*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlFreeUnicodeString": {
      "args": [
        "Windows.Win32.Foundation.UNICODE_STRING*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlFreeOemString": {
      "args": [
        "Windows.Win32.System.Kernel.STRING*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlInitString": {
      "args": [
        "Windows.Win32.System.Kernel.STRING*",
        "i8*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlInitStringEx": {
      "args": [
        "Windows.Win32.System.Kernel.STRING*",
        "i8*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "RtlInitAnsiString": {
      "args": [
        "Windows.Win32.System.Kernel.STRING*",
        "i8*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlInitAnsiStringEx": {
      "args": [
        "Windows.Win32.System.Kernel.STRING*",
        "i8*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "RtlInitUnicodeString": {
      "args": [
        "Windows.Win32.Foundation.UNICODE_STRING*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RtlAnsiStringToUnicodeString": {
      "args": [
        "Windows.Win32.Foundation.UNICODE_STRING*",
        "Windows.Win32.System.Kernel.STRING*",
        "Windows.Win32.Foundation.BOOLEAN"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "RtlUnicodeStringToAnsiString": {
      "args": [
        "Windows.Win32.System.Kernel.STRING*",
        "Windows.Win32.Foundation.UNICODE_STRING*",
        "Windows.Win32.Foundation.BOOLEAN"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "RtlUnicodeStringToOemString": {
      "args": [
        "Windows.Win32.System.Kernel.STRING*",
        "Windows.Win32.Foundation.UNICODE_STRING*",
        "Windows.Win32.Foundation.BOOLEAN"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "RtlUnicodeToMultiByteSize": {
      "args": [
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "RtlCharToInteger": {
      "args": [
        "i8*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "RtlUniform": {
      "args": [
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlGetNonVolatileToken": {
      "args": [
        "void*",
        "usize",
        "void**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlFreeNonVolatileToken": {
      "args": [
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlFlushNonVolatileMemory": {
      "args": [
        "void*",
        "void*",
        "usize",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlDrainNonVolatileFlush": {
      "args": [
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlWriteNonVolatileMemory": {
      "args": [
        "void*",
        "void*",
        "void*",
        "usize",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlFillNonVolatileMemory": {
      "args": [
        "void*",
        "void*",
        "usize",
        "u8",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RtlFlushNonVolatileMemoryRanges": {
      "args": [
        "void*",
        "Windows.Win32.System.Memory.NonVolatile.NV_MEMORY_RANGE*",
        "usize",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    }
  }
} as const;
const libraries = {
  "ntdll.dll": {
    "RtlAddGrowableFunctionTable": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.usize",
        "FFIType.usize"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlGrowFunctionTable": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RtlDeleteGrowableFunctionTable": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RtlNtStatusToDosError": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlNormalizeSecurityDescriptor": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "RtlConvertSidToUnicodeString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlGetProductInfo": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "RtlOsDeploymentState": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlGetDeviceFamilyInfoEnum": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RtlConvertDeviceFamilyInfoToString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlSwitchedVVI": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u64"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlIpv4AddressToStringA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlIpv4AddressToStringExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv4AddressToStringW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlIpv4AddressToStringExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv4StringToAddressA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv4StringToAddressExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv4StringToAddressW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv4StringToAddressExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv6AddressToStringA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlIpv6AddressToStringExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv6AddressToStringW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlIpv6AddressToStringExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv6StringToAddressA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv6StringToAddressExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv6StringToAddressW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlIpv6StringToAddressExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlEthernetAddressToStringA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlEthernetAddressToStringW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlEthernetStringToAddressA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlEthernetStringToAddressW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlInitializeCorrelationVector": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlIncrementCorrelationVector": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlExtendCorrelationVector": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlValidateCorrelationVector": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlInitializeSListHead": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RtlFirstEntrySList": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlInterlockedPopEntrySList": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlInterlockedPushEntrySList": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlInterlockedPushListSListEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlInterlockedFlushSList": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RtlQueryDepthSList": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u16",
      "setLastError": false
    },
    "RtlCrc32": {
      "args": [
        "FFIType.ptr",
        "FFIType.usize",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlCrc64": {
      "args": [
        "FFIType.ptr",
        "FFIType.usize",
        "FFIType.u64"
      ],
      "returns": "FFIType.u64",
      "setLastError": false
    },
    "RtlIsZeroMemory": {
      "args": [
        "FFIType.ptr",
        "FFIType.usize"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "RtlGetReturnAddressHijackTarget": {
      "args": [],
      "returns": "FFIType.usize",
      "setLastError": false
    },
    "RtlRaiseCustomSystemEventTrigger": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlIsNameLegalDOS8Dot3": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "RtlLocalTimeToSystemTime": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlTimeToSecondsSince1970": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "RtlFreeAnsiString": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RtlFreeUnicodeString": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RtlFreeOemString": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RtlInitString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RtlInitStringEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlInitAnsiString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RtlInitAnsiStringEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlInitUnicodeString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RtlAnsiStringToUnicodeString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlUnicodeStringToAnsiString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlUnicodeStringToOemString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlUnicodeToMultiByteSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlCharToInteger": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RtlUniform": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlGetNonVolatileToken": {
      "args": [
        "FFIType.ptr",
        "FFIType.usize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlFreeNonVolatileToken": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlFlushNonVolatileMemory": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.usize",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlDrainNonVolatileFlush": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlWriteNonVolatileMemory": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.usize",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlFillNonVolatileMemory": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.usize",
        "FFIType.u8",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RtlFlushNonVolatileMemoryRanges": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.usize",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    }
  }
} as const;
const defaults = {
  "ntdll.dll": {
    "RtlIpv4AddressToString": "RtlIpv4AddressToStringW",
    "RtlIpv4AddressToStringEx": "RtlIpv4AddressToStringExW",
    "RtlIpv4StringToAddress": "RtlIpv4StringToAddressW",
    "RtlIpv4StringToAddressEx": "RtlIpv4StringToAddressExW",
    "RtlIpv6AddressToString": "RtlIpv6AddressToStringW",
    "RtlIpv6AddressToStringEx": "RtlIpv6AddressToStringExW",
    "RtlIpv6StringToAddress": "RtlIpv6StringToAddressW",
    "RtlIpv6StringToAddressEx": "RtlIpv6StringToAddressExW",
    "RtlEthernetAddressToString": "RtlEthernetAddressToStringW",
    "RtlEthernetStringToAddress": "RtlEthernetStringToAddressW"
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
  return result as { "ntdll.dll": ntdllLibrary };
}
