// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

#pragma once

#include "common.h"

namespace Microsoft::Console::Render::Atlas::WIC
{
    // 32bpp premultiplied BGRA pixels, clamped to D3D11_REQ_TEXTURE2D_U_OR_V_DIMENSION.
    struct Image
    {
        Buffer<BYTE, 32> pixels;
        u32 width = 0;
        u32 height = 0;
        u32 stride = 0;
    };

    void SaveTextureToPNG(ID3D11DeviceContext* deviceContext, ID3D11Resource* source, double dpi, const wchar_t* fileName);
    Image LoadImageFromFile(const wchar_t* fileName);
    void LoadTextureFromFile(ID3D11Device* device, const wchar_t* fileName, ID3D11Texture2D** out_texture, ID3D11ShaderResourceView** out_textureView);
}
