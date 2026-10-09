import { dlopen, FFIType } from "bun:ffi";

export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export const structs = {
  "STATSTG": {
    "size": 80,
    "fields": [
      {
        "name": "pwcsName",
        "offset": 0,
        "type": "Windows.Win32.Foundation.PWSTR"
      },
      {
        "name": "type",
        "offset": 8,
        "type": "u32"
      },
      {
        "name": "cbSize",
        "offset": 16,
        "type": "u64"
      },
      {
        "name": "mtime",
        "offset": 24,
        "type": "Windows.Win32.Foundation.FILETIME"
      },
      {
        "name": "ctime",
        "offset": 32,
        "type": "Windows.Win32.Foundation.FILETIME"
      },
      {
        "name": "atime",
        "offset": 40,
        "type": "Windows.Win32.Foundation.FILETIME"
      },
      {
        "name": "grfMode",
        "offset": 48,
        "type": "Windows.Win32.System.Com.STGM"
      },
      {
        "name": "grfLocksSupported",
        "offset": 52,
        "type": "u32"
      },
      {
        "name": "clsid",
        "offset": 56,
        "type": "System.Guid"
      },
      {
        "name": "grfStateBits",
        "offset": 72,
        "type": "u32"
      },
      {
        "name": "reserved",
        "offset": 76,
        "type": "u32"
      }
    ]
  }
} as const;
export const enums = {
  "RPC_C_AUTHN_LEVEL": {
    "RPC_C_AUTHN_LEVEL_DEFAULT": 0,
    "RPC_C_AUTHN_LEVEL_NONE": 1,
    "RPC_C_AUTHN_LEVEL_CONNECT": 2,
    "RPC_C_AUTHN_LEVEL_CALL": 3,
    "RPC_C_AUTHN_LEVEL_PKT": 4,
    "RPC_C_AUTHN_LEVEL_PKT_INTEGRITY": 5,
    "RPC_C_AUTHN_LEVEL_PKT_PRIVACY": 6
  },
  "RPC_C_IMP_LEVEL": {
    "RPC_C_IMP_LEVEL_DEFAULT": 0,
    "RPC_C_IMP_LEVEL_ANONYMOUS": 1,
    "RPC_C_IMP_LEVEL_IDENTIFY": 2,
    "RPC_C_IMP_LEVEL_IMPERSONATE": 3,
    "RPC_C_IMP_LEVEL_DELEGATE": 4
  },
  "STGFMT": {
    "STGFMT_STORAGE": 0,
    "STGFMT_NATIVE": 1,
    "STGFMT_FILE": 3,
    "STGFMT_ANY": 4,
    "STGFMT_DOCFILE": 5,
    "STGFMT_DOCUMENT": 0
  },
  "STGM": {
    "STGM_DIRECT": 0,
    "STGM_TRANSACTED": 65536,
    "STGM_SIMPLE": 134217728,
    "STGM_READ": 0,
    "STGM_WRITE": 1,
    "STGM_READWRITE": 2,
    "STGM_SHARE_DENY_NONE": 64,
    "STGM_SHARE_DENY_READ": 48,
    "STGM_SHARE_DENY_WRITE": 32,
    "STGM_SHARE_EXCLUSIVE": 16,
    "STGM_PRIORITY": 262144,
    "STGM_DELETEONRELEASE": 67108864,
    "STGM_NOSCRATCH": 1048576,
    "STGM_CREATE": 4096,
    "STGM_CONVERT": 131072,
    "STGM_FAILIFTHERE": 0,
    "STGM_NOSNAPSHOT": 2097152,
    "STGM_DIRECT_SWMR": 4194304
  },
  "GLOBAL_ALLOC_FLAGS": {
    "GHND": 66,
    "GMEM_FIXED": 0,
    "GMEM_MOVEABLE": 2,
    "GMEM_ZEROINIT": 64,
    "GPTR": 64
  },
  "CLIPBOARD_FORMAT": {
    "CF_TEXT": 1,
    "CF_BITMAP": 2,
    "CF_METAFILEPICT": 3,
    "CF_SYLK": 4,
    "CF_DIF": 5,
    "CF_TIFF": 6,
    "CF_OEMTEXT": 7,
    "CF_DIB": 8,
    "CF_PALETTE": 9,
    "CF_PENDATA": 10,
    "CF_RIFF": 11,
    "CF_WAVE": 12,
    "CF_UNICODETEXT": 13,
    "CF_ENHMETAFILE": 14,
    "CF_HDROP": 15,
    "CF_LOCALE": 16,
    "CF_DIBV5": 17,
    "CF_MAX": 18,
    "CF_OWNERDISPLAY": 128,
    "CF_DSPTEXT": 129,
    "CF_DSPBITMAP": 130,
    "CF_DSPMETAFILEPICT": 131,
    "CF_DSPENHMETAFILE": 142,
    "CF_PRIVATEFIRST": 512,
    "CF_PRIVATELAST": 767,
    "CF_GDIOBJFIRST": 768,
    "CF_GDIOBJLAST": 1023
  },
  "DROPEFFECT": {
    "DROPEFFECT_NONE": 0,
    "DROPEFFECT_COPY": 1,
    "DROPEFFECT_MOVE": 2,
    "DROPEFFECT_LINK": 4,
    "DROPEFFECT_SCROLL": 2147483648
  },
  "EMBDHLP_FLAGS": {
    "EMBDHLP_INPROC_HANDLER": 0,
    "EMBDHLP_INPROC_SERVER": 1,
    "EMBDHLP_CREATENOW": 0,
    "EMBDHLP_DELAYCREATE": 65536
  },
  "OLECREATE": {
    "OLECREATE_ZERO": 0,
    "OLECREATE_LEAVERUNNING": 1
  },
  "CLSCTX": {
    "CLSCTX_INPROC_SERVER": 1,
    "CLSCTX_INPROC_HANDLER": 2,
    "CLSCTX_LOCAL_SERVER": 4,
    "CLSCTX_INPROC_SERVER16": 8,
    "CLSCTX_REMOTE_SERVER": 16,
    "CLSCTX_INPROC_HANDLER16": 32,
    "CLSCTX_RESERVED1": 64,
    "CLSCTX_RESERVED2": 128,
    "CLSCTX_RESERVED3": 256,
    "CLSCTX_RESERVED4": 512,
    "CLSCTX_NO_CODE_DOWNLOAD": 1024,
    "CLSCTX_RESERVED5": 2048,
    "CLSCTX_NO_CUSTOM_MARSHAL": 4096,
    "CLSCTX_ENABLE_CODE_DOWNLOAD": 8192,
    "CLSCTX_NO_FAILURE_LOG": 16384,
    "CLSCTX_DISABLE_AAA": 32768,
    "CLSCTX_ENABLE_AAA": 65536,
    "CLSCTX_FROM_DEFAULT_CONTEXT": 131072,
    "CLSCTX_ACTIVATE_X86_SERVER": 262144,
    "CLSCTX_ACTIVATE_32_BIT_SERVER": 262144,
    "CLSCTX_ACTIVATE_64_BIT_SERVER": 524288,
    "CLSCTX_ENABLE_CLOAKING": 1048576,
    "CLSCTX_APPCONTAINER": 4194304,
    "CLSCTX_ACTIVATE_AAA_AS_IU": 8388608,
    "CLSCTX_RESERVED6": 16777216,
    "CLSCTX_ACTIVATE_ARM32_SERVER": 33554432,
    "CLSCTX_ALLOW_LOWER_TRUST_REGISTRATION": 67108864,
    "CLSCTX_SERVER_MUST_BE_EQUAL_OR_GREATER_PRIVILEGE": 134217728,
    "CLSCTX_DO_NOT_ELEVATE_SERVER": 268435456,
    "CLSCTX_PS_DLL": 2147483648,
    "CLSCTX_ALL": 23,
    "CLSCTX_SERVER": 21
  },
  "APTTYPEQUALIFIER": {
    "APTTYPEQUALIFIER_NONE": 0,
    "APTTYPEQUALIFIER_IMPLICIT_MTA": 1,
    "APTTYPEQUALIFIER_NA_ON_MTA": 2,
    "APTTYPEQUALIFIER_NA_ON_STA": 3,
    "APTTYPEQUALIFIER_NA_ON_IMPLICIT_MTA": 4,
    "APTTYPEQUALIFIER_NA_ON_MAINSTA": 5,
    "APTTYPEQUALIFIER_APPLICATION_STA": 6,
    "APTTYPEQUALIFIER_RESERVED_1": 7
  },
  "APTTYPE": {
    "APTTYPE_CURRENT": -1,
    "APTTYPE_STA": 0,
    "APTTYPE_MTA": 1,
    "APTTYPE_NA": 2,
    "APTTYPE_MAINSTA": 3
  },
  "COMSD": {
    "SD_LAUNCHPERMISSIONS": 0,
    "SD_ACCESSPERMISSIONS": 1,
    "SD_LAUNCHRESTRICTIONS": 2,
    "SD_ACCESSRESTRICTIONS": 3
  },
  "AgileReferenceOptions": {
    "AGILEREFERENCE_DEFAULT": 0,
    "AGILEREFERENCE_DELAYEDMARSHAL": 1
  }
} as const;
export const wideAliases = {} as const;
export const signatures = {
  "ole32.dll": {
    "CoRegisterMessageFilter": {
      "args": [
        "Windows.Win32.Media.Audio.IMessageFilter",
        "Windows.Win32.Media.Audio.IMessageFilter*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoBuildVersion": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "CoInitialize": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRegisterMallocSpy": {
      "args": [
        "Windows.Win32.System.Com.IMallocSpy"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRevokeMallocSpy": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRegisterInitializeSpy": {
      "args": [
        "Windows.Win32.System.Com.IInitializeSpy",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRevokeInitializeSpy": {
      "args": [
        "u64"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetSystemSecurityPermissions": {
      "args": [
        "Windows.Win32.System.Com.COMSD",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoLoadLibrary": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HINSTANCE",
      "setLastError": false
    },
    "CoFreeLibrary": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CoFreeAllLibraries": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "CoAllowSetForegroundWindow": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DcomChannelSetHResult": {
      "args": [
        "void*",
        "u32*",
        "Windows.Win32.Foundation.HRESULT"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoIsOle1Class": {
      "args": [
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CLSIDFromProgIDEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoFileTimeToDosDateTime": {
      "args": [
        "Windows.Win32.Foundation.FILETIME*",
        "u16*",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CoDosDateTimeToFileTime": {
      "args": [
        "u16",
        "u16",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CoFileTimeNow": {
      "args": [
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRegisterChannelHook": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IChannelHook"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoTreatAsClass": {
      "args": [
        "System.Guid*",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateDataAdviseHolder": {
      "args": [
        "Windows.Win32.System.Com.IDataAdviseHolder*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateDataCache": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "System.Guid*",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoInstall": {
      "args": [
        "Windows.Win32.System.Com.IBindCtx",
        "u32",
        "Windows.Win32.System.Com.uCLSSPEC*",
        "Windows.Win32.System.Com.QUERYCONTEXT*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "BindMoniker": {
      "args": [
        "Windows.Win32.System.Com.IMoniker",
        "u32",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetObject": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.BIND_OPTS*",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "MkParseDisplayName": {
      "args": [
        "Windows.Win32.System.Com.IBindCtx",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.System.Com.IMoniker*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "MonikerRelativePathTo": {
      "args": [
        "Windows.Win32.System.Com.IMoniker",
        "Windows.Win32.System.Com.IMoniker",
        "Windows.Win32.System.Com.IMoniker*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "MonikerCommonPrefixWith": {
      "args": [
        "Windows.Win32.System.Com.IMoniker",
        "Windows.Win32.System.Com.IMoniker",
        "Windows.Win32.System.Com.IMoniker*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateBindCtx": {
      "args": [
        "u32",
        "Windows.Win32.System.Com.IBindCtx*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateGenericComposite": {
      "args": [
        "Windows.Win32.System.Com.IMoniker",
        "Windows.Win32.System.Com.IMoniker",
        "Windows.Win32.System.Com.IMoniker*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetClassFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateClassMoniker": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IMoniker*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateFileMoniker": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.IMoniker*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateItemMoniker": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.IMoniker*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateAntiMoniker": {
      "args": [
        "Windows.Win32.System.Com.IMoniker*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreatePointerMoniker": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.IMoniker*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateObjrefMoniker": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.IMoniker*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetRunningObjectTable": {
      "args": [
        "u32",
        "Windows.Win32.System.Com.IRunningObjectTable*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateStdProgressIndicator": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.IBindStatusCallback",
        "Windows.Win32.System.Com.IBindStatusCallback*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetMalloc": {
      "args": [
        "u32",
        "Windows.Win32.System.Com.IMalloc*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoUninitialize": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "CoGetCurrentProcess": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "CoInitializeEx": {
      "args": [
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetCallerTID": {
      "args": [
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetCurrentLogicalThreadId": {
      "args": [
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetContextToken": {
      "args": [
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetApartmentType": {
      "args": [
        "Windows.Win32.System.Com.APTTYPE*",
        "Windows.Win32.System.Com.APTTYPEQUALIFIER*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoIncrementMTAUsage": {
      "args": [
        "Windows.Win32.System.Com.CO_MTA_USAGE_COOKIE*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoDecrementMTAUsage": {
      "args": [
        "Windows.Win32.System.Com.CO_MTA_USAGE_COOKIE"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoAllowUnmarshalerCLSID": {
      "args": [
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetObjectContext": {
      "args": [
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetClassObject": {
      "args": [
        "System.Guid*",
        "u32",
        "void*",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRegisterClassObject": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.CLSCTX",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRevokeClassObject": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoResumeClassObjects": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoSuspendClassObjects": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoAddRefServerProcess": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "CoReleaseServerProcess": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "CoGetPSClsid": {
      "args": [
        "System.Guid*",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRegisterPSClsid": {
      "args": [
        "System.Guid*",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRegisterSurrogate": {
      "args": [
        "Windows.Win32.System.Com.ISurrogate"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoDisconnectObject": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoLockObjectExternal": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoIsHandlerConnected": {
      "args": [
        "Windows.Win32.System.Com.IUnknown"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CoCreateFreeThreadedMarshaler": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.IUnknown*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoFreeUnusedLibraries": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "CoFreeUnusedLibrariesEx": {
      "args": [
        "u32",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CoDisconnectContext": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoInitializeSecurity": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "i32",
        "Windows.Win32.System.Com.SOLE_AUTHENTICATION_SERVICE*",
        "void*",
        "Windows.Win32.System.Com.RPC_C_AUTHN_LEVEL",
        "Windows.Win32.System.Com.RPC_C_IMP_LEVEL",
        "void*",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetCallContext": {
      "args": [
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoQueryProxyBlanket": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR*",
        "u32*",
        "u32*",
        "void**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoSetProxyBlanket": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.RPC_C_AUTHN_LEVEL",
        "Windows.Win32.System.Com.RPC_C_IMP_LEVEL",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoCopyProxy": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.IUnknown*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoQueryClientBlanket": {
      "args": [
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR*",
        "u32*",
        "u32*",
        "void**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoImpersonateClient": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRevertToSelf": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoQueryAuthenticationServices": {
      "args": [
        "u32*",
        "Windows.Win32.System.Com.SOLE_AUTHENTICATION_SERVICE**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoSwitchCallContext": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.IUnknown*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoCreateInstance": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.CLSCTX",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoCreateInstanceEx": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.CLSCTX",
        "Windows.Win32.System.Com.COSERVERINFO*",
        "u32",
        "Windows.Win32.System.Com.MULTI_QI*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoCreateInstanceFromApp": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.CLSCTX",
        "void*",
        "u32",
        "Windows.Win32.System.Com.MULTI_QI*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRegisterActivationFilter": {
      "args": [
        "Windows.Win32.System.Com.IActivationFilter"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetCancelObject": {
      "args": [
        "u32",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoSetCancelObject": {
      "args": [
        "Windows.Win32.System.Com.IUnknown"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoCancelCall": {
      "args": [
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoTestCancel": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoEnableCallCancellation": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoDisableCallCancellation": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StringFromCLSID": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CLSIDFromString": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StringFromIID": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "IIDFromString": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ProgIDFromCLSID": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CLSIDFromProgID": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StringFromGUID2": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "CoCreateGuid": {
      "args": [
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoWaitForMultipleHandles": {
      "args": [
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Foundation.HANDLE*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoWaitForMultipleObjects": {
      "args": [
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Foundation.HANDLE*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetTreatAsClass": {
      "args": [
        "System.Guid*",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoInvalidateRemoteMachineBindings": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoTaskMemAlloc": {
      "args": [
        "usize"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "CoTaskMemRealloc": {
      "args": [
        "void*",
        "usize"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "CoTaskMemFree": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CoRegisterDeviceCatalog": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.CO_DEVICE_CATALOG_COOKIE*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoRevokeDeviceCatalog": {
      "args": [
        "Windows.Win32.System.Com.CO_DEVICE_CATALOG_COOKIE"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleBuildVersion": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "OleInitialize": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleUninitialize": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "OleQueryLinkFromData": {
      "args": [
        "Windows.Win32.System.Com.IDataObject"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleQueryCreateFromData": {
      "args": [
        "Windows.Win32.System.Com.IDataObject"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreate": {
      "args": [
        "System.Guid*",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateEx": {
      "args": [
        "System.Guid*",
        "System.Guid*",
        "Windows.Win32.System.Ole.OLECREATE",
        "u32",
        "u32",
        "u32*",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Com.IAdviseSink",
        "u32*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateFromData": {
      "args": [
        "Windows.Win32.System.Com.IDataObject",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateFromDataEx": {
      "args": [
        "Windows.Win32.System.Com.IDataObject",
        "System.Guid*",
        "Windows.Win32.System.Ole.OLECREATE",
        "u32",
        "u32",
        "u32*",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Com.IAdviseSink",
        "u32*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateLinkFromData": {
      "args": [
        "Windows.Win32.System.Com.IDataObject",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateLinkFromDataEx": {
      "args": [
        "Windows.Win32.System.Com.IDataObject",
        "System.Guid*",
        "Windows.Win32.System.Ole.OLECREATE",
        "u32",
        "u32",
        "u32*",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Com.IAdviseSink",
        "u32*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateStaticFromData": {
      "args": [
        "Windows.Win32.System.Com.IDataObject",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateLink": {
      "args": [
        "Windows.Win32.System.Com.IMoniker",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateLinkEx": {
      "args": [
        "Windows.Win32.System.Com.IMoniker",
        "System.Guid*",
        "Windows.Win32.System.Ole.OLECREATE",
        "u32",
        "u32",
        "u32*",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Com.IAdviseSink",
        "u32*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateLinkToFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateLinkToFileEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "Windows.Win32.System.Ole.OLECREATE",
        "u32",
        "u32",
        "u32*",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Com.IAdviseSink",
        "u32*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateFromFile": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateFromFileEx": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "Windows.Win32.System.Ole.OLECREATE",
        "u32",
        "u32",
        "u32*",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Com.IAdviseSink",
        "u32*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleLoad": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "System.Guid*",
        "Windows.Win32.System.Ole.IOleClientSite",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleSave": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IPersistStorage",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleLoadFromStream": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleSaveToStream": {
      "args": [
        "Windows.Win32.System.Com.IPersistStream",
        "Windows.Win32.System.Com.IStream"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleSetContainedObject": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleNoteObjectVisible": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "RegisterDragDrop": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.System.Ole.IDropTarget"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "RevokeDragDrop": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DoDragDrop": {
      "args": [
        "Windows.Win32.System.Com.IDataObject",
        "Windows.Win32.System.Ole.IDropSource",
        "Windows.Win32.System.Ole.DROPEFFECT",
        "Windows.Win32.System.Ole.DROPEFFECT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleSetClipboard": {
      "args": [
        "Windows.Win32.System.Com.IDataObject"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleGetClipboard": {
      "args": [
        "Windows.Win32.System.Com.IDataObject*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleGetClipboardWithEnterpriseInfo": {
      "args": [
        "Windows.Win32.System.Com.IDataObject*",
        "Windows.Win32.Foundation.PWSTR*",
        "Windows.Win32.Foundation.PWSTR*",
        "Windows.Win32.Foundation.PWSTR*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleFlushClipboard": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleIsCurrentClipboard": {
      "args": [
        "Windows.Win32.System.Com.IDataObject"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateMenuDescriptor": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.System.Ole.OLEMENUGROUPWIDTHS*"
      ],
      "returns": "isize",
      "setLastError": false
    },
    "OleSetMenuDescriptor": {
      "args": [
        "isize",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.System.Ole.IOleInPlaceFrame",
        "Windows.Win32.System.Ole.IOleInPlaceActiveObject"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleDestroyMenuDescriptor": {
      "args": [
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleTranslateAccelerator": {
      "args": [
        "Windows.Win32.System.Ole.IOleInPlaceFrame",
        "Windows.Win32.System.Ole.OLEINPLACEFRAMEINFO*",
        "Windows.Win32.UI.WindowsAndMessaging.MSG*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleDuplicateData": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Ole.CLIPBOARD_FORMAT",
        "Windows.Win32.System.Memory.GLOBAL_ALLOC_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OleDraw": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "u32",
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleRun": {
      "args": [
        "Windows.Win32.System.Com.IUnknown"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleIsRunning": {
      "args": [
        "Windows.Win32.System.Ole.IOleObject"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OleLockRunning": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ReleaseStgMedium": {
      "args": [
        "Windows.Win32.System.Com.STGMEDIUM*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CreateOleAdviseHolder": {
      "args": [
        "Windows.Win32.System.Ole.IOleAdviseHolder*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateDefaultHandler": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleCreateEmbeddingHelper": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Ole.EMBDHLP_FLAGS",
        "Windows.Win32.System.Com.IClassFactory",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "IsAccelerator": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.MSG*",
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OleGetIconOfFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HGLOBAL",
      "setLastError": false
    },
    "OleGetIconOfClass": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HGLOBAL",
      "setLastError": false
    },
    "OleMetafilePictFromIconAndLabel": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HICON",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HGLOBAL",
      "setLastError": false
    },
    "OleRegGetUserType": {
      "args": [
        "System.Guid*",
        "u32",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleRegGetMiscStatus": {
      "args": [
        "System.Guid*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleRegEnumFormatEtc": {
      "args": [
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Com.IEnumFORMATETC*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleRegEnumVerbs": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Ole.IEnumOLEVERB*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleConvertOLESTREAMToIStorage2": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.OLESTREAM*",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "Windows.Win32.System.Com.DVTARGETDEVICE*",
        "u32",
        "void*",
        "Windows.Win32.System.Ole.OLESTREAMQUERYCONVERTOLELINKCALLBACK"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleDoAutoConvert": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleGetAutoConvert": {
      "args": [
        "System.Guid*",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleSetAutoConvert": {
      "args": [
        "System.Guid*",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleConvertOLESTREAMToIStorageEx2": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.OLESTREAM*",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "u16*",
        "i32*",
        "i32*",
        "u32*",
        "Windows.Win32.System.Com.STGMEDIUM*",
        "u32",
        "void*",
        "Windows.Win32.System.Ole.OLESTREAMQUERYCONVERTOLELINKCALLBACK"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "HRGN_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Graphics.Gdi.HRGN*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HRGN_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HRGN*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HRGN_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HRGN*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HRGN_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.Graphics.Gdi.HRGN*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HMONITOR_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Graphics.Gdi.HMONITOR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HMONITOR_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HMONITOR*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HMONITOR_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HMONITOR*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HMONITOR_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.Graphics.Gdi.HMONITOR*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HMONITOR_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Graphics.Gdi.HMONITOR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HMONITOR_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HMONITOR*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HMONITOR_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HMONITOR*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HMONITOR_UserFree64": {
      "args": [
        "u32*",
        "Windows.Win32.Graphics.Gdi.HMONITOR*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CoGetInstanceFromFile": {
      "args": [
        "Windows.Win32.System.Com.COSERVERINFO*",
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.CLSCTX",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.System.Com.MULTI_QI*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetInstanceFromIStorage": {
      "args": [
        "Windows.Win32.System.Com.COSERVERINFO*",
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.CLSCTX",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "u32",
        "Windows.Win32.System.Com.MULTI_QI*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgOpenAsyncDocfileOnIFillLockBytes": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IFillLockBytes",
        "u32",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.IStorage*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgGetIFillLockBytesOnILockBytes": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.ILockBytes",
        "Windows.Win32.System.Com.StructuredStorage.IFillLockBytes*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgGetIFillLockBytesOnFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.StructuredStorage.IFillLockBytes*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateStreamOnHGlobal": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Com.IStream*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetHGlobalFromStream": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "Windows.Win32.Foundation.HGLOBAL*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetInterfaceAndReleaseStream": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "PropVariantCopy": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.PROPVARIANT*",
        "Windows.Win32.System.Com.StructuredStorage.PROPVARIANT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "PropVariantClear": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.PROPVARIANT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "FreePropVariantArray": {
      "args": [
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.PROPVARIANT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgCreateDocfile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.STGM",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.IStorage*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgCreateDocfileOnILockBytes": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.ILockBytes",
        "Windows.Win32.System.Com.STGM",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.IStorage*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgOpenStorage": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "Windows.Win32.System.Com.STGM",
        "u16**",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.IStorage*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgOpenStorageOnILockBytes": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.ILockBytes",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "Windows.Win32.System.Com.STGM",
        "u16**",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.IStorage*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgIsStorageFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgIsStorageILockBytes": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.ILockBytes"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgSetTimes": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgCreateStorageEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.STGM",
        "Windows.Win32.System.Com.StructuredStorage.STGFMT",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.STGOPTIONS*",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgOpenStorageEx": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.STGM",
        "Windows.Win32.System.Com.StructuredStorage.STGFMT",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.STGOPTIONS*",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgCreatePropStg": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "System.Guid*",
        "System.Guid*",
        "u32",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.IPropertyStorage*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgOpenPropStg": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "System.Guid*",
        "u32",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.IPropertyStorage*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgCreatePropSetStg": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.IPropertySetStorage*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "FmtIdToPropStgName": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "PropStgNameToFmtId": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ReadClassStg": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WriteClassStg": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ReadClassStm": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "WriteClassStm": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetHGlobalFromILockBytes": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.ILockBytes",
        "Windows.Win32.Foundation.HGLOBAL*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateILockBytesOnHGlobal": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Com.StructuredStorage.ILockBytes*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetConvertStg": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "StgConvertVariantToProperty": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.PROPVARIANT*",
        "u16",
        "Windows.Win32.System.Com.StructuredStorage.SERIALIZEDPROPERTYVALUE*",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.BOOLEAN",
        "u32*"
      ],
      "returns": "Windows.Win32.System.Com.StructuredStorage.SERIALIZEDPROPERTYVALUE*",
      "setLastError": false
    },
    "StgConvertPropertyToVariant": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.SERIALIZEDPROPERTYVALUE*",
        "u16",
        "Windows.Win32.System.Com.StructuredStorage.PROPVARIANT*",
        "Windows.Win32.System.Com.StructuredStorage.IMemoryAllocator"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "StgPropertyLengthAsVariant": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.SERIALIZEDPROPERTYVALUE*",
        "u32",
        "u16",
        "u8"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "WriteFmtUserTypeStg": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "u16",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ReadFmtUserTypeStg": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "u16*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleConvertOLESTREAMToIStorage": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.OLESTREAM*",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "Windows.Win32.System.Com.DVTARGETDEVICE*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleConvertIStorageToOLESTREAM": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "Windows.Win32.System.Com.StructuredStorage.OLESTREAM*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SetConvertStg": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleConvertIStorageToOLESTREAMEx": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "u16",
        "i32",
        "i32",
        "u32",
        "Windows.Win32.System.Com.STGMEDIUM*",
        "Windows.Win32.System.Com.StructuredStorage.OLESTREAM*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "OleConvertOLESTREAMToIStorageEx": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.OLESTREAM*",
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "u16*",
        "i32*",
        "i32*",
        "u32*",
        "Windows.Win32.System.Com.STGMEDIUM*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetDefaultContext": {
      "args": [
        "Windows.Win32.System.Com.APTTYPE",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoDecodeProxy": {
      "args": [
        "u32",
        "u64",
        "Windows.Win32.System.WinRT.ServerInformation*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "RoGetAgileReference": {
      "args": [
        "Windows.Win32.System.WinRT.AgileReferenceOptions",
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.WinRT.IAgileReference*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "HWND_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Foundation.HWND*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HWND_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Foundation.HWND*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HWND_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Foundation.HWND*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HWND_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.Foundation.HWND*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HWND_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Foundation.HWND*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HWND_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Foundation.HWND*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HWND_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Foundation.HWND*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HWND_UserFree64": {
      "args": [
        "u32*",
        "Windows.Win32.Foundation.HWND*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CLIPFORMAT_UserSize": {
      "args": [
        "u32*",
        "u32",
        "u16*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CLIPFORMAT_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "u16*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "CLIPFORMAT_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "u16*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "CLIPFORMAT_UserFree": {
      "args": [
        "u32*",
        "u16*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HBITMAP_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Graphics.Gdi.HBITMAP*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HBITMAP_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HBITMAP*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HBITMAP_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HBITMAP*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HBITMAP_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.Graphics.Gdi.HBITMAP*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HDC_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Graphics.Gdi.HDC*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HDC_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HDC*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HDC_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HDC*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HDC_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.Graphics.Gdi.HDC*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HICON_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HICON_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HICON_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HICON_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SNB_UserSize": {
      "args": [
        "u32*",
        "u32",
        "u16***"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SNB_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "u16***"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "SNB_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "u16***"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "SNB_UserFree": {
      "args": [
        "u32*",
        "u16***"
      ],
      "returns": "void",
      "setLastError": false
    },
    "STGMEDIUM_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.System.Com.STGMEDIUM*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "STGMEDIUM_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.System.Com.STGMEDIUM*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "STGMEDIUM_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.System.Com.STGMEDIUM*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "STGMEDIUM_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.System.Com.STGMEDIUM*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CLIPFORMAT_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "u16*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CLIPFORMAT_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "u16*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "CLIPFORMAT_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "u16*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "CLIPFORMAT_UserFree64": {
      "args": [
        "u32*",
        "u16*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HBITMAP_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Graphics.Gdi.HBITMAP*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HBITMAP_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HBITMAP*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HBITMAP_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HBITMAP*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HBITMAP_UserFree64": {
      "args": [
        "u32*",
        "Windows.Win32.Graphics.Gdi.HBITMAP*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HDC_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Graphics.Gdi.HDC*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HDC_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HDC*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HDC_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HDC*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HDC_UserFree64": {
      "args": [
        "u32*",
        "Windows.Win32.Graphics.Gdi.HDC*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HICON_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HICON_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HICON_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HICON_UserFree64": {
      "args": [
        "u32*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SNB_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "u16***"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SNB_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "u16***"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "SNB_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "u16***"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "SNB_UserFree64": {
      "args": [
        "u32*",
        "u16***"
      ],
      "returns": "void",
      "setLastError": false
    },
    "STGMEDIUM_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.System.Com.STGMEDIUM*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "STGMEDIUM_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.System.Com.STGMEDIUM*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "STGMEDIUM_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.System.Com.STGMEDIUM*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "STGMEDIUM_UserFree64": {
      "args": [
        "u32*",
        "Windows.Win32.System.Com.STGMEDIUM*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CoGetMarshalSizeMax": {
      "args": [
        "u32*",
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "u32",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoMarshalInterface": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "u32",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoUnmarshalInterface": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoMarshalHresult": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "Windows.Win32.Foundation.HRESULT"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoUnmarshalHresult": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "Windows.Win32.Foundation.HRESULT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoReleaseMarshalData": {
      "args": [
        "Windows.Win32.System.Com.IStream"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetStandardMarshal": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "u32",
        "void*",
        "u32",
        "Windows.Win32.System.Com.Marshal.IMarshal*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetStdMarshalEx": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "u32",
        "Windows.Win32.System.Com.IUnknown*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoMarshalInterThreadInterfaceInStream": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.IStream*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "HACCEL_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HACCEL_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HACCEL_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HACCEL_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HGLOBAL_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Foundation.HGLOBAL*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HGLOBAL_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Foundation.HGLOBAL*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HGLOBAL_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Foundation.HGLOBAL*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HGLOBAL_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.Foundation.HGLOBAL*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HMENU_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HMENU_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HMENU_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HMENU_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HACCEL_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HACCEL_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HACCEL_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HACCEL_UserFree64": {
      "args": [
        "u32*",
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HGLOBAL_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Foundation.HGLOBAL*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HGLOBAL_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Foundation.HGLOBAL*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HGLOBAL_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Foundation.HGLOBAL*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HGLOBAL_UserFree64": {
      "args": [
        "u32*",
        "Windows.Win32.Foundation.HGLOBAL*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HMENU_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HMENU_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HMENU_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HMENU_UserFree64": {
      "args": [
        "u32*",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HPALETTE_UserSize": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Graphics.Gdi.HPALETTE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HPALETTE_UserMarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HPALETTE*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HPALETTE_UserUnmarshal": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HPALETTE*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HPALETTE_UserFree": {
      "args": [
        "u32*",
        "Windows.Win32.Graphics.Gdi.HPALETTE*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "HPALETTE_UserSize64": {
      "args": [
        "u32*",
        "u32",
        "Windows.Win32.Graphics.Gdi.HPALETTE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "HPALETTE_UserMarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HPALETTE*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HPALETTE_UserUnmarshal64": {
      "args": [
        "u32*",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HPALETTE*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "HPALETTE_UserFree64": {
      "args": [
        "u32*",
        "Windows.Win32.Graphics.Gdi.HPALETTE*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CoGetInterceptor": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CoGetInterceptorFromTypeInfo": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.System.Com.ITypeInfo",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    }
  }
} as const;
const libraries = {
  "ole32.dll": {
    "CoRegisterMessageFilter": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoBuildVersion": {
      "args": [],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CoInitialize": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRegisterMallocSpy": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRevokeMallocSpy": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRegisterInitializeSpy": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRevokeInitializeSpy": {
      "args": [
        "FFIType.u64"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetSystemSecurityPermissions": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoLoadLibrary": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "CoFreeLibrary": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CoFreeAllLibraries": {
      "args": [],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CoAllowSetForegroundWindow": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DcomChannelSetHResult": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoIsOle1Class": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CLSIDFromProgIDEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoFileTimeToDosDateTime": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoDosDateTimeToFileTime": {
      "args": [
        "FFIType.u16",
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoFileTimeNow": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRegisterChannelHook": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoTreatAsClass": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateDataAdviseHolder": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateDataCache": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoInstall": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "BindMoniker": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "MkParseDisplayName": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "MonikerRelativePathTo": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "MonikerCommonPrefixWith": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateBindCtx": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateGenericComposite": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetClassFile": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateClassMoniker": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateFileMoniker": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateItemMoniker": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateAntiMoniker": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreatePointerMoniker": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateObjrefMoniker": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetRunningObjectTable": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateStdProgressIndicator": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetMalloc": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoUninitialize": {
      "args": [],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CoGetCurrentProcess": {
      "args": [],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CoInitializeEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetCallerTID": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetCurrentLogicalThreadId": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetContextToken": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetApartmentType": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoIncrementMTAUsage": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoDecrementMTAUsage": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoAllowUnmarshalerCLSID": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetObjectContext": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetClassObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRegisterClassObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRevokeClassObject": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoResumeClassObjects": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoSuspendClassObjects": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoAddRefServerProcess": {
      "args": [],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CoReleaseServerProcess": {
      "args": [],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CoGetPSClsid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRegisterPSClsid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRegisterSurrogate": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoDisconnectObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoLockObjectExternal": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoIsHandlerConnected": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoCreateFreeThreadedMarshaler": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoFreeUnusedLibraries": {
      "args": [],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CoFreeUnusedLibrariesEx": {
      "args": [
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CoDisconnectContext": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoInitializeSecurity": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
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
    "CoGetCallContext": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoQueryProxyBlanket": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoSetProxyBlanket": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoCopyProxy": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoQueryClientBlanket": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoImpersonateClient": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRevertToSelf": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoQueryAuthenticationServices": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoSwitchCallContext": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoCreateInstance": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoCreateInstanceEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoCreateInstanceFromApp": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRegisterActivationFilter": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetCancelObject": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoSetCancelObject": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoCancelCall": {
      "args": [
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoTestCancel": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoEnableCallCancellation": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoDisableCallCancellation": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StringFromCLSID": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CLSIDFromString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StringFromIID": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IIDFromString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ProgIDFromCLSID": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CLSIDFromProgID": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StringFromGUID2": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoCreateGuid": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoWaitForMultipleHandles": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoWaitForMultipleObjects": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetTreatAsClass": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoInvalidateRemoteMachineBindings": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoTaskMemAlloc": {
      "args": [
        "FFIType.usize"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "CoTaskMemRealloc": {
      "args": [
        "FFIType.ptr",
        "FFIType.usize"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "CoTaskMemFree": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CoRegisterDeviceCatalog": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoRevokeDeviceCatalog": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleBuildVersion": {
      "args": [],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "OleInitialize": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleUninitialize": {
      "args": [],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "OleQueryLinkFromData": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleQueryCreateFromData": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleCreate": {
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
    "OleCreateEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleCreateFromData": {
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
    "OleCreateFromDataEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleCreateLinkFromData": {
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
    "OleCreateLinkFromDataEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleCreateStaticFromData": {
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
    "OleCreateLink": {
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
    "OleCreateLinkEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleCreateLinkToFile": {
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
    "OleCreateLinkToFileEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleCreateFromFile": {
      "args": [
        "FFIType.ptr",
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
    "OleCreateFromFileEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleLoad": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleSave": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleLoadFromStream": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleSaveToStream": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleSetContainedObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleNoteObjectVisible": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RegisterDragDrop": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RevokeDragDrop": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DoDragDrop": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleSetClipboard": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleGetClipboard": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleGetClipboardWithEnterpriseInfo": {
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
    "OleFlushClipboard": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleIsCurrentClipboard": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleCreateMenuDescriptor": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.isize",
      "setLastError": false
    },
    "OleSetMenuDescriptor": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleDestroyMenuDescriptor": {
      "args": [
        "FFIType.isize"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleTranslateAccelerator": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleDuplicateData": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "OleDraw": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleRun": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleIsRunning": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleLockRunning": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ReleaseStgMedium": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CreateOleAdviseHolder": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleCreateDefaultHandler": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleCreateEmbeddingHelper": {
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
    "IsAccelerator": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleGetIconOfFile": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "OleGetIconOfClass": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "OleMetafilePictFromIconAndLabel": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "OleRegGetUserType": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleRegGetMiscStatus": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleRegEnumFormatEtc": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleRegEnumVerbs": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleConvertOLESTREAMToIStorage2": {
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
    "OleDoAutoConvert": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleGetAutoConvert": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleSetAutoConvert": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleConvertOLESTREAMToIStorageEx2": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
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
    "HRGN_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HRGN_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HRGN_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HRGN_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HMONITOR_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HMONITOR_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HMONITOR_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HMONITOR_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HMONITOR_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HMONITOR_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HMONITOR_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HMONITOR_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CoGetInstanceFromFile": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
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
    "CoGetInstanceFromIStorage": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgOpenAsyncDocfileOnIFillLockBytes": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgGetIFillLockBytesOnILockBytes": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgGetIFillLockBytesOnFile": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateStreamOnHGlobal": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetHGlobalFromStream": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetInterfaceAndReleaseStream": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PropVariantCopy": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PropVariantClear": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "FreePropVariantArray": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgCreateDocfile": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgCreateDocfileOnILockBytes": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgOpenStorage": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgOpenStorageOnILockBytes": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgIsStorageFile": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgIsStorageILockBytes": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgSetTimes": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgCreateStorageEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgOpenStorageEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgCreatePropStg": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgOpenPropStg": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgCreatePropSetStg": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "FmtIdToPropStgName": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PropStgNameToFmtId": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ReadClassStg": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WriteClassStg": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ReadClassStm": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WriteClassStm": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetHGlobalFromILockBytes": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateILockBytesOnHGlobal": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetConvertStg": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgConvertVariantToProperty": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u8",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "StgConvertPropertyToVariant": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "StgPropertyLengthAsVariant": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u16",
        "FFIType.u8"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "WriteFmtUserTypeStg": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ReadFmtUserTypeStg": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleConvertOLESTREAMToIStorage": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleConvertIStorageToOLESTREAM": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetConvertStg": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleConvertIStorageToOLESTREAMEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.i32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OleConvertOLESTREAMToIStorageEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetDefaultContext": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoDecodeProxy": {
      "args": [
        "FFIType.u32",
        "FFIType.u64",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RoGetAgileReference": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "HWND_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HWND_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HWND_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HWND_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HWND_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HWND_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HWND_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HWND_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CLIPFORMAT_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CLIPFORMAT_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "CLIPFORMAT_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "CLIPFORMAT_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HBITMAP_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HBITMAP_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HBITMAP_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HBITMAP_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HDC_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HDC_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HDC_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HDC_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HICON_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HICON_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HICON_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HICON_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SNB_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SNB_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SNB_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SNB_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "STGMEDIUM_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "STGMEDIUM_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "STGMEDIUM_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "STGMEDIUM_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CLIPFORMAT_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CLIPFORMAT_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "CLIPFORMAT_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "CLIPFORMAT_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HBITMAP_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HBITMAP_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HBITMAP_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HBITMAP_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HDC_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HDC_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HDC_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HDC_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HICON_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HICON_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HICON_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HICON_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SNB_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SNB_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SNB_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SNB_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "STGMEDIUM_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "STGMEDIUM_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "STGMEDIUM_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "STGMEDIUM_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CoGetMarshalSizeMax": {
      "args": [
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
    "CoMarshalInterface": {
      "args": [
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
    "CoUnmarshalInterface": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoMarshalHresult": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoUnmarshalHresult": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoReleaseMarshalData": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetStandardMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetStdMarshalEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoMarshalInterThreadInterfaceInStream": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "HACCEL_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HACCEL_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HACCEL_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HACCEL_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HGLOBAL_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HGLOBAL_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HGLOBAL_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HGLOBAL_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HMENU_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HMENU_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HMENU_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HMENU_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HACCEL_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HACCEL_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HACCEL_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HACCEL_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HGLOBAL_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HGLOBAL_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HGLOBAL_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HGLOBAL_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HMENU_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HMENU_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HMENU_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HMENU_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HPALETTE_UserSize": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HPALETTE_UserMarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HPALETTE_UserUnmarshal": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HPALETTE_UserFree": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "HPALETTE_UserSize64": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "HPALETTE_UserMarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HPALETTE_UserUnmarshal64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "HPALETTE_UserFree64": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CoGetInterceptor": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CoGetInterceptorFromTypeInfo": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    }
  }
} as const;
const defaults = {} as const;

export function open() {
  const result: Record<string, unknown> = {};
  for (const [dll, symbols] of Object.entries(libraries)) {
    const library = dlopen(dll, symbols as any);
    const defaultSymbols = { ...library.symbols };
    for (const [alias, wide] of Object.entries(defaults[dll as keyof typeof defaults] ?? {})) defaultSymbols[alias] = defaultSymbols[wide];
    result[dll] = { ...library, symbols: defaultSymbols };
  }
  return result as { "ole32.dll": ole32Library };
}
