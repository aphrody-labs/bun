// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

#include "pch.h"
#include "BackendD3D12.h"

#if TIL_FEATURE_CONHOSTATLASENGINECUSTOMSHADERS_ENABLED
#include <custom_shader_ps_d3d12.h>
#include <custom_shader_vs_d3d12.h>
#endif

#include <shader_ps_d3d12.h>
#include <shader_vs_d3d12.h>

#include "dwrite_helpers.h"
#include "wic.h"
#include "../../types/inc/convert.hpp"

TIL_FAST_MATH_BEGIN

#pragma warning(disable : 4100) // '...': unreferenced formal parameter
#pragma warning(disable : 26440) // Function '...' can be declared 'noexcept'(f.6).
#pragma warning(disable : 4242) // '=': conversion from '...' to '...', possible loss of data
#pragma warning(disable : 4244) // 'initializing': conversion from '...' to '...', possible loss of data
#pragma warning(disable : 4267) // 'argument': conversion from '...' to '...', possible loss of data
#pragma warning(disable : 4838) // conversion from '...' to '...' requires a narrowing conversion
#pragma warning(disable : 26472) // Don't use a static_cast for arithmetic conversions. Use brace initialization, gsl::narrow_cast or gsl::narrow (type.1).
#pragma warning(disable : 26429) // Symbol 'data' is never tested for nullness, it can be marked as not_null (f.23).
#pragma warning(disable : 26446) // Prefer to use gsl::at() instead of unchecked subscript operator (bounds.4).
#pragma warning(disable : 26459) // You called an STL function '...' with a raw pointer parameter at position '...' that may be unsafe [...].
#pragma warning(disable : 26481) // Don't use pointer arithmetic. Use span instead (bounds.1).
#pragma warning(disable : 26482) // Only index into arrays using constant expressions (bounds.2).
#pragma warning(disable : 26485) // Expression '...': No array to pointer decay (bounds.3).
#pragma warning(disable : 26490) // Don't use reinterpret_cast (type.1).

using namespace Microsoft::Console::Render::Atlas;

static_assert(sizeof(BackendD3D::VSConstBuffer) == 4 * 4);
static_assert(sizeof(BackendD3D::PSConstBuffer) == 20 * 4);
static_assert(sizeof(BackendD3D12::CustomConstBuffer12) == 96);
static_assert(offsetof(BackendD3D12::CustomConstBuffer12, background) == offsetof(BackendD3D::CustomConstBuffer, background));

static constexpr D2D1_COLOR_F whiteColor{ 1, 1, 1, 1 };
// Intermediate passes of multi-pass custom shaders render into half-float targets.
static constexpr DXGI_FORMAT customIntermediateFormat = DXGI_FORMAT_R16G16B16A16_FLOAT;
static constexpr u64 customConstantsStride = (sizeof(BackendD3D12::CustomConstBuffer12) + D3D12_CONSTANT_BUFFER_DATA_PLACEMENT_ALIGNMENT - 1) & ~u64{ D3D12_CONSTANT_BUFFER_DATA_PLACEMENT_ALIGNMENT - 1 };
static constexpr u64 initialRingSize = 1024 * 1024;

static u64 queryPerfFreq() noexcept
{
    LARGE_INTEGER li;
    QueryPerformanceFrequency(&li);
    return std::bit_cast<u64>(li.QuadPart);
}

static u64 queryPerfCount() noexcept
{
    LARGE_INTEGER li;
    QueryPerformanceCounter(&li);
    return std::bit_cast<u64>(li.QuadPart);
}

static D3D12_GRAPHICS_PIPELINE_STATE_DESC defaultPipelineDesc() noexcept
{
    D3D12_GRAPHICS_PIPELINE_STATE_DESC desc{};
    for (auto& rt : desc.BlendState.RenderTarget)
    {
        rt = {
            .BlendEnable = FALSE,
            .LogicOpEnable = FALSE,
            .SrcBlend = D3D12_BLEND_ONE,
            .DestBlend = D3D12_BLEND_ZERO,
            .BlendOp = D3D12_BLEND_OP_ADD,
            .SrcBlendAlpha = D3D12_BLEND_ONE,
            .DestBlendAlpha = D3D12_BLEND_ZERO,
            .BlendOpAlpha = D3D12_BLEND_OP_ADD,
            .LogicOp = D3D12_LOGIC_OP_NOOP,
            .RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL,
        };
    }
    desc.SampleMask = UINT_MAX;
    desc.RasterizerState = {
        .FillMode = D3D12_FILL_MODE_SOLID,
        .CullMode = D3D12_CULL_MODE_NONE,
        .DepthClipEnable = TRUE,
    };
    static constexpr D3D12_DEPTH_STENCILOP_DESC stencilOp{
        .StencilFailOp = D3D12_STENCIL_OP_KEEP,
        .StencilDepthFailOp = D3D12_STENCIL_OP_KEEP,
        .StencilPassOp = D3D12_STENCIL_OP_KEEP,
        .StencilFunc = D3D12_COMPARISON_FUNC_ALWAYS,
    };
    desc.DepthStencilState = {
        .DepthEnable = FALSE,
        .DepthWriteMask = D3D12_DEPTH_WRITE_MASK_ZERO,
        .DepthFunc = D3D12_COMPARISON_FUNC_ALWAYS,
        .StencilEnable = FALSE,
        .StencilReadMask = D3D12_DEFAULT_STENCIL_READ_MASK,
        .StencilWriteMask = D3D12_DEFAULT_STENCIL_WRITE_MASK,
        .FrontFace = stencilOp,
        .BackFace = stencilOp,
    };
    desc.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
    desc.NumRenderTargets = 1;
    desc.RTVFormats[0] = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.SampleDesc = { 1, 0 };
    return desc;
}

static wil::com_ptr<ID3D12Resource> createUploadBuffer(ID3D12Device* device, u64 size)
{
    static constexpr D3D12_HEAP_PROPERTIES heap{ .Type = D3D12_HEAP_TYPE_UPLOAD };
    const D3D12_RESOURCE_DESC desc{
        .Dimension = D3D12_RESOURCE_DIMENSION_BUFFER,
        .Width = size,
        .Height = 1,
        .DepthOrArraySize = 1,
        .MipLevels = 1,
        .Format = DXGI_FORMAT_UNKNOWN,
        .SampleDesc = { 1, 0 },
        .Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR,
    };
    wil::com_ptr<ID3D12Resource> buffer;
    THROW_IF_FAILED(device->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE, &desc, D3D12_RESOURCE_STATE_GENERIC_READ, nullptr, IID_PPV_ARGS(buffer.addressof())));
    return buffer;
}

void BackendD3D12::CreateDevice(RenderingPayload& p)
{
    // Loaded dynamically, so that the consumers of the atlas library don't need to link d3d12.lib.
    static const auto d3d12 = LoadLibraryExW(L"d3d12.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
    THROW_LAST_ERROR_IF_NULL(d3d12);
    const auto d3d12CreateDevice = GetProcAddressByFunctionDeclaration(d3d12, D3D12CreateDevice);
    THROW_LAST_ERROR_IF_NULL(d3d12CreateDevice);

#ifndef NDEBUG
    if (IsDebuggerPresent())
    {
        if (const auto d3d12GetDebugInterface = GetProcAddressByFunctionDeclaration(d3d12, D3D12GetDebugInterface))
        {
            if (wil::com_ptr<ID3D12Debug> debug; SUCCEEDED(d3d12GetDebugInterface(IID_PPV_ARGS(debug.addressof()))))
            {
                debug->EnableDebugLayer();
            }
        }
    }
#endif

    wil::com_ptr<ID3D12Device> device;
    THROW_IF_FAILED(d3d12CreateDevice(p.dxgi.adapter.get(), D3D_FEATURE_LEVEL_11_0, IID_PPV_ARGS(device.addressof())));

    static constexpr D3D12_COMMAND_QUEUE_DESC queueDesc{ .Type = D3D12_COMMAND_LIST_TYPE_DIRECT };
    wil::com_ptr<ID3D12CommandQueue> queue;
    THROW_IF_FAILED(device->CreateCommandQueue(&queueDesc, IID_PPV_ARGS(queue.addressof())));

    p.d3d12.device = std::move(device);
    p.d3d12.queue = std::move(queue);
}

BackendD3D12::BackendD3D12(const RenderingPayload& p) :
    _device{ p.d3d12.device },
    _queue{ p.d3d12.queue }
{
    THROW_HR_IF_NULL(E_UNEXPECTED, _device);
    THROW_HR_IF_NULL(E_UNEXPECTED, _queue);

    THROW_IF_FAILED(_device->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(_fence.addressof())));
    _fenceEvent.create();

    for (auto& frame : _frames)
    {
        THROW_IF_FAILED(_device->CreateCommandAllocator(D3D12_COMMAND_LIST_TYPE_DIRECT, IID_PPV_ARGS(frame.allocator.addressof())));
    }
    THROW_IF_FAILED(_device->CreateCommandAllocator(D3D12_COMMAND_LIST_TYPE_DIRECT, IID_PPV_ARGS(_immediateAllocator.addressof())));
    THROW_IF_FAILED(_device->CreateCommandList(0, D3D12_COMMAND_LIST_TYPE_DIRECT, _frames[0].allocator.get(), nullptr, IID_PPV_ARGS(_commandList.addressof())));
    THROW_IF_FAILED(_commandList->Close());

    {
        static constexpr D3D12_DESCRIPTOR_HEAP_DESC desc{
            .Type = D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV,
            .NumDescriptors = SrvCount,
            .Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE,
        };
        THROW_IF_FAILED(_device->CreateDescriptorHeap(&desc, IID_PPV_ARGS(_srvHeap.addressof())));
        _srvDescriptorSize = _device->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
    }
    {
        static constexpr D3D12_DESCRIPTOR_HEAP_DESC desc{
            .Type = D3D12_DESCRIPTOR_HEAP_TYPE_RTV,
            .NumDescriptors = RtvCount,
        };
        THROW_IF_FAILED(_device->CreateDescriptorHeap(&desc, IID_PPV_ARGS(_rtvHeap.addressof())));
        _rtvDescriptorSize = _device->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_RTV);
    }
    for (u32 i = 0; i < SrvCount; ++i)
    {
        _writeSrv(nullptr, DXGI_FORMAT_B8G8R8A8_UNORM, i);
    }

    // The root signatures are embedded in the vertex shaders (see shader_d3d12_rootsig.hlsl).
    THROW_IF_FAILED(_device->CreateRootSignature(0, &shader_vs_d3d12[0], sizeof(shader_vs_d3d12), IID_PPV_ARGS(_rootSignature.addressof())));
#if TIL_FEATURE_CONHOSTATLASENGINECUSTOMSHADERS_ENABLED
    THROW_IF_FAILED(_device->CreateRootSignature(0, &custom_shader_vs_d3d12[0], sizeof(custom_shader_vs_d3d12), IID_PPV_ARGS(_customRootSignature.addressof())));
#endif

    {
        static constexpr D3D12_INPUT_ELEMENT_DESC layout[]{
            { "SV_Position", 0, DXGI_FORMAT_R32G32_FLOAT, 0, 0, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 },
            { "shadingType", 0, DXGI_FORMAT_R16_UINT, 1, offsetof(QuadInstance, shadingType), D3D12_INPUT_CLASSIFICATION_PER_INSTANCE_DATA, 1 },
            { "renditionScale", 0, DXGI_FORMAT_R8G8_UINT, 1, offsetof(QuadInstance, renditionScale), D3D12_INPUT_CLASSIFICATION_PER_INSTANCE_DATA, 1 },
            { "position", 0, DXGI_FORMAT_R16G16_SINT, 1, offsetof(QuadInstance, position), D3D12_INPUT_CLASSIFICATION_PER_INSTANCE_DATA, 1 },
            { "size", 0, DXGI_FORMAT_R16G16_UINT, 1, offsetof(QuadInstance, size), D3D12_INPUT_CLASSIFICATION_PER_INSTANCE_DATA, 1 },
            { "texcoord", 0, DXGI_FORMAT_R16G16_UINT, 1, offsetof(QuadInstance, texcoord), D3D12_INPUT_CLASSIFICATION_PER_INSTANCE_DATA, 1 },
            { "color", 0, DXGI_FORMAT_R8G8B8A8_UNORM, 1, offsetof(QuadInstance, color), D3D12_INPUT_CLASSIFICATION_PER_INSTANCE_DATA, 1 },
        };

        auto desc = defaultPipelineDesc();
        desc.pRootSignature = _rootSignature.get();
        desc.VS = { &shader_vs_d3d12[0], sizeof(shader_vs_d3d12) };
        desc.PS = { &shader_ps_d3d12[0], sizeof(shader_ps_d3d12) };
        // Same blending as BackendD3D. See the explanation in its constructor.
        desc.BlendState.RenderTarget[0] = {
            .BlendEnable = TRUE,
            .LogicOpEnable = FALSE,
            .SrcBlend = D3D12_BLEND_ONE,
            .DestBlend = D3D12_BLEND_INV_SRC1_COLOR,
            .BlendOp = D3D12_BLEND_OP_ADD,
            .SrcBlendAlpha = D3D12_BLEND_ONE,
            .DestBlendAlpha = D3D12_BLEND_INV_SRC1_ALPHA,
            .BlendOpAlpha = D3D12_BLEND_OP_ADD,
            .LogicOp = D3D12_LOGIC_OP_NOOP,
            .RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL,
        };
        desc.InputLayout = { &layout[0], static_cast<UINT>(std::size(layout)) };
        THROW_IF_FAILED(_device->CreateGraphicsPipelineState(&desc, IID_PPV_ARGS(_pipelineState.addressof())));
    }

    {
        static constexpr f32x2 vertices[]{
            { 0, 0 },
            { 1, 0 },
            { 1, 1 },
            { 0, 1 },
        };
        static constexpr u16 indices[]{ 0, 1, 2, 2, 3, 0 };

        _staticBuffer = createUploadBuffer(_device.get(), sizeof(vertices) + sizeof(indices));

        void* data = nullptr;
        static constexpr D3D12_RANGE noRead{ 0, 0 };
        THROW_IF_FAILED(_staticBuffer->Map(0, &noRead, &data));
        memcpy(data, &vertices[0], sizeof(vertices));
        memcpy(static_cast<u8*>(data) + sizeof(vertices), &indices[0], sizeof(indices));
        _staticBuffer->Unmap(0, nullptr);

        const auto gpu = _staticBuffer->GetGPUVirtualAddress();
        _vertexBufferView = { gpu, sizeof(vertices), sizeof(f32x2) };
        _indexBufferView = { gpu + sizeof(vertices), sizeof(indices), DXGI_FORMAT_R16_UINT };
    }

    // Direct2D can't target D3D12 resources. Our glyph rasterizer (and only that) goes through
    // a D3D11On12 device, which submits its work to our own queue in the right order.
    {
        static const auto d3d11 = LoadLibraryExW(L"d3d11.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
        THROW_LAST_ERROR_IF_NULL(d3d11);
        const auto d3d11On12CreateDevice = GetProcAddressByFunctionDeclaration(d3d11, D3D11On12CreateDevice);
        THROW_LAST_ERROR_IF_NULL(d3d11On12CreateDevice);

        IUnknown* queues[]{ _queue.get() };
        THROW_IF_FAILED(d3d11On12CreateDevice(
            /* pDevice                */ _device.get(),
            /* Flags                  */ D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_SINGLETHREADED,
            /* pFeatureLevels         */ nullptr,
            /* FeatureLevels          */ 0,
            /* ppCommandQueues        */ &queues[0],
            /* NumQueues              */ 1,
            /* NodeMask               */ 0,
            /* ppDevice               */ _d3d11Device.addressof(),
            /* ppImmediateContext     */ _d3d11Context.addressof(),
            /* pChosenFeatureLevel    */ nullptr));
        _d3d11On12 = _d3d11Device.query<ID3D11On12Device>();
    }

    _growRing(initialRingSize);
}

#pragma warning(suppress : 26432) // If you define or delete any default operation in the type '...', define or delete them all (c.21).
BackendD3D12::~BackendD3D12()
{
    if (_d2dBeganDrawing)
    {
#pragma warning(suppress : 26447) // The function is declared 'noexcept' but calls function '...' which may throw exceptions (f.6).
        LOG_IF_FAILED(_d2dRenderTarget->EndDraw());
        _d2dBeganDrawing = false;
        if (_glyphAtlasWrapped)
        {
            ID3D11Resource* resources[]{ _glyphAtlasWrapped.get() };
            _d3d11On12->ReleaseWrappedResources(&resources[0], 1);
        }
    }

    // The D2D objects live in BackendD3D, which is destroyed after us. They reference the wrapped
    // glyph atlas and thus the D3D11On12 device, so they have to go first.
    _d2dRenderTarget.reset();
    _d2dRenderTarget4.reset();
    _brush.reset();
    _emojiBrush.reset();
    _softFontBitmap.reset();
    _glyphAtlasWrapped.reset();
    if (_d3d11Context)
    {
        _d3d11Context->Flush();
    }

    _waitForGpuIdleNoThrow();
}

void BackendD3D12::ReleaseResources() noexcept
{
    _waitForGpuIdleNoThrow();
    for (auto& buffer : _backBuffers)
    {
        buffer.reset();
    }
    _backBufferCount = 0;
    _swapChain3.reset();
    _releaseCustomTargets();
    // Ensure _handleSettingsUpdate12() is called so that the back buffers get recreated.
    _generation = {};
}

void BackendD3D12::Render(RenderingPayload& p)
{
    // An exception may have interrupted the previous frame.
    if (_commandListOpen)
    {
        LOG_IF_FAILED(_commandList->Close());
        _commandListOpen = false;
    }

    if (_generation != p.s.generation())
    {
        _handleSettingsUpdate12(p);
    }

    _beginFrame();
    _drawBackground(p);
    _drawCursorBackground(p);
    _drawText(p);
    _debugShowDirty(p);
    _flushQuads(p);

    if (!_customPasses.empty())
    {
        _executeCustomShader12(p);
    }

    _endFrame();
}

void BackendD3D12::_handleSettingsUpdate12(const RenderingPayload& p)
{
    // Most of the resources below are referenced by in-flight frames.
    _waitForGpuIdle();

    if (!_backBufferCount)
    {
        _createBackBuffers(p);
    }

    const auto fontChanged = _fontGeneration != p.s->font.generation();
    const auto miscChanged = _miscGeneration != p.s->misc.generation();
    const auto cellCountChanged = _viewportCellCount != p.s->viewportCellCount;

    if (fontChanged)
    {
        _updateFontDependents(p);
    }
    if (miscChanged)
    {
        _recreateCustomShader12(p);
    }
    if (cellCountChanged || !_backgroundBitmap12)
    {
        _recreateBackgroundBitmap12(p);
    }
    if (!_customPasses.empty() && !_customOffscreen)
    {
        _recreateCustomTargets(p);
    }

    _recreateConstants(p);

    _generation = p.s.generation();
    _fontGeneration = p.s->font.generation();
    _miscGeneration = p.s->misc.generation();
    _targetSize = p.s->targetSize;
    _viewportCellCount = p.s->viewportCellCount;
}

void BackendD3D12::_createBackBuffers(const RenderingPayload& p)
{
    _swapChain3 = p.swapChain.swapChain.query<IDXGISwapChain3>();

    DXGI_SWAP_CHAIN_DESC1 desc{};
    THROW_IF_FAILED(_swapChain3->GetDesc1(&desc));
    _backBufferCount = std::min<u32>(desc.BufferCount, MaxBackBuffers);

    for (u32 i = 0; i < _backBufferCount; ++i)
    {
        THROW_IF_FAILED(_swapChain3->GetBuffer(i, IID_PPV_ARGS(_backBuffers[i].put())));
        _device->CreateRenderTargetView(_backBuffers[i].get(), nullptr, _rtvCpu(RtvBackBufferFirst + i));
    }
}

void BackendD3D12::_recreateBackgroundBitmap12(const RenderingPayload& p)
{
    // Avoid memory usage spikes by releasing memory first.
    _backgroundBitmap12.reset();

    const auto width = std::max<u32>(1, p.s->viewportCellCount.x);
    const auto height = std::max<u32>(1, p.s->viewportCellCount.y);
    _backgroundBitmap12 = _createTexture(width, height, DXGI_FORMAT_R8G8B8A8_UNORM, D3D12_RESOURCE_FLAG_NONE, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
    _writeSrv(_backgroundBitmap12.get(), DXGI_FORMAT_R8G8B8A8_UNORM, SrvBackground);
    _backgroundBitmapGeneration = {};
}

void BackendD3D12::_recreateConstants(const RenderingPayload& p)
{
    _vsConstants = {};
    _vsConstants.positionScale = { 2.0f / p.s->targetSize.x, -2.0f / p.s->targetSize.y };

    _psConstants = {};
    _psConstants.backgroundColor = colorFromU32Premultiply<f32x4>(p.s->misc->backgroundColor);
    _psConstants.backgroundCellSize = { static_cast<f32>(p.s->font->cellSize.x), static_cast<f32>(p.s->font->cellSize.y) };
    _psConstants.backgroundCellCount = { static_cast<f32>(p.s->viewportCellCount.x), static_cast<f32>(p.s->viewportCellCount.y) };
    DWrite_GetGammaRatios(_gamma, _psConstants.gammaRatios);
    _psConstants.enhancedContrast = p.s->font->antialiasingMode == AntialiasingMode::ClearType ? _cleartypeEnhancedContrast : _grayscaleEnhancedContrast;
    _psConstants.underlineWidth = p.s->font->underline.height;
    _psConstants.doubleUnderlineWidth = p.s->font->doubleUnderline[0].height;
    _psConstants.curlyLineHalfHeight = _curlyLineHalfHeight;
    _psConstants.shadedGlyphDotSize = std::max(1.0f, std::roundf(std::max(p.s->font->cellSize.x / 12.0f, p.s->font->cellSize.y / 24.0f)));
}

void BackendD3D12::_recreateCustomShader12(const RenderingPayload& p)
{
    UNREFERENCED_PARAMETER(p);

#if TIL_FEATURE_CONHOSTATLASENGINECUSTOMSHADERS_ENABLED
    _releaseCustomTargets();
    _customPasses.clear();
    _customImage.reset();
    _customUsesHistory = false;
    _customFrameCount = 0;
    _customLastFrameTime = 0;
    _requiresContinuousRedraw = false;

    const auto& shaderPath = p.s->misc->customPixelShaderPath;
    std::vector<wil::com_ptr<ID3DBlob>> blobs;
    std::vector<D3D12_SHADER_BYTECODE> bytecodes;

    if (!shaderPath.empty())
    {
        static constexpr auto flags =
            D3DCOMPILE_PACK_MATRIX_COLUMN_MAJOR
#ifdef NDEBUG
            | D3DCOMPILE_OPTIMIZATION_LEVEL3;
#else
            | D3DCOMPILE_ENABLE_STRICTNESS | D3DCOMPILE_WARNINGS_ARE_ERRORS | D3DCOMPILE_DEBUG | D3DCOMPILE_SKIP_OPTIMIZATION;
#endif

        const auto compile = [&](const char* entrypoint, wil::com_ptr<ID3DBlob>& blob, wil::com_ptr<ID3DBlob>& error) {
            return D3DCompileFromFile(
                /* pFileName   */ shaderPath.c_str(),
                /* pDefines    */ nullptr,
                /* pInclude    */ D3D_COMPILE_STANDARD_FILE_INCLUDE,
                /* pEntrypoint */ entrypoint,
                /* pTarget     */ "ps_5_1",
                /* Flags1      */ flags,
                /* Flags2      */ 0,
                /* ppCode      */ blob.put(),
                /* ppErrorMsgs */ error.put());
        };
        const auto errorText = [](const wil::com_ptr<ID3DBlob>& error) {
            return error ? std::string_view{ static_cast<const char*>(error->GetBufferPointer()), error->GetBufferSize() } : std::string_view{};
        };
        const auto reportError = [&](HRESULT hr, const wil::com_ptr<ID3DBlob>& error) {
            if (!p.warningCallback)
            {
                return;
            }
            if (error)
            {
                p.warningCallback(D2DERR_SHADER_COMPILE_FAILED, ConvertToW(CP_ACP, errorText(error)));
            }
            else
            {
                p.warningCallback(hr, shaderPath);
            }
        };

        // Optional extra passes "pass1" to "pass7" run in that order before "main".
        auto ok = true;
        for (u32 i = 1; i < MaxCustomPasses; ++i)
        {
            char entrypoint[]{ 'p', 'a', 's', 's', static_cast<char>('0' + i), '\0' };
            wil::com_ptr<ID3DBlob> blob;
            wil::com_ptr<ID3DBlob> error;
            const auto hr = compile(&entrypoint[0], blob, error);
            if (SUCCEEDED(hr))
            {
                blobs.emplace_back(std::move(blob));
                continue;
            }
            // X3501: entrypoint not found
            if (errorText(error).find("X3501") == std::string_view::npos)
            {
                reportError(hr, error);
                ok = false;
            }
            break;
        }

        if (ok)
        {
            wil::com_ptr<ID3DBlob> blob;
            wil::com_ptr<ID3DBlob> error;
            const auto hr = compile("main", blob, error);
            if (SUCCEEDED(hr))
            {
                blobs.emplace_back(std::move(blob));
            }
            else
            {
                reportError(hr, error);
                ok = false;
            }
        }

        if (!ok)
        {
            blobs.clear();
        }

        for (const auto& blob : blobs)
        {
            bytecodes.push_back({ blob->GetBufferPointer(), blob->GetBufferSize() });

            wil::com_ptr<ID3D12ShaderReflection> reflector;
            D3D12_SHADER_DESC shaderDesc{};
            if (FAILED_LOG(D3DReflect(blob->GetBufferPointer(), blob->GetBufferSize(), IID_PPV_ARGS(reflector.addressof()))) ||
                FAILED(reflector->GetDesc(&shaderDesc)))
            {
                // Unless we can determine otherwise, assume this shader requires evaluation every frame.
                _requiresContinuousRedraw = true;
                continue;
            }

            for (UINT i = 0; i < shaderDesc.BoundResources; ++i)
            {
                D3D12_SHADER_INPUT_BIND_DESC bind{};
                if (FAILED(reflector->GetResourceBindingDesc(i, &bind)))
                {
                    continue;
                }

                if (bind.Type == D3D_SIT_TEXTURE && bind.BindPoint <= 3 && bind.BindPoint + std::max(1u, bind.BindCount) > 3)
                {
                    _customUsesHistory = true;
                }

                if (bind.Type == D3D_SIT_CBUFFER && bind.BindPoint == 0)
                {
                    // Like in BackendD3D, any failure here means that the cbuffer is unused.
                    const auto constantBuffer = reflector->GetConstantBufferByName(bind.Name);
                    D3D12_SHADER_BUFFER_DESC bufferDesc{};
                    if (!constantBuffer || FAILED(constantBuffer->GetDesc(&bufferDesc)))
                    {
                        continue;
                    }

                    for (UINT v = 0; v < bufferDesc.Variables; ++v)
                    {
                        const auto variable = constantBuffer->GetVariableByIndex(v);
                        D3D12_SHADER_VARIABLE_DESC variableDesc{};
                        if (!variable || FAILED(variable->GetDesc(&variableDesc)) || WI_IsFlagClear(variableDesc.uFlags, D3D_SVF_USED))
                        {
                            continue;
                        }

                        // time, as well as deltaTime, frameCount and cursorTime change every frame.
                        const auto begin = variableDesc.StartOffset;
                        const auto end = begin + variableDesc.Size;
                        if (begin < offsetof(CustomConstBuffer12, scale) ||
                            (begin < offsetof(CustomConstBuffer12, passIndex) && end > offsetof(CustomConstBuffer12, deltaTime)))
                        {
                            _requiresContinuousRedraw = true;
                        }
                    }
                }
            }
        }

        // A history-based effect (trails, decay, ...) only converges if it keeps getting drawn.
        if (_customUsesHistory)
        {
            _requiresContinuousRedraw = true;
        }

        if (!bytecodes.empty() && !p.s->misc->customPixelShaderImagePath.empty())
        {
            try
            {
                _customImage = _uploadImage(p, p.s->misc->customPixelShaderImagePath.c_str());
            }
            catch (...)
            {
                LOG_CAUGHT_EXCEPTION();
                bytecodes.clear();
                if (p.warningCallback)
                {
                    p.warningCallback(D2DERR_SHADER_COMPILE_FAILED, p.s->misc->customPixelShaderImagePath);
                }
            }
        }
    }
    else if (p.s->misc->useRetroTerminalEffect)
    {
        bytecodes.push_back({ &custom_shader_ps_d3d12[0], sizeof(custom_shader_ps_d3d12) });
    }

    for (size_t i = 0; i < bytecodes.size(); ++i)
    {
        const auto last = i + 1 == bytecodes.size();
        auto desc = defaultPipelineDesc();
        desc.pRootSignature = _customRootSignature.get();
        desc.VS = { &custom_shader_vs_d3d12[0], sizeof(custom_shader_vs_d3d12) };
        desc.PS = bytecodes[i];
        desc.RTVFormats[0] = last ? DXGI_FORMAT_B8G8R8A8_UNORM : customIntermediateFormat;

        wil::com_ptr<ID3D12PipelineState> pipelineState;
        const auto hr = _device->CreateGraphicsPipelineState(&desc, IID_PPV_ARGS(pipelineState.addressof()));
        if (FAILED(hr))
        {
            // Most likely the shader binds something outside of the root signature (b0, t0-t3, s0-s3).
            LOG_HR(hr);
            _customPasses.clear();
            _customImage.reset();
            _customUsesHistory = false;
            _requiresContinuousRedraw = false;
            if (p.warningCallback)
            {
                p.warningCallback(hr, shaderPath);
            }
            return;
        }
        _customPasses.emplace_back(std::move(pipelineState));
    }

    if (!_customPasses.empty())
    {
        // See BackendD3D::_recreateCustomShader() for an explanation of the wraparound.
        const auto freq = queryPerfFreq();
        _customShaderPerfTickMod = freq * 1000;
        _customShaderSecsPerPerfTick = 1.0f / freq;
    }
#endif
}

void BackendD3D12::_recreateCustomTargets(const RenderingPayload& p)
{
    _releaseCustomTargets();

    const u32 width = p.s->targetSize.x;
    const u32 height = p.s->targetSize.y;
    const auto passCount = gsl::narrow_cast<u32>(_customPasses.size());

    _customOffscreen = _createTexture(width, height, DXGI_FORMAT_B8G8R8A8_UNORM, D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
    _device->CreateRenderTargetView(_customOffscreen.get(), nullptr, _rtvCpu(RtvCustomOffscreen));

    if (passCount > 1)
    {
        for (u32 i = 0; i < 2; ++i)
        {
            _customPingPong[i] = _createTexture(width, height, customIntermediateFormat, D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
            _device->CreateRenderTargetView(_customPingPong[i].get(), nullptr, _rtvCpu(RtvCustomPingPong + i));
        }
    }

    if (_customUsesHistory)
    {
        _customHistory = _createTexture(width, height, DXGI_FORMAT_B8G8R8A8_UNORM, D3D12_RESOURCE_FLAG_NONE, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
    }

    for (u32 i = 0; i < passCount; ++i)
    {
        const auto base = SrvCustomFirst + 4 * i;
        if (i == 0)
        {
            _writeSrv(_customOffscreen.get(), DXGI_FORMAT_B8G8R8A8_UNORM, base + 0);
        }
        else
        {
            _writeSrv(_customPingPong[(i - 1) % 2].get(), customIntermediateFormat, base + 0);
        }
        _writeSrv(_customImage.get(), DXGI_FORMAT_B8G8R8A8_UNORM, base + 1);
        _writeSrv(_customOffscreen.get(), DXGI_FORMAT_B8G8R8A8_UNORM, base + 2);
        _writeSrv(_customHistory.get(), DXGI_FORMAT_B8G8R8A8_UNORM, base + 3);
    }
}

void BackendD3D12::_releaseCustomTargets() noexcept
{
    _customOffscreen.reset();
    _customPingPong[0].reset();
    _customPingPong[1].reset();
    _customHistory.reset();
}

wil::com_ptr<ID3D12Resource> BackendD3D12::_uploadImage(const RenderingPayload& p, const wchar_t* path)
{
    assert(!_commandListOpen);

    const auto image = WIC::LoadImageFromFile(path);
    auto texture = _createTexture(image.width, image.height, DXGI_FORMAT_B8G8R8A8_UNORM, D3D12_RESOURCE_FLAG_NONE, D3D12_RESOURCE_STATE_COPY_DEST);

    const auto rowPitch = alignForward<u32>(image.width * sizeof(u32), D3D12_TEXTURE_DATA_PITCH_ALIGNMENT);
    const auto upload = createUploadBuffer(_device.get(), u64{ rowPitch } * image.height);
    {
        void* data = nullptr;
        static constexpr D3D12_RANGE noRead{ 0, 0 };
        THROW_IF_FAILED(upload->Map(0, &noRead, &data));
        for (u32 y = 0; y < image.height; ++y)
        {
            memcpy(static_cast<u8*>(data) + u64{ y } * rowPitch, image.pixels.data() + u64{ y } * image.stride, image.width * sizeof(u32));
        }
        upload->Unmap(0, nullptr);
    }

    THROW_IF_FAILED(_immediateAllocator->Reset());
    THROW_IF_FAILED(_commandList->Reset(_immediateAllocator.get(), nullptr));
    _commandListOpen = true;
    {
        D3D12_TEXTURE_COPY_LOCATION dst{};
        dst.pResource = texture.get();
        dst.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
        dst.SubresourceIndex = 0;

        D3D12_TEXTURE_COPY_LOCATION src{};
        src.pResource = upload.get();
        src.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
        src.PlacedFootprint.Offset = 0;
        src.PlacedFootprint.Footprint = { DXGI_FORMAT_B8G8R8A8_UNORM, image.width, image.height, 1, rowPitch };

        _commandList->CopyTextureRegion(&dst, 0, 0, 0, &src, nullptr);
        _transition(texture.get(), D3D12_RESOURCE_STATE_COPY_DEST, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
    }
    THROW_IF_FAILED(_commandList->Close());
    _commandListOpen = false;

    ID3D12CommandList* lists[]{ _commandList.get() };
    _queue->ExecuteCommandLists(1, &lists[0]);
    _waitForGpuIdle();
    return texture;
}

void BackendD3D12::_executeCustomShader12(RenderingPayload& p)
{
#if TIL_FEATURE_CONHOSTATLASENGINECUSTOMSHADERS_ENABLED
    const auto now = queryPerfCount();
    const auto passCount = gsl::narrow_cast<u32>(_customPasses.size());

    if (p.cursorRect != _customLastCursorRect)
    {
        _customLastCursorRect = p.cursorRect;
        _customCursorChangeTime = now;
    }

    CustomConstBuffer12 data{};
    data.time = (now % _customShaderPerfTickMod) * _customShaderSecsPerPerfTick;
    data.scale = static_cast<f32>(p.s->font->dpi) / static_cast<f32>(USER_DEFAULT_SCREEN_DPI);
    data.resolution = {
        static_cast<f32>(_viewportCellCount.x * p.s->font->cellSize.x),
        static_cast<f32>(_viewportCellCount.y * p.s->font->cellSize.y),
    };
    data.background = colorFromU32Premultiply<f32x4>(p.s->misc->backgroundColor);
    data.cursorRect = {};
    data.cursorColor = {};
    if (!p.cursorRect.empty())
    {
        data.cursorRect = {
            static_cast<f32>(p.s->font->cellSize.x * p.cursorRect.left),
            static_cast<f32>(p.s->font->cellSize.y * p.cursorRect.top),
            static_cast<f32>(p.s->font->cellSize.x * p.cursorRect.right),
            static_cast<f32>(p.s->font->cellSize.y * p.cursorRect.bottom),
        };
        data.cursorColor = colorFromU32<f32x4>(p.s->cursor->cursorColor);
    }
    data.targetSize = { static_cast<f32>(_targetSize.x), static_cast<f32>(_targetSize.y) };
    data.deltaTime = _customLastFrameTime ? std::min(1.0f, (now - _customLastFrameTime) * _customShaderSecsPerPerfTick) : 0.0f;
    data.frameCount = _customFrameCount++;
    data.cursorTime = std::min(1000.0f, (now - _customCursorChangeTime) * _customShaderSecsPerPerfTick);
    data.passCount = passCount;
    _customLastFrameTime = now;

    // Allocate all constants before switching to the custom root signature: _ringAlloc() may
    // submit the command list and restore the state of the main pipeline.
    const auto constants = _ringAlloc(customConstantsStride * passCount, D3D12_CONSTANT_BUFFER_DATA_PLACEMENT_ALIGNMENT);
    for (u32 i = 0; i < passCount; ++i)
    {
        data.passIndex = i;
        memcpy(constants.cpu + i * customConstantsStride, &data, sizeof(data));
    }

    _transition(_customOffscreen.get(), D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);

    _commandList->SetGraphicsRootSignature(_customRootSignature.get());
    _commandList->IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLESTRIP);

    for (u32 i = 0; i < passCount; ++i)
    {
        const auto last = i + 1 == passCount;
        const auto target = last ? _backBuffers[_backBufferIndex].get() : _customPingPong[i % 2].get();
        const auto rtv = last ? _rtvCpu(RtvBackBufferFirst + _backBufferIndex) : _rtvCpu(RtvCustomPingPong + i % 2);

        if (!last)
        {
            _transition(target, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE, D3D12_RESOURCE_STATE_RENDER_TARGET);
        }

        _commandList->SetPipelineState(_customPasses[i].get());
        _commandList->SetGraphicsRootConstantBufferView(0, constants.gpu + i * customConstantsStride);
        _commandList->SetGraphicsRootDescriptorTable(1, _srvGpu(SrvCustomFirst + 4 * i));
        _commandList->OMSetRenderTargets(1, &rtv, FALSE, nullptr);
        _commandList->DrawInstanced(4, 1, 0, 0);

        if (!last)
        {
            _transition(target, D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
        }
    }

    if (_customHistory)
    {
        const auto backBuffer = _backBuffers[_backBufferIndex].get();
        _transition(backBuffer, D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_COPY_SOURCE);
        _transition(_customHistory.get(), D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE, D3D12_RESOURCE_STATE_COPY_DEST);
        _commandList->CopyResource(_customHistory.get(), backBuffer);
        _transition(_customHistory.get(), D3D12_RESOURCE_STATE_COPY_DEST, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
        _transition(backBuffer, D3D12_RESOURCE_STATE_COPY_SOURCE, D3D12_RESOURCE_STATE_RENDER_TARGET);
    }

    // With custom shaders, everything might be invalidated, so we have to
    // indirectly disable Present1() and its dirty rects this way.
    p.dirtyRectInPx = { 0, 0, p.s->targetSize.x, p.s->targetSize.y };
#endif
}

void BackendD3D12::_d2dBeginDrawing()
{
    if (!_d2dBeganDrawing)
    {
        // Direct2D is about to write into the glyph atlas. Draw calls recorded so far read
        // its current contents and must reach the queue before the D3D11On12 commands do.
        if (_atlasReadsPending && _commandListOpen)
        {
            _submit(true);
        }

        ID3D11Resource* resources[]{ _glyphAtlasWrapped.get() };
        _d3d11On12->AcquireWrappedResources(&resources[0], 1);
        _d2dRenderTarget->BeginDraw();
        _d2dBeganDrawing = true;
    }
}

void BackendD3D12::_d2dEndDrawing()
{
    if (_d2dBeganDrawing)
    {
        _d2dBeganDrawing = false;
        const auto hr = _d2dRenderTarget->EndDraw();
        ID3D11Resource* resources[]{ _glyphAtlasWrapped.get() };
        _d3d11On12->ReleaseWrappedResources(&resources[0], 1);
        // Submits the Direct2D work to our queue, ahead of the command list that's currently being recorded.
        _d3d11Context->Flush();
        THROW_IF_FAILED(hr);
    }
}

void BackendD3D12::_resizeGlyphAtlas(const RenderingPayload& p, const u16 u, const u16 v)
{
#if defined(_M_X64) || defined(_M_IX86)
    static const auto faultyMacTypeVersion = _checkMacTypeVersion(p);
#else
    // The affected versions of MacType are unavailable on ARM.
    static constexpr auto faultyMacTypeVersion = false;
#endif

    // The old atlas and its descriptor are referenced by recorded and in-flight draw calls.
    if (_commandListOpen)
    {
        _submit(true);
    }
    _waitForGpuIdle();

    _d2dRenderTarget.reset();
    _d2dRenderTarget4.reset();
    _brush.reset();
    _emojiBrush.reset();
    _softFontBitmap.reset();
    _glyphAtlasWrapped.reset();
    // Destroys the wrapped resource for real.
    _d3d11Context->Flush();
    _glyphAtlas12.reset();

    _glyphAtlas12 = _createTexture(u, v, DXGI_FORMAT_B8G8R8A8_UNORM, D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
    _writeSrv(_glyphAtlas12.get(), DXGI_FORMAT_B8G8R8A8_UNORM, SrvGlyphAtlas);

    {
        static constexpr D3D11_RESOURCE_FLAGS flags{ .BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE };
        THROW_IF_FAILED(_d3d11On12->CreateWrappedResource(
            _glyphAtlas12.get(),
            &flags,
            D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE,
            D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE,
            IID_PPV_ARGS(_glyphAtlasWrapped.addressof())));
    }

    {
        const auto surface = _glyphAtlasWrapped.query<IDXGISurface>();

        static constexpr D2D1_RENDER_TARGET_PROPERTIES props{
            .type = D2D1_RENDER_TARGET_TYPE_DEFAULT,
            .pixelFormat = { DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED },
        };
        THROW_IF_FAILED(p.d2dFactory->CreateDxgiSurfaceRenderTarget(surface.get(), &props, reinterpret_cast<ID2D1RenderTarget**>(_d2dRenderTarget.addressof())));
        _d2dRenderTarget.try_query_to(_d2dRenderTarget4.addressof());

        _d2dRenderTarget->SetUnitMode(D2D1_UNIT_MODE_PIXELS);
        // Ensure that D2D uses the exact same gamma as our shader uses.
        _d2dRenderTarget->SetTextRenderingParams(_textRenderingParams.get());

        _d2dRenderTargetUpdateFontSettings(p);
    }

    // We have our own glyph cache so Direct2D's cache doesn't help much.
    if (_d2dRenderTarget4)
    {
        wil::com_ptr<ID2D1Device> device;
        _d2dRenderTarget4->GetDevice(device.addressof());

        device->SetMaximumTextureMemory(0);

        if (!faultyMacTypeVersion)
        {
            if (const auto device4 = device.try_query<ID2D1Device4>())
            {
                device4->SetMaximumColorGlyphCacheMemory(0);
            }
        }
    }

    {
        THROW_IF_FAILED(_d2dRenderTarget->CreateSolidColorBrush(&whiteColor, nullptr, _emojiBrush.put()));
        THROW_IF_FAILED(_d2dRenderTarget->CreateSolidColorBrush(&whiteColor, nullptr, _brush.put()));
    }

    _rectPackerData = Buffer<stbrp_node>{ u };
}

void BackendD3D12::_flushQuads(const RenderingPayload& p)
{
    if (!_instancesCount)
    {
        return;
    }

    if (!_cursorRects.empty())
    {
        _drawCursorForeground();
    }

    const auto bytes = _instancesCount * sizeof(QuadInstance);
    const auto instances = _ringAlloc(bytes, 16);
    memcpy(instances.cpu, _instances.data(), bytes);

    const D3D12_VERTEX_BUFFER_VIEW views[]{
        _vertexBufferView,
        { instances.gpu, gsl::narrow<UINT>(bytes), sizeof(QuadInstance) },
    };
    _commandList->IASetVertexBuffers(0, 2, &views[0]);
    _commandList->DrawIndexedInstanced(6, static_cast<UINT>(_instancesCount), 0, 0, 0);

    _instancesCount = 0;
    _atlasReadsPending = true;
}

void BackendD3D12::_uploadBackgroundBitmap(const RenderingPayload& p)
{
    const u32 width = p.s->viewportCellCount.x;
    const u32 height = p.s->viewportCellCount.y;
    if (!width || !height)
    {
        _backgroundBitmapGeneration = p.colorBitmapGenerations[0];
        return;
    }

    const auto rowPitch = alignForward<u32>(width * sizeof(u32), D3D12_TEXTURE_DATA_PITCH_ALIGNMENT);
    const auto upload = _ringAlloc(u64{ rowPitch } * height, D3D12_TEXTURE_DATA_PLACEMENT_ALIGNMENT);

    auto src = std::bit_cast<const char*>(p.backgroundBitmap.data());
    const auto srcWidth = width * sizeof(u32);
    const auto srcStride = p.colorBitmapRowStride * sizeof(u32);
    auto dst = std::bit_cast<char*>(upload.cpu);

    for (u32 y = 0; y < height; ++y)
    {
        memcpy(dst, src, srcWidth);
        src += srcStride;
        dst += rowPitch;
    }

    D3D12_TEXTURE_COPY_LOCATION dstLocation{};
    dstLocation.pResource = _backgroundBitmap12.get();
    dstLocation.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    dstLocation.SubresourceIndex = 0;

    D3D12_TEXTURE_COPY_LOCATION srcLocation{};
    srcLocation.pResource = _ring.get();
    srcLocation.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    srcLocation.PlacedFootprint.Offset = upload.offset;
    srcLocation.PlacedFootprint.Footprint = { DXGI_FORMAT_R8G8B8A8_UNORM, width, height, 1, rowPitch };

    _transition(_backgroundBitmap12.get(), D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE, D3D12_RESOURCE_STATE_COPY_DEST);
    _commandList->CopyTextureRegion(&dstLocation, 0, 0, 0, &srcLocation, nullptr);
    _transition(_backgroundBitmap12.get(), D3D12_RESOURCE_STATE_COPY_DEST, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);

    _backgroundBitmapGeneration = p.colorBitmapGenerations[0];
}

void BackendD3D12::_beginFrame()
{
    auto& frame = _frames[_frameIndex];
    _waitForFence(frame.fenceValue);
    _ringTail = std::max(_ringTail, frame.ringEnd);

    THROW_IF_FAILED(frame.allocator->Reset());
    THROW_IF_FAILED(_commandList->Reset(frame.allocator.get(), nullptr));
    _commandListOpen = true;

    _backBufferIndex = _swapChain3->GetCurrentBackBufferIndex();
    THROW_HR_IF(E_UNEXPECTED, _backBufferIndex >= _backBufferCount);

    _transition(_backBuffers[_backBufferIndex].get(), D3D12_RESOURCE_STATE_PRESENT, D3D12_RESOURCE_STATE_RENDER_TARGET);
    if (_customOffscreen)
    {
        _transition(_customOffscreen.get(), D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE, D3D12_RESOURCE_STATE_RENDER_TARGET);
    }

    _setCommandListState();
}

void BackendD3D12::_endFrame()
{
    _transition(_backBuffers[_backBufferIndex].get(), D3D12_RESOURCE_STATE_RENDER_TARGET, D3D12_RESOURCE_STATE_PRESENT);
    _submit(false);
    _frames[_frameIndex].ringEnd = _ringHead;
    _frameIndex = (_frameIndex + 1) % FrameCount;
}

void BackendD3D12::_setCommandListState()
{
    ID3D12DescriptorHeap* heaps[]{ _srvHeap.get() };
    _commandList->SetDescriptorHeaps(1, &heaps[0]);

    _commandList->SetGraphicsRootSignature(_rootSignature.get());
    _commandList->SetPipelineState(_pipelineState.get());
    _commandList->SetGraphicsRoot32BitConstants(0, sizeof(_vsConstants) / 4, &_vsConstants, 0);
    _commandList->SetGraphicsRoot32BitConstants(1, sizeof(_psConstants) / 4, &_psConstants, 0);
    _commandList->SetGraphicsRootDescriptorTable(2, _srvGpu(SrvBackground));

    _commandList->IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    _commandList->IASetIndexBuffer(&_indexBufferView);
    _commandList->IASetVertexBuffers(0, 1, &_vertexBufferView);

    const D3D12_VIEWPORT viewport{ 0, 0, static_cast<f32>(_targetSize.x), static_cast<f32>(_targetSize.y), 0, 1 };
    const D3D12_RECT scissor{ 0, 0, _targetSize.x, _targetSize.y };
    _commandList->RSSetViewports(1, &viewport);
    _commandList->RSSetScissorRects(1, &scissor);

    const auto rtv = _mainTargetRtv();
    _commandList->OMSetRenderTargets(1, &rtv, FALSE, nullptr);
}

void BackendD3D12::_submit(bool reopen)
{
    THROW_IF_FAILED(_commandList->Close());
    _commandListOpen = false;

    ID3D12CommandList* lists[]{ _commandList.get() };
    _queue->ExecuteCommandLists(1, &lists[0]);
    THROW_IF_FAILED(_queue->Signal(_fence.get(), ++_fenceValue));
    _frames[_frameIndex].fenceValue = _fenceValue;
    _atlasReadsPending = false;

    if (reopen)
    {
        // An allocator can back the next recording while its previous commands are still executing.
        THROW_IF_FAILED(_commandList->Reset(_frames[_frameIndex].allocator.get(), nullptr));
        _commandListOpen = true;
        _setCommandListState();
    }
}

void BackendD3D12::_waitForFence(u64 value)
{
    for (;;)
    {
        const auto completed = _fence->GetCompletedValue();
        // GetCompletedValue() returns UINT64_MAX once the device has been removed.
        if (completed == UINT64_MAX)
        {
            LOG_IF_FAILED(_device->GetDeviceRemovedReason());
            THROW_HR(DXGI_ERROR_DEVICE_REMOVED);
        }
        if (completed >= value)
        {
            return;
        }

        THROW_IF_FAILED(_fence->SetEventOnCompletion(value, _fenceEvent.get()));
        if (WaitForSingleObject(_fenceEvent.get(), 1000) == WAIT_TIMEOUT && FAILED(_device->GetDeviceRemovedReason()))
        {
            THROW_HR(DXGI_ERROR_DEVICE_REMOVED);
        }
    }
}

void BackendD3D12::_waitForGpuIdle()
{
    THROW_IF_FAILED(_queue->Signal(_fence.get(), ++_fenceValue));
    _waitForFence(_fenceValue);
    if (!_commandListOpen)
    {
        _ringTail = _ringHead;
    }
}

void BackendD3D12::_waitForGpuIdleNoThrow() noexcept
{
    try
    {
        if (_queue && _fence)
        {
            _waitForGpuIdle();
        }
    }
    CATCH_LOG()
}

BackendD3D12::RingAllocation BackendD3D12::_ringAlloc(u64 size, u64 alignment)
{
    for (;;)
    {
        auto offset = alignForward(_ringHead, alignment);
        auto pos = offset % _ringSize;
        // Allocations don't wrap around the end of the buffer. Skip to the start instead.
        if (pos + size > _ringSize)
        {
            offset += _ringSize - pos;
            pos = 0;
        }

        if (offset + size - _ringTail <= _ringSize)
        {
            _ringHead = offset + size;
            return { _ringData + pos, _ringGpu + pos, pos };
        }

        // Retire the oldest frame that still holds parts of the ring.
        FrameContext* oldest = nullptr;
        for (auto& frame : _frames)
        {
            if (&frame != &_frames[_frameIndex] && frame.ringEnd > _ringTail && (!oldest || frame.fenceValue < oldest->fenceValue))
            {
                oldest = &frame;
            }
        }

        if (oldest)
        {
            _waitForFence(oldest->fenceValue);
            _ringTail = oldest->ringEnd;
        }
        else
        {
            // The current frame alone doesn't fit.
            _growRing(size);
        }
    }
}

void BackendD3D12::_growRing(u64 minSize)
{
    // Everything recorded so far may reference the old buffer.
    if (_commandListOpen)
    {
        _submit(true);
    }
    _waitForGpuIdle();

    const auto newSize = alignForward<u64>(std::max({ initialRingSize, _ringSize * 2, minSize * 2 }), 64 * 1024);

    _ring.reset();
    _ringData = nullptr;
    _ring = createUploadBuffer(_device.get(), newSize);

    void* data = nullptr;
    static constexpr D3D12_RANGE noRead{ 0, 0 };
    THROW_IF_FAILED(_ring->Map(0, &noRead, &data));
    _ringData = static_cast<u8*>(data);
    _ringGpu = _ring->GetGPUVirtualAddress();
    _ringSize = newSize;
    _ringHead = 0;
    _ringTail = 0;
    for (auto& frame : _frames)
    {
        frame.ringEnd = 0;
    }
}

void BackendD3D12::_transition(ID3D12Resource* resource, D3D12_RESOURCE_STATES before, D3D12_RESOURCE_STATES after) const noexcept
{
    D3D12_RESOURCE_BARRIER barrier{};
    barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    barrier.Transition.pResource = resource;
    barrier.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    barrier.Transition.StateBefore = before;
    barrier.Transition.StateAfter = after;
    _commandList->ResourceBarrier(1, &barrier);
}

D3D12_CPU_DESCRIPTOR_HANDLE BackendD3D12::_srvCpu(u32 index) const noexcept
{
    auto handle = _srvHeap->GetCPUDescriptorHandleForHeapStart();
    handle.ptr += size_t{ index } * _srvDescriptorSize;
    return handle;
}

D3D12_GPU_DESCRIPTOR_HANDLE BackendD3D12::_srvGpu(u32 index) const noexcept
{
    auto handle = _srvHeap->GetGPUDescriptorHandleForHeapStart();
    handle.ptr += u64{ index } * _srvDescriptorSize;
    return handle;
}

D3D12_CPU_DESCRIPTOR_HANDLE BackendD3D12::_rtvCpu(u32 index) const noexcept
{
    auto handle = _rtvHeap->GetCPUDescriptorHandleForHeapStart();
    handle.ptr += size_t{ index } * _rtvDescriptorSize;
    return handle;
}

D3D12_CPU_DESCRIPTOR_HANDLE BackendD3D12::_mainTargetRtv() const noexcept
{
    return _customOffscreen ? _rtvCpu(RtvCustomOffscreen) : _rtvCpu(RtvBackBufferFirst + _backBufferIndex);
}

wil::com_ptr<ID3D12Resource> BackendD3D12::_createTexture(u32 width, u32 height, DXGI_FORMAT format, D3D12_RESOURCE_FLAGS flags, D3D12_RESOURCE_STATES state) const
{
    static constexpr D3D12_HEAP_PROPERTIES heap{ .Type = D3D12_HEAP_TYPE_DEFAULT };
    const D3D12_RESOURCE_DESC desc{
        .Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D,
        .Width = width,
        .Height = height,
        .DepthOrArraySize = 1,
        .MipLevels = 1,
        .Format = format,
        .SampleDesc = { 1, 0 },
        .Layout = D3D12_TEXTURE_LAYOUT_UNKNOWN,
        .Flags = flags,
    };
    wil::com_ptr<ID3D12Resource> texture;
    THROW_IF_FAILED(_device->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE, &desc, state, nullptr, IID_PPV_ARGS(texture.addressof())));
    return texture;
}

void BackendD3D12::_writeSrv(ID3D12Resource* resource, DXGI_FORMAT format, u32 index) const noexcept
{
    D3D12_SHADER_RESOURCE_VIEW_DESC desc{};
    desc.Format = format;
    desc.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
    desc.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
    desc.Texture2D.MipLevels = 1;
    _device->CreateShaderResourceView(resource, &desc, _srvCpu(index));
}

TIL_FAST_MATH_END
