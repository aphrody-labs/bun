import { dlopen, FFIType } from "bun:ffi";

export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export const structs = {
  "D3D11_BUFFER_DESC": {
    "size": 24,
    "fields": [
      {
        "name": "ByteWidth",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "Usage",
        "offset": 4,
        "type": "Windows.Win32.Graphics.Direct3D11.D3D11_USAGE"
      },
      {
        "name": "BindFlags",
        "offset": 8,
        "type": "u32"
      },
      {
        "name": "CPUAccessFlags",
        "offset": 12,
        "type": "u32"
      },
      {
        "name": "MiscFlags",
        "offset": 16,
        "type": "u32"
      },
      {
        "name": "StructureByteStride",
        "offset": 20,
        "type": "u32"
      }
    ]
  },
  "DXGI_SWAP_CHAIN_DESC": {
    "size": 48,
    "fields": [
      {
        "name": "BufferDesc",
        "offset": 0,
        "type": "Windows.Win32.Graphics.Dxgi.Common.DXGI_MODE_DESC"
      },
      {
        "name": "SampleDesc",
        "offset": 8,
        "type": "Windows.Win32.Graphics.Dxgi.Common.DXGI_SAMPLE_DESC"
      },
      {
        "name": "BufferUsage",
        "offset": 16,
        "type": "Windows.Win32.Graphics.Dxgi.DXGI_USAGE"
      },
      {
        "name": "BufferCount",
        "offset": 20,
        "type": "u32"
      },
      {
        "name": "OutputWindow",
        "offset": 24,
        "type": "Windows.Win32.Foundation.HWND"
      },
      {
        "name": "Windowed",
        "offset": 32,
        "type": "Windows.Win32.Foundation.BOOL"
      },
      {
        "name": "SwapEffect",
        "offset": 36,
        "type": "Windows.Win32.Graphics.Dxgi.DXGI_SWAP_EFFECT"
      },
      {
        "name": "Flags",
        "offset": 40,
        "type": "u32"
      }
    ]
  }
} as const;
export const enums = {
  "DXGI_USAGE": {
    "DXGI_USAGE_SHADER_INPUT": 16,
    "DXGI_USAGE_RENDER_TARGET_OUTPUT": 32,
    "DXGI_USAGE_BACK_BUFFER": 64,
    "DXGI_USAGE_SHARED": 128,
    "DXGI_USAGE_READ_ONLY": 256,
    "DXGI_USAGE_DISCARD_ON_PRESENT": 512,
    "DXGI_USAGE_UNORDERED_ACCESS": 1024
  },
  "DXGI_CREATE_FACTORY_FLAGS": {
    "DXGI_CREATE_FACTORY_DEBUG": 1
  },
  "D3D11_USAGE": {
    "D3D11_USAGE_DEFAULT": 0,
    "D3D11_USAGE_IMMUTABLE": 1,
    "D3D11_USAGE_DYNAMIC": 2,
    "D3D11_USAGE_STAGING": 3
  },
  "DXGI_SWAP_EFFECT": {
    "DXGI_SWAP_EFFECT_DISCARD": 0,
    "DXGI_SWAP_EFFECT_SEQUENTIAL": 1,
    "DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL": 3,
    "DXGI_SWAP_EFFECT_FLIP_DISCARD": 4
  }
} as const;
export const wideAliases = {} as const;
export const signatures = {
  "d3d11.dll": {
    "D3D11CreateDevice": {
      "args": [
        "Windows.Win32.Graphics.Dxgi.IDXGIAdapter",
        "Windows.Win32.Graphics.Direct3D.D3D_DRIVER_TYPE",
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Graphics.Direct3D11.D3D11_CREATE_DEVICE_FLAG",
        "Windows.Win32.Graphics.Direct3D.D3D_FEATURE_LEVEL*",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Direct3D11.ID3D11Device*",
        "Windows.Win32.Graphics.Direct3D.D3D_FEATURE_LEVEL*",
        "Windows.Win32.Graphics.Direct3D11.ID3D11DeviceContext*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "D3D11CreateDeviceAndSwapChain": {
      "args": [
        "Windows.Win32.Graphics.Dxgi.IDXGIAdapter",
        "Windows.Win32.Graphics.Direct3D.D3D_DRIVER_TYPE",
        "Windows.Win32.Foundation.HMODULE",
        "Windows.Win32.Graphics.Direct3D11.D3D11_CREATE_DEVICE_FLAG",
        "Windows.Win32.Graphics.Direct3D.D3D_FEATURE_LEVEL*",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Dxgi.DXGI_SWAP_CHAIN_DESC*",
        "Windows.Win32.Graphics.Dxgi.IDXGISwapChain*",
        "Windows.Win32.Graphics.Direct3D11.ID3D11Device*",
        "Windows.Win32.Graphics.Direct3D.D3D_FEATURE_LEVEL*",
        "Windows.Win32.Graphics.Direct3D11.ID3D11DeviceContext*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "D3D11On12CreateDevice": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "u32",
        "Windows.Win32.Graphics.Direct3D.D3D_FEATURE_LEVEL*",
        "u32",
        "Windows.Win32.System.Com.IUnknown*",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Direct3D11.ID3D11Device*",
        "Windows.Win32.Graphics.Direct3D11.ID3D11DeviceContext*",
        "Windows.Win32.Graphics.Direct3D.D3D_FEATURE_LEVEL*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateDirect3D11DeviceFromDXGIDevice": {
      "args": [
        "Windows.Win32.Graphics.Dxgi.IDXGIDevice",
        "Windows.Win32.System.WinRT.IInspectable*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateDirect3D11SurfaceFromDXGISurface": {
      "args": [
        "Windows.Win32.Graphics.Dxgi.IDXGISurface",
        "Windows.Win32.System.WinRT.IInspectable*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    }
  },
  "dxgi.dll": {
    "CreateDXGIFactory": {
      "args": [
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateDXGIFactory1": {
      "args": [
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CreateDXGIFactory2": {
      "args": [
        "Windows.Win32.Graphics.Dxgi.DXGI_CREATE_FACTORY_FLAGS",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DXGIGetDebugInterface1": {
      "args": [
        "u32",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DXGIDeclareAdapterRemovalSupport": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DXGIDisableVBlankVirtualization": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    }
  }
} as const;
const libraries = {
  "d3d11.dll": {
    "D3D11CreateDevice": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "D3D11CreateDeviceAndSwapChain": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
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
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "D3D11On12CreateDevice": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateDirect3D11DeviceFromDXGIDevice": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateDirect3D11SurfaceFromDXGISurface": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    }
  },
  "dxgi.dll": {
    "CreateDXGIFactory": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateDXGIFactory1": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CreateDXGIFactory2": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DXGIGetDebugInterface1": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DXGIDeclareAdapterRemovalSupport": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DXGIDisableVBlankVirtualization": {
      "args": [],
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
  return result as { "d3d11.dll": d3d11Library; "dxgi.dll": dxgiLibrary };
}
