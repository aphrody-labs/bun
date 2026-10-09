export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export interface d3d11Symbols {
    "D3D11CreateDevice": (...args: [Pointer, number, Pointer, number, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "D3D11CreateDeviceAndSwapChain": (...args: [Pointer, number, Pointer, number, Pointer, number, number, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "D3D11On12CreateDevice": (...args: [Pointer, number, Pointer, number, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "CreateDirect3D11DeviceFromDXGIDevice": (...args: [Pointer, Pointer]) => number;
    "CreateDirect3D11SurfaceFromDXGISurface": (...args: [Pointer, Pointer]) => number;

}
export interface d3d11Library { readonly symbols: d3d11Symbols; close(): void; }
export interface dxgiSymbols {
    "CreateDXGIFactory": (...args: [Pointer, Pointer]) => number;
    "CreateDXGIFactory1": (...args: [Pointer, Pointer]) => number;
    "CreateDXGIFactory2": (...args: [number, Pointer, Pointer]) => number;
    "DXGIGetDebugInterface1": (...args: [number, Pointer, Pointer]) => number;
    "DXGIDeclareAdapterRemovalSupport": (...args: []) => number;
    "DXGIDisableVBlankVirtualization": (...args: []) => number;

}
export interface dxgiLibrary { readonly symbols: dxgiSymbols; close(): void; }
export declare const structs: {
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
};
export declare const enums: {
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
};
export declare const wideAliases: {};
export declare const signatures: {
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
};
export declare function open(): { "d3d11.dll": d3d11Library; "dxgi.dll": dxgiLibrary };
