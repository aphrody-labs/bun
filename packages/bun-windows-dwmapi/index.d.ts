export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export interface dwmapiSymbols {
    "DwmDefWindowProc": (...args: [Pointer, number, number, number, Pointer]) => number;
    "DwmEnableBlurBehindWindow": (...args: [Pointer, Pointer]) => number;
    "DwmEnableComposition": (...args: [number]) => number;
    "DwmEnableMMCSS": (...args: [number]) => number;
    "DwmExtendFrameIntoClientArea": (...args: [Pointer, Pointer]) => number;
    "DwmGetColorizationColor": (...args: [Pointer, Pointer]) => number;
    "DwmGetCompositionTimingInfo": (...args: [Pointer, Pointer]) => number;
    "DwmGetWindowAttribute": (...args: [Pointer, number, Pointer, number]) => number;
    "DwmIsCompositionEnabled": (...args: [Pointer]) => number;
    "DwmModifyPreviousDxFrameDuration": (...args: [Pointer, number, number]) => number;
    "DwmQueryThumbnailSourceSize": (...args: [number, Pointer]) => number;
    "DwmRegisterThumbnail": (...args: [Pointer, Pointer, Pointer]) => number;
    "DwmSetDxFrameDuration": (...args: [Pointer, number]) => number;
    "DwmSetPresentParameters": (...args: [Pointer, Pointer]) => number;
    "DwmSetWindowAttribute": (...args: [Pointer, number, Pointer, number]) => number;
    "DwmUnregisterThumbnail": (...args: [number]) => number;
    "DwmUpdateThumbnailProperties": (...args: [number, Pointer]) => number;
    "DwmSetIconicThumbnail": (...args: [Pointer, Pointer, number]) => number;
    "DwmSetIconicLivePreviewBitmap": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "DwmInvalidateIconicBitmaps": (...args: [Pointer]) => number;
    "DwmAttachMilContent": (...args: [Pointer]) => number;
    "DwmDetachMilContent": (...args: [Pointer]) => number;
    "DwmFlush": (...args: []) => number;
    "DwmGetGraphicsStreamTransformHint": (...args: [number, Pointer]) => number;
    "DwmGetGraphicsStreamClient": (...args: [number, Pointer]) => number;
    "DwmGetTransportAttributes": (...args: [Pointer, Pointer, Pointer]) => number;
    "DwmTransitionOwnedWindow": (...args: [Pointer, number]) => number;
    "DwmRenderGesture": (...args: [number, number, Pointer, Pointer]) => number;
    "DwmTetherContact": (...args: [number, number, Pointer]) => number;
    "DwmShowContact": (...args: [number, number]) => number;
    "DwmGetUnmetTabRequirements": (...args: [Pointer, Pointer]) => number;

}
export interface dwmapiLibrary { readonly symbols: dwmapiSymbols; close(): void; }
export declare const structs: {
  "DWM_BLURBEHIND": {
    "size": 24,
    "fields": [
      {
        "name": "dwFlags",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "fEnable",
        "offset": 4,
        "type": "Windows.Win32.Foundation.BOOL"
      },
      {
        "name": "hRgnBlur",
        "offset": 8,
        "type": "Windows.Win32.Graphics.Gdi.HRGN"
      },
      {
        "name": "fTransitionOnMaximized",
        "offset": 16,
        "type": "Windows.Win32.Foundation.BOOL"
      }
    ]
  }
};
export declare const enums: {
  "DWMTRANSITION_OWNEDWINDOW_TARGET": {
    "DWMTRANSITION_OWNEDWINDOW_NULL": -1,
    "DWMTRANSITION_OWNEDWINDOW_REPOSITION": 0
  },
  "GESTURE_TYPE": {
    "GT_PEN_TAP": 0,
    "GT_PEN_DOUBLETAP": 1,
    "GT_PEN_RIGHTTAP": 2,
    "GT_PEN_PRESSANDHOLD": 3,
    "GT_PEN_PRESSANDHOLDABORT": 4,
    "GT_TOUCH_TAP": 5,
    "GT_TOUCH_DOUBLETAP": 6,
    "GT_TOUCH_RIGHTTAP": 7,
    "GT_TOUCH_PRESSANDHOLD": 8,
    "GT_TOUCH_PRESSANDHOLDABORT": 9,
    "GT_TOUCH_PRESSANDTAP": 10
  },
  "DWM_SHOWCONTACT": {
    "DWMSC_DOWN": 1,
    "DWMSC_UP": 2,
    "DWMSC_DRAG": 4,
    "DWMSC_HOLD": 8,
    "DWMSC_PENBARREL": 16,
    "DWMSC_NONE": 0,
    "DWMSC_ALL": 4294967295
  },
  "DWM_TAB_WINDOW_REQUIREMENTS": {
    "DWMTWR_NONE": 0,
    "DWMTWR_IMPLEMENTED_BY_SYSTEM": 1,
    "DWMTWR_WINDOW_RELATIONSHIP": 2,
    "DWMTWR_WINDOW_STYLES": 4,
    "DWMTWR_WINDOW_REGION": 8,
    "DWMTWR_WINDOW_DWM_ATTRIBUTES": 16,
    "DWMTWR_WINDOW_MARGINS": 32,
    "DWMTWR_TABBING_ENABLED": 64,
    "DWMTWR_USER_POLICY": 128,
    "DWMTWR_GROUP_POLICY": 256,
    "DWMTWR_APP_COMPAT": 512
  }
};
export declare const wideAliases: {};
export declare const signatures: {
  "dwmapi.dll": {
    "DwmDefWindowProc": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.WPARAM",
        "Windows.Win32.Foundation.LPARAM",
        "Windows.Win32.Foundation.LRESULT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DwmEnableBlurBehindWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Dwm.DWM_BLURBEHIND*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmEnableComposition": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmEnableMMCSS": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmExtendFrameIntoClientArea": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.Controls.MARGINS*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmGetColorizationColor": {
      "args": [
        "u32*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmGetCompositionTimingInfo": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Dwm.DWM_TIMING_INFO*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmGetWindowAttribute": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmIsCompositionEnabled": {
      "args": [
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmModifyPreviousDxFrameDuration": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmQueryThumbnailSourceSize": {
      "args": [
        "isize",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmRegisterThumbnail": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.HWND",
        "isize*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmSetDxFrameDuration": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmSetPresentParameters": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Dwm.DWM_PRESENT_PARAMETERS*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmSetWindowAttribute": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmUnregisterThumbnail": {
      "args": [
        "isize"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmUpdateThumbnailProperties": {
      "args": [
        "isize",
        "Windows.Win32.Graphics.Dwm.DWM_THUMBNAIL_PROPERTIES*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmSetIconicThumbnail": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmSetIconicLivePreviewBitmap": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "Windows.Win32.Foundation.POINT*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmInvalidateIconicBitmaps": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmAttachMilContent": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmDetachMilContent": {
      "args": [
        "Windows.Win32.Foundation.HWND"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmFlush": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmGetGraphicsStreamTransformHint": {
      "args": [
        "u32",
        "Windows.Win32.Graphics.Dwm.MilMatrix3x2D*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmGetGraphicsStreamClient": {
      "args": [
        "u32",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmGetTransportAttributes": {
      "args": [
        "Windows.Win32.Foundation.BOOL*",
        "Windows.Win32.Foundation.BOOL*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmTransitionOwnedWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Dwm.DWMTRANSITION_OWNEDWINDOW_TARGET"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmRenderGesture": {
      "args": [
        "Windows.Win32.Graphics.Dwm.GESTURE_TYPE",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmTetherContact": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.POINT"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmShowContact": {
      "args": [
        "u32",
        "Windows.Win32.Graphics.Dwm.DWM_SHOWCONTACT"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DwmGetUnmetTabRequirements": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Graphics.Dwm.DWM_TAB_WINDOW_REQUIREMENTS*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    }
  }
};
export declare function open(): { "dwmapi.dll": dwmapiLibrary };
