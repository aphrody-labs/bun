export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export interface user32Symbols {
    "CheckDlgButton": (...args: [Pointer, number, number]) => number;
    "CheckRadioButton": (...args: [Pointer, number, number, number]) => number;
    "IsDlgButtonChecked": (...args: [Pointer, number]) => number;
    "CreateSyntheticPointerDevice": (...args: [number, number, number]) => Pointer;
    "RegisterTouchHitTestingWindow": (...args: [Pointer, number]) => number;
    "EvaluateProximityToRect": (...args: [Pointer, Pointer, Pointer]) => number;
    "EvaluateProximityToPolygon": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "PackTouchHitTestingProximityEvaluation": (...args: [Pointer, Pointer]) => number;
    "GetWindowFeedbackSetting": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "SetWindowFeedbackSetting": (...args: [Pointer, number, number, number, Pointer]) => number;
    "SetScrollPos": (...args: [Pointer, number, number, number]) => number;
    "SetScrollRange": (...args: [Pointer, number, number, number, number]) => number;
    "ShowScrollBar": (...args: [Pointer, number, number]) => number;
    "EnableScrollBar": (...args: [Pointer, number, number]) => number;
    "DlgDirListA": (...args: [Pointer, Pointer, number, number, number]) => number;
    "DlgDirListW": (...args: [Pointer, Pointer, number, number, number]) => number;
    "DlgDirSelectExA": (...args: [Pointer, Pointer, number, number]) => number;
    "DlgDirSelectExW": (...args: [Pointer, Pointer, number, number]) => number;
    "DlgDirListComboBoxA": (...args: [Pointer, Pointer, number, number, number]) => number;
    "DlgDirListComboBoxW": (...args: [Pointer, Pointer, number, number, number]) => number;
    "DlgDirSelectComboBoxExA": (...args: [Pointer, Pointer, number, number]) => number;
    "DlgDirSelectComboBoxExW": (...args: [Pointer, Pointer, number, number]) => number;
    "SetScrollInfo": (...args: [Pointer, number, Pointer, number]) => number;
    "GetComboBoxInfo": (...args: [Pointer, Pointer]) => number;
    "GetListBoxInfo": (...args: [Pointer]) => number;
    "RegisterPointerDeviceNotifications": (...args: [Pointer, number]) => number;
    "MessageBeep": (...args: [number]) => number;
    "SetLastErrorEx": (...args: [number, number]) => void;
    "DrawEdge": (...args: [Pointer, Pointer, number, number]) => number;
    "DrawFrameControl": (...args: [Pointer, Pointer, number, number]) => number;
    "DrawCaption": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "DrawAnimatedRects": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "DrawTextA": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "DrawTextW": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "DrawTextExA": (...args: [Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "DrawTextExW": (...args: [Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "GrayStringA": (...args: [Pointer, Pointer, Pointer, number, number, number, number, number, number]) => number;
    "GrayStringW": (...args: [Pointer, Pointer, Pointer, number, number, number, number, number, number]) => number;
    "DrawStateA": (...args: [Pointer, Pointer, Pointer, number, number, number, number, number, number, number]) => number;
    "DrawStateW": (...args: [Pointer, Pointer, Pointer, number, number, number, number, number, number, number]) => number;
    "TabbedTextOutA": (...args: [Pointer, number, number, Pointer, number, number, Pointer, number]) => number;
    "TabbedTextOutW": (...args: [Pointer, number, number, Pointer, number, number, Pointer, number]) => number;
    "GetTabbedTextExtentA": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "GetTabbedTextExtentW": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "UpdateWindow": (...args: [Pointer]) => number;
    "PaintDesktop": (...args: [Pointer]) => number;
    "WindowFromDC": (...args: [Pointer]) => Pointer;
    "GetDC": (...args: [Pointer]) => Pointer;
    "GetDCEx": (...args: [Pointer, Pointer, number]) => Pointer;
    "GetWindowDC": (...args: [Pointer]) => Pointer;
    "ReleaseDC": (...args: [Pointer, Pointer]) => number;
    "BeginPaint": (...args: [Pointer, Pointer]) => Pointer;
    "EndPaint": (...args: [Pointer, Pointer]) => number;
    "GetUpdateRect": (...args: [Pointer, Pointer, number]) => number;
    "GetUpdateRgn": (...args: [Pointer, Pointer, number]) => number;
    "SetWindowRgn": (...args: [Pointer, Pointer, number]) => number;
    "GetWindowRgn": (...args: [Pointer, Pointer]) => number;
    "GetWindowRgnBox": (...args: [Pointer, Pointer]) => number;
    "ExcludeUpdateRgn": (...args: [Pointer, Pointer]) => number;
    "InvalidateRect": (...args: [Pointer, Pointer, number]) => number;
    "ValidateRect": (...args: [Pointer, Pointer]) => number;
    "InvalidateRgn": (...args: [Pointer, Pointer, number]) => number;
    "ValidateRgn": (...args: [Pointer, Pointer]) => number;
    "RedrawWindow": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "LockWindowUpdate": (...args: [Pointer]) => number;
    "ClientToScreen": (...args: [Pointer, Pointer]) => number;
    "ScreenToClient": (...args: [Pointer, Pointer]) => number;
    "MapWindowPoints": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "GetSysColor": (...args: [number]) => number;
    "GetSysColorBrush": (...args: [number]) => Pointer;
    "SetSysColors": (...args: [number, Pointer, Pointer]) => number;
    "DrawFocusRect": (...args: [Pointer, Pointer]) => number;
    "FillRect": (...args: [Pointer, Pointer, Pointer]) => number;
    "FrameRect": (...args: [Pointer, Pointer, Pointer]) => number;
    "InvertRect": (...args: [Pointer, Pointer]) => number;
    "SetRect": (...args: [Pointer, number, number, number, number]) => number;
    "SetRectEmpty": (...args: [Pointer]) => number;
    "CopyRect": (...args: [Pointer, Pointer]) => number;
    "InflateRect": (...args: [Pointer, number, number]) => number;
    "IntersectRect": (...args: [Pointer, Pointer, Pointer]) => number;
    "UnionRect": (...args: [Pointer, Pointer, Pointer]) => number;
    "SubtractRect": (...args: [Pointer, Pointer, Pointer]) => number;
    "OffsetRect": (...args: [Pointer, number, number]) => number;
    "IsRectEmpty": (...args: [Pointer]) => number;
    "EqualRect": (...args: [Pointer, Pointer]) => number;
    "PtInRect": (...args: [Pointer, Pointer]) => number;
    "LoadBitmapA": (...args: [Pointer, Pointer]) => Pointer;
    "LoadBitmapW": (...args: [Pointer, Pointer]) => Pointer;
    "ChangeDisplaySettingsA": (...args: [Pointer, number]) => number;
    "ChangeDisplaySettingsW": (...args: [Pointer, number]) => number;
    "ChangeDisplaySettingsExA": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "ChangeDisplaySettingsExW": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "EnumDisplaySettingsA": (...args: [Pointer, number, Pointer]) => number;
    "EnumDisplaySettingsW": (...args: [Pointer, number, Pointer]) => number;
    "EnumDisplaySettingsExA": (...args: [Pointer, number, Pointer, number]) => number;
    "EnumDisplaySettingsExW": (...args: [Pointer, number, Pointer, number]) => number;
    "EnumDisplayDevicesA": (...args: [Pointer, number, Pointer, number]) => number;
    "EnumDisplayDevicesW": (...args: [Pointer, number, Pointer, number]) => number;
    "MonitorFromPoint": (...args: [Pointer, number]) => Pointer;
    "MonitorFromRect": (...args: [Pointer, number]) => Pointer;
    "MonitorFromWindow": (...args: [Pointer, number]) => Pointer;
    "GetMonitorInfoA": (...args: [Pointer, Pointer]) => number;
    "GetMonitorInfoW": (...args: [Pointer, Pointer]) => number;
    "EnumDisplayMonitors": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "SetDialogControlDpiChangeBehavior": (...args: [Pointer, number, number]) => number;
    "GetDialogControlDpiChangeBehavior": (...args: [Pointer]) => number;
    "SetDialogDpiChangeBehavior": (...args: [Pointer, number, number]) => number;
    "GetDialogDpiChangeBehavior": (...args: [Pointer]) => number;
    "GetSystemMetricsForDpi": (...args: [number, number]) => number;
    "AdjustWindowRectExForDpi": (...args: [Pointer, number, number, number, number]) => number;
    "LogicalToPhysicalPointForPerMonitorDPI": (...args: [Pointer, Pointer]) => number;
    "PhysicalToLogicalPointForPerMonitorDPI": (...args: [Pointer, Pointer]) => number;
    "SystemParametersInfoForDpi": (...args: [number, number, Pointer, number, number]) => number;
    "SetThreadDpiAwarenessContext": (...args: [Pointer]) => Pointer;
    "GetThreadDpiAwarenessContext": (...args: []) => Pointer;
    "GetWindowDpiAwarenessContext": (...args: [Pointer]) => Pointer;
    "GetAwarenessFromDpiAwarenessContext": (...args: [Pointer]) => number;
    "GetDpiFromDpiAwarenessContext": (...args: [Pointer]) => number;
    "AreDpiAwarenessContextsEqual": (...args: [Pointer, Pointer]) => number;
    "IsValidDpiAwarenessContext": (...args: [Pointer]) => number;
    "GetDpiForWindow": (...args: [Pointer]) => number;
    "GetDpiForSystem": (...args: []) => number;
    "GetSystemDpiForProcess": (...args: [Pointer]) => number;
    "EnableNonClientDpiScaling": (...args: [Pointer]) => number;
    "SetProcessDpiAwarenessContext": (...args: [Pointer]) => number;
    "GetDpiAwarenessContextForProcess": (...args: [Pointer]) => Pointer;
    "SetThreadDpiHostingBehavior": (...args: [number]) => number;
    "GetThreadDpiHostingBehavior": (...args: []) => number;
    "GetWindowDpiHostingBehavior": (...args: [Pointer]) => number;
    "SetUserObjectSecurity": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetUserObjectSecurity": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "SetWindowContextHelpId": (...args: [Pointer, number]) => number;
    "GetWindowContextHelpId": (...args: [Pointer]) => number;
    "SetMenuContextHelpId": (...args: [Pointer, number]) => number;
    "GetMenuContextHelpId": (...args: [Pointer]) => number;
    "WinHelpA": (...args: [Pointer, Pointer, number, number]) => number;
    "WinHelpW": (...args: [Pointer, Pointer, number, number]) => number;
    "AttachThreadInput": (...args: [number, number, number]) => number;
    "WaitForInputIdle": (...args: [Pointer, number]) => number;
    "GetGuiResources": (...args: [Pointer, number]) => number;
    "IsImmersiveProcess": (...args: [Pointer]) => number;
    "SetProcessRestrictionExemption": (...args: [number]) => number;
    "GetDisplayConfigBufferSizes": (...args: [number, Pointer, Pointer]) => number;
    "SetDisplayConfig": (...args: [number, Pointer, number, Pointer, number]) => number;
    "QueryDisplayConfig": (...args: [number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "DisplayConfigGetDeviceInfo": (...args: [Pointer]) => number;
    "DisplayConfigSetDeviceInfo": (...args: [Pointer]) => number;
    "GetAutoRotationState": (...args: [Pointer]) => number;
    "GetDisplayAutoRotationPreferences": (...args: [Pointer]) => number;
    "SetDisplayAutoRotationPreferences": (...args: [number]) => number;
    "PrintWindow": (...args: [Pointer, Pointer, number]) => number;
    "GetConsoleKeyboardLayoutNameA": (...args: [Pointer]) => number;
    "GetConsoleKeyboardLayoutNameW": (...args: [Pointer]) => number;
    "ConsoleControl": (...args: [number, Pointer, number]) => number;
    "DdeSetQualityOfService": (...args: [Pointer, Pointer, Pointer]) => number;
    "ImpersonateDdeClientWindow": (...args: [Pointer, Pointer]) => number;
    "PackDDElParam": (...args: [number, number, number]) => number;
    "UnpackDDElParam": (...args: [number, number, Pointer, Pointer]) => number;
    "FreeDDElParam": (...args: [number, number]) => number;
    "ReuseDDElParam": (...args: [number, number, number, number, number]) => number;
    "DdeInitializeA": (...args: [Pointer, Pointer, number, number]) => number;
    "DdeInitializeW": (...args: [Pointer, Pointer, number, number]) => number;
    "DdeUninitialize": (...args: [number]) => number;
    "DdeConnectList": (...args: [number, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "DdeQueryNextServer": (...args: [Pointer, Pointer]) => Pointer;
    "DdeDisconnectList": (...args: [Pointer]) => number;
    "DdeConnect": (...args: [number, Pointer, Pointer, Pointer]) => Pointer;
    "DdeDisconnect": (...args: [Pointer]) => number;
    "DdeReconnect": (...args: [Pointer]) => Pointer;
    "DdeQueryConvInfo": (...args: [Pointer, number, Pointer]) => number;
    "DdeSetUserHandle": (...args: [Pointer, number, number]) => number;
    "DdeAbandonTransaction": (...args: [number, Pointer, number]) => number;
    "DdePostAdvise": (...args: [number, Pointer, Pointer]) => number;
    "DdeEnableCallback": (...args: [number, Pointer, number]) => number;
    "DdeImpersonateClient": (...args: [Pointer]) => number;
    "DdeNameService": (...args: [number, Pointer, Pointer, number]) => Pointer;
    "DdeClientTransaction": (...args: [Pointer, number, Pointer, Pointer, number, number, number, Pointer]) => Pointer;
    "DdeCreateDataHandle": (...args: [number, Pointer, number, number, Pointer, number, number]) => Pointer;
    "DdeAddData": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "DdeGetData": (...args: [Pointer, Pointer, number, number]) => number;
    "DdeAccessData": (...args: [Pointer, Pointer]) => Pointer;
    "DdeUnaccessData": (...args: [Pointer]) => number;
    "DdeFreeDataHandle": (...args: [Pointer]) => number;
    "DdeGetLastError": (...args: [number]) => number;
    "DdeCreateStringHandleA": (...args: [number, Pointer, number]) => Pointer;
    "DdeCreateStringHandleW": (...args: [number, Pointer, number]) => Pointer;
    "DdeQueryStringA": (...args: [number, Pointer, Pointer, number, number]) => number;
    "DdeQueryStringW": (...args: [number, Pointer, Pointer, number, number]) => number;
    "DdeFreeStringHandle": (...args: [number, Pointer]) => number;
    "DdeKeepStringHandle": (...args: [number, Pointer]) => number;
    "DdeCmpStringHandles": (...args: [Pointer, Pointer]) => number;
    "OpenClipboard": (...args: [Pointer]) => number;
    "CloseClipboard": (...args: []) => number;
    "GetClipboardSequenceNumber": (...args: []) => number;
    "GetClipboardOwner": (...args: []) => Pointer;
    "SetClipboardViewer": (...args: [Pointer]) => Pointer;
    "GetClipboardViewer": (...args: []) => Pointer;
    "ChangeClipboardChain": (...args: [Pointer, Pointer]) => number;
    "SetClipboardData": (...args: [number, Pointer]) => Pointer;
    "GetClipboardData": (...args: [number]) => Pointer;
    "RegisterClipboardFormatA": (...args: [Pointer]) => number;
    "RegisterClipboardFormatW": (...args: [Pointer]) => number;
    "CountClipboardFormats": (...args: []) => number;
    "EnumClipboardFormats": (...args: [number]) => number;
    "GetClipboardFormatNameA": (...args: [number, Pointer, number]) => number;
    "GetClipboardFormatNameW": (...args: [number, Pointer, number]) => number;
    "EmptyClipboard": (...args: []) => number;
    "IsClipboardFormatAvailable": (...args: [number]) => number;
    "GetPriorityClipboardFormat": (...args: [Pointer, number]) => number;
    "GetOpenClipboardWindow": (...args: []) => Pointer;
    "AddClipboardFormatListener": (...args: [Pointer]) => number;
    "RemoveClipboardFormatListener": (...args: [Pointer]) => number;
    "GetUpdatedClipboardFormats": (...args: [Pointer, number, Pointer]) => number;
    "RegisterPowerSettingNotification": (...args: [Pointer, Pointer, number]) => number;
    "UnregisterPowerSettingNotification": (...args: [number]) => number;
    "RegisterSuspendResumeNotification": (...args: [Pointer, number]) => number;
    "UnregisterSuspendResumeNotification": (...args: [number]) => number;
    "ExitWindowsEx": (...args: [number, number]) => number;
    "LockWorkStation": (...args: []) => number;
    "ShutdownBlockReasonCreate": (...args: [Pointer, Pointer]) => number;
    "ShutdownBlockReasonQuery": (...args: [Pointer, Pointer, Pointer]) => number;
    "ShutdownBlockReasonDestroy": (...args: [Pointer]) => number;
    "SendIMEMessageExA": (...args: [Pointer, number]) => number;
    "SendIMEMessageExW": (...args: [Pointer, number]) => number;
    "IMPGetIMEA": (...args: [Pointer, Pointer]) => number;
    "IMPGetIMEW": (...args: [Pointer, Pointer]) => number;
    "IMPQueryIMEA": (...args: [Pointer]) => number;
    "IMPQueryIMEW": (...args: [Pointer]) => number;
    "IMPSetIMEA": (...args: [Pointer, Pointer]) => number;
    "IMPSetIMEW": (...args: [Pointer, Pointer]) => number;
    "WINNLSGetIMEHotkey": (...args: [Pointer]) => number;
    "WINNLSEnableIME": (...args: [Pointer, number]) => number;
    "WINNLSGetEnableStatus": (...args: [Pointer]) => number;
    "RegisterPointerInputTarget": (...args: [Pointer, number]) => number;
    "UnregisterPointerInputTarget": (...args: [Pointer, number]) => number;
    "RegisterPointerInputTargetEx": (...args: [Pointer, number, number]) => number;
    "UnregisterPointerInputTargetEx": (...args: [Pointer, number]) => number;
    "NotifyWinEvent": (...args: [number, Pointer, number, number]) => void;
    "SetWinEventHook": (...args: [number, number, Pointer, Pointer, number, number, number]) => Pointer;
    "IsWinEventHookInstalled": (...args: [number]) => number;
    "UnhookWinEvent": (...args: [Pointer]) => number;
    "LoadKeyboardLayoutA": (...args: [Pointer, number]) => Pointer;
    "LoadKeyboardLayoutW": (...args: [Pointer, number]) => Pointer;
    "ActivateKeyboardLayout": (...args: [Pointer, number]) => Pointer;
    "ToUnicodeEx": (...args: [number, number, Pointer, Pointer, number, number, Pointer]) => number;
    "UnloadKeyboardLayout": (...args: [Pointer]) => number;
    "GetKeyboardLayoutNameA": (...args: [Pointer]) => number;
    "GetKeyboardLayoutNameW": (...args: [Pointer]) => number;
    "GetKeyboardLayoutList": (...args: [number, Pointer]) => number;
    "GetKeyboardLayout": (...args: [number]) => Pointer;
    "GetMouseMovePointsEx": (...args: [number, Pointer, Pointer, number, number]) => number;
    "TrackMouseEvent": (...args: [Pointer]) => number;
    "RegisterHotKey": (...args: [Pointer, number, number, number]) => number;
    "UnregisterHotKey": (...args: [Pointer, number]) => number;
    "SwapMouseButton": (...args: [number]) => number;
    "GetDoubleClickTime": (...args: []) => number;
    "SetDoubleClickTime": (...args: [number]) => number;
    "SetFocus": (...args: [Pointer]) => Pointer;
    "GetActiveWindow": (...args: []) => Pointer;
    "GetFocus": (...args: []) => Pointer;
    "GetKBCodePage": (...args: []) => number;
    "GetKeyState": (...args: [number]) => number;
    "GetAsyncKeyState": (...args: [number]) => number;
    "GetKeyboardState": (...args: [Pointer]) => number;
    "SetKeyboardState": (...args: [Pointer]) => number;
    "GetKeyNameTextA": (...args: [number, Pointer, number]) => number;
    "GetKeyNameTextW": (...args: [number, Pointer, number]) => number;
    "GetKeyboardType": (...args: [number]) => number;
    "ToAscii": (...args: [number, number, Pointer, Pointer, number]) => number;
    "ToAsciiEx": (...args: [number, number, Pointer, Pointer, number, Pointer]) => number;
    "ToUnicode": (...args: [number, number, Pointer, Pointer, number, number]) => number;
    "OemKeyScan": (...args: [number]) => number;
    "VkKeyScanA": (...args: [number]) => number;
    "VkKeyScanW": (...args: [number]) => number;
    "VkKeyScanExA": (...args: [number, Pointer]) => number;
    "VkKeyScanExW": (...args: [number, Pointer]) => number;
    "keybd_event": (...args: [number, number, number, number]) => void;
    "mouse_event": (...args: [number, number, number, number, number]) => void;
    "SendInput": (...args: [number, Pointer, number]) => number;
    "GetLastInputInfo": (...args: [Pointer]) => number;
    "MapVirtualKeyA": (...args: [number, number]) => number;
    "MapVirtualKeyW": (...args: [number, number]) => number;
    "MapVirtualKeyExA": (...args: [number, number, Pointer]) => number;
    "MapVirtualKeyExW": (...args: [number, number, Pointer]) => number;
    "GetCapture": (...args: []) => Pointer;
    "SetCapture": (...args: [Pointer]) => Pointer;
    "ReleaseCapture": (...args: []) => number;
    "EnableWindow": (...args: [Pointer, number]) => number;
    "IsWindowEnabled": (...args: [Pointer]) => number;
    "DragDetect": (...args: [Pointer, Pointer]) => number;
    "SetActiveWindow": (...args: [Pointer]) => Pointer;
    "BlockInput": (...args: [number]) => number;
    "LoadStringA": (...args: [Pointer, number, Pointer, number]) => number;
    "LoadStringW": (...args: [Pointer, number, Pointer, number]) => number;
    "GetWindowLongPtrA": (...args: [Pointer, number]) => number;
    "GetWindowLongPtrW": (...args: [Pointer, number]) => number;
    "SetWindowLongPtrA": (...args: [Pointer, number, number]) => number;
    "SetWindowLongPtrW": (...args: [Pointer, number, number]) => number;
    "GetClassLongPtrA": (...args: [Pointer, number]) => number;
    "GetClassLongPtrW": (...args: [Pointer, number]) => number;
    "SetClassLongPtrA": (...args: [Pointer, number, number]) => number;
    "SetClassLongPtrW": (...args: [Pointer, number, number]) => number;
    "wvsprintfA": (...args: [Pointer, Pointer, Pointer]) => number;
    "wvsprintfW": (...args: [Pointer, Pointer, Pointer]) => number;
    "wsprintfA": (...args: [Pointer, Pointer]) => number;
    "wsprintfW": (...args: [Pointer, Pointer]) => number;
    "IsHungAppWindow": (...args: [Pointer]) => number;
    "DisableProcessWindowsGhosting": (...args: []) => void;
    "RegisterWindowMessageA": (...args: [Pointer]) => number;
    "RegisterWindowMessageW": (...args: [Pointer]) => number;
    "GetMessageA": (...args: [Pointer, Pointer, number, number]) => number;
    "GetMessageW": (...args: [Pointer, Pointer, number, number]) => number;
    "TranslateMessage": (...args: [Pointer]) => number;
    "DispatchMessageA": (...args: [Pointer]) => number;
    "DispatchMessageW": (...args: [Pointer]) => number;
    "SetMessageQueue": (...args: [number]) => number;
    "PeekMessageA": (...args: [Pointer, Pointer, number, number, number]) => number;
    "PeekMessageW": (...args: [Pointer, Pointer, number, number, number]) => number;
    "GetMessagePos": (...args: []) => number;
    "GetMessageTime": (...args: []) => number;
    "GetMessageExtraInfo": (...args: []) => number;
    "IsWow64Message": (...args: []) => number;
    "SetMessageExtraInfo": (...args: [number]) => number;
    "SendMessageA": (...args: [Pointer, number, number, number]) => number;
    "SendMessageW": (...args: [Pointer, number, number, number]) => number;
    "SendMessageTimeoutA": (...args: [Pointer, number, number, number, number, number, Pointer]) => number;
    "SendMessageTimeoutW": (...args: [Pointer, number, number, number, number, number, Pointer]) => number;
    "SendNotifyMessageA": (...args: [Pointer, number, number, number]) => number;
    "SendNotifyMessageW": (...args: [Pointer, number, number, number]) => number;
    "SendMessageCallbackA": (...args: [Pointer, number, number, number, Pointer, number]) => number;
    "SendMessageCallbackW": (...args: [Pointer, number, number, number, Pointer, number]) => number;
    "RegisterDeviceNotificationA": (...args: [Pointer, Pointer, number]) => Pointer;
    "RegisterDeviceNotificationW": (...args: [Pointer, Pointer, number]) => Pointer;
    "UnregisterDeviceNotification": (...args: [Pointer]) => number;
    "PostMessageA": (...args: [Pointer, number, number, number]) => number;
    "PostMessageW": (...args: [Pointer, number, number, number]) => number;
    "PostThreadMessageA": (...args: [number, number, number, number]) => number;
    "PostThreadMessageW": (...args: [number, number, number, number]) => number;
    "ReplyMessage": (...args: [number]) => number;
    "WaitMessage": (...args: []) => number;
    "DefWindowProcA": (...args: [Pointer, number, number, number]) => number;
    "DefWindowProcW": (...args: [Pointer, number, number, number]) => number;
    "PostQuitMessage": (...args: [number]) => void;
    "CallWindowProcA": (...args: [Pointer, Pointer, number, number, number]) => number;
    "CallWindowProcW": (...args: [Pointer, Pointer, number, number, number]) => number;
    "InSendMessage": (...args: []) => number;
    "InSendMessageEx": (...args: [Pointer]) => number;
    "RegisterClassA": (...args: [Pointer]) => number;
    "RegisterClassW": (...args: [Pointer]) => number;
    "UnregisterClassA": (...args: [Pointer, Pointer]) => number;
    "UnregisterClassW": (...args: [Pointer, Pointer]) => number;
    "GetClassInfoA": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetClassInfoW": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegisterClassExA": (...args: [Pointer]) => number;
    "RegisterClassExW": (...args: [Pointer]) => number;
    "GetClassInfoExA": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetClassInfoExW": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateWindowExA": (...args: [number, Pointer, Pointer, number, number, number, number, number, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateWindowExW": (...args: [number, Pointer, Pointer, number, number, number, number, number, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "IsWindow": (...args: [Pointer]) => number;
    "IsMenu": (...args: [Pointer]) => number;
    "IsChild": (...args: [Pointer, Pointer]) => number;
    "DestroyWindow": (...args: [Pointer]) => number;
    "ShowWindow": (...args: [Pointer, number]) => number;
    "AnimateWindow": (...args: [Pointer, number, number]) => number;
    "UpdateLayeredWindow": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "UpdateLayeredWindowIndirect": (...args: [Pointer, Pointer]) => number;
    "GetLayeredWindowAttributes": (...args: [Pointer, Pointer, Pointer, Pointer]) => number;
    "SetLayeredWindowAttributes": (...args: [Pointer, number, number, number]) => number;
    "ShowWindowAsync": (...args: [Pointer, number]) => number;
    "FlashWindow": (...args: [Pointer, number]) => number;
    "FlashWindowEx": (...args: [Pointer]) => number;
    "ShowOwnedPopups": (...args: [Pointer, number]) => number;
    "OpenIcon": (...args: [Pointer]) => number;
    "CloseWindow": (...args: [Pointer]) => number;
    "MoveWindow": (...args: [Pointer, number, number, number, number, number]) => number;
    "SetWindowPos": (...args: [Pointer, Pointer, number, number, number, number, number]) => number;
    "GetWindowPlacement": (...args: [Pointer, Pointer]) => number;
    "SetWindowPlacement": (...args: [Pointer, Pointer]) => number;
    "GetWindowDisplayAffinity": (...args: [Pointer, Pointer]) => number;
    "SetWindowDisplayAffinity": (...args: [Pointer, number]) => number;
    "BeginDeferWindowPos": (...args: [number]) => Pointer;
    "DeferWindowPos": (...args: [Pointer, Pointer, Pointer, number, number, number, number, number]) => Pointer;
    "EndDeferWindowPos": (...args: [Pointer]) => number;
    "IsWindowVisible": (...args: [Pointer]) => number;
    "IsIconic": (...args: [Pointer]) => number;
    "AnyPopup": (...args: []) => number;
    "BringWindowToTop": (...args: [Pointer]) => number;
    "IsZoomed": (...args: [Pointer]) => number;
    "CreateDialogParamA": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => Pointer;
    "CreateDialogParamW": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => Pointer;
    "CreateDialogIndirectParamA": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => Pointer;
    "CreateDialogIndirectParamW": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => Pointer;
    "DialogBoxParamA": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "DialogBoxParamW": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "DialogBoxIndirectParamA": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "DialogBoxIndirectParamW": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "EndDialog": (...args: [Pointer, number]) => number;
    "GetDlgItem": (...args: [Pointer, number]) => Pointer;
    "SetDlgItemInt": (...args: [Pointer, number, number, number]) => number;
    "GetDlgItemInt": (...args: [Pointer, number, Pointer, number]) => number;
    "SetDlgItemTextA": (...args: [Pointer, number, Pointer]) => number;
    "SetDlgItemTextW": (...args: [Pointer, number, Pointer]) => number;
    "GetDlgItemTextA": (...args: [Pointer, number, Pointer, number]) => number;
    "GetDlgItemTextW": (...args: [Pointer, number, Pointer, number]) => number;
    "SendDlgItemMessageA": (...args: [Pointer, number, number, number, number]) => number;
    "SendDlgItemMessageW": (...args: [Pointer, number, number, number, number]) => number;
    "GetNextDlgGroupItem": (...args: [Pointer, Pointer, number]) => Pointer;
    "GetNextDlgTabItem": (...args: [Pointer, Pointer, number]) => Pointer;
    "GetDlgCtrlID": (...args: [Pointer]) => number;
    "GetDialogBaseUnits": (...args: []) => number;
    "DefDlgProcA": (...args: [Pointer, number, number, number]) => number;
    "DefDlgProcW": (...args: [Pointer, number, number, number]) => number;
    "CallMsgFilterA": (...args: [Pointer, number]) => number;
    "CallMsgFilterW": (...args: [Pointer, number]) => number;
    "CharToOemA": (...args: [Pointer, Pointer]) => number;
    "CharToOemW": (...args: [Pointer, Pointer]) => number;
    "OemToCharA": (...args: [Pointer, Pointer]) => number;
    "OemToCharW": (...args: [Pointer, Pointer]) => number;
    "CharToOemBuffA": (...args: [Pointer, Pointer, number]) => number;
    "CharToOemBuffW": (...args: [Pointer, Pointer, number]) => number;
    "OemToCharBuffA": (...args: [Pointer, Pointer, number]) => number;
    "OemToCharBuffW": (...args: [Pointer, Pointer, number]) => number;
    "CharUpperA": (...args: [Pointer]) => Pointer;
    "CharUpperW": (...args: [Pointer]) => Pointer;
    "CharUpperBuffA": (...args: [Pointer, number]) => number;
    "CharUpperBuffW": (...args: [Pointer, number]) => number;
    "CharLowerA": (...args: [Pointer]) => Pointer;
    "CharLowerW": (...args: [Pointer]) => Pointer;
    "CharLowerBuffA": (...args: [Pointer, number]) => number;
    "CharLowerBuffW": (...args: [Pointer, number]) => number;
    "CharNextA": (...args: [Pointer]) => Pointer;
    "CharNextW": (...args: [Pointer]) => Pointer;
    "CharPrevA": (...args: [Pointer, Pointer]) => Pointer;
    "CharPrevW": (...args: [Pointer, Pointer]) => Pointer;
    "CharNextExA": (...args: [number, Pointer, number]) => Pointer;
    "CharPrevExA": (...args: [number, Pointer, Pointer, number]) => Pointer;
    "IsCharAlphaA": (...args: [number]) => number;
    "IsCharAlphaW": (...args: [number]) => number;
    "IsCharAlphaNumericA": (...args: [number]) => number;
    "IsCharAlphaNumericW": (...args: [number]) => number;
    "IsCharUpperA": (...args: [number]) => number;
    "IsCharUpperW": (...args: [number]) => number;
    "IsCharLowerA": (...args: [number]) => number;
    "IsCharLowerW": (...args: [number]) => number;
    "GetInputState": (...args: []) => number;
    "GetQueueStatus": (...args: [number]) => number;
    "MsgWaitForMultipleObjects": (...args: [number, Pointer, number, number, number]) => number;
    "MsgWaitForMultipleObjectsEx": (...args: [number, Pointer, number, number, number]) => number;
    "SetTimer": (...args: [Pointer, number, number, Pointer]) => number;
    "SetCoalescableTimer": (...args: [Pointer, number, number, Pointer, number]) => number;
    "KillTimer": (...args: [Pointer, number]) => number;
    "IsWindowUnicode": (...args: [Pointer]) => number;
    "LoadAcceleratorsA": (...args: [Pointer, Pointer]) => Pointer;
    "LoadAcceleratorsW": (...args: [Pointer, Pointer]) => Pointer;
    "CreateAcceleratorTableA": (...args: [Pointer, number]) => Pointer;
    "CreateAcceleratorTableW": (...args: [Pointer, number]) => Pointer;
    "DestroyAcceleratorTable": (...args: [Pointer]) => number;
    "CopyAcceleratorTableA": (...args: [Pointer, Pointer, number]) => number;
    "CopyAcceleratorTableW": (...args: [Pointer, Pointer, number]) => number;
    "TranslateAcceleratorA": (...args: [Pointer, Pointer, Pointer]) => number;
    "TranslateAcceleratorW": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetSystemMetrics": (...args: [number]) => number;
    "LoadMenuA": (...args: [Pointer, Pointer]) => Pointer;
    "LoadMenuW": (...args: [Pointer, Pointer]) => Pointer;
    "LoadMenuIndirectA": (...args: [Pointer]) => Pointer;
    "LoadMenuIndirectW": (...args: [Pointer]) => Pointer;
    "GetMenu": (...args: [Pointer]) => Pointer;
    "SetMenu": (...args: [Pointer, Pointer]) => number;
    "ChangeMenuA": (...args: [Pointer, number, Pointer, number, number]) => number;
    "ChangeMenuW": (...args: [Pointer, number, Pointer, number, number]) => number;
    "HiliteMenuItem": (...args: [Pointer, Pointer, number, number]) => number;
    "GetMenuStringA": (...args: [Pointer, number, Pointer, number, number]) => number;
    "GetMenuStringW": (...args: [Pointer, number, Pointer, number, number]) => number;
    "GetMenuState": (...args: [Pointer, number, number]) => number;
    "DrawMenuBar": (...args: [Pointer]) => number;
    "GetSystemMenu": (...args: [Pointer, number]) => Pointer;
    "CreateMenu": (...args: []) => Pointer;
    "CreatePopupMenu": (...args: []) => Pointer;
    "DestroyMenu": (...args: [Pointer]) => number;
    "CheckMenuItem": (...args: [Pointer, number, number]) => number;
    "EnableMenuItem": (...args: [Pointer, number, number]) => number;
    "GetSubMenu": (...args: [Pointer, number]) => Pointer;
    "GetMenuItemID": (...args: [Pointer, number]) => number;
    "GetMenuItemCount": (...args: [Pointer]) => number;
    "InsertMenuA": (...args: [Pointer, number, number, number, Pointer]) => number;
    "InsertMenuW": (...args: [Pointer, number, number, number, Pointer]) => number;
    "AppendMenuA": (...args: [Pointer, number, number, Pointer]) => number;
    "AppendMenuW": (...args: [Pointer, number, number, Pointer]) => number;
    "ModifyMenuA": (...args: [Pointer, number, number, number, Pointer]) => number;
    "ModifyMenuW": (...args: [Pointer, number, number, number, Pointer]) => number;
    "RemoveMenu": (...args: [Pointer, number, number]) => number;
    "DeleteMenu": (...args: [Pointer, number, number]) => number;
    "SetMenuItemBitmaps": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "GetMenuCheckMarkDimensions": (...args: []) => number;
    "TrackPopupMenu": (...args: [Pointer, number, number, number, number, Pointer, Pointer]) => number;
    "TrackPopupMenuEx": (...args: [Pointer, number, number, number, Pointer, Pointer]) => number;
    "CalculatePopupWindowPosition": (...args: [Pointer, Pointer, number, Pointer, Pointer]) => number;
    "GetMenuInfo": (...args: [Pointer, Pointer]) => number;
    "SetMenuInfo": (...args: [Pointer, Pointer]) => number;
    "EndMenu": (...args: []) => number;
    "InsertMenuItemA": (...args: [Pointer, number, number, Pointer]) => number;
    "InsertMenuItemW": (...args: [Pointer, number, number, Pointer]) => number;
    "GetMenuItemInfoA": (...args: [Pointer, number, number, Pointer]) => number;
    "GetMenuItemInfoW": (...args: [Pointer, number, number, Pointer]) => number;
    "SetMenuItemInfoA": (...args: [Pointer, number, number, Pointer]) => number;
    "SetMenuItemInfoW": (...args: [Pointer, number, number, Pointer]) => number;
    "GetMenuDefaultItem": (...args: [Pointer, number, number]) => number;
    "SetMenuDefaultItem": (...args: [Pointer, number, number]) => number;
    "GetMenuItemRect": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "MenuItemFromPoint": (...args: [Pointer, Pointer, Pointer]) => number;
    "DragObject": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "DrawIcon": (...args: [Pointer, number, number, Pointer]) => number;
    "GetForegroundWindow": (...args: []) => Pointer;
    "SwitchToThisWindow": (...args: [Pointer, number]) => void;
    "SetForegroundWindow": (...args: [Pointer]) => number;
    "AllowSetForegroundWindow": (...args: [number]) => number;
    "LockSetForegroundWindow": (...args: [number]) => number;
    "ScrollWindow": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "ScrollDC": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer]) => number;
    "ScrollWindowEx": (...args: [Pointer, number, number, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "GetScrollPos": (...args: [Pointer, number]) => number;
    "GetScrollRange": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "SetPropA": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetPropW": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetPropA": (...args: [Pointer, Pointer]) => Pointer;
    "GetPropW": (...args: [Pointer, Pointer]) => Pointer;
    "RemovePropA": (...args: [Pointer, Pointer]) => Pointer;
    "RemovePropW": (...args: [Pointer, Pointer]) => Pointer;
    "EnumPropsExA": (...args: [Pointer, Pointer, number]) => number;
    "EnumPropsExW": (...args: [Pointer, Pointer, number]) => number;
    "EnumPropsA": (...args: [Pointer, Pointer]) => number;
    "EnumPropsW": (...args: [Pointer, Pointer]) => number;
    "SetWindowTextA": (...args: [Pointer, Pointer]) => number;
    "SetWindowTextW": (...args: [Pointer, Pointer]) => number;
    "GetWindowTextA": (...args: [Pointer, Pointer, number]) => number;
    "GetWindowTextW": (...args: [Pointer, Pointer, number]) => number;
    "GetWindowTextLengthA": (...args: [Pointer]) => number;
    "GetWindowTextLengthW": (...args: [Pointer]) => number;
    "GetClientRect": (...args: [Pointer, Pointer]) => number;
    "GetWindowRect": (...args: [Pointer, Pointer]) => number;
    "AdjustWindowRect": (...args: [Pointer, number, number]) => number;
    "AdjustWindowRectEx": (...args: [Pointer, number, number, number]) => number;
    "MessageBoxA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "MessageBoxW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "MessageBoxExA": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "MessageBoxExW": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "MessageBoxIndirectA": (...args: [Pointer]) => number;
    "MessageBoxIndirectW": (...args: [Pointer]) => number;
    "ShowCursor": (...args: [number]) => number;
    "SetCursorPos": (...args: [number, number]) => number;
    "SetPhysicalCursorPos": (...args: [number, number]) => number;
    "SetCursor": (...args: [Pointer]) => Pointer;
    "GetCursorPos": (...args: [Pointer]) => number;
    "GetPhysicalCursorPos": (...args: [Pointer]) => number;
    "GetClipCursor": (...args: [Pointer]) => number;
    "GetCursor": (...args: []) => Pointer;
    "CreateCaret": (...args: [Pointer, Pointer, number, number]) => number;
    "GetCaretBlinkTime": (...args: []) => number;
    "SetCaretBlinkTime": (...args: [number]) => number;
    "DestroyCaret": (...args: []) => number;
    "HideCaret": (...args: [Pointer]) => number;
    "ShowCaret": (...args: [Pointer]) => number;
    "SetCaretPos": (...args: [number, number]) => number;
    "GetCaretPos": (...args: [Pointer]) => number;
    "LogicalToPhysicalPoint": (...args: [Pointer, Pointer]) => number;
    "PhysicalToLogicalPoint": (...args: [Pointer, Pointer]) => number;
    "WindowFromPoint": (...args: [Pointer]) => Pointer;
    "WindowFromPhysicalPoint": (...args: [Pointer]) => Pointer;
    "ChildWindowFromPoint": (...args: [Pointer, Pointer]) => Pointer;
    "ClipCursor": (...args: [Pointer]) => number;
    "ChildWindowFromPointEx": (...args: [Pointer, Pointer, number]) => Pointer;
    "GetWindowWord": (...args: [Pointer, number]) => number;
    "SetWindowWord": (...args: [Pointer, number, number]) => number;
    "GetWindowLongA": (...args: [Pointer, number]) => number;
    "GetWindowLongW": (...args: [Pointer, number]) => number;
    "SetWindowLongA": (...args: [Pointer, number, number]) => number;
    "SetWindowLongW": (...args: [Pointer, number, number]) => number;
    "GetClassWord": (...args: [Pointer, number]) => number;
    "SetClassWord": (...args: [Pointer, number, number]) => number;
    "GetClassLongA": (...args: [Pointer, number]) => number;
    "GetClassLongW": (...args: [Pointer, number]) => number;
    "SetClassLongA": (...args: [Pointer, number, number]) => number;
    "SetClassLongW": (...args: [Pointer, number, number]) => number;
    "GetProcessDefaultLayout": (...args: [Pointer]) => number;
    "SetProcessDefaultLayout": (...args: [number]) => number;
    "GetDesktopWindow": (...args: []) => Pointer;
    "GetParent": (...args: [Pointer]) => Pointer;
    "SetParent": (...args: [Pointer, Pointer]) => Pointer;
    "EnumChildWindows": (...args: [Pointer, Pointer, number]) => number;
    "FindWindowA": (...args: [Pointer, Pointer]) => Pointer;
    "FindWindowW": (...args: [Pointer, Pointer]) => Pointer;
    "FindWindowExA": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "FindWindowExW": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "GetShellWindow": (...args: []) => Pointer;
    "RegisterShellHookWindow": (...args: [Pointer]) => number;
    "DeregisterShellHookWindow": (...args: [Pointer]) => number;
    "EnumWindows": (...args: [Pointer, number]) => number;
    "EnumThreadWindows": (...args: [number, Pointer, number]) => number;
    "GetClassNameA": (...args: [Pointer, Pointer, number]) => number;
    "GetClassNameW": (...args: [Pointer, Pointer, number]) => number;
    "GetTopWindow": (...args: [Pointer]) => Pointer;
    "GetWindowThreadProcessId": (...args: [Pointer, Pointer]) => number;
    "IsGUIThread": (...args: [number]) => number;
    "GetLastActivePopup": (...args: [Pointer]) => Pointer;
    "GetWindow": (...args: [Pointer, number]) => Pointer;
    "SetWindowsHookA": (...args: [number, Pointer]) => Pointer;
    "SetWindowsHookW": (...args: [number, Pointer]) => Pointer;
    "UnhookWindowsHook": (...args: [number, Pointer]) => number;
    "SetWindowsHookExA": (...args: [number, Pointer, Pointer, number]) => Pointer;
    "SetWindowsHookExW": (...args: [number, Pointer, Pointer, number]) => Pointer;
    "UnhookWindowsHookEx": (...args: [Pointer]) => number;
    "CallNextHookEx": (...args: [Pointer, number, number, number]) => number;
    "CheckMenuRadioItem": (...args: [Pointer, number, number, number, number]) => number;
    "LoadCursorA": (...args: [Pointer, Pointer]) => Pointer;
    "LoadCursorW": (...args: [Pointer, Pointer]) => Pointer;
    "LoadCursorFromFileA": (...args: [Pointer]) => Pointer;
    "LoadCursorFromFileW": (...args: [Pointer]) => Pointer;
    "CreateCursor": (...args: [Pointer, number, number, number, number, Pointer, Pointer]) => Pointer;
    "DestroyCursor": (...args: [Pointer]) => number;
    "SetSystemCursor": (...args: [Pointer, number]) => number;
    "LoadIconA": (...args: [Pointer, Pointer]) => Pointer;
    "LoadIconW": (...args: [Pointer, Pointer]) => Pointer;
    "PrivateExtractIconsA": (...args: [Pointer, number, number, number, Pointer, Pointer, number, number]) => number;
    "PrivateExtractIconsW": (...args: [Pointer, number, number, number, Pointer, Pointer, number, number]) => number;
    "CreateIcon": (...args: [Pointer, number, number, number, number, Pointer, Pointer]) => Pointer;
    "DestroyIcon": (...args: [Pointer]) => number;
    "LookupIconIdFromDirectory": (...args: [Pointer, number]) => number;
    "LookupIconIdFromDirectoryEx": (...args: [Pointer, number, number, number, number]) => number;
    "CreateIconFromResource": (...args: [Pointer, number, number, number]) => Pointer;
    "CreateIconFromResourceEx": (...args: [Pointer, number, number, number, number, number, number]) => Pointer;
    "LoadImageA": (...args: [Pointer, Pointer, number, number, number, number]) => Pointer;
    "LoadImageW": (...args: [Pointer, Pointer, number, number, number, number]) => Pointer;
    "CopyImage": (...args: [Pointer, number, number, number, number]) => Pointer;
    "DrawIconEx": (...args: [Pointer, number, number, Pointer, number, number, number, Pointer, number]) => number;
    "CreateIconIndirect": (...args: [Pointer]) => Pointer;
    "CopyIcon": (...args: [Pointer]) => Pointer;
    "GetIconInfo": (...args: [Pointer, Pointer]) => number;
    "GetIconInfoExA": (...args: [Pointer, Pointer]) => number;
    "GetIconInfoExW": (...args: [Pointer, Pointer]) => number;
    "IsDialogMessageA": (...args: [Pointer, Pointer]) => number;
    "IsDialogMessageW": (...args: [Pointer, Pointer]) => number;
    "MapDialogRect": (...args: [Pointer, Pointer]) => number;
    "GetScrollInfo": (...args: [Pointer, number, Pointer]) => number;
    "DefFrameProcA": (...args: [Pointer, Pointer, number, number, number]) => number;
    "DefFrameProcW": (...args: [Pointer, Pointer, number, number, number]) => number;
    "DefMDIChildProcA": (...args: [Pointer, number, number, number]) => number;
    "DefMDIChildProcW": (...args: [Pointer, number, number, number]) => number;
    "TranslateMDISysAccel": (...args: [Pointer, Pointer]) => number;
    "ArrangeIconicWindows": (...args: [Pointer]) => number;
    "CreateMDIWindowA": (...args: [Pointer, Pointer, number, number, number, number, number, Pointer, Pointer, number]) => Pointer;
    "CreateMDIWindowW": (...args: [Pointer, Pointer, number, number, number, number, number, Pointer, Pointer, number]) => Pointer;
    "TileWindows": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "CascadeWindows": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SystemParametersInfoA": (...args: [number, number, Pointer, number]) => number;
    "SystemParametersInfoW": (...args: [number, number, Pointer, number]) => number;
    "SoundSentry": (...args: []) => number;
    "SetDebugErrorLevel": (...args: [number]) => void;
    "InternalGetWindowText": (...args: [Pointer, Pointer, number]) => number;
    "CancelShutdown": (...args: []) => number;
    "GetGUIThreadInfo": (...args: [number, Pointer]) => number;
    "SetProcessDPIAware": (...args: []) => number;
    "IsProcessDPIAware": (...args: []) => number;
    "InheritWindowMonitor": (...args: [Pointer, Pointer]) => number;
    "GetWindowModuleFileNameA": (...args: [Pointer, Pointer, number]) => number;
    "GetWindowModuleFileNameW": (...args: [Pointer, Pointer, number]) => number;
    "GetCursorInfo": (...args: [Pointer]) => number;
    "GetWindowInfo": (...args: [Pointer, Pointer]) => number;
    "GetTitleBarInfo": (...args: [Pointer, Pointer]) => number;
    "GetMenuBarInfo": (...args: [Pointer, number, number, Pointer]) => number;
    "GetScrollBarInfo": (...args: [Pointer, number, Pointer]) => number;
    "GetAncestor": (...args: [Pointer, number]) => Pointer;
    "RealChildWindowFromPoint": (...args: [Pointer, Pointer]) => Pointer;
    "RealGetWindowClassA": (...args: [Pointer, Pointer, number]) => number;
    "RealGetWindowClassW": (...args: [Pointer, Pointer, number]) => number;
    "GetAltTabInfoA": (...args: [Pointer, number, Pointer, Pointer, number]) => number;
    "GetAltTabInfoW": (...args: [Pointer, number, Pointer, Pointer, number]) => number;
    "ChangeWindowMessageFilter": (...args: [number, number]) => number;
    "ChangeWindowMessageFilterEx": (...args: [Pointer, number, number, Pointer]) => number;
    "ConvertToInterceptWindow": (...args: [Pointer]) => number;
    "IsInterceptWindow": (...args: [Pointer, Pointer]) => number;
    "ApplyWindowAction": (...args: [Pointer, Pointer]) => number;
    "SetAdditionalForegroundBoostProcesses": (...args: [Pointer, number, Pointer]) => number;
    "RegisterForTooltipDismissNotification": (...args: [Pointer, number]) => number;
    "ConvertPrimaryPointerToMouseDrag": (...args: []) => number;
    "IsWindowArranged": (...args: [Pointer]) => number;
    "GetCurrentMonitorTopologyId": (...args: []) => number;
    "RegisterCloakedNotification": (...args: [Pointer, number]) => number;
    "EnterMoveSizeLoop": (...args: [Pointer, Pointer, number]) => number;
    "UserHandleGrantAccess": (...args: [Pointer, Pointer, number]) => number;
    "GetTouchInputInfo": (...args: [Pointer, number, Pointer, number]) => number;
    "CloseTouchInputHandle": (...args: [Pointer]) => number;
    "RegisterTouchWindow": (...args: [Pointer, number]) => number;
    "UnregisterTouchWindow": (...args: [Pointer]) => number;
    "IsTouchWindow": (...args: [Pointer, Pointer]) => number;
    "GetGestureInfo": (...args: [Pointer, Pointer]) => number;
    "GetGestureExtraArgs": (...args: [Pointer, number, Pointer]) => number;
    "CloseGestureInfoHandle": (...args: [Pointer]) => number;
    "SetGestureConfig": (...args: [Pointer, number, number, Pointer, number]) => number;
    "GetGestureConfig": (...args: [Pointer, number, number, Pointer, Pointer, number]) => number;
    "CreateDesktopA": (...args: [Pointer, Pointer, Pointer, number, number, Pointer]) => Pointer;
    "CreateDesktopW": (...args: [Pointer, Pointer, Pointer, number, number, Pointer]) => Pointer;
    "CreateDesktopExA": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, number, Pointer]) => Pointer;
    "CreateDesktopExW": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, number, Pointer]) => Pointer;
    "OpenDesktopA": (...args: [Pointer, number, number, number]) => Pointer;
    "OpenDesktopW": (...args: [Pointer, number, number, number]) => Pointer;
    "OpenInputDesktop": (...args: [number, number, number]) => Pointer;
    "EnumDesktopsA": (...args: [Pointer, Pointer, number]) => number;
    "EnumDesktopsW": (...args: [Pointer, Pointer, number]) => number;
    "EnumDesktopWindows": (...args: [Pointer, Pointer, number]) => number;
    "SwitchDesktop": (...args: [Pointer]) => number;
    "SetThreadDesktop": (...args: [Pointer]) => number;
    "CloseDesktop": (...args: [Pointer]) => number;
    "GetThreadDesktop": (...args: [number]) => Pointer;
    "CreateWindowStationA": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "CreateWindowStationW": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "OpenWindowStationA": (...args: [Pointer, number, number]) => Pointer;
    "OpenWindowStationW": (...args: [Pointer, number, number]) => Pointer;
    "EnumWindowStationsA": (...args: [Pointer, number]) => number;
    "EnumWindowStationsW": (...args: [Pointer, number]) => number;
    "CloseWindowStation": (...args: [Pointer]) => number;
    "SetProcessWindowStation": (...args: [Pointer]) => number;
    "GetProcessWindowStation": (...args: []) => Pointer;
    "GetUserObjectInformationA": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "GetUserObjectInformationW": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetUserObjectInformationA": (...args: [Pointer, number, Pointer, number]) => number;
    "SetUserObjectInformationW": (...args: [Pointer, number, Pointer, number]) => number;
    "BroadcastSystemMessageExA": (...args: [number, Pointer, number, number, number, Pointer]) => number;
    "BroadcastSystemMessageExW": (...args: [number, Pointer, number, number, number, Pointer]) => number;
    "BroadcastSystemMessageA": (...args: [number, Pointer, number, number, number]) => number;
    "BroadcastSystemMessageW": (...args: [number, Pointer, number, number, number]) => number;
    "GetUnpredictedMessagePos": (...args: []) => number;
    "InitializeTouchInjection": (...args: [number, number]) => number;
    "InjectTouchInput": (...args: [number, Pointer]) => number;
    "GetPointerType": (...args: [number, Pointer]) => number;
    "GetPointerCursorId": (...args: [number, Pointer]) => number;
    "GetPointerInfo": (...args: [number, Pointer]) => number;
    "GetPointerInfoHistory": (...args: [number, Pointer, Pointer]) => number;
    "GetPointerFrameInfo": (...args: [number, Pointer, Pointer]) => number;
    "GetPointerFrameInfoHistory": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "GetPointerTouchInfo": (...args: [number, Pointer]) => number;
    "GetPointerTouchInfoHistory": (...args: [number, Pointer, Pointer]) => number;
    "GetPointerFrameTouchInfo": (...args: [number, Pointer, Pointer]) => number;
    "GetPointerFrameTouchInfoHistory": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "GetPointerPenInfo": (...args: [number, Pointer]) => number;
    "GetPointerPenInfoHistory": (...args: [number, Pointer, Pointer]) => number;
    "GetPointerFramePenInfo": (...args: [number, Pointer, Pointer]) => number;
    "GetPointerFramePenInfoHistory": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "SkipPointerFrameMessages": (...args: [number]) => number;
    "InjectSyntheticPointerInput": (...args: [Pointer, Pointer, number]) => number;
    "DestroySyntheticPointerDevice": (...args: [Pointer]) => void;
    "EnableMouseInPointer": (...args: [number]) => number;
    "IsMouseInPointerEnabled": (...args: []) => number;
    "GetPointerInputTransform": (...args: [number, number, Pointer]) => number;
    "GetPointerDevices": (...args: [Pointer, Pointer]) => number;
    "GetPointerDevice": (...args: [Pointer, Pointer]) => number;
    "GetPointerDeviceProperties": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetPointerDeviceRects": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetPointerDeviceCursors": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetRawPointerDeviceData": (...args: [number, number, number, Pointer, Pointer]) => number;
    "GetRawInputData": (...args: [Pointer, number, Pointer, Pointer, number]) => number;
    "GetRawInputDeviceInfoA": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetRawInputDeviceInfoW": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GetRawInputBuffer": (...args: [Pointer, Pointer, number]) => number;
    "RegisterRawInputDevices": (...args: [Pointer, number, number]) => number;
    "GetRegisteredRawInputDevices": (...args: [Pointer, Pointer, number]) => number;
    "GetRawInputDeviceList": (...args: [Pointer, Pointer, number]) => number;
    "DefRawInputProc": (...args: [Pointer, number, number]) => number;
    "GetCurrentInputMessageSource": (...args: [Pointer]) => number;
    "GetCIMSSM": (...args: [Pointer]) => number;
    "DlgDirList": (...args: [Pointer, Pointer, number, number, number]) => number;
    "DlgDirSelectEx": (...args: [Pointer, Pointer, number, number]) => number;
    "DlgDirListComboBox": (...args: [Pointer, Pointer, number, number, number]) => number;
    "DlgDirSelectComboBoxEx": (...args: [Pointer, Pointer, number, number]) => number;
    "DrawText": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "DrawTextEx": (...args: [Pointer, Pointer, number, Pointer, number, Pointer]) => number;
    "GrayString": (...args: [Pointer, Pointer, Pointer, number, number, number, number, number, number]) => number;
    "DrawState": (...args: [Pointer, Pointer, Pointer, number, number, number, number, number, number, number]) => number;
    "TabbedTextOut": (...args: [Pointer, number, number, Pointer, number, number, Pointer, number]) => number;
    "GetTabbedTextExtent": (...args: [Pointer, Pointer, number, number, Pointer]) => number;
    "LoadBitmap": (...args: [Pointer, Pointer]) => Pointer;
    "ChangeDisplaySettings": (...args: [Pointer, number]) => number;
    "ChangeDisplaySettingsEx": (...args: [Pointer, Pointer, Pointer, number, Pointer]) => number;
    "EnumDisplaySettings": (...args: [Pointer, number, Pointer]) => number;
    "EnumDisplaySettingsEx": (...args: [Pointer, number, Pointer, number]) => number;
    "EnumDisplayDevices": (...args: [Pointer, number, Pointer, number]) => number;
    "GetMonitorInfo": (...args: [Pointer, Pointer]) => number;
    "WinHelp": (...args: [Pointer, Pointer, number, number]) => number;
    "GetConsoleKeyboardLayoutName": (...args: [Pointer]) => number;
    "DdeInitialize": (...args: [Pointer, Pointer, number, number]) => number;
    "DdeCreateStringHandle": (...args: [number, Pointer, number]) => Pointer;
    "DdeQueryString": (...args: [number, Pointer, Pointer, number, number]) => number;
    "RegisterClipboardFormat": (...args: [Pointer]) => number;
    "GetClipboardFormatName": (...args: [number, Pointer, number]) => number;
    "SendIMEMessageEx": (...args: [Pointer, number]) => number;
    "IMPGetIME": (...args: [Pointer, Pointer]) => number;
    "IMPQueryIME": (...args: [Pointer]) => number;
    "IMPSetIME": (...args: [Pointer, Pointer]) => number;
    "LoadKeyboardLayout": (...args: [Pointer, number]) => Pointer;
    "GetKeyboardLayoutName": (...args: [Pointer]) => number;
    "GetKeyNameText": (...args: [number, Pointer, number]) => number;
    "VkKeyScan": (...args: [number]) => number;
    "VkKeyScanEx": (...args: [number, Pointer]) => number;
    "MapVirtualKey": (...args: [number, number]) => number;
    "MapVirtualKeyEx": (...args: [number, number, Pointer]) => number;
    "LoadString": (...args: [Pointer, number, Pointer, number]) => number;
    "GetWindowLongPtr": (...args: [Pointer, number]) => number;
    "SetWindowLongPtr": (...args: [Pointer, number, number]) => number;
    "GetClassLongPtr": (...args: [Pointer, number]) => number;
    "SetClassLongPtr": (...args: [Pointer, number, number]) => number;
    "wvsprintf": (...args: [Pointer, Pointer, Pointer]) => number;
    "wsprintf": (...args: [Pointer, Pointer]) => number;
    "RegisterWindowMessage": (...args: [Pointer]) => number;
    "GetMessage": (...args: [Pointer, Pointer, number, number]) => number;
    "DispatchMessage": (...args: [Pointer]) => number;
    "PeekMessage": (...args: [Pointer, Pointer, number, number, number]) => number;
    "SendMessage": (...args: [Pointer, number, number, number]) => number;
    "SendMessageTimeout": (...args: [Pointer, number, number, number, number, number, Pointer]) => number;
    "SendNotifyMessage": (...args: [Pointer, number, number, number]) => number;
    "SendMessageCallback": (...args: [Pointer, number, number, number, Pointer, number]) => number;
    "RegisterDeviceNotification": (...args: [Pointer, Pointer, number]) => Pointer;
    "PostMessage": (...args: [Pointer, number, number, number]) => number;
    "PostThreadMessage": (...args: [number, number, number, number]) => number;
    "DefWindowProc": (...args: [Pointer, number, number, number]) => number;
    "CallWindowProc": (...args: [Pointer, Pointer, number, number, number]) => number;
    "RegisterClass": (...args: [Pointer]) => number;
    "UnregisterClass": (...args: [Pointer, Pointer]) => number;
    "GetClassInfo": (...args: [Pointer, Pointer, Pointer]) => number;
    "RegisterClassEx": (...args: [Pointer]) => number;
    "GetClassInfoEx": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateWindowEx": (...args: [number, Pointer, Pointer, number, number, number, number, number, Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateDialogParam": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => Pointer;
    "CreateDialogIndirectParam": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => Pointer;
    "DialogBoxParam": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "DialogBoxIndirectParam": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "SetDlgItemText": (...args: [Pointer, number, Pointer]) => number;
    "GetDlgItemText": (...args: [Pointer, number, Pointer, number]) => number;
    "SendDlgItemMessage": (...args: [Pointer, number, number, number, number]) => number;
    "DefDlgProc": (...args: [Pointer, number, number, number]) => number;
    "CallMsgFilter": (...args: [Pointer, number]) => number;
    "CharToOem": (...args: [Pointer, Pointer]) => number;
    "OemToChar": (...args: [Pointer, Pointer]) => number;
    "CharToOemBuff": (...args: [Pointer, Pointer, number]) => number;
    "OemToCharBuff": (...args: [Pointer, Pointer, number]) => number;
    "CharUpper": (...args: [Pointer]) => Pointer;
    "CharUpperBuff": (...args: [Pointer, number]) => number;
    "CharLower": (...args: [Pointer]) => Pointer;
    "CharLowerBuff": (...args: [Pointer, number]) => number;
    "CharNext": (...args: [Pointer]) => Pointer;
    "CharPrev": (...args: [Pointer, Pointer]) => Pointer;
    "IsCharAlpha": (...args: [number]) => number;
    "IsCharAlphaNumeric": (...args: [number]) => number;
    "IsCharUpper": (...args: [number]) => number;
    "IsCharLower": (...args: [number]) => number;
    "LoadAccelerators": (...args: [Pointer, Pointer]) => Pointer;
    "CreateAcceleratorTable": (...args: [Pointer, number]) => Pointer;
    "CopyAcceleratorTable": (...args: [Pointer, Pointer, number]) => number;
    "TranslateAccelerator": (...args: [Pointer, Pointer, Pointer]) => number;
    "LoadMenu": (...args: [Pointer, Pointer]) => Pointer;
    "LoadMenuIndirect": (...args: [Pointer]) => Pointer;
    "ChangeMenu": (...args: [Pointer, number, Pointer, number, number]) => number;
    "GetMenuString": (...args: [Pointer, number, Pointer, number, number]) => number;
    "InsertMenu": (...args: [Pointer, number, number, number, Pointer]) => number;
    "AppendMenu": (...args: [Pointer, number, number, Pointer]) => number;
    "ModifyMenu": (...args: [Pointer, number, number, number, Pointer]) => number;
    "InsertMenuItem": (...args: [Pointer, number, number, Pointer]) => number;
    "GetMenuItemInfo": (...args: [Pointer, number, number, Pointer]) => number;
    "SetMenuItemInfo": (...args: [Pointer, number, number, Pointer]) => number;
    "SetProp": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetProp": (...args: [Pointer, Pointer]) => Pointer;
    "RemoveProp": (...args: [Pointer, Pointer]) => Pointer;
    "EnumPropsEx": (...args: [Pointer, Pointer, number]) => number;
    "EnumProps": (...args: [Pointer, Pointer]) => number;
    "SetWindowText": (...args: [Pointer, Pointer]) => number;
    "GetWindowText": (...args: [Pointer, Pointer, number]) => number;
    "GetWindowTextLength": (...args: [Pointer]) => number;
    "MessageBox": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "MessageBoxEx": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "MessageBoxIndirect": (...args: [Pointer]) => number;
    "GetWindowLong": (...args: [Pointer, number]) => number;
    "SetWindowLong": (...args: [Pointer, number, number]) => number;
    "GetClassLong": (...args: [Pointer, number]) => number;
    "SetClassLong": (...args: [Pointer, number, number]) => number;
    "FindWindow": (...args: [Pointer, Pointer]) => Pointer;
    "FindWindowEx": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "GetClassName": (...args: [Pointer, Pointer, number]) => number;
    "SetWindowsHook": (...args: [number, Pointer]) => Pointer;
    "SetWindowsHookEx": (...args: [number, Pointer, Pointer, number]) => Pointer;
    "LoadCursor": (...args: [Pointer, Pointer]) => Pointer;
    "LoadCursorFromFile": (...args: [Pointer]) => Pointer;
    "LoadIcon": (...args: [Pointer, Pointer]) => Pointer;
    "PrivateExtractIcons": (...args: [Pointer, number, number, number, Pointer, Pointer, number, number]) => number;
    "LoadImage": (...args: [Pointer, Pointer, number, number, number, number]) => Pointer;
    "GetIconInfoEx": (...args: [Pointer, Pointer]) => number;
    "IsDialogMessage": (...args: [Pointer, Pointer]) => number;
    "DefFrameProc": (...args: [Pointer, Pointer, number, number, number]) => number;
    "DefMDIChildProc": (...args: [Pointer, number, number, number]) => number;
    "CreateMDIWindow": (...args: [Pointer, Pointer, number, number, number, number, number, Pointer, Pointer, number]) => Pointer;
    "SystemParametersInfo": (...args: [number, number, Pointer, number]) => number;
    "GetWindowModuleFileName": (...args: [Pointer, Pointer, number]) => number;
    "RealGetWindowClass": (...args: [Pointer, Pointer, number]) => number;
    "GetAltTabInfo": (...args: [Pointer, number, Pointer, Pointer, number]) => number;
    "CreateDesktop": (...args: [Pointer, Pointer, Pointer, number, number, Pointer]) => Pointer;
    "CreateDesktopEx": (...args: [Pointer, Pointer, Pointer, number, number, Pointer, number, Pointer]) => Pointer;
    "OpenDesktop": (...args: [Pointer, number, number, number]) => Pointer;
    "EnumDesktops": (...args: [Pointer, Pointer, number]) => number;
    "CreateWindowStation": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "OpenWindowStation": (...args: [Pointer, number, number]) => Pointer;
    "EnumWindowStations": (...args: [Pointer, number]) => number;
    "GetUserObjectInformation": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "SetUserObjectInformation": (...args: [Pointer, number, Pointer, number]) => number;
    "BroadcastSystemMessageEx": (...args: [number, Pointer, number, number, number, Pointer]) => number;
    "BroadcastSystemMessage": (...args: [number, Pointer, number, number, number]) => number;
    "GetRawInputDeviceInfo": (...args: [Pointer, number, Pointer, Pointer]) => number;
}
export interface user32Library { readonly symbols: user32Symbols; close(): void; }
export declare const structs: {
  "RECT": {
    "size": 16,
    "fields": [
      {
        "name": "left",
        "offset": 0,
        "type": "i32"
      },
      {
        "name": "top",
        "offset": 4,
        "type": "i32"
      },
      {
        "name": "right",
        "offset": 8,
        "type": "i32"
      },
      {
        "name": "bottom",
        "offset": 12,
        "type": "i32"
      }
    ]
  },
  "POINT": {
    "size": 8,
    "fields": [
      {
        "name": "x",
        "offset": 0,
        "type": "i32"
      },
      {
        "name": "y",
        "offset": 4,
        "type": "i32"
      }
    ]
  },
  "WNDCLASSEXW": {
    "size": 80,
    "fields": [
      {
        "name": "cbSize",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "style",
        "offset": 4,
        "type": "Windows.Win32.UI.WindowsAndMessaging.WNDCLASS_STYLES"
      },
      {
        "name": "lpfnWndProc",
        "offset": 8,
        "type": "Windows.Win32.UI.WindowsAndMessaging.WNDPROC"
      },
      {
        "name": "cbClsExtra",
        "offset": 16,
        "type": "i32"
      },
      {
        "name": "cbWndExtra",
        "offset": 20,
        "type": "i32"
      },
      {
        "name": "hInstance",
        "offset": 24,
        "type": "Windows.Win32.Foundation.HINSTANCE"
      },
      {
        "name": "hIcon",
        "offset": 32,
        "type": "Windows.Win32.UI.WindowsAndMessaging.HICON"
      },
      {
        "name": "hCursor",
        "offset": 40,
        "type": "Windows.Win32.UI.WindowsAndMessaging.HCURSOR"
      },
      {
        "name": "hbrBackground",
        "offset": 48,
        "type": "Windows.Win32.Graphics.Gdi.HBRUSH"
      },
      {
        "name": "lpszMenuName",
        "offset": 56,
        "type": "Windows.Win32.Foundation.PWSTR"
      },
      {
        "name": "lpszClassName",
        "offset": 64,
        "type": "Windows.Win32.Foundation.PWSTR"
      },
      {
        "name": "hIconSm",
        "offset": 72,
        "type": "Windows.Win32.UI.WindowsAndMessaging.HICON"
      }
    ]
  },
  "MSG": {
    "size": 48,
    "fields": [
      {
        "name": "hwnd",
        "offset": 0,
        "type": "Windows.Win32.Foundation.HWND"
      },
      {
        "name": "message",
        "offset": 8,
        "type": "u32"
      },
      {
        "name": "wParam",
        "offset": 16,
        "type": "Windows.Win32.Foundation.WPARAM"
      },
      {
        "name": "lParam",
        "offset": 24,
        "type": "Windows.Win32.Foundation.LPARAM"
      },
      {
        "name": "time",
        "offset": 32,
        "type": "u32"
      },
      {
        "name": "pt",
        "offset": 40,
        "type": "Windows.Win32.Foundation.POINT"
      }
    ]
  },
  "MONITORINFO": {
    "size": 32,
    "fields": [
      {
        "name": "cbSize",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "rcMonitor",
        "offset": 8,
        "type": "Windows.Win32.Foundation.RECT"
      },
      {
        "name": "rcWork",
        "offset": 16,
        "type": "Windows.Win32.Foundation.RECT"
      },
      {
        "name": "dwFlags",
        "offset": 24,
        "type": "u32"
      }
    ]
  }
};
export declare const enums: {
  "SET_DISPLAY_CONFIG_FLAGS": {
    "SDC_USE_DATABASE_CURRENT": 15,
    "SDC_TOPOLOGY_INTERNAL": 1,
    "SDC_TOPOLOGY_CLONE": 2,
    "SDC_TOPOLOGY_EXTEND": 4,
    "SDC_TOPOLOGY_EXTERNAL": 8,
    "SDC_TOPOLOGY_SUPPLIED": 16,
    "SDC_USE_SUPPLIED_DISPLAY_CONFIG": 32,
    "SDC_VALIDATE": 64,
    "SDC_APPLY": 128,
    "SDC_NO_OPTIMIZATION": 256,
    "SDC_SAVE_TO_DATABASE": 512,
    "SDC_ALLOW_CHANGES": 1024,
    "SDC_PATH_PERSIST_IF_REQUIRED": 2048,
    "SDC_FORCE_MODE_ENUMERATION": 4096,
    "SDC_ALLOW_PATH_ORDER_CHANGES": 8192,
    "SDC_VIRTUAL_MODE_AWARE": 32768,
    "SDC_VIRTUAL_REFRESH_RATE_AWARE": 131072
  },
  "QUERY_DISPLAY_CONFIG_FLAGS": {
    "QDC_ALL_PATHS": 1,
    "QDC_ONLY_ACTIVE_PATHS": 2,
    "QDC_DATABASE_CURRENT": 4,
    "QDC_VIRTUAL_MODE_AWARE": 16,
    "QDC_INCLUDE_HMD": 32,
    "QDC_VIRTUAL_REFRESH_RATE_AWARE": 64
  },
  "WAIT_EVENT": {
    "WAIT_OBJECT_0": 0,
    "WAIT_ABANDONED": 128,
    "WAIT_ABANDONED_0": 128,
    "WAIT_IO_COMPLETION": 192,
    "WAIT_TIMEOUT": 258,
    "WAIT_FAILED": 4294967295
  },
  "DRAWEDGE_FLAGS": {
    "BDR_RAISEDOUTER": 1,
    "BDR_SUNKENOUTER": 2,
    "BDR_RAISEDINNER": 4,
    "BDR_SUNKENINNER": 8,
    "BDR_OUTER": 3,
    "BDR_INNER": 12,
    "BDR_RAISED": 5,
    "BDR_SUNKEN": 10,
    "EDGE_RAISED": 5,
    "EDGE_SUNKEN": 10,
    "EDGE_ETCHED": 6,
    "EDGE_BUMP": 9
  },
  "CDS_TYPE": {
    "CDS_FULLSCREEN": 4,
    "CDS_GLOBAL": 8,
    "CDS_NORESET": 268435456,
    "CDS_RESET": 1073741824,
    "CDS_SET_PRIMARY": 16,
    "CDS_TEST": 2,
    "CDS_UPDATEREGISTRY": 1,
    "CDS_VIDEOPARAMETERS": 32,
    "CDS_ENABLE_UNSAFE_MODES": 256,
    "CDS_DISABLE_UNSAFE_MODES": 512,
    "CDS_RESET_EX": 536870912
  },
  "DISP_CHANGE": {
    "DISP_CHANGE_SUCCESSFUL": 0,
    "DISP_CHANGE_RESTART": 1,
    "DISP_CHANGE_FAILED": -1,
    "DISP_CHANGE_BADMODE": -2,
    "DISP_CHANGE_NOTUPDATED": -3,
    "DISP_CHANGE_BADFLAGS": -4,
    "DISP_CHANGE_BADPARAM": -5,
    "DISP_CHANGE_BADDUALVIEW": -6
  },
  "DRAWSTATE_FLAGS": {
    "DST_COMPLEX": 0,
    "DST_TEXT": 1,
    "DST_PREFIXTEXT": 2,
    "DST_ICON": 3,
    "DST_BITMAP": 4,
    "DSS_NORMAL": 0,
    "DSS_UNION": 16,
    "DSS_DISABLED": 32,
    "DSS_MONO": 128,
    "DSS_HIDEPREFIX": 512,
    "DSS_PREFIXONLY": 1024,
    "DSS_RIGHT": 32768
  },
  "REDRAW_WINDOW_FLAGS": {
    "RDW_INVALIDATE": 1,
    "RDW_INTERNALPAINT": 2,
    "RDW_ERASE": 4,
    "RDW_VALIDATE": 8,
    "RDW_NOINTERNALPAINT": 16,
    "RDW_NOERASE": 32,
    "RDW_NOCHILDREN": 64,
    "RDW_ALLCHILDREN": 128,
    "RDW_UPDATENOW": 256,
    "RDW_ERASENOW": 512,
    "RDW_FRAME": 1024,
    "RDW_NOFRAME": 2048
  },
  "ENUM_DISPLAY_SETTINGS_MODE": {
    "ENUM_CURRENT_SETTINGS": 4294967295,
    "ENUM_REGISTRY_SETTINGS": 4294967294
  },
  "DRAW_TEXT_FORMAT": {
    "DT_BOTTOM": 8,
    "DT_CALCRECT": 1024,
    "DT_CENTER": 1,
    "DT_EDITCONTROL": 8192,
    "DT_END_ELLIPSIS": 32768,
    "DT_EXPANDTABS": 64,
    "DT_EXTERNALLEADING": 512,
    "DT_HIDEPREFIX": 1048576,
    "DT_INTERNAL": 4096,
    "DT_LEFT": 0,
    "DT_MODIFYSTRING": 65536,
    "DT_NOCLIP": 256,
    "DT_NOFULLWIDTHCHARBREAK": 524288,
    "DT_NOPREFIX": 2048,
    "DT_PATH_ELLIPSIS": 16384,
    "DT_PREFIXONLY": 2097152,
    "DT_RIGHT": 2,
    "DT_RTLREADING": 131072,
    "DT_SINGLELINE": 32,
    "DT_TABSTOP": 128,
    "DT_TOP": 0,
    "DT_VCENTER": 4,
    "DT_WORDBREAK": 16,
    "DT_WORD_ELLIPSIS": 262144
  },
  "GET_DCX_FLAGS": {
    "DCX_WINDOW": 1,
    "DCX_CACHE": 2,
    "DCX_PARENTCLIP": 32,
    "DCX_CLIPSIBLINGS": 16,
    "DCX_CLIPCHILDREN": 8,
    "DCX_NORESETATTRS": 4,
    "DCX_LOCKWINDOWUPDATE": 1024,
    "DCX_EXCLUDERGN": 64,
    "DCX_INTERSECTRGN": 128,
    "DCX_INTERSECTUPDATE": 512,
    "DCX_VALIDATE": 2097152
  },
  "MONITOR_FROM_FLAGS": {
    "MONITOR_DEFAULTTONEAREST": 2,
    "MONITOR_DEFAULTTONULL": 0,
    "MONITOR_DEFAULTTOPRIMARY": 1
  },
  "DRAW_EDGE_FLAGS": {
    "BF_ADJUST": 8192,
    "BF_BOTTOM": 8,
    "BF_BOTTOMLEFT": 9,
    "BF_BOTTOMRIGHT": 12,
    "BF_DIAGONAL": 16,
    "BF_DIAGONAL_ENDBOTTOMLEFT": 25,
    "BF_DIAGONAL_ENDBOTTOMRIGHT": 28,
    "BF_DIAGONAL_ENDTOPLEFT": 19,
    "BF_DIAGONAL_ENDTOPRIGHT": 22,
    "BF_FLAT": 16384,
    "BF_LEFT": 1,
    "BF_MIDDLE": 2048,
    "BF_MONO": 32768,
    "BF_RECT": 15,
    "BF_RIGHT": 4,
    "BF_SOFT": 4096,
    "BF_TOP": 2,
    "BF_TOPLEFT": 3,
    "BF_TOPRIGHT": 6
  },
  "SYS_COLOR_INDEX": {
    "COLOR_SCROLLBAR": 0,
    "COLOR_BACKGROUND": 1,
    "COLOR_ACTIVECAPTION": 2,
    "COLOR_INACTIVECAPTION": 3,
    "COLOR_MENU": 4,
    "COLOR_WINDOW": 5,
    "COLOR_WINDOWFRAME": 6,
    "COLOR_MENUTEXT": 7,
    "COLOR_WINDOWTEXT": 8,
    "COLOR_CAPTIONTEXT": 9,
    "COLOR_ACTIVEBORDER": 10,
    "COLOR_INACTIVEBORDER": 11,
    "COLOR_APPWORKSPACE": 12,
    "COLOR_HIGHLIGHT": 13,
    "COLOR_HIGHLIGHTTEXT": 14,
    "COLOR_BTNFACE": 15,
    "COLOR_BTNSHADOW": 16,
    "COLOR_GRAYTEXT": 17,
    "COLOR_BTNTEXT": 18,
    "COLOR_INACTIVECAPTIONTEXT": 19,
    "COLOR_BTNHIGHLIGHT": 20,
    "COLOR_3DDKSHADOW": 21,
    "COLOR_3DLIGHT": 22,
    "COLOR_INFOTEXT": 23,
    "COLOR_INFOBK": 24,
    "COLOR_HOTLIGHT": 26,
    "COLOR_GRADIENTACTIVECAPTION": 27,
    "COLOR_GRADIENTINACTIVECAPTION": 28,
    "COLOR_MENUHILIGHT": 29,
    "COLOR_MENUBAR": 30,
    "COLOR_DESKTOP": 1,
    "COLOR_3DFACE": 15,
    "COLOR_3DSHADOW": 16,
    "COLOR_3DHIGHLIGHT": 20,
    "COLOR_3DHILIGHT": 20,
    "COLOR_BTNHILIGHT": 20
  },
  "DRAW_CAPTION_FLAGS": {
    "DC_ACTIVE": 1,
    "DC_BUTTONS": 4096,
    "DC_GRADIENT": 32,
    "DC_ICON": 4,
    "DC_INBUTTON": 16,
    "DC_SMALLCAP": 2,
    "DC_TEXT": 8
  },
  "GDI_REGION_TYPE": {
    "RGN_ERROR": 0,
    "NULLREGION": 1,
    "SIMPLEREGION": 2,
    "COMPLEXREGION": 3
  },
  "ENUM_DISPLAY_SETTINGS_FLAGS": {
    "EDS_RAWMODE": 2,
    "EDS_ROTATEDMODE": 4
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
  "PRINT_WINDOW_FLAGS": {
    "PW_CLIENTONLY": 1
  },
  "DDE_ENABLE_CALLBACK_CMD": {
    "EC_ENABLEALL": 0,
    "EC_ENABLEONE": 128,
    "EC_DISABLE": 8,
    "EC_QUERYWAITING": 2
  },
  "DDE_INITIALIZE_COMMAND": {
    "APPCLASS_MONITOR": 1,
    "APPCLASS_STANDARD": 0,
    "APPCMD_CLIENTONLY": 16,
    "APPCMD_FILTERINITS": 32,
    "CBF_FAIL_ALLSVRXACTIONS": 258048,
    "CBF_FAIL_ADVISES": 16384,
    "CBF_FAIL_CONNECTIONS": 8192,
    "CBF_FAIL_EXECUTES": 32768,
    "CBF_FAIL_POKES": 65536,
    "CBF_FAIL_REQUESTS": 131072,
    "CBF_FAIL_SELFCONNECTIONS": 4096,
    "CBF_SKIP_ALLNOTIFICATIONS": 3932160,
    "CBF_SKIP_CONNECT_CONFIRMS": 262144,
    "CBF_SKIP_DISCONNECTS": 2097152,
    "CBF_SKIP_REGISTRATIONS": 524288,
    "CBF_SKIP_UNREGISTRATIONS": 1048576,
    "MF_CALLBACKS": 134217728,
    "MF_CONV": 1073741824,
    "MF_ERRORS": 268435456,
    "MF_HSZ_INFO": 16777216,
    "MF_LINKS": 536870912,
    "MF_POSTMSGS": 67108864,
    "MF_SENDMSGS": 33554432
  },
  "DDE_NAME_SERVICE_CMD": {
    "DNS_REGISTER": 1,
    "DNS_UNREGISTER": 2,
    "DNS_FILTERON": 4,
    "DNS_FILTEROFF": 8
  },
  "DDE_CLIENT_TRANSACTION_TYPE": {
    "XTYP_ADVSTART": 4144,
    "XTYP_ADVSTOP": 32832,
    "XTYP_EXECUTE": 16464,
    "XTYP_POKE": 16528,
    "XTYP_REQUEST": 8368,
    "XTYP_ADVDATA": 16400,
    "XTYP_ADVREQ": 8226,
    "XTYP_CONNECT": 4194,
    "XTYP_CONNECT_CONFIRM": 32882,
    "XTYP_DISCONNECT": 32962,
    "XTYP_MONITOR": 33010,
    "XTYP_REGISTER": 32930,
    "XTYP_UNREGISTER": 32978,
    "XTYP_WILDCONNECT": 8418,
    "XTYP_XACT_COMPLETE": 32896
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
  "EXIT_WINDOWS_FLAGS": {
    "EWX_LOGOFF": 0,
    "EWX_SHUTDOWN": 1,
    "EWX_REBOOT": 2,
    "EWX_FORCE": 4,
    "EWX_POWEROFF": 8,
    "EWX_FORCEIFHUNG": 16,
    "EWX_QUICKRESOLVE": 32,
    "EWX_RESTARTAPPS": 64,
    "EWX_HYBRID_SHUTDOWN": 4194304,
    "EWX_BOOTOPTIONS": 16777216,
    "EWX_ARSO": 67108864,
    "EWX_CHECK_SAFE_FOR_SERVER": 134217728,
    "EWX_SYSTEM_INITIATED": 268435456
  },
  "BROADCAST_SYSTEM_MESSAGE_FLAGS": {
    "BSF_ALLOWSFW": 128,
    "BSF_FLUSHDISK": 4,
    "BSF_FORCEIFHUNG": 32,
    "BSF_IGNORECURRENTTASK": 2,
    "BSF_NOHANG": 8,
    "BSF_NOTIMEOUTIFNOTHUNG": 64,
    "BSF_POSTMESSAGE": 16,
    "BSF_QUERY": 1,
    "BSF_SENDNOTIFYMESSAGE": 256,
    "BSF_LUID": 1024,
    "BSF_RETURNHDESK": 512
  },
  "BROADCAST_SYSTEM_MESSAGE_INFO": {
    "BSM_ALLCOMPONENTS": 0,
    "BSM_ALLDESKTOPS": 16,
    "BSM_APPLICATIONS": 8
  },
  "USER_OBJECT_INFORMATION_INDEX": {
    "UOI_FLAGS": 1,
    "UOI_HEAPSIZE": 5,
    "UOI_IO": 6,
    "UOI_NAME": 2,
    "UOI_TYPE": 3,
    "UOI_USER_SID": 4
  },
  "DESKTOP_CONTROL_FLAGS": {
    "DF_ALLOWOTHERACCOUNTHOOK": 1
  },
  "DESKTOP_ACCESS_FLAGS": {
    "DESKTOP_DELETE": 65536,
    "DESKTOP_READ_CONTROL": 131072,
    "DESKTOP_WRITE_DAC": 262144,
    "DESKTOP_WRITE_OWNER": 524288,
    "DESKTOP_SYNCHRONIZE": 1048576,
    "DESKTOP_READOBJECTS": 1,
    "DESKTOP_CREATEWINDOW": 2,
    "DESKTOP_CREATEMENU": 4,
    "DESKTOP_HOOKCONTROL": 8,
    "DESKTOP_JOURNALRECORD": 16,
    "DESKTOP_JOURNALPLAYBACK": 32,
    "DESKTOP_ENUMERATE": 64,
    "DESKTOP_WRITEOBJECTS": 128,
    "DESKTOP_SWITCHDESKTOP": 256
  },
  "GET_GUI_RESOURCES_FLAGS": {
    "GR_GLOBAL": 4294967294,
    "GR_GDIOBJECTS": 0,
    "GR_GDIOBJECTS_PEAK": 2,
    "GR_USEROBJECTS": 1,
    "GR_USEROBJECTS_PEAK": 4
  },
  "DLG_DIR_LIST_FILE_TYPE": {
    "DDL_ARCHIVE": 32,
    "DDL_DIRECTORY": 16,
    "DDL_DRIVES": 16384,
    "DDL_EXCLUSIVE": 32768,
    "DDL_HIDDEN": 2,
    "DDL_READONLY": 1,
    "DDL_READWRITE": 0,
    "DDL_SYSTEM": 4,
    "DDL_POSTMSGS": 8192
  },
  "ENABLE_SCROLL_BAR_ARROWS": {
    "ESB_DISABLE_BOTH": 3,
    "ESB_DISABLE_DOWN": 2,
    "ESB_DISABLE_LEFT": 1,
    "ESB_DISABLE_LTUP": 1,
    "ESB_DISABLE_RIGHT": 2,
    "ESB_DISABLE_RTDN": 2,
    "ESB_DISABLE_UP": 1,
    "ESB_ENABLE_BOTH": 0
  },
  "DLG_BUTTON_CHECK_STATE": {
    "BST_CHECKED": 1,
    "BST_INDETERMINATE": 2,
    "BST_UNCHECKED": 0
  },
  "RAW_INPUT_DATA_COMMAND_FLAGS": {
    "RID_HEADER": 268435461,
    "RID_INPUT": 268435459
  },
  "RAW_INPUT_DEVICE_INFO_COMMAND": {
    "RIDI_PREPARSEDDATA": 536870917,
    "RIDI_DEVICENAME": 536870919,
    "RIDI_DEVICEINFO": 536870923
  },
  "HOT_KEY_MODIFIERS": {
    "MOD_ALT": 1,
    "MOD_CONTROL": 2,
    "MOD_NOREPEAT": 16384,
    "MOD_SHIFT": 4,
    "MOD_WIN": 8
  },
  "ACTIVATE_KEYBOARD_LAYOUT_FLAGS": {
    "KLF_REORDER": 8,
    "KLF_RESET": 1073741824,
    "KLF_SETFORPROCESS": 256,
    "KLF_SHIFTLOCK": 65536,
    "KLF_ACTIVATE": 1,
    "KLF_NOTELLSHELL": 128,
    "KLF_REPLACELANG": 16,
    "KLF_SUBSTITUTE_OK": 2
  },
  "GET_MOUSE_MOVE_POINTS_EX_RESOLUTION": {
    "GMMP_USE_DISPLAY_POINTS": 1,
    "GMMP_USE_HIGH_RESOLUTION_POINTS": 2
  },
  "KEYBD_EVENT_FLAGS": {
    "KEYEVENTF_EXTENDEDKEY": 1,
    "KEYEVENTF_KEYUP": 2,
    "KEYEVENTF_SCANCODE": 8,
    "KEYEVENTF_UNICODE": 4
  },
  "MOUSE_EVENT_FLAGS": {
    "MOUSEEVENTF_ABSOLUTE": 32768,
    "MOUSEEVENTF_LEFTDOWN": 2,
    "MOUSEEVENTF_LEFTUP": 4,
    "MOUSEEVENTF_MIDDLEDOWN": 32,
    "MOUSEEVENTF_MIDDLEUP": 64,
    "MOUSEEVENTF_MOVE": 1,
    "MOUSEEVENTF_RIGHTDOWN": 8,
    "MOUSEEVENTF_RIGHTUP": 16,
    "MOUSEEVENTF_WHEEL": 2048,
    "MOUSEEVENTF_XDOWN": 128,
    "MOUSEEVENTF_XUP": 256,
    "MOUSEEVENTF_HWHEEL": 4096,
    "MOUSEEVENTF_MOVE_NOCOALESCE": 8192,
    "MOUSEEVENTF_VIRTUALDESK": 16384
  },
  "MAP_VIRTUAL_KEY_TYPE": {
    "MAPVK_VK_TO_VSC": 0,
    "MAPVK_VSC_TO_VK": 1,
    "MAPVK_VK_TO_CHAR": 2,
    "MAPVK_VSC_TO_VK_EX": 3,
    "MAPVK_VK_TO_VSC_EX": 4
  },
  "TOUCH_FEEDBACK_MODE": {
    "TOUCH_FEEDBACK_DEFAULT": 1,
    "TOUCH_FEEDBACK_INDIRECT": 2,
    "TOUCH_FEEDBACK_NONE": 3
  },
  "REGISTER_TOUCH_WINDOW_FLAGS": {
    "TWF_FINETOUCH": 1,
    "TWF_WANTPALM": 2
  },
  "WNDCLASS_STYLES": {
    "CS_VREDRAW": 1,
    "CS_HREDRAW": 2,
    "CS_DBLCLKS": 8,
    "CS_OWNDC": 32,
    "CS_CLASSDC": 64,
    "CS_PARENTDC": 128,
    "CS_NOCLOSE": 512,
    "CS_SAVEBITS": 2048,
    "CS_BYTEALIGNCLIENT": 4096,
    "CS_BYTEALIGNWINDOW": 8192,
    "CS_GLOBALCLASS": 16384,
    "CS_IME": 65536,
    "CS_DROPSHADOW": 131072
  },
  "CWP_FLAGS": {
    "CWP_ALL": 0,
    "CWP_SKIPINVISIBLE": 1,
    "CWP_SKIPDISABLED": 2,
    "CWP_SKIPTRANSPARENT": 4
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
  "MENU_ITEM_FLAGS": {
    "MF_BYCOMMAND": 0,
    "MF_BYPOSITION": 1024,
    "MF_BITMAP": 4,
    "MF_CHECKED": 8,
    "MF_DISABLED": 2,
    "MF_ENABLED": 0,
    "MF_GRAYED": 1,
    "MF_MENUBARBREAK": 32,
    "MF_MENUBREAK": 64,
    "MF_OWNERDRAW": 256,
    "MF_POPUP": 16,
    "MF_SEPARATOR": 2048,
    "MF_STRING": 0,
    "MF_UNCHECKED": 0,
    "MF_INSERT": 0,
    "MF_CHANGE": 128,
    "MF_APPEND": 256,
    "MF_DELETE": 512,
    "MF_REMOVE": 4096,
    "MF_USECHECKBITMAPS": 512,
    "MF_UNHILITE": 0,
    "MF_HILITE": 128,
    "MF_DEFAULT": 4096,
    "MF_SYSMENU": 8192,
    "MF_HELP": 16384,
    "MF_RIGHTJUSTIFY": 16384,
    "MF_MOUSESELECT": 32768,
    "MF_END": 128
  },
  "SHOW_WINDOW_CMD": {
    "SW_HIDE": 0,
    "SW_SHOWNORMAL": 1,
    "SW_NORMAL": 1,
    "SW_SHOWMINIMIZED": 2,
    "SW_SHOWMAXIMIZED": 3,
    "SW_MAXIMIZE": 3,
    "SW_SHOWNOACTIVATE": 4,
    "SW_SHOW": 5,
    "SW_MINIMIZE": 6,
    "SW_SHOWMINNOACTIVE": 7,
    "SW_SHOWNA": 8,
    "SW_RESTORE": 9,
    "SW_SHOWDEFAULT": 10,
    "SW_FORCEMINIMIZE": 11,
    "SW_MAX": 11
  },
  "SCROLL_WINDOW_FLAGS": {
    "SW_SCROLLCHILDREN": 1,
    "SW_INVALIDATE": 2,
    "SW_ERASE": 4,
    "SW_SMOOTHSCROLL": 16
  },
  "SYSTEM_PARAMETERS_INFO_ACTION": {
    "SPI_GETBEEP": 1,
    "SPI_SETBEEP": 2,
    "SPI_GETMOUSE": 3,
    "SPI_SETMOUSE": 4,
    "SPI_GETBORDER": 5,
    "SPI_SETBORDER": 6,
    "SPI_GETKEYBOARDSPEED": 10,
    "SPI_SETKEYBOARDSPEED": 11,
    "SPI_LANGDRIVER": 12,
    "SPI_ICONHORIZONTALSPACING": 13,
    "SPI_GETSCREENSAVETIMEOUT": 14,
    "SPI_SETSCREENSAVETIMEOUT": 15,
    "SPI_GETSCREENSAVEACTIVE": 16,
    "SPI_SETSCREENSAVEACTIVE": 17,
    "SPI_GETGRIDGRANULARITY": 18,
    "SPI_SETGRIDGRANULARITY": 19,
    "SPI_SETDESKWALLPAPER": 20,
    "SPI_SETDESKPATTERN": 21,
    "SPI_GETKEYBOARDDELAY": 22,
    "SPI_SETKEYBOARDDELAY": 23,
    "SPI_ICONVERTICALSPACING": 24,
    "SPI_GETICONTITLEWRAP": 25,
    "SPI_SETICONTITLEWRAP": 26,
    "SPI_GETMENUDROPALIGNMENT": 27,
    "SPI_SETMENUDROPALIGNMENT": 28,
    "SPI_SETDOUBLECLKWIDTH": 29,
    "SPI_SETDOUBLECLKHEIGHT": 30,
    "SPI_GETICONTITLELOGFONT": 31,
    "SPI_SETDOUBLECLICKTIME": 32,
    "SPI_SETMOUSEBUTTONSWAP": 33,
    "SPI_SETICONTITLELOGFONT": 34,
    "SPI_GETFASTTASKSWITCH": 35,
    "SPI_SETFASTTASKSWITCH": 36,
    "SPI_SETDRAGFULLWINDOWS": 37,
    "SPI_GETDRAGFULLWINDOWS": 38,
    "SPI_GETNONCLIENTMETRICS": 41,
    "SPI_SETNONCLIENTMETRICS": 42,
    "SPI_GETMINIMIZEDMETRICS": 43,
    "SPI_SETMINIMIZEDMETRICS": 44,
    "SPI_GETICONMETRICS": 45,
    "SPI_SETICONMETRICS": 46,
    "SPI_SETWORKAREA": 47,
    "SPI_GETWORKAREA": 48,
    "SPI_SETPENWINDOWS": 49,
    "SPI_GETHIGHCONTRAST": 66,
    "SPI_SETHIGHCONTRAST": 67,
    "SPI_GETKEYBOARDPREF": 68,
    "SPI_SETKEYBOARDPREF": 69,
    "SPI_GETSCREENREADER": 70,
    "SPI_SETSCREENREADER": 71,
    "SPI_GETANIMATION": 72,
    "SPI_SETANIMATION": 73,
    "SPI_GETFONTSMOOTHING": 74,
    "SPI_SETFONTSMOOTHING": 75,
    "SPI_SETDRAGWIDTH": 76,
    "SPI_SETDRAGHEIGHT": 77,
    "SPI_SETHANDHELD": 78,
    "SPI_GETLOWPOWERTIMEOUT": 79,
    "SPI_GETPOWEROFFTIMEOUT": 80,
    "SPI_SETLOWPOWERTIMEOUT": 81,
    "SPI_SETPOWEROFFTIMEOUT": 82,
    "SPI_GETLOWPOWERACTIVE": 83,
    "SPI_GETPOWEROFFACTIVE": 84,
    "SPI_SETLOWPOWERACTIVE": 85,
    "SPI_SETPOWEROFFACTIVE": 86,
    "SPI_SETCURSORS": 87,
    "SPI_SETICONS": 88,
    "SPI_GETDEFAULTINPUTLANG": 89,
    "SPI_SETDEFAULTINPUTLANG": 90,
    "SPI_SETLANGTOGGLE": 91,
    "SPI_GETWINDOWSEXTENSION": 92,
    "SPI_SETMOUSETRAILS": 93,
    "SPI_GETMOUSETRAILS": 94,
    "SPI_SETSCREENSAVERRUNNING": 97,
    "SPI_SCREENSAVERRUNNING": 97,
    "SPI_GETFILTERKEYS": 50,
    "SPI_SETFILTERKEYS": 51,
    "SPI_GETTOGGLEKEYS": 52,
    "SPI_SETTOGGLEKEYS": 53,
    "SPI_GETMOUSEKEYS": 54,
    "SPI_SETMOUSEKEYS": 55,
    "SPI_GETSHOWSOUNDS": 56,
    "SPI_SETSHOWSOUNDS": 57,
    "SPI_GETSTICKYKEYS": 58,
    "SPI_SETSTICKYKEYS": 59,
    "SPI_GETACCESSTIMEOUT": 60,
    "SPI_SETACCESSTIMEOUT": 61,
    "SPI_GETSERIALKEYS": 62,
    "SPI_SETSERIALKEYS": 63,
    "SPI_GETSOUNDSENTRY": 64,
    "SPI_SETSOUNDSENTRY": 65,
    "SPI_GETSNAPTODEFBUTTON": 95,
    "SPI_SETSNAPTODEFBUTTON": 96,
    "SPI_GETMOUSEHOVERWIDTH": 98,
    "SPI_SETMOUSEHOVERWIDTH": 99,
    "SPI_GETMOUSEHOVERHEIGHT": 100,
    "SPI_SETMOUSEHOVERHEIGHT": 101,
    "SPI_GETMOUSEHOVERTIME": 102,
    "SPI_SETMOUSEHOVERTIME": 103,
    "SPI_GETWHEELSCROLLLINES": 104,
    "SPI_SETWHEELSCROLLLINES": 105,
    "SPI_GETMENUSHOWDELAY": 106,
    "SPI_SETMENUSHOWDELAY": 107,
    "SPI_GETWHEELSCROLLCHARS": 108,
    "SPI_SETWHEELSCROLLCHARS": 109,
    "SPI_GETSHOWIMEUI": 110,
    "SPI_SETSHOWIMEUI": 111,
    "SPI_GETMOUSESPEED": 112,
    "SPI_SETMOUSESPEED": 113,
    "SPI_GETSCREENSAVERRUNNING": 114,
    "SPI_GETDESKWALLPAPER": 115,
    "SPI_GETAUDIODESCRIPTION": 116,
    "SPI_SETAUDIODESCRIPTION": 117,
    "SPI_GETSCREENSAVESECURE": 118,
    "SPI_SETSCREENSAVESECURE": 119,
    "SPI_GETHUNGAPPTIMEOUT": 120,
    "SPI_SETHUNGAPPTIMEOUT": 121,
    "SPI_GETWAITTOKILLTIMEOUT": 122,
    "SPI_SETWAITTOKILLTIMEOUT": 123,
    "SPI_GETWAITTOKILLSERVICETIMEOUT": 124,
    "SPI_SETWAITTOKILLSERVICETIMEOUT": 125,
    "SPI_GETMOUSEDOCKTHRESHOLD": 126,
    "SPI_SETMOUSEDOCKTHRESHOLD": 127,
    "SPI_GETPENDOCKTHRESHOLD": 128,
    "SPI_SETPENDOCKTHRESHOLD": 129,
    "SPI_GETWINARRANGING": 130,
    "SPI_SETWINARRANGING": 131,
    "SPI_GETMOUSEDRAGOUTTHRESHOLD": 132,
    "SPI_SETMOUSEDRAGOUTTHRESHOLD": 133,
    "SPI_GETPENDRAGOUTTHRESHOLD": 134,
    "SPI_SETPENDRAGOUTTHRESHOLD": 135,
    "SPI_GETMOUSESIDEMOVETHRESHOLD": 136,
    "SPI_SETMOUSESIDEMOVETHRESHOLD": 137,
    "SPI_GETPENSIDEMOVETHRESHOLD": 138,
    "SPI_SETPENSIDEMOVETHRESHOLD": 139,
    "SPI_GETDRAGFROMMAXIMIZE": 140,
    "SPI_SETDRAGFROMMAXIMIZE": 141,
    "SPI_GETSNAPSIZING": 142,
    "SPI_SETSNAPSIZING": 143,
    "SPI_GETDOCKMOVING": 144,
    "SPI_SETDOCKMOVING": 145,
    "SPI_GETTOUCHPREDICTIONPARAMETERS": 156,
    "SPI_SETTOUCHPREDICTIONPARAMETERS": 157,
    "SPI_GETLOGICALDPIOVERRIDE": 158,
    "SPI_SETLOGICALDPIOVERRIDE": 159,
    "SPI_GETMENURECT": 162,
    "SPI_SETMENURECT": 163,
    "SPI_GETTOUCHPADPARAMETERS": 174,
    "SPI_SETTOUCHPADPARAMETERS": 175,
    "SPI_GETACTIVEWINDOWTRACKING": 4096,
    "SPI_SETACTIVEWINDOWTRACKING": 4097,
    "SPI_GETMENUANIMATION": 4098,
    "SPI_SETMENUANIMATION": 4099,
    "SPI_GETCOMBOBOXANIMATION": 4100,
    "SPI_SETCOMBOBOXANIMATION": 4101,
    "SPI_GETLISTBOXSMOOTHSCROLLING": 4102,
    "SPI_SETLISTBOXSMOOTHSCROLLING": 4103,
    "SPI_GETGRADIENTCAPTIONS": 4104,
    "SPI_SETGRADIENTCAPTIONS": 4105,
    "SPI_GETKEYBOARDCUES": 4106,
    "SPI_SETKEYBOARDCUES": 4107,
    "SPI_GETMENUUNDERLINES": 4106,
    "SPI_SETMENUUNDERLINES": 4107,
    "SPI_GETACTIVEWNDTRKZORDER": 4108,
    "SPI_SETACTIVEWNDTRKZORDER": 4109,
    "SPI_GETHOTTRACKING": 4110,
    "SPI_SETHOTTRACKING": 4111,
    "SPI_GETMENUFADE": 4114,
    "SPI_SETMENUFADE": 4115,
    "SPI_GETSELECTIONFADE": 4116,
    "SPI_SETSELECTIONFADE": 4117,
    "SPI_GETTOOLTIPANIMATION": 4118,
    "SPI_SETTOOLTIPANIMATION": 4119,
    "SPI_GETTOOLTIPFADE": 4120,
    "SPI_SETTOOLTIPFADE": 4121,
    "SPI_GETCURSORSHADOW": 4122,
    "SPI_SETCURSORSHADOW": 4123,
    "SPI_GETMOUSESONAR": 4124,
    "SPI_SETMOUSESONAR": 4125,
    "SPI_GETMOUSECLICKLOCK": 4126,
    "SPI_SETMOUSECLICKLOCK": 4127,
    "SPI_GETMOUSEVANISH": 4128,
    "SPI_SETMOUSEVANISH": 4129,
    "SPI_GETFLATMENU": 4130,
    "SPI_SETFLATMENU": 4131,
    "SPI_GETDROPSHADOW": 4132,
    "SPI_SETDROPSHADOW": 4133,
    "SPI_GETBLOCKSENDINPUTRESETS": 4134,
    "SPI_SETBLOCKSENDINPUTRESETS": 4135,
    "SPI_GETUIEFFECTS": 4158,
    "SPI_SETUIEFFECTS": 4159,
    "SPI_GETDISABLEOVERLAPPEDCONTENT": 4160,
    "SPI_SETDISABLEOVERLAPPEDCONTENT": 4161,
    "SPI_GETCLIENTAREAANIMATION": 4162,
    "SPI_SETCLIENTAREAANIMATION": 4163,
    "SPI_GETCLEARTYPE": 4168,
    "SPI_SETCLEARTYPE": 4169,
    "SPI_GETSPEECHRECOGNITION": 4170,
    "SPI_SETSPEECHRECOGNITION": 4171,
    "SPI_GETCARETBROWSING": 4172,
    "SPI_SETCARETBROWSING": 4173,
    "SPI_GETTHREADLOCALINPUTSETTINGS": 4174,
    "SPI_SETTHREADLOCALINPUTSETTINGS": 4175,
    "SPI_GETSYSTEMLANGUAGEBAR": 4176,
    "SPI_SETSYSTEMLANGUAGEBAR": 4177,
    "SPI_GETFOREGROUNDLOCKTIMEOUT": 8192,
    "SPI_SETFOREGROUNDLOCKTIMEOUT": 8193,
    "SPI_GETACTIVEWNDTRKTIMEOUT": 8194,
    "SPI_SETACTIVEWNDTRKTIMEOUT": 8195,
    "SPI_GETFOREGROUNDFLASHCOUNT": 8196,
    "SPI_SETFOREGROUNDFLASHCOUNT": 8197,
    "SPI_GETCARETWIDTH": 8198,
    "SPI_SETCARETWIDTH": 8199,
    "SPI_GETMOUSECLICKLOCKTIME": 8200,
    "SPI_SETMOUSECLICKLOCKTIME": 8201,
    "SPI_GETFONTSMOOTHINGTYPE": 8202,
    "SPI_SETFONTSMOOTHINGTYPE": 8203,
    "SPI_GETFONTSMOOTHINGCONTRAST": 8204,
    "SPI_SETFONTSMOOTHINGCONTRAST": 8205,
    "SPI_GETFOCUSBORDERWIDTH": 8206,
    "SPI_SETFOCUSBORDERWIDTH": 8207,
    "SPI_GETFOCUSBORDERHEIGHT": 8208,
    "SPI_SETFOCUSBORDERHEIGHT": 8209,
    "SPI_GETFONTSMOOTHINGORIENTATION": 8210,
    "SPI_SETFONTSMOOTHINGORIENTATION": 8211,
    "SPI_GETMINIMUMHITRADIUS": 8212,
    "SPI_SETMINIMUMHITRADIUS": 8213,
    "SPI_GETMESSAGEDURATION": 8214,
    "SPI_SETMESSAGEDURATION": 8215,
    "SPI_GETCONTACTVISUALIZATION": 8216,
    "SPI_SETCONTACTVISUALIZATION": 8217,
    "SPI_GETGESTUREVISUALIZATION": 8218,
    "SPI_SETGESTUREVISUALIZATION": 8219,
    "SPI_GETMOUSEWHEELROUTING": 8220,
    "SPI_SETMOUSEWHEELROUTING": 8221,
    "SPI_GETPENVISUALIZATION": 8222,
    "SPI_SETPENVISUALIZATION": 8223,
    "SPI_GETPENARBITRATIONTYPE": 8224,
    "SPI_SETPENARBITRATIONTYPE": 8225,
    "SPI_GETCARETTIMEOUT": 8226,
    "SPI_SETCARETTIMEOUT": 8227,
    "SPI_GETHANDEDNESS": 8228,
    "SPI_SETHANDEDNESS": 8229
  },
  "TRACK_POPUP_MENU_FLAGS": {
    "TPM_LEFTBUTTON": 0,
    "TPM_RIGHTBUTTON": 2,
    "TPM_LEFTALIGN": 0,
    "TPM_CENTERALIGN": 4,
    "TPM_RIGHTALIGN": 8,
    "TPM_TOPALIGN": 0,
    "TPM_VCENTERALIGN": 16,
    "TPM_BOTTOMALIGN": 32,
    "TPM_HORIZONTAL": 0,
    "TPM_VERTICAL": 64,
    "TPM_NONOTIFY": 128,
    "TPM_RETURNCMD": 256,
    "TPM_RECURSE": 1,
    "TPM_HORPOSANIMATION": 1024,
    "TPM_HORNEGANIMATION": 2048,
    "TPM_VERPOSANIMATION": 4096,
    "TPM_VERNEGANIMATION": 8192,
    "TPM_NOANIMATION": 16384,
    "TPM_LAYOUTRTL": 32768,
    "TPM_WORKAREA": 65536
  },
  "WINDOW_EX_STYLE": {
    "WS_EX_DLGMODALFRAME": 1,
    "WS_EX_NOPARENTNOTIFY": 4,
    "WS_EX_TOPMOST": 8,
    "WS_EX_ACCEPTFILES": 16,
    "WS_EX_TRANSPARENT": 32,
    "WS_EX_MDICHILD": 64,
    "WS_EX_TOOLWINDOW": 128,
    "WS_EX_WINDOWEDGE": 256,
    "WS_EX_CLIENTEDGE": 512,
    "WS_EX_CONTEXTHELP": 1024,
    "WS_EX_RIGHT": 4096,
    "WS_EX_LEFT": 0,
    "WS_EX_RTLREADING": 8192,
    "WS_EX_LTRREADING": 0,
    "WS_EX_LEFTSCROLLBAR": 16384,
    "WS_EX_RIGHTSCROLLBAR": 0,
    "WS_EX_CONTROLPARENT": 65536,
    "WS_EX_STATICEDGE": 131072,
    "WS_EX_APPWINDOW": 262144,
    "WS_EX_OVERLAPPEDWINDOW": 768,
    "WS_EX_PALETTEWINDOW": 392,
    "WS_EX_LAYERED": 524288,
    "WS_EX_NOINHERITLAYOUT": 1048576,
    "WS_EX_NOREDIRECTIONBITMAP": 2097152,
    "WS_EX_LAYOUTRTL": 4194304,
    "WS_EX_COMPOSITED": 33554432,
    "WS_EX_NOACTIVATE": 134217728
  },
  "WINDOW_STYLE": {
    "WS_OVERLAPPED": 0,
    "WS_POPUP": 2147483648,
    "WS_CHILD": 1073741824,
    "WS_MINIMIZE": 536870912,
    "WS_VISIBLE": 268435456,
    "WS_DISABLED": 134217728,
    "WS_CLIPSIBLINGS": 67108864,
    "WS_CLIPCHILDREN": 33554432,
    "WS_MAXIMIZE": 16777216,
    "WS_CAPTION": 12582912,
    "WS_BORDER": 8388608,
    "WS_DLGFRAME": 4194304,
    "WS_VSCROLL": 2097152,
    "WS_HSCROLL": 1048576,
    "WS_SYSMENU": 524288,
    "WS_THICKFRAME": 262144,
    "WS_GROUP": 131072,
    "WS_TABSTOP": 65536,
    "WS_MINIMIZEBOX": 131072,
    "WS_MAXIMIZEBOX": 65536,
    "WS_TILED": 0,
    "WS_ICONIC": 536870912,
    "WS_SIZEBOX": 262144,
    "WS_TILEDWINDOW": 13565952,
    "WS_OVERLAPPEDWINDOW": 13565952,
    "WS_POPUPWINDOW": 2156396544,
    "WS_CHILDWINDOW": 1073741824,
    "WS_ACTIVECAPTION": 1
  },
  "OBJECT_IDENTIFIER": {
    "OBJID_WINDOW": 0,
    "OBJID_SYSMENU": -1,
    "OBJID_TITLEBAR": -2,
    "OBJID_MENU": -3,
    "OBJID_CLIENT": -4,
    "OBJID_VSCROLL": -5,
    "OBJID_HSCROLL": -6,
    "OBJID_SIZEGRIP": -7,
    "OBJID_CARET": -8,
    "OBJID_CURSOR": -9,
    "OBJID_ALERT": -10,
    "OBJID_SOUND": -11,
    "OBJID_QUERYCLASSNAMEIDX": -12,
    "OBJID_NATIVEOM": -16
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
  "SCROLLBAR_CONSTANTS": {
    "SB_CTL": 2,
    "SB_HORZ": 0,
    "SB_VERT": 1,
    "SB_BOTH": 3
  },
  "GET_CLASS_LONG_INDEX": {
    "GCW_ATOM": -32,
    "GCL_CBCLSEXTRA": -20,
    "GCL_CBWNDEXTRA": -18,
    "GCL_HBRBACKGROUND": -10,
    "GCL_HCURSOR": -12,
    "GCL_HICON": -14,
    "GCL_HICONSM": -34,
    "GCL_HMODULE": -16,
    "GCL_MENUNAME": -8,
    "GCL_STYLE": -26,
    "GCL_WNDPROC": -24,
    "GCLP_HBRBACKGROUND": -10,
    "GCLP_HCURSOR": -12,
    "GCLP_HICON": -14,
    "GCLP_HICONSM": -34,
    "GCLP_HMODULE": -16,
    "GCLP_MENUNAME": -8,
    "GCLP_WNDPROC": -24
  },
  "UPDATE_LAYERED_WINDOW_FLAGS": {
    "ULW_ALPHA": 2,
    "ULW_COLORKEY": 1,
    "ULW_OPAQUE": 4,
    "ULW_EX_NORESIZE": 8
  },
  "WINDOW_LONG_PTR_INDEX": {
    "GWL_EXSTYLE": -20,
    "GWLP_HINSTANCE": -6,
    "GWLP_HWNDPARENT": -8,
    "GWLP_ID": -12,
    "GWL_STYLE": -16,
    "GWLP_USERDATA": -21,
    "GWLP_WNDPROC": -4,
    "GWL_HINSTANCE": -6,
    "GWL_ID": -12,
    "GWL_USERDATA": -21,
    "GWL_WNDPROC": -4,
    "GWL_HWNDPARENT": -8
  },
  "ANIMATE_WINDOW_FLAGS": {
    "AW_ACTIVATE": 131072,
    "AW_BLEND": 524288,
    "AW_CENTER": 16,
    "AW_HIDE": 65536,
    "AW_HOR_POSITIVE": 1,
    "AW_HOR_NEGATIVE": 2,
    "AW_SLIDE": 262144,
    "AW_VER_POSITIVE": 4,
    "AW_VER_NEGATIVE": 8
  },
  "CHANGE_WINDOW_MESSAGE_FILTER_FLAGS": {
    "MSGFLT_ADD": 1,
    "MSGFLT_REMOVE": 2
  },
  "GDI_IMAGE_TYPE": {
    "IMAGE_BITMAP": 0,
    "IMAGE_CURSOR": 2,
    "IMAGE_ICON": 1
  },
  "WINDOWS_HOOK_ID": {
    "WH_CALLWNDPROC": 4,
    "WH_CALLWNDPROCRET": 12,
    "WH_CBT": 5,
    "WH_DEBUG": 9,
    "WH_FOREGROUNDIDLE": 11,
    "WH_GETMESSAGE": 3,
    "WH_JOURNALPLAYBACK": 1,
    "WH_JOURNALRECORD": 0,
    "WH_KEYBOARD": 2,
    "WH_KEYBOARD_LL": 13,
    "WH_MOUSE": 7,
    "WH_MOUSE_LL": 14,
    "WH_MSGFILTER": -1,
    "WH_SHELL": 10,
    "WH_SYSMSGFILTER": 6
  },
  "IMAGE_FLAGS": {
    "LR_CREATEDIBSECTION": 8192,
    "LR_DEFAULTCOLOR": 0,
    "LR_DEFAULTSIZE": 64,
    "LR_LOADFROMFILE": 16,
    "LR_LOADMAP3DCOLORS": 4096,
    "LR_LOADTRANSPARENT": 32,
    "LR_MONOCHROME": 1,
    "LR_SHARED": 32768,
    "LR_VGACOLOR": 128,
    "LR_COPYDELETEORG": 8,
    "LR_COPYFROMRESOURCE": 16384,
    "LR_COPYRETURNORG": 4
  },
  "SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS": {
    "SPIF_UPDATEINIFILE": 1,
    "SPIF_SENDCHANGE": 2,
    "SPIF_SENDWININICHANGE": 2
  },
  "SET_WINDOW_POS_FLAGS": {
    "SWP_ASYNCWINDOWPOS": 16384,
    "SWP_DEFERERASE": 8192,
    "SWP_DRAWFRAME": 32,
    "SWP_FRAMECHANGED": 32,
    "SWP_HIDEWINDOW": 128,
    "SWP_NOACTIVATE": 16,
    "SWP_NOCOPYBITS": 256,
    "SWP_NOMOVE": 2,
    "SWP_NOOWNERZORDER": 512,
    "SWP_NOREDRAW": 8,
    "SWP_NOREPOSITION": 512,
    "SWP_NOSENDCHANGING": 1024,
    "SWP_NOSIZE": 1,
    "SWP_NOZORDER": 4,
    "SWP_SHOWWINDOW": 64
  },
  "MSG_WAIT_FOR_MULTIPLE_OBJECTS_EX_FLAGS": {
    "MWMO_NONE": 0,
    "MWMO_ALERTABLE": 2,
    "MWMO_INPUTAVAILABLE": 4,
    "MWMO_WAITALL": 1
  },
  "QUEUE_STATUS_FLAGS": {
    "QS_ALLEVENTS": 1215,
    "QS_ALLINPUT": 1279,
    "QS_ALLPOSTMESSAGE": 256,
    "QS_HOTKEY": 128,
    "QS_INPUT": 1031,
    "QS_KEY": 1,
    "QS_MOUSE": 6,
    "QS_MOUSEBUTTON": 4,
    "QS_MOUSEMOVE": 2,
    "QS_PAINT": 32,
    "QS_POSTMESSAGE": 8,
    "QS_RAWINPUT": 1024,
    "QS_SENDMESSAGE": 64,
    "QS_TIMER": 16
  },
  "REGISTER_NOTIFICATION_FLAGS": {
    "DEVICE_NOTIFY_SERVICE_HANDLE": 1,
    "DEVICE_NOTIFY_CALLBACK": 2,
    "DEVICE_NOTIFY_WINDOW_HANDLE": 0,
    "DEVICE_NOTIFY_ALL_INTERFACE_CLASSES": 4
  },
  "SYSTEM_CURSOR_ID": {
    "OCR_APPSTARTING": 32650,
    "OCR_NORMAL": 32512,
    "OCR_CROSS": 32515,
    "OCR_HAND": 32649,
    "OCR_HELP": 32651,
    "OCR_IBEAM": 32513,
    "OCR_NO": 32648,
    "OCR_SIZEALL": 32646,
    "OCR_SIZENESW": 32643,
    "OCR_SIZENS": 32645,
    "OCR_SIZENWSE": 32642,
    "OCR_SIZEWE": 32644,
    "OCR_UP": 32516,
    "OCR_WAIT": 32514
  },
  "LAYERED_WINDOW_ATTRIBUTES_FLAGS": {
    "LWA_ALPHA": 2,
    "LWA_COLORKEY": 1
  },
  "SEND_MESSAGE_TIMEOUT_FLAGS": {
    "SMTO_ABORTIFHUNG": 2,
    "SMTO_BLOCK": 1,
    "SMTO_NORMAL": 0,
    "SMTO_NOTIMEOUTIFNOTHUNG": 8,
    "SMTO_ERRORONEXIT": 32
  },
  "PEEK_MESSAGE_REMOVE_TYPE": {
    "PM_NOREMOVE": 0,
    "PM_REMOVE": 1,
    "PM_NOYIELD": 2,
    "PM_QS_INPUT": 67567616,
    "PM_QS_POSTMESSAGE": 9961472,
    "PM_QS_PAINT": 2097152,
    "PM_QS_SENDMESSAGE": 4194304
  },
  "GET_WINDOW_CMD": {
    "GW_CHILD": 5,
    "GW_ENABLEDPOPUP": 6,
    "GW_HWNDFIRST": 0,
    "GW_HWNDLAST": 1,
    "GW_HWNDNEXT": 2,
    "GW_HWNDPREV": 3,
    "GW_OWNER": 4
  },
  "SYSTEM_METRICS_INDEX": {
    "SM_ARRANGE": 56,
    "SM_CLEANBOOT": 67,
    "SM_CMONITORS": 80,
    "SM_CMOUSEBUTTONS": 43,
    "SM_CONVERTIBLESLATEMODE": 8195,
    "SM_CXBORDER": 5,
    "SM_CXCURSOR": 13,
    "SM_CXDLGFRAME": 7,
    "SM_CXDOUBLECLK": 36,
    "SM_CXDRAG": 68,
    "SM_CXEDGE": 45,
    "SM_CXFIXEDFRAME": 7,
    "SM_CXFOCUSBORDER": 83,
    "SM_CXFRAME": 32,
    "SM_CXFULLSCREEN": 16,
    "SM_CXHSCROLL": 21,
    "SM_CXHTHUMB": 10,
    "SM_CXICON": 11,
    "SM_CXICONSPACING": 38,
    "SM_CXMAXIMIZED": 61,
    "SM_CXMAXTRACK": 59,
    "SM_CXMENUCHECK": 71,
    "SM_CXMENUSIZE": 54,
    "SM_CXMIN": 28,
    "SM_CXMINIMIZED": 57,
    "SM_CXMINSPACING": 47,
    "SM_CXMINTRACK": 34,
    "SM_CXPADDEDBORDER": 92,
    "SM_CXSCREEN": 0,
    "SM_CXSIZE": 30,
    "SM_CXSIZEFRAME": 32,
    "SM_CXSMICON": 49,
    "SM_CXSMSIZE": 52,
    "SM_CXVIRTUALSCREEN": 78,
    "SM_CXVSCROLL": 2,
    "SM_CYBORDER": 6,
    "SM_CYCAPTION": 4,
    "SM_CYCURSOR": 14,
    "SM_CYDLGFRAME": 8,
    "SM_CYDOUBLECLK": 37,
    "SM_CYDRAG": 69,
    "SM_CYEDGE": 46,
    "SM_CYFIXEDFRAME": 8,
    "SM_CYFOCUSBORDER": 84,
    "SM_CYFRAME": 33,
    "SM_CYFULLSCREEN": 17,
    "SM_CYHSCROLL": 3,
    "SM_CYICON": 12,
    "SM_CYICONSPACING": 39,
    "SM_CYKANJIWINDOW": 18,
    "SM_CYMAXIMIZED": 62,
    "SM_CYMAXTRACK": 60,
    "SM_CYMENU": 15,
    "SM_CYMENUCHECK": 72,
    "SM_CYMENUSIZE": 55,
    "SM_CYMIN": 29,
    "SM_CYMINIMIZED": 58,
    "SM_CYMINSPACING": 48,
    "SM_CYMINTRACK": 35,
    "SM_CYSCREEN": 1,
    "SM_CYSIZE": 31,
    "SM_CYSIZEFRAME": 33,
    "SM_CYSMCAPTION": 51,
    "SM_CYSMICON": 50,
    "SM_CYSMSIZE": 53,
    "SM_CYVIRTUALSCREEN": 79,
    "SM_CYVSCROLL": 20,
    "SM_CYVTHUMB": 9,
    "SM_DBCSENABLED": 42,
    "SM_DEBUG": 22,
    "SM_DIGITIZER": 94,
    "SM_IMMENABLED": 82,
    "SM_MAXIMUMTOUCHES": 95,
    "SM_MEDIACENTER": 87,
    "SM_MENUDROPALIGNMENT": 40,
    "SM_MIDEASTENABLED": 74,
    "SM_MOUSEPRESENT": 19,
    "SM_MOUSEHORIZONTALWHEELPRESENT": 91,
    "SM_MOUSEWHEELPRESENT": 75,
    "SM_NETWORK": 63,
    "SM_PENWINDOWS": 41,
    "SM_REMOTECONTROL": 8193,
    "SM_REMOTESESSION": 4096,
    "SM_SAMEDISPLAYFORMAT": 81,
    "SM_SECURE": 44,
    "SM_SERVERR2": 89,
    "SM_SHOWSOUNDS": 70,
    "SM_SHUTTINGDOWN": 8192,
    "SM_SLOWMACHINE": 73,
    "SM_STARTER": 88,
    "SM_SWAPBUTTON": 23,
    "SM_SYSTEMDOCKED": 8196,
    "SM_TABLETPC": 86,
    "SM_XVIRTUALSCREEN": 76,
    "SM_YVIRTUALSCREEN": 77
  },
  "GET_ANCESTOR_FLAGS": {
    "GA_PARENT": 1,
    "GA_ROOT": 2,
    "GA_ROOTOWNER": 3
  },
  "TILE_WINDOWS_HOW": {
    "MDITILE_HORIZONTAL": 1,
    "MDITILE_VERTICAL": 0
  },
  "WINDOW_DISPLAY_AFFINITY": {
    "WDA_NONE": 0,
    "WDA_MONITOR": 1,
    "WDA_EXCLUDEFROMCAPTURE": 17
  },
  "FOREGROUND_WINDOW_LOCK_CODE": {
    "LSFW_LOCK": 1,
    "LSFW_UNLOCK": 2
  },
  "CASCADE_WINDOWS_HOW": {
    "MDITILE_SKIPDISABLED": 2,
    "MDITILE_ZORDER": 4
  },
  "WINDOW_MESSAGE_FILTER_ACTION": {
    "MSGFLT_ALLOW": 1,
    "MSGFLT_DISALLOW": 2,
    "MSGFLT_RESET": 0
  },
  "GET_MENU_DEFAULT_ITEM_FLAGS": {
    "GMDI_GOINTOPOPUPS": 2,
    "GMDI_USEDISABLED": 1
  },
  "DI_FLAGS": {
    "DI_MASK": 1,
    "DI_IMAGE": 2,
    "DI_NORMAL": 3,
    "DI_COMPAT": 4,
    "DI_DEFAULTSIZE": 8,
    "DI_NOMIRROR": 16
  },
  "CONSOLECONTROL": {
    "Reserved1": 0,
    "ConsoleNotifyConsoleApplication": 1,
    "Reserved2": 2,
    "ConsoleSetCaretInfo": 3,
    "Reserved3": 4,
    "ConsoleSetForeground": 5,
    "ConsoleSetWindowOwner": 6,
    "ConsoleEndTask": 7
  },
  "DPI_AWARENESS": {
    "DPI_AWARENESS_INVALID": -1,
    "DPI_AWARENESS_UNAWARE": 0,
    "DPI_AWARENESS_SYSTEM_AWARE": 1,
    "DPI_AWARENESS_PER_MONITOR_AWARE": 2
  },
  "DPI_HOSTING_BEHAVIOR": {
    "DPI_HOSTING_BEHAVIOR_INVALID": -1,
    "DPI_HOSTING_BEHAVIOR_DEFAULT": 0,
    "DPI_HOSTING_BEHAVIOR_MIXED": 1
  },
  "DISPLAYCONFIG_TOPOLOGY_ID": {
    "DISPLAYCONFIG_TOPOLOGY_INTERNAL": 1,
    "DISPLAYCONFIG_TOPOLOGY_CLONE": 2,
    "DISPLAYCONFIG_TOPOLOGY_EXTEND": 4,
    "DISPLAYCONFIG_TOPOLOGY_EXTERNAL": 8
  },
  "POINTER_INPUT_TYPE": {
    "PT_POINTER": 1,
    "PT_TOUCH": 2,
    "PT_PEN": 3,
    "PT_MOUSE": 4,
    "PT_TOUCHPAD": 5
  },
  "TOOLTIP_DISMISS_FLAGS": {
    "TDF_REGISTER": 1,
    "TDF_UNREGISTER": 2
  },
  "MOVESIZE_OPERATION": {
    "MSO_SIZE_LEFT": 1,
    "MSO_SIZE_RIGHT": 2,
    "MSO_SIZE_TOP": 3,
    "MSO_SIZE_TOPLEFT": 4,
    "MSO_SIZE_TOPRIGHT": 5,
    "MSO_SIZE_BOTTOM": 6,
    "MSO_SIZE_BOTTOMLEFT": 7,
    "MSO_SIZE_BOTTOMRIGHT": 8,
    "MSO_MOVE": 9
  },
  "FEEDBACK_TYPE": {
    "FEEDBACK_TOUCH_CONTACTVISUALIZATION": 1,
    "FEEDBACK_PEN_BARRELVISUALIZATION": 2,
    "FEEDBACK_PEN_TAP": 3,
    "FEEDBACK_PEN_DOUBLETAP": 4,
    "FEEDBACK_PEN_PRESSANDHOLD": 5,
    "FEEDBACK_PEN_RIGHTTAP": 6,
    "FEEDBACK_TOUCH_TAP": 7,
    "FEEDBACK_TOUCH_DOUBLETAP": 8,
    "FEEDBACK_TOUCH_PRESSANDHOLD": 9,
    "FEEDBACK_TOUCH_RIGHTTAP": 10,
    "FEEDBACK_GESTURE_PRESSANDTAP": 11,
    "FEEDBACK_MAX": -1
  },
  "DIALOG_CONTROL_DPI_CHANGE_BEHAVIORS": {
    "DCDC_DEFAULT": 0,
    "DCDC_DISABLE_FONT_UPDATE": 1,
    "DCDC_DISABLE_RELAYOUT": 2
  },
  "DIALOG_DPI_CHANGE_BEHAVIORS": {
    "DDC_DEFAULT": 0,
    "DDC_DISABLE_ALL": 1,
    "DDC_DISABLE_RESIZE": 2,
    "DDC_DISABLE_CONTROL_RELAYOUT": 4
  },
  "POINTER_FEEDBACK_MODE": {
    "POINTER_FEEDBACK_DEFAULT": 1,
    "POINTER_FEEDBACK_INDIRECT": 2,
    "POINTER_FEEDBACK_NONE": 3
  },
  "AR_STATE": {
    "AR_ENABLED": 0,
    "AR_DISABLED": 1,
    "AR_SUPPRESSED": 2,
    "AR_REMOTESESSION": 4,
    "AR_MULTIMON": 8,
    "AR_NOSENSOR": 16,
    "AR_NOT_SUPPORTED": 32,
    "AR_DOCKED": 64,
    "AR_LAPTOP": 128
  },
  "ORIENTATION_PREFERENCE": {
    "ORIENTATION_PREFERENCE_NONE": 0,
    "ORIENTATION_PREFERENCE_LANDSCAPE": 1,
    "ORIENTATION_PREFERENCE_PORTRAIT": 2,
    "ORIENTATION_PREFERENCE_LANDSCAPE_FLIPPED": 4,
    "ORIENTATION_PREFERENCE_PORTRAIT_FLIPPED": 8
  }
};
export declare const wideAliases: {
  "DlgDirList": "DlgDirListW",
  "DlgDirSelectEx": "DlgDirSelectExW",
  "DlgDirListComboBox": "DlgDirListComboBoxW",
  "DlgDirSelectComboBoxEx": "DlgDirSelectComboBoxExW",
  "DrawText": "DrawTextW",
  "DrawTextEx": "DrawTextExW",
  "GrayString": "GrayStringW",
  "DrawState": "DrawStateW",
  "TabbedTextOut": "TabbedTextOutW",
  "GetTabbedTextExtent": "GetTabbedTextExtentW",
  "LoadBitmap": "LoadBitmapW",
  "ChangeDisplaySettings": "ChangeDisplaySettingsW",
  "ChangeDisplaySettingsEx": "ChangeDisplaySettingsExW",
  "EnumDisplaySettings": "EnumDisplaySettingsW",
  "EnumDisplaySettingsEx": "EnumDisplaySettingsExW",
  "EnumDisplayDevices": "EnumDisplayDevicesW",
  "GetMonitorInfo": "GetMonitorInfoW",
  "WinHelp": "WinHelpW",
  "GetConsoleKeyboardLayoutName": "GetConsoleKeyboardLayoutNameW",
  "DdeInitialize": "DdeInitializeW",
  "DdeCreateStringHandle": "DdeCreateStringHandleW",
  "DdeQueryString": "DdeQueryStringW",
  "RegisterClipboardFormat": "RegisterClipboardFormatW",
  "GetClipboardFormatName": "GetClipboardFormatNameW",
  "SendIMEMessageEx": "SendIMEMessageExW",
  "IMPGetIME": "IMPGetIMEW",
  "IMPQueryIME": "IMPQueryIMEW",
  "IMPSetIME": "IMPSetIMEW",
  "LoadKeyboardLayout": "LoadKeyboardLayoutW",
  "GetKeyboardLayoutName": "GetKeyboardLayoutNameW",
  "GetKeyNameText": "GetKeyNameTextW",
  "VkKeyScan": "VkKeyScanW",
  "VkKeyScanEx": "VkKeyScanExW",
  "MapVirtualKey": "MapVirtualKeyW",
  "MapVirtualKeyEx": "MapVirtualKeyExW",
  "LoadString": "LoadStringW",
  "GetWindowLongPtr": "GetWindowLongPtrW",
  "SetWindowLongPtr": "SetWindowLongPtrW",
  "GetClassLongPtr": "GetClassLongPtrW",
  "SetClassLongPtr": "SetClassLongPtrW",
  "wvsprintf": "wvsprintfW",
  "wsprintf": "wsprintfW",
  "RegisterWindowMessage": "RegisterWindowMessageW",
  "GetMessage": "GetMessageW",
  "DispatchMessage": "DispatchMessageW",
  "PeekMessage": "PeekMessageW",
  "SendMessage": "SendMessageW",
  "SendMessageTimeout": "SendMessageTimeoutW",
  "SendNotifyMessage": "SendNotifyMessageW",
  "SendMessageCallback": "SendMessageCallbackW",
  "RegisterDeviceNotification": "RegisterDeviceNotificationW",
  "PostMessage": "PostMessageW",
  "PostThreadMessage": "PostThreadMessageW",
  "DefWindowProc": "DefWindowProcW",
  "CallWindowProc": "CallWindowProcW",
  "RegisterClass": "RegisterClassW",
  "UnregisterClass": "UnregisterClassW",
  "GetClassInfo": "GetClassInfoW",
  "RegisterClassEx": "RegisterClassExW",
  "GetClassInfoEx": "GetClassInfoExW",
  "CreateWindowEx": "CreateWindowExW",
  "CreateDialogParam": "CreateDialogParamW",
  "CreateDialogIndirectParam": "CreateDialogIndirectParamW",
  "DialogBoxParam": "DialogBoxParamW",
  "DialogBoxIndirectParam": "DialogBoxIndirectParamW",
  "SetDlgItemText": "SetDlgItemTextW",
  "GetDlgItemText": "GetDlgItemTextW",
  "SendDlgItemMessage": "SendDlgItemMessageW",
  "DefDlgProc": "DefDlgProcW",
  "CallMsgFilter": "CallMsgFilterW",
  "CharToOem": "CharToOemW",
  "OemToChar": "OemToCharW",
  "CharToOemBuff": "CharToOemBuffW",
  "OemToCharBuff": "OemToCharBuffW",
  "CharUpper": "CharUpperW",
  "CharUpperBuff": "CharUpperBuffW",
  "CharLower": "CharLowerW",
  "CharLowerBuff": "CharLowerBuffW",
  "CharNext": "CharNextW",
  "CharPrev": "CharPrevW",
  "IsCharAlpha": "IsCharAlphaW",
  "IsCharAlphaNumeric": "IsCharAlphaNumericW",
  "IsCharUpper": "IsCharUpperW",
  "IsCharLower": "IsCharLowerW",
  "LoadAccelerators": "LoadAcceleratorsW",
  "CreateAcceleratorTable": "CreateAcceleratorTableW",
  "CopyAcceleratorTable": "CopyAcceleratorTableW",
  "TranslateAccelerator": "TranslateAcceleratorW",
  "LoadMenu": "LoadMenuW",
  "LoadMenuIndirect": "LoadMenuIndirectW",
  "ChangeMenu": "ChangeMenuW",
  "GetMenuString": "GetMenuStringW",
  "InsertMenu": "InsertMenuW",
  "AppendMenu": "AppendMenuW",
  "ModifyMenu": "ModifyMenuW",
  "InsertMenuItem": "InsertMenuItemW",
  "GetMenuItemInfo": "GetMenuItemInfoW",
  "SetMenuItemInfo": "SetMenuItemInfoW",
  "SetProp": "SetPropW",
  "GetProp": "GetPropW",
  "RemoveProp": "RemovePropW",
  "EnumPropsEx": "EnumPropsExW",
  "EnumProps": "EnumPropsW",
  "SetWindowText": "SetWindowTextW",
  "GetWindowText": "GetWindowTextW",
  "GetWindowTextLength": "GetWindowTextLengthW",
  "MessageBox": "MessageBoxW",
  "MessageBoxEx": "MessageBoxExW",
  "MessageBoxIndirect": "MessageBoxIndirectW",
  "GetWindowLong": "GetWindowLongW",
  "SetWindowLong": "SetWindowLongW",
  "GetClassLong": "GetClassLongW",
  "SetClassLong": "SetClassLongW",
  "FindWindow": "FindWindowW",
  "FindWindowEx": "FindWindowExW",
  "GetClassName": "GetClassNameW",
  "SetWindowsHook": "SetWindowsHookW",
  "SetWindowsHookEx": "SetWindowsHookExW",
  "LoadCursor": "LoadCursorW",
  "LoadCursorFromFile": "LoadCursorFromFileW",
  "LoadIcon": "LoadIconW",
  "PrivateExtractIcons": "PrivateExtractIconsW",
  "LoadImage": "LoadImageW",
  "GetIconInfoEx": "GetIconInfoExW",
  "IsDialogMessage": "IsDialogMessageW",
  "DefFrameProc": "DefFrameProcW",
  "DefMDIChildProc": "DefMDIChildProcW",
  "CreateMDIWindow": "CreateMDIWindowW",
  "SystemParametersInfo": "SystemParametersInfoW",
  "GetWindowModuleFileName": "GetWindowModuleFileNameW",
  "RealGetWindowClass": "RealGetWindowClassW",
  "GetAltTabInfo": "GetAltTabInfoW",
  "CreateDesktop": "CreateDesktopW",
  "CreateDesktopEx": "CreateDesktopExW",
  "OpenDesktop": "OpenDesktopW",
  "EnumDesktops": "EnumDesktopsW",
  "CreateWindowStation": "CreateWindowStationW",
  "OpenWindowStation": "OpenWindowStationW",
  "EnumWindowStations": "EnumWindowStationsW",
  "GetUserObjectInformation": "GetUserObjectInformationW",
  "SetUserObjectInformation": "SetUserObjectInformationW",
  "BroadcastSystemMessageEx": "BroadcastSystemMessageExW",
  "BroadcastSystemMessage": "BroadcastSystemMessageW",
  "GetRawInputDeviceInfo": "GetRawInputDeviceInfoW"
};
export declare const signatures: {
  "user32.dll": {
    "CheckDlgButton": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.UI.Controls.DLG_BUTTON_CHECK_STATE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CheckRadioButton": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsDlgButtonChecked": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateSyntheticPointerDevice": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.POINTER_INPUT_TYPE",
        "u32",
        "Windows.Win32.UI.Input.Pointer.POINTER_FEEDBACK_MODE"
      ],
      "returns": "Windows.Win32.UI.Input.Pointer.HSYNTHETICPOINTERDEVICE",
      "setLastError": false
    },
    "RegisterTouchHitTestingWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EvaluateProximityToRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.UI.Controls.TOUCH_HIT_TESTING_INPUT*",
        "Windows.Win32.UI.Controls.TOUCH_HIT_TESTING_PROXIMITY_EVALUATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EvaluateProximityToPolygon": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.POINT*",
        "Windows.Win32.UI.Controls.TOUCH_HIT_TESTING_INPUT*",
        "Windows.Win32.UI.Controls.TOUCH_HIT_TESTING_PROXIMITY_EVALUATION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PackTouchHitTestingProximityEvaluation": {
      "args": [
        "Windows.Win32.UI.Controls.TOUCH_HIT_TESTING_INPUT*",
        "Windows.Win32.UI.Controls.TOUCH_HIT_TESTING_PROXIMITY_EVALUATION*"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "GetWindowFeedbackSetting": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.Controls.FEEDBACK_TYPE",
        "u32",
        "u32*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWindowFeedbackSetting": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.Controls.FEEDBACK_TYPE",
        "u32",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetScrollPos": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLLBAR_CONSTANTS",
        "i32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetScrollRange": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLLBAR_CONSTANTS",
        "i32",
        "i32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ShowScrollBar": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLLBAR_CONSTANTS",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnableScrollBar": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.UI.Controls.ENABLE_SCROLL_BAR_ARROWS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DlgDirListA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "i32",
        "Windows.Win32.UI.Controls.DLG_DIR_LIST_FILE_TYPE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DlgDirListW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32",
        "Windows.Win32.UI.Controls.DLG_DIR_LIST_FILE_TYPE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DlgDirSelectExA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DlgDirSelectExW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DlgDirListComboBoxA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "i32",
        "Windows.Win32.UI.Controls.DLG_DIR_LIST_FILE_TYPE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DlgDirListComboBoxW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32",
        "Windows.Win32.UI.Controls.DLG_DIR_LIST_FILE_TYPE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DlgDirSelectComboBoxExA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DlgDirSelectComboBoxExW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetScrollInfo": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLLBAR_CONSTANTS",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLLINFO*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetComboBoxInfo": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.Controls.COMBOBOXINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetListBoxInfo": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RegisterPointerDeviceNotifications": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MessageBeep": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_STYLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetLastErrorEx": {
      "args": [
        "Windows.Win32.Foundation.WIN32_ERROR",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "DrawEdge": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.DRAWEDGE_FLAGS",
        "Windows.Win32.Graphics.Gdi.DRAW_EDGE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DrawFrameControl": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DrawCaption": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.DRAW_CAPTION_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DrawAnimatedRects": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DrawTextA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.DRAW_TEXT_FORMAT"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DrawTextW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.DRAW_TEXT_FORMAT"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DrawTextExA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.DRAW_TEXT_FORMAT",
        "Windows.Win32.Graphics.Gdi.DRAWTEXTPARAMS*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DrawTextExW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.DRAW_TEXT_FORMAT",
        "Windows.Win32.Graphics.Gdi.DRAWTEXTPARAMS*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GrayStringA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HBRUSH",
        "Windows.Win32.Graphics.Gdi.GRAYSTRINGPROC",
        "Windows.Win32.Foundation.LPARAM",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GrayStringW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HBRUSH",
        "Windows.Win32.Graphics.Gdi.GRAYSTRINGPROC",
        "Windows.Win32.Foundation.LPARAM",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DrawStateA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HBRUSH",
        "Windows.Win32.Graphics.Gdi.DRAWSTATEPROC",
        "Windows.Win32.Foundation.LPARAM",
        "Windows.Win32.Foundation.WPARAM",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.DRAWSTATE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DrawStateW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HBRUSH",
        "Windows.Win32.Graphics.Gdi.DRAWSTATEPROC",
        "Windows.Win32.Foundation.LPARAM",
        "Windows.Win32.Foundation.WPARAM",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.DRAWSTATE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TabbedTextOutA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "i32",
        "i32*",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "TabbedTextOutW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32",
        "i32*",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetTabbedTextExtentA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "i32",
        "i32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTabbedTextExtentW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32",
        "i32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "UpdateWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PaintDesktop": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WindowFromDC": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetDC": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "GetDCEx": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Graphics.Gdi.GET_DCX_FLAGS"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "GetWindowDC": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "ReleaseDC": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "BeginPaint": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.PAINTSTRUCT*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "EndPaint": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.PAINTSTRUCT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUpdateRect": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUpdateRgn": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "SetWindowRgn": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetWindowRgn": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HRGN"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "GetWindowRgnBox": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "ExcludeUpdateRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "InvalidateRect": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ValidateRect": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InvalidateRgn": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ValidateRgn": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HRGN"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RedrawWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Graphics.Gdi.REDRAW_WINDOW_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LockWindowUpdate": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ClientToScreen": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ScreenToClient": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MapWindowPoints": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT*",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetSysColor": {
      "args": [
        "Windows.Win32.Graphics.Gdi.SYS_COLOR_INDEX"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSysColorBrush": {
      "args": [
        "Windows.Win32.Graphics.Gdi.SYS_COLOR_INDEX"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBRUSH",
      "setLastError": false
    },
    "SetSysColors": {
      "args": [
        "i32",
        "i32*",
        "Windows.Win32.Foundation.COLORREF*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DrawFocusRect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FillRect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.HBRUSH"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "FrameRect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.HBRUSH"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "InvertRect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetRectEmpty": {
      "args": [
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CopyRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InflateRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IntersectRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnionRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SubtractRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OffsetRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsRectEmpty": {
      "args": [
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EqualRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PtInRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.POINT"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LoadBitmapA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBITMAP",
      "setLastError": false
    },
    "LoadBitmapW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBITMAP",
      "setLastError": false
    },
    "ChangeDisplaySettingsA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.DEVMODEA*",
        "Windows.Win32.Graphics.Gdi.CDS_TYPE"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.DISP_CHANGE",
      "setLastError": false
    },
    "ChangeDisplaySettingsW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.DEVMODEW*",
        "Windows.Win32.Graphics.Gdi.CDS_TYPE"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.DISP_CHANGE",
      "setLastError": false
    },
    "ChangeDisplaySettingsExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEA*",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.CDS_TYPE",
        "void*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.DISP_CHANGE",
      "setLastError": false
    },
    "ChangeDisplaySettingsExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEW*",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.CDS_TYPE",
        "void*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.DISP_CHANGE",
      "setLastError": false
    },
    "EnumDisplaySettingsA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Graphics.Gdi.ENUM_DISPLAY_SETTINGS_MODE",
        "Windows.Win32.Graphics.Gdi.DEVMODEA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDisplaySettingsW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.ENUM_DISPLAY_SETTINGS_MODE",
        "Windows.Win32.Graphics.Gdi.DEVMODEW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDisplaySettingsExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Graphics.Gdi.ENUM_DISPLAY_SETTINGS_MODE",
        "Windows.Win32.Graphics.Gdi.DEVMODEA*",
        "Windows.Win32.Graphics.Gdi.ENUM_DISPLAY_SETTINGS_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDisplaySettingsExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.ENUM_DISPLAY_SETTINGS_MODE",
        "Windows.Win32.Graphics.Gdi.DEVMODEW*",
        "Windows.Win32.Graphics.Gdi.ENUM_DISPLAY_SETTINGS_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDisplayDevicesA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "Windows.Win32.Graphics.Gdi.DISPLAY_DEVICEA*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDisplayDevicesW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Graphics.Gdi.DISPLAY_DEVICEW*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MonitorFromPoint": {
      "args": [
        "Windows.Win32.Foundation.POINT",
        "Windows.Win32.Graphics.Gdi.MONITOR_FROM_FLAGS"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HMONITOR",
      "setLastError": false
    },
    "MonitorFromRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.MONITOR_FROM_FLAGS"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HMONITOR",
      "setLastError": false
    },
    "MonitorFromWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.MONITOR_FROM_FLAGS"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HMONITOR",
      "setLastError": false
    },
    "GetMonitorInfoA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HMONITOR",
        "Windows.Win32.Graphics.Gdi.MONITORINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMonitorInfoW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HMONITOR",
        "Windows.Win32.Graphics.Gdi.MONITORINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDisplayMonitors": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.MONITORENUMPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDialogControlDpiChangeBehavior": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.HiDpi.DIALOG_CONTROL_DPI_CHANGE_BEHAVIORS",
        "Windows.Win32.UI.HiDpi.DIALOG_CONTROL_DPI_CHANGE_BEHAVIORS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDialogControlDpiChangeBehavior": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.UI.HiDpi.DIALOG_CONTROL_DPI_CHANGE_BEHAVIORS",
      "setLastError": false
    },
    "SetDialogDpiChangeBehavior": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.HiDpi.DIALOG_DPI_CHANGE_BEHAVIORS",
        "Windows.Win32.UI.HiDpi.DIALOG_DPI_CHANGE_BEHAVIORS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDialogDpiChangeBehavior": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.UI.HiDpi.DIALOG_DPI_CHANGE_BEHAVIORS",
      "setLastError": false
    },
    "GetSystemMetricsForDpi": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.SYSTEM_METRICS_INDEX",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "AdjustWindowRectExForDpi": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_STYLE",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_EX_STYLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LogicalToPhysicalPointForPerMonitorDPI": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PhysicalToLogicalPointForPerMonitorDPI": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SystemParametersInfoForDpi": {
      "args": [
        "u32",
        "u32",
        "void*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadDpiAwarenessContext": {
      "args": [
        "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT"
      ],
      "returns": "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT",
      "setLastError": false
    },
    "GetThreadDpiAwarenessContext": {
      "args": [],
      "returns": "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT",
      "setLastError": false
    },
    "GetWindowDpiAwarenessContext": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT",
      "setLastError": false
    },
    "GetAwarenessFromDpiAwarenessContext": {
      "args": [
        "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT"
      ],
      "returns": "Windows.Win32.UI.HiDpi.DPI_AWARENESS",
      "setLastError": false
    },
    "GetDpiFromDpiAwarenessContext": {
      "args": [
        "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "AreDpiAwarenessContextsEqual": {
      "args": [
        "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT",
        "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsValidDpiAwarenessContext": {
      "args": [
        "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDpiForWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetDpiForSystem": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetSystemDpiForProcess": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EnableNonClientDpiScaling": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessDpiAwarenessContext": {
      "args": [
        "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDpiAwarenessContextForProcess": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.UI.HiDpi.DPI_AWARENESS_CONTEXT",
      "setLastError": false
    },
    "SetThreadDpiHostingBehavior": {
      "args": [
        "Windows.Win32.UI.HiDpi.DPI_HOSTING_BEHAVIOR"
      ],
      "returns": "Windows.Win32.UI.HiDpi.DPI_HOSTING_BEHAVIOR",
      "setLastError": false
    },
    "GetThreadDpiHostingBehavior": {
      "args": [],
      "returns": "Windows.Win32.UI.HiDpi.DPI_HOSTING_BEHAVIOR",
      "setLastError": false
    },
    "GetWindowDpiHostingBehavior": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.UI.HiDpi.DPI_HOSTING_BEHAVIOR",
      "setLastError": false
    },
    "SetUserObjectSecurity": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Security.OBJECT_SECURITY_INFORMATION*",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUserObjectSecurity": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "Windows.Win32.Security.PSECURITY_DESCRIPTOR",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWindowContextHelpId": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWindowContextHelpId": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetMenuContextHelpId": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMenuContextHelpId": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "WinHelpA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WinHelpW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AttachThreadInput": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WaitForInputIdle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetGuiResources": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.Threading.GET_GUI_RESOURCES_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "IsImmersiveProcess": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessRestrictionExemption": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDisplayConfigBufferSizes": {
      "args": [
        "Windows.Win32.Devices.Display.QUERY_DISPLAY_CONFIG_FLAGS",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetDisplayConfig": {
      "args": [
        "u32",
        "Windows.Win32.Devices.Display.DISPLAYCONFIG_PATH_INFO*",
        "u32",
        "Windows.Win32.Devices.Display.DISPLAYCONFIG_MODE_INFO*",
        "Windows.Win32.Devices.Display.SET_DISPLAY_CONFIG_FLAGS"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "QueryDisplayConfig": {
      "args": [
        "Windows.Win32.Devices.Display.QUERY_DISPLAY_CONFIG_FLAGS",
        "u32*",
        "Windows.Win32.Devices.Display.DISPLAYCONFIG_PATH_INFO*",
        "u32*",
        "Windows.Win32.Devices.Display.DISPLAYCONFIG_MODE_INFO*",
        "Windows.Win32.Devices.Display.DISPLAYCONFIG_TOPOLOGY_ID*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "DisplayConfigGetDeviceInfo": {
      "args": [
        "Windows.Win32.Devices.Display.DISPLAYCONFIG_DEVICE_INFO_HEADER*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DisplayConfigSetDeviceInfo": {
      "args": [
        "Windows.Win32.Devices.Display.DISPLAYCONFIG_DEVICE_INFO_HEADER*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetAutoRotationState": {
      "args": [
        "Windows.Win32.Devices.Display.AR_STATE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDisplayAutoRotationPreferences": {
      "args": [
        "Windows.Win32.Devices.Display.ORIENTATION_PREFERENCE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDisplayAutoRotationPreferences": {
      "args": [
        "Windows.Win32.Devices.Display.ORIENTATION_PREFERENCE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PrintWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Storage.Xps.PRINT_WINDOW_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleKeyboardLayoutNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetConsoleKeyboardLayoutNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConsoleControl": {
      "args": [
        "Windows.Win32.System.Console.CONSOLECONTROL",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.NTSTATUS",
      "setLastError": false
    },
    "DdeSetQualityOfService": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Security.SECURITY_QUALITY_OF_SERVICE*",
        "Windows.Win32.Security.SECURITY_QUALITY_OF_SERVICE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ImpersonateDdeClientWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PackDDElParam": {
      "args": [
        "u32",
        "usize",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.LPARAM",
      "setLastError": false
    },
    "UnpackDDElParam": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.LPARAM",
        "usize*",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FreeDDElParam": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReuseDDElParam": {
      "args": [
        "Windows.Win32.Foundation.LPARAM",
        "u32",
        "u32",
        "usize",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.LPARAM",
      "setLastError": false
    },
    "DdeInitializeA": {
      "args": [
        "u32*",
        "Windows.Win32.System.DataExchange.PFNCALLBACK",
        "Windows.Win32.System.DataExchange.DDE_INITIALIZE_COMMAND",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DdeInitializeW": {
      "args": [
        "u32*",
        "Windows.Win32.System.DataExchange.PFNCALLBACK",
        "Windows.Win32.System.DataExchange.DDE_INITIALIZE_COMMAND",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DdeUninitialize": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeConnectList": {
      "args": [
        "u32",
        "Windows.Win32.System.DataExchange.HSZ",
        "Windows.Win32.System.DataExchange.HSZ",
        "Windows.Win32.System.DataExchange.HCONVLIST",
        "Windows.Win32.System.DataExchange.CONVCONTEXT*"
      ],
      "returns": "Windows.Win32.System.DataExchange.HCONVLIST",
      "setLastError": false
    },
    "DdeQueryNextServer": {
      "args": [
        "Windows.Win32.System.DataExchange.HCONVLIST",
        "Windows.Win32.System.DataExchange.HCONV"
      ],
      "returns": "Windows.Win32.System.DataExchange.HCONV",
      "setLastError": false
    },
    "DdeDisconnectList": {
      "args": [
        "Windows.Win32.System.DataExchange.HCONVLIST"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeConnect": {
      "args": [
        "u32",
        "Windows.Win32.System.DataExchange.HSZ",
        "Windows.Win32.System.DataExchange.HSZ",
        "Windows.Win32.System.DataExchange.CONVCONTEXT*"
      ],
      "returns": "Windows.Win32.System.DataExchange.HCONV",
      "setLastError": false
    },
    "DdeDisconnect": {
      "args": [
        "Windows.Win32.System.DataExchange.HCONV"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeReconnect": {
      "args": [
        "Windows.Win32.System.DataExchange.HCONV"
      ],
      "returns": "Windows.Win32.System.DataExchange.HCONV",
      "setLastError": false
    },
    "DdeQueryConvInfo": {
      "args": [
        "Windows.Win32.System.DataExchange.HCONV",
        "u32",
        "Windows.Win32.System.DataExchange.CONVINFO*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DdeSetUserHandle": {
      "args": [
        "Windows.Win32.System.DataExchange.HCONV",
        "u32",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeAbandonTransaction": {
      "args": [
        "u32",
        "Windows.Win32.System.DataExchange.HCONV",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdePostAdvise": {
      "args": [
        "u32",
        "Windows.Win32.System.DataExchange.HSZ",
        "Windows.Win32.System.DataExchange.HSZ"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeEnableCallback": {
      "args": [
        "u32",
        "Windows.Win32.System.DataExchange.HCONV",
        "Windows.Win32.System.DataExchange.DDE_ENABLE_CALLBACK_CMD"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeImpersonateClient": {
      "args": [
        "Windows.Win32.System.DataExchange.HCONV"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeNameService": {
      "args": [
        "u32",
        "Windows.Win32.System.DataExchange.HSZ",
        "Windows.Win32.System.DataExchange.HSZ",
        "Windows.Win32.System.DataExchange.DDE_NAME_SERVICE_CMD"
      ],
      "returns": "Windows.Win32.System.DataExchange.HDDEDATA",
      "setLastError": false
    },
    "DdeClientTransaction": {
      "args": [
        "u8*",
        "u32",
        "Windows.Win32.System.DataExchange.HCONV",
        "Windows.Win32.System.DataExchange.HSZ",
        "u32",
        "Windows.Win32.System.DataExchange.DDE_CLIENT_TRANSACTION_TYPE",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.System.DataExchange.HDDEDATA",
      "setLastError": false
    },
    "DdeCreateDataHandle": {
      "args": [
        "u32",
        "u8*",
        "u32",
        "u32",
        "Windows.Win32.System.DataExchange.HSZ",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.System.DataExchange.HDDEDATA",
      "setLastError": false
    },
    "DdeAddData": {
      "args": [
        "Windows.Win32.System.DataExchange.HDDEDATA",
        "u8*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.System.DataExchange.HDDEDATA",
      "setLastError": false
    },
    "DdeGetData": {
      "args": [
        "Windows.Win32.System.DataExchange.HDDEDATA",
        "u8*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DdeAccessData": {
      "args": [
        "Windows.Win32.System.DataExchange.HDDEDATA",
        "u32*"
      ],
      "returns": "u8*",
      "setLastError": false
    },
    "DdeUnaccessData": {
      "args": [
        "Windows.Win32.System.DataExchange.HDDEDATA"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeFreeDataHandle": {
      "args": [
        "Windows.Win32.System.DataExchange.HDDEDATA"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeGetLastError": {
      "args": [
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DdeCreateStringHandleA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "Windows.Win32.System.DataExchange.HSZ",
      "setLastError": false
    },
    "DdeCreateStringHandleW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.System.DataExchange.HSZ",
      "setLastError": false
    },
    "DdeQueryStringA": {
      "args": [
        "u32",
        "Windows.Win32.System.DataExchange.HSZ",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DdeQueryStringW": {
      "args": [
        "u32",
        "Windows.Win32.System.DataExchange.HSZ",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DdeFreeStringHandle": {
      "args": [
        "u32",
        "Windows.Win32.System.DataExchange.HSZ"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeKeepStringHandle": {
      "args": [
        "u32",
        "Windows.Win32.System.DataExchange.HSZ"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DdeCmpStringHandles": {
      "args": [
        "Windows.Win32.System.DataExchange.HSZ",
        "Windows.Win32.System.DataExchange.HSZ"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "OpenClipboard": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseClipboard": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetClipboardSequenceNumber": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetClipboardOwner": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "SetClipboardViewer": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetClipboardViewer": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "ChangeClipboardChain": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetClipboardData": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetClipboardData": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "RegisterClipboardFormatA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RegisterClipboardFormatW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CountClipboardFormats": {
      "args": [],
      "returns": "i32",
      "setLastError": false
    },
    "EnumClipboardFormats": {
      "args": [
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetClipboardFormatNameA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetClipboardFormatNameW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EmptyClipboard": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsClipboardFormatAvailable": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPriorityClipboardFormat": {
      "args": [
        "u32*",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetOpenClipboardWindow": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "AddClipboardFormatListener": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RemoveClipboardFormatListener": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUpdatedClipboardFormats": {
      "args": [
        "u32*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterPowerSettingNotification": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "System.Guid*",
        "Windows.Win32.UI.WindowsAndMessaging.REGISTER_NOTIFICATION_FLAGS"
      ],
      "returns": "Windows.Win32.System.Power.HPOWERNOTIFY",
      "setLastError": false
    },
    "UnregisterPowerSettingNotification": {
      "args": [
        "Windows.Win32.System.Power.HPOWERNOTIFY"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterSuspendResumeNotification": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.UI.WindowsAndMessaging.REGISTER_NOTIFICATION_FLAGS"
      ],
      "returns": "Windows.Win32.System.Power.HPOWERNOTIFY",
      "setLastError": false
    },
    "UnregisterSuspendResumeNotification": {
      "args": [
        "Windows.Win32.System.Power.HPOWERNOTIFY"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ExitWindowsEx": {
      "args": [
        "Windows.Win32.System.Shutdown.EXIT_WINDOWS_FLAGS",
        "Windows.Win32.System.Shutdown.SHUTDOWN_REASON"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LockWorkStation": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ShutdownBlockReasonCreate": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ShutdownBlockReasonQuery": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ShutdownBlockReasonDestroy": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SendIMEMessageExA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "SendIMEMessageExW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "IMPGetIMEA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.System.WindowsProgramming.IMEPROA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IMPGetIMEW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.System.WindowsProgramming.IMEPROW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IMPQueryIMEA": {
      "args": [
        "Windows.Win32.System.WindowsProgramming.IMEPROA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IMPQueryIMEW": {
      "args": [
        "Windows.Win32.System.WindowsProgramming.IMEPROW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IMPSetIMEA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.System.WindowsProgramming.IMEPROA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IMPSetIMEW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.System.WindowsProgramming.IMEPROW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WINNLSGetIMEHotkey": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "WINNLSEnableIME": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WINNLSGetEnableStatus": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterPointerInputTarget": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.POINTER_INPUT_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnregisterPointerInputTarget": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.POINTER_INPUT_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterPointerInputTargetEx": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.POINTER_INPUT_TYPE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnregisterPointerInputTargetEx": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.POINTER_INPUT_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "NotifyWinEvent": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HWND",
        "i32",
        "i32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetWinEventHook": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.UI.Accessibility.WINEVENTPROC",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.UI.Accessibility.HWINEVENTHOOK",
      "setLastError": false
    },
    "IsWinEventHookInstalled": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnhookWinEvent": {
      "args": [
        "Windows.Win32.UI.Accessibility.HWINEVENTHOOK"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LoadKeyboardLayoutA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.Input.KeyboardAndMouse.ACTIVATE_KEYBOARD_LAYOUT_FLAGS"
      ],
      "returns": "Windows.Win32.UI.Input.KeyboardAndMouse.HKL",
      "setLastError": false
    },
    "LoadKeyboardLayoutW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.Input.KeyboardAndMouse.ACTIVATE_KEYBOARD_LAYOUT_FLAGS"
      ],
      "returns": "Windows.Win32.UI.Input.KeyboardAndMouse.HKL",
      "setLastError": false
    },
    "ActivateKeyboardLayout": {
      "args": [
        "Windows.Win32.UI.Input.KeyboardAndMouse.HKL",
        "Windows.Win32.UI.Input.KeyboardAndMouse.ACTIVATE_KEYBOARD_LAYOUT_FLAGS"
      ],
      "returns": "Windows.Win32.UI.Input.KeyboardAndMouse.HKL",
      "setLastError": false
    },
    "ToUnicodeEx": {
      "args": [
        "u32",
        "u32",
        "u8*",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.HKL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "UnloadKeyboardLayout": {
      "args": [
        "Windows.Win32.UI.Input.KeyboardAndMouse.HKL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetKeyboardLayoutNameA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetKeyboardLayoutNameW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetKeyboardLayoutList": {
      "args": [
        "i32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.HKL*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetKeyboardLayout": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.UI.Input.KeyboardAndMouse.HKL",
      "setLastError": false
    },
    "GetMouseMovePointsEx": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.MOUSEMOVEPOINT*",
        "Windows.Win32.UI.Input.KeyboardAndMouse.MOUSEMOVEPOINT*",
        "i32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.GET_MOUSE_MOVE_POINTS_EX_RESOLUTION"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "TrackMouseEvent": {
      "args": [
        "Windows.Win32.UI.Input.KeyboardAndMouse.TRACKMOUSEEVENT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterHotKey": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.HOT_KEY_MODIFIERS",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnregisterHotKey": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SwapMouseButton": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDoubleClickTime": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "SetDoubleClickTime": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetFocus": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetActiveWindow": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetFocus": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetKBCodePage": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetKeyState": {
      "args": [
        "i32"
      ],
      "returns": "i16",
      "setLastError": false
    },
    "GetAsyncKeyState": {
      "args": [
        "i32"
      ],
      "returns": "i16",
      "setLastError": false
    },
    "GetKeyboardState": {
      "args": [
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetKeyboardState": {
      "args": [
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetKeyNameTextA": {
      "args": [
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetKeyNameTextW": {
      "args": [
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetKeyboardType": {
      "args": [
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "ToAscii": {
      "args": [
        "u32",
        "u32",
        "u8*",
        "u16*",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "ToAsciiEx": {
      "args": [
        "u32",
        "u32",
        "u8*",
        "u16*",
        "u32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.HKL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "ToUnicode": {
      "args": [
        "u32",
        "u32",
        "u8*",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "OemKeyScan": {
      "args": [
        "u16"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "VkKeyScanA": {
      "args": [
        "Windows.Win32.Foundation.CHAR"
      ],
      "returns": "i16",
      "setLastError": false
    },
    "VkKeyScanW": {
      "args": [
        "u16"
      ],
      "returns": "i16",
      "setLastError": false
    },
    "VkKeyScanExA": {
      "args": [
        "Windows.Win32.Foundation.CHAR",
        "Windows.Win32.UI.Input.KeyboardAndMouse.HKL"
      ],
      "returns": "i16",
      "setLastError": false
    },
    "VkKeyScanExW": {
      "args": [
        "u16",
        "Windows.Win32.UI.Input.KeyboardAndMouse.HKL"
      ],
      "returns": "i16",
      "setLastError": false
    },
    "keybd_event": {
      "args": [
        "u8",
        "u8",
        "Windows.Win32.UI.Input.KeyboardAndMouse.KEYBD_EVENT_FLAGS",
        "usize"
      ],
      "returns": "void",
      "setLastError": false
    },
    "mouse_event": {
      "args": [
        "Windows.Win32.UI.Input.KeyboardAndMouse.MOUSE_EVENT_FLAGS",
        "i32",
        "i32",
        "i32",
        "usize"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SendInput": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.INPUT*",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetLastInputInfo": {
      "args": [
        "Windows.Win32.UI.Input.KeyboardAndMouse.LASTINPUTINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MapVirtualKeyA": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.MAP_VIRTUAL_KEY_TYPE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "MapVirtualKeyW": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.MAP_VIRTUAL_KEY_TYPE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "MapVirtualKeyExA": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.MAP_VIRTUAL_KEY_TYPE",
        "Windows.Win32.UI.Input.KeyboardAndMouse.HKL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "MapVirtualKeyExW": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.KeyboardAndMouse.MAP_VIRTUAL_KEY_TYPE",
        "Windows.Win32.UI.Input.KeyboardAndMouse.HKL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetCapture": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "SetCapture": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "ReleaseCapture": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnableWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsWindowEnabled": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DragDetect": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetActiveWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "BlockInput": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LoadStringA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LoadStringW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetWindowLongPtrA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_LONG_PTR_INDEX"
      ],
      "returns": "isize",
      "setLastError": false
    },
    "GetWindowLongPtrW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_LONG_PTR_INDEX"
      ],
      "returns": "isize",
      "setLastError": false
    },
    "SetWindowLongPtrA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_LONG_PTR_INDEX",
        "isize"
      ],
      "returns": "isize",
      "setLastError": false
    },
    "SetWindowLongPtrW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_LONG_PTR_INDEX",
        "isize"
      ],
      "returns": "isize",
      "setLastError": false
    },
    "GetClassLongPtrA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.GET_CLASS_LONG_INDEX"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "GetClassLongPtrW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.GET_CLASS_LONG_INDEX"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "SetClassLongPtrA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.GET_CLASS_LONG_INDEX",
        "isize"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "SetClassLongPtrW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.GET_CLASS_LONG_INDEX",
        "isize"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "wvsprintfA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "i8*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "wvsprintfW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i8*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "wsprintfA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "wsprintfW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "IsHungAppWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DisableProcessWindowsGhosting": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "RegisterWindowMessageA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RegisterWindowMessageW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetMessageA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSG*",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMessageW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSG*",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TranslateMessage": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSG*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DispatchMessageA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSG*"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "DispatchMessageW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSG*"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "SetMessageQueue": {
      "args": [
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PeekMessageA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSG*",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.PEEK_MESSAGE_REMOVE_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PeekMessageW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSG*",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.PEEK_MESSAGE_REMOVE_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMessagePos": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetMessageTime": {
      "args": [],
      "returns": "i32",
      "setLastError": false
    },
    "GetMessageExtraInfo": {
      "args": [],
      "returns": "Windows.Win32.Foundation.LPARAM",
      "setLastError": false
    },
    "IsWow64Message": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetMessageExtraInfo": {
      "args": [
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LPARAM",
      "setLastError": false
    },
    "SendMessageA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "SendMessageW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "SendMessageTimeoutA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM",
        "Windows.Win32.UI.WindowsAndMessaging.SEND_MESSAGE_TIMEOUT_FLAGS",
        "u32",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "SendMessageTimeoutW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM",
        "Windows.Win32.UI.WindowsAndMessaging.SEND_MESSAGE_TIMEOUT_FLAGS",
        "u32",
        "usize*"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "SendNotifyMessageA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SendNotifyMessageW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SendMessageCallbackA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM",
        "Windows.Win32.UI.WindowsAndMessaging.SENDASYNCPROC",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SendMessageCallbackW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM",
        "Windows.Win32.UI.WindowsAndMessaging.SENDASYNCPROC",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterDeviceNotificationA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "Windows.Win32.UI.WindowsAndMessaging.REGISTER_NOTIFICATION_FLAGS"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HDEVNOTIFY",
      "setLastError": false
    },
    "RegisterDeviceNotificationW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "void*",
        "Windows.Win32.UI.WindowsAndMessaging.REGISTER_NOTIFICATION_FLAGS"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HDEVNOTIFY",
      "setLastError": false
    },
    "UnregisterDeviceNotification": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HDEVNOTIFY"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PostMessageA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PostMessageW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PostThreadMessageA": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PostThreadMessageW": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReplyMessage": {
      "args": [
        "Windows.Win32.Foundation.LRESULT"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WaitMessage": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DefWindowProcA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "DefWindowProcW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "PostQuitMessage": {
      "args": [
        "i32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CallWindowProcA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WNDPROC",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "CallWindowProcW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WNDPROC",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "InSendMessage": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InSendMessageEx": {
      "args": [
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RegisterClassA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WNDCLASSA*"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "RegisterClassW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WNDCLASSW*"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "UnregisterClassA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HINSTANCE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnregisterClassW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HINSTANCE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetClassInfoA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.WindowsAndMessaging.WNDCLASSA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetClassInfoW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.WindowsAndMessaging.WNDCLASSW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterClassExA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WNDCLASSEXA*"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "RegisterClassExW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WNDCLASSEXW*"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GetClassInfoExA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.WindowsAndMessaging.WNDCLASSEXA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetClassInfoExW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.WindowsAndMessaging.WNDCLASSEXW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateWindowExA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_EX_STYLE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_STYLE",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.Foundation.HINSTANCE",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "CreateWindowExW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_EX_STYLE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_STYLE",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.Foundation.HINSTANCE",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "IsWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsMenu": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsChild": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DestroyWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ShowWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.SHOW_WINDOW_CMD"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AnimateWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.ANIMATE_WINDOW_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UpdateLayeredWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "Windows.Win32.Foundation.SIZE*",
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "Windows.Win32.Foundation.COLORREF",
        "Windows.Win32.Graphics.Gdi.BLENDFUNCTION*",
        "Windows.Win32.UI.WindowsAndMessaging.UPDATE_LAYERED_WINDOW_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UpdateLayeredWindowIndirect": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.UPDATELAYEREDWINDOWINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetLayeredWindowAttributes": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.COLORREF*",
        "u8*",
        "Windows.Win32.UI.WindowsAndMessaging.LAYERED_WINDOW_ATTRIBUTES_FLAGS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetLayeredWindowAttributes": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.COLORREF",
        "u8",
        "Windows.Win32.UI.WindowsAndMessaging.LAYERED_WINDOW_ATTRIBUTES_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ShowWindowAsync": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.SHOW_WINDOW_CMD"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FlashWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FlashWindowEx": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.FLASHWINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ShowOwnedPopups": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OpenIcon": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MoveWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWindowPos": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.SET_WINDOW_POS_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWindowPlacement": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOWPLACEMENT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWindowPlacement": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOWPLACEMENT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWindowDisplayAffinity": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWindowDisplayAffinity": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_DISPLAY_AFFINITY"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BeginDeferWindowPos": {
      "args": [
        "i32"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HDWP",
      "setLastError": false
    },
    "DeferWindowPos": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HDWP",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.SET_WINDOW_POS_FLAGS"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HDWP",
      "setLastError": false
    },
    "EndDeferWindowPos": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HDWP"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsWindowVisible": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsIconic": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AnyPopup": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BringWindowToTop": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsZoomed": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateDialogParamA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.DLGPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "CreateDialogParamW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.DLGPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "CreateDialogIndirectParamA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.UI.WindowsAndMessaging.DLGTEMPLATE*",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.DLGPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "CreateDialogIndirectParamW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.UI.WindowsAndMessaging.DLGTEMPLATE*",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.DLGPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "DialogBoxParamA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.DLGPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "isize",
      "setLastError": false
    },
    "DialogBoxParamW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.DLGPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "isize",
      "setLastError": false
    },
    "DialogBoxIndirectParamA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.UI.WindowsAndMessaging.DLGTEMPLATE*",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.DLGPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "isize",
      "setLastError": false
    },
    "DialogBoxIndirectParamW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.UI.WindowsAndMessaging.DLGTEMPLATE*",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.DLGPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "isize",
      "setLastError": false
    },
    "EndDialog": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDlgItem": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "SetDlgItemInt": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "u32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDlgItemInt": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetDlgItemTextA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDlgItemTextW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDlgItemTextA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetDlgItemTextW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SendDlgItemMessageA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "SendDlgItemMessageW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "GetNextDlgGroupItem": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetNextDlgTabItem": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetDlgCtrlID": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetDialogBaseUnits": {
      "args": [],
      "returns": "i32",
      "setLastError": false
    },
    "DefDlgProcA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "DefDlgProcW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "CallMsgFilterA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSG*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CallMsgFilterW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSG*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CharToOemA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CharToOemW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OemToCharA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OemToCharW": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CharToOemBuffA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CharToOemBuffW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OemToCharBuffA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OemToCharBuffW": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CharUpperA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "CharUpperW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "CharUpperBuffA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CharUpperBuffW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CharLowerA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "CharLowerW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "CharLowerBuffA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CharLowerBuffW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CharNextA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "CharNextW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "CharPrevA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "CharPrevW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "CharNextExA": {
      "args": [
        "u16",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "CharPrevExA": {
      "args": [
        "u16",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "IsCharAlphaA": {
      "args": [
        "Windows.Win32.Foundation.CHAR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsCharAlphaW": {
      "args": [
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsCharAlphaNumericA": {
      "args": [
        "Windows.Win32.Foundation.CHAR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsCharAlphaNumericW": {
      "args": [
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsCharUpperA": {
      "args": [
        "Windows.Win32.Foundation.CHAR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsCharUpperW": {
      "args": [
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsCharLowerA": {
      "args": [
        "Windows.Win32.Foundation.CHAR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsCharLowerW": {
      "args": [
        "u16"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetInputState": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetQueueStatus": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.QUEUE_STATUS_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "MsgWaitForMultipleObjects": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.Foundation.BOOL",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.QUEUE_STATUS_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.WAIT_EVENT",
      "setLastError": false
    },
    "MsgWaitForMultipleObjectsEx": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.HANDLE*",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.QUEUE_STATUS_FLAGS",
        "Windows.Win32.UI.WindowsAndMessaging.MSG_WAIT_FOR_MULTIPLE_OBJECTS_EX_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.WAIT_EVENT",
      "setLastError": false
    },
    "SetTimer": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "usize",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.TIMERPROC"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "SetCoalescableTimer": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "usize",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.TIMERPROC",
        "u32"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "KillTimer": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsWindowUnicode": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LoadAcceleratorsA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HACCEL",
      "setLastError": false
    },
    "LoadAcceleratorsW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HACCEL",
      "setLastError": false
    },
    "CreateAcceleratorTableA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.ACCEL*",
        "i32"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HACCEL",
      "setLastError": false
    },
    "CreateAcceleratorTableW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.ACCEL*",
        "i32"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HACCEL",
      "setLastError": false
    },
    "DestroyAcceleratorTable": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CopyAcceleratorTableA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL",
        "Windows.Win32.UI.WindowsAndMessaging.ACCEL*",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "CopyAcceleratorTableW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL",
        "Windows.Win32.UI.WindowsAndMessaging.ACCEL*",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "TranslateAcceleratorA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL",
        "Windows.Win32.UI.WindowsAndMessaging.MSG*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "TranslateAcceleratorW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.HACCEL",
        "Windows.Win32.UI.WindowsAndMessaging.MSG*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetSystemMetrics": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.SYSTEM_METRICS_INDEX"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LoadMenuA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HMENU",
      "setLastError": false
    },
    "LoadMenuW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HMENU",
      "setLastError": false
    },
    "LoadMenuIndirectA": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HMENU",
      "setLastError": false
    },
    "LoadMenuIndirectW": {
      "args": [
        "void*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HMENU",
      "setLastError": false
    },
    "GetMenu": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HMENU",
      "setLastError": false
    },
    "SetMenu": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChangeMenuA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChangeMenuW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "HiliteMenuItem": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMenuStringA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetMenuStringW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetMenuState": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DrawMenuBar": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSystemMenu": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HMENU",
      "setLastError": false
    },
    "CreateMenu": {
      "args": [],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HMENU",
      "setLastError": false
    },
    "CreatePopupMenu": {
      "args": [],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HMENU",
      "setLastError": false
    },
    "DestroyMenu": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CheckMenuItem": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EnableMenuItem": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetSubMenu": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "i32"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HMENU",
      "setLastError": false
    },
    "GetMenuItemID": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetMenuItemCount": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "InsertMenuA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS",
        "usize",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InsertMenuW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS",
        "usize",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AppendMenuA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS",
        "usize",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AppendMenuW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS",
        "usize",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ModifyMenuA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS",
        "usize",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ModifyMenuW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS",
        "usize",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RemoveMenu": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteMenu": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetMenuItemBitmaps": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.MENU_ITEM_FLAGS",
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "Windows.Win32.Graphics.Gdi.HBITMAP"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMenuCheckMarkDimensions": {
      "args": [],
      "returns": "i32",
      "setLastError": false
    },
    "TrackPopupMenu": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.UI.WindowsAndMessaging.TRACK_POPUP_MENU_FLAGS",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TrackPopupMenuEx": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "i32",
        "i32",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.TPMPARAMS*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CalculatePopupWindowPosition": {
      "args": [
        "Windows.Win32.Foundation.POINT*",
        "Windows.Win32.Foundation.SIZE*",
        "u32",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMenuInfo": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.UI.WindowsAndMessaging.MENUINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetMenuInfo": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.UI.WindowsAndMessaging.MENUINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EndMenu": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InsertMenuItemA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.UI.WindowsAndMessaging.MENUITEMINFOA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InsertMenuItemW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.UI.WindowsAndMessaging.MENUITEMINFOW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMenuItemInfoA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.UI.WindowsAndMessaging.MENUITEMINFOA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMenuItemInfoW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.UI.WindowsAndMessaging.MENUITEMINFOW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetMenuItemInfoA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.UI.WindowsAndMessaging.MENUITEMINFOA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetMenuItemInfoW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.UI.WindowsAndMessaging.MENUITEMINFOW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMenuDefaultItem": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.GET_MENU_DEFAULT_ITEM_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetMenuDefaultItem": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMenuItemRect": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MenuItemFromPoint": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.Foundation.POINT"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DragObject": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "usize",
        "Windows.Win32.UI.WindowsAndMessaging.HCURSOR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DrawIcon": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetForegroundWindow": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "SwitchToThisWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetForegroundWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AllowSetForegroundWindow": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LockSetForegroundWindow": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.FOREGROUND_WINDOW_LOCK_CODE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ScrollWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "i32",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ScrollDC": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ScrollWindowEx": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "i32",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLL_WINDOW_FLAGS"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetScrollPos": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLLBAR_CONSTANTS"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetScrollRange": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLLBAR_CONSTANTS",
        "i32*",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetPropA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetPropW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPropA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GetPropW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "RemovePropA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "RemovePropW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "EnumPropsExA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.PROPENUMPROCEXA",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumPropsExW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.PROPENUMPROCEXW",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumPropsA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.PROPENUMPROCA"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumPropsW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.PROPENUMPROCW"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetWindowTextA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWindowTextW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWindowTextA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetWindowTextW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetWindowTextLengthA": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetWindowTextLengthW": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetClientRect": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWindowRect": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AdjustWindowRect": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_STYLE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AdjustWindowRectEx": {
      "args": [
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_STYLE",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_EX_STYLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MessageBoxA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_STYLE"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_RESULT",
      "setLastError": false
    },
    "MessageBoxW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_STYLE"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_RESULT",
      "setLastError": false
    },
    "MessageBoxExA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_STYLE",
        "u16"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_RESULT",
      "setLastError": false
    },
    "MessageBoxExW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_STYLE",
        "u16"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_RESULT",
      "setLastError": false
    },
    "MessageBoxIndirectA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSGBOXPARAMSA*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_RESULT",
      "setLastError": false
    },
    "MessageBoxIndirectW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.MSGBOXPARAMSW*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.MESSAGEBOX_RESULT",
      "setLastError": false
    },
    "ShowCursor": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetCursorPos": {
      "args": [
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetPhysicalCursorPos": {
      "args": [
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCursor": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HCURSOR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HCURSOR",
      "setLastError": false
    },
    "GetCursorPos": {
      "args": [
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPhysicalCursorPos": {
      "args": [
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetClipCursor": {
      "args": [
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCursor": {
      "args": [],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HCURSOR",
      "setLastError": false
    },
    "CreateCaret": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCaretBlinkTime": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "SetCaretBlinkTime": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DestroyCaret": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "HideCaret": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ShowCaret": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetCaretPos": {
      "args": [
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCaretPos": {
      "args": [
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LogicalToPhysicalPoint": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PhysicalToLogicalPoint": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WindowFromPoint": {
      "args": [
        "Windows.Win32.Foundation.POINT"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "WindowFromPhysicalPoint": {
      "args": [
        "Windows.Win32.Foundation.POINT"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "ChildWindowFromPoint": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "ClipCursor": {
      "args": [
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChildWindowFromPointEx": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT",
        "Windows.Win32.UI.WindowsAndMessaging.CWP_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetWindowWord": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "SetWindowWord": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "u16"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GetWindowLongA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_LONG_PTR_INDEX"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetWindowLongW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_LONG_PTR_INDEX"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetWindowLongA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_LONG_PTR_INDEX",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetWindowLongW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_LONG_PTR_INDEX",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetClassWord": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "SetClassWord": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "u16"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "GetClassLongA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.GET_CLASS_LONG_INDEX"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetClassLongW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.GET_CLASS_LONG_INDEX"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetClassLongA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.GET_CLASS_LONG_INDEX",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetClassLongW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.GET_CLASS_LONG_INDEX",
        "i32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetProcessDefaultLayout": {
      "args": [
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessDefaultLayout": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDesktopWindow": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetParent": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "SetParent": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "EnumChildWindows": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WNDENUMPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FindWindowA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "FindWindowW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "FindWindowExA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "FindWindowExW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetShellWindow": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "RegisterShellHookWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeregisterShellHookWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumWindows": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WNDENUMPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumThreadWindows": {
      "args": [
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.WNDENUMPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetClassNameA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetClassNameW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetTopWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetWindowThreadProcessId": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "IsGUIThread": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetLastActivePopup": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "GetWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.GET_WINDOW_CMD"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "SetWindowsHookA": {
      "args": [
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.HOOKPROC"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HHOOK",
      "setLastError": false
    },
    "SetWindowsHookW": {
      "args": [
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.HOOKPROC"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HHOOK",
      "setLastError": false
    },
    "UnhookWindowsHook": {
      "args": [
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.HOOKPROC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWindowsHookExA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WINDOWS_HOOK_ID",
        "Windows.Win32.UI.WindowsAndMessaging.HOOKPROC",
        "Windows.Win32.Foundation.HINSTANCE",
        "u32"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HHOOK",
      "setLastError": false
    },
    "SetWindowsHookExW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.WINDOWS_HOOK_ID",
        "Windows.Win32.UI.WindowsAndMessaging.HOOKPROC",
        "Windows.Win32.Foundation.HINSTANCE",
        "u32"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HHOOK",
      "setLastError": false
    },
    "UnhookWindowsHookEx": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HHOOK"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CallNextHookEx": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HHOOK",
        "i32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "CheckMenuRadioItem": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LoadCursorA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HCURSOR",
      "setLastError": false
    },
    "LoadCursorW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HCURSOR",
      "setLastError": false
    },
    "LoadCursorFromFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HCURSOR",
      "setLastError": false
    },
    "LoadCursorFromFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HCURSOR",
      "setLastError": false
    },
    "CreateCursor": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "i32",
        "i32",
        "i32",
        "i32",
        "void*",
        "void*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HCURSOR",
      "setLastError": false
    },
    "DestroyCursor": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HCURSOR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetSystemCursor": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HCURSOR",
        "Windows.Win32.UI.WindowsAndMessaging.SYSTEM_CURSOR_ID"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LoadIconA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "LoadIconW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "PrivateExtractIconsA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "u32*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PrivateExtractIconsW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "u32*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateIcon": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "i32",
        "i32",
        "u8",
        "u8",
        "u8*",
        "u8*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "DestroyIcon": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HICON"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LookupIconIdFromDirectory": {
      "args": [
        "u8*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "LookupIconIdFromDirectoryEx": {
      "args": [
        "u8*",
        "Windows.Win32.Foundation.BOOL",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.IMAGE_FLAGS"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "CreateIconFromResource": {
      "args": [
        "u8*",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "u32"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "CreateIconFromResourceEx": {
      "args": [
        "u8*",
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "u32",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.IMAGE_FLAGS"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "LoadImageA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.WindowsAndMessaging.GDI_IMAGE_TYPE",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.IMAGE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "LoadImageW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.WindowsAndMessaging.GDI_IMAGE_TYPE",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.IMAGE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CopyImage": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.UI.WindowsAndMessaging.GDI_IMAGE_TYPE",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.IMAGE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "DrawIconEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON",
        "i32",
        "i32",
        "u32",
        "Windows.Win32.Graphics.Gdi.HBRUSH",
        "Windows.Win32.UI.WindowsAndMessaging.DI_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateIconIndirect": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.ICONINFO*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "CopyIcon": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HICON"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "GetIconInfo": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HICON",
        "Windows.Win32.UI.WindowsAndMessaging.ICONINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetIconInfoExA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HICON",
        "Windows.Win32.UI.WindowsAndMessaging.ICONINFOEXA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetIconInfoExW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HICON",
        "Windows.Win32.UI.WindowsAndMessaging.ICONINFOEXW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsDialogMessageA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.MSG*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsDialogMessageW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.MSG*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MapDialogRect": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetScrollInfo": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLLBAR_CONSTANTS",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLLINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DefFrameProcA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "DefFrameProcW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "DefMDIChildProcA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "DefMDIChildProcW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "TranslateMDISysAccel": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.MSG*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ArrangeIconicWindows": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateMDIWindowA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_STYLE",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "CreateMDIWindowW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_STYLE",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "TileWindows": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.TILE_WINDOWS_HOW",
        "Windows.Win32.Foundation.RECT*",
        "u32",
        "Windows.Win32.Foundation.HWND*"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "CascadeWindows": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.CASCADE_WINDOWS_HOW",
        "Windows.Win32.Foundation.RECT*",
        "u32",
        "Windows.Win32.Foundation.HWND*"
      ],
      "returns": "u16",
      "setLastError": false
    },
    "SystemParametersInfoA": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.SYSTEM_PARAMETERS_INFO_ACTION",
        "u32",
        "void*",
        "Windows.Win32.UI.WindowsAndMessaging.SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SystemParametersInfoW": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.SYSTEM_PARAMETERS_INFO_ACTION",
        "u32",
        "void*",
        "Windows.Win32.UI.WindowsAndMessaging.SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SoundSentry": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDebugErrorLevel": {
      "args": [
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "InternalGetWindowText": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "CancelShutdown": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetGUIThreadInfo": {
      "args": [
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.GUITHREADINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessDPIAware": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsProcessDPIAware": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InheritWindowMonitor": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWindowModuleFileNameA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetWindowModuleFileNameW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetCursorInfo": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.CURSORINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWindowInfo": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOWINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTitleBarInfo": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.TITLEBARINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetMenuBarInfo": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.OBJECT_IDENTIFIER",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.MENUBARINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetScrollBarInfo": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.OBJECT_IDENTIFIER",
        "Windows.Win32.UI.WindowsAndMessaging.SCROLLBARINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetAncestor": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.GET_ANCESTOR_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "RealChildWindowFromPoint": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT"
      ],
      "returns": "Windows.Win32.Foundation.HWND",
      "setLastError": false
    },
    "RealGetWindowClassA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RealGetWindowClassW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetAltTabInfoA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.ALTTABINFO*",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetAltTabInfoW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.ALTTABINFO*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChangeWindowMessageFilter": {
      "args": [
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.CHANGE_WINDOW_MESSAGE_FILTER_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChangeWindowMessageFilterEx": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_MESSAGE_FILTER_ACTION",
        "Windows.Win32.UI.WindowsAndMessaging.CHANGEFILTERSTRUCT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertToInterceptWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsInterceptWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ApplyWindowAction": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.WINDOW_ACTION*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetAdditionalForegroundBoostProcesses": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterForTooltipDismissNotification": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.WindowsAndMessaging.TOOLTIP_DISMISS_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ConvertPrimaryPointerToMouseDrag": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsWindowArranged": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCurrentMonitorTopologyId": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "RegisterCloakedNotification": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnterMoveSizeLoop": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT",
        "Windows.Win32.UI.WindowsAndMessaging.MOVESIZE_OPERATION"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UserHandleGrantAccess": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTouchInputInfo": {
      "args": [
        "Windows.Win32.UI.Input.Touch.HTOUCHINPUT",
        "u32",
        "Windows.Win32.UI.Input.Touch.TOUCHINPUT*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseTouchInputHandle": {
      "args": [
        "Windows.Win32.UI.Input.Touch.HTOUCHINPUT"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RegisterTouchWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.Input.Touch.REGISTER_TOUCH_WINDOW_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnregisterTouchWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsTouchWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetGestureInfo": {
      "args": [
        "Windows.Win32.UI.Input.Touch.HGESTUREINFO",
        "Windows.Win32.UI.Input.Touch.GESTUREINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetGestureExtraArgs": {
      "args": [
        "Windows.Win32.UI.Input.Touch.HGESTUREINFO",
        "u32",
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseGestureInfoHandle": {
      "args": [
        "Windows.Win32.UI.Input.Touch.HGESTUREINFO"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetGestureConfig": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "u32",
        "Windows.Win32.UI.Input.Touch.GESTURECONFIG*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetGestureConfig": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "u32",
        "u32*",
        "Windows.Win32.UI.Input.Touch.GESTURECONFIG*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateDesktopA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEA*",
        "Windows.Win32.System.StationsAndDesktops.DESKTOP_CONTROL_FLAGS",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HDESK",
      "setLastError": false
    },
    "CreateDesktopW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEW*",
        "Windows.Win32.System.StationsAndDesktops.DESKTOP_CONTROL_FLAGS",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HDESK",
      "setLastError": false
    },
    "CreateDesktopExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEA*",
        "Windows.Win32.System.StationsAndDesktops.DESKTOP_CONTROL_FLAGS",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HDESK",
      "setLastError": false
    },
    "CreateDesktopExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEW*",
        "Windows.Win32.System.StationsAndDesktops.DESKTOP_CONTROL_FLAGS",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HDESK",
      "setLastError": false
    },
    "OpenDesktopA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.System.StationsAndDesktops.DESKTOP_CONTROL_FLAGS",
        "Windows.Win32.Foundation.BOOL",
        "u32"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HDESK",
      "setLastError": false
    },
    "OpenDesktopW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.StationsAndDesktops.DESKTOP_CONTROL_FLAGS",
        "Windows.Win32.Foundation.BOOL",
        "u32"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HDESK",
      "setLastError": false
    },
    "OpenInputDesktop": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.DESKTOP_CONTROL_FLAGS",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.System.StationsAndDesktops.DESKTOP_ACCESS_FLAGS"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HDESK",
      "setLastError": false
    },
    "EnumDesktopsA": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.HWINSTA",
        "Windows.Win32.System.StationsAndDesktops.DESKTOPENUMPROCA",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDesktopsW": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.HWINSTA",
        "Windows.Win32.System.StationsAndDesktops.DESKTOPENUMPROCW",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumDesktopWindows": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.HDESK",
        "Windows.Win32.UI.WindowsAndMessaging.WNDENUMPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SwitchDesktop": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.HDESK"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetThreadDesktop": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.HDESK"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseDesktop": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.HDESK"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetThreadDesktop": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HDESK",
      "setLastError": false
    },
    "CreateWindowStationA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HWINSTA",
      "setLastError": false
    },
    "CreateWindowStationW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HWINSTA",
      "setLastError": false
    },
    "OpenWindowStationA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.BOOL",
        "u32"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HWINSTA",
      "setLastError": false
    },
    "OpenWindowStationW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL",
        "u32"
      ],
      "returns": "Windows.Win32.System.StationsAndDesktops.HWINSTA",
      "setLastError": false
    },
    "EnumWindowStationsA": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.WINSTAENUMPROCA",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumWindowStationsW": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.WINSTAENUMPROCW",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseWindowStation": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.HWINSTA"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetProcessWindowStation": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.HWINSTA"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetProcessWindowStation": {
      "args": [],
      "returns": "Windows.Win32.System.StationsAndDesktops.HWINSTA",
      "setLastError": false
    },
    "GetUserObjectInformationA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.StationsAndDesktops.USER_OBJECT_INFORMATION_INDEX",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetUserObjectInformationW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.StationsAndDesktops.USER_OBJECT_INFORMATION_INDEX",
        "void*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetUserObjectInformationA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "i32",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetUserObjectInformationW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "i32",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BroadcastSystemMessageExA": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.BROADCAST_SYSTEM_MESSAGE_FLAGS",
        "Windows.Win32.System.StationsAndDesktops.BROADCAST_SYSTEM_MESSAGE_INFO*",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM",
        "Windows.Win32.System.StationsAndDesktops.BSMINFO*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "BroadcastSystemMessageExW": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.BROADCAST_SYSTEM_MESSAGE_FLAGS",
        "Windows.Win32.System.StationsAndDesktops.BROADCAST_SYSTEM_MESSAGE_INFO*",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM",
        "Windows.Win32.System.StationsAndDesktops.BSMINFO*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "BroadcastSystemMessageA": {
      "args": [
        "u32",
        "u32*",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "BroadcastSystemMessageW": {
      "args": [
        "Windows.Win32.System.StationsAndDesktops.BROADCAST_SYSTEM_MESSAGE_FLAGS",
        "Windows.Win32.System.StationsAndDesktops.BROADCAST_SYSTEM_MESSAGE_INFO*",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetUnpredictedMessagePos": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "InitializeTouchInjection": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.Pointer.TOUCH_FEEDBACK_MODE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InjectTouchInput": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.Pointer.POINTER_TOUCH_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerType": {
      "args": [
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.POINTER_INPUT_TYPE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerCursorId": {
      "args": [
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerInfo": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.Pointer.POINTER_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerInfoHistory": {
      "args": [
        "u32",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerFrameInfo": {
      "args": [
        "u32",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerFrameInfoHistory": {
      "args": [
        "u32",
        "u32*",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerTouchInfo": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.Pointer.POINTER_TOUCH_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerTouchInfoHistory": {
      "args": [
        "u32",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_TOUCH_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerFrameTouchInfo": {
      "args": [
        "u32",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_TOUCH_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerFrameTouchInfoHistory": {
      "args": [
        "u32",
        "u32*",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_TOUCH_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerPenInfo": {
      "args": [
        "u32",
        "Windows.Win32.UI.Input.Pointer.POINTER_PEN_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerPenInfoHistory": {
      "args": [
        "u32",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_PEN_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerFramePenInfo": {
      "args": [
        "u32",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_PEN_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerFramePenInfoHistory": {
      "args": [
        "u32",
        "u32*",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_PEN_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SkipPointerFrameMessages": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "InjectSyntheticPointerInput": {
      "args": [
        "Windows.Win32.UI.Input.Pointer.HSYNTHETICPOINTERDEVICE",
        "Windows.Win32.UI.Input.Pointer.POINTER_TYPE_INFO*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DestroySyntheticPointerDevice": {
      "args": [
        "Windows.Win32.UI.Input.Pointer.HSYNTHETICPOINTERDEVICE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EnableMouseInPointer": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsMouseInPointerEnabled": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerInputTransform": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.UI.Input.Pointer.INPUT_TRANSFORM*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerDevices": {
      "args": [
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_DEVICE_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerDevice": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.UI.Input.Pointer.POINTER_DEVICE_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerDeviceProperties": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_DEVICE_PROPERTY*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerDeviceRects": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPointerDeviceCursors": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32*",
        "Windows.Win32.UI.Input.Pointer.POINTER_DEVICE_CURSOR_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetRawPointerDeviceData": {
      "args": [
        "u32",
        "u32",
        "u32",
        "Windows.Win32.UI.Input.Pointer.POINTER_DEVICE_PROPERTY*",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetRawInputData": {
      "args": [
        "Windows.Win32.UI.Input.HRAWINPUT",
        "Windows.Win32.UI.Input.RAW_INPUT_DATA_COMMAND_FLAGS",
        "void*",
        "u32*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetRawInputDeviceInfoA": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.UI.Input.RAW_INPUT_DEVICE_INFO_COMMAND",
        "void*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetRawInputDeviceInfoW": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.UI.Input.RAW_INPUT_DEVICE_INFO_COMMAND",
        "void*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetRawInputBuffer": {
      "args": [
        "Windows.Win32.UI.Input.RAWINPUT*",
        "u32*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RegisterRawInputDevices": {
      "args": [
        "Windows.Win32.UI.Input.RAWINPUTDEVICE*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetRegisteredRawInputDevices": {
      "args": [
        "Windows.Win32.UI.Input.RAWINPUTDEVICE*",
        "u32*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetRawInputDeviceList": {
      "args": [
        "Windows.Win32.UI.Input.RAWINPUTDEVICELIST*",
        "u32*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DefRawInputProc": {
      "args": [
        "Windows.Win32.UI.Input.RAWINPUT**",
        "i32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "GetCurrentInputMessageSource": {
      "args": [
        "Windows.Win32.UI.Input.INPUT_MESSAGE_SOURCE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCIMSSM": {
      "args": [
        "Windows.Win32.UI.Input.INPUT_MESSAGE_SOURCE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    }
  }
};
export declare function open(): { "user32.dll": user32Library };
