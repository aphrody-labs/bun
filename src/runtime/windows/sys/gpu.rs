//! Direct3D 12 slice of `bun:windows.gpu.d3d12`: adapter info, a render-target clear and a
//! buffer copy, each read back after a fence wait. COM methods are called through vtable
//! slots; the indices and struct layouts come from the Windows SDK 10.0.26100.0 `d3d12.h`
//! and `dxgi.h`.

use core::ffi::{CStr, c_void};
use core::ptr::{null, null_mut};

use super::{HANDLE, Json, OwnedHandle, WinErr, WinResult, from_wide, system_proc};

type HRESULT = i32;

const ERROR_PROC_NOT_FOUND: u32 = 127;
const INFINITE: u32 = 0xFFFF_FFFF;

const FEATURE_LEVEL_12_0: u32 = 0xC000;
const FEATURE_LEVEL_11_0: u32 = 0xB000;

const FORMAT_R8G8B8A8_UNORM: i32 = 28;
const COMMAND_LIST_TYPE_DIRECT: i32 = 0;
const DESCRIPTOR_HEAP_TYPE_RTV: i32 = 2;
const HEAP_TYPE_DEFAULT: i32 = 1;
const HEAP_TYPE_UPLOAD: i32 = 2;
const HEAP_TYPE_READBACK: i32 = 3;
const DIMENSION_BUFFER: i32 = 1;
const DIMENSION_TEXTURE2D: i32 = 3;
const LAYOUT_UNKNOWN: i32 = 0;
const LAYOUT_ROW_MAJOR: i32 = 1;
const RESOURCE_FLAG_ALLOW_RENDER_TARGET: i32 = 0x1;
const STATE_RENDER_TARGET: i32 = 0x4;
const STATE_COPY_DEST: i32 = 0x400;
const STATE_COPY_SOURCE: i32 = 0x800;
const STATE_GENERIC_READ: i32 = 0xAC3;
const BARRIER_TYPE_TRANSITION: i32 = 0;
const BARRIER_ALL_SUBRESOURCES: u32 = 0xFFFF_FFFF;
const COPY_TYPE_SUBRESOURCE_INDEX: i32 = 0;
const COPY_TYPE_PLACED_FOOTPRINT: i32 = 1;
const PITCH_ALIGNMENT: u32 = 256;

/// Vtable slot indices: `IUnknown` 0..=2, `ID3D12Object` 3..=6, `ID3D12DeviceChild::GetDevice` 7.
const SLOT_RELEASE: usize = 2;
const SLOT_DEVICE_CREATE_COMMAND_QUEUE: usize = 8;
const SLOT_DEVICE_CREATE_COMMAND_ALLOCATOR: usize = 9;
const SLOT_DEVICE_CREATE_COMMAND_LIST: usize = 12;
const SLOT_DEVICE_CREATE_DESCRIPTOR_HEAP: usize = 14;
const SLOT_DEVICE_CREATE_RENDER_TARGET_VIEW: usize = 20;
const SLOT_DEVICE_CREATE_COMMITTED_RESOURCE: usize = 27;
const SLOT_DEVICE_CREATE_FENCE: usize = 36;
const SLOT_DXGI_ENUM_ADAPTERS1: usize = 12;
const SLOT_DXGI_ADAPTER_GET_DESC1: usize = 10;
const SLOT_ALLOCATOR_RESET: usize = 8;
const SLOT_LIST_CLOSE: usize = 9;
const SLOT_LIST_RESET: usize = 10;
const SLOT_LIST_COPY_BUFFER_REGION: usize = 15;
const SLOT_LIST_COPY_TEXTURE_REGION: usize = 16;
const SLOT_LIST_RESOURCE_BARRIER: usize = 26;
const SLOT_LIST_CLEAR_RENDER_TARGET_VIEW: usize = 48;
const SLOT_QUEUE_EXECUTE_COMMAND_LISTS: usize = 10;
const SLOT_QUEUE_SIGNAL: usize = 14;
const SLOT_FENCE_SET_EVENT_ON_COMPLETION: usize = 9;
const SLOT_RESOURCE_MAP: usize = 8;
const SLOT_RESOURCE_UNMAP: usize = 9;
const SLOT_HEAP_GET_CPU_DESCRIPTOR_HANDLE_FOR_HEAP_START: usize = 9;

#[repr(C)]
#[derive(Clone, Copy)]
struct Guid {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

const IID_DXGI_FACTORY1: Guid = Guid {
    data1: 0x770a_ae78,
    data2: 0xf26f,
    data3: 0x4dba,
    data4: [0xa8, 0x29, 0x25, 0x3c, 0x83, 0xd1, 0xb3, 0x87],
};
const IID_DEVICE: Guid = Guid {
    data1: 0x1898_19f1,
    data2: 0x1db6,
    data3: 0x4b57,
    data4: [0xbe, 0x54, 0x18, 0x21, 0x33, 0x9b, 0x85, 0xf7],
};
const IID_COMMAND_QUEUE: Guid = Guid {
    data1: 0x0ec8_70a6,
    data2: 0x5d7e,
    data3: 0x4c22,
    data4: [0x8c, 0xfc, 0x5b, 0xaa, 0xe0, 0x76, 0x16, 0xed],
};
const IID_COMMAND_ALLOCATOR: Guid = Guid {
    data1: 0x6102_dee4,
    data2: 0xaf59,
    data3: 0x4b09,
    data4: [0xb9, 0x99, 0xb4, 0x4d, 0x73, 0xf0, 0x9b, 0x24],
};
const IID_COMMAND_LIST: Guid = Guid {
    data1: 0x5b16_0d0f,
    data2: 0xac1b,
    data3: 0x4185,
    data4: [0x8b, 0xa8, 0xb3, 0xae, 0x42, 0xa5, 0xa4, 0x55],
};
const IID_FENCE: Guid = Guid {
    data1: 0x0a75_3dcf,
    data2: 0xc4d8,
    data3: 0x4b91,
    data4: [0xad, 0xf6, 0xbe, 0x5a, 0x60, 0xd9, 0x5a, 0x76],
};
const IID_RESOURCE: Guid = Guid {
    data1: 0x6964_42be,
    data2: 0xa72e,
    data3: 0x4059,
    data4: [0xbc, 0x79, 0x5b, 0x5c, 0x98, 0x04, 0x0f, 0xad],
};
const IID_DESCRIPTOR_HEAP: Guid = Guid {
    data1: 0x8efb_471d,
    data2: 0x616c,
    data3: 0x4f49,
    data4: [0x90, 0xf7, 0x12, 0x7b, 0xb7, 0x63, 0xfa, 0x51],
};

#[repr(C)]
#[derive(Clone, Copy)]
struct AdapterDesc1 {
    description: [u16; 128],
    vendor_id: u32,
    device_id: u32,
    sub_sys_id: u32,
    revision: u32,
    dedicated_video_memory: usize,
    dedicated_system_memory: usize,
    shared_system_memory: usize,
    luid: [u32; 2],
    flags: u32,
}

#[repr(C)]
struct QueueDesc {
    kind: i32,
    priority: i32,
    flags: i32,
    node_mask: u32,
}

#[repr(C)]
struct HeapDesc {
    kind: i32,
    num_descriptors: u32,
    flags: i32,
    node_mask: u32,
}

#[repr(C)]
struct HeapProperties {
    kind: i32,
    cpu_page: i32,
    pool: i32,
    creation_node_mask: u32,
    visible_node_mask: u32,
}

#[repr(C)]
struct ResourceDesc {
    dimension: i32,
    alignment: u64,
    width: u64,
    height: u32,
    depth_or_array_size: u16,
    mip_levels: u16,
    format: i32,
    sample_count: u32,
    sample_quality: u32,
    layout: i32,
    flags: i32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct PlacedFootprint {
    offset: u64,
    format: i32,
    width: u32,
    height: u32,
    depth: u32,
    row_pitch: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
union CopyRegion {
    placed: PlacedFootprint,
    subresource: u32,
}

#[repr(C)]
struct CopyLocation {
    resource: *mut c_void,
    kind: i32,
    region: CopyRegion,
}

#[repr(C)]
struct Transition {
    resource: *mut c_void,
    subresource: u32,
    before: i32,
    after: i32,
}

#[repr(C)]
struct ResourceBarrier {
    kind: i32,
    flags: i32,
    transition: Transition,
}

const _: () = assert!(core::mem::size_of::<AdapterDesc1>() == 312);
const _: () = assert!(core::mem::size_of::<CopyLocation>() == 48);
const _: () = assert!(core::mem::size_of::<ResourceBarrier>() == 32);

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateEventW(
        attributes: *mut c_void,
        manual_reset: i32,
        initial: i32,
        name: *const u16,
    ) -> HANDLE;
    fn WaitForSingleObject(handle: HANDLE, millis: u32) -> u32;
}

/// Function pointer from vtable slot `index` of the COM object `obj`.
///
/// # Safety
/// `obj` is a live COM interface pointer and `F` matches the signature of that slot.
unsafe fn slot<F: Copy>(obj: *mut c_void, index: usize) -> F {
    // SAFETY: `obj` is a live interface, so its first word is the vtable pointer.
    let vtable = unsafe { *(obj as *const *const *const c_void) };
    // SAFETY: the caller guarantees `index` lies inside the vtable.
    let entry = unsafe { *vtable.add(index) };
    // SAFETY: `F` is a function pointer, the same size as `entry`.
    unsafe { core::mem::transmute_copy(&entry) }
}

/// Calls a COM method by vtable slot; the caller must be inside an `unsafe` block.
macro_rules! com {
    ($obj:expr, $index:expr, fn($($ty:ty),* $(,)?) -> $ret:ty $(, $arg:expr)* $(,)?) => {
        slot::<unsafe extern "system" fn(*mut c_void $(, $ty)*) -> $ret>($obj, $index)($obj $(, $arg)*)
    };
}

/// An owned COM reference, released on drop.
struct Com(*mut c_void);

impl Drop for Com {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: this reference is owned and released exactly once.
            unsafe { com!(self.0, SLOT_RELEASE, fn() -> u32) };
        }
    }
}

fn check(hr: HRESULT, call: &'static str) -> WinResult<()> {
    if hr >= 0 {
        Ok(())
    } else {
        Err(WinErr::status(hr, call))
    }
}

fn adopt(hr: HRESULT, ptr: *mut c_void, call: &'static str) -> WinResult<Com> {
    let com = Com(ptr);
    check(hr, call)?;
    Ok(com)
}

fn proc_addr(dll: &str, name: &CStr) -> WinResult<*mut c_void> {
    system_proc(dll, name).ok_or(WinErr {
        code: ERROR_PROC_NOT_FOUND,
        call: "GetProcAddress",
    })
}

fn feature_level_name(level: u32) -> String {
    format!("{}_{}", level >> 12, (level >> 8) & 0xF)
}

fn row_pitch(width: u32) -> u32 {
    (width * 4).next_multiple_of(PITCH_ALIGNMENT)
}

fn transition(resource: *mut c_void, before: i32, after: i32) -> ResourceBarrier {
    ResourceBarrier {
        kind: BARRIER_TYPE_TRANSITION,
        flags: 0,
        transition: Transition {
            resource,
            subresource: BARRIER_ALL_SUBRESOURCES,
            before,
            after,
        },
    }
}

fn map(resource: &Com) -> WinResult<*mut u8> {
    let mut data = null_mut();
    // SAFETY: a null range maps the whole resource; `data` receives the mapped pointer.
    let hr = unsafe {
        com!(
            resource.0,
            SLOT_RESOURCE_MAP,
            fn(u32, *const c_void, *mut *mut c_void) -> HRESULT,
            0,
            null(),
            &mut data
        )
    };
    check(hr, "ID3D12Resource::Map")?;
    Ok(data.cast())
}

fn unmap(resource: &Com) {
    // SAFETY: the resource is mapped by `map` and unmapped once.
    unsafe {
        com!(
            resource.0,
            SLOT_RESOURCE_UNMAP,
            fn(u32, *const c_void) -> (),
            0,
            null()
        )
    };
}

pub(crate) struct Info {
    adapter: String,
    vendor_id: u32,
    device_id: u32,
    dedicated_video_memory: usize,
    feature_level: u32,
}

/// A D3D12 device with one direct queue, allocator, command list and fence.
///
/// Field order is drop order: the device is released last.
struct Gpu {
    info: Info,
    queue: Com,
    allocator: Com,
    list: Com,
    fence: Com,
    event: OwnedHandle,
    value: u64,
    device: Com,
}

impl Gpu {
    fn open() -> WinResult<Gpu> {
        let create_factory = proc_addr("dxgi.dll", c"CreateDXGIFactory1")?;
        // SAFETY: `CreateDXGIFactory1` has this signature.
        let create_factory: unsafe extern "system" fn(*const Guid, *mut *mut c_void) -> HRESULT =
            unsafe { core::mem::transmute(create_factory) };
        let mut factory = null_mut();
        // SAFETY: `factory` is a valid out pointer and the IID names the requested interface.
        let hr = unsafe { create_factory(&IID_DXGI_FACTORY1, &mut factory) };
        let factory = adopt(hr, factory, "CreateDXGIFactory1")?;

        let mut adapter = null_mut();
        // SAFETY: `factory` is live; `adapter` receives an owned IDXGIAdapter1.
        let hr = unsafe {
            com!(
                factory.0,
                SLOT_DXGI_ENUM_ADAPTERS1,
                fn(u32, *mut *mut c_void) -> HRESULT,
                0,
                &mut adapter
            )
        };
        let adapter = adopt(hr, adapter, "IDXGIFactory1::EnumAdapters1")?;

        // SAFETY: `AdapterDesc1` is plain old data; all-zero is a valid value.
        let mut desc: AdapterDesc1 = unsafe { core::mem::zeroed() };
        // SAFETY: `adapter` is live and `desc` matches DXGI_ADAPTER_DESC1.
        let hr = unsafe {
            com!(
                adapter.0,
                SLOT_DXGI_ADAPTER_GET_DESC1,
                fn(*mut AdapterDesc1) -> HRESULT,
                &mut desc
            )
        };
        check(hr, "IDXGIAdapter1::GetDesc1")?;

        let create_device = proc_addr("d3d12.dll", c"D3D12CreateDevice")?;
        // SAFETY: `D3D12CreateDevice` has this signature.
        let create_device: unsafe extern "system" fn(
            *mut c_void,
            i32,
            *const Guid,
            *mut *mut c_void,
        ) -> HRESULT = unsafe { core::mem::transmute(create_device) };
        let mut device = null_mut();
        let mut feature_level = 0;
        let mut hr = 0;
        for level in [FEATURE_LEVEL_12_0, FEATURE_LEVEL_11_0] {
            // SAFETY: `adapter` is live; `device` receives an owned ID3D12Device on success.
            hr = unsafe { create_device(adapter.0, level as i32, &IID_DEVICE, &mut device) };
            if hr >= 0 {
                feature_level = level;
                break;
            }
        }
        let device = adopt(hr, device, "D3D12CreateDevice")?;

        let queue_desc = QueueDesc {
            kind: COMMAND_LIST_TYPE_DIRECT,
            priority: 0,
            flags: 0,
            node_mask: 0,
        };
        let mut queue = null_mut();
        // SAFETY: `device` is live and the descriptor matches D3D12_COMMAND_QUEUE_DESC.
        let hr = unsafe {
            com!(
                device.0,
                SLOT_DEVICE_CREATE_COMMAND_QUEUE,
                fn(*const QueueDesc, *const Guid, *mut *mut c_void) -> HRESULT,
                &queue_desc,
                &IID_COMMAND_QUEUE,
                &mut queue
            )
        };
        let queue = adopt(hr, queue, "ID3D12Device::CreateCommandQueue")?;

        let mut allocator = null_mut();
        // SAFETY: `device` is live; the list type is a valid D3D12_COMMAND_LIST_TYPE.
        let hr = unsafe {
            com!(
                device.0,
                SLOT_DEVICE_CREATE_COMMAND_ALLOCATOR,
                fn(i32, *const Guid, *mut *mut c_void) -> HRESULT,
                COMMAND_LIST_TYPE_DIRECT,
                &IID_COMMAND_ALLOCATOR,
                &mut allocator
            )
        };
        let allocator = adopt(hr, allocator, "ID3D12Device::CreateCommandAllocator")?;

        let mut list = null_mut();
        // SAFETY: `device` and `allocator` are live; no initial pipeline state is given.
        let hr = unsafe {
            com!(
                device.0,
                SLOT_DEVICE_CREATE_COMMAND_LIST,
                fn(u32, i32, *mut c_void, *mut c_void, *const Guid, *mut *mut c_void) -> HRESULT,
                0,
                COMMAND_LIST_TYPE_DIRECT,
                allocator.0,
                null_mut(),
                &IID_COMMAND_LIST,
                &mut list
            )
        };
        let list = adopt(hr, list, "ID3D12Device::CreateCommandList")?;
        // SAFETY: a freshly created list is open; closing it lets `run` reset it.
        let hr = unsafe { com!(list.0, SLOT_LIST_CLOSE, fn() -> HRESULT) };
        check(hr, "ID3D12GraphicsCommandList::Close")?;

        let mut fence = null_mut();
        // SAFETY: `device` is live; initial value 0 and no flags.
        let hr = unsafe {
            com!(
                device.0,
                SLOT_DEVICE_CREATE_FENCE,
                fn(u64, i32, *const Guid, *mut *mut c_void) -> HRESULT,
                0,
                0,
                &IID_FENCE,
                &mut fence
            )
        };
        let fence = adopt(hr, fence, "ID3D12Device::CreateFence")?;

        // SAFETY: default security, unnamed, auto-reset, initially unsignaled.
        let event = OwnedHandle(unsafe { CreateEventW(null_mut(), 0, 0, null()) });
        if event.0.is_null() {
            return Err(WinErr::last("CreateEventW"));
        }

        let info = Info {
            adapter: from_wide(&desc.description),
            vendor_id: desc.vendor_id,
            device_id: desc.device_id,
            dedicated_video_memory: desc.dedicated_video_memory,
            feature_level,
        };
        Ok(Gpu {
            info,
            queue,
            allocator,
            list,
            fence,
            event,
            value: 0,
            device,
        })
    }

    /// Records a command list with `record`, executes it and waits for the GPU to finish.
    fn run(&mut self, record: impl FnOnce(*mut c_void)) -> WinResult<()> {
        let list = self.list.0;
        // SAFETY: the allocator and list are live; the GPU is idle from the previous `run`.
        check(
            unsafe { com!(self.allocator.0, SLOT_ALLOCATOR_RESET, fn() -> HRESULT) },
            "ID3D12CommandAllocator::Reset",
        )?;
        // SAFETY: the list is closed and the allocator was reset.
        check(
            unsafe {
                com!(
                    list,
                    SLOT_LIST_RESET,
                    fn(*mut c_void, *mut c_void) -> HRESULT,
                    self.allocator.0,
                    null_mut()
                )
            },
            "ID3D12GraphicsCommandList::Reset",
        )?;
        record(list);
        // SAFETY: the list is recording.
        check(
            unsafe { com!(list, SLOT_LIST_CLOSE, fn() -> HRESULT) },
            "ID3D12GraphicsCommandList::Close",
        )?;

        let lists = [list];
        // SAFETY: `lists` holds one closed list that stays alive until the wait below.
        unsafe {
            com!(
                self.queue.0,
                SLOT_QUEUE_EXECUTE_COMMAND_LISTS,
                fn(u32, *const *mut c_void) -> (),
                1,
                lists.as_ptr()
            )
        };
        self.value += 1;
        // SAFETY: the queue and fence are live.
        check(
            unsafe {
                com!(
                    self.queue.0,
                    SLOT_QUEUE_SIGNAL,
                    fn(*mut c_void, u64) -> HRESULT,
                    self.fence.0,
                    self.value
                )
            },
            "ID3D12CommandQueue::Signal",
        )?;
        // SAFETY: the fence is live and the event handle is owned by `self`.
        check(
            unsafe {
                com!(
                    self.fence.0,
                    SLOT_FENCE_SET_EVENT_ON_COMPLETION,
                    fn(u64, HANDLE) -> HRESULT,
                    self.value,
                    self.event.0
                )
            },
            "ID3D12Fence::SetEventOnCompletion",
        )?;
        // SAFETY: the event handle is valid.
        if unsafe { WaitForSingleObject(self.event.0, INFINITE) } != 0 {
            return Err(WinErr::last("WaitForSingleObject"));
        }
        Ok(())
    }

    fn resource(&self, heap: i32, desc: &ResourceDesc, state: i32) -> WinResult<Com> {
        let props = HeapProperties {
            kind: heap,
            cpu_page: 0,
            pool: 0,
            creation_node_mask: 1,
            visible_node_mask: 1,
        };
        let mut out = null_mut();
        // SAFETY: `device` is live; the descriptors outlive the call; no clear value is given.
        let hr = unsafe {
            com!(
                self.device.0,
                SLOT_DEVICE_CREATE_COMMITTED_RESOURCE,
                fn(
                    *const HeapProperties,
                    i32,
                    *const ResourceDesc,
                    i32,
                    *const c_void,
                    *const Guid,
                    *mut *mut c_void,
                ) -> HRESULT,
                &props,
                0,
                desc,
                state,
                null(),
                &IID_RESOURCE,
                &mut out
            )
        };
        adopt(hr, out, "ID3D12Device::CreateCommittedResource")
    }

    fn buffer(&self, heap: i32, size: u64, state: i32) -> WinResult<Com> {
        self.resource(
            heap,
            &ResourceDesc {
                dimension: DIMENSION_BUFFER,
                alignment: 0,
                width: size,
                height: 1,
                depth_or_array_size: 1,
                mip_levels: 1,
                format: 0,
                sample_count: 1,
                sample_quality: 0,
                layout: LAYOUT_ROW_MAJOR,
                flags: 0,
            },
            state,
        )
    }

    fn render_target(&self, width: u32, height: u32) -> WinResult<Com> {
        self.resource(
            HEAP_TYPE_DEFAULT,
            &ResourceDesc {
                dimension: DIMENSION_TEXTURE2D,
                alignment: 0,
                width: u64::from(width),
                height,
                depth_or_array_size: 1,
                mip_levels: 1,
                format: FORMAT_R8G8B8A8_UNORM,
                sample_count: 1,
                sample_quality: 0,
                layout: LAYOUT_UNKNOWN,
                flags: RESOURCE_FLAG_ALLOW_RENDER_TARGET,
            },
            STATE_RENDER_TARGET,
        )
    }

    fn rtv_heap(&self) -> WinResult<Com> {
        let desc = HeapDesc {
            kind: DESCRIPTOR_HEAP_TYPE_RTV,
            num_descriptors: 1,
            flags: 0,
            node_mask: 0,
        };
        let mut out = null_mut();
        // SAFETY: `device` is live and the descriptor matches D3D12_DESCRIPTOR_HEAP_DESC.
        let hr = unsafe {
            com!(
                self.device.0,
                SLOT_DEVICE_CREATE_DESCRIPTOR_HEAP,
                fn(*const HeapDesc, *const Guid, *mut *mut c_void) -> HRESULT,
                &desc,
                &IID_DESCRIPTOR_HEAP,
                &mut out
            )
        };
        adopt(hr, out, "ID3D12Device::CreateDescriptorHeap")
    }
}

/// `{ api, adapter, vendorId, deviceId, dedicatedVideoMemory, featureLevel }` for adapter 0.
pub(crate) fn info_json() -> WinResult<String> {
    let gpu = Gpu::open()?;
    let info = &gpu.info;
    let mut j = Json::new();
    j.begin_object()
        .field_str("api", "d3d12")
        .field_str("adapter", &info.adapter)
        .field_num("vendorId", f64::from(info.vendor_id))
        .field_num("deviceId", f64::from(info.device_id))
        .field_num("dedicatedVideoMemory", info.dedicated_video_memory as f64)
        .field_str("featureLevel", &feature_level_name(info.feature_level))
        .end_object();
    Ok(j.finish())
}

/// Clears a `width` x `height` RGBA8 render target to `rgba` on the GPU and returns the pixels,
/// rows packed without the 256-byte pitch padding.
pub(crate) fn clear_render_target(width: u32, height: u32, rgba: [f32; 4]) -> WinResult<Vec<u8>> {
    let mut gpu = Gpu::open()?;
    let texture = gpu.render_target(width, height)?;
    let heap = gpu.rtv_heap()?;
    let mut rtv = 0usize;
    // SAFETY: COM returns this descriptor struct through an output pointer, even on x64.
    unsafe {
        com!(
            heap.0,
            SLOT_HEAP_GET_CPU_DESCRIPTOR_HANDLE_FOR_HEAP_START,
            fn(*mut usize) -> (),
            &mut rtv
        );
    };
    // SAFETY: `texture` is a render target; the descriptor slot is the heap's first.
    unsafe {
        com!(
            gpu.device.0,
            SLOT_DEVICE_CREATE_RENDER_TARGET_VIEW,
            fn(*mut c_void, *const c_void, usize) -> (),
            texture.0,
            null(),
            rtv
        )
    };

    let pitch = row_pitch(width);
    let readback = gpu.buffer(
        HEAP_TYPE_READBACK,
        u64::from(pitch) * u64::from(height),
        STATE_COPY_DEST,
    )?;
    gpu.run(|list| {
        // SAFETY: `list` is recording; every resource and descriptor stays alive until `run` returns.
        unsafe {
            com!(
                list,
                SLOT_LIST_CLEAR_RENDER_TARGET_VIEW,
                fn(usize, *const f32, u32, *const c_void) -> (),
                rtv,
                rgba.as_ptr(),
                0,
                null()
            );
            let barrier = transition(texture.0, STATE_RENDER_TARGET, STATE_COPY_SOURCE);
            com!(
                list,
                SLOT_LIST_RESOURCE_BARRIER,
                fn(u32, *const ResourceBarrier) -> (),
                1,
                &barrier
            );
            let dst = CopyLocation {
                resource: readback.0,
                kind: COPY_TYPE_PLACED_FOOTPRINT,
                region: CopyRegion {
                    placed: PlacedFootprint {
                        offset: 0,
                        format: FORMAT_R8G8B8A8_UNORM,
                        width,
                        height,
                        depth: 1,
                        row_pitch: pitch,
                    },
                },
            };
            let src = CopyLocation {
                resource: texture.0,
                kind: COPY_TYPE_SUBRESOURCE_INDEX,
                region: CopyRegion { subresource: 0 },
            };
            com!(
                list,
                SLOT_LIST_COPY_TEXTURE_REGION,
                fn(*const CopyLocation, u32, u32, u32, *const CopyLocation, *const c_void) -> (),
                &dst,
                0,
                0,
                0,
                &src,
                null()
            );
        }
    })?;

    let mapped = map(&readback)?;
    let line = (width * 4) as usize;
    let mut pixels = Vec::with_capacity(line * height as usize);
    for row in 0..height as usize {
        // SAFETY: the readback holds `pitch * height` bytes and the copy has completed.
        pixels.extend_from_slice(unsafe {
            core::slice::from_raw_parts(mapped.add(row * pitch as usize), line)
        });
    }
    unmap(&readback);
    Ok(pixels)
}

/// Uploads `data`, copies it through a default-heap buffer and reads it back. The copy is
/// padded to a multiple of 4 bytes; the result has the length of `data`.
pub(crate) fn copy_buffer(data: &[u8]) -> WinResult<Vec<u8>> {
    let size = (data.len() as u64).next_multiple_of(4);
    let mut gpu = Gpu::open()?;
    let upload = gpu.buffer(HEAP_TYPE_UPLOAD, size, STATE_GENERIC_READ)?;
    let device_buffer = gpu.buffer(HEAP_TYPE_DEFAULT, size, STATE_COPY_DEST)?;
    let readback = gpu.buffer(HEAP_TYPE_READBACK, size, STATE_COPY_DEST)?;

    let mapped = map(&upload)?;
    // SAFETY: the upload buffer maps `size` writable bytes and `data` fits within them.
    unsafe {
        core::ptr::write_bytes(mapped, 0, size as usize);
        core::ptr::copy_nonoverlapping(data.as_ptr(), mapped, data.len());
    }
    unmap(&upload);

    gpu.run(|list| {
        // SAFETY: `list` is recording; every resource stays alive until `run` returns.
        unsafe {
            com!(
                list,
                SLOT_LIST_COPY_BUFFER_REGION,
                fn(*mut c_void, u64, *mut c_void, u64, u64) -> (),
                device_buffer.0,
                0,
                upload.0,
                0,
                size
            );
            let barrier = transition(device_buffer.0, STATE_COPY_DEST, STATE_COPY_SOURCE);
            com!(
                list,
                SLOT_LIST_RESOURCE_BARRIER,
                fn(u32, *const ResourceBarrier) -> (),
                1,
                &barrier
            );
            com!(
                list,
                SLOT_LIST_COPY_BUFFER_REGION,
                fn(*mut c_void, u64, *mut c_void, u64, u64) -> (),
                readback.0,
                0,
                device_buffer.0,
                0,
                size
            );
        }
    })?;

    let mapped = map(&readback)?;
    let mut out = vec![0u8; data.len()];
    // SAFETY: the readback holds `size` bytes, at least `data.len()`, and the copy has completed.
    unsafe { core::ptr::copy_nonoverlapping(mapped, out.as_mut_ptr(), out.len()) };
    unmap(&readback);
    Ok(out)
}
