// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

#include "shader_d3d12_rootsig.hlsl"

#define main atlas_vs_main
#include "shader_vs.hlsl"
#undef main

// clang-format off
[RootSignature(ATLAS_MAIN_ROOT_SIGNATURE)]
PSData main(VSData data)
// clang-format on
{
    return atlas_vs_main(data);
}
