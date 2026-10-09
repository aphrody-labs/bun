export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export interface advapi32Symbols {
    "CryptAcquireContextA": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "CryptAcquireContextW": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "CryptReleaseContext": (...args: [number, number]) => number;
    "CryptGenKey": (...args: [number, number, number, Pointer]) => number;
    "CryptDeriveKey": (...args: [number, number, number, number, Pointer]) => number;
    "CryptDestroyKey": (...args: [number]) => number;
    "CryptSetKeyParam": (...args: [number, number, Pointer, number]) => number;
    "CryptGetKeyParam": (...args: [number, number, Pointer, Pointer, number]) => number;
    "CryptSetHashParam": (...args: [number, number, Pointer, number]) => number;
    "CryptGetHashParam": (...args: [number, number, Pointer, Pointer, number]) => number;
    "CryptSetProvParam": (...args: [number, number, Pointer, number]) => number;
    "CryptGetProvParam": (...args: [number, number, Pointer, Pointer, number]) => number;
    "CryptGenRandom": (...args: [number, number, Pointer]) => number;
    "CryptGetUserKey": (...args: [number, number, Pointer]) => number;
    "CryptExportKey": (...args: [number, number, number, number, Pointer, Pointer]) => number;
    "CryptImportKey": (...args: [number, Pointer, number, number, number, Pointer]) => number;
    "CryptEncrypt": (...args: [number, number, number, number, Pointer, Pointer, number]) => number;
    "CryptDecrypt": (...args: [number, number, number, number, Pointer, Pointer]) => number;
    "CryptCreateHash": (...args: [number, number, number, number, Pointer]) => number;
    "CryptHashData": (...args: [number, Pointer, number, number]) => number;
    "CryptHashSessionKey": (...args: [number, number, number]) => number;
    "CryptDestroyHash": (...args: [number]) => number;
    "CryptSignHashA": (...args: [number, number, Pointer, number, Pointer, Pointer]) => number;
    "CryptSignHashW": (...args: [number, number, Pointer, number, Pointer, Pointer]) => number;
    "CryptVerifySignatureA": (...args: [number, Pointer, number, number, Pointer, number]) => number;
    "CryptVerifySignatureW": (...args: [number, Pointer, number, number, Pointer, number]) => number;
    "CryptSetProviderA": (...args: [Pointer, number]) => number;
    "CryptSetProviderW": (...args: [Pointer, number]) => number;
    "CryptSetProviderExA": (...args: [Pointer, number, Pointer, number]) => number;
    "CryptSetProviderExW": (...args: [Pointer, number, Pointer, number]) => number;
    "CryptGetDefaultProviderA": (...args: [number, Pointer, number, Pointer, Pointer]) => number;
    "CryptGetDefaultProviderW": (...args: [number, Pointer, number, Pointer, Pointer]) => number;
    "CryptEnumProviderTypesA": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "CryptEnumProviderTypesW": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "CryptEnumProvidersA": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "CryptEnumProvidersW": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "CryptContextAddRef": (...args: [number, Pointer, number]) => number;
    "CryptDuplicateKey": (...args: [number, Pointer, number, Pointer]) => number;
    "CryptDuplicateHash": (...args: [number, Pointer, number, Pointer]) => number;
    "OpenThreadWaitChainSession": (...args: [number, Pointer]) => Pointer;
    "CloseThreadWaitChainSession": (...args: [Pointer]) => void;
    "GetThreadWaitChain": (...args: [Pointer, number, number, number, Pointer, Pointer, Pointer]) => number;
    "RegisterWaitChainCOMCallback": (...args: [Pointer, Pointer]) => void;
    "StartTraceW": (...args: [Pointer, Pointer, Pointer]) => number;
    "StartTraceA": (...args: [Pointer, Pointer, Pointer]) => number;
    "StopTraceW": (...args: [bigint, Pointer, Pointer]) => number;
    "StopTraceA": (...args: [bigint, Pointer, Pointer]) => number;
    "QueryTraceW": (...args: [bigint, Pointer, Pointer]) => number;
    "QueryTraceA": (...args: [bigint, Pointer, Pointer]) => number;
    "UpdateTraceW": (...args: [bigint, Pointer, Pointer]) => number;
    "UpdateTraceA": (...args: [bigint, Pointer, Pointer]) => number;
    "FlushTraceW": (...args: [bigint, Pointer, Pointer]) => number;
    "FlushTraceA": (...args: [bigint, Pointer, Pointer]) => number;
    "ControlTraceW": (...args: [bigint, Pointer, Pointer, number]) => number;
    "ControlTraceA": (...args: [bigint, Pointer, Pointer, number]) => number;
    "QueryAllTracesW": (...args: [Pointer, number, Pointer]) => number;
    "QueryAllTracesA": (...args: [Pointer, number, Pointer]) => number;
    "EnableTrace": (...args: [number, number, number, Pointer, bigint]) => number;
    "EnableTraceEx": (...args: [Pointer, Pointer, bigint, number, number, bigint, bigint, number, Pointer]) => number;
    "EnableTraceEx2": (...args: [bigint, Pointer, number, number, bigint, bigint, number, Pointer]) => number;
    "EnumerateTraceGuidsEx": (...args: [number, Pointer, number, Pointer, number, Pointer]) => number;
    "TraceSetInformation": (...args: [bigint, number, Pointer, number]) => number;
    "TraceQueryInformation": (...args: [bigint, number, Pointer, number, Pointer]) => number;
    "TraceConfigureLastBranchRecord": (...args: [bigint, number, Pointer, number]) => number;
    "CreateTraceInstanceId": (...args: [Pointer, Pointer]) => number;
    "TraceEvent": (...args: [bigint, Pointer]) => number;
    "TraceEventInstance": (...args: [bigint, Pointer, Pointer, Pointer]) => number;
    "RegisterTraceGuidsW": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegisterTraceGuidsA": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "EnumerateTraceGuids": (...args: [Pointer, number, Pointer]) => number;
    "UnregisterTraceGuids": (...args: [bigint]) => number;
    "GetTraceLoggerHandle": (...args: [Pointer]) => bigint;
    "GetTraceEnableLevel": (...args: [bigint]) => number;
    "GetTraceEnableFlags": (...args: [bigint]) => number;
    "OpenTraceW": (...args: [Pointer]) => bigint;
    "ProcessTrace": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "CloseTrace": (...args: [bigint]) => number;
    "OpenTraceFromBufferStream": (...args: [Pointer, Pointer, Pointer]) => bigint;
    "OpenTraceFromRealTimeLogger": (...args: [Pointer, Pointer, Pointer]) => bigint;
    "OpenTraceFromRealTimeLoggerWithAllocationOptions": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => bigint;
    "OpenTraceFromFile": (...args: [Pointer, Pointer, Pointer]) => bigint;
    "ProcessTraceBufferIncrementReference": (...args: [bigint, Pointer]) => number;
    "ProcessTraceBufferDecrementReference": (...args: [Pointer]) => number;
    "ProcessTraceAddBufferToBufferStream": (...args: [bigint, Pointer, number]) => number;
    "QueryTraceProcessingHandle": (...args: [bigint, number, Pointer, number, Pointer, number, Pointer]) => number;
    "OpenTraceA": (...args: [Pointer]) => bigint;
    "SetTraceCallback": (...args: [Pointer, Pointer]) => number;
    "RemoveTraceCallback": (...args: [Pointer]) => number;
    "TraceMessage": (...args: [bigint, number, Pointer, number]) => number;
    "TraceMessageVa": (...args: [bigint, number, Pointer, number, Pointer]) => number;
    "EventRegister": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "EventUnregister": (...args: [bigint]) => number;
    "EventSetInformation": (...args: [bigint, number, Pointer, number]) => number;
    "EventEnabled": (...args: [bigint, Pointer]) => number;
    "EventProviderEnabled": (...args: [bigint, number, bigint]) => number;
    "EventWrite": (...args: [bigint, Pointer, number, Pointer]) => number;
    "EventWriteTransfer": (...args: [bigint, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "EventWriteEx": (...args: [bigint, Pointer, bigint, number, Pointer, Pointer, number, Pointer]) => number;
    "EventWriteString": (...args: [bigint, number, bigint, Pointer]) => number;
    "EventActivityIdControl": (...args: [number, Pointer]) => number;
    "EventAccessControl": (...args: [Pointer, number, Pointer, number, number]) => number;
    "EventAccessQuery": (...args: [Pointer, Pointer, Pointer]) => number;
    "EventAccessRemove": (...args: [Pointer]) => number;
    "CveEventWrite": (...args: [Pointer, Pointer]) => number;
    "QueryUsersOnEncryptedFile": (...args: [Pointer, Pointer]) => number;
    "QueryRecoveryAgentsOnEncryptedFile": (...args: [Pointer, Pointer]) => number;
    "RemoveUsersFromEncryptedFile": (...args: [Pointer, Pointer]) => number;
    "AddUsersToEncryptedFile": (...args: [Pointer, Pointer]) => number;
    "SetUserFileEncryptionKey": (...args: [Pointer]) => number;
    "SetUserFileEncryptionKeyEx": (...args: [Pointer, number, number, Pointer]) => number;
    "FreeEncryptionCertificateHashList": (...args: [Pointer]) => void;
    "EncryptionDisable": (...args: [Pointer, number]) => number;
    "DuplicateEncryptionInfoFile": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "GetEncryptedFileMetadata": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetEncryptedFileMetadata": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "FreeEncryptedFileMetadata": (...args: [Pointer]) => void;
    "EncryptFileA": (...args: [Pointer]) => number;
    "EncryptFileW": (...args: [Pointer]) => number;
    "DecryptFileA": (...args: [Pointer, number]) => number;
    "DecryptFileW": (...args: [Pointer, number]) => number;
    "FileEncryptionStatusA": (...args: [Pointer, Pointer]) => number;
    "FileEncryptionStatusW": (...args: [Pointer, Pointer]) => number;
    "OpenEncryptedFileRawA": (...args: [Pointer, number, Pointer]) => number;
    "OpenEncryptedFileRawW": (...args: [Pointer, number, Pointer]) => number;
    "ReadEncryptedFileRaw": (...args: [Pointer, Pointer, Pointer]) => number;
    "WriteEncryptedFileRaw": (...args: [Pointer, Pointer, Pointer]) => number;
    "CloseEncryptedFileRaw": (...args: [Pointer]) => void;
    "IsTextUnicode": (...args: [Pointer, number, Pointer]) => number;
    "SystemFunction036": (...args: [Pointer, number]) => number;
    "SystemFunction040": (...args: [Pointer, number, number]) => number;
    "SystemFunction041": (...args: [Pointer, number, number]) => number;
    "LsaFreeMemory": (...args: [Pointer]) => number;
    "LsaClose": (...args: [number]) => number;
    "LsaOpenPolicy": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "LsaSetCAPs": (...args: [Pointer, number, number]) => number;
    "LsaGetAppliedCAPIDs": (...args: [Pointer, Pointer, Pointer]) => number;
    "LsaQueryCAPs": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "LsaQueryInformationPolicy": (...args: [number, number, Pointer]) => number;
    "LsaSetInformationPolicy": (...args: [number, number, Pointer]) => number;
    "LsaQueryDomainInformationPolicy": (...args: [number, number, Pointer]) => number;
    "LsaSetDomainInformationPolicy": (...args: [number, number, Pointer]) => number;
    "LsaEnumerateTrustedDomains": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "LsaLookupNames": (...args: [number, number, Pointer, Pointer, Pointer]) => number;
    "LsaLookupNames2": (...args: [number, number, number, Pointer, Pointer, Pointer]) => number;
    "LsaLookupSids": (...args: [number, number, Pointer, Pointer, Pointer]) => number;
    "LsaLookupSids2": (...args: [number, number, number, Pointer, Pointer, Pointer]) => number;
    "LsaEnumerateAccountsWithUserRight": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "LsaEnumerateAccountRights": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "LsaAddAccountRights": (...args: [number, Pointer, Pointer, number]) => number;
    "LsaRemoveAccountRights": (...args: [number, Pointer, number, Pointer, number]) => number;
    "LsaOpenTrustedDomainByName": (...args: [number, Pointer, number, Pointer]) => number;
    "LsaQueryTrustedDomainInfo": (...args: [number, Pointer, number, Pointer]) => number;
    "LsaSetTrustedDomainInformation": (...args: [number, Pointer, number, Pointer]) => number;
    "LsaDeleteTrustedDomain": (...args: [number, Pointer]) => number;
    "LsaQueryTrustedDomainInfoByName": (...args: [number, Pointer, number, Pointer]) => number;
    "LsaSetTrustedDomainInfoByName": (...args: [number, Pointer, number, Pointer]) => number;
    "LsaEnumerateTrustedDomainsEx": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "LsaCreateTrustedDomainEx": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "LsaQueryForestTrustInformation": (...args: [number, Pointer, Pointer]) => number;
    "LsaSetForestTrustInformation": (...args: [number, Pointer, Pointer, number, Pointer]) => number;
    "LsaStorePrivateData": (...args: [number, Pointer, Pointer]) => number;
    "LsaRetrievePrivateData": (...args: [number, Pointer, Pointer]) => number;
    "LsaNtStatusToWinError": (...args: [number]) => number;
    "LsaQueryForestTrustInformation2": (...args: [number, Pointer, number, Pointer]) => number;
    "LsaSetForestTrustInformation2": (...args: [number, Pointer, number, Pointer, number, Pointer]) => number;
    "AuditSetSystemPolicy": (...args: [Pointer, number]) => number;
    "AuditSetPerUserPolicy": (...args: [Pointer, Pointer, number]) => number;
    "AuditQuerySystemPolicy": (...args: [Pointer, number, Pointer]) => number;
    "AuditQueryPerUserPolicy": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "AuditEnumeratePerUserPolicy": (...args: [Pointer]) => number;
    "AuditComputeEffectivePolicyBySid": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "AuditComputeEffectivePolicyByToken": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "AuditEnumerateCategories": (...args: [Pointer, Pointer]) => number;
    "AuditEnumerateSubCategories": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "AuditLookupCategoryNameW": (...args: [Pointer, Pointer]) => number;
    "AuditLookupCategoryNameA": (...args: [Pointer, Pointer]) => number;
    "AuditLookupSubCategoryNameW": (...args: [Pointer, Pointer]) => number;
    "AuditLookupSubCategoryNameA": (...args: [Pointer, Pointer]) => number;
    "AuditLookupCategoryIdFromCategoryGuid": (...args: [Pointer, Pointer]) => number;
    "AuditLookupCategoryGuidFromCategoryId": (...args: [number, Pointer]) => number;
    "AuditSetSecurity": (...args: [number, Pointer]) => number;
    "AuditQuerySecurity": (...args: [number, Pointer]) => number;
    "AuditSetGlobalSaclW": (...args: [Pointer, Pointer]) => number;
    "AuditSetGlobalSaclA": (...args: [Pointer, Pointer]) => number;
    "AuditQueryGlobalSaclW": (...args: [Pointer, Pointer]) => number;
    "AuditQueryGlobalSaclA": (...args: [Pointer, Pointer]) => number;
    "AuditFree": (...args: [Pointer]) => void;
    "RegCloseKey": (...args: [Pointer]) => number;
    "RegOverridePredefKey": (...args: [Pointer, Pointer]) => number;
    "RegOpenUserClassesRoot": (...args: [Pointer, number, number, Pointer]) => number;
    "RegOpenCurrentUser": (...args: [number, Pointer]) => number;
    "RegDisablePredefinedCache": (...args: []) => number;
    "RegDisablePredefinedCacheEx": (...args: []) => number;
    "RegConnectRegistryA": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegConnectRegistryW": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegConnectRegistryExA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "RegConnectRegistryExW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "RegCreateKeyA": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegCreateKeyW": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegCreateKeyExA": (...args: [Pointer, Pointer, number, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "RegCreateKeyExW": (...args: [Pointer, Pointer, number, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "RegCreateKeyTransactedA": (...args: [Pointer, Pointer, number, Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegCreateKeyTransactedW": (...args: [Pointer, Pointer, number, Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegDeleteKeyA": (...args: [Pointer, Pointer]) => number;
    "RegDeleteKeyW": (...args: [Pointer, Pointer]) => number;
    "RegDeleteKeyExA": (...args: [Pointer, Pointer, number, number]) => number;
    "RegDeleteKeyExW": (...args: [Pointer, Pointer, number, number]) => number;
    "RegDeleteKeyTransactedA": (...args: [Pointer, Pointer, number, number, Pointer, Pointer]) => number;
    "RegDeleteKeyTransactedW": (...args: [Pointer, Pointer, number, number, Pointer, Pointer]) => number;
    "RegDisableReflectionKey": (...args: [Pointer]) => number;
    "RegEnableReflectionKey": (...args: [Pointer]) => number;
    "RegQueryReflectionKey": (...args: [Pointer, Pointer]) => number;
    "RegDeleteValueA": (...args: [Pointer, Pointer]) => number;
    "RegDeleteValueW": (...args: [Pointer, Pointer]) => number;
    "RegEnumKeyA": (...args: [Pointer, number, Pointer, number]) => number;
    "RegEnumKeyW": (...args: [Pointer, number, Pointer, number]) => number;
    "RegEnumKeyExA": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegEnumKeyExW": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegEnumValueA": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegEnumValueW": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegFlushKey": (...args: [Pointer]) => number;
    "RegGetKeySecurity": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "RegLoadKeyA": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegLoadKeyW": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegNotifyChangeKeyValue": (...args: [Pointer, number, number, Pointer, number]) => number;
    "RegOpenKeyA": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegOpenKeyW": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegOpenKeyExA": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "RegOpenKeyExW": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "RegOpenKeyTransactedA": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "RegOpenKeyTransactedW": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "RegQueryInfoKeyA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegQueryInfoKeyW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegQueryValueA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RegQueryValueW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RegQueryMultipleValuesA": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "RegQueryMultipleValuesW": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "RegQueryValueExA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegQueryValueExW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegReplaceKeyA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RegReplaceKeyW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RegRestoreKeyA": (...args: [Pointer, Pointer, number]) => number;
    "RegRestoreKeyW": (...args: [Pointer, Pointer, number]) => number;
    "RegRenameKey": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegSaveKeyA": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegSaveKeyW": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegSetKeySecurity": (...args: [Pointer, number, Pointer]) => number;
    "RegSetValueA": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "RegSetValueW": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "RegSetValueExA": (...args: [Pointer, Pointer, number, number, Pointer, number]) => number;
    "RegSetValueExW": (...args: [Pointer, Pointer, number, number, Pointer, number]) => number;
    "RegUnLoadKeyA": (...args: [Pointer, Pointer]) => number;
    "RegUnLoadKeyW": (...args: [Pointer, Pointer]) => number;
    "RegDeleteKeyValueA": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegDeleteKeyValueW": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegSetKeyValueA": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "RegSetKeyValueW": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "RegDeleteTreeA": (...args: [Pointer, Pointer]) => number;
    "RegDeleteTreeW": (...args: [Pointer, Pointer]) => number;
    "RegCopyTreeA": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegGetValueA": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "RegGetValueW": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "RegCopyTreeW": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegLoadMUIStringA": (...args: [Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "RegLoadMUIStringW": (...args: [Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "RegLoadAppKeyA": (...args: [Pointer, Pointer, number, number, number]) => number;
    "RegLoadAppKeyW": (...args: [Pointer, Pointer, number, number, number]) => number;
    "RegSaveKeyExA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "RegSaveKeyExW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "AccessCheck": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "AccessCheckAndAuditAlarmW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByType": (...args: [Pointer, Pointer, Pointer, number, Pointer, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByTypeResultList": (...args: [Pointer, Pointer, Pointer, number, Pointer, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByTypeAndAuditAlarmW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, number, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByTypeResultListAndAuditAlarmW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, number, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByTypeResultListAndAuditAlarmByHandleW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, number, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "AddAccessAllowedAce": (...args: [Pointer, number, number, Pointer]) => number;
    "AddAccessAllowedAceEx": (...args: [Pointer, number, number, number, Pointer]) => number;
    "AddAccessAllowedObjectAce": (...args: [Pointer, number, number, number, Pointer, Pointer, Pointer]) => number;
    "AddAccessDeniedAce": (...args: [Pointer, number, number, Pointer]) => number;
    "AddAccessDeniedAceEx": (...args: [Pointer, number, number, number, Pointer]) => number;
    "AddAccessDeniedObjectAce": (...args: [Pointer, number, number, number, Pointer, Pointer, Pointer]) => number;
    "AddAce": (...args: [Pointer, number, number, Pointer, number]) => number;
    "AddAuditAccessAce": (...args: [Pointer, number, number, Pointer, number, number]) => number;
    "AddAuditAccessAceEx": (...args: [Pointer, number, number, number, Pointer, number, number]) => number;
    "AddAuditAccessObjectAce": (...args: [Pointer, number, number, number, Pointer, Pointer, Pointer, number, number]) => number;
    "AddMandatoryAce": (...args: [Pointer, number, number, number, Pointer]) => number;
    "AdjustTokenGroups": (...args: [Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "AdjustTokenPrivileges": (...args: [Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "AllocateAndInitializeSid": (...args: [Pointer, number, number, number, number, number, number, number, number, number, Pointer]) => number;
    "AllocateLocallyUniqueId": (...args: [Pointer]) => number;
    "AreAllAccessesGranted": (...args: [number, number]) => number;
    "AreAnyAccessesGranted": (...args: [number, number]) => number;
    "CheckTokenMembership": (...args: [Pointer, Pointer, Pointer]) => number;
    "ConvertToAutoInheritPrivateObjectSecurity": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer]) => number;
    "CopySid": (...args: [number, Pointer, Pointer]) => number;
    "CreatePrivateObjectSecurity": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "CreatePrivateObjectSecurityEx": (...args: [Pointer, Pointer, Pointer, Pointer, number, number, Pointer, Pointer]) => number;
    "CreatePrivateObjectSecurityWithMultipleInheritance": (...args: [Pointer, Pointer, Pointer, Pointer, number, number, number, Pointer, Pointer]) => number;
    "CreateRestrictedToken": (...args: [Pointer, number, number, Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "CreateWellKnownSid": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "EqualDomainSid": (...args: [Pointer, Pointer, Pointer]) => number;
    "DeleteAce": (...args: [Pointer, number]) => number;
    "DestroyPrivateObjectSecurity": (...args: [Pointer]) => number;
    "DuplicateToken": (...args: [Pointer, number, Pointer]) => number;
    "DuplicateTokenEx": (...args: [Pointer, number, Pointer, number, number, Pointer]) => number;
    "EqualPrefixSid": (...args: [Pointer, Pointer]) => number;
    "EqualSid": (...args: [Pointer, Pointer]) => number;
    "FindFirstFreeAce": (...args: [Pointer, Pointer]) => number;
    "FreeSid": (...args: [Pointer]) => Pointer;
    "GetAce": (...args: [Pointer, number, Pointer]) => number;
    "GetAclInformation": (...args: [Pointer, Pointer, number, number]) => number;
    "GetFileSecurityW": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "GetKernelObjectSecurity": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "GetLengthSid": (...args: [Pointer]) => number;
    "GetPrivateObjectSecurity": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "GetSecurityDescriptorControl": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetSecurityDescriptorDacl": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetSecurityDescriptorGroup": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetSecurityDescriptorLength": (...args: [Pointer]) => number;
    "GetSecurityDescriptorOwner": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetSecurityDescriptorRMControl": (...args: [Pointer, Pointer]) => number;
    "GetSecurityDescriptorSacl": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetSidIdentifierAuthority": (...args: [Pointer]) => Pointer;
    "GetSidLengthRequired": (...args: [number]) => number;
    "GetSidSubAuthority": (...args: [Pointer, number]) => Pointer;
    "GetSidSubAuthorityCount": (...args: [Pointer]) => Pointer;
    "GetTokenInformation": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "GetWindowsAccountDomainSid": (...args: [Pointer, Pointer, Pointer]) => number;
    "ImpersonateAnonymousToken": (...args: [Pointer]) => number;
    "ImpersonateLoggedOnUser": (...args: [Pointer]) => number;
    "ImpersonateSelf": (...args: [number]) => number;
    "InitializeAcl": (...args: [Pointer, number, number]) => number;
    "InitializeSecurityDescriptor": (...args: [Pointer, number]) => number;
    "InitializeSid": (...args: [Pointer, Pointer, number]) => number;
    "IsTokenRestricted": (...args: [Pointer]) => number;
    "IsValidAcl": (...args: [Pointer]) => number;
    "IsValidSecurityDescriptor": (...args: [Pointer]) => number;
    "IsValidSid": (...args: [Pointer]) => number;
    "IsWellKnownSid": (...args: [Pointer, number]) => number;
    "MakeAbsoluteSD": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "MakeSelfRelativeSD": (...args: [Pointer, Pointer, Pointer]) => number;
    "MapGenericMask": (...args: [Pointer, Pointer]) => void;
    "ObjectCloseAuditAlarmW": (...args: [Pointer, Pointer, number]) => number;
    "ObjectDeleteAuditAlarmW": (...args: [Pointer, Pointer, number]) => number;
    "ObjectOpenAuditAlarmW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, Pointer, number, number, Pointer]) => number;
    "ObjectPrivilegeAuditAlarmW": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "PrivilegeCheck": (...args: [Pointer, Pointer, Pointer]) => number;
    "PrivilegedServiceAuditAlarmW": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "QuerySecurityAccessMask": (...args: [number, Pointer]) => void;
    "RevertToSelf": (...args: []) => number;
    "SetAclInformation": (...args: [Pointer, Pointer, number, number]) => number;
    "SetFileSecurityW": (...args: [Pointer, number, Pointer]) => number;
    "SetKernelObjectSecurity": (...args: [Pointer, number, Pointer]) => number;
    "SetPrivateObjectSecurity": (...args: [number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetPrivateObjectSecurityEx": (...args: [number, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "SetSecurityAccessMask": (...args: [number, Pointer]) => void;
    "SetSecurityDescriptorControl": (...args: [Pointer, number, number]) => number;
    "SetSecurityDescriptorDacl": (...args: [Pointer, number, Pointer, number]) => number;
    "SetSecurityDescriptorGroup": (...args: [Pointer, Pointer, number]) => number;
    "SetSecurityDescriptorOwner": (...args: [Pointer, Pointer, number]) => number;
    "SetSecurityDescriptorRMControl": (...args: [Pointer, Pointer]) => number;
    "SetSecurityDescriptorSacl": (...args: [Pointer, number, Pointer, number]) => number;
    "SetTokenInformation": (...args: [Pointer, number, Pointer, number]) => number;
    "AccessCheckAndAuditAlarmA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByTypeAndAuditAlarmA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, number, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByTypeResultListAndAuditAlarmA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, number, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByTypeResultListAndAuditAlarmByHandleA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, number, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "ObjectOpenAuditAlarmA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, Pointer, number, number, Pointer]) => number;
    "ObjectPrivilegeAuditAlarmA": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "ObjectCloseAuditAlarmA": (...args: [Pointer, Pointer, number]) => number;
    "ObjectDeleteAuditAlarmA": (...args: [Pointer, Pointer, number]) => number;
    "PrivilegedServiceAuditAlarmA": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "AddConditionalAce": (...args: [Pointer, number, number, number, number, Pointer, Pointer, Pointer]) => number;
    "SetFileSecurityA": (...args: [Pointer, number, Pointer]) => number;
    "GetFileSecurityA": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "LookupAccountSidA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupAccountSidW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupAccountNameA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupAccountNameW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupPrivilegeValueA": (...args: [Pointer, Pointer, Pointer]) => number;
    "LookupPrivilegeValueW": (...args: [Pointer, Pointer, Pointer]) => number;
    "LookupPrivilegeNameA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupPrivilegeNameW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupPrivilegeDisplayNameA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupPrivilegeDisplayNameW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LogonUserA": (...args: [Pointer, Pointer, Pointer, number, number, Pointer]) => number;
    "LogonUserW": (...args: [Pointer, Pointer, Pointer, number, number, Pointer]) => number;
    "LogonUserExA": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LogonUserExW": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "CredWriteW": (...args: [Pointer, number]) => number;
    "CredWriteA": (...args: [Pointer, number]) => number;
    "CredReadW": (...args: [Pointer, number, number, Pointer]) => number;
    "CredReadA": (...args: [Pointer, number, number, Pointer]) => number;
    "CredEnumerateW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "CredEnumerateA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "CredWriteDomainCredentialsW": (...args: [Pointer, Pointer, number]) => number;
    "CredWriteDomainCredentialsA": (...args: [Pointer, Pointer, number]) => number;
    "CredReadDomainCredentialsW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "CredReadDomainCredentialsA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "CredDeleteW": (...args: [Pointer, number, number]) => number;
    "CredDeleteA": (...args: [Pointer, number, number]) => number;
    "CredRenameW": (...args: [Pointer, Pointer, number, number]) => number;
    "CredRenameA": (...args: [Pointer, Pointer, number, number]) => number;
    "CredGetTargetInfoW": (...args: [Pointer, number, Pointer]) => number;
    "CredGetTargetInfoA": (...args: [Pointer, number, Pointer]) => number;
    "CredMarshalCredentialW": (...args: [number, Pointer, Pointer]) => number;
    "CredMarshalCredentialA": (...args: [number, Pointer, Pointer]) => number;
    "CredUnmarshalCredentialW": (...args: [Pointer, Pointer, Pointer]) => number;
    "CredUnmarshalCredentialA": (...args: [Pointer, Pointer, Pointer]) => number;
    "CredIsMarshaledCredentialW": (...args: [Pointer]) => number;
    "CredIsMarshaledCredentialA": (...args: [Pointer]) => number;
    "CredProtectW": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "CredProtectA": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "CredUnprotectW": (...args: [number, Pointer, number, Pointer, Pointer]) => number;
    "CredUnprotectA": (...args: [number, Pointer, number, Pointer, Pointer]) => number;
    "CredIsProtectedW": (...args: [Pointer, Pointer]) => number;
    "CredIsProtectedA": (...args: [Pointer, Pointer]) => number;
    "CredFindBestCredentialW": (...args: [Pointer, number, number, Pointer]) => number;
    "CredFindBestCredentialA": (...args: [Pointer, number, number, Pointer]) => number;
    "CredGetSessionTypes": (...args: [number, Pointer]) => number;
    "CredFree": (...args: [Pointer]) => void;
    "SetServiceBits": (...args: [Pointer, number, number, number]) => number;
    "ChangeServiceConfigA": (...args: [Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "ChangeServiceConfigW": (...args: [Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "ChangeServiceConfig2A": (...args: [Pointer, number, Pointer]) => number;
    "ChangeServiceConfig2W": (...args: [Pointer, number, Pointer]) => number;
    "CloseServiceHandle": (...args: [Pointer]) => number;
    "ControlService": (...args: [Pointer, number, Pointer]) => number;
    "CreateServiceA": (...args: [Pointer, Pointer, Pointer, number, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateServiceW": (...args: [Pointer, Pointer, Pointer, number, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "DeleteService": (...args: [Pointer]) => number;
    "EnumDependentServicesA": (...args: [Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "EnumDependentServicesW": (...args: [Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "EnumServicesStatusA": (...args: [Pointer, number, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "EnumServicesStatusW": (...args: [Pointer, number, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "EnumServicesStatusExA": (...args: [Pointer, number, number, number, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "EnumServicesStatusExW": (...args: [Pointer, number, number, number, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetServiceKeyNameA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetServiceKeyNameW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetServiceDisplayNameA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetServiceDisplayNameW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "LockServiceDatabase": (...args: [Pointer]) => Pointer;
    "NotifyBootConfigStatus": (...args: [number]) => number;
    "OpenSCManagerA": (...args: [Pointer, Pointer, number]) => Pointer;
    "OpenSCManagerW": (...args: [Pointer, Pointer, number]) => Pointer;
    "OpenServiceA": (...args: [Pointer, Pointer, number]) => Pointer;
    "OpenServiceW": (...args: [Pointer, Pointer, number]) => Pointer;
    "QueryServiceConfigA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "QueryServiceConfigW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "QueryServiceConfig2A": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "QueryServiceConfig2W": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "QueryServiceLockStatusA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "QueryServiceLockStatusW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "QueryServiceObjectSecurity": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "QueryServiceStatus": (...args: [Pointer, Pointer]) => number;
    "QueryServiceStatusEx": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "RegisterServiceCtrlHandlerA": (...args: [Pointer, Pointer]) => Pointer;
    "RegisterServiceCtrlHandlerW": (...args: [Pointer, Pointer]) => Pointer;
    "RegisterServiceCtrlHandlerExA": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "RegisterServiceCtrlHandlerExW": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "SetServiceObjectSecurity": (...args: [Pointer, number, Pointer]) => number;
    "SetServiceStatus": (...args: [Pointer, Pointer]) => number;
    "StartServiceCtrlDispatcherA": (...args: [Pointer]) => number;
    "StartServiceCtrlDispatcherW": (...args: [Pointer]) => number;
    "StartServiceA": (...args: [Pointer, number, Pointer]) => number;
    "StartServiceW": (...args: [Pointer, number, Pointer]) => number;
    "UnlockServiceDatabase": (...args: [Pointer]) => number;
    "NotifyServiceStatusChangeA": (...args: [Pointer, number, Pointer]) => number;
    "NotifyServiceStatusChangeW": (...args: [Pointer, number, Pointer]) => number;
    "ControlServiceExA": (...args: [Pointer, number, number, Pointer]) => number;
    "ControlServiceExW": (...args: [Pointer, number, number, Pointer]) => number;
    "QueryServiceDynamicInformation": (...args: [Pointer, number, Pointer]) => number;
    "WaitServiceState": (...args: [Pointer, number, number, Pointer]) => number;
    "CreateProcessAsUserW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetThreadToken": (...args: [Pointer, Pointer]) => number;
    "OpenProcessToken": (...args: [Pointer, number, Pointer]) => number;
    "OpenThreadToken": (...args: [Pointer, number, number, Pointer]) => number;
    "CreateProcessAsUserA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "CreateProcessWithLogonW": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "CreateProcessWithTokenW": (...args: [Pointer, number, Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SaferGetPolicyInformation": (...args: [number, number, number, Pointer, Pointer, Pointer]) => number;
    "SaferSetPolicyInformation": (...args: [number, number, number, Pointer, Pointer]) => number;
    "SaferCreateLevel": (...args: [number, number, number, Pointer, Pointer]) => number;
    "SaferCloseLevel": (...args: [Pointer]) => number;
    "SaferIdentifyLevel": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SaferComputeTokenFromLevel": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SaferGetLevelInformation": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SaferSetLevelInformation": (...args: [Pointer, number, Pointer, number]) => number;
    "SaferRecordEventLogEntry": (...args: [Pointer, Pointer, Pointer]) => number;
    "SaferiIsExecutableFileType": (...args: [Pointer, number]) => number;
    "SetEntriesInAclA": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SetEntriesInAclW": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "GetExplicitEntriesFromAclA": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetExplicitEntriesFromAclW": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetEffectiveRightsFromAclA": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetEffectiveRightsFromAclW": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetAuditedPermissionsFromAclA": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetAuditedPermissionsFromAclW": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetNamedSecurityInfoA": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetNamedSecurityInfoW": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetSecurityInfo": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetNamedSecurityInfoA": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetNamedSecurityInfoW": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetSecurityInfo": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetInheritanceSourceA": (...args: [Pointer, number, number, number, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetInheritanceSourceW": (...args: [Pointer, number, number, number, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "FreeInheritedFromArray": (...args: [Pointer, number, Pointer]) => number;
    "TreeResetNamedSecurityInfoA": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "TreeResetNamedSecurityInfoW": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "TreeSetNamedSecurityInfoA": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "TreeSetNamedSecurityInfoW": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "BuildSecurityDescriptorA": (...args: [Pointer, Pointer, number, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "BuildSecurityDescriptorW": (...args: [Pointer, Pointer, number, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupSecurityDescriptorPartsA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupSecurityDescriptorPartsW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "BuildExplicitAccessWithNameA": (...args: [Pointer, Pointer, number, number, number]) => void;
    "BuildExplicitAccessWithNameW": (...args: [Pointer, Pointer, number, number, number]) => void;
    "BuildImpersonateExplicitAccessWithNameA": (...args: [Pointer, Pointer, Pointer, number, number, number]) => void;
    "BuildImpersonateExplicitAccessWithNameW": (...args: [Pointer, Pointer, Pointer, number, number, number]) => void;
    "BuildTrusteeWithNameA": (...args: [Pointer, Pointer]) => void;
    "BuildTrusteeWithNameW": (...args: [Pointer, Pointer]) => void;
    "BuildImpersonateTrusteeA": (...args: [Pointer, Pointer]) => void;
    "BuildImpersonateTrusteeW": (...args: [Pointer, Pointer]) => void;
    "BuildTrusteeWithSidA": (...args: [Pointer, Pointer]) => void;
    "BuildTrusteeWithSidW": (...args: [Pointer, Pointer]) => void;
    "BuildTrusteeWithObjectsAndSidA": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => void;
    "BuildTrusteeWithObjectsAndSidW": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => void;
    "BuildTrusteeWithObjectsAndNameA": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => void;
    "BuildTrusteeWithObjectsAndNameW": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => void;
    "GetTrusteeNameA": (...args: [Pointer]) => Pointer;
    "GetTrusteeNameW": (...args: [Pointer]) => Pointer;
    "GetTrusteeTypeA": (...args: [Pointer]) => number;
    "GetTrusteeTypeW": (...args: [Pointer]) => number;
    "GetTrusteeFormA": (...args: [Pointer]) => number;
    "GetTrusteeFormW": (...args: [Pointer]) => number;
    "GetMultipleTrusteeOperationA": (...args: [Pointer]) => number;
    "GetMultipleTrusteeOperationW": (...args: [Pointer]) => number;
    "GetMultipleTrusteeA": (...args: [Pointer]) => Pointer;
    "GetMultipleTrusteeW": (...args: [Pointer]) => Pointer;
    "ConvertSidToStringSidA": (...args: [Pointer, Pointer]) => number;
    "ConvertSidToStringSidW": (...args: [Pointer, Pointer]) => number;
    "ConvertStringSidToSidA": (...args: [Pointer, Pointer]) => number;
    "ConvertStringSidToSidW": (...args: [Pointer, Pointer]) => number;
    "ConvertStringSecurityDescriptorToSecurityDescriptorA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "ConvertStringSecurityDescriptorToSecurityDescriptorW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "ConvertSecurityDescriptorToStringSecurityDescriptorA": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "ConvertSecurityDescriptorToStringSecurityDescriptorW": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "ClearEventLogA": (...args: [Pointer, Pointer]) => number;
    "ClearEventLogW": (...args: [Pointer, Pointer]) => number;
    "BackupEventLogA": (...args: [Pointer, Pointer]) => number;
    "BackupEventLogW": (...args: [Pointer, Pointer]) => number;
    "CloseEventLog": (...args: [Pointer]) => number;
    "DeregisterEventSource": (...args: [Pointer]) => number;
    "NotifyChangeEventLog": (...args: [Pointer, Pointer]) => number;
    "GetNumberOfEventLogRecords": (...args: [Pointer, Pointer]) => number;
    "GetOldestEventLogRecord": (...args: [Pointer, Pointer]) => number;
    "OpenEventLogA": (...args: [Pointer, Pointer]) => Pointer;
    "OpenEventLogW": (...args: [Pointer, Pointer]) => Pointer;
    "RegisterEventSourceA": (...args: [Pointer, Pointer]) => Pointer;
    "RegisterEventSourceW": (...args: [Pointer, Pointer]) => Pointer;
    "OpenBackupEventLogA": (...args: [Pointer, Pointer]) => Pointer;
    "OpenBackupEventLogW": (...args: [Pointer, Pointer]) => Pointer;
    "ReadEventLogA": (...args: [Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "ReadEventLogW": (...args: [Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "ReportEventA": (...args: [Pointer, number, number, number, Pointer, number, number, Pointer, Pointer]) => number;
    "ReportEventW": (...args: [Pointer, number, number, number, Pointer, number, number, Pointer, Pointer]) => number;
    "GetEventLogInformation": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "InstallApplication": (...args: [Pointer]) => number;
    "UninstallApplication": (...args: [Pointer, number]) => number;
    "CommandLineFromMsiDescriptor": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetManagedApplications": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "GetLocalManagedApplications": (...args: [number, Pointer, Pointer]) => number;
    "GetLocalManagedApplicationData": (...args: [Pointer, Pointer, Pointer]) => void;
    "GetManagedApplicationCategories": (...args: [number, Pointer]) => number;
    "PerfStartProvider": (...args: [Pointer, Pointer, Pointer]) => number;
    "PerfStartProviderEx": (...args: [Pointer, Pointer, Pointer]) => number;
    "PerfStopProvider": (...args: [Pointer]) => number;
    "PerfSetCounterSetInfo": (...args: [Pointer, Pointer, number]) => number;
    "PerfCreateInstance": (...args: [Pointer, Pointer, Pointer, number]) => Pointer;
    "PerfDeleteInstance": (...args: [Pointer, Pointer]) => number;
    "PerfQueryInstance": (...args: [Pointer, Pointer, Pointer, number]) => Pointer;
    "PerfSetCounterRefValue": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "PerfSetULongCounterValue": (...args: [Pointer, Pointer, number, number]) => number;
    "PerfSetULongLongCounterValue": (...args: [Pointer, Pointer, number, bigint]) => number;
    "PerfIncrementULongCounterValue": (...args: [Pointer, Pointer, number, number]) => number;
    "PerfIncrementULongLongCounterValue": (...args: [Pointer, Pointer, number, bigint]) => number;
    "PerfDecrementULongCounterValue": (...args: [Pointer, Pointer, number, number]) => number;
    "PerfDecrementULongLongCounterValue": (...args: [Pointer, Pointer, number, bigint]) => number;
    "PerfEnumerateCounterSet": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "PerfEnumerateCounterSetInstances": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "PerfQueryCounterSetRegistrationInfo": (...args: [Pointer, Pointer, number, number, Pointer, number, Pointer]) => number;
    "PerfOpenQueryHandle": (...args: [Pointer, Pointer]) => number;
    "PerfCloseQueryHandle": (...args: [Pointer]) => number;
    "PerfQueryCounterInfo": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "PerfQueryCounterData": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "PerfAddCounters": (...args: [Pointer, Pointer, number]) => number;
    "PerfDeleteCounters": (...args: [Pointer, Pointer, number]) => number;
    "ImpersonateNamedPipeClient": (...args: [Pointer]) => number;
    "InitiateSystemShutdownA": (...args: [Pointer, Pointer, number, number, number]) => number;
    "InitiateSystemShutdownW": (...args: [Pointer, Pointer, number, number, number]) => number;
    "AbortSystemShutdownA": (...args: [Pointer]) => number;
    "AbortSystemShutdownW": (...args: [Pointer]) => number;
    "InitiateSystemShutdownExA": (...args: [Pointer, Pointer, number, number, number, number]) => number;
    "InitiateSystemShutdownExW": (...args: [Pointer, Pointer, number, number, number, number]) => number;
    "InitiateShutdownA": (...args: [Pointer, Pointer, number, number, number]) => number;
    "InitiateShutdownW": (...args: [Pointer, Pointer, number, number, number]) => number;
    "CheckForHiberboot": (...args: [Pointer, number]) => number;
    "EnumDynamicTimeZoneInformation": (...args: [number, Pointer]) => number;
    "GetDynamicTimeZoneInformationEffectiveYears": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetUserNameA": (...args: [Pointer, Pointer]) => number;
    "GetUserNameW": (...args: [Pointer, Pointer]) => number;
    "IsTokenUntrusted": (...args: [Pointer]) => number;
    "GetCurrentHwProfileA": (...args: [Pointer]) => number;
    "GetCurrentHwProfileW": (...args: [Pointer]) => number;
    "MSChapSrvChangePassword": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "MSChapSrvChangePassword2": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "OperationStart": (...args: [Pointer]) => number;
    "OperationEnd": (...args: [Pointer]) => number;
    "CryptAcquireContext": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "CryptSignHash": (...args: [number, number, Pointer, number, Pointer, Pointer]) => number;
    "CryptVerifySignature": (...args: [number, Pointer, number, number, Pointer, number]) => number;
    "CryptSetProvider": (...args: [Pointer, number]) => number;
    "CryptSetProviderEx": (...args: [Pointer, number, Pointer, number]) => number;
    "CryptGetDefaultProvider": (...args: [number, Pointer, number, Pointer, Pointer]) => number;
    "CryptEnumProviderTypes": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "CryptEnumProviders": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "StartTrace": (...args: [Pointer, Pointer, Pointer]) => number;
    "StopTrace": (...args: [bigint, Pointer, Pointer]) => number;
    "QueryTrace": (...args: [bigint, Pointer, Pointer]) => number;
    "UpdateTrace": (...args: [bigint, Pointer, Pointer]) => number;
    "FlushTrace": (...args: [bigint, Pointer, Pointer]) => number;
    "ControlTrace": (...args: [bigint, Pointer, Pointer, number]) => number;
    "QueryAllTraces": (...args: [Pointer, number, Pointer]) => number;
    "RegisterTraceGuids": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "OpenTrace": (...args: [Pointer]) => bigint;
    "EncryptFile": (...args: [Pointer]) => number;
    "DecryptFile": (...args: [Pointer, number]) => number;
    "FileEncryptionStatus": (...args: [Pointer, Pointer]) => number;
    "OpenEncryptedFileRaw": (...args: [Pointer, number, Pointer]) => number;
    "AuditLookupCategoryName": (...args: [Pointer, Pointer]) => number;
    "AuditLookupSubCategoryName": (...args: [Pointer, Pointer]) => number;
    "AuditSetGlobalSacl": (...args: [Pointer, Pointer]) => number;
    "AuditQueryGlobalSacl": (...args: [Pointer, Pointer]) => number;
    "RegConnectRegistry": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegConnectRegistryEx": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "RegCreateKey": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegCreateKeyEx": (...args: [Pointer, Pointer, number, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "RegCreateKeyTransacted": (...args: [Pointer, Pointer, number, Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegDeleteKey": (...args: [Pointer, Pointer]) => number;
    "RegDeleteKeyEx": (...args: [Pointer, Pointer, number, number]) => number;
    "RegDeleteKeyTransacted": (...args: [Pointer, Pointer, number, number, Pointer, Pointer]) => number;
    "RegDeleteValue": (...args: [Pointer, Pointer]) => number;
    "RegEnumKey": (...args: [Pointer, number, Pointer, number]) => number;
    "RegEnumKeyEx": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegEnumValue": (...args: [Pointer, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegLoadKey": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegOpenKey": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegOpenKeyEx": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "RegOpenKeyTransacted": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "RegQueryInfoKey": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegQueryValue": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RegQueryMultipleValues": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "RegQueryValueEx": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "RegReplaceKey": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "RegRestoreKey": (...args: [Pointer, Pointer, number]) => number;
    "RegSaveKey": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegSetValue": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "RegSetValueEx": (...args: [Pointer, Pointer, number, number, Pointer, number]) => number;
    "RegUnLoadKey": (...args: [Pointer, Pointer]) => number;
    "RegDeleteKeyValue": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegSetKeyValue": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "RegDeleteTree": (...args: [Pointer, Pointer]) => number;
    "RegCopyTree": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegGetValue": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "RegLoadMUIString": (...args: [Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "RegLoadAppKey": (...args: [Pointer, Pointer, number, number, number]) => number;
    "RegSaveKeyEx": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "AccessCheckAndAuditAlarm": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByTypeAndAuditAlarm": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, number, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByTypeResultListAndAuditAlarm": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, number, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "AccessCheckByTypeResultListAndAuditAlarmByHandle": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, number, Pointer, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "ObjectOpenAuditAlarm": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number, Pointer, number, number, Pointer]) => number;
    "ObjectPrivilegeAuditAlarm": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "ObjectCloseAuditAlarm": (...args: [Pointer, Pointer, number]) => number;
    "ObjectDeleteAuditAlarm": (...args: [Pointer, Pointer, number]) => number;
    "PrivilegedServiceAuditAlarm": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetFileSecurity": (...args: [Pointer, number, Pointer]) => number;
    "GetFileSecurity": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "LookupAccountSid": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupAccountName": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupPrivilegeValue": (...args: [Pointer, Pointer, Pointer]) => number;
    "LookupPrivilegeName": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupPrivilegeDisplayName": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "LogonUser": (...args: [Pointer, Pointer, Pointer, number, number, Pointer]) => number;
    "LogonUserEx": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "CredWrite": (...args: [Pointer, number]) => number;
    "CredRead": (...args: [Pointer, number, number, Pointer]) => number;
    "CredEnumerate": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "CredWriteDomainCredentials": (...args: [Pointer, Pointer, number]) => number;
    "CredReadDomainCredentials": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "CredDelete": (...args: [Pointer, number, number]) => number;
    "CredRename": (...args: [Pointer, Pointer, number, number]) => number;
    "CredGetTargetInfo": (...args: [Pointer, number, Pointer]) => number;
    "CredMarshalCredential": (...args: [number, Pointer, Pointer]) => number;
    "CredUnmarshalCredential": (...args: [Pointer, Pointer, Pointer]) => number;
    "CredIsMarshaledCredential": (...args: [Pointer]) => number;
    "CredProtect": (...args: [number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "CredUnprotect": (...args: [number, Pointer, number, Pointer, Pointer]) => number;
    "CredIsProtected": (...args: [Pointer, Pointer]) => number;
    "CredFindBestCredential": (...args: [Pointer, number, number, Pointer]) => number;
    "ChangeServiceConfig": (...args: [Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "ChangeServiceConfig2": (...args: [Pointer, number, Pointer]) => number;
    "CreateService": (...args: [Pointer, Pointer, Pointer, number, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "EnumDependentServices": (...args: [Pointer, number, Pointer, number, Pointer, Pointer]) => number;
    "EnumServicesStatus": (...args: [Pointer, number, number, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "EnumServicesStatusEx": (...args: [Pointer, number, number, number, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetServiceKeyName": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetServiceDisplayName": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "OpenSCManager": (...args: [Pointer, Pointer, number]) => Pointer;
    "OpenService": (...args: [Pointer, Pointer, number]) => Pointer;
    "QueryServiceConfig": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "QueryServiceConfig2": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "QueryServiceLockStatus": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "RegisterServiceCtrlHandler": (...args: [Pointer, Pointer]) => Pointer;
    "RegisterServiceCtrlHandlerEx": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "StartServiceCtrlDispatcher": (...args: [Pointer]) => number;
    "StartService": (...args: [Pointer, number, Pointer]) => number;
    "NotifyServiceStatusChange": (...args: [Pointer, number, Pointer]) => number;
    "ControlServiceEx": (...args: [Pointer, number, number, Pointer]) => number;
    "CreateProcessAsUser": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetEntriesInAcl": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "GetExplicitEntriesFromAcl": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetEffectiveRightsFromAcl": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetAuditedPermissionsFromAcl": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "GetNamedSecurityInfo": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "SetNamedSecurityInfo": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetInheritanceSource": (...args: [Pointer, number, number, number, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "TreeResetNamedSecurityInfo": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "TreeSetNamedSecurityInfo": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "BuildSecurityDescriptor": (...args: [Pointer, Pointer, number, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "LookupSecurityDescriptorParts": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "BuildExplicitAccessWithName": (...args: [Pointer, Pointer, number, number, number]) => void;
    "BuildImpersonateExplicitAccessWithName": (...args: [Pointer, Pointer, Pointer, number, number, number]) => void;
    "BuildTrusteeWithName": (...args: [Pointer, Pointer]) => void;
    "BuildImpersonateTrustee": (...args: [Pointer, Pointer]) => void;
    "BuildTrusteeWithSid": (...args: [Pointer, Pointer]) => void;
    "BuildTrusteeWithObjectsAndSid": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => void;
    "BuildTrusteeWithObjectsAndName": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => void;
    "GetTrusteeName": (...args: [Pointer]) => Pointer;
    "GetTrusteeType": (...args: [Pointer]) => number;
    "GetTrusteeForm": (...args: [Pointer]) => number;
    "GetMultipleTrusteeOperation": (...args: [Pointer]) => number;
    "GetMultipleTrustee": (...args: [Pointer]) => Pointer;
    "ConvertSidToStringSid": (...args: [Pointer, Pointer]) => number;
    "ConvertStringSidToSid": (...args: [Pointer, Pointer]) => number;
    "ConvertStringSecurityDescriptorToSecurityDescriptor": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "ConvertSecurityDescriptorToStringSecurityDescriptor": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "ClearEventLog": (...args: [Pointer, Pointer]) => number;
    "BackupEventLog": (...args: [Pointer, Pointer]) => number;
    "OpenEventLog": (...args: [Pointer, Pointer]) => Pointer;
    "RegisterEventSource": (...args: [Pointer, Pointer]) => Pointer;
    "OpenBackupEventLog": (...args: [Pointer, Pointer]) => Pointer;
    "ReadEventLog": (...args: [Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "ReportEvent": (...args: [Pointer, number, number, number, Pointer, number, number, Pointer, Pointer]) => number;
    "InitiateSystemShutdown": (...args: [Pointer, Pointer, number, number, number]) => number;
    "AbortSystemShutdown": (...args: [Pointer]) => number;
    "InitiateSystemShutdownEx": (...args: [Pointer, Pointer, number, number, number, number]) => number;
    "InitiateShutdown": (...args: [Pointer, Pointer, number, number, number]) => number;
    "GetUserName": (...args: [Pointer, Pointer]) => number;
    "GetCurrentHwProfile": (...args: [Pointer]) => number;
}
export interface advapi32Library { readonly symbols: advapi32Symbols; close(): void; }
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
};
export declare const enums: {
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
};
export declare const wideAliases: {
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
};
export declare const signatures: {
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
};
export declare function open(): { "advapi32.dll": advapi32Library };
