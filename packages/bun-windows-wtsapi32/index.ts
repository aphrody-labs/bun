import { dlopen, FFIType } from "bun:ffi";

export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export const structs = {
  "WTS_SESSION_INFOW": {
    "size": 24,
    "fields": [
      {
        "name": "SessionId",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "pWinStationName",
        "offset": 8,
        "type": "Windows.Win32.Foundation.PWSTR"
      },
      {
        "name": "State",
        "offset": 16,
        "type": "Windows.Win32.System.RemoteDesktop.WTS_CONNECTSTATE_CLASS"
      }
    ]
  }
} as const;
export const enums = {
  "OBJECT_SECURITY_INFORMATION": {
    "ATTRIBUTE_SECURITY_INFORMATION": 32,
    "BACKUP_SECURITY_INFORMATION": 65536,
    "DACL_SECURITY_INFORMATION": 4,
    "GROUP_SECURITY_INFORMATION": 2,
    "LABEL_SECURITY_INFORMATION": 16,
    "OWNER_SECURITY_INFORMATION": 1,
    "PROTECTED_DACL_SECURITY_INFORMATION": 2147483648,
    "PROTECTED_SACL_SECURITY_INFORMATION": 1073741824,
    "SACL_SECURITY_INFORMATION": 8,
    "SCOPE_SECURITY_INFORMATION": 64,
    "UNPROTECTED_DACL_SECURITY_INFORMATION": 536870912,
    "UNPROTECTED_SACL_SECURITY_INFORMATION": 268435456
  },
  "MESSAGEBOX_STYLE": {
    "MB_ABORTRETRYIGNORE": 2,
    "MB_CANCELTRYCONTINUE": 6,
    "MB_HELP": 16384,
    "MB_OK": 0,
    "MB_OKCANCEL": 1,
    "MB_RETRYCANCEL": 5,
    "MB_YESNO": 4,
    "MB_YESNOCANCEL": 3,
    "MB_ICONHAND": 16,
    "MB_ICONQUESTION": 32,
    "MB_ICONEXCLAMATION": 48,
    "MB_ICONASTERISK": 64,
    "MB_USERICON": 128,
    "MB_ICONWARNING": 48,
    "MB_ICONERROR": 16,
    "MB_ICONINFORMATION": 64,
    "MB_ICONSTOP": 16,
    "MB_DEFBUTTON1": 0,
    "MB_DEFBUTTON2": 256,
    "MB_DEFBUTTON3": 512,
    "MB_DEFBUTTON4": 768,
    "MB_APPLMODAL": 0,
    "MB_SYSTEMMODAL": 4096,
    "MB_TASKMODAL": 8192,
    "MB_NOFOCUS": 32768,
    "MB_SETFOREGROUND": 65536,
    "MB_DEFAULT_DESKTOP_ONLY": 131072,
    "MB_TOPMOST": 262144,
    "MB_RIGHT": 524288,
    "MB_RTLREADING": 1048576,
    "MB_SERVICE_NOTIFICATION": 2097152,
    "MB_SERVICE_NOTIFICATION_NT3X": 262144,
    "MB_TYPEMASK": 15,
    "MB_ICONMASK": 240,
    "MB_DEFMASK": 3840,
    "MB_MODEMASK": 12288,
    "MB_MISCMASK": 49152
  },
  "MESSAGEBOX_RESULT": {
    "IDOK": 1,
    "IDCANCEL": 2,
    "IDABORT": 3,
    "IDRETRY": 4,
    "IDIGNORE": 5,
    "IDYES": 6,
    "IDNO": 7,
    "IDCLOSE": 8,
    "IDHELP": 9,
    "IDTRYAGAIN": 10,
    "IDCONTINUE": 11,
    "IDASYNC": 32001,
    "IDTIMEOUT": 32000
  },
  "WTS_CONNECTSTATE_CLASS": {
    "WTSActive": 0,
    "WTSConnected": 1,
    "WTSConnectQuery": 2,
    "WTSShadow": 3,
    "WTSDisconnected": 4,
    "WTSIdle": 5,
    "WTSListen": 6,
    "WTSReset": 7,
    "WTSDown": 8,
    "WTSInit": 9
  },
  "WTS_INFO_CLASS": {
    "WTSInitialProgram": 0,
    "WTSApplicationName": 1,
    "WTSWorkingDirectory": 2,
    "WTSOEMId": 3,
    "WTSSessionId": 4,
    "WTSUserName": 5,
    "WTSWinStationName": 6,
    "WTSDomainName": 7,
    "WTSConnectState": 8,
    "WTSClientBuildNumber": 9,
    "WTSClientName": 10,
    "WTSClientDirectory": 11,
    "WTSClientProductId": 12,
    "WTSClientHardwareId": 13,
    "WTSClientAddress": 14,
    "WTSClientDisplay": 15,
    "WTSClientProtocolType": 16,
    "WTSIdleTime": 17,
    "WTSLogonTime": 18,
    "WTSIncomingBytes": 19,
    "WTSOutgoingBytes": 20,
    "WTSIncomingFrames": 21,
    "WTSOutgoingFrames": 22,
    "WTSClientInfo": 23,
    "WTSSessionInfo": 24,
    "WTSSessionInfoEx": 25,
    "WTSConfigInfo": 26,
    "WTSValidationInfo": 27,
    "WTSSessionAddressV4": 28,
    "WTSIsRemoteSession": 29,
    "WTSSessionActivityId": 30,
    "WTSCapabilityCheck": 31
  },
  "WTS_CONFIG_CLASS": {
    "WTSUserConfigInitialProgram": 0,
    "WTSUserConfigWorkingDirectory": 1,
    "WTSUserConfigfInheritInitialProgram": 2,
    "WTSUserConfigfAllowLogonTerminalServer": 3,
    "WTSUserConfigTimeoutSettingsConnections": 4,
    "WTSUserConfigTimeoutSettingsDisconnections": 5,
    "WTSUserConfigTimeoutSettingsIdle": 6,
    "WTSUserConfigfDeviceClientDrives": 7,
    "WTSUserConfigfDeviceClientPrinters": 8,
    "WTSUserConfigfDeviceClientDefaultPrinter": 9,
    "WTSUserConfigBrokenTimeoutSettings": 10,
    "WTSUserConfigReconnectSettings": 11,
    "WTSUserConfigModemCallbackSettings": 12,
    "WTSUserConfigModemCallbackPhoneNumber": 13,
    "WTSUserConfigShadowingSettings": 14,
    "WTSUserConfigTerminalServerProfilePath": 15,
    "WTSUserConfigTerminalServerHomeDir": 16,
    "WTSUserConfigTerminalServerHomeDirDrive": 17,
    "WTSUserConfigfTerminalServerRemoteHomeDir": 18,
    "WTSUserConfigUser": 19
  },
  "WTS_VIRTUAL_CLASS": {
    "WTSVirtualClientData": 0,
    "WTSVirtualFileHandle": 1
  },
  "WTS_TYPE_CLASS": {
    "WTSTypeProcessInfoLevel0": 0,
    "WTSTypeProcessInfoLevel1": 1,
    "WTSTypeSessionInfoLevel1": 2,
    "WTSTypeCloudAuthServerNonce": 3,
    "WTSTypeSerializedUserCredential": 4
  }
} as const;
export const wideAliases = {
  "WTSStartRemoteControlSession": "WTSStartRemoteControlSessionW",
  "WTSConnectSession": "WTSConnectSessionW",
  "WTSEnumerateServers": "WTSEnumerateServersW",
  "WTSOpenServer": "WTSOpenServerW",
  "WTSOpenServerEx": "WTSOpenServerExW",
  "WTSEnumerateSessions": "WTSEnumerateSessionsW",
  "WTSEnumerateSessionsEx": "WTSEnumerateSessionsExW",
  "WTSEnumerateProcesses": "WTSEnumerateProcessesW",
  "WTSQuerySessionInformation": "WTSQuerySessionInformationW",
  "WTSQueryUserConfig": "WTSQueryUserConfigW",
  "WTSSetUserConfig": "WTSSetUserConfigW",
  "WTSSendMessage": "WTSSendMessageW",
  "WTSFreeMemoryEx": "WTSFreeMemoryExW",
  "WTSEnumerateProcessesEx": "WTSEnumerateProcessesExW",
  "WTSEnumerateListeners": "WTSEnumerateListenersW",
  "WTSQueryListenerConfig": "WTSQueryListenerConfigW",
  "WTSCreateListener": "WTSCreateListenerW",
  "WTSSetListenerSecurity": "WTSSetListenerSecurityW",
  "WTSGetListenerSecurity": "WTSGetListenerSecurityW"
} as const;
export const signatures = {
  "wtsapi32.dll": {
    "WTSStopRemoteControlSession": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSStartRemoteControlSessionW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u8",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSStartRemoteControlSessionA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u8",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSConnectSessionA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSConnectSessionW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateServersW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32",
        "Windows.Win32.System.RemoteDesktop.WTS_SERVER_INFOW**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateServersA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32",
        "Windows.Win32.System.RemoteDesktop.WTS_SERVER_INFOA**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSOpenServerW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "WTSOpenServerA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "WTSOpenServerExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "WTSOpenServerExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "WTSCloseServer": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "WTSEnumerateSessionsW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "Windows.Win32.System.RemoteDesktop.WTS_SESSION_INFOW**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateSessionsA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "Windows.Win32.System.RemoteDesktop.WTS_SESSION_INFOA**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateSessionsExW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32",
        "Windows.Win32.System.RemoteDesktop.WTS_SESSION_INFO_1W**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateSessionsExA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32",
        "Windows.Win32.System.RemoteDesktop.WTS_SESSION_INFO_1A**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateProcessesW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "Windows.Win32.System.RemoteDesktop.WTS_PROCESS_INFOW**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateProcessesA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "Windows.Win32.System.RemoteDesktop.WTS_PROCESS_INFOA**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSTerminateProcess": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSQuerySessionInformationW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.System.RemoteDesktop.WTS_INFO_CLASS",
        "Windows.Win32.Foundation.PWSTR*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSQuerySessionInformationA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.System.RemoteDesktop.WTS_INFO_CLASS",
        "Windows.Win32.Foundation.PSTR*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSQueryUserConfigW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.RemoteDesktop.WTS_CONFIG_CLASS",
        "Windows.Win32.Foundation.PWSTR*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSQueryUserConfigA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.RemoteDesktop.WTS_CONFIG_CLASS",
        "Windows.Win32.Foundation.PSTR*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSSetUserConfigW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.RemoteDesktop.WTS_CONFIG_CLASS",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSSetUserConfigA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.RemoteDesktop.WTS_CONFIG_CLASS",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSSendMessageW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_STYLE",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_RESULT*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSSendMessageA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_STYLE",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_RESULT*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSDisconnectSession": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSLogoffSession": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSShutdownSystem": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSWaitSystemEvent": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSVirtualChannelOpen": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "WTSVirtualChannelOpenEx": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "WTSVirtualChannelClose": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSVirtualChannelRead": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSVirtualChannelWrite": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSVirtualChannelPurgeInput": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSVirtualChannelPurgeOutput": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSVirtualChannelQuery": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.RemoteDesktop.WTS_VIRTUAL_CLASS",
        "void**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSFreeMemory": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "WTSRegisterSessionNotification": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSUnRegisterSessionNotification": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSRegisterSessionNotificationEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HWND",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSUnRegisterSessionNotificationEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSQueryUserToken": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSFreeMemoryExW": {
      "args": [
        "Windows.Win32.System.RemoteDesktop.WTS_TYPE_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSFreeMemoryExA": {
      "args": [
        "Windows.Win32.System.RemoteDesktop.WTS_TYPE_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateProcessesExW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.PWSTR*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateProcessesExA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.PSTR*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateListenersW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "u16**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnumerateListenersA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "i8**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSQueryListenerConfigW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.RemoteDesktop.WTSLISTENERCONFIGW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSQueryListenerConfigA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.RemoteDesktop.WTSLISTENERCONFIGA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSCreateListenerW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.RemoteDesktop.WTSLISTENERCONFIGW*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSCreateListenerA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.RemoteDesktop.WTSLISTENERCONFIGA*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSSetListenerSecurityW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSSetListenerSecurityA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSGetListenerSecurityW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSGetListenerSecurityA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSCloudAuthOpen": {
      "args": [
        "System.Guid*"
      ],
      "returns": "Windows.Win32.System.RemoteDesktop.WTS_CLOUD_AUTH_HANDLE",
      "setLastError": false
    },
    "WTSCloudAuthClose": {
      "args": [
        "Windows.Win32.System.RemoteDesktop.WTS_CLOUD_AUTH_HANDLE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "WTSCloudAuthGetServerNonce": {
      "args": [
        "Windows.Win32.System.RemoteDesktop.WTS_CLOUD_AUTH_HANDLE",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSCloudAuthConvertAssertionToSerializedUserCredential": {
      "args": [
        "Windows.Win32.System.RemoteDesktop.WTS_CLOUD_AUTH_HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.RemoteDesktop.WTS_SERIALIZED_USER_CREDENTIAL**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSCloudAuthNetworkLogonWithSerializedCredential": {
      "args": [
        "Windows.Win32.System.RemoteDesktop.WTS_CLOUD_AUTH_HANDLE",
        "Windows.Win32.System.RemoteDesktop.WTS_SERIALIZED_USER_CREDENTIAL*",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSCloudAuthDuplicateSerializedUserCredential": {
      "args": [
        "Windows.Win32.System.RemoteDesktop.WTS_SERIALIZED_USER_CREDENTIAL*",
        "Windows.Win32.System.RemoteDesktop.WTS_SERIALIZED_USER_CREDENTIAL**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSEnableChildSessions": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSIsChildSessionsEnabled": {
      "args": [
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSGetChildSessionId": {
      "args": [
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSActiveSessionExists": {
      "args": [
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WTSSetRenderHint": {
      "args": [
        "u64*",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "u32",
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    }
  }
} as const;
const libraries = {
  "wtsapi32.dll": {
    "WTSStopRemoteControlSession": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSStartRemoteControlSessionW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u8",
        "FFIType.u16"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSStartRemoteControlSessionA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u8",
        "FFIType.u16"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSConnectSessionA": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSConnectSessionW": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSEnumerateServersW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSEnumerateServersA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSOpenServerW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "WTSOpenServerA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "WTSOpenServerExW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "WTSOpenServerExA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "WTSCloseServer": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "WTSEnumerateSessionsW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSEnumerateSessionsA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSEnumerateSessionsExW": {
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
    "WTSEnumerateSessionsExA": {
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
    "WTSEnumerateProcessesW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSEnumerateProcessesA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSTerminateProcess": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSQuerySessionInformationW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSQuerySessionInformationA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSQueryUserConfigW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSQueryUserConfigA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSSetUserConfigW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSSetUserConfigA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSSendMessageW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSSendMessageA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSDisconnectSession": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSLogoffSession": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSShutdownSystem": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSWaitSystemEvent": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSVirtualChannelOpen": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "WTSVirtualChannelOpenEx": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "WTSVirtualChannelClose": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSVirtualChannelRead": {
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
    "WTSVirtualChannelWrite": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSVirtualChannelPurgeInput": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSVirtualChannelPurgeOutput": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSVirtualChannelQuery": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSFreeMemory": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "WTSRegisterSessionNotification": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSUnRegisterSessionNotification": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSRegisterSessionNotificationEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSUnRegisterSessionNotificationEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSQueryUserToken": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSFreeMemoryExW": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSFreeMemoryExA": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSEnumerateProcessesExW": {
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
    "WTSEnumerateProcessesExA": {
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
    "WTSEnumerateListenersW": {
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
    "WTSEnumerateListenersA": {
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
    "WTSQueryListenerConfigW": {
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
    "WTSQueryListenerConfigA": {
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
    "WTSCreateListenerW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSCreateListenerA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSSetListenerSecurityW": {
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
    "WTSSetListenerSecurityA": {
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
    "WTSGetListenerSecurityW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSGetListenerSecurityA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSCloudAuthOpen": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "WTSCloudAuthClose": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "WTSCloudAuthGetServerNonce": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSCloudAuthConvertAssertionToSerializedUserCredential": {
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
    "WTSCloudAuthNetworkLogonWithSerializedCredential": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSCloudAuthDuplicateSerializedUserCredential": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSEnableChildSessions": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSIsChildSessionsEnabled": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSGetChildSessionId": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSActiveSessionExists": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WTSSetRenderHint": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    }
  }
} as const;
const defaults = {
  "wtsapi32.dll": {
    "WTSStartRemoteControlSession": "WTSStartRemoteControlSessionW",
    "WTSConnectSession": "WTSConnectSessionW",
    "WTSEnumerateServers": "WTSEnumerateServersW",
    "WTSOpenServer": "WTSOpenServerW",
    "WTSOpenServerEx": "WTSOpenServerExW",
    "WTSEnumerateSessions": "WTSEnumerateSessionsW",
    "WTSEnumerateSessionsEx": "WTSEnumerateSessionsExW",
    "WTSEnumerateProcesses": "WTSEnumerateProcessesW",
    "WTSQuerySessionInformation": "WTSQuerySessionInformationW",
    "WTSQueryUserConfig": "WTSQueryUserConfigW",
    "WTSSetUserConfig": "WTSSetUserConfigW",
    "WTSSendMessage": "WTSSendMessageW",
    "WTSFreeMemoryEx": "WTSFreeMemoryExW",
    "WTSEnumerateProcessesEx": "WTSEnumerateProcessesExW",
    "WTSEnumerateListeners": "WTSEnumerateListenersW",
    "WTSQueryListenerConfig": "WTSQueryListenerConfigW",
    "WTSCreateListener": "WTSCreateListenerW",
    "WTSSetListenerSecurity": "WTSSetListenerSecurityW",
    "WTSGetListenerSecurity": "WTSGetListenerSecurityW"
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
  return result as { "wtsapi32.dll": wtsapi32Library };
}
