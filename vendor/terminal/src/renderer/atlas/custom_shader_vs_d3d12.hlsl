// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

#include "shader_d3d12_rootsig.hlsl"

#define main atlas_custom_vs_main
#include "custom_shader_vs.hlsl"
#undef main

// clang-format off
[RootSignature(ATLAS_CUSTOM_ROOT_SIGNATURE)]
VS_OUTPUT main(uint id : SV_VERTEXID)
// clang-format on
{
    return atlas_custom_vs_main(id);
}
