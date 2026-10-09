import { dlopen, FFIType } from "bun:ffi";

export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export const structs = {
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
} as const;
export const enums = {
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
} as const;
export const wideAliases = {} as const;
export const signatures = {
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
} as const;
const libraries = {
  "dwmapi.dll": {
    "DwmDefWindowProc": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.usize",
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmEnableBlurBehindWindow": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmEnableComposition": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmEnableMMCSS": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmExtendFrameIntoClientArea": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmGetColorizationColor": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmGetCompositionTimingInfo": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmGetWindowAttribute": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmIsCompositionEnabled": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmModifyPreviousDxFrameDuration": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmQueryThumbnailSourceSize": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmRegisterThumbnail": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmSetDxFrameDuration": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmSetPresentParameters": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmSetWindowAttribute": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmUnregisterThumbnail": {
      "args": [
        "FFIType.isize"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmUpdateThumbnailProperties": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmSetIconicThumbnail": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmSetIconicLivePreviewBitmap": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmInvalidateIconicBitmaps": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmAttachMilContent": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmDetachMilContent": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmFlush": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmGetGraphicsStreamTransformHint": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmGetGraphicsStreamClient": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmGetTransportAttributes": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmTransitionOwnedWindow": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmRenderGesture": {
      "args": [
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmTetherContact": {
      "args": [
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmShowContact": {
      "args": [
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DwmGetUnmetTabRequirements": {
      "args": [
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
  return result as { "dwmapi.dll": dwmapiLibrary };
}
