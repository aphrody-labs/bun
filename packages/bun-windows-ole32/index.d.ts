export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export interface ole32Symbols {
    "CoRegisterMessageFilter": (...args: [Pointer, Pointer]) => number;
    "CoBuildVersion": (...args: []) => number;
    "CoInitialize": (...args: [Pointer]) => number;
    "CoRegisterMallocSpy": (...args: [Pointer]) => number;
    "CoRevokeMallocSpy": (...args: []) => number;
    "CoRegisterInitializeSpy": (...args: [Pointer, Pointer]) => number;
    "CoRevokeInitializeSpy": (...args: [bigint]) => number;
    "CoGetSystemSecurityPermissions": (...args: [number, Pointer]) => number;
    "CoLoadLibrary": (...args: [Pointer, number]) => Pointer;
    "CoFreeLibrary": (...args: [Pointer]) => void;
    "CoFreeAllLibraries": (...args: []) => void;
    "CoAllowSetForegroundWindow": (...args: [Pointer, Pointer]) => number;
    "DcomChannelSetHResult": (...args: [Pointer, Pointer, number]) => number;
    "CoIsOle1Class": (...args: [Pointer]) => number;
    "CLSIDFromProgIDEx": (...args: [Pointer, Pointer]) => number;
    "CoFileTimeToDosDateTime": (...args: [Pointer, Pointer, Pointer]) => number;
    "CoDosDateTimeToFileTime": (...args: [number, number, Pointer]) => number;
    "CoFileTimeNow": (...args: [Pointer]) => number;
    "CoRegisterChannelHook": (...args: [Pointer, Pointer]) => number;
    "CoTreatAsClass": (...args: [Pointer, Pointer]) => number;
    "CreateDataAdviseHolder": (...args: [Pointer]) => number;
    "CreateDataCache": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "CoInstall": (...args: [Pointer, number, Pointer, Pointer, Pointer]) => number;
    "BindMoniker": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "CoGetObject": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "MkParseDisplayName": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "MonikerRelativePathTo": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "MonikerCommonPrefixWith": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateBindCtx": (...args: [number, Pointer]) => number;
    "CreateGenericComposite": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetClassFile": (...args: [Pointer, Pointer]) => number;
    "CreateClassMoniker": (...args: [Pointer, Pointer]) => number;
    "CreateFileMoniker": (...args: [Pointer, Pointer]) => number;
    "CreateItemMoniker": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateAntiMoniker": (...args: [Pointer]) => number;
    "CreatePointerMoniker": (...args: [Pointer, Pointer]) => number;
    "CreateObjrefMoniker": (...args: [Pointer, Pointer]) => number;
    "GetRunningObjectTable": (...args: [number, Pointer]) => number;
    "CreateStdProgressIndicator": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "CoGetMalloc": (...args: [number, Pointer]) => number;
    "CoUninitialize": (...args: []) => void;
    "CoGetCurrentProcess": (...args: []) => number;
    "CoInitializeEx": (...args: [Pointer, number]) => number;
    "CoGetCallerTID": (...args: [Pointer]) => number;
    "CoGetCurrentLogicalThreadId": (...args: [Pointer]) => number;
    "CoGetContextToken": (...args: [Pointer]) => number;
    "CoGetApartmentType": (...args: [Pointer, Pointer]) => number;
    "CoIncrementMTAUsage": (...args: [Pointer]) => number;
    "CoDecrementMTAUsage": (...args: [Pointer]) => number;
    "CoAllowUnmarshalerCLSID": (...args: [Pointer]) => number;
    "CoGetObjectContext": (...args: [Pointer, Pointer]) => number;
    "CoGetClassObject": (...args: [Pointer, number, Pointer, Pointer, Pointer]) => number;
    "CoRegisterClassObject": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "CoRevokeClassObject": (...args: [number]) => number;
    "CoResumeClassObjects": (...args: []) => number;
    "CoSuspendClassObjects": (...args: []) => number;
    "CoAddRefServerProcess": (...args: []) => number;
    "CoReleaseServerProcess": (...args: []) => number;
    "CoGetPSClsid": (...args: [Pointer, Pointer]) => number;
    "CoRegisterPSClsid": (...args: [Pointer, Pointer]) => number;
    "CoRegisterSurrogate": (...args: [Pointer]) => number;
    "CoDisconnectObject": (...args: [Pointer, number]) => number;
    "CoLockObjectExternal": (...args: [Pointer, number, number]) => number;
    "CoIsHandlerConnected": (...args: [Pointer]) => number;
    "CoCreateFreeThreadedMarshaler": (...args: [Pointer, Pointer]) => number;
    "CoFreeUnusedLibraries": (...args: []) => void;
    "CoFreeUnusedLibrariesEx": (...args: [number, number]) => void;
    "CoDisconnectContext": (...args: [number]) => number;
    "CoInitializeSecurity": (...args: [Pointer, number, Pointer, Pointer, number, number, Pointer, number, Pointer]) => number;
    "CoGetCallContext": (...args: [Pointer, Pointer]) => number;
    "CoQueryProxyBlanket": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "CoSetProxyBlanket": (...args: [Pointer, number, number, Pointer, number, number, Pointer, number]) => number;
    "CoCopyProxy": (...args: [Pointer, Pointer]) => number;
    "CoQueryClientBlanket": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "CoImpersonateClient": (...args: []) => number;
    "CoRevertToSelf": (...args: []) => number;
    "CoQueryAuthenticationServices": (...args: [Pointer, Pointer]) => number;
    "CoSwitchCallContext": (...args: [Pointer, Pointer]) => number;
    "CoCreateInstance": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "CoCreateInstanceEx": (...args: [Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "CoCreateInstanceFromApp": (...args: [Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "CoRegisterActivationFilter": (...args: [Pointer]) => number;
    "CoGetCancelObject": (...args: [number, Pointer, Pointer]) => number;
    "CoSetCancelObject": (...args: [Pointer]) => number;
    "CoCancelCall": (...args: [number, number]) => number;
    "CoTestCancel": (...args: []) => number;
    "CoEnableCallCancellation": (...args: [Pointer]) => number;
    "CoDisableCallCancellation": (...args: [Pointer]) => number;
    "StringFromCLSID": (...args: [Pointer, Pointer]) => number;
    "CLSIDFromString": (...args: [Pointer, Pointer]) => number;
    "StringFromIID": (...args: [Pointer, Pointer]) => number;
    "IIDFromString": (...args: [Pointer, Pointer]) => number;
    "ProgIDFromCLSID": (...args: [Pointer, Pointer]) => number;
    "CLSIDFromProgID": (...args: [Pointer, Pointer]) => number;
    "StringFromGUID2": (...args: [Pointer, Pointer, number]) => number;
    "CoCreateGuid": (...args: [Pointer]) => number;
    "CoWaitForMultipleHandles": (...args: [number, number, number, Pointer, Pointer]) => number;
    "CoWaitForMultipleObjects": (...args: [number, number, number, Pointer, Pointer]) => number;
    "CoGetTreatAsClass": (...args: [Pointer, Pointer]) => number;
    "CoInvalidateRemoteMachineBindings": (...args: [Pointer]) => number;
    "CoTaskMemAlloc": (...args: [number]) => Pointer;
    "CoTaskMemRealloc": (...args: [Pointer, number]) => Pointer;
    "CoTaskMemFree": (...args: [Pointer]) => void;
    "CoRegisterDeviceCatalog": (...args: [Pointer, Pointer]) => number;
    "CoRevokeDeviceCatalog": (...args: [Pointer]) => number;
    "OleBuildVersion": (...args: []) => number;
    "OleInitialize": (...args: [Pointer]) => number;
    "OleUninitialize": (...args: []) => void;
    "OleQueryLinkFromData": (...args: [Pointer]) => number;
    "OleQueryCreateFromData": (...args: [Pointer]) => number;
    "OleCreate": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateEx": (...args: [Pointer, Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateFromData": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateFromDataEx": (...args: [Pointer, Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateLinkFromData": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateLinkFromDataEx": (...args: [Pointer, Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateStaticFromData": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateLink": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateLinkEx": (...args: [Pointer, Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateLinkToFile": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateLinkToFileEx": (...args: [Pointer, Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateFromFile": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateFromFileEx": (...args: [Pointer, Pointer, Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleLoad": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "OleSave": (...args: [Pointer, Pointer, number]) => number;
    "OleLoadFromStream": (...args: [Pointer, Pointer, Pointer]) => number;
    "OleSaveToStream": (...args: [Pointer, Pointer]) => number;
    "OleSetContainedObject": (...args: [Pointer, number]) => number;
    "OleNoteObjectVisible": (...args: [Pointer, number]) => number;
    "RegisterDragDrop": (...args: [Pointer, Pointer]) => number;
    "RevokeDragDrop": (...args: [Pointer]) => number;
    "DoDragDrop": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "OleSetClipboard": (...args: [Pointer]) => number;
    "OleGetClipboard": (...args: [Pointer]) => number;
    "OleGetClipboardWithEnterpriseInfo": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleFlushClipboard": (...args: []) => number;
    "OleIsCurrentClipboard": (...args: [Pointer]) => number;
    "OleCreateMenuDescriptor": (...args: [Pointer, Pointer]) => number;
    "OleSetMenuDescriptor": (...args: [number, Pointer, Pointer, Pointer, Pointer]) => number;
    "OleDestroyMenuDescriptor": (...args: [number]) => number;
    "OleTranslateAccelerator": (...args: [Pointer, Pointer, Pointer]) => number;
    "OleDuplicateData": (...args: [Pointer, number, number]) => Pointer;
    "OleDraw": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "OleRun": (...args: [Pointer]) => number;
    "OleIsRunning": (...args: [Pointer]) => number;
    "OleLockRunning": (...args: [Pointer, number, number]) => number;
    "ReleaseStgMedium": (...args: [Pointer]) => void;
    "CreateOleAdviseHolder": (...args: [Pointer]) => number;
    "OleCreateDefaultHandler": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "OleCreateEmbeddingHelper": (...args: [Pointer, Pointer, number, Pointer, Pointer, Pointer]) => number;
    "IsAccelerator": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "OleGetIconOfFile": (...args: [Pointer, number]) => Pointer;
    "OleGetIconOfClass": (...args: [Pointer, Pointer, number]) => Pointer;
    "OleMetafilePictFromIconAndLabel": (...args: [Pointer, Pointer, Pointer, number]) => Pointer;
    "OleRegGetUserType": (...args: [Pointer, number, Pointer]) => number;
    "OleRegGetMiscStatus": (...args: [Pointer, number, Pointer]) => number;
    "OleRegEnumFormatEtc": (...args: [Pointer, number, Pointer]) => number;
    "OleRegEnumVerbs": (...args: [Pointer, Pointer]) => number;
    "OleConvertOLESTREAMToIStorage2": (...args: [Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "OleDoAutoConvert": (...args: [Pointer, Pointer]) => number;
    "OleGetAutoConvert": (...args: [Pointer, Pointer]) => number;
    "OleSetAutoConvert": (...args: [Pointer, Pointer]) => number;
    "OleConvertOLESTREAMToIStorageEx2": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, Pointer]) => number;
    "HRGN_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "HRGN_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HRGN_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HRGN_UserFree": (...args: [Pointer, Pointer]) => void;
    "HMONITOR_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "HMONITOR_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HMONITOR_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HMONITOR_UserFree": (...args: [Pointer, Pointer]) => void;
    "HMONITOR_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "HMONITOR_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HMONITOR_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HMONITOR_UserFree64": (...args: [Pointer, Pointer]) => void;
    "CoGetInstanceFromFile": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, number, Pointer]) => number;
    "CoGetInstanceFromIStorage": (...args: [Pointer, Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "StgOpenAsyncDocfileOnIFillLockBytes": (...args: [Pointer, number, number, Pointer]) => number;
    "StgGetIFillLockBytesOnILockBytes": (...args: [Pointer, Pointer]) => number;
    "StgGetIFillLockBytesOnFile": (...args: [Pointer, Pointer]) => number;
    "CreateStreamOnHGlobal": (...args: [Pointer, number, Pointer]) => number;
    "GetHGlobalFromStream": (...args: [Pointer, Pointer]) => number;
    "CoGetInterfaceAndReleaseStream": (...args: [Pointer, Pointer, Pointer]) => number;
    "PropVariantCopy": (...args: [Pointer, Pointer]) => number;
    "PropVariantClear": (...args: [Pointer]) => number;
    "FreePropVariantArray": (...args: [number, Pointer]) => number;
    "StgCreateDocfile": (...args: [Pointer, number, number, Pointer]) => number;
    "StgCreateDocfileOnILockBytes": (...args: [Pointer, number, number, Pointer]) => number;
    "StgOpenStorage": (...args: [Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "StgOpenStorageOnILockBytes": (...args: [Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "StgIsStorageFile": (...args: [Pointer]) => number;
    "StgIsStorageILockBytes": (...args: [Pointer]) => number;
    "StgSetTimes": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "StgCreateStorageEx": (...args: [Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "StgOpenStorageEx": (...args: [Pointer, number, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "StgCreatePropStg": (...args: [Pointer, Pointer, Pointer, number, number, Pointer]) => number;
    "StgOpenPropStg": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "StgCreatePropSetStg": (...args: [Pointer, number, Pointer]) => number;
    "FmtIdToPropStgName": (...args: [Pointer, Pointer]) => number;
    "PropStgNameToFmtId": (...args: [Pointer, Pointer]) => number;
    "ReadClassStg": (...args: [Pointer, Pointer]) => number;
    "WriteClassStg": (...args: [Pointer, Pointer]) => number;
    "ReadClassStm": (...args: [Pointer, Pointer]) => number;
    "WriteClassStm": (...args: [Pointer, Pointer]) => number;
    "GetHGlobalFromILockBytes": (...args: [Pointer, Pointer]) => number;
    "CreateILockBytesOnHGlobal": (...args: [Pointer, number, Pointer]) => number;
    "GetConvertStg": (...args: [Pointer]) => number;
    "StgConvertVariantToProperty": (...args: [Pointer, number, Pointer, Pointer, number, number, Pointer]) => Pointer;
    "StgConvertPropertyToVariant": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "StgPropertyLengthAsVariant": (...args: [Pointer, number, number, number]) => number;
    "WriteFmtUserTypeStg": (...args: [Pointer, number, Pointer]) => number;
    "ReadFmtUserTypeStg": (...args: [Pointer, Pointer, Pointer]) => number;
    "OleConvertOLESTREAMToIStorage": (...args: [Pointer, Pointer, Pointer]) => number;
    "OleConvertIStorageToOLESTREAM": (...args: [Pointer, Pointer]) => number;
    "SetConvertStg": (...args: [Pointer, number]) => number;
    "OleConvertIStorageToOLESTREAMEx": (...args: [Pointer, number, number, number, number, Pointer, Pointer]) => number;
    "OleConvertOLESTREAMToIStorageEx": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "CoGetDefaultContext": (...args: [number, Pointer, Pointer]) => number;
    "CoDecodeProxy": (...args: [number, bigint, Pointer]) => number;
    "RoGetAgileReference": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "HWND_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "HWND_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HWND_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HWND_UserFree": (...args: [Pointer, Pointer]) => void;
    "HWND_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "HWND_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HWND_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HWND_UserFree64": (...args: [Pointer, Pointer]) => void;
    "CLIPFORMAT_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "CLIPFORMAT_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "CLIPFORMAT_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "CLIPFORMAT_UserFree": (...args: [Pointer, Pointer]) => void;
    "HBITMAP_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "HBITMAP_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HBITMAP_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HBITMAP_UserFree": (...args: [Pointer, Pointer]) => void;
    "HDC_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "HDC_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HDC_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HDC_UserFree": (...args: [Pointer, Pointer]) => void;
    "HICON_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "HICON_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HICON_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HICON_UserFree": (...args: [Pointer, Pointer]) => void;
    "SNB_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "SNB_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "SNB_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "SNB_UserFree": (...args: [Pointer, Pointer]) => void;
    "STGMEDIUM_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "STGMEDIUM_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "STGMEDIUM_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "STGMEDIUM_UserFree": (...args: [Pointer, Pointer]) => void;
    "CLIPFORMAT_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "CLIPFORMAT_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "CLIPFORMAT_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "CLIPFORMAT_UserFree64": (...args: [Pointer, Pointer]) => void;
    "HBITMAP_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "HBITMAP_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HBITMAP_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HBITMAP_UserFree64": (...args: [Pointer, Pointer]) => void;
    "HDC_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "HDC_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HDC_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HDC_UserFree64": (...args: [Pointer, Pointer]) => void;
    "HICON_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "HICON_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HICON_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HICON_UserFree64": (...args: [Pointer, Pointer]) => void;
    "SNB_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "SNB_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "SNB_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "SNB_UserFree64": (...args: [Pointer, Pointer]) => void;
    "STGMEDIUM_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "STGMEDIUM_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "STGMEDIUM_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "STGMEDIUM_UserFree64": (...args: [Pointer, Pointer]) => void;
    "CoGetMarshalSizeMax": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "CoMarshalInterface": (...args: [Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "CoUnmarshalInterface": (...args: [Pointer, Pointer, Pointer]) => number;
    "CoMarshalHresult": (...args: [Pointer, number]) => number;
    "CoUnmarshalHresult": (...args: [Pointer, Pointer]) => number;
    "CoReleaseMarshalData": (...args: [Pointer]) => number;
    "CoGetStandardMarshal": (...args: [Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "CoGetStdMarshalEx": (...args: [Pointer, number, Pointer]) => number;
    "CoMarshalInterThreadInterfaceInStream": (...args: [Pointer, Pointer, Pointer]) => number;
    "HACCEL_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "HACCEL_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HACCEL_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HACCEL_UserFree": (...args: [Pointer, Pointer]) => void;
    "HGLOBAL_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "HGLOBAL_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HGLOBAL_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HGLOBAL_UserFree": (...args: [Pointer, Pointer]) => void;
    "HMENU_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "HMENU_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HMENU_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HMENU_UserFree": (...args: [Pointer, Pointer]) => void;
    "HACCEL_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "HACCEL_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HACCEL_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HACCEL_UserFree64": (...args: [Pointer, Pointer]) => void;
    "HGLOBAL_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "HGLOBAL_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HGLOBAL_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HGLOBAL_UserFree64": (...args: [Pointer, Pointer]) => void;
    "HMENU_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "HMENU_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HMENU_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HMENU_UserFree64": (...args: [Pointer, Pointer]) => void;
    "HPALETTE_UserSize": (...args: [Pointer, number, Pointer]) => number;
    "HPALETTE_UserMarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HPALETTE_UserUnmarshal": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HPALETTE_UserFree": (...args: [Pointer, Pointer]) => void;
    "HPALETTE_UserSize64": (...args: [Pointer, number, Pointer]) => number;
    "HPALETTE_UserMarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HPALETTE_UserUnmarshal64": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "HPALETTE_UserFree64": (...args: [Pointer, Pointer]) => void;
    "CoGetInterceptor": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "CoGetInterceptorFromTypeInfo": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;

}
export interface ole32Library { readonly symbols: ole32Symbols; close(): void; }
export declare const structs: {
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
};
export declare const enums: {
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
};
export declare const wideAliases: {};
export declare const signatures: {
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
};
export declare function open(): { "ole32.dll": ole32Library };
