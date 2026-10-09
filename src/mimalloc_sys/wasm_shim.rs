//! `mi_*` over `std::alloc::System` for wasm32, where mimalloc is not linked.
//!
//! Every block carries a [`Header`] right before the user pointer so
//! `mi_usable_size`/`mi_free` work without a size, and blocks of a
//! non-main heap are kept on an intrusive list so `mi_heap_destroy` frees them.

use core::alloc::{GlobalAlloc, Layout};
use core::ffi::{c_long, c_void};
use core::ptr::null_mut;
use core::sync::atomic::{AtomicBool, Ordering};
use std::alloc::System;

use super::{Heap, MI_MAX_ALIGN_SIZE, Option as MiOption, mi_block_visit_fun, mi_heap_area_t, mi_output_fun};

#[repr(C)]
struct Header {
    prev: *mut Header,
    next: *mut Header,
    heap: *mut HeapState,
    offset: usize,
    size: usize,
    align: usize,
}

struct HeapState {
    lock: AtomicBool,
    head: *mut Header,
}

struct MainHeap(core::cell::UnsafeCell<u8>);
// SAFETY: the main-heap sentinel is never read or written; only its address is used.
unsafe impl Sync for MainHeap {}
static MAIN_HEAP: MainHeap = MainHeap(core::cell::UnsafeCell::new(0));

fn main_heap() -> *mut Heap {
    MAIN_HEAP.0.get().cast::<Heap>()
}

fn tracked(heap: *mut Heap) -> *mut HeapState {
    if heap.is_null() || heap == main_heap() {
        null_mut()
    } else {
        heap.cast::<HeapState>()
    }
}

impl HeapState {
    fn lock(&self) {
        while self
            .lock
            .compare_exchange_weak(false, true, Ordering::Acquire, Ordering::Relaxed)
            .is_err()
        {
            core::hint::spin_loop();
        }
    }
    fn unlock(&self) {
        self.lock.store(false, Ordering::Release);
    }
}

#[inline]
fn header_of(p: *const c_void) -> *mut Header {
    p.cast::<u8>()
        .wrapping_sub(size_of::<Header>())
        .cast_mut()
        .cast::<Header>()
}

fn layout_for(size: usize, align: usize) -> core::option::Option<(Layout, usize, usize)> {
    let align = align
        .max(MI_MAX_ALIGN_SIZE)
        .max(align_of::<Header>())
        .next_power_of_two();
    let offset = size_of::<Header>().checked_next_multiple_of(align)?;
    let layout = Layout::from_size_align(offset.checked_add(size.max(1))?, align).ok()?;
    Some((layout, offset, align))
}

fn alloc_in(heap: *mut HeapState, size: usize, align: usize, zero: bool) -> *mut c_void {
    let Some((layout, offset, align)) = layout_for(size, align) else {
        return null_mut();
    };
    // SAFETY: `layout` has a non-zero size.
    let base = unsafe {
        if zero {
            System.alloc_zeroed(layout)
        } else {
            System.alloc(layout)
        }
    };
    if base.is_null() {
        return null_mut();
    }
    let user = base.wrapping_add(offset);
    let header = header_of(user.cast());
    // SAFETY: `offset >= size_of::<Header>()` and `offset` is a multiple of an
    // alignment >= `align_of::<Header>()`, so `header` is in-bounds and aligned.
    unsafe {
        header.write(Header {
            prev: null_mut(),
            next: null_mut(),
            heap,
            offset,
            size,
            align,
        });
        if !heap.is_null() {
            let state = &*heap;
            state.lock();
            (*header).next = state.head;
            if !state.head.is_null() {
                (*state.head).prev = header;
            }
            (*heap).head = header;
            state.unlock();
        }
    }
    user.cast()
}

/// # Safety
/// `header` must belong to a live block.
unsafe fn release(header: *mut Header, unlink: bool) {
    // SAFETY: caller guarantees `header` is live; the heap (if any) outlives its blocks.
    unsafe {
        let h = &*header;
        if unlink && !h.heap.is_null() {
            let state = &*h.heap;
            state.lock();
            if h.prev.is_null() {
                (*h.heap).head = h.next;
            } else {
                (*h.prev).next = h.next;
            }
            if !h.next.is_null() {
                (*h.next).prev = h.prev;
            }
            state.unlock();
        }
        let layout = Layout::from_size_align_unchecked(h.offset + h.size.max(1), h.align);
        let base = header.cast::<u8>().add(size_of::<Header>()).sub(h.offset);
        System.dealloc(base, layout);
    }
}

/// # Safety
/// `p` must be null or a live block from this module.
unsafe fn realloc_in(heap: *mut HeapState, p: *mut c_void, newsize: usize, align: usize) -> *mut c_void {
    if p.is_null() {
        return alloc_in(heap, newsize, align, false);
    }
    // SAFETY: `p` is a live block, so its header is readable.
    let (old_size, old_heap) = unsafe {
        let h = &*header_of(p);
        (h.size, h.heap)
    };
    let heap = if heap.is_null() { old_heap } else { heap };
    let q = alloc_in(heap, newsize, align, false);
    if q.is_null() {
        return null_mut();
    }
    // SAFETY: both blocks are live, distinct, and at least `min(old, new)` bytes long.
    unsafe {
        core::ptr::copy_nonoverlapping(p.cast::<u8>(), q.cast::<u8>(), old_size.min(newsize));
        release(header_of(p), true);
    }
    q
}

pub fn mi_malloc(size: usize) -> *mut c_void {
    alloc_in(null_mut(), size, 1, false)
}
pub fn mi_calloc(count: usize, size: usize) -> *mut c_void {
    match count.checked_mul(size) {
        Some(n) => alloc_in(null_mut(), n, 1, true),
        None => null_mut(),
    }
}
/// # Safety
/// `p` must be null or a live block from this allocator.
pub unsafe fn mi_realloc(p: *mut c_void, newsize: usize) -> *mut c_void {
    // SAFETY: forwarded caller contract.
    unsafe { realloc_in(null_mut(), p, newsize, 1) }
}
/// # Safety
/// `p` must be null or a live block from this allocator.
pub unsafe fn mi_expand(p: *mut c_void, newsize: usize) -> *mut c_void {
    // SAFETY: forwarded caller contract.
    if !p.is_null() && newsize <= unsafe { mi_usable_size(p) } {
        p
    } else {
        null_mut()
    }
}
/// # Safety
/// `p` must be null or a live block from this allocator.
pub unsafe fn mi_free(p: *mut c_void) {
    if !p.is_null() {
        // SAFETY: forwarded caller contract.
        unsafe { release(header_of(p), true) }
    }
}
pub fn mi_zalloc(size: usize) -> *mut c_void {
    alloc_in(null_mut(), size, 1, true)
}
/// # Safety
/// `p` must be null or a live block from this allocator.
pub unsafe fn mi_usable_size(p: *const c_void) -> usize {
    if p.is_null() {
        return 0;
    }
    // SAFETY: forwarded caller contract.
    unsafe { (*header_of(p)).size }
}

pub fn mi_collect(_force: bool) {}
pub fn mi_on_thread_idle() {}
/// # Safety
/// Always returns false, so no idle-end call is required.
pub unsafe fn mi_on_thread_idle_start() -> bool {
    false
}
pub fn mi_on_thread_idle_end() {}
/// # Safety
/// No-op.
pub unsafe fn mi_stats_print_out(_out: core::option::Option<mi_output_fun>, _arg: *mut c_void) {
}
/// # Safety
/// Every pointer must be valid for a `usize` write.
#[allow(clippy::too_many_arguments)]
pub unsafe fn mi_process_info(
    elapsed_msecs: *mut usize,
    user_msecs: *mut usize,
    system_msecs: *mut usize,
    current_rss: *mut usize,
    peak_rss: *mut usize,
    current_commit: *mut usize,
    peak_commit: *mut usize,
    page_faults: *mut usize,
) {
    for p in [
        elapsed_msecs,
        user_msecs,
        system_msecs,
        current_rss,
        peak_rss,
        current_commit,
        peak_commit,
        page_faults,
    ] {
        if !p.is_null() {
            // SAFETY: caller contract.
            unsafe { p.write(0) }
        }
    }
}
pub fn mi_malloc_aligned(size: usize, alignment: usize) -> *mut c_void {
    alloc_in(null_mut(), size, alignment, false)
}
pub fn mi_zalloc_aligned(size: usize, alignment: usize) -> *mut c_void {
    alloc_in(null_mut(), size, alignment, true)
}
/// # Safety
/// `p` must be null or a live block from this allocator.
pub unsafe fn mi_realloc_aligned(p: *mut c_void, newsize: usize, alignment: usize) -> *mut c_void {
    // SAFETY: forwarded caller contract.
    unsafe { realloc_in(null_mut(), p, newsize, alignment) }
}

/// # Safety
/// The returned heap must be released with `mi_heap_destroy`.
pub unsafe fn mi_heap_new() -> *mut Heap {
    let layout = Layout::new::<HeapState>();
    // SAFETY: `HeapState` has a non-zero size.
    let state = unsafe { System.alloc(layout) }.cast::<HeapState>();
    if state.is_null() {
        return null_mut();
    }
    // SAFETY: freshly allocated, properly aligned.
    unsafe {
        state.write(HeapState {
            lock: AtomicBool::new(false),
            head: null_mut(),
        })
    };
    state.cast::<Heap>()
}
/// # Safety
/// `heap` must come from `mi_heap_new` and not be used afterwards.
pub unsafe fn mi_heap_destroy(heap: *mut Heap) {
    let state = tracked(heap);
    if state.is_null() {
        return;
    }
    // SAFETY: `state` is a live heap owned by the caller; its blocks die with it.
    unsafe {
        let mut cur = (*state).head;
        while !cur.is_null() {
            let next = (*cur).next;
            release(cur, false);
            cur = next;
        }
        System.dealloc(state.cast::<u8>(), Layout::new::<HeapState>());
    }
}
/// # Safety
/// No preconditions.
pub unsafe fn mi_heap_main() -> *mut Heap {
    main_heap()
}
/// # Safety
/// `heap` must be live.
pub unsafe fn mi_heap_malloc(heap: *mut Heap, size: usize) -> *mut c_void {
    alloc_in(tracked(heap), size, 1, false)
}
/// # Safety
/// `heap` must be live.
pub(super) unsafe fn mi_heap_zalloc(heap: *mut Heap, size: usize) -> *mut c_void {
    alloc_in(tracked(heap), size, 1, true)
}
/// # Safety
/// `heap` must be live; `p` null or a live block.
pub unsafe fn mi_heap_realloc(heap: *mut Heap, p: *mut c_void, newsize: usize) -> *mut c_void {
    // SAFETY: forwarded caller contract.
    unsafe { realloc_in(tracked(heap), p, newsize, 1) }
}
/// # Safety
/// `heap` must be live.
pub unsafe fn mi_heap_malloc_aligned(heap: *mut Heap, size: usize, alignment: usize) -> *mut c_void {
    alloc_in(tracked(heap), size, alignment, false)
}
/// # Safety
/// `heap` must be live.
pub(super) unsafe fn mi_heap_zalloc_aligned(heap: *mut Heap, size: usize, alignment: usize) -> *mut c_void {
    alloc_in(tracked(heap), size, alignment, true)
}
/// # Safety
/// `heap` must be live; `p` null or a live block.
pub unsafe fn mi_heap_realloc_aligned(
    heap: *mut Heap,
    p: *mut c_void,
    newsize: usize,
    alignment: usize,
) -> *mut c_void {
    // SAFETY: forwarded caller contract.
    unsafe { realloc_in(tracked(heap), p, newsize, alignment) }
}

/// # Safety
/// `heap` must be live; `visitor` must not allocate in or free from `heap`.
pub unsafe fn mi_heap_visit_blocks(
    heap: *const Heap,
    visit_all_blocks: bool,
    visitor: core::option::Option<mi_block_visit_fun>,
    arg: *mut c_void,
) -> bool {
    let state = tracked(heap.cast_mut());
    let Some(visitor) = visitor else {
        return true;
    };
    if state.is_null() {
        return true;
    }
    // SAFETY: `state` is live; the visitor does not mutate the list.
    unsafe {
        (*state).lock();
        let mut cur = (*state).head;
        let mut ok = true;
        while ok && !cur.is_null() {
            let size = (*cur).size;
            let block = cur.cast::<u8>().add(size_of::<Header>()).cast::<c_void>();
            let area = mi_heap_area_t {
                blocks: block,
                reserved: size,
                committed: size,
                used: 1,
                block_size: size,
                full_block_size: size,
                reserved1: null_mut(),
            };
            ok = visitor(heap, &raw const area, null_mut(), size, arg);
            if ok && visit_all_blocks {
                ok = visitor(heap, &raw const area, block, size, arg);
            }
            cur = (*cur).next;
        }
        (*state).unlock();
        ok
    }
}
/// # Safety
/// No preconditions.
pub unsafe fn mi_is_in_heap_region(p: *const c_void) -> bool {
    !p.is_null()
}

pub fn mi_option_set(_option: MiOption, _value: c_long) {}
/// # Safety
/// `p` must be null or a live block from this allocator.
pub unsafe fn mi_malloc_usable_size(p: *const c_void) -> usize {
    // SAFETY: forwarded caller contract.
    unsafe { mi_usable_size(p) }
}
/// # Safety
/// `p` must be null or a live block from this allocator.
pub unsafe fn mi_free_size(p: *mut c_void, _size: usize) {
    // SAFETY: forwarded caller contract.
    unsafe { mi_free(p) }
}
/// # Safety
/// `p` must be null or a live block from this allocator.
pub unsafe fn mi_free_size_aligned(p: *mut c_void, _size: usize, _alignment: usize) {
    // SAFETY: forwarded caller contract.
    unsafe { mi_free(p) }
}
