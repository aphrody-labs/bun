import { dlopen, FFIType } from "bun:ffi";

export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export const structs = {
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
  "LUID": {
    "size": 8,
    "fields": [
      {
        "name": "LowPart",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "HighPart",
        "offset": 4,
        "type": "i32"
      }
    ]
  },
  "TOKEN_PRIVILEGES": {
    "size": 16,
    "fields": [
      {
        "name": "PrivilegeCount",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "Privileges",
        "offset": 8,
        "type": "Windows.Win32.Security.LUID_AND_ATTRIBUTES[1]"
      }
    ]
  }
} as const;
export const enums = {
  "IS_TEXT_UNICODE_RESULT": {
    "IS_TEXT_UNICODE_ASCII16": 1,
    "IS_TEXT_UNICODE_REVERSE_ASCII16": 16,
    "IS_TEXT_UNICODE_STATISTICS": 2,
    "IS_TEXT_UNICODE_REVERSE_STATISTICS": 32,
    "IS_TEXT_UNICODE_CONTROLS": 4,
    "IS_TEXT_UNICODE_REVERSE_CONTROLS": 64,
    "IS_TEXT_UNICODE_SIGNATURE": 8,
    "IS_TEXT_UNICODE_REVERSE_SIGNATURE": 128,
    "IS_TEXT_UNICODE_ILLEGAL_CHARS": 256,
    "IS_TEXT_UNICODE_ODD_LENGTH": 512,
    "IS_TEXT_UNICODE_NULL_BYTES": 4096,
    "IS_TEXT_UNICODE_UNICODE_MASK": 15,
    "IS_TEXT_UNICODE_REVERSE_MASK": 240,
    "IS_TEXT_UNICODE_NOT_UNICODE_MASK": 3840,
    "IS_TEXT_UNICODE_NOT_ASCII_MASK": 61440
  },
  "REG_VALUE_TYPE": {
    "REG_NONE": 0,
    "REG_SZ": 1,
    "REG_EXPAND_SZ": 2,
    "REG_BINARY": 3,
    "REG_DWORD": 4,
    "REG_DWORD_LITTLE_ENDIAN": 4,
    "REG_DWORD_BIG_ENDIAN": 5,
    "REG_LINK": 6,
    "REG_MULTI_SZ": 7,
    "REG_RESOURCE_LIST": 8,
    "REG_FULL_RESOURCE_DESCRIPTOR": 9,
    "REG_RESOURCE_REQUIREMENTS_LIST": 10,
    "REG_QWORD": 11,
    "REG_QWORD_LITTLE_ENDIAN": 11
  },
  "REG_SAM_FLAGS": {
    "KEY_QUERY_VALUE": 1,
    "KEY_SET_VALUE": 2,
    "KEY_CREATE_SUB_KEY": 4,
    "KEY_ENUMERATE_SUB_KEYS": 8,
    "KEY_NOTIFY": 16,
    "KEY_CREATE_LINK": 32,
    "KEY_WOW64_32KEY": 512,
    "KEY_WOW64_64KEY": 256,
    "KEY_WOW64_RES": 768,
    "KEY_READ": 131097,
    "KEY_WRITE": 131078,
    "KEY_EXECUTE": 131097,
    "KEY_ALL_ACCESS": 983103
  },
  "REG_OPEN_CREATE_OPTIONS": {
    "REG_OPTION_RESERVED": 0,
    "REG_OPTION_NON_VOLATILE": 0,
    "REG_OPTION_VOLATILE": 1,
    "REG_OPTION_CREATE_LINK": 2,
    "REG_OPTION_BACKUP_RESTORE": 4,
    "REG_OPTION_OPEN_LINK": 8,
    "REG_OPTION_DONT_VIRTUALIZE": 16
  },
  "REG_CREATE_KEY_DISPOSITION": {
    "REG_CREATED_NEW_KEY": 1,
    "REG_OPENED_EXISTING_KEY": 2
  },
  "SAFER_COMPUTE_TOKEN_FROM_LEVEL_FLAGS": {
    "SAFER_TOKEN_NULL_IF_EQUAL": 1,
    "SAFER_TOKEN_COMPARE_ONLY": 2,
    "SAFER_TOKEN_MAKE_INERT": 4,
    "SAFER_TOKEN_WANT_FLAGS": 8
  },
  "TREE_SEC_INFO": {
    "TREE_SEC_INFO_SET": 1,
    "TREE_SEC_INFO_RESET": 2,
    "TREE_SEC_INFO_RESET_KEEP_EXPLICIT": 3
  },
  "CRED_TYPE": {
    "CRED_TYPE_GENERIC": 1,
    "CRED_TYPE_DOMAIN_PASSWORD": 2,
    "CRED_TYPE_DOMAIN_CERTIFICATE": 3,
    "CRED_TYPE_DOMAIN_VISIBLE_PASSWORD": 4,
    "CRED_TYPE_GENERIC_CERTIFICATE": 5,
    "CRED_TYPE_DOMAIN_EXTENDED": 6,
    "CRED_TYPE_MAXIMUM": 7,
    "CRED_TYPE_MAXIMUM_EX": 1007
  },
  "CRED_ENUMERATE_FLAGS": {
    "CRED_ENUMERATE_ALL_CREDENTIALS": 1
  },
  "CRYPT_SET_PROV_PARAM_ID": {
    "PP_CLIENT_HWND": 1,
    "PP_DELETEKEY": 24,
    "PP_KEYEXCHANGE_ALG": 14,
    "PP_KEYEXCHANGE_PIN": 32,
    "PP_KEYEXCHANGE_KEYSIZE": 12,
    "PP_KEYSET_SEC_DESCR": 8,
    "PP_PIN_PROMPT_STRING": 44,
    "PP_ROOT_CERTSTORE": 46,
    "PP_SIGNATURE_ALG": 15,
    "PP_SIGNATURE_PIN": 33,
    "PP_SIGNATURE_KEYSIZE": 13,
    "PP_UI_PROMPT": 21,
    "PP_USE_HARDWARE_RNG": 38,
    "PP_USER_CERTSTORE": 42,
    "PP_SECURE_KEYEXCHANGE_PIN": 47,
    "PP_SECURE_SIGNATURE_PIN": 48,
    "PP_SMARTCARD_READER": 43
  },
  "CRYPT_KEY_PARAM_ID": {
    "KP_ALGID": 7,
    "KP_CERTIFICATE": 26,
    "KP_PERMISSIONS": 6,
    "KP_SALT": 2,
    "KP_SALT_EX": 10,
    "KP_BLOCKLEN": 8,
    "KP_GET_USE_COUNT": 42,
    "KP_KEYLEN": 9
  },
  "CRYPT_KEY_FLAGS": {
    "CRYPT_EXPORTABLE": 1,
    "CRYPT_USER_PROTECTED": 2,
    "CRYPT_ARCHIVABLE": 16384,
    "CRYPT_CREATE_IV": 512,
    "CRYPT_CREATE_SALT": 4,
    "CRYPT_DATA_KEY": 2048,
    "CRYPT_FORCE_KEY_PROTECTION_HIGH": 32768,
    "CRYPT_KEK": 1024,
    "CRYPT_INITIATOR": 64,
    "CRYPT_NO_SALT": 16,
    "CRYPT_ONLINE": 128,
    "CRYPT_PREGEN": 64,
    "CRYPT_RECIPIENT": 16,
    "CRYPT_SF": 256,
    "CRYPT_SGCKEY": 8192,
    "CRYPT_VOLATILE": 4096,
    "CRYPT_MACHINE_KEYSET": 32,
    "CRYPT_USER_KEYSET": 4096,
    "PKCS12_PREFER_CNG_KSP": 256,
    "PKCS12_ALWAYS_CNG_KSP": 512,
    "PKCS12_ALLOW_OVERWRITE_KEY": 16384,
    "PKCS12_NO_PERSIST_KEY": 32768,
    "PKCS12_INCLUDE_EXTENDED_PROPERTIES": 16,
    "CRYPT_OAEP": 64,
    "CRYPT_BLOB_VER3": 128,
    "CRYPT_DESTROYKEY": 4,
    "CRYPT_SSL2_FALLBACK": 2,
    "CRYPT_Y_ONLY": 1,
    "CRYPT_IPSEC_HMAC_KEY": 256,
    "CERT_SET_KEY_PROV_HANDLE_PROP_ID": 1,
    "CERT_SET_KEY_CONTEXT_PROP_ID": 1
  },
  "CRYPT_SET_HASH_PARAM": {
    "HP_HMAC_INFO": 5,
    "HP_HASHVAL": 2
  },
  "ALG_ID": {
    "CALG_MD2": 32769,
    "CALG_MD4": 32770,
    "CALG_MD5": 32771,
    "CALG_SHA": 32772,
    "CALG_SHA1": 32772,
    "CALG_MAC": 32773,
    "CALG_RSA_SIGN": 9216,
    "CALG_DSS_SIGN": 8704,
    "CALG_NO_SIGN": 8192,
    "CALG_RSA_KEYX": 41984,
    "CALG_DES": 26113,
    "CALG_3DES_112": 26121,
    "CALG_3DES": 26115,
    "CALG_DESX": 26116,
    "CALG_RC2": 26114,
    "CALG_RC4": 26625,
    "CALG_SEAL": 26626,
    "CALG_DH_SF": 43521,
    "CALG_DH_EPHEM": 43522,
    "CALG_AGREEDKEY_ANY": 43523,
    "CALG_KEA_KEYX": 43524,
    "CALG_HUGHES_MD5": 40963,
    "CALG_SKIPJACK": 26122,
    "CALG_TEK": 26123,
    "CALG_CYLINK_MEK": 26124,
    "CALG_SSL3_SHAMD5": 32776,
    "CALG_SSL3_MASTER": 19457,
    "CALG_SCHANNEL_MASTER_HASH": 19458,
    "CALG_SCHANNEL_MAC_KEY": 19459,
    "CALG_SCHANNEL_ENC_KEY": 19463,
    "CALG_PCT1_MASTER": 19460,
    "CALG_SSL2_MASTER": 19461,
    "CALG_TLS1_MASTER": 19462,
    "CALG_RC5": 26125,
    "CALG_HMAC": 32777,
    "CALG_TLS1PRF": 32778,
    "CALG_HASH_REPLACE_OWF": 32779,
    "CALG_AES_128": 26126,
    "CALG_AES_192": 26127,
    "CALG_AES_256": 26128,
    "CALG_AES": 26129,
    "CALG_SHA_256": 32780,
    "CALG_SHA_384": 32781,
    "CALG_SHA_512": 32782,
    "CALG_ECDH": 43525,
    "CALG_ECDH_EPHEM": 44550,
    "CALG_ECMQV": 40961,
    "CALG_ECDSA": 8707,
    "CALG_NULLCIPHER": 24576,
    "CALG_THIRDPARTY_KEY_EXCHANGE": 45056,
    "CALG_THIRDPARTY_SIGNATURE": 12288,
    "CALG_THIRDPARTY_CIPHER": 28672,
    "CALG_THIRDPARTY_HASH": 36864
  },
  "CREATE_RESTRICTED_TOKEN_FLAGS": {
    "DISABLE_MAX_PRIVILEGE": 1,
    "SANDBOX_INERT": 2,
    "LUA_TOKEN": 4,
    "WRITE_RESTRICTED": 8
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
  "SECURITY_AUTO_INHERIT_FLAGS": {
    "SEF_AVOID_OWNER_CHECK": 16,
    "SEF_AVOID_OWNER_RESTRICTION": 4096,
    "SEF_AVOID_PRIVILEGE_CHECK": 8,
    "SEF_DACL_AUTO_INHERIT": 1,
    "SEF_DEFAULT_DESCRIPTOR_FOR_OBJECT": 4,
    "SEF_DEFAULT_GROUP_FROM_PARENT": 64,
    "SEF_DEFAULT_OWNER_FROM_PARENT": 32,
    "SEF_MACL_NO_EXECUTE_UP": 1024,
    "SEF_MACL_NO_READ_UP": 512,
    "SEF_MACL_NO_WRITE_UP": 256,
    "SEF_SACL_AUTO_INHERIT": 2
  },
  "ACE_REVISION": {
    "ACL_REVISION": 2,
    "ACL_REVISION_DS": 4
  },
  "SECURITY_DESCRIPTOR_CONTROL": {
    "SE_OWNER_DEFAULTED": 1,
    "SE_GROUP_DEFAULTED": 2,
    "SE_DACL_PRESENT": 4,
    "SE_DACL_DEFAULTED": 8,
    "SE_SACL_PRESENT": 16,
    "SE_SACL_DEFAULTED": 32,
    "SE_DACL_AUTO_INHERIT_REQ": 256,
    "SE_SACL_AUTO_INHERIT_REQ": 512,
    "SE_DACL_AUTO_INHERITED": 1024,
    "SE_SACL_AUTO_INHERITED": 2048,
    "SE_DACL_PROTECTED": 4096,
    "SE_SACL_PROTECTED": 8192,
    "SE_RM_CONTROL_VALID": 16384,
    "SE_SELF_RELATIVE": 32768
  },
  "TOKEN_ACCESS_MASK": {
    "TOKEN_DELETE": 65536,
    "TOKEN_READ_CONTROL": 131072,
    "TOKEN_WRITE_DAC": 262144,
    "TOKEN_WRITE_OWNER": 524288,
    "TOKEN_ACCESS_SYSTEM_SECURITY": 16777216,
    "TOKEN_ASSIGN_PRIMARY": 1,
    "TOKEN_DUPLICATE": 2,
    "TOKEN_IMPERSONATE": 4,
    "TOKEN_QUERY": 8,
    "TOKEN_QUERY_SOURCE": 16,
    "TOKEN_ADJUST_PRIVILEGES": 32,
    "TOKEN_ADJUST_GROUPS": 64,
    "TOKEN_ADJUST_DEFAULT": 128,
    "TOKEN_ADJUST_SESSIONID": 256,
    "TOKEN_READ": 131080,
    "TOKEN_WRITE": 131296,
    "TOKEN_EXECUTE": 131072,
    "TOKEN_TRUST_CONSTRAINT_MASK": 131096,
    "TOKEN_ACCESS_PSEUDO_HANDLE_WIN8": 24,
    "TOKEN_ACCESS_PSEUDO_HANDLE": 24,
    "TOKEN_ALL_ACCESS": 983551
  },
  "OPEN_THREAD_WAIT_CHAIN_SESSION_FLAGS": {
    "WCT_ASYNC_OPEN_FLAG": 1
  },
  "WAIT_CHAIN_THREAD_OPTIONS": {
    "WCT_OUT_OF_PROC_COM_FLAG": 2,
    "WCT_OUT_OF_PROC_CS_FLAG": 4,
    "WCT_OUT_OF_PROC_FLAG": 1
  },
  "TRACE_MESSAGE_FLAGS": {
    "TRACE_MESSAGE_COMPONENTID": 4,
    "TRACE_MESSAGE_GUID": 2,
    "TRACE_MESSAGE_SEQUENCE": 1,
    "TRACE_MESSAGE_SYSTEMINFO": 32,
    "TRACE_MESSAGE_TIMESTAMP": 8
  },
  "EVENT_TRACE_CONTROL": {
    "EVENT_TRACE_CONTROL_FLUSH": 3,
    "EVENT_TRACE_CONTROL_QUERY": 0,
    "EVENT_TRACE_CONTROL_STOP": 1,
    "EVENT_TRACE_CONTROL_UPDATE": 2
  },
  "REPORT_EVENT_TYPE": {
    "EVENTLOG_SUCCESS": 0,
    "EVENTLOG_AUDIT_FAILURE": 16,
    "EVENTLOG_AUDIT_SUCCESS": 8,
    "EVENTLOG_ERROR_TYPE": 1,
    "EVENTLOG_INFORMATION_TYPE": 4,
    "EVENTLOG_WARNING_TYPE": 2
  },
  "READ_EVENT_LOG_READ_FLAGS": {
    "EVENTLOG_SEEK_READ": 2,
    "EVENTLOG_SEQUENTIAL_READ": 1,
    "EVENTLOG_FORWARDS_READ": 4,
    "EVENTLOG_BACKWARDS_READ": 8
  },
  "REG_SAVE_FORMAT": {
    "REG_STANDARD_FORMAT": 1,
    "REG_LATEST_FORMAT": 2,
    "REG_NO_COMPRESSION": 4
  },
  "REG_NOTIFY_FILTER": {
    "REG_NOTIFY_CHANGE_NAME": 1,
    "REG_NOTIFY_CHANGE_ATTRIBUTES": 2,
    "REG_NOTIFY_CHANGE_LAST_SET": 4,
    "REG_NOTIFY_CHANGE_SECURITY": 8,
    "REG_NOTIFY_THREAD_AGNOSTIC": 268435456
  },
  "REG_ROUTINE_FLAGS": {
    "RRF_RT_DWORD": 24,
    "RRF_RT_QWORD": 72,
    "RRF_RT_REG_NONE": 1,
    "RRF_RT_REG_SZ": 2,
    "RRF_RT_REG_EXPAND_SZ": 4,
    "RRF_RT_REG_BINARY": 8,
    "RRF_RT_REG_DWORD": 16,
    "RRF_RT_REG_MULTI_SZ": 32,
    "RRF_RT_REG_QWORD": 64,
    "RRF_RT_ANY": 65535,
    "RRF_SUBKEY_WOW6464KEY": 65536,
    "RRF_SUBKEY_WOW6432KEY": 131072,
    "RRF_WOW64_MASK": 196608,
    "RRF_NOEXPAND": 268435456,
    "RRF_ZEROONFAILURE": 536870912
  },
  "ENUM_SERVICE_STATE": {
    "SERVICE_ACTIVE": 1,
    "SERVICE_INACTIVE": 2,
    "SERVICE_STATE_ALL": 3
  },
  "SERVICE_ERROR": {
    "SERVICE_ERROR_CRITICAL": 3,
    "SERVICE_ERROR_IGNORE": 0,
    "SERVICE_ERROR_NORMAL": 1,
    "SERVICE_ERROR_SEVERE": 2
  },
  "SERVICE_CONFIG": {
    "SERVICE_CONFIG_DELAYED_AUTO_START_INFO": 3,
    "SERVICE_CONFIG_DESCRIPTION": 1,
    "SERVICE_CONFIG_FAILURE_ACTIONS": 2,
    "SERVICE_CONFIG_FAILURE_ACTIONS_FLAG": 4,
    "SERVICE_CONFIG_PREFERRED_NODE": 9,
    "SERVICE_CONFIG_PRESHUTDOWN_INFO": 7,
    "SERVICE_CONFIG_REQUIRED_PRIVILEGES_INFO": 6,
    "SERVICE_CONFIG_SERVICE_SID_INFO": 5,
    "SERVICE_CONFIG_TRIGGER_INFO": 8,
    "SERVICE_CONFIG_LAUNCH_PROTECTED": 12
  },
  "ENUM_SERVICE_TYPE": {
    "SERVICE_DRIVER": 11,
    "SERVICE_KERNEL_DRIVER": 1,
    "SERVICE_WIN32": 48,
    "SERVICE_WIN32_SHARE_PROCESS": 32,
    "SERVICE_ADAPTER": 4,
    "SERVICE_FILE_SYSTEM_DRIVER": 2,
    "SERVICE_RECOGNIZER_DRIVER": 8,
    "SERVICE_WIN32_OWN_PROCESS": 16,
    "SERVICE_USER_OWN_PROCESS": 80,
    "SERVICE_USER_SHARE_PROCESS": 96
  },
  "SERVICE_START_TYPE": {
    "SERVICE_AUTO_START": 2,
    "SERVICE_BOOT_START": 0,
    "SERVICE_DEMAND_START": 3,
    "SERVICE_DISABLED": 4,
    "SERVICE_SYSTEM_START": 1
  },
  "SERVICE_NOTIFY": {
    "SERVICE_NOTIFY_CREATED": 128,
    "SERVICE_NOTIFY_CONTINUE_PENDING": 16,
    "SERVICE_NOTIFY_DELETE_PENDING": 512,
    "SERVICE_NOTIFY_DELETED": 256,
    "SERVICE_NOTIFY_PAUSE_PENDING": 32,
    "SERVICE_NOTIFY_PAUSED": 64,
    "SERVICE_NOTIFY_RUNNING": 8,
    "SERVICE_NOTIFY_START_PENDING": 2,
    "SERVICE_NOTIFY_STOP_PENDING": 4,
    "SERVICE_NOTIFY_STOPPED": 1
  },
  "SHUTDOWN_REASON": {
    "SHTDN_REASON_NONE": 0,
    "SHTDN_REASON_FLAG_COMMENT_REQUIRED": 16777216,
    "SHTDN_REASON_FLAG_DIRTY_PROBLEM_ID_REQUIRED": 33554432,
    "SHTDN_REASON_FLAG_CLEAN_UI": 67108864,
    "SHTDN_REASON_FLAG_DIRTY_UI": 134217728,
    "SHTDN_REASON_FLAG_MOBILE_UI_RESERVED": 268435456,
    "SHTDN_REASON_FLAG_USER_DEFINED": 1073741824,
    "SHTDN_REASON_FLAG_PLANNED": 2147483648,
    "SHTDN_REASON_MAJOR_OTHER": 0,
    "SHTDN_REASON_MAJOR_NONE": 0,
    "SHTDN_REASON_MAJOR_HARDWARE": 65536,
    "SHTDN_REASON_MAJOR_OPERATINGSYSTEM": 131072,
    "SHTDN_REASON_MAJOR_SOFTWARE": 196608,
    "SHTDN_REASON_MAJOR_APPLICATION": 262144,
    "SHTDN_REASON_MAJOR_SYSTEM": 327680,
    "SHTDN_REASON_MAJOR_POWER": 393216,
    "SHTDN_REASON_MAJOR_LEGACY_API": 458752,
    "SHTDN_REASON_MINOR_OTHER": 0,
    "SHTDN_REASON_MINOR_NONE": 255,
    "SHTDN_REASON_MINOR_MAINTENANCE": 1,
    "SHTDN_REASON_MINOR_INSTALLATION": 2,
    "SHTDN_REASON_MINOR_UPGRADE": 3,
    "SHTDN_REASON_MINOR_RECONFIG": 4,
    "SHTDN_REASON_MINOR_HUNG": 5,
    "SHTDN_REASON_MINOR_UNSTABLE": 6,
    "SHTDN_REASON_MINOR_DISK": 7,
    "SHTDN_REASON_MINOR_PROCESSOR": 8,
    "SHTDN_REASON_MINOR_NETWORKCARD": 9,
    "SHTDN_REASON_MINOR_POWER_SUPPLY": 10,
    "SHTDN_REASON_MINOR_CORDUNPLUGGED": 11,
    "SHTDN_REASON_MINOR_ENVIRONMENT": 12,
    "SHTDN_REASON_MINOR_HARDWARE_DRIVER": 13,
    "SHTDN_REASON_MINOR_OTHERDRIVER": 14,
    "SHTDN_REASON_MINOR_BLUESCREEN": 15,
    "SHTDN_REASON_MINOR_SERVICEPACK": 16,
    "SHTDN_REASON_MINOR_HOTFIX": 17,
    "SHTDN_REASON_MINOR_SECURITYFIX": 18,
    "SHTDN_REASON_MINOR_SECURITY": 19,
    "SHTDN_REASON_MINOR_NETWORK_CONNECTIVITY": 20,
    "SHTDN_REASON_MINOR_WMI": 21,
    "SHTDN_REASON_MINOR_SERVICEPACK_UNINSTALL": 22,
    "SHTDN_REASON_MINOR_HOTFIX_UNINSTALL": 23,
    "SHTDN_REASON_MINOR_SECURITYFIX_UNINSTALL": 24,
    "SHTDN_REASON_MINOR_MMC": 25,
    "SHTDN_REASON_MINOR_SYSTEMRESTORE": 26,
    "SHTDN_REASON_MINOR_TERMSRV": 32,
    "SHTDN_REASON_MINOR_DC_PROMOTION": 33,
    "SHTDN_REASON_MINOR_DC_DEMOTION": 34,
    "SHTDN_REASON_UNKNOWN": 255,
    "SHTDN_REASON_LEGACY_API": 2147942400,
    "SHTDN_REASON_VALID_BIT_MASK": 3238002687
  },
  "SHUTDOWN_FLAGS": {
    "SHUTDOWN_FORCE_OTHERS": 1,
    "SHUTDOWN_FORCE_SELF": 2,
    "SHUTDOWN_RESTART": 4,
    "SHUTDOWN_POWEROFF": 8,
    "SHUTDOWN_NOREBOOT": 16,
    "SHUTDOWN_GRACE_OVERRIDE": 32,
    "SHUTDOWN_INSTALL_UPDATES": 64,
    "SHUTDOWN_RESTARTAPPS": 128,
    "SHUTDOWN_SKIP_SVC_PRESHUTDOWN": 256,
    "SHUTDOWN_HYBRID": 512,
    "SHUTDOWN_RESTART_BOOTOPTIONS": 1024,
    "SHUTDOWN_SOFT_REBOOT": 2048,
    "SHUTDOWN_MOBILE_UI": 4096,
    "SHUTDOWN_ARSO": 8192,
    "SHUTDOWN_CHECK_SAFE_FOR_SERVER": 16384,
    "SHUTDOWN_VAIL_CONTAINER": 32768,
    "SHUTDOWN_SYSTEM_INITIATED": 65536,
    "SHUTDOWN_UPDATE_POWEROFF": 131072
  },
  "CREATE_PROCESS_LOGON_FLAGS": {
    "LOGON_WITH_PROFILE": 1,
    "LOGON_NETCREDENTIALS_ONLY": 2
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
  "SE_OBJECT_TYPE": {
    "SE_UNKNOWN_OBJECT_TYPE": 0,
    "SE_FILE_OBJECT": 1,
    "SE_SERVICE": 2,
    "SE_PRINTER": 3,
    "SE_REGISTRY_KEY": 4,
    "SE_LMSHARE": 5,
    "SE_KERNEL_OBJECT": 6,
    "SE_WINDOW_OBJECT": 7,
    "SE_DS_OBJECT": 8,
    "SE_DS_OBJECT_ALL": 9,
    "SE_PROVIDER_DEFINED_OBJECT": 10,
    "SE_WMIGUID_OBJECT": 11,
    "SE_REGISTRY_WOW64_32KEY": 12,
    "SE_REGISTRY_WOW64_64KEY": 13
  },
  "TRUSTEE_TYPE": {
    "TRUSTEE_IS_UNKNOWN": 0,
    "TRUSTEE_IS_USER": 1,
    "TRUSTEE_IS_GROUP": 2,
    "TRUSTEE_IS_DOMAIN": 3,
    "TRUSTEE_IS_ALIAS": 4,
    "TRUSTEE_IS_WELL_KNOWN_GROUP": 5,
    "TRUSTEE_IS_DELETED": 6,
    "TRUSTEE_IS_INVALID": 7,
    "TRUSTEE_IS_COMPUTER": 8
  },
  "TRUSTEE_FORM": {
    "TRUSTEE_IS_SID": 0,
    "TRUSTEE_IS_NAME": 1,
    "TRUSTEE_BAD_FORM": 2,
    "TRUSTEE_IS_OBJECTS_AND_SID": 3,
    "TRUSTEE_IS_OBJECTS_AND_NAME": 4
  },
  "MULTIPLE_TRUSTEE_OPERATION": {
    "NO_MULTIPLE_TRUSTEE": 0,
    "TRUSTEE_IS_IMPERSONATE": 1
  },
  "ACCESS_MODE": {
    "NOT_USED_ACCESS": 0,
    "GRANT_ACCESS": 1,
    "SET_ACCESS": 2,
    "DENY_ACCESS": 3,
    "REVOKE_ACCESS": 4,
    "SET_AUDIT_SUCCESS": 5,
    "SET_AUDIT_FAILURE": 6
  },
  "PROG_INVOKE_SETTING": {
    "ProgressInvokeNever": 1,
    "ProgressInvokeEveryObject": 2,
    "ProgressInvokeOnError": 3,
    "ProgressCancelOperation": 4,
    "ProgressRetryOperation": 5,
    "ProgressInvokePrePostError": 6
  },
  "CRED_MARSHAL_TYPE": {
    "CertCredential": 1,
    "UsernameTargetCredential": 2,
    "BinaryBlobCredential": 3,
    "UsernameForPackedCredentials": 4,
    "BinaryBlobForSystem": 5
  },
  "CRED_PROTECTION_TYPE": {
    "CredUnprotected": 0,
    "CredUserProtection": 1,
    "CredTrustedProtection": 2,
    "CredForSystemProtection": 3
  },
  "TRACE_LBR_CONFIGURATION": {
    "TRACE_LBR_CONFIGURATION_NONE": 0,
    "TRACE_LBR_CONFIGURATION_EXCLUDE_KERNEL": 1,
    "TRACE_LBR_CONFIGURATION_EXCLUDE_USER": 2,
    "TRACE_LBR_CONFIGURATION_EXCLUDE_JCC": 4,
    "TRACE_LBR_CONFIGURATION_EXCLUDE_NEAR_REL_CALL": 8,
    "TRACE_LBR_CONFIGURATION_EXCLUDE_NEAR_IND_CALL": 16,
    "TRACE_LBR_CONFIGURATION_EXCLUDE_NEAR_RET": 32,
    "TRACE_LBR_CONFIGURATION_EXCLUDE_NEAR_IND_JMP": 64,
    "TRACE_LBR_CONFIGURATION_EXCLUDE_NEAR_REL_JMP": 128,
    "TRACE_LBR_CONFIGURATION_EXCLUDE_FAR_BRANCH": 256,
    "TRACE_LBR_CONFIGURATION_CALLSTACK_ENABLE": 512,
    "TRACE_LBR_CONFIGURATION_SAMPLED": 1024
  },
  "TRACE_QUERY_INFO_CLASS": {
    "TraceGuidQueryList": 0,
    "TraceGuidQueryInfo": 1,
    "TraceGuidQueryProcess": 2,
    "TraceStackTracingInfo": 3,
    "TraceSystemTraceEnableFlagsInfo": 4,
    "TraceSampledProfileIntervalInfo": 5,
    "TraceProfileSourceConfigInfo": 6,
    "TraceProfileSourceListInfo": 7,
    "TracePmcEventListInfo": 8,
    "TracePmcCounterListInfo": 9,
    "TraceSetDisallowList": 10,
    "TraceVersionInfo": 11,
    "TraceGroupQueryList": 12,
    "TraceGroupQueryInfo": 13,
    "TraceDisallowListQuery": 14,
    "TraceInfoReserved15": 15,
    "TracePeriodicCaptureStateListInfo": 16,
    "TracePeriodicCaptureStateInfo": 17,
    "TraceProviderBinaryTracking": 18,
    "TraceMaxLoggersQuery": 19,
    "TraceLbrConfigurationInfo": 20,
    "TraceLbrEventListInfo": 21,
    "TraceMaxPmcCounterQuery": 22,
    "TraceStreamCount": 23,
    "TraceStackCachingInfo": 24,
    "TracePmcCounterOwners": 25,
    "TraceUnifiedStackCachingInfo": 26,
    "TracePmcSessionInformation": 27,
    "TraceContextRegisterInfo": 28,
    "MaxTraceSetInfoClass": 29
  },
  "ETW_PROCESS_HANDLE_INFO_TYPE": {
    "EtwQueryPartitionInformation": 1,
    "EtwQueryPartitionInformationV2": 2,
    "EtwQueryLastDroppedTimes": 3,
    "EtwQueryLogFileHeader": 4,
    "EtwQueryProcessHandleInfoMax": 5
  },
  "EVENT_INFO_CLASS": {
    "EventProviderBinaryTrackInfo": 0,
    "EventProviderSetReserved1": 1,
    "EventProviderSetTraits": 2,
    "EventProviderUseDescriptorType": 3,
    "MaxEventInfo": 4
  },
  "POLICY_AUDIT_EVENT_TYPE": {
    "AuditCategorySystem": 0,
    "AuditCategoryLogon": 1,
    "AuditCategoryObjectAccess": 2,
    "AuditCategoryPrivilegeUse": 3,
    "AuditCategoryDetailedTracking": 4,
    "AuditCategoryPolicyChange": 5,
    "AuditCategoryAccountManagement": 6,
    "AuditCategoryDirectoryServiceAccess": 7,
    "AuditCategoryAccountLogon": 8
  },
  "POLICY_INFORMATION_CLASS": {
    "PolicyAuditLogInformation": 1,
    "PolicyAuditEventsInformation": 2,
    "PolicyPrimaryDomainInformation": 3,
    "PolicyPdAccountInformation": 4,
    "PolicyAccountDomainInformation": 5,
    "PolicyLsaServerRoleInformation": 6,
    "PolicyReplicaSourceInformation": 7,
    "PolicyDefaultQuotaInformation": 8,
    "PolicyModificationInformation": 9,
    "PolicyAuditFullSetInformation": 10,
    "PolicyAuditFullQueryInformation": 11,
    "PolicyDnsDomainInformation": 12,
    "PolicyDnsDomainInformationInt": 13,
    "PolicyLocalAccountDomainInformation": 14,
    "PolicyMachineAccountInformation": 15,
    "PolicyMachineAccountInformation2": 16,
    "PolicyLastEntry": 17
  },
  "POLICY_DOMAIN_INFORMATION_CLASS": {
    "PolicyDomainEfsInformation": 2,
    "PolicyDomainKerberosTicketInformation": 3
  },
  "TRUSTED_INFORMATION_CLASS": {
    "TrustedDomainNameInformation": 1,
    "TrustedControllersInformation": 2,
    "TrustedPosixOffsetInformation": 3,
    "TrustedPasswordInformation": 4,
    "TrustedDomainInformationBasic": 5,
    "TrustedDomainInformationEx": 6,
    "TrustedDomainAuthInformation": 7,
    "TrustedDomainFullInformation": 8,
    "TrustedDomainAuthInformationInternal": 9,
    "TrustedDomainFullInformationInternal": 10,
    "TrustedDomainInformationEx2Internal": 11,
    "TrustedDomainFullInformation2Internal": 12,
    "TrustedDomainSupportedEncryptionTypes": 13,
    "TrustedDomainAuthInformationInternalAes": 14,
    "TrustedDomainFullInformationInternalAes": 15
  },
  "LSA_FOREST_TRUST_RECORD_TYPE": {
    "ForestTrustTopLevelName": 0,
    "ForestTrustTopLevelNameEx": 1,
    "ForestTrustDomainInfo": 2,
    "ForestTrustBinaryInfo": 3,
    "ForestTrustScannerInfo": 4,
    "ForestTrustRecordTypeLast": 4
  },
  "SAFER_POLICY_INFO_CLASS": {
    "SaferPolicyLevelList": 1,
    "SaferPolicyEnableTransparentEnforcement": 2,
    "SaferPolicyDefaultLevel": 3,
    "SaferPolicyEvaluateUserScope": 4,
    "SaferPolicyScopeFlags": 5,
    "SaferPolicyDefaultLevelFlags": 6,
    "SaferPolicyAuthenticodeEnabled": 7
  },
  "SAFER_OBJECT_INFO_CLASS": {
    "SaferObjectLevelId": 1,
    "SaferObjectScopeId": 2,
    "SaferObjectFriendlyName": 3,
    "SaferObjectDescription": 4,
    "SaferObjectBuiltin": 5,
    "SaferObjectDisallowed": 6,
    "SaferObjectDisableMaxPrivilege": 7,
    "SaferObjectInvertDeletedPrivileges": 8,
    "SaferObjectDeletedPrivileges": 9,
    "SaferObjectDefaultOwner": 10,
    "SaferObjectSidsToDisable": 11,
    "SaferObjectRestrictedSidsInverted": 12,
    "SaferObjectRestrictedSidsAdded": 13,
    "SaferObjectAllIdentificationGuids": 14,
    "SaferObjectSingleIdentification": 15,
    "SaferObjectExtendedError": 16
  },
  "SC_STATUS_TYPE": {
    "SC_STATUS_PROCESS_INFO": 0
  },
  "SC_ENUM_TYPE": {
    "SC_ENUM_PROCESS_INFO": 0
  },
  "SID_NAME_USE": {
    "SidTypeUser": 1,
    "SidTypeGroup": 2,
    "SidTypeDomain": 3,
    "SidTypeAlias": 4,
    "SidTypeWellKnownGroup": 5,
    "SidTypeDeletedAccount": 6,
    "SidTypeInvalid": 7,
    "SidTypeUnknown": 8,
    "SidTypeComputer": 9,
    "SidTypeLabel": 10,
    "SidTypeLogonSession": 11
  },
  "WELL_KNOWN_SID_TYPE": {
    "WinNullSid": 0,
    "WinWorldSid": 1,
    "WinLocalSid": 2,
    "WinCreatorOwnerSid": 3,
    "WinCreatorGroupSid": 4,
    "WinCreatorOwnerServerSid": 5,
    "WinCreatorGroupServerSid": 6,
    "WinNtAuthoritySid": 7,
    "WinDialupSid": 8,
    "WinNetworkSid": 9,
    "WinBatchSid": 10,
    "WinInteractiveSid": 11,
    "WinServiceSid": 12,
    "WinAnonymousSid": 13,
    "WinProxySid": 14,
    "WinEnterpriseControllersSid": 15,
    "WinSelfSid": 16,
    "WinAuthenticatedUserSid": 17,
    "WinRestrictedCodeSid": 18,
    "WinTerminalServerSid": 19,
    "WinRemoteLogonIdSid": 20,
    "WinLogonIdsSid": 21,
    "WinLocalSystemSid": 22,
    "WinLocalServiceSid": 23,
    "WinNetworkServiceSid": 24,
    "WinBuiltinDomainSid": 25,
    "WinBuiltinAdministratorsSid": 26,
    "WinBuiltinUsersSid": 27,
    "WinBuiltinGuestsSid": 28,
    "WinBuiltinPowerUsersSid": 29,
    "WinBuiltinAccountOperatorsSid": 30,
    "WinBuiltinSystemOperatorsSid": 31,
    "WinBuiltinPrintOperatorsSid": 32,
    "WinBuiltinBackupOperatorsSid": 33,
    "WinBuiltinReplicatorSid": 34,
    "WinBuiltinPreWindows2000CompatibleAccessSid": 35,
    "WinBuiltinRemoteDesktopUsersSid": 36,
    "WinBuiltinNetworkConfigurationOperatorsSid": 37,
    "WinAccountAdministratorSid": 38,
    "WinAccountGuestSid": 39,
    "WinAccountKrbtgtSid": 40,
    "WinAccountDomainAdminsSid": 41,
    "WinAccountDomainUsersSid": 42,
    "WinAccountDomainGuestsSid": 43,
    "WinAccountComputersSid": 44,
    "WinAccountControllersSid": 45,
    "WinAccountCertAdminsSid": 46,
    "WinAccountSchemaAdminsSid": 47,
    "WinAccountEnterpriseAdminsSid": 48,
    "WinAccountPolicyAdminsSid": 49,
    "WinAccountRasAndIasServersSid": 50,
    "WinNTLMAuthenticationSid": 51,
    "WinDigestAuthenticationSid": 52,
    "WinSChannelAuthenticationSid": 53,
    "WinThisOrganizationSid": 54,
    "WinOtherOrganizationSid": 55,
    "WinBuiltinIncomingForestTrustBuildersSid": 56,
    "WinBuiltinPerfMonitoringUsersSid": 57,
    "WinBuiltinPerfLoggingUsersSid": 58,
    "WinBuiltinAuthorizationAccessSid": 59,
    "WinBuiltinTerminalServerLicenseServersSid": 60,
    "WinBuiltinDCOMUsersSid": 61,
    "WinBuiltinIUsersSid": 62,
    "WinIUserSid": 63,
    "WinBuiltinCryptoOperatorsSid": 64,
    "WinUntrustedLabelSid": 65,
    "WinLowLabelSid": 66,
    "WinMediumLabelSid": 67,
    "WinHighLabelSid": 68,
    "WinSystemLabelSid": 69,
    "WinWriteRestrictedCodeSid": 70,
    "WinCreatorOwnerRightsSid": 71,
    "WinCacheablePrincipalsGroupSid": 72,
    "WinNonCacheablePrincipalsGroupSid": 73,
    "WinEnterpriseReadonlyControllersSid": 74,
    "WinAccountReadonlyControllersSid": 75,
    "WinBuiltinEventLogReadersGroup": 76,
    "WinNewEnterpriseReadonlyControllersSid": 77,
    "WinBuiltinCertSvcDComAccessGroup": 78,
    "WinMediumPlusLabelSid": 79,
    "WinLocalLogonSid": 80,
    "WinConsoleLogonSid": 81,
    "WinThisOrganizationCertificateSid": 82,
    "WinApplicationPackageAuthoritySid": 83,
    "WinBuiltinAnyPackageSid": 84,
    "WinCapabilityInternetClientSid": 85,
    "WinCapabilityInternetClientServerSid": 86,
    "WinCapabilityPrivateNetworkClientServerSid": 87,
    "WinCapabilityPicturesLibrarySid": 88,
    "WinCapabilityVideosLibrarySid": 89,
    "WinCapabilityMusicLibrarySid": 90,
    "WinCapabilityDocumentsLibrarySid": 91,
    "WinCapabilitySharedUserCertificatesSid": 92,
    "WinCapabilityEnterpriseAuthenticationSid": 93,
    "WinCapabilityRemovableStorageSid": 94,
    "WinBuiltinRDSRemoteAccessServersSid": 95,
    "WinBuiltinRDSEndpointServersSid": 96,
    "WinBuiltinRDSManagementServersSid": 97,
    "WinUserModeDriversSid": 98,
    "WinBuiltinHyperVAdminsSid": 99,
    "WinAccountCloneableControllersSid": 100,
    "WinBuiltinAccessControlAssistanceOperatorsSid": 101,
    "WinBuiltinRemoteManagementUsersSid": 102,
    "WinAuthenticationAuthorityAssertedSid": 103,
    "WinAuthenticationServiceAssertedSid": 104,
    "WinLocalAccountSid": 105,
    "WinLocalAccountAndAdministratorSid": 106,
    "WinAccountProtectedUsersSid": 107,
    "WinCapabilityAppointmentsSid": 108,
    "WinCapabilityContactsSid": 109,
    "WinAccountDefaultSystemManagedSid": 110,
    "WinBuiltinDefaultSystemManagedGroupSid": 111,
    "WinBuiltinStorageReplicaAdminsSid": 112,
    "WinAccountKeyAdminsSid": 113,
    "WinAccountEnterpriseKeyAdminsSid": 114,
    "WinAuthenticationKeyTrustSid": 115,
    "WinAuthenticationKeyPropertyMFASid": 116,
    "WinAuthenticationKeyPropertyAttestationSid": 117,
    "WinAuthenticationFreshKeyAuthSid": 118,
    "WinBuiltinDeviceOwnersSid": 119,
    "WinBuiltinUserModeHardwareOperatorsSid": 120,
    "WinBuiltinOpenSSHUsersSid": 121
  },
  "ACL_INFORMATION_CLASS": {
    "AclRevisionInformation": 1,
    "AclSizeInformation": 2
  },
  "AUDIT_EVENT_TYPE": {
    "AuditEventObjectAccess": 0,
    "AuditEventDirectoryServiceAccess": 1
  },
  "SECURITY_IMPERSONATION_LEVEL": {
    "SecurityAnonymous": 0,
    "SecurityIdentification": 1,
    "SecurityImpersonation": 2,
    "SecurityDelegation": 3
  },
  "TOKEN_TYPE": {
    "TokenPrimary": 1,
    "TokenImpersonation": 2
  },
  "TOKEN_INFORMATION_CLASS": {
    "TokenUser": 1,
    "TokenGroups": 2,
    "TokenPrivileges": 3,
    "TokenOwner": 4,
    "TokenPrimaryGroup": 5,
    "TokenDefaultDacl": 6,
    "TokenSource": 7,
    "TokenType": 8,
    "TokenImpersonationLevel": 9,
    "TokenStatistics": 10,
    "TokenRestrictedSids": 11,
    "TokenSessionId": 12,
    "TokenGroupsAndPrivileges": 13,
    "TokenSessionReference": 14,
    "TokenSandBoxInert": 15,
    "TokenAuditPolicy": 16,
    "TokenOrigin": 17,
    "TokenElevationType": 18,
    "TokenLinkedToken": 19,
    "TokenElevation": 20,
    "TokenHasRestrictions": 21,
    "TokenAccessInformation": 22,
    "TokenVirtualizationAllowed": 23,
    "TokenVirtualizationEnabled": 24,
    "TokenIntegrityLevel": 25,
    "TokenUIAccess": 26,
    "TokenMandatoryPolicy": 27,
    "TokenLogonSid": 28,
    "TokenIsAppContainer": 29,
    "TokenCapabilities": 30,
    "TokenAppContainerSid": 31,
    "TokenAppContainerNumber": 32,
    "TokenUserClaimAttributes": 33,
    "TokenDeviceClaimAttributes": 34,
    "TokenRestrictedUserClaimAttributes": 35,
    "TokenRestrictedDeviceClaimAttributes": 36,
    "TokenDeviceGroups": 37,
    "TokenRestrictedDeviceGroups": 38,
    "TokenSecurityAttributes": 39,
    "TokenIsRestricted": 40,
    "TokenProcessTrustLevel": 41,
    "TokenPrivateNameSpace": 42,
    "TokenSingletonAttributes": 43,
    "TokenBnoIsolation": 44,
    "TokenChildProcessFlags": 45,
    "TokenIsLessPrivilegedAppContainer": 46,
    "TokenIsSandboxed": 47,
    "TokenIsAppSilo": 48,
    "TokenLoggingInformation": 49,
    "TokenLearningMode": 50,
    "MaxTokenInfoClass": 51
  },
  "PerfRegInfoType": {
    "PERF_REG_COUNTERSET_STRUCT": 1,
    "PERF_REG_COUNTER_STRUCT": 2,
    "PERF_REG_COUNTERSET_NAME_STRING": 3,
    "PERF_REG_COUNTERSET_HELP_STRING": 4,
    "PERF_REG_COUNTER_NAME_STRINGS": 5,
    "PERF_REG_COUNTER_HELP_STRINGS": 6,
    "PERF_REG_PROVIDER_NAME": 7,
    "PERF_REG_PROVIDER_GUID": 8,
    "PERF_REG_COUNTERSET_ENGLISH_NAME": 9,
    "PERF_REG_COUNTER_ENGLISH_NAMES": 10
  }
} as const;
export const wideAliases = {
  "CryptAcquireContext": "CryptAcquireContextW",
  "CryptSignHash": "CryptSignHashW",
  "CryptVerifySignature": "CryptVerifySignatureW",
  "CryptSetProvider": "CryptSetProviderW",
  "CryptSetProviderEx": "CryptSetProviderExW",
  "CryptGetDefaultProvider": "CryptGetDefaultProviderW",
  "CryptEnumProviderTypes": "CryptEnumProviderTypesW",
  "CryptEnumProviders": "CryptEnumProvidersW",
  "StartTrace": "StartTraceW",
  "StopTrace": "StopTraceW",
  "QueryTrace": "QueryTraceW",
  "UpdateTrace": "UpdateTraceW",
  "FlushTrace": "FlushTraceW",
  "ControlTrace": "ControlTraceW",
  "QueryAllTraces": "QueryAllTracesW",
  "RegisterTraceGuids": "RegisterTraceGuidsW",
  "OpenTrace": "OpenTraceW",
  "EncryptFile": "EncryptFileW",
  "DecryptFile": "DecryptFileW",
  "FileEncryptionStatus": "FileEncryptionStatusW",
  "OpenEncryptedFileRaw": "OpenEncryptedFileRawW",
  "AuditLookupCategoryName": "AuditLookupCategoryNameW",
  "AuditLookupSubCategoryName": "AuditLookupSubCategoryNameW",
  "AuditSetGlobalSacl": "AuditSetGlobalSaclW",
  "AuditQueryGlobalSacl": "AuditQueryGlobalSaclW",
  "RegConnectRegistry": "RegConnectRegistryW",
  "RegConnectRegistryEx": "RegConnectRegistryExW",
  "RegCreateKey": "RegCreateKeyW",
  "RegCreateKeyEx": "RegCreateKeyExW",
  "RegCreateKeyTransacted": "RegCreateKeyTransactedW",
  "RegDeleteKey": "RegDeleteKeyW",
  "RegDeleteKeyEx": "RegDeleteKeyExW",
  "RegDeleteKeyTransacted": "RegDeleteKeyTransactedW",
  "RegDeleteValue": "RegDeleteValueW",
  "RegEnumKey": "RegEnumKeyW",
  "RegEnumKeyEx": "RegEnumKeyExW",
  "RegEnumValue": "RegEnumValueW",
  "RegLoadKey": "RegLoadKeyW",
  "RegOpenKey": "RegOpenKeyW",
  "RegOpenKeyEx": "RegOpenKeyExW",
  "RegOpenKeyTransacted": "RegOpenKeyTransactedW",
  "RegQueryInfoKey": "RegQueryInfoKeyW",
  "RegQueryValue": "RegQueryValueW",
  "RegQueryMultipleValues": "RegQueryMultipleValuesW",
  "RegQueryValueEx": "RegQueryValueExW",
  "RegReplaceKey": "RegReplaceKeyW",
  "RegRestoreKey": "RegRestoreKeyW",
  "RegSaveKey": "RegSaveKeyW",
  "RegSetValue": "RegSetValueW",
  "RegSetValueEx": "RegSetValueExW",
  "RegUnLoadKey": "RegUnLoadKeyW",
  "RegDeleteKeyValue": "RegDeleteKeyValueW",
  "RegSetKeyValue": "RegSetKeyValueW",
  "RegDeleteTree": "RegDeleteTreeW",
  "RegCopyTree": "RegCopyTreeW",
  "RegGetValue": "RegGetValueW",
  "RegLoadMUIString": "RegLoadMUIStringW",
  "RegLoadAppKey": "RegLoadAppKeyW",
  "RegSaveKeyEx": "RegSaveKeyExW",
  "AccessCheckAndAuditAlarm": "AccessCheckAndAuditAlarmW",
  "AccessCheckByTypeAndAuditAlarm": "AccessCheckByTypeAndAuditAlarmW",
  "AccessCheckByTypeResultListAndAuditAlarm": "AccessCheckByTypeResultListAndAuditAlarmW",
  "AccessCheckByTypeResultListAndAuditAlarmByHandle": "AccessCheckByTypeResultListAndAuditAlarmByHandleW",
  "ObjectOpenAuditAlarm": "ObjectOpenAuditAlarmW",
  "ObjectPrivilegeAuditAlarm": "ObjectPrivilegeAuditAlarmW",
  "ObjectCloseAuditAlarm": "ObjectCloseAuditAlarmW",
  "ObjectDeleteAuditAlarm": "ObjectDeleteAuditAlarmW",
  "PrivilegedServiceAuditAlarm": "PrivilegedServiceAuditAlarmW",
  "SetFileSecurity": "SetFileSecurityW",
  "GetFileSecurity": "GetFileSecurityW",
  "LookupAccountSid": "LookupAccountSidW",
  "LookupAccountName": "LookupAccountNameW",
  "LookupPrivilegeValue": "LookupPrivilegeValueW",
  "LookupPrivilegeName": "LookupPrivilegeNameW",
  "LookupPrivilegeDisplayName": "LookupPrivilegeDisplayNameW",
  "LogonUser": "LogonUserW",
  "LogonUserEx": "LogonUserExW",
  "CredWrite": "CredWriteW",
  "CredRead": "CredReadW",
  "CredEnumerate": "CredEnumerateW",
  "CredWriteDomainCredentials": "CredWriteDomainCredentialsW",
  "CredReadDomainCredentials": "CredReadDomainCredentialsW",
  "CredDelete": "CredDeleteW",
  "CredRename": "CredRenameW",
  "CredGetTargetInfo": "CredGetTargetInfoW",
  "CredMarshalCredential": "CredMarshalCredentialW",
  "CredUnmarshalCredential": "CredUnmarshalCredentialW",
  "CredIsMarshaledCredential": "CredIsMarshaledCredentialW",
  "CredProtect": "CredProtectW",
  "CredUnprotect": "CredUnprotectW",
  "CredIsProtected": "CredIsProtectedW",
  "CredFindBestCredential": "CredFindBestCredentialW",
  "ChangeServiceConfig": "ChangeServiceConfigW",
  "ChangeServiceConfig2": "ChangeServiceConfig2W",
  "CreateService": "CreateServiceW",
  "EnumDependentServices": "EnumDependentServicesW",
  "EnumServicesStatus": "EnumServicesStatusW",
  "EnumServicesStatusEx": "EnumServicesStatusExW",
  "GetServiceKeyName": "GetServiceKeyNameW",
  "GetServiceDisplayName": "GetServiceDisplayNameW",
  "OpenSCManager": "OpenSCManagerW",
  "OpenService": "OpenServiceW",
  "QueryServiceConfig": "QueryServiceConfigW",
  "QueryServiceConfig2": "QueryServiceConfig2W",
  "QueryServiceLockStatus": "QueryServiceLockStatusW",
  "RegisterServiceCtrlHandler": "RegisterServiceCtrlHandlerW",
  "RegisterServiceCtrlHandlerEx": "RegisterServiceCtrlHandlerExW",
  "StartServiceCtrlDispatcher": "StartServiceCtrlDispatcherW",
  "StartService": "StartServiceW",
  "NotifyServiceStatusChange": "NotifyServiceStatusChangeW",
  "ControlServiceEx": "ControlServiceExW",
  "CreateProcessAsUser": "CreateProcessAsUserW",
  "SetEntriesInAcl": "SetEntriesInAclW",
  "GetExplicitEntriesFromAcl": "GetExplicitEntriesFromAclW",
  "GetEffectiveRightsFromAcl": "GetEffectiveRightsFromAclW",
  "GetAuditedPermissionsFromAcl": "GetAuditedPermissionsFromAclW",
  "GetNamedSecurityInfo": "GetNamedSecurityInfoW",
  "SetNamedSecurityInfo": "SetNamedSecurityInfoW",
  "GetInheritanceSource": "GetInheritanceSourceW",
  "TreeResetNamedSecurityInfo": "TreeResetNamedSecurityInfoW",
  "TreeSetNamedSecurityInfo": "TreeSetNamedSecurityInfoW",
  "BuildSecurityDescriptor": "BuildSecurityDescriptorW",
  "LookupSecurityDescriptorParts": "LookupSecurityDescriptorPartsW",
  "BuildExplicitAccessWithName": "BuildExplicitAccessWithNameW",
  "BuildImpersonateExplicitAccessWithName": "BuildImpersonateExplicitAccessWithNameW",
  "BuildTrusteeWithName": "BuildTrusteeWithNameW",
  "BuildImpersonateTrustee": "BuildImpersonateTrusteeW",
  "BuildTrusteeWithSid": "BuildTrusteeWithSidW",
  "BuildTrusteeWithObjectsAndSid": "BuildTrusteeWithObjectsAndSidW",
  "BuildTrusteeWithObjectsAndName": "BuildTrusteeWithObjectsAndNameW",
  "GetTrusteeName": "GetTrusteeNameW",
  "GetTrusteeType": "GetTrusteeTypeW",
  "GetTrusteeForm": "GetTrusteeFormW",
  "GetMultipleTrusteeOperation": "GetMultipleTrusteeOperationW",
  "GetMultipleTrustee": "GetMultipleTrusteeW",
  "ConvertSidToStringSid": "ConvertSidToStringSidW",
  "ConvertStringSidToSid": "ConvertStringSidToSidW",
  "ConvertStringSecurityDescriptorToSecurityDescriptor": "ConvertStringSecurityDescriptorToSecurityDescriptorW",
  "ConvertSecurityDescriptorToStringSecurityDescriptor": "ConvertSecurityDescriptorToStringSecurityDescriptorW",
  "ClearEventLog": "ClearEventLogW",
  "BackupEventLog": "BackupEventLogW",
  "OpenEventLog": "OpenEventLogW",
  "RegisterEventSource": "RegisterEventSourceW",
  "OpenBackupEventLog": "OpenBackupEventLogW",
  "ReadEventLog": "ReadEventLogW",
  "ReportEvent": "ReportEventW",
  "InitiateSystemShutdown": "InitiateSystemShutdownW",
  "AbortSystemShutdown": "AbortSystemShutdownW",
  "InitiateSystemShutdownEx": "InitiateSystemShutdownExW",
  "InitiateShutdown": "InitiateShutdownW",
  "GetUserName": "GetUserNameW",
  "GetCurrentHwProfile": "GetCurrentHwProfileW"
} as const;
export const signatures = {
  "advapi32.dll": {
    "CryptAcquireContextA": {
      "args": [
        "usize*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptAcquireContextW": {
      "args": [
        "usize*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptReleaseContext": {
      "args": [
        "usize",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptGenKey": {
      "args": [
        "usize",
        "Windows.Win32.Security.Cryptography.ALG_ID",
        "Windows.Win32.Security.Cryptography.CRYPT_KEY_FLAGS",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptDeriveKey": {
      "args": [
        "usize",
        "Windows.Win32.Security.Cryptography.ALG_ID",
        "usize",
        "u32",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptDestroyKey": {
      "args": [
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptSetKeyParam": {
      "args": [
        "usize",
        "Windows.Win32.Security.Cryptography.CRYPT_KEY_PARAM_ID",
        "u8*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptGetKeyParam": {
      "args": [
        "usize",
        "Windows.Win32.Security.Cryptography.CRYPT_KEY_PARAM_ID",
        "u8*",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptSetHashParam": {
      "args": [
        "usize",
        "Windows.Win32.Security.Cryptography.CRYPT_SET_HASH_PARAM",
        "u8*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptGetHashParam": {
      "args": [
        "usize",
        "u32",
        "u8*",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptSetProvParam": {
      "args": [
        "usize",
        "Windows.Win32.Security.Cryptography.CRYPT_SET_PROV_PARAM_ID",
        "u8*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptGetProvParam": {
      "args": [
        "usize",
        "u32",
        "u8*",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptGenRandom": {
      "args": [
        "usize",
        "u32",
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptGetUserKey": {
      "args": [
        "usize",
        "u32",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptExportKey": {
      "args": [
        "usize",
        "usize",
        "u32",
        "Windows.Win32.Security.Cryptography.CRYPT_KEY_FLAGS",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptImportKey": {
      "args": [
        "usize",
        "u8*",
        "u32",
        "usize",
        "Windows.Win32.Security.Cryptography.CRYPT_KEY_FLAGS",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptEncrypt": {
      "args": [
        "usize",
        "usize",
        "Windows.Win32.Foundation.BOOL",
        "u32",
        "u8*",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptDecrypt": {
      "args": [
        "usize",
        "usize",
        "Windows.Win32.Foundation.BOOL",
        "u32",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptCreateHash": {
      "args": [
        "usize",
        "Windows.Win32.Security.Cryptography.ALG_ID",
        "usize",
        "u32",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptHashData": {
      "args": [
        "usize",
        "u8*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptHashSessionKey": {
      "args": [
        "usize",
        "usize",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptDestroyHash": {
      "args": [
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptSignHashA": {
      "args": [
        "usize",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptSignHashW": {
      "args": [
        "usize",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptVerifySignatureA": {
      "args": [
        "usize",
        "u8*",
        "u32",
        "usize",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptVerifySignatureW": {
      "args": [
        "usize",
        "u8*",
        "u32",
        "usize",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptSetProviderA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptSetProviderW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptSetProviderExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptSetProviderExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptGetDefaultProviderA": {
      "args": [
        "u32",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptGetDefaultProviderW": {
      "args": [
        "u32",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptEnumProviderTypesA": {
      "args": [
        "u32",
        "u32*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptEnumProviderTypesW": {
      "args": [
        "u32",
        "u32*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptEnumProvidersA": {
      "args": [
        "u32",
        "u32*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptEnumProvidersW": {
      "args": [
        "u32",
        "u32*",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptContextAddRef": {
      "args": [
        "usize",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptDuplicateKey": {
      "args": [
        "usize",
        "u32*",
        "u32",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CryptDuplicateHash": {
      "args": [
        "usize",
        "u32*",
        "u32",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OpenThreadWaitChainSession": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.OPEN_THREAD_WAIT_CHAIN_SESSION_FLAGS",
        "Windows.Win32.System.Diagnostics.Debug.PWAITCHAINCALLBACK"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "CloseThreadWaitChainSession": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetThreadWaitChain": {
      "args": [
        "void*",
        "usize",
        "Windows.Win32.System.Diagnostics.Debug.WAIT_CHAIN_THREAD_OPTIONS",
        "u32",
        "u32*",
        "Windows.Win32.System.Diagnostics.Debug.WAITCHAIN_NODE_INFO*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterWaitChainCOMCallback": {
      "args": [
        "Windows.Win32.System.Diagnostics.Debug.PCOGETCALLSTATE",
        "Windows.Win32.System.Diagnostics.Debug.PCOGETACTIVATIONSTATE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "StartTraceW": {
      "args": [
        "u64*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "StartTraceA": {
      "args": [
        "u64*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "StopTraceW": {
      "args": [
        "u64",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "StopTraceA": {
      "args": [
        "u64",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "QueryTraceW": {
      "args": [
        "u64",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "QueryTraceA": {
      "args": [
        "u64",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "UpdateTraceW": {
      "args": [
        "u64",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "UpdateTraceA": {
      "args": [
        "u64",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "FlushTraceW": {
      "args": [
        "u64",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "FlushTraceA": {
      "args": [
        "u64",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ControlTraceW": {
      "args": [
        "u64",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_CONTROL"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ControlTraceA": {
      "args": [
        "u64",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES*",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_CONTROL"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "QueryAllTracesW": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES**",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "QueryAllTracesA": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_PROPERTIES**",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "EnableTrace": {
      "args": [
        "u32",
        "u32",
        "u32",
        "System.Guid*",
        "u64"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "EnableTraceEx": {
      "args": [
        "System.Guid*",
        "System.Guid*",
        "u64",
        "u32",
        "u8",
        "u64",
        "u64",
        "u32",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_FILTER_DESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "EnableTraceEx2": {
      "args": [
        "u64",
        "System.Guid*",
        "u32",
        "u8",
        "u64",
        "u64",
        "u32",
        "Windows.Win32.System.Diagnostics.Etw.ENABLE_TRACE_PARAMETERS*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "EnumerateTraceGuidsEx": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.TRACE_QUERY_INFO_CLASS",
        "void*",
        "u32",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TraceSetInformation": {
      "args": [
        "u64",
        "Windows.Win32.System.Diagnostics.Etw.TRACE_QUERY_INFO_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TraceQueryInformation": {
      "args": [
        "u64",
        "Windows.Win32.System.Diagnostics.Etw.TRACE_QUERY_INFO_CLASS",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TraceConfigureLastBranchRecord": {
      "args": [
        "u64",
        "Windows.Win32.System.Diagnostics.Etw.TRACE_LBR_CONFIGURATION",
        "Windows.Win32.System.Diagnostics.Etw.CLASSIC_EVENT_ID*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateTraceInstanceId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_INSTANCE_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TraceEvent": {
      "args": [
        "u64",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_HEADER*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TraceEventInstance": {
      "args": [
        "u64",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_INSTANCE_HEADER*",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_INSTANCE_INFO*",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_INSTANCE_INFO*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RegisterTraceGuidsW": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.WMIDPREQUEST",
        "void*",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Diagnostics.Etw.TRACE_GUID_REGISTRATION*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u64*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RegisterTraceGuidsA": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.WMIDPREQUEST",
        "void*",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Diagnostics.Etw.TRACE_GUID_REGISTRATION*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u64*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EnumerateTraceGuids": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.TRACE_GUID_PROPERTIES**",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "UnregisterTraceGuids": {
      "args": [
        "u64"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTraceLoggerHandle": {
      "args": [
        "void*"
      ],
      "returns": "u64",
      "setLastError": false
    },
    "GetTraceEnableLevel": {
      "args": [
        "u64"
      ],
      "returns": "u8",
      "setLastError": false
    },
    "GetTraceEnableFlags": {
      "args": [
        "u64"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "OpenTraceW": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_LOGFILEW*"
      ],
      "returns": "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE",
      "setLastError": false
    },
    "ProcessTrace": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE*",
        "u32",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "CloseTrace": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "OpenTraceFromBufferStream": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.ETW_OPEN_TRACE_OPTIONS*",
        "Windows.Win32.System.Diagnostics.Etw.PETW_BUFFER_COMPLETION_CALLBACK",
        "void*"
      ],
      "returns": "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE",
      "setLastError": false
    },
    "OpenTraceFromRealTimeLogger": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Diagnostics.Etw.ETW_OPEN_TRACE_OPTIONS*",
        "Windows.Win32.System.Diagnostics.Etw.TRACE_LOGFILE_HEADER*"
      ],
      "returns": "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE",
      "setLastError": false
    },
    "OpenTraceFromRealTimeLoggerWithAllocationOptions": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Diagnostics.Etw.ETW_OPEN_TRACE_OPTIONS*",
        "usize",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Diagnostics.Etw.TRACE_LOGFILE_HEADER*"
      ],
      "returns": "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE",
      "setLastError": false
    },
    "OpenTraceFromFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Diagnostics.Etw.ETW_OPEN_TRACE_OPTIONS*",
        "Windows.Win32.System.Diagnostics.Etw.TRACE_LOGFILE_HEADER*"
      ],
      "returns": "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE",
      "setLastError": false
    },
    "ProcessTraceBufferIncrementReference": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE",
        "Windows.Win32.System.Diagnostics.Etw.ETW_BUFFER_HEADER*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ProcessTraceBufferDecrementReference": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.ETW_BUFFER_HEADER*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ProcessTraceAddBufferToBufferStream": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE",
        "Windows.Win32.System.Diagnostics.Etw.ETW_BUFFER_HEADER*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "QueryTraceProcessingHandle": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE",
        "Windows.Win32.System.Diagnostics.Etw.ETW_PROCESS_HANDLE_INFO_TYPE",
        "void*",
        "u32",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "OpenTraceA": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.EVENT_TRACE_LOGFILEA*"
      ],
      "returns": "Windows.Win32.System.Diagnostics.Etw.PROCESSTRACE_HANDLE",
      "setLastError": false
    },
    "SetTraceCallback": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Diagnostics.Etw.PEVENT_CALLBACK"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RemoveTraceCallback": {
      "args": [
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TraceMessage": {
      "args": [
        "u64",
        "Windows.Win32.System.Diagnostics.Etw.TRACE_MESSAGE_FLAGS",
        "System.Guid*",
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TraceMessageVa": {
      "args": [
        "u64",
        "Windows.Win32.System.Diagnostics.Etw.TRACE_MESSAGE_FLAGS",
        "System.Guid*",
        "u16",
        "i8*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "EventRegister": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Diagnostics.Etw.PENABLECALLBACK",
        "void*",
        "Windows.Win32.System.Diagnostics.Etw.REGHANDLE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EventUnregister": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.REGHANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EventSetInformation": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.REGHANDLE",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_INFO_CLASS",
        "void*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EventEnabled": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.REGHANDLE",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_DESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "EventProviderEnabled": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.REGHANDLE",
        "u8",
        "u64"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "EventWrite": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.REGHANDLE",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_DESCRIPTOR*",
        "u32",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_DATA_DESCRIPTOR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EventWriteTransfer": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.REGHANDLE",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_DESCRIPTOR*",
        "System.Guid*",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_DATA_DESCRIPTOR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EventWriteEx": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.REGHANDLE",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_DESCRIPTOR*",
        "u64",
        "u32",
        "System.Guid*",
        "System.Guid*",
        "u32",
        "Windows.Win32.System.Diagnostics.Etw.EVENT_DATA_DESCRIPTOR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EventWriteString": {
      "args": [
        "Windows.Win32.System.Diagnostics.Etw.REGHANDLE",
        "u8",
        "u64",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EventActivityIdControl": {
      "args": [
        "u32",
        "System.Guid*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EventAccessControl": {
      "args": [
        "System.Guid*",
        "u32",
        "Windows.Win32.Security.PSID",
        "u32",
        "Windows.Win32.Foundation.BOOLEAN"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EventAccessQuery": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EventAccessRemove": {
      "args": [
        "System.Guid*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CveEventWrite": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "QueryUsersOnEncryptedFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.ENCRYPTION_CERTIFICATE_HASH_LIST**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "QueryRecoveryAgentsOnEncryptedFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.ENCRYPTION_CERTIFICATE_HASH_LIST**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RemoveUsersFromEncryptedFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.ENCRYPTION_CERTIFICATE_HASH_LIST*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "AddUsersToEncryptedFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.ENCRYPTION_CERTIFICATE_LIST*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetUserFileEncryptionKey": {
      "args": [
        "Windows.Win32.Storage.FileSystem.ENCRYPTION_CERTIFICATE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetUserFileEncryptionKeyEx": {
      "args": [
        "Windows.Win32.Storage.FileSystem.ENCRYPTION_CERTIFICATE*",
        "u32",
        "u32",
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FreeEncryptionCertificateHashList": {
      "args": [
        "Windows.Win32.Storage.FileSystem.ENCRYPTION_CERTIFICATE_HASH_LIST*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EncryptionDisable": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DuplicateEncryptionInfoFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetEncryptedFileMetadata": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "u8**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetEncryptedFileMetadata": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u8*",
        "u8*",
        "Windows.Win32.Storage.FileSystem.ENCRYPTION_CERTIFICATE_HASH*",
        "u32",
        "Windows.Win32.Storage.FileSystem.ENCRYPTION_CERTIFICATE_HASH_LIST*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FreeEncryptedFileMetadata": {
      "args": [
        "u8*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EncryptFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EncryptFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DecryptFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DecryptFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FileEncryptionStatusA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FileEncryptionStatusW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OpenEncryptedFileRawA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "void**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "OpenEncryptedFileRawW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "void**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ReadEncryptedFileRaw": {
      "args": [
        "Windows.Win32.Storage.FileSystem.PFE_EXPORT_FUNC",
        "void*",
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "WriteEncryptedFileRaw": {
      "args": [
        "Windows.Win32.Storage.FileSystem.PFE_IMPORT_FUNC",
        "void*",
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CloseEncryptedFileRaw": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "IsTextUnicode": {
      "args": [
        "void*",
        "i32",
        "Windows.Win32.Globalization.IS_TEXT_UNICODE_RESULT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SystemFunction036": {
      "args": [
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "SystemFunction040": {
      "args": [
        "void*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "SystemFunction041": {
      "args": [
        "void*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaFreeMemory": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaClose": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaOpenPolicy": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.LSA_OBJECT_ATTRIBUTES*",
        "u32",
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaSetCAPs": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaGetAppliedCAPIDs": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.PSID**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaQueryCAPs": {
      "args": [
        "Windows.Win32.Security.PSID*",
        "u32",
        "Windows.Win32.Security.Authentication.Identity.CENTRAL_ACCESS_POLICY**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaQueryInformationPolicy": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.POLICY_INFORMATION_CLASS",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaSetInformationPolicy": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.POLICY_INFORMATION_CLASS",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaQueryDomainInformationPolicy": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.POLICY_DOMAIN_INFORMATION_CLASS",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaSetDomainInformationPolicy": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.POLICY_DOMAIN_INFORMATION_CLASS",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaEnumerateTrustedDomains": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "u32*",
        "void**",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaLookupNames": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "u32",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.LSA_REFERENCED_DOMAIN_LIST**",
        "Windows.Win32.Security.Authentication.Identity.LSA_TRANSLATED_SID**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaLookupNames2": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "u32",
        "u32",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.LSA_REFERENCED_DOMAIN_LIST**",
        "Windows.Win32.Security.Authentication.Identity.LSA_TRANSLATED_SID2**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaLookupSids": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "u32",
        "Windows.Win32.Security.PSID*",
        "Windows.Win32.Security.Authentication.Identity.LSA_REFERENCED_DOMAIN_LIST**",
        "Windows.Win32.Security.Authentication.Identity.LSA_TRANSLATED_NAME**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaLookupSids2": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "u32",
        "u32",
        "Windows.Win32.Security.PSID*",
        "Windows.Win32.Security.Authentication.Identity.LSA_REFERENCED_DOMAIN_LIST**",
        "Windows.Win32.Security.Authentication.Identity.LSA_TRANSLATED_NAME**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaEnumerateAccountsWithUserRight": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "void**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaEnumerateAccountRights": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaAddAccountRights": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaRemoveAccountRights": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaOpenTrustedDomainByName": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "u32",
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaQueryTrustedDomainInfo": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.Authentication.Identity.TRUSTED_INFORMATION_CLASS",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaSetTrustedDomainInformation": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.Authentication.Identity.TRUSTED_INFORMATION_CLASS",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaDeleteTrustedDomain": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaQueryTrustedDomainInfoByName": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.TRUSTED_INFORMATION_CLASS",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaSetTrustedDomainInfoByName": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.TRUSTED_INFORMATION_CLASS",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaEnumerateTrustedDomainsEx": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "u32*",
        "void**",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaCreateTrustedDomainEx": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.TRUSTED_DOMAIN_INFORMATION_EX*",
        "Windows.Win32.Security.Authentication.Identity.TRUSTED_DOMAIN_AUTH_INFORMATION*",
        "u32",
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaQueryForestTrustInformation": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.LSA_FOREST_TRUST_INFORMATION**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaSetForestTrustInformation": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.LSA_FOREST_TRUST_INFORMATION*",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Security.Authentication.Identity.LSA_FOREST_TRUST_COLLISION_INFORMATION**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaStorePrivateData": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaRetrievePrivateData": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaNtStatusToWinError": {
      "args": [
        "Windows.Win32.Foundation.NTSTATUS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "LsaQueryForestTrustInformation2": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.LSA_FOREST_TRUST_RECORD_TYPE",
        "Windows.Win32.Security.Authentication.Identity.LSA_FOREST_TRUST_INFORMATION2**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "LsaSetForestTrustInformation2": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.LSA_HANDLE",
        "Windows.Win32.Security.Authentication.Identity.LSA_UNICODE_STRING*",
        "Windows.Win32.Security.Authentication.Identity.LSA_FOREST_TRUST_RECORD_TYPE",
        "Windows.Win32.Security.Authentication.Identity.LSA_FOREST_TRUST_INFORMATION2*",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Security.Authentication.Identity.LSA_FOREST_TRUST_COLLISION_INFORMATION**"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "AuditSetSystemPolicy": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.AUDIT_POLICY_INFORMATION*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditSetPerUserPolicy": {
      "args": [
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.Authentication.Identity.AUDIT_POLICY_INFORMATION*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditQuerySystemPolicy": {
      "args": [
        "System.Guid*",
        "u32",
        "Windows.Win32.Security.Authentication.Identity.AUDIT_POLICY_INFORMATION**"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditQueryPerUserPolicy": {
      "args": [
        "Windows.Win32.Security.PSID",
        "System.Guid*",
        "u32",
        "Windows.Win32.Security.Authentication.Identity.AUDIT_POLICY_INFORMATION**"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditEnumeratePerUserPolicy": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.POLICY_AUDIT_SID_ARRAY**"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditComputeEffectivePolicyBySid": {
      "args": [
        "Windows.Win32.Security.PSID",
        "System.Guid*",
        "u32",
        "Windows.Win32.Security.Authentication.Identity.AUDIT_POLICY_INFORMATION**"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditComputeEffectivePolicyByToken": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "System.Guid*",
        "u32",
        "Windows.Win32.Security.Authentication.Identity.AUDIT_POLICY_INFORMATION**"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditEnumerateCategories": {
      "args": [
        "System.Guid**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditEnumerateSubCategories": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.BOOLEAN",
        "System.Guid**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditLookupCategoryNameW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditLookupCategoryNameA": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditLookupSubCategoryNameW": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditLookupSubCategoryNameA": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Foundation.PSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditLookupCategoryIdFromCategoryGuid": {
      "args": [
        "System.Guid*",
        "Windows.Win32.Security.Authentication.Identity.POLICY_AUDIT_EVENT_TYPE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditLookupCategoryGuidFromCategoryId": {
      "args": [
        "Windows.Win32.Security.Authentication.Identity.POLICY_AUDIT_EVENT_TYPE",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditSetSecurity": {
      "args": [
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditQuerySecurity": {
      "args": [
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditSetGlobalSaclW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.ACL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditSetGlobalSaclA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.ACL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditQueryGlobalSaclW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.ACL**"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditQueryGlobalSaclA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.ACL**"
      ],
      "returns": "Windows.Win32.Foundation.BOOLEAN",
      "setLastError": false
    },
    "AuditFree": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RegCloseKey": {
      "args": [
        "Windows.Win32.System.Registry.HKEY"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegOverridePredefKey": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.System.Registry.HKEY"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegOpenUserClassesRoot": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegOpenCurrentUser": {
      "args": [
        "u32",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDisablePredefinedCache": {
      "args": [],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDisablePredefinedCacheEx": {
      "args": [],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegConnectRegistryA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegConnectRegistryW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegConnectRegistryExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Registry.HKEY",
        "u32",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RegConnectRegistryExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.HKEY",
        "u32",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RegCreateKeyA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegCreateKeyW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegCreateKeyExA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Registry.REG_OPEN_CREATE_OPTIONS",
        "Windows.Win32.System.Registry.REG_SAM_FLAGS",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Registry.HKEY*",
        "Windows.Win32.System.Registry.REG_CREATE_KEY_DISPOSITION*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegCreateKeyExW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.REG_OPEN_CREATE_OPTIONS",
        "Windows.Win32.System.Registry.REG_SAM_FLAGS",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Registry.HKEY*",
        "Windows.Win32.System.Registry.REG_CREATE_KEY_DISPOSITION*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegCreateKeyTransactedA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Registry.REG_OPEN_CREATE_OPTIONS",
        "Windows.Win32.System.Registry.REG_SAM_FLAGS",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Registry.HKEY*",
        "Windows.Win32.System.Registry.REG_CREATE_KEY_DISPOSITION*",
        "Windows.Win32.Foundation.HANDLE",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegCreateKeyTransactedW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.REG_OPEN_CREATE_OPTIONS",
        "Windows.Win32.System.Registry.REG_SAM_FLAGS",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Registry.HKEY*",
        "Windows.Win32.System.Registry.REG_CREATE_KEY_DISPOSITION*",
        "Windows.Win32.Foundation.HANDLE",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteKeyA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteKeyW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteKeyExA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteKeyExW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteKeyTransactedA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32",
        "Windows.Win32.Foundation.HANDLE",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteKeyTransactedW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32",
        "Windows.Win32.Foundation.HANDLE",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDisableReflectionKey": {
      "args": [
        "Windows.Win32.System.Registry.HKEY"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegEnableReflectionKey": {
      "args": [
        "Windows.Win32.System.Registry.HKEY"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegQueryReflectionKey": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteValueA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteValueW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegEnumKeyA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegEnumKeyW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegEnumKeyExA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegEnumKeyExW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegEnumValueA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "u32*",
        "u32*",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegEnumValueW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "u32*",
        "u32*",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegFlushKey": {
      "args": [
        "Windows.Win32.System.Registry.HKEY"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegGetKeySecurity": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegLoadKeyA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegLoadKeyW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegNotifyChangeKeyValue": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Registry.REG_NOTIFY_FILTER",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegOpenKeyA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegOpenKeyW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegOpenKeyExA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.System.Registry.REG_SAM_FLAGS",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegOpenKeyExW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.System.Registry.REG_SAM_FLAGS",
        "Windows.Win32.System.Registry.HKEY*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegOpenKeyTransactedA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.System.Registry.REG_SAM_FLAGS",
        "Windows.Win32.System.Registry.HKEY*",
        "Windows.Win32.Foundation.HANDLE",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegOpenKeyTransactedW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.System.Registry.REG_SAM_FLAGS",
        "Windows.Win32.System.Registry.HKEY*",
        "Windows.Win32.Foundation.HANDLE",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegQueryInfoKeyA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegQueryInfoKeyW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.FILETIME*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegQueryValueA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegQueryValueW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegQueryMultipleValuesA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.System.Registry.VALENTA*",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegQueryMultipleValuesW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.System.Registry.VALENTW*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegQueryValueExA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "Windows.Win32.System.Registry.REG_VALUE_TYPE*",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegQueryValueExW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.System.Registry.REG_VALUE_TYPE*",
        "u8*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegReplaceKeyA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegReplaceKeyW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegRestoreKeyA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegRestoreKeyW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegRenameKey": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSaveKeyA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSaveKeyW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSetKeySecurity": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSetValueA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Registry.REG_VALUE_TYPE",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSetValueW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.REG_VALUE_TYPE",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSetValueExA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.System.Registry.REG_VALUE_TYPE",
        "u8*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSetValueExW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.System.Registry.REG_VALUE_TYPE",
        "u8*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegUnLoadKeyA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegUnLoadKeyW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteKeyValueA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteKeyValueW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSetKeyValueA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSetKeyValueW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteTreeA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegDeleteTreeW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegCopyTreeA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Registry.HKEY"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegGetValueA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Registry.REG_ROUTINE_FLAGS",
        "Windows.Win32.System.Registry.REG_VALUE_TYPE*",
        "void*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegGetValueW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.REG_ROUTINE_FLAGS",
        "Windows.Win32.System.Registry.REG_VALUE_TYPE*",
        "void*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegCopyTreeW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.HKEY"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegLoadMUIStringA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegLoadMUIStringW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegLoadAppKeyA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Registry.HKEY*",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegLoadAppKeyW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.HKEY*",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSaveKeyExA": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Registry.REG_SAVE_FORMAT"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "RegSaveKeyExW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.System.Registry.REG_SAVE_FORMAT"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "AccessCheck": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Security.PRIVILEGE_SET*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AccessCheckAndAuditAlarmW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Foundation.BOOL",
        "u32*",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AccessCheckByType": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Security.OBJECT_TYPE_LIST*",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Security.PRIVILEGE_SET*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AccessCheckByTypeResultList": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Security.OBJECT_TYPE_LIST*",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Security.PRIVILEGE_SET*",
        "u32*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AccessCheckByTypeAndAuditAlarmW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID",
        "u32",
        "Windows.Win32.Security.AUDIT_EVENT_TYPE",
        "u32",
        "Windows.Win32.Security.OBJECT_TYPE_LIST*",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Foundation.BOOL",
        "u32*",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AccessCheckByTypeResultListAndAuditAlarmW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID",
        "u32",
        "Windows.Win32.Security.AUDIT_EVENT_TYPE",
        "u32",
        "Windows.Win32.Security.OBJECT_TYPE_LIST*",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Foundation.BOOL",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AccessCheckByTypeResultListAndAuditAlarmByHandleW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID",
        "u32",
        "Windows.Win32.Security.AUDIT_EVENT_TYPE",
        "u32",
        "Windows.Win32.Security.OBJECT_TYPE_LIST*",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Foundation.BOOL",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddAccessAllowedAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "u32",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddAccessAllowedAceEx": {
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
    "AddAccessAllowedObjectAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "Windows.Win32.Security.ACE_FLAGS",
        "u32",
        "System.Guid*",
        "System.Guid*",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddAccessDeniedAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "u32",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddAccessDeniedAceEx": {
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
    "AddAccessDeniedObjectAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "Windows.Win32.Security.ACE_FLAGS",
        "u32",
        "System.Guid*",
        "System.Guid*",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "u32",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddAuditAccessAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "u32",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddAuditAccessAceEx": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "Windows.Win32.Security.ACE_FLAGS",
        "u32",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddAuditAccessObjectAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "Windows.Win32.Security.ACE_FLAGS",
        "u32",
        "System.Guid*",
        "System.Guid*",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddMandatoryAce": {
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
    "AdjustTokenGroups": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Security.TOKEN_GROUPS*",
        "u32",
        "Windows.Win32.Security.TOKEN_GROUPS*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AdjustTokenPrivileges": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Security.TOKEN_PRIVILEGES*",
        "u32",
        "Windows.Win32.Security.TOKEN_PRIVILEGES*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AllocateAndInitializeSid": {
      "args": [
        "Windows.Win32.Security.SID_IDENTIFIER_AUTHORITY*",
        "u8",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Security.PSID*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AllocateLocallyUniqueId": {
      "args": [
        "Windows.Win32.Foundation.LUID*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AreAllAccessesGranted": {
      "args": [
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AreAnyAccessesGranted": {
      "args": [
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CheckTokenMembership": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertToAutoInheritPrivateObjectSecurity": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*",
        "System.Guid*",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Security.GENERIC_MAPPING*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CopySid": {
      "args": [
        "u32",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreatePrivateObjectSecurity": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.GENERIC_MAPPING*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreatePrivateObjectSecurityEx": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*",
        "System.Guid*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Security.SECURITY_AUTO_INHERIT_FLAGS",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.GENERIC_MAPPING*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreatePrivateObjectSecurityWithMultipleInheritance": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*",
        "System.Guid**",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Security.SECURITY_AUTO_INHERIT_FLAGS",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.GENERIC_MAPPING*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateRestrictedToken": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.CREATE_RESTRICTED_TOKEN_FLAGS",
        "u32",
        "Windows.Win32.Security.SID_AND_ATTRIBUTES*",
        "u32",
        "Windows.Win32.Security.LUID_AND_ATTRIBUTES*",
        "u32",
        "Windows.Win32.Security.SID_AND_ATTRIBUTES*",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateWellKnownSid": {
      "args": [
        "Windows.Win32.Security.WELL_KNOWN_SID_TYPE",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EqualDomainSid": {
      "args": [
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DestroyPrivateObjectSecurity": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DuplicateToken": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.SECURITY_IMPERSONATION_LEVEL",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DuplicateTokenEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.TOKEN_ACCESS_MASK",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "Windows.Win32.Security.SECURITY_IMPERSONATION_LEVEL",
        "Windows.Win32.Security.TOKEN_TYPE",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EqualPrefixSid": {
      "args": [
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EqualSid": {
      "args": [
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindFirstFreeAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FreeSid": {
      "args": [
        "Windows.Win32.Security.PSID"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "GetAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "u32",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetAclInformation": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "void*",
        "u32",
        "Windows.Win32.Security.ACL_INFORMATION_CLASS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileSecurityW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetKernelObjectSecurity": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetLengthSid": {
      "args": [
        "Windows.Win32.Security.PSID"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPrivateObjectSecurity": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSecurityDescriptorControl": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u16*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSecurityDescriptorDacl": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Security.ACL**",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSecurityDescriptorGroup": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSecurityDescriptorLength": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSecurityDescriptorOwner": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSecurityDescriptorRMControl": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u8*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSecurityDescriptorSacl": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Security.ACL**",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSidIdentifierAuthority": {
      "args": [
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Security.SID_IDENTIFIER_AUTHORITY*",
      "setLastError": false
    },
    "GetSidLengthRequired": {
      "args": [
        "u8"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSidSubAuthority": {
      "args": [
        "Windows.Win32.Security.PSID",
        "u32"
      ],
      "returns": "u32*",
      "setLastError": false
    },
    "GetSidSubAuthorityCount": {
      "args": [
        "Windows.Win32.Security.PSID"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "GetTokenInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.TOKEN_INFORMATION_CLASS",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWindowsAccountDomainSid": {
      "args": [
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ImpersonateAnonymousToken": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ImpersonateLoggedOnUser": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ImpersonateSelf": {
      "args": [
        "Windows.Win32.Security.SECURITY_IMPERSONATION_LEVEL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitializeAcl": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "u32",
        "Windows.Win32.Security.ACE_REVISION"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitializeSecurityDescriptor": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitializeSid": {
      "args": [
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.SID_IDENTIFIER_AUTHORITY*",
        "u8"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsTokenRestricted": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsValidAcl": {
      "args": [
        "Windows.Win32.Security.ACL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsValidSecurityDescriptor": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsValidSid": {
      "args": [
        "Windows.Win32.Security.PSID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsWellKnownSid": {
      "args": [
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.WELL_KNOWN_SID_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MakeAbsoluteSD": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32*",
        "Windows.Win32.Security.ACL*",
        "u32*",
        "Windows.Win32.Security.ACL*",
        "u32*",
        "Windows.Win32.Security.PSID",
        "u32*",
        "Windows.Win32.Security.PSID",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MakeSelfRelativeSD": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MapGenericMask": {
      "args": [
        "u32*",
        "Windows.Win32.Security.GENERIC_MAPPING*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ObjectCloseAuditAlarmW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ObjectDeleteAuditAlarmW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ObjectOpenAuditAlarmW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "Windows.Win32.Security.PRIVILEGE_SET*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ObjectPrivilegeAuditAlarmW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "void*",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Security.PRIVILEGE_SET*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PrivilegeCheck": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.PRIVILEGE_SET*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PrivilegedServiceAuditAlarmW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.PRIVILEGE_SET*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QuerySecurityAccessMask": {
      "args": [
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "u32*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "RevertToSelf": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetAclInformation": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "void*",
        "u32",
        "Windows.Win32.Security.ACL_INFORMATION_CLASS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileSecurityW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetKernelObjectSecurity": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetPrivateObjectSecurity": {
      "args": [
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetPrivateObjectSecurityEx": {
      "args": [
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*",
        "Windows.Win32.Security.SECURITY_AUTO_INHERIT_FLAGS",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetSecurityAccessMask": {
      "args": [
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "u32*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetSecurityDescriptorControl": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.SECURITY_DESCRIPTOR_CONTROL",
        "Windows.Win32.Security.SECURITY_DESCRIPTOR_CONTROL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetSecurityDescriptorDacl": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetSecurityDescriptorGroup": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetSecurityDescriptorOwner": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetSecurityDescriptorRMControl": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u8*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetSecurityDescriptorSacl": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetTokenInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.TOKEN_INFORMATION_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AccessCheckAndAuditAlarmA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Foundation.BOOL",
        "u32*",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AccessCheckByTypeAndAuditAlarmA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID",
        "u32",
        "Windows.Win32.Security.AUDIT_EVENT_TYPE",
        "u32",
        "Windows.Win32.Security.OBJECT_TYPE_LIST*",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Foundation.BOOL",
        "u32*",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AccessCheckByTypeResultListAndAuditAlarmA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID",
        "u32",
        "Windows.Win32.Security.AUDIT_EVENT_TYPE",
        "u32",
        "Windows.Win32.Security.OBJECT_TYPE_LIST*",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Foundation.BOOL",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AccessCheckByTypeResultListAndAuditAlarmByHandleA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Security.PSID",
        "u32",
        "Windows.Win32.Security.AUDIT_EVENT_TYPE",
        "u32",
        "Windows.Win32.Security.OBJECT_TYPE_LIST*",
        "u32",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Foundation.BOOL",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ObjectOpenAuditAlarmA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32",
        "Windows.Win32.Security.PRIVILEGE_SET*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ObjectPrivilegeAuditAlarmA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Security.PRIVILEGE_SET*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ObjectCloseAuditAlarmA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ObjectDeleteAuditAlarmA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PrivilegedServiceAuditAlarmA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.PRIVILEGE_SET*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddConditionalAce": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACE_REVISION",
        "Windows.Win32.Security.ACE_FLAGS",
        "u8",
        "u32",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFileSecurityA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFileSecurityA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupAccountSidA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "Windows.Win32.Security.SID_NAME_USE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupAccountSidW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Security.SID_NAME_USE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupAccountNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.PSID",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "Windows.Win32.Security.SID_NAME_USE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupAccountNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.PSID",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Security.SID_NAME_USE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupPrivilegeValueA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.LUID*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupPrivilegeValueW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.LUID*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupPrivilegeNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.LUID*",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupPrivilegeNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.LUID*",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupPrivilegeDisplayNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupPrivilegeDisplayNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LogonUserA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.LOGON32_LOGON",
        "Windows.Win32.Security.LOGON32_PROVIDER",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LogonUserW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.LOGON32_LOGON",
        "Windows.Win32.Security.LOGON32_PROVIDER",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LogonUserExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.LOGON32_LOGON",
        "Windows.Win32.Security.LOGON32_PROVIDER",
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Security.PSID*",
        "void**",
        "u32*",
        "Windows.Win32.Security.QUOTA_LIMITS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LogonUserExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.LOGON32_LOGON",
        "Windows.Win32.Security.LOGON32_PROVIDER",
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Security.PSID*",
        "void**",
        "u32*",
        "Windows.Win32.Security.QUOTA_LIMITS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredWriteW": {
      "args": [
        "Windows.Win32.Security.Credentials.CREDENTIALW*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredWriteA": {
      "args": [
        "Windows.Win32.Security.Credentials.CREDENTIALA*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredReadW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Credentials.CRED_TYPE",
        "u32",
        "Windows.Win32.Security.Credentials.CREDENTIALW**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredReadA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Credentials.CRED_TYPE",
        "u32",
        "Windows.Win32.Security.Credentials.CREDENTIALA**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredEnumerateW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Credentials.CRED_ENUMERATE_FLAGS",
        "u32*",
        "Windows.Win32.Security.Credentials.CREDENTIALW***"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredEnumerateA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Credentials.CRED_ENUMERATE_FLAGS",
        "u32*",
        "Windows.Win32.Security.Credentials.CREDENTIALA***"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredWriteDomainCredentialsW": {
      "args": [
        "Windows.Win32.Security.Credentials.CREDENTIAL_TARGET_INFORMATIONW*",
        "Windows.Win32.Security.Credentials.CREDENTIALW*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredWriteDomainCredentialsA": {
      "args": [
        "Windows.Win32.Security.Credentials.CREDENTIAL_TARGET_INFORMATIONA*",
        "Windows.Win32.Security.Credentials.CREDENTIALA*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredReadDomainCredentialsW": {
      "args": [
        "Windows.Win32.Security.Credentials.CREDENTIAL_TARGET_INFORMATIONW*",
        "u32",
        "u32*",
        "Windows.Win32.Security.Credentials.CREDENTIALW***"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredReadDomainCredentialsA": {
      "args": [
        "Windows.Win32.Security.Credentials.CREDENTIAL_TARGET_INFORMATIONA*",
        "u32",
        "u32*",
        "Windows.Win32.Security.Credentials.CREDENTIALA***"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredDeleteW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Credentials.CRED_TYPE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredDeleteA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Credentials.CRED_TYPE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredRenameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Credentials.CRED_TYPE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredRenameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Credentials.CRED_TYPE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredGetTargetInfoW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Security.Credentials.CREDENTIAL_TARGET_INFORMATIONW**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredGetTargetInfoA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Security.Credentials.CREDENTIAL_TARGET_INFORMATIONA**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredMarshalCredentialW": {
      "args": [
        "Windows.Win32.Security.Credentials.CRED_MARSHAL_TYPE",
        "void*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredMarshalCredentialA": {
      "args": [
        "Windows.Win32.Security.Credentials.CRED_MARSHAL_TYPE",
        "void*",
        "Windows.Win32.Foundation.PSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredUnmarshalCredentialW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Credentials.CRED_MARSHAL_TYPE*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredUnmarshalCredentialA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Credentials.CRED_MARSHAL_TYPE*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredIsMarshaledCredentialW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredIsMarshaledCredentialA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredProtectW": {
      "args": [
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Security.Credentials.CRED_PROTECTION_TYPE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredProtectA": {
      "args": [
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "Windows.Win32.Security.Credentials.CRED_PROTECTION_TYPE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredUnprotectW": {
      "args": [
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredUnprotectA": {
      "args": [
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredIsProtectedW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Credentials.CRED_PROTECTION_TYPE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredIsProtectedA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Credentials.CRED_PROTECTION_TYPE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredFindBestCredentialW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32",
        "Windows.Win32.Security.Credentials.CREDENTIALW**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredFindBestCredentialA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32",
        "Windows.Win32.Security.Credentials.CREDENTIALA**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredGetSessionTypes": {
      "args": [
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CredFree": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetServiceBits": {
      "args": [
        "Windows.Win32.System.Services.SERVICE_STATUS_HANDLE",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChangeServiceConfigA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.ENUM_SERVICE_TYPE",
        "Windows.Win32.System.Services.SERVICE_START_TYPE",
        "Windows.Win32.System.Services.SERVICE_ERROR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChangeServiceConfigW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.ENUM_SERVICE_TYPE",
        "Windows.Win32.System.Services.SERVICE_START_TYPE",
        "Windows.Win32.System.Services.SERVICE_ERROR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChangeServiceConfig2A": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.SERVICE_CONFIG",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChangeServiceConfig2W": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.SERVICE_CONFIG",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseServiceHandle": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ControlService": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "u32",
        "Windows.Win32.System.Services.SERVICE_STATUS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateServiceA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.System.Services.ENUM_SERVICE_TYPE",
        "Windows.Win32.System.Services.SERVICE_START_TYPE",
        "Windows.Win32.System.Services.SERVICE_ERROR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.System.Services.SC_HANDLE",
      "setLastError": false
    },
    "CreateServiceW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.System.Services.ENUM_SERVICE_TYPE",
        "Windows.Win32.System.Services.SERVICE_START_TYPE",
        "Windows.Win32.System.Services.SERVICE_ERROR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.System.Services.SC_HANDLE",
      "setLastError": false
    },
    "DeleteService": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDependentServicesA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.ENUM_SERVICE_STATE",
        "Windows.Win32.System.Services.ENUM_SERVICE_STATUSA*",
        "u32",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDependentServicesW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.ENUM_SERVICE_STATE",
        "Windows.Win32.System.Services.ENUM_SERVICE_STATUSW*",
        "u32",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumServicesStatusA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.ENUM_SERVICE_TYPE",
        "Windows.Win32.System.Services.ENUM_SERVICE_STATE",
        "Windows.Win32.System.Services.ENUM_SERVICE_STATUSA*",
        "u32",
        "u32*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumServicesStatusW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.ENUM_SERVICE_TYPE",
        "Windows.Win32.System.Services.ENUM_SERVICE_STATE",
        "Windows.Win32.System.Services.ENUM_SERVICE_STATUSW*",
        "u32",
        "u32*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumServicesStatusExA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.SC_ENUM_TYPE",
        "Windows.Win32.System.Services.ENUM_SERVICE_TYPE",
        "Windows.Win32.System.Services.ENUM_SERVICE_STATE",
        "u8*",
        "u32",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumServicesStatusExW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.SC_ENUM_TYPE",
        "Windows.Win32.System.Services.ENUM_SERVICE_TYPE",
        "Windows.Win32.System.Services.ENUM_SERVICE_STATE",
        "u8*",
        "u32",
        "u32*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetServiceKeyNameA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetServiceKeyNameW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetServiceDisplayNameA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetServiceDisplayNameW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LockServiceDatabase": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "NotifyBootConfigStatus": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OpenSCManagerA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.System.Services.SC_HANDLE",
      "setLastError": false
    },
    "OpenSCManagerW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.System.Services.SC_HANDLE",
      "setLastError": false
    },
    "OpenServiceA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.System.Services.SC_HANDLE",
      "setLastError": false
    },
    "OpenServiceW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.System.Services.SC_HANDLE",
      "setLastError": false
    },
    "QueryServiceConfigA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.QUERY_SERVICE_CONFIGA*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryServiceConfigW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.QUERY_SERVICE_CONFIGW*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryServiceConfig2A": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.SERVICE_CONFIG",
        "u8*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryServiceConfig2W": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.SERVICE_CONFIG",
        "u8*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryServiceLockStatusA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.QUERY_SERVICE_LOCK_STATUSA*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryServiceLockStatusW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.QUERY_SERVICE_LOCK_STATUSW*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryServiceObjectSecurity": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "u32",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryServiceStatus": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.SERVICE_STATUS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryServiceStatusEx": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.SC_STATUS_TYPE",
        "u8*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterServiceCtrlHandlerA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Services.LPHANDLER_FUNCTION"
      ],
      "returns": "Windows.Win32.System.Services.SERVICE_STATUS_HANDLE",
      "setLastError": false
    },
    "RegisterServiceCtrlHandlerW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Services.LPHANDLER_FUNCTION"
      ],
      "returns": "Windows.Win32.System.Services.SERVICE_STATUS_HANDLE",
      "setLastError": false
    },
    "RegisterServiceCtrlHandlerExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.Services.LPHANDLER_FUNCTION_EX",
        "void*"
      ],
      "returns": "Windows.Win32.System.Services.SERVICE_STATUS_HANDLE",
      "setLastError": false
    },
    "RegisterServiceCtrlHandlerExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Services.LPHANDLER_FUNCTION_EX",
        "void*"
      ],
      "returns": "Windows.Win32.System.Services.SERVICE_STATUS_HANDLE",
      "setLastError": false
    },
    "SetServiceObjectSecurity": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetServiceStatus": {
      "args": [
        "Windows.Win32.System.Services.SERVICE_STATUS_HANDLE",
        "Windows.Win32.System.Services.SERVICE_STATUS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "StartServiceCtrlDispatcherA": {
      "args": [
        "Windows.Win32.System.Services.SERVICE_TABLE_ENTRYA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "StartServiceCtrlDispatcherW": {
      "args": [
        "Windows.Win32.System.Services.SERVICE_TABLE_ENTRYW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "StartServiceA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "u32",
        "Windows.Win32.Foundation.PSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "StartServiceW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "u32",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnlockServiceDatabase": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "NotifyServiceStatusChangeA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.SERVICE_NOTIFY",
        "Windows.Win32.System.Services.SERVICE_NOTIFY_2A*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "NotifyServiceStatusChangeW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "Windows.Win32.System.Services.SERVICE_NOTIFY",
        "Windows.Win32.System.Services.SERVICE_NOTIFY_2W*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ControlServiceExA": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "u32",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ControlServiceExW": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "u32",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "QueryServiceDynamicInformation": {
      "args": [
        "Windows.Win32.System.Services.SERVICE_STATUS_HANDLE",
        "u32",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WaitServiceState": {
      "args": [
        "Windows.Win32.System.Services.SC_HANDLE",
        "u32",
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateProcessAsUserW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
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
    "SetThreadToken": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OpenProcessToken": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.TOKEN_ACCESS_MASK",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OpenThreadToken": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.TOKEN_ACCESS_MASK",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateProcessAsUserA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
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
    "CreateProcessWithLogonW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Threading.CREATE_PROCESS_LOGON_FLAGS",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Threading.PROCESS_CREATION_FLAGS",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Threading.STARTUPINFOW*",
        "Windows.Win32.System.Threading.PROCESS_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateProcessWithTokenW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.CREATE_PROCESS_LOGON_FLAGS",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Threading.PROCESS_CREATION_FLAGS",
        "void*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Threading.STARTUPINFOW*",
        "Windows.Win32.System.Threading.PROCESS_INFORMATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaferGetPolicyInformation": {
      "args": [
        "u32",
        "Windows.Win32.Security.AppLocker.SAFER_POLICY_INFO_CLASS",
        "u32",
        "void*",
        "u32*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaferSetPolicyInformation": {
      "args": [
        "u32",
        "Windows.Win32.Security.AppLocker.SAFER_POLICY_INFO_CLASS",
        "u32",
        "void*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaferCreateLevel": {
      "args": [
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Security.SAFER_LEVEL_HANDLE*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaferCloseLevel": {
      "args": [
        "Windows.Win32.Security.SAFER_LEVEL_HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaferIdentifyLevel": {
      "args": [
        "u32",
        "Windows.Win32.Security.AppLocker.SAFER_CODE_PROPERTIES_V2*",
        "Windows.Win32.Security.SAFER_LEVEL_HANDLE*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaferComputeTokenFromLevel": {
      "args": [
        "Windows.Win32.Security.SAFER_LEVEL_HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Security.AppLocker.SAFER_COMPUTE_TOKEN_FROM_LEVEL_FLAGS",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaferGetLevelInformation": {
      "args": [
        "Windows.Win32.Security.SAFER_LEVEL_HANDLE",
        "Windows.Win32.Security.AppLocker.SAFER_OBJECT_INFO_CLASS",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaferSetLevelInformation": {
      "args": [
        "Windows.Win32.Security.SAFER_LEVEL_HANDLE",
        "Windows.Win32.Security.AppLocker.SAFER_OBJECT_INFO_CLASS",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaferRecordEventLogEntry": {
      "args": [
        "Windows.Win32.Security.SAFER_LEVEL_HANDLE",
        "Windows.Win32.Foundation.PWSTR",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaferiIsExecutableFileType": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOLEAN"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetEntriesInAclA": {
      "args": [
        "u32",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_A*",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACL**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetEntriesInAclW": {
      "args": [
        "u32",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_W*",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACL**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetExplicitEntriesFromAclA": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "u32*",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_A**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetExplicitEntriesFromAclW": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "u32*",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_W**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetEffectiveRightsFromAclA": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.Authorization.TRUSTEE_A*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetEffectiveRightsFromAclW": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.Authorization.TRUSTEE_W*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetAuditedPermissionsFromAclA": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.Authorization.TRUSTEE_A*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetAuditedPermissionsFromAclW": {
      "args": [
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.Authorization.TRUSTEE_W*",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetNamedSecurityInfoA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSID*",
        "Windows.Win32.Security.PSID*",
        "Windows.Win32.Security.ACL**",
        "Windows.Win32.Security.ACL**",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetNamedSecurityInfoW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSID*",
        "Windows.Win32.Security.PSID*",
        "Windows.Win32.Security.ACL**",
        "Windows.Win32.Security.ACL**",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetSecurityInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSID*",
        "Windows.Win32.Security.PSID*",
        "Windows.Win32.Security.ACL**",
        "Windows.Win32.Security.ACL**",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetNamedSecurityInfoA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACL*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetNamedSecurityInfoW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACL*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetSecurityInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACL*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetInheritanceSourceA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Foundation.BOOL",
        "System.Guid**",
        "u32",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.Authorization.FN_OBJECT_MGR_FUNCTS*",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Security.Authorization.INHERITED_FROMA*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetInheritanceSourceW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Foundation.BOOL",
        "System.Guid**",
        "u32",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.Authorization.FN_OBJECT_MGR_FUNCTS*",
        "Windows.Win32.Security.GENERIC_MAPPING*",
        "Windows.Win32.Security.Authorization.INHERITED_FROMW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "FreeInheritedFromArray": {
      "args": [
        "Windows.Win32.Security.Authorization.INHERITED_FROMW*",
        "u16",
        "Windows.Win32.Security.Authorization.FN_OBJECT_MGR_FUNCTS*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TreeResetNamedSecurityInfoA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Security.Authorization.FN_PROGRESS",
        "Windows.Win32.Security.Authorization.PROG_INVOKE_SETTING",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TreeResetNamedSecurityInfoW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Security.Authorization.FN_PROGRESS",
        "Windows.Win32.Security.Authorization.PROG_INVOKE_SETTING",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TreeSetNamedSecurityInfoA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.Authorization.TREE_SEC_INFO",
        "Windows.Win32.Security.Authorization.FN_PROGRESS",
        "Windows.Win32.Security.Authorization.PROG_INVOKE_SETTING",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "TreeSetNamedSecurityInfoW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.ACL*",
        "Windows.Win32.Security.Authorization.TREE_SEC_INFO",
        "Windows.Win32.Security.Authorization.FN_PROGRESS",
        "Windows.Win32.Security.Authorization.PROG_INVOKE_SETTING",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "BuildSecurityDescriptorA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*",
        "Windows.Win32.Security.Authorization.TRUSTEE_A*",
        "u32",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_A*",
        "u32",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_A*",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32*",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "BuildSecurityDescriptorW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*",
        "Windows.Win32.Security.Authorization.TRUSTEE_W*",
        "u32",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_W*",
        "u32",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_W*",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32*",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "LookupSecurityDescriptorPartsA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A**",
        "Windows.Win32.Security.Authorization.TRUSTEE_A**",
        "u32*",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_A**",
        "u32*",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_A**",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "LookupSecurityDescriptorPartsW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W**",
        "Windows.Win32.Security.Authorization.TRUSTEE_W**",
        "u32*",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_W**",
        "u32*",
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_W**",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "BuildExplicitAccessWithNameA": {
      "args": [
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_A*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Security.Authorization.ACCESS_MODE",
        "Windows.Win32.Security.ACE_FLAGS"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildExplicitAccessWithNameW": {
      "args": [
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_W*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Security.Authorization.ACCESS_MODE",
        "Windows.Win32.Security.ACE_FLAGS"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildImpersonateExplicitAccessWithNameA": {
      "args": [
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_A*",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.Authorization.TRUSTEE_A*",
        "u32",
        "Windows.Win32.Security.Authorization.ACCESS_MODE",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildImpersonateExplicitAccessWithNameW": {
      "args": [
        "Windows.Win32.Security.Authorization.EXPLICIT_ACCESS_W*",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.Authorization.TRUSTEE_W*",
        "u32",
        "Windows.Win32.Security.Authorization.ACCESS_MODE",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildTrusteeWithNameA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildTrusteeWithNameW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildImpersonateTrusteeA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*",
        "Windows.Win32.Security.Authorization.TRUSTEE_A*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildImpersonateTrusteeW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*",
        "Windows.Win32.Security.Authorization.TRUSTEE_W*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildTrusteeWithSidA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildTrusteeWithSidW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildTrusteeWithObjectsAndSidA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*",
        "Windows.Win32.Security.Authorization.OBJECTS_AND_SID*",
        "System.Guid*",
        "System.Guid*",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildTrusteeWithObjectsAndSidW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*",
        "Windows.Win32.Security.Authorization.OBJECTS_AND_SID*",
        "System.Guid*",
        "System.Guid*",
        "Windows.Win32.Security.PSID"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildTrusteeWithObjectsAndNameA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*",
        "Windows.Win32.Security.Authorization.OBJECTS_AND_NAME_A*",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "BuildTrusteeWithObjectsAndNameW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*",
        "Windows.Win32.Security.Authorization.OBJECTS_AND_NAME_W*",
        "Windows.Win32.Security.Authorization.SE_OBJECT_TYPE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetTrusteeNameA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "GetTrusteeNameW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "GetTrusteeTypeA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*"
      ],
      "returns": "Windows.Win32.Security.Authorization.TRUSTEE_TYPE",
      "setLastError": false
    },
    "GetTrusteeTypeW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*"
      ],
      "returns": "Windows.Win32.Security.Authorization.TRUSTEE_TYPE",
      "setLastError": false
    },
    "GetTrusteeFormA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*"
      ],
      "returns": "Windows.Win32.Security.Authorization.TRUSTEE_FORM",
      "setLastError": false
    },
    "GetTrusteeFormW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*"
      ],
      "returns": "Windows.Win32.Security.Authorization.TRUSTEE_FORM",
      "setLastError": false
    },
    "GetMultipleTrusteeOperationA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*"
      ],
      "returns": "Windows.Win32.Security.Authorization.MULTIPLE_TRUSTEE_OPERATION",
      "setLastError": false
    },
    "GetMultipleTrusteeOperationW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*"
      ],
      "returns": "Windows.Win32.Security.Authorization.MULTIPLE_TRUSTEE_OPERATION",
      "setLastError": false
    },
    "GetMultipleTrusteeA": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_A*"
      ],
      "returns": "Windows.Win32.Security.Authorization.TRUSTEE_A*",
      "setLastError": false
    },
    "GetMultipleTrusteeW": {
      "args": [
        "Windows.Win32.Security.Authorization.TRUSTEE_W*"
      ],
      "returns": "Windows.Win32.Security.Authorization.TRUSTEE_W*",
      "setLastError": false
    },
    "ConvertSidToStringSidA": {
      "args": [
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.PSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertSidToStringSidW": {
      "args": [
        "Windows.Win32.Security.PSID",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertStringSidToSidA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.PSID*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertStringSidToSidW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.PSID*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertStringSecurityDescriptorToSecurityDescriptorA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertStringSecurityDescriptorToSecurityDescriptorW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertSecurityDescriptorToStringSecurityDescriptorA": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Foundation.PSTR*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertSecurityDescriptorToStringSecurityDescriptorW": {
      "args": [
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION",
        "Windows.Win32.Foundation.PWSTR*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ClearEventLogA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ClearEventLogW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BackupEventLogA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BackupEventLogW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseEventLog": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeregisterEventSource": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "NotifyChangeEventLog": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetNumberOfEventLogRecords": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetOldestEventLogRecord": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OpenEventLogA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenEventLogW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "RegisterEventSourceA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "RegisterEventSourceW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenBackupEventLogA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "OpenBackupEventLogW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "ReadEventLogA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.EventLog.READ_EVENT_LOG_READ_FLAGS",
        "u32",
        "void*",
        "u32",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadEventLogW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.EventLog.READ_EVENT_LOG_READ_FLAGS",
        "u32",
        "void*",
        "u32",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReportEventA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.EventLog.REPORT_EVENT_TYPE",
        "u16",
        "u32",
        "Windows.Win32.Security.PSID",
        "u16",
        "u32",
        "Windows.Win32.Foundation.PSTR*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReportEventW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.EventLog.REPORT_EVENT_TYPE",
        "u16",
        "u32",
        "Windows.Win32.Security.PSID",
        "u16",
        "u32",
        "Windows.Win32.Foundation.PWSTR*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetEventLogInformation": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InstallApplication": {
      "args": [
        "Windows.Win32.System.GroupPolicy.INSTALLDATA*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "UninstallApplication": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CommandLineFromMsiDescriptor": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetManagedApplications": {
      "args": [
        "System.Guid*",
        "u32",
        "u32",
        "u32*",
        "Windows.Win32.System.GroupPolicy.MANAGEDAPPLICATION**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetLocalManagedApplications": {
      "args": [
        "Windows.Win32.Foundation.BOOL",
        "u32*",
        "Windows.Win32.System.GroupPolicy.LOCALMANAGEDAPPLICATION**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetLocalManagedApplicationData": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetManagedApplicationCategories": {
      "args": [
        "u32",
        "Windows.Win32.UI.Shell.APPCATEGORYINFOLIST*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfStartProvider": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Performance.PERFLIBREQUEST",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfStartProviderEx": {
      "args": [
        "System.Guid*",
        "Windows.Win32.System.Performance.PERF_PROVIDER_CONTEXT*",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfStopProvider": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfSetCounterSetInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTERSET_INFO*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfCreateInstance": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.System.Performance.PERF_COUNTERSET_INSTANCE*",
      "setLastError": false
    },
    "PerfDeleteInstance": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTERSET_INSTANCE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfQueryInstance": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "System.Guid*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.System.Performance.PERF_COUNTERSET_INSTANCE*",
      "setLastError": false
    },
    "PerfSetCounterRefValue": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTERSET_INSTANCE*",
        "u32",
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfSetULongCounterValue": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTERSET_INSTANCE*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfSetULongLongCounterValue": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTERSET_INSTANCE*",
        "u32",
        "u64"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfIncrementULongCounterValue": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTERSET_INSTANCE*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfIncrementULongLongCounterValue": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTERSET_INSTANCE*",
        "u32",
        "u64"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfDecrementULongCounterValue": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTERSET_INSTANCE*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfDecrementULongLongCounterValue": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTERSET_INSTANCE*",
        "u32",
        "u64"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfEnumerateCounterSet": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfEnumerateCounterSetInstances": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "Windows.Win32.System.Performance.PERF_INSTANCE_HEADER*",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfQueryCounterSetRegistrationInfo": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "Windows.Win32.System.Performance.PerfRegInfoType",
        "u32",
        "u8*",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfOpenQueryHandle": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfCloseQueryHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfQueryCounterInfo": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTER_IDENTIFIER*",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfQueryCounterData": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_DATA_HEADER*",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfAddCounters": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTER_IDENTIFIER*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PerfDeleteCounters": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Performance.PERF_COUNTER_IDENTIFIER*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ImpersonateNamedPipeClient": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitiateSystemShutdownA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitiateSystemShutdownW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AbortSystemShutdownA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AbortSystemShutdownW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitiateSystemShutdownExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Shutdown.SHUTDOWN_REASON"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitiateSystemShutdownExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.Shutdown.SHUTDOWN_REASON"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InitiateShutdownA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.System.Shutdown.SHUTDOWN_FLAGS",
        "Windows.Win32.System.Shutdown.SHUTDOWN_REASON"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "InitiateShutdownW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.System.Shutdown.SHUTDOWN_FLAGS",
        "Windows.Win32.System.Shutdown.SHUTDOWN_REASON"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CheckForHiberboot": {
      "args": [
        "Windows.Win32.Foundation.BOOLEAN*",
        "Windows.Win32.Foundation.BOOLEAN"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EnumDynamicTimeZoneInformation": {
      "args": [
        "u32",
        "Windows.Win32.System.Time.DYNAMIC_TIME_ZONE_INFORMATION*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetDynamicTimeZoneInformationEffectiveYears": {
      "args": [
        "Windows.Win32.System.Time.DYNAMIC_TIME_ZONE_INFORMATION*",
        "u32*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetUserNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUserNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsTokenUntrusted": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentHwProfileA": {
      "args": [
        "Windows.Win32.System.WindowsProgramming.HW_PROFILE_INFOA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentHwProfileW": {
      "args": [
        "Windows.Win32.System.WindowsProgramming.HW_PROFILE_INFOW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MSChapSrvChangePassword": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.System.PasswordManagement.LM_OWF_PASSWORD*",
        "Windows.Win32.System.PasswordManagement.LM_OWF_PASSWORD*",
        "Windows.Win32.System.PasswordManagement.LM_OWF_PASSWORD*",
        "Windows.Win32.System.PasswordManagement.LM_OWF_PASSWORD*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "MSChapSrvChangePassword2": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.PasswordManagement.SAMPR_ENCRYPTED_USER_PASSWORD*",
        "Windows.Win32.System.PasswordManagement.ENCRYPTED_LM_OWF_PASSWORD*",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.System.PasswordManagement.SAMPR_ENCRYPTED_USER_PASSWORD*",
        "Windows.Win32.System.PasswordManagement.ENCRYPTED_LM_OWF_PASSWORD*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "OperationStart": {
      "args": [
        "Windows.Win32.Storage.OperationRecorder.OPERATION_START_PARAMETERS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OperationEnd": {
      "args": [
        "Windows.Win32.Storage.OperationRecorder.OPERATION_END_PARAMETERS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    }
  }
} as const;
const libraries = {
  "advapi32.dll": {
    "CryptAcquireContextA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptAcquireContextW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptReleaseContext": {
      "args": [
        "FFIType.usize",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptGenKey": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptDeriveKey": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptDestroyKey": {
      "args": [
        "FFIType.usize"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptSetKeyParam": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptGetKeyParam": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptSetHashParam": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptGetHashParam": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptSetProvParam": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptGetProvParam": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptGenRandom": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptGetUserKey": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptExportKey": {
      "args": [
        "FFIType.usize",
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptImportKey": {
      "args": [
        "FFIType.usize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptEncrypt": {
      "args": [
        "FFIType.usize",
        "FFIType.usize",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptDecrypt": {
      "args": [
        "FFIType.usize",
        "FFIType.usize",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptCreateHash": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptHashData": {
      "args": [
        "FFIType.usize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptHashSessionKey": {
      "args": [
        "FFIType.usize",
        "FFIType.usize",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptDestroyHash": {
      "args": [
        "FFIType.usize"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptSignHashA": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptSignHashW": {
      "args": [
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptVerifySignatureA": {
      "args": [
        "FFIType.usize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.usize",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptVerifySignatureW": {
      "args": [
        "FFIType.usize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.usize",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptSetProviderA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptSetProviderW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptSetProviderExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptSetProviderExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptGetDefaultProviderA": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptGetDefaultProviderW": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptEnumProviderTypesA": {
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
    "CryptEnumProviderTypesW": {
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
    "CryptEnumProvidersA": {
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
    "CryptEnumProvidersW": {
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
    "CryptContextAddRef": {
      "args": [
        "FFIType.usize",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptDuplicateKey": {
      "args": [
        "FFIType.usize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CryptDuplicateHash": {
      "args": [
        "FFIType.usize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OpenThreadWaitChainSession": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "CloseThreadWaitChainSession": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "GetThreadWaitChain": {
      "args": [
        "FFIType.ptr",
        "FFIType.usize",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RegisterWaitChainCOMCallback": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "StartTraceW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "StartTraceA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "StopTraceW": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "StopTraceA": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "QueryTraceW": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "QueryTraceA": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "UpdateTraceW": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "UpdateTraceA": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FlushTraceW": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FlushTraceA": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ControlTraceW": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ControlTraceA": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "QueryAllTracesW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "QueryAllTracesA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EnableTrace": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u64"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EnableTraceEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u64",
        "FFIType.u32",
        "FFIType.u8",
        "FFIType.u64",
        "FFIType.u64",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EnableTraceEx2": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u8",
        "FFIType.u64",
        "FFIType.u64",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EnumerateTraceGuidsEx": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TraceSetInformation": {
      "args": [
        "FFIType.u64",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TraceQueryInformation": {
      "args": [
        "FFIType.u64",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TraceConfigureLastBranchRecord": {
      "args": [
        "FFIType.u64",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreateTraceInstanceId": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TraceEvent": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TraceEventInstance": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegisterTraceGuidsW": {
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
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegisterTraceGuidsA": {
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
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EnumerateTraceGuids": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "UnregisterTraceGuids": {
      "args": [
        "FFIType.u64"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetTraceLoggerHandle": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u64",
      "setLastError": false
    },
    "GetTraceEnableLevel": {
      "args": [
        "FFIType.u64"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "GetTraceEnableFlags": {
      "args": [
        "FFIType.u64"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "OpenTraceW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u64",
      "setLastError": false
    },
    "ProcessTrace": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CloseTrace": {
      "args": [
        "FFIType.u64"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "OpenTraceFromBufferStream": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u64",
      "setLastError": false
    },
    "OpenTraceFromRealTimeLogger": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u64",
      "setLastError": false
    },
    "OpenTraceFromRealTimeLoggerWithAllocationOptions": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.usize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u64",
      "setLastError": false
    },
    "OpenTraceFromFile": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u64",
      "setLastError": false
    },
    "ProcessTraceBufferIncrementReference": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ProcessTraceBufferDecrementReference": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ProcessTraceAddBufferToBufferStream": {
      "args": [
        "FFIType.u64",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "QueryTraceProcessingHandle": {
      "args": [
        "FFIType.u64",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "OpenTraceA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u64",
      "setLastError": false
    },
    "SetTraceCallback": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RemoveTraceCallback": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TraceMessage": {
      "args": [
        "FFIType.u64",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u16"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TraceMessageVa": {
      "args": [
        "FFIType.u64",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventRegister": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventUnregister": {
      "args": [
        "FFIType.i64"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventSetInformation": {
      "args": [
        "FFIType.i64",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventEnabled": {
      "args": [
        "FFIType.i64",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "EventProviderEnabled": {
      "args": [
        "FFIType.i64",
        "FFIType.u8",
        "FFIType.u64"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "EventWrite": {
      "args": [
        "FFIType.i64",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventWriteTransfer": {
      "args": [
        "FFIType.i64",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventWriteEx": {
      "args": [
        "FFIType.i64",
        "FFIType.ptr",
        "FFIType.u64",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventWriteString": {
      "args": [
        "FFIType.i64",
        "FFIType.u8",
        "FFIType.u64",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventActivityIdControl": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventAccessControl": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u8"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventAccessQuery": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EventAccessRemove": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CveEventWrite": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "QueryUsersOnEncryptedFile": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "QueryRecoveryAgentsOnEncryptedFile": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RemoveUsersFromEncryptedFile": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "AddUsersToEncryptedFile": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetUserFileEncryptionKey": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetUserFileEncryptionKeyEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FreeEncryptionCertificateHashList": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "EncryptionDisable": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DuplicateEncryptionInfoFile": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetEncryptedFileMetadata": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetEncryptedFileMetadata": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FreeEncryptedFileMetadata": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "EncryptFileA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "EncryptFileW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DecryptFileA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DecryptFileW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "FileEncryptionStatusA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "FileEncryptionStatusW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OpenEncryptedFileRawA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "OpenEncryptedFileRawW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ReadEncryptedFileRaw": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "WriteEncryptedFileRaw": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CloseEncryptedFileRaw": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "IsTextUnicode": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SystemFunction036": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "SystemFunction040": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SystemFunction041": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaFreeMemory": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaClose": {
      "args": [
        "FFIType.isize"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaOpenPolicy": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaSetCAPs": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaGetAppliedCAPIDs": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaQueryCAPs": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaQueryInformationPolicy": {
      "args": [
        "FFIType.isize",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaSetInformationPolicy": {
      "args": [
        "FFIType.isize",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaQueryDomainInformationPolicy": {
      "args": [
        "FFIType.isize",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaSetDomainInformationPolicy": {
      "args": [
        "FFIType.isize",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaEnumerateTrustedDomains": {
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
    "LsaLookupNames": {
      "args": [
        "FFIType.isize",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaLookupNames2": {
      "args": [
        "FFIType.isize",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaLookupSids": {
      "args": [
        "FFIType.isize",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaLookupSids2": {
      "args": [
        "FFIType.isize",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaEnumerateAccountsWithUserRight": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaEnumerateAccountRights": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaAddAccountRights": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaRemoveAccountRights": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaOpenTrustedDomainByName": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaQueryTrustedDomainInfo": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaSetTrustedDomainInformation": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaDeleteTrustedDomain": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaQueryTrustedDomainInfoByName": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaSetTrustedDomainInfoByName": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaEnumerateTrustedDomainsEx": {
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
    "LsaCreateTrustedDomainEx": {
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
    "LsaQueryForestTrustInformation": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaSetForestTrustInformation": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaStorePrivateData": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaRetrievePrivateData": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaNtStatusToWinError": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "LsaQueryForestTrustInformation2": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LsaSetForestTrustInformation2": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AuditSetSystemPolicy": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditSetPerUserPolicy": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditQuerySystemPolicy": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditQueryPerUserPolicy": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditEnumeratePerUserPolicy": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditComputeEffectivePolicyBySid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditComputeEffectivePolicyByToken": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditEnumerateCategories": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditEnumerateSubCategories": {
      "args": [
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditLookupCategoryNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditLookupCategoryNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditLookupSubCategoryNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditLookupSubCategoryNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditLookupCategoryIdFromCategoryGuid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditLookupCategoryGuidFromCategoryId": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditSetSecurity": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditQuerySecurity": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditSetGlobalSaclW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditSetGlobalSaclA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditQueryGlobalSaclW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditQueryGlobalSaclA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u8",
      "setLastError": false
    },
    "AuditFree": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RegCloseKey": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegOverridePredefKey": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegOpenUserClassesRoot": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegOpenCurrentUser": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDisablePredefinedCache": {
      "args": [],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDisablePredefinedCacheEx": {
      "args": [],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegConnectRegistryA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegConnectRegistryW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegConnectRegistryExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RegConnectRegistryExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RegCreateKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegCreateKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegCreateKeyExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegCreateKeyExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegCreateKeyTransactedA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegCreateKeyTransactedW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteKeyExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteKeyExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteKeyTransactedA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteKeyTransactedW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDisableReflectionKey": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegEnableReflectionKey": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegQueryReflectionKey": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteValueA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteValueW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegEnumKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegEnumKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegEnumKeyExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegEnumKeyExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegEnumValueA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegEnumValueW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegFlushKey": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegGetKeySecurity": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegLoadKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegLoadKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegNotifyChangeKeyValue": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegOpenKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegOpenKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegOpenKeyExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegOpenKeyExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegOpenKeyTransactedA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegOpenKeyTransactedW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegQueryInfoKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegQueryInfoKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegQueryValueA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegQueryValueW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegQueryMultipleValuesA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegQueryMultipleValuesW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegQueryValueExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegQueryValueExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegReplaceKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegReplaceKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegRestoreKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegRestoreKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegRenameKey": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSaveKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSaveKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSetKeySecurity": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSetValueA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSetValueW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSetValueExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSetValueExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegUnLoadKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegUnLoadKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteKeyValueA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteKeyValueW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSetKeyValueA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSetKeyValueW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteTreeA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegDeleteTreeW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegCopyTreeA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegGetValueA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegGetValueW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegCopyTreeW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegLoadMUIStringA": {
      "args": [
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
    "RegLoadMUIStringW": {
      "args": [
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
    "RegLoadAppKeyA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegLoadAppKeyW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSaveKeyExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegSaveKeyExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "AccessCheck": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AccessCheckAndAuditAlarmW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AccessCheckByType": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AccessCheckByTypeResultList": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AccessCheckByTypeAndAuditAlarmW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AccessCheckByTypeResultListAndAuditAlarmW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AccessCheckByTypeResultListAndAuditAlarmByHandleW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddAccessAllowedAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddAccessAllowedAceEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddAccessAllowedObjectAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddAccessDeniedAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddAccessDeniedAceEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddAccessDeniedObjectAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddAuditAccessAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddAuditAccessAceEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddAuditAccessObjectAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddMandatoryAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AdjustTokenGroups": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AdjustTokenPrivileges": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AllocateAndInitializeSid": {
      "args": [
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AllocateLocallyUniqueId": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AreAllAccessesGranted": {
      "args": [
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AreAnyAccessesGranted": {
      "args": [
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CheckTokenMembership": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ConvertToAutoInheritPrivateObjectSecurity": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CopySid": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreatePrivateObjectSecurity": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreatePrivateObjectSecurityEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreatePrivateObjectSecurityWithMultipleInheritance": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateRestrictedToken": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
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
    "CreateWellKnownSid": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "EqualDomainSid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DeleteAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DestroyPrivateObjectSecurity": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DuplicateToken": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DuplicateTokenEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "EqualPrefixSid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "EqualSid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "FindFirstFreeAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "FreeSid": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "GetAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetAclInformation": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetFileSecurityW": {
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
    "GetKernelObjectSecurity": {
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
    "GetLengthSid": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetPrivateObjectSecurity": {
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
    "GetSecurityDescriptorControl": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetSecurityDescriptorDacl": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetSecurityDescriptorGroup": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetSecurityDescriptorLength": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetSecurityDescriptorOwner": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetSecurityDescriptorRMControl": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetSecurityDescriptorSacl": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetSidIdentifierAuthority": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "GetSidLengthRequired": {
      "args": [
        "FFIType.u8"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetSidSubAuthority": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "GetSidSubAuthorityCount": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "GetTokenInformation": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetWindowsAccountDomainSid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ImpersonateAnonymousToken": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ImpersonateLoggedOnUser": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ImpersonateSelf": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "InitializeAcl": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "InitializeSecurityDescriptor": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "InitializeSid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IsTokenRestricted": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IsValidAcl": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IsValidSecurityDescriptor": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IsValidSid": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IsWellKnownSid": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "MakeAbsoluteSD": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
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
    "MakeSelfRelativeSD": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "MapGenericMask": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "ObjectCloseAuditAlarmW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ObjectDeleteAuditAlarmW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ObjectOpenAuditAlarmW": {
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
        "FFIType.i32",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ObjectPrivilegeAuditAlarmW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PrivilegeCheck": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PrivilegedServiceAuditAlarmW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "QuerySecurityAccessMask": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "RevertToSelf": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetAclInformation": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetFileSecurityW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetKernelObjectSecurity": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetPrivateObjectSecurity": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetPrivateObjectSecurityEx": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetSecurityAccessMask": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetSecurityDescriptorControl": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.u16"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetSecurityDescriptorDacl": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetSecurityDescriptorGroup": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetSecurityDescriptorOwner": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetSecurityDescriptorRMControl": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetSecurityDescriptorSacl": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetTokenInformation": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AccessCheckAndAuditAlarmA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AccessCheckByTypeAndAuditAlarmA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AccessCheckByTypeResultListAndAuditAlarmA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AccessCheckByTypeResultListAndAuditAlarmByHandleA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ObjectOpenAuditAlarmA": {
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
        "FFIType.i32",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ObjectPrivilegeAuditAlarmA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ObjectCloseAuditAlarmA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ObjectDeleteAuditAlarmA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PrivilegedServiceAuditAlarmA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AddConditionalAce": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u8",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetFileSecurityA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetFileSecurityA": {
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
    "LookupAccountSidA": {
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
    "LookupAccountSidW": {
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
    "LookupAccountNameA": {
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
    "LookupAccountNameW": {
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
    "LookupPrivilegeValueA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LookupPrivilegeValueW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LookupPrivilegeNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LookupPrivilegeNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LookupPrivilegeDisplayNameA": {
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
    "LookupPrivilegeDisplayNameW": {
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
    "LogonUserA": {
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
    "LogonUserW": {
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
    "LogonUserExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LogonUserExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredWriteW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredWriteA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredReadW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredReadA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredEnumerateW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredEnumerateA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredWriteDomainCredentialsW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredWriteDomainCredentialsA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredReadDomainCredentialsW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredReadDomainCredentialsA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredDeleteW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredDeleteA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredRenameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredRenameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredGetTargetInfoW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredGetTargetInfoA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredMarshalCredentialW": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredMarshalCredentialA": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredUnmarshalCredentialW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredUnmarshalCredentialA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredIsMarshaledCredentialW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredIsMarshaledCredentialA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredProtectW": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredProtectA": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredUnprotectW": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredUnprotectA": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredIsProtectedW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredIsProtectedA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredFindBestCredentialW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredFindBestCredentialA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredGetSessionTypes": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CredFree": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetServiceBits": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ChangeServiceConfigA": {
      "args": [
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
    "ChangeServiceConfigW": {
      "args": [
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
    "ChangeServiceConfig2A": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ChangeServiceConfig2W": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CloseServiceHandle": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ControlService": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateServiceA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "CreateServiceW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "DeleteService": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "EnumDependentServicesA": {
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
    "EnumDependentServicesW": {
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
    "EnumServicesStatusA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
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
    "EnumServicesStatusW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
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
    "EnumServicesStatusExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.u32",
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
    "EnumServicesStatusExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.u32",
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
    "GetServiceKeyNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetServiceKeyNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetServiceDisplayNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetServiceDisplayNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "LockServiceDatabase": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "NotifyBootConfigStatus": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OpenSCManagerA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "OpenSCManagerW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "OpenServiceA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "OpenServiceW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "QueryServiceConfigA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "QueryServiceConfigW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "QueryServiceConfig2A": {
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
    "QueryServiceConfig2W": {
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
    "QueryServiceLockStatusA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "QueryServiceLockStatusW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "QueryServiceObjectSecurity": {
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
    "QueryServiceStatus": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "QueryServiceStatusEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RegisterServiceCtrlHandlerA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RegisterServiceCtrlHandlerW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RegisterServiceCtrlHandlerExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RegisterServiceCtrlHandlerExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SetServiceObjectSecurity": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetServiceStatus": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StartServiceCtrlDispatcherA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StartServiceCtrlDispatcherW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StartServiceA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StartServiceW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "UnlockServiceDatabase": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "NotifyServiceStatusChangeA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "NotifyServiceStatusChangeW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ControlServiceExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ControlServiceExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "QueryServiceDynamicInformation": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WaitServiceState": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreateProcessAsUserW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetThreadToken": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OpenProcessToken": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OpenThreadToken": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateProcessAsUserA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateProcessWithLogonW": {
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
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateProcessWithTokenW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
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
    "SaferGetPolicyInformation": {
      "args": [
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SaferSetPolicyInformation": {
      "args": [
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SaferCreateLevel": {
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
    "SaferCloseLevel": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SaferIdentifyLevel": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SaferComputeTokenFromLevel": {
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
    "SaferGetLevelInformation": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SaferSetLevelInformation": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SaferRecordEventLogEntry": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SaferiIsExecutableFileType": {
      "args": [
        "FFIType.ptr",
        "FFIType.u8"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetEntriesInAclA": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetEntriesInAclW": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetExplicitEntriesFromAclA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetExplicitEntriesFromAclW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetEffectiveRightsFromAclA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetEffectiveRightsFromAclW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetAuditedPermissionsFromAclA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetAuditedPermissionsFromAclW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetNamedSecurityInfoA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetNamedSecurityInfoW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetSecurityInfo": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetNamedSecurityInfoA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetNamedSecurityInfoW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetSecurityInfo": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetInheritanceSourceA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetInheritanceSourceW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FreeInheritedFromArray": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TreeResetNamedSecurityInfoA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TreeResetNamedSecurityInfoW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TreeSetNamedSecurityInfoA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "TreeSetNamedSecurityInfoW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "BuildSecurityDescriptorA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "BuildSecurityDescriptorW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "LookupSecurityDescriptorPartsA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "LookupSecurityDescriptorPartsW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "BuildExplicitAccessWithNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildExplicitAccessWithNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildImpersonateExplicitAccessWithNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildImpersonateExplicitAccessWithNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildTrusteeWithNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildTrusteeWithNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildImpersonateTrusteeA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildImpersonateTrusteeW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildTrusteeWithSidA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildTrusteeWithSidW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildTrusteeWithObjectsAndSidA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildTrusteeWithObjectsAndSidW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildTrusteeWithObjectsAndNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "BuildTrusteeWithObjectsAndNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "GetTrusteeNameA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "GetTrusteeNameW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "GetTrusteeTypeA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetTrusteeTypeW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetTrusteeFormA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetTrusteeFormW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetMultipleTrusteeOperationA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetMultipleTrusteeOperationW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetMultipleTrusteeA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "GetMultipleTrusteeW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ConvertSidToStringSidA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ConvertSidToStringSidW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ConvertStringSidToSidA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ConvertStringSidToSidW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ConvertStringSecurityDescriptorToSecurityDescriptorA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ConvertStringSecurityDescriptorToSecurityDescriptorW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ConvertSecurityDescriptorToStringSecurityDescriptorA": {
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
    "ConvertSecurityDescriptorToStringSecurityDescriptorW": {
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
    "ClearEventLogA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ClearEventLogW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "BackupEventLogA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "BackupEventLogW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CloseEventLog": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DeregisterEventSource": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "NotifyChangeEventLog": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetNumberOfEventLogRecords": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetOldestEventLogRecord": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OpenEventLogA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "OpenEventLogW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RegisterEventSourceA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "RegisterEventSourceW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "OpenBackupEventLogA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "OpenBackupEventLogW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ReadEventLogA": {
      "args": [
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
    "ReadEventLogW": {
      "args": [
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
    "ReportEventA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.u16",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ReportEventW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.u16",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetEventLogInformation": {
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
    "InstallApplication": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "UninstallApplication": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CommandLineFromMsiDescriptor": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetManagedApplications": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetLocalManagedApplications": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetLocalManagedApplicationData": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "GetManagedApplicationCategories": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfStartProvider": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfStartProviderEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfStopProvider": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfSetCounterSetInfo": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfCreateInstance": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "PerfDeleteInstance": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfQueryInstance": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "PerfSetCounterRefValue": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfSetULongCounterValue": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfSetULongLongCounterValue": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u64"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfIncrementULongCounterValue": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfIncrementULongLongCounterValue": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u64"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfDecrementULongCounterValue": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfDecrementULongLongCounterValue": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u64"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfEnumerateCounterSet": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfEnumerateCounterSetInstances": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfQueryCounterSetRegistrationInfo": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfOpenQueryHandle": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfCloseQueryHandle": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfQueryCounterInfo": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfQueryCounterData": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfAddCounters": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PerfDeleteCounters": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ImpersonateNamedPipeClient": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "InitiateSystemShutdownA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "InitiateSystemShutdownW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AbortSystemShutdownA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AbortSystemShutdownW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "InitiateSystemShutdownExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "InitiateSystemShutdownExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "InitiateShutdownA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "InitiateShutdownW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CheckForHiberboot": {
      "args": [
        "FFIType.ptr",
        "FFIType.u8"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EnumDynamicTimeZoneInformation": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetDynamicTimeZoneInformationEffectiveYears": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetUserNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetUserNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IsTokenUntrusted": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetCurrentHwProfileA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetCurrentHwProfileW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "MSChapSrvChangePassword": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "MSChapSrvChangePassword2": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "OperationStart": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "OperationEnd": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    }
  }
} as const;
const defaults = {
  "advapi32.dll": {
    "CryptAcquireContext": "CryptAcquireContextW",
    "CryptSignHash": "CryptSignHashW",
    "CryptVerifySignature": "CryptVerifySignatureW",
    "CryptSetProvider": "CryptSetProviderW",
    "CryptSetProviderEx": "CryptSetProviderExW",
    "CryptGetDefaultProvider": "CryptGetDefaultProviderW",
    "CryptEnumProviderTypes": "CryptEnumProviderTypesW",
    "CryptEnumProviders": "CryptEnumProvidersW",
    "StartTrace": "StartTraceW",
    "StopTrace": "StopTraceW",
    "QueryTrace": "QueryTraceW",
    "UpdateTrace": "UpdateTraceW",
    "FlushTrace": "FlushTraceW",
    "ControlTrace": "ControlTraceW",
    "QueryAllTraces": "QueryAllTracesW",
    "RegisterTraceGuids": "RegisterTraceGuidsW",
    "OpenTrace": "OpenTraceW",
    "EncryptFile": "EncryptFileW",
    "DecryptFile": "DecryptFileW",
    "FileEncryptionStatus": "FileEncryptionStatusW",
    "OpenEncryptedFileRaw": "OpenEncryptedFileRawW",
    "AuditLookupCategoryName": "AuditLookupCategoryNameW",
    "AuditLookupSubCategoryName": "AuditLookupSubCategoryNameW",
    "AuditSetGlobalSacl": "AuditSetGlobalSaclW",
    "AuditQueryGlobalSacl": "AuditQueryGlobalSaclW",
    "RegConnectRegistry": "RegConnectRegistryW",
    "RegConnectRegistryEx": "RegConnectRegistryExW",
    "RegCreateKey": "RegCreateKeyW",
    "RegCreateKeyEx": "RegCreateKeyExW",
    "RegCreateKeyTransacted": "RegCreateKeyTransactedW",
    "RegDeleteKey": "RegDeleteKeyW",
    "RegDeleteKeyEx": "RegDeleteKeyExW",
    "RegDeleteKeyTransacted": "RegDeleteKeyTransactedW",
    "RegDeleteValue": "RegDeleteValueW",
    "RegEnumKey": "RegEnumKeyW",
    "RegEnumKeyEx": "RegEnumKeyExW",
    "RegEnumValue": "RegEnumValueW",
    "RegLoadKey": "RegLoadKeyW",
    "RegOpenKey": "RegOpenKeyW",
    "RegOpenKeyEx": "RegOpenKeyExW",
    "RegOpenKeyTransacted": "RegOpenKeyTransactedW",
    "RegQueryInfoKey": "RegQueryInfoKeyW",
    "RegQueryValue": "RegQueryValueW",
    "RegQueryMultipleValues": "RegQueryMultipleValuesW",
    "RegQueryValueEx": "RegQueryValueExW",
    "RegReplaceKey": "RegReplaceKeyW",
    "RegRestoreKey": "RegRestoreKeyW",
    "RegSaveKey": "RegSaveKeyW",
    "RegSetValue": "RegSetValueW",
    "RegSetValueEx": "RegSetValueExW",
    "RegUnLoadKey": "RegUnLoadKeyW",
    "RegDeleteKeyValue": "RegDeleteKeyValueW",
    "RegSetKeyValue": "RegSetKeyValueW",
    "RegDeleteTree": "RegDeleteTreeW",
    "RegCopyTree": "RegCopyTreeW",
    "RegGetValue": "RegGetValueW",
    "RegLoadMUIString": "RegLoadMUIStringW",
    "RegLoadAppKey": "RegLoadAppKeyW",
    "RegSaveKeyEx": "RegSaveKeyExW",
    "AccessCheckAndAuditAlarm": "AccessCheckAndAuditAlarmW",
    "AccessCheckByTypeAndAuditAlarm": "AccessCheckByTypeAndAuditAlarmW",
    "AccessCheckByTypeResultListAndAuditAlarm": "AccessCheckByTypeResultListAndAuditAlarmW",
    "AccessCheckByTypeResultListAndAuditAlarmByHandle": "AccessCheckByTypeResultListAndAuditAlarmByHandleW",
    "ObjectOpenAuditAlarm": "ObjectOpenAuditAlarmW",
    "ObjectPrivilegeAuditAlarm": "ObjectPrivilegeAuditAlarmW",
    "ObjectCloseAuditAlarm": "ObjectCloseAuditAlarmW",
    "ObjectDeleteAuditAlarm": "ObjectDeleteAuditAlarmW",
    "PrivilegedServiceAuditAlarm": "PrivilegedServiceAuditAlarmW",
    "SetFileSecurity": "SetFileSecurityW",
    "GetFileSecurity": "GetFileSecurityW",
    "LookupAccountSid": "LookupAccountSidW",
    "LookupAccountName": "LookupAccountNameW",
    "LookupPrivilegeValue": "LookupPrivilegeValueW",
    "LookupPrivilegeName": "LookupPrivilegeNameW",
    "LookupPrivilegeDisplayName": "LookupPrivilegeDisplayNameW",
    "LogonUser": "LogonUserW",
    "LogonUserEx": "LogonUserExW",
    "CredWrite": "CredWriteW",
    "CredRead": "CredReadW",
    "CredEnumerate": "CredEnumerateW",
    "CredWriteDomainCredentials": "CredWriteDomainCredentialsW",
    "CredReadDomainCredentials": "CredReadDomainCredentialsW",
    "CredDelete": "CredDeleteW",
    "CredRename": "CredRenameW",
    "CredGetTargetInfo": "CredGetTargetInfoW",
    "CredMarshalCredential": "CredMarshalCredentialW",
    "CredUnmarshalCredential": "CredUnmarshalCredentialW",
    "CredIsMarshaledCredential": "CredIsMarshaledCredentialW",
    "CredProtect": "CredProtectW",
    "CredUnprotect": "CredUnprotectW",
    "CredIsProtected": "CredIsProtectedW",
    "CredFindBestCredential": "CredFindBestCredentialW",
    "ChangeServiceConfig": "ChangeServiceConfigW",
    "ChangeServiceConfig2": "ChangeServiceConfig2W",
    "CreateService": "CreateServiceW",
    "EnumDependentServices": "EnumDependentServicesW",
    "EnumServicesStatus": "EnumServicesStatusW",
    "EnumServicesStatusEx": "EnumServicesStatusExW",
    "GetServiceKeyName": "GetServiceKeyNameW",
    "GetServiceDisplayName": "GetServiceDisplayNameW",
    "OpenSCManager": "OpenSCManagerW",
    "OpenService": "OpenServiceW",
    "QueryServiceConfig": "QueryServiceConfigW",
    "QueryServiceConfig2": "QueryServiceConfig2W",
    "QueryServiceLockStatus": "QueryServiceLockStatusW",
    "RegisterServiceCtrlHandler": "RegisterServiceCtrlHandlerW",
    "RegisterServiceCtrlHandlerEx": "RegisterServiceCtrlHandlerExW",
    "StartServiceCtrlDispatcher": "StartServiceCtrlDispatcherW",
    "StartService": "StartServiceW",
    "NotifyServiceStatusChange": "NotifyServiceStatusChangeW",
    "ControlServiceEx": "ControlServiceExW",
    "CreateProcessAsUser": "CreateProcessAsUserW",
    "SetEntriesInAcl": "SetEntriesInAclW",
    "GetExplicitEntriesFromAcl": "GetExplicitEntriesFromAclW",
    "GetEffectiveRightsFromAcl": "GetEffectiveRightsFromAclW",
    "GetAuditedPermissionsFromAcl": "GetAuditedPermissionsFromAclW",
    "GetNamedSecurityInfo": "GetNamedSecurityInfoW",
    "SetNamedSecurityInfo": "SetNamedSecurityInfoW",
    "GetInheritanceSource": "GetInheritanceSourceW",
    "TreeResetNamedSecurityInfo": "TreeResetNamedSecurityInfoW",
    "TreeSetNamedSecurityInfo": "TreeSetNamedSecurityInfoW",
    "BuildSecurityDescriptor": "BuildSecurityDescriptorW",
    "LookupSecurityDescriptorParts": "LookupSecurityDescriptorPartsW",
    "BuildExplicitAccessWithName": "BuildExplicitAccessWithNameW",
    "BuildImpersonateExplicitAccessWithName": "BuildImpersonateExplicitAccessWithNameW",
    "BuildTrusteeWithName": "BuildTrusteeWithNameW",
    "BuildImpersonateTrustee": "BuildImpersonateTrusteeW",
    "BuildTrusteeWithSid": "BuildTrusteeWithSidW",
    "BuildTrusteeWithObjectsAndSid": "BuildTrusteeWithObjectsAndSidW",
    "BuildTrusteeWithObjectsAndName": "BuildTrusteeWithObjectsAndNameW",
    "GetTrusteeName": "GetTrusteeNameW",
    "GetTrusteeType": "GetTrusteeTypeW",
    "GetTrusteeForm": "GetTrusteeFormW",
    "GetMultipleTrusteeOperation": "GetMultipleTrusteeOperationW",
    "GetMultipleTrustee": "GetMultipleTrusteeW",
    "ConvertSidToStringSid": "ConvertSidToStringSidW",
    "ConvertStringSidToSid": "ConvertStringSidToSidW",
    "ConvertStringSecurityDescriptorToSecurityDescriptor": "ConvertStringSecurityDescriptorToSecurityDescriptorW",
    "ConvertSecurityDescriptorToStringSecurityDescriptor": "ConvertSecurityDescriptorToStringSecurityDescriptorW",
    "ClearEventLog": "ClearEventLogW",
    "BackupEventLog": "BackupEventLogW",
    "OpenEventLog": "OpenEventLogW",
    "RegisterEventSource": "RegisterEventSourceW",
    "OpenBackupEventLog": "OpenBackupEventLogW",
    "ReadEventLog": "ReadEventLogW",
    "ReportEvent": "ReportEventW",
    "InitiateSystemShutdown": "InitiateSystemShutdownW",
    "AbortSystemShutdown": "AbortSystemShutdownW",
    "InitiateSystemShutdownEx": "InitiateSystemShutdownExW",
    "InitiateShutdown": "InitiateShutdownW",
    "GetUserName": "GetUserNameW",
    "GetCurrentHwProfile": "GetCurrentHwProfileW"
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
  return result as { "advapi32.dll": advapi32Library };
}
