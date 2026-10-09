export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export interface ntdllSymbols {
    "RtlAddGrowableFunctionTable": (...args: [Pointer, Pointer, number, number, number, number]) => number;
    "RtlAddGrowableFunctionTable": (...args: [Pointer, Pointer, number, number, number, number]) => number;
    "RtlGrowFunctionTable": (...args: [Pointer, number]) => void;
    "RtlDeleteGrowableFunctionTable": (...args: [Pointer]) => void;
    "RtlNtStatusToDosError": (...args: [number]) => number;
    "RtlNormalizeSecurityDescriptor": (...args: [Pointer, number, Pointer, Pointer, number]) => number;
    "RtlConvertSidToUnicodeString": (...args: [Pointer, Pointer, number]) => number;
    "RtlGetProductInfo": (...args: [number, number, number, number, Pointer]) => number;
    "RtlOsDeploymentState": (...args: [number]) => number;
    "RtlGetDeviceFamilyInfoEnum": (...args: [Pointer, Pointer, Pointer]) => void;
    "RtlConvertDeviceFamilyInfoToString": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RtlSwitchedVVI": (...args: [Pointer, number, bigint]) => number;
    "RtlIpv4AddressToStringA": (...args: [Pointer, Pointer]) => Pointer;
    "RtlIpv4AddressToStringExA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "RtlIpv4AddressToStringW": (...args: [Pointer, Pointer]) => Pointer;
    "RtlIpv4AddressToStringExW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "RtlIpv4StringToAddressA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "RtlIpv4StringToAddressExA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "RtlIpv4StringToAddressW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "RtlIpv4StringToAddressExW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "RtlIpv6AddressToStringA": (...args: [Pointer, Pointer]) => Pointer;
    "RtlIpv6AddressToStringExA": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "RtlIpv6AddressToStringW": (...args: [Pointer, Pointer]) => Pointer;
    "RtlIpv6AddressToStringExW": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "RtlIpv6StringToAddressA": (...args: [Pointer, Pointer, Pointer]) => number;
    "RtlIpv6StringToAddressExA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RtlIpv6StringToAddressW": (...args: [Pointer, Pointer, Pointer]) => number;
    "RtlIpv6StringToAddressExW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RtlEthernetAddressToStringA": (...args: [Pointer, Pointer]) => Pointer;
    "RtlEthernetAddressToStringW": (...args: [Pointer, Pointer]) => Pointer;
    "RtlEthernetStringToAddressA": (...args: [Pointer, Pointer, Pointer]) => number;
    "RtlEthernetStringToAddressW": (...args: [Pointer, Pointer, Pointer]) => number;
    "RtlInitializeCorrelationVector": (...args: [Pointer, number, Pointer]) => number;
    "RtlIncrementCorrelationVector": (...args: [Pointer]) => number;
    "RtlExtendCorrelationVector": (...args: [Pointer]) => number;
    "RtlValidateCorrelationVector": (...args: [Pointer]) => number;
    "RtlInitializeSListHead": (...args: [Pointer]) => void;
    "RtlFirstEntrySList": (...args: [Pointer]) => Pointer;
    "RtlInterlockedPopEntrySList": (...args: [Pointer]) => Pointer;
    "RtlInterlockedPushEntrySList": (...args: [Pointer, Pointer]) => Pointer;
    "RtlInterlockedPushListSListEx": (...args: [Pointer, Pointer, Pointer, number]) => Pointer;
    "RtlInterlockedFlushSList": (...args: [Pointer]) => Pointer;
    "RtlQueryDepthSList": (...args: [Pointer]) => number;
    "RtlCrc32": (...args: [Pointer, number, number]) => number;
    "RtlCrc64": (...args: [Pointer, number, bigint]) => bigint;
    "RtlIsZeroMemory": (...args: [Pointer, number]) => number;
    "RtlGetReturnAddressHijackTarget": (...args: []) => number;
    "RtlRaiseCustomSystemEventTrigger": (...args: [Pointer]) => number;
    "RtlIsNameLegalDOS8Dot3": (...args: [Pointer, Pointer, Pointer]) => number;
    "RtlLocalTimeToSystemTime": (...args: [Pointer, Pointer]) => number;
    "RtlTimeToSecondsSince1970": (...args: [Pointer, Pointer]) => number;
    "RtlFreeAnsiString": (...args: [Pointer]) => void;
    "RtlFreeUnicodeString": (...args: [Pointer]) => void;
    "RtlFreeOemString": (...args: [Pointer]) => void;
    "RtlInitString": (...args: [Pointer, Pointer]) => void;
    "RtlInitStringEx": (...args: [Pointer, Pointer]) => number;
    "RtlInitAnsiString": (...args: [Pointer, Pointer]) => void;
    "RtlInitAnsiStringEx": (...args: [Pointer, Pointer]) => number;
    "RtlInitUnicodeString": (...args: [Pointer, Pointer]) => void;
    "RtlAnsiStringToUnicodeString": (...args: [Pointer, Pointer, number]) => number;
    "RtlUnicodeStringToAnsiString": (...args: [Pointer, Pointer, number]) => number;
    "RtlUnicodeStringToOemString": (...args: [Pointer, Pointer, number]) => number;
    "RtlUnicodeToMultiByteSize": (...args: [Pointer, Pointer, number]) => number;
    "RtlCharToInteger": (...args: [Pointer, number, Pointer]) => number;
    "RtlUniform": (...args: [Pointer]) => number;
    "RtlGetNonVolatileToken": (...args: [Pointer, number, Pointer]) => number;
    "RtlFreeNonVolatileToken": (...args: [Pointer]) => number;
    "RtlFlushNonVolatileMemory": (...args: [Pointer, Pointer, number, number]) => number;
    "RtlDrainNonVolatileFlush": (...args: [Pointer]) => number;
    "RtlWriteNonVolatileMemory": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "RtlFillNonVolatileMemory": (...args: [Pointer, Pointer, number, number, number]) => number;
    "RtlFlushNonVolatileMemoryRanges": (...args: [Pointer, Pointer, number, number]) => number;
    "RtlIpv4AddressToString": (...args: [Pointer, Pointer]) => Pointer;
    "RtlIpv4AddressToStringEx": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "RtlIpv4StringToAddress": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "RtlIpv4StringToAddressEx": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "RtlIpv6AddressToString": (...args: [Pointer, Pointer]) => Pointer;
    "RtlIpv6AddressToStringEx": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "RtlIpv6StringToAddress": (...args: [Pointer, Pointer, Pointer]) => number;
    "RtlIpv6StringToAddressEx": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RtlEthernetAddressToString": (...args: [Pointer, Pointer]) => Pointer;
    "RtlEthernetStringToAddress": (...args: [Pointer, Pointer, Pointer]) => number;
}
export interface ntdllLibrary { readonly symbols: ntdllSymbols; close(): void; }
export declare const structs: {
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
};
export declare const enums: {
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
};
export declare const wideAliases: {
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
};
export declare const signatures: {
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
};
export declare function open(): { "ntdll.dll": ntdllLibrary };
