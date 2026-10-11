// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

#pragma once

#include "BackendD3D.h"

namespace Microsoft::Console::Render::Atlas
{
    // A Direct3D 12 port of BackendD3D. The CPU side (text shaping results -> quads, glyph atlas packing,
    // cursor, selection, gridlines, bitmaps) is inherited unchanged. Glyphs are still rasterized by Direct2D,
    // which writes into the D3D12 glyph atlas through a D3D11On12 device sharing our command queue.
#pragma warning(push)
#pragma warning(disable : 4324) // 'BackendD3D12': structure was padded due to alignment specifier
    struct BackendD3D12 final : BackendD3D
    {
        // Creates the ID3D12Device and its direct command queue in p.d3d12. Throws if Direct3D 12 is unavailable.
        static void CreateDevice(RenderingPayload& p);

        BackendD3D12(const RenderingPayload& p);
        ~BackendD3D12() override;

        void ReleaseResources() noexcept override;
        void Render(RenderingPayload& payload) override;

        // The first 32 bytes are identical to BackendD3D::CustomConstBuffer, so shaders written for
        // Direct3D 11 work unchanged. See README.md ("Custom shaders with Direct3D 12") for the contract.
        // WARNING: The same packing rules as for VSConstBuffer apply.
        struct alignas(16) CustomConstBuffer12
        {
            alignas(sizeof(f32)) f32 time = 0;
            alignas(sizeof(f32)) f32 scale = 0;
            alignas(sizeof(f32x2)) f32x2 resolution;
            alignas(sizeof(f32x4)) f32x4 background;
            alignas(sizeof(f32x4)) f32x4 cursorRect;
            alignas(sizeof(f32x4)) f32x4 cursorColor;
            alignas(sizeof(f32x2)) f32x2 targetSize;
            alignas(sizeof(f32)) f32 deltaTime = 0;
            alignas(sizeof(u32)) u32 frameCount = 0;
            alignas(sizeof(f32)) f32 cursorTime = 0;
            alignas(sizeof(u32)) u32 passIndex = 0;
            alignas(sizeof(u32)) u32 passCount = 0;
#pragma warning(suppress : 4324) // 'CustomConstBuffer12': structure was padded due to alignment specifier
        };

    private:
        static constexpr u32 FrameCount = 3;
        static constexpr u32 MaxBackBuffers = 8;
        static constexpr u32 MaxCustomPasses = 8;

        // Shader visible CBV/SRV/UAV heap layout.
        static constexpr u32 SrvBackground = 0;
        static constexpr u32 SrvGlyphAtlas = 1;
        static constexpr u32 SrvCustomFirst = 2; // + 4 descriptors (t0-t3) per custom shader pass
        static constexpr u32 SrvCount = SrvCustomFirst + 4 * MaxCustomPasses;

        // RTV heap layout.
        static constexpr u32 RtvBackBufferFirst = 0;
        static constexpr u32 RtvCustomOffscreen = MaxBackBuffers;
        static constexpr u32 RtvCustomPingPong = MaxBackBuffers + 1; // + 2
        static constexpr u32 RtvCount = MaxBackBuffers + 3;

        struct FrameContext
        {
            wil::com_ptr<ID3D12CommandAllocator> allocator;
            u64 fenceValue = 0;
            u64 ringEnd = 0;
        };

        struct RingAllocation
        {
            u8* cpu = nullptr;
            D3D12_GPU_VIRTUAL_ADDRESS gpu = 0;
            u64 offset = 0; // relative to the start of _ring
        };

        void _d2dBeginDrawing() override;
        void _d2dEndDrawing() override;
        void _resizeGlyphAtlas(const RenderingPayload& p, u16 u, u16 v) override;
        void _flushQuads(const RenderingPayload& p) override;
        void _uploadBackgroundBitmap(const RenderingPayload& p) override;

        ATLAS_ATTR_COLD void _handleSettingsUpdate12(const RenderingPayload& p);
        ATLAS_ATTR_COLD void _createBackBuffers(const RenderingPayload& p);
        ATLAS_ATTR_COLD void _recreateBackgroundBitmap12(const RenderingPayload& p);
        ATLAS_ATTR_COLD void _recreateConstants(const RenderingPayload& p);
        ATLAS_ATTR_COLD void _recreateCustomShader12(const RenderingPayload& p);
        ATLAS_ATTR_COLD void _recreateCustomTargets(const RenderingPayload& p);
        ATLAS_ATTR_COLD void _releaseCustomTargets() noexcept;
        ATLAS_ATTR_COLD wil::com_ptr<ID3D12Resource> _uploadImage(const RenderingPayload& p, const wchar_t* path);
        void _executeCustomShader12(RenderingPayload& p);

        void _beginFrame();
        void _endFrame();
        void _setCommandListState();
        void _submit(bool reopen);
        void _waitForFence(u64 value);
        void _waitForGpuIdle();
        void _waitForGpuIdleNoThrow() noexcept;
        RingAllocation _ringAlloc(u64 size, u64 alignment);
        ATLAS_ATTR_COLD void _growRing(u64 minSize);
        void _transition(ID3D12Resource* resource, D3D12_RESOURCE_STATES before, D3D12_RESOURCE_STATES after) const noexcept;
        D3D12_CPU_DESCRIPTOR_HANDLE _srvCpu(u32 index) const noexcept;
        D3D12_GPU_DESCRIPTOR_HANDLE _srvGpu(u32 index) const noexcept;
        D3D12_CPU_DESCRIPTOR_HANDLE _rtvCpu(u32 index) const noexcept;
        D3D12_CPU_DESCRIPTOR_HANDLE _mainTargetRtv() const noexcept;
        ATLAS_ATTR_COLD wil::com_ptr<ID3D12Resource> _createTexture(u32 width, u32 height, DXGI_FORMAT format, D3D12_RESOURCE_FLAGS flags, D3D12_RESOURCE_STATES state) const;
        ATLAS_ATTR_COLD void _writeSrv(ID3D12Resource* resource, DXGI_FORMAT format, u32 index) const noexcept;

        // Device
        wil::com_ptr<ID3D12Device> _device;
        wil::com_ptr<ID3D12CommandQueue> _queue;
        wil::com_ptr<ID3D12GraphicsCommandList> _commandList;
        wil::com_ptr<ID3D12CommandAllocator> _immediateAllocator;
        wil::com_ptr<ID3D12Fence> _fence;
        wil::unique_event _fenceEvent;
        u64 _fenceValue = 0;
        FrameContext _frames[FrameCount];
        u32 _frameIndex = 0;
        bool _commandListOpen = false;
        bool _atlasReadsPending = false;

        // Direct2D interop
        wil::com_ptr<ID3D11Device> _d3d11Device;
        wil::com_ptr<ID3D11DeviceContext> _d3d11Context;
        wil::com_ptr<ID3D11On12Device> _d3d11On12;
        wil::com_ptr<ID3D11Resource> _glyphAtlasWrapped;

        // Descriptors
        wil::com_ptr<ID3D12DescriptorHeap> _srvHeap;
        wil::com_ptr<ID3D12DescriptorHeap> _rtvHeap;
        u32 _srvDescriptorSize = 0;
        u32 _rtvDescriptorSize = 0;

        // Main pipeline
        wil::com_ptr<ID3D12RootSignature> _rootSignature;
        wil::com_ptr<ID3D12PipelineState> _pipelineState;
        wil::com_ptr<ID3D12Resource> _staticBuffer; // vertices + indices
        D3D12_VERTEX_BUFFER_VIEW _vertexBufferView{};
        D3D12_INDEX_BUFFER_VIEW _indexBufferView{};
        VSConstBuffer _vsConstants{};
        PSConstBuffer _psConstants{};

        // Upload ring buffer (persistently mapped)
        wil::com_ptr<ID3D12Resource> _ring;
        u8* _ringData = nullptr;
        D3D12_GPU_VIRTUAL_ADDRESS _ringGpu = 0;
        u64 _ringSize = 0;
        u64 _ringHead = 0; // monotonic
        u64 _ringTail = 0; // monotonic

        // Swap chain
        wil::com_ptr<IDXGISwapChain3> _swapChain3;
        wil::com_ptr<ID3D12Resource> _backBuffers[MaxBackBuffers];
        u32 _backBufferCount = 0;
        u32 _backBufferIndex = 0;

        // Textures
        wil::com_ptr<ID3D12Resource> _glyphAtlas12;
        wil::com_ptr<ID3D12Resource> _backgroundBitmap12;

        // Custom shaders
        wil::com_ptr<ID3D12RootSignature> _customRootSignature;
        std::vector<wil::com_ptr<ID3D12PipelineState>> _customPasses;
        wil::com_ptr<ID3D12Resource> _customOffscreen;
        wil::com_ptr<ID3D12Resource> _customPingPong[2];
        wil::com_ptr<ID3D12Resource> _customHistory;
        wil::com_ptr<ID3D12Resource> _customImage;
        bool _customUsesHistory = false;
        u64 _customLastFrameTime = 0;
        u64 _customCursorChangeTime = 0;
        til::rect _customLastCursorRect;
        u32 _customFrameCount = 0;
    };
#pragma warning(pop)
}
