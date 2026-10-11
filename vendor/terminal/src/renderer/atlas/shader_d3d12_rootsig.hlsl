// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// Root signatures of BackendD3D12. They're embedded into the vertex shaders (shader_vs_d3d12.hlsl and
// custom_shader_vs_d3d12.hlsl) and the C++ side creates them straight from that bytecode.

// b0 (VS) = VSConstBuffer, b0 (PS) = PSConstBuffer, t0 = background bitmap, t1 = glyph atlas.
#define ATLAS_MAIN_ROOT_SIGNATURE \
    "RootFlags(ALLOW_INPUT_ASSEMBLER_INPUT_LAYOUT | DENY_HULL_SHADER_ROOT_ACCESS | DENY_DOMAIN_SHADER_ROOT_ACCESS | DENY_GEOMETRY_SHADER_ROOT_ACCESS)," \
    "RootConstants(num32BitConstants=4, b0, visibility=SHADER_VISIBILITY_VERTEX)," \
    "RootConstants(num32BitConstants=20, b0, visibility=SHADER_VISIBILITY_PIXEL)," \
    "DescriptorTable(SRV(t0, numDescriptors=2, flags=DESCRIPTORS_VOLATILE | DATA_VOLATILE), visibility=SHADER_VISIBILITY_PIXEL)"

// b0 = CustomConstBuffer12, t0 = previous pass (or the terminal), t1 = experimental.pixelShaderImagePath,
// t2 = the terminal, t3 = the previous frame. s0 matches the sampler of BackendD3D, s1-s3 are extras.
#define ATLAS_CUSTOM_ROOT_SIGNATURE \
    "RootFlags(DENY_HULL_SHADER_ROOT_ACCESS | DENY_DOMAIN_SHADER_ROOT_ACCESS | DENY_GEOMETRY_SHADER_ROOT_ACCESS)," \
    "CBV(b0, visibility=SHADER_VISIBILITY_PIXEL)," \
    "DescriptorTable(SRV(t0, numDescriptors=4, flags=DESCRIPTORS_VOLATILE | DATA_VOLATILE), visibility=SHADER_VISIBILITY_PIXEL)," \
    "StaticSampler(s0, filter=FILTER_MIN_MAG_MIP_LINEAR, addressU=TEXTURE_ADDRESS_BORDER, addressV=TEXTURE_ADDRESS_BORDER, addressW=TEXTURE_ADDRESS_BORDER, maxAnisotropy=1, comparisonFunc=COMPARISON_ALWAYS, borderColor=STATIC_BORDER_COLOR_TRANSPARENT_BLACK, visibility=SHADER_VISIBILITY_PIXEL)," \
    "StaticSampler(s1, filter=FILTER_MIN_MAG_MIP_POINT, addressU=TEXTURE_ADDRESS_CLAMP, addressV=TEXTURE_ADDRESS_CLAMP, addressW=TEXTURE_ADDRESS_CLAMP, maxAnisotropy=1, comparisonFunc=COMPARISON_ALWAYS, visibility=SHADER_VISIBILITY_PIXEL)," \
    "StaticSampler(s2, filter=FILTER_MIN_MAG_MIP_LINEAR, addressU=TEXTURE_ADDRESS_CLAMP, addressV=TEXTURE_ADDRESS_CLAMP, addressW=TEXTURE_ADDRESS_CLAMP, maxAnisotropy=1, comparisonFunc=COMPARISON_ALWAYS, visibility=SHADER_VISIBILITY_PIXEL)," \
    "StaticSampler(s3, filter=FILTER_MIN_MAG_MIP_LINEAR, addressU=TEXTURE_ADDRESS_WRAP, addressV=TEXTURE_ADDRESS_WRAP, addressW=TEXTURE_ADDRESS_WRAP, maxAnisotropy=1, comparisonFunc=COMPARISON_ALWAYS, visibility=SHADER_VISIBILITY_PIXEL)"
