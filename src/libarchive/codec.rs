//! Streaming gzip and raw-deflate codecs over zlib-rs, for the tar reader and writer.

use core::ffi::c_int;

use bun_zlib::{FlushValue, ReturnCode, z_stream};

const Z_DEFLATED: c_int = 8;
const Z_DEFAULT_STRATEGY: c_int = 0;
const MAX_WBITS: c_int = 15;
const STREAM_SIZE: c_int = core::mem::size_of::<z_stream>() as c_int;

/// What one [`Inflater::run`] call reached.
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub(crate) enum InflateStatus {
    /// More input is needed, or more output space.
    Progress,
    /// The member (gzip) or stream (raw) ended; its trailer checked out.
    End,
}

/// A zlib inflate stream. Boxed: zlib keeps a pointer back to the `z_stream`.
pub(crate) struct Inflater {
    strm: Box<z_stream>,
}

impl Inflater {
    /// A gzip member decoder; the CRC-32 and length in the trailer are verified.
    pub(crate) fn gzip() -> Option<Self> {
        Self::new(MAX_WBITS + 16)
    }

    /// A raw deflate decoder (zip entries).
    pub(crate) fn raw() -> Option<Self> {
        Self::new(-MAX_WBITS)
    }

    fn new(window_bits: c_int) -> Option<Self> {
        let mut strm: Box<z_stream> = bun_core::boxed_zeroed();
        // SAFETY: `strm` is a zeroed, boxed (address-stable) stream; zlib's version string is static.
        let rc = unsafe {
            bun_zlib::inflateInit2_(&raw mut *strm, window_bits, bun_zlib::zlibVersion().cast::<u8>(), STREAM_SIZE)
        };
        (rc == ReturnCode::Ok).then_some(Self { strm })
    }

    /// Starts the next member of a multi-member gzip stream.
    pub(crate) fn reset(&mut self) {
        // SAFETY: `strm` was initialized by `inflateInit2_`.
        let _ = unsafe { bun_zlib::inflateReset(&raw mut *self.strm) };
    }

    /// Inflates from `input` into `out`'s spare capacity, at most `max_out` bytes. Returns the input consumed.
    /// `Err` on corrupt data, including a gzip trailer that does not match.
    pub(crate) fn run(
        &mut self,
        input: &[u8],
        out: &mut Vec<u8>,
        max_out: usize,
    ) -> Result<(usize, InflateStatus), ()> {
        if out.try_reserve(max_out).is_err() {
            return Err(());
        }
        let in_len = input.len().min(u32::MAX as usize);
        let out_len = max_out.min(u32::MAX as usize);
        let spare = out.spare_capacity_mut();
        self.strm.next_in = input.as_ptr();
        self.strm.avail_in = in_len as u32;
        self.strm.next_out = spare.as_mut_ptr().cast::<u8>();
        self.strm.avail_out = out_len as u32;
        // SAFETY: next_in/next_out point at `in_len` readable and `out_len` writable bytes.
        let rc = unsafe { bun_zlib::inflate(&raw mut *self.strm, FlushValue::NoFlush) };
        let consumed = in_len - self.strm.avail_in as usize;
        let produced = out_len - self.strm.avail_out as usize;
        // SAFETY: inflate initialized `produced` bytes of the spare capacity.
        unsafe { out.set_len(out.len() + produced) };
        self.strm.next_in = core::ptr::null();
        self.strm.next_out = core::ptr::null_mut();
        match rc {
            ReturnCode::Ok => Ok((consumed, InflateStatus::Progress)),
            ReturnCode::BufError if consumed == 0 && produced == 0 => Ok((0, InflateStatus::Progress)),
            ReturnCode::BufError => Ok((consumed, InflateStatus::Progress)),
            ReturnCode::StreamEnd => Ok((consumed, InflateStatus::End)),
            _ => Err(()),
        }
    }
}

impl Drop for Inflater {
    fn drop(&mut self) {
        // SAFETY: `strm` was initialized by `inflateInit2_` and is ended once.
        let _ = unsafe { bun_zlib::inflateEnd(&raw mut *self.strm) };
    }
}

/// Inflates a whole raw-deflate buffer whose output size is known (a zip entry).
pub(crate) fn inflate_raw_exact(input: &[u8], size: usize) -> Option<Vec<u8>> {
    let mut inflater = Inflater::raw()?;
    let mut out = Vec::new();
    out.try_reserve_exact(size).ok()?;
    let mut consumed = 0;
    loop {
        let room = (size - out.len()).max(1);
        let before = out.len();
        let (used, status) = inflater.run(&input[consumed..], &mut out, room).ok()?;
        consumed += used;
        if out.len() > size {
            return None;
        }
        if status == InflateStatus::End {
            return (out.len() == size).then_some(out);
        }
        if used == 0 && out.len() == before {
            return None;
        }
    }
}

/// A raw deflate stream (the body of a gzip member or a zip entry).
pub(crate) struct Deflater {
    strm: Box<z_stream>,
}

impl Deflater {
    pub(crate) fn raw(level: c_int) -> Option<Self> {
        let mut strm: Box<z_stream> = bun_core::boxed_zeroed();
        // SAFETY: `strm` is a zeroed, boxed (address-stable) stream; zlib's version string is static.
        let rc = unsafe {
            bun_zlib::deflateInit2_(
                &raw mut *strm,
                level,
                Z_DEFLATED,
                -MAX_WBITS,
                8,
                Z_DEFAULT_STRATEGY,
                bun_zlib::zlibVersion().cast::<u8>(),
                STREAM_SIZE,
            )
        };
        (rc == ReturnCode::Ok).then_some(Self { strm })
    }

    /// Compresses all of `input` onto `out`; with `finish`, also flushes the end of the stream.
    pub(crate) fn run(&mut self, input: &[u8], finish: bool, out: &mut Vec<u8>) -> Result<(), ()> {
        let mut input = input;
        loop {
            if out.try_reserve(64 * 1024).is_err() {
                return Err(());
            }
            let in_len = input.len().min(u32::MAX as usize);
            let spare = out.spare_capacity_mut();
            let out_len = spare.len().min(u32::MAX as usize);
            self.strm.next_in = input.as_ptr();
            self.strm.avail_in = in_len as u32;
            self.strm.next_out = spare.as_mut_ptr().cast::<u8>();
            self.strm.avail_out = out_len as u32;
            let flush = if finish && in_len == input.len() { FlushValue::Finish } else { FlushValue::NoFlush };
            // SAFETY: next_in/next_out point at `in_len` readable and `out_len` writable bytes.
            let rc = unsafe { bun_zlib::deflate(&raw mut *self.strm, flush) };
            let consumed = in_len - self.strm.avail_in as usize;
            let produced = out_len - self.strm.avail_out as usize;
            // SAFETY: deflate initialized `produced` bytes of the spare capacity.
            unsafe { out.set_len(out.len() + produced) };
            self.strm.next_in = core::ptr::null();
            self.strm.next_out = core::ptr::null_mut();
            input = &input[consumed..];
            match rc {
                ReturnCode::StreamEnd => return Ok(()),
                ReturnCode::Ok | ReturnCode::BufError => {
                    if !finish && input.is_empty() && self.strm.avail_out != 0 {
                        return Ok(());
                    }
                }
                _ => return Err(()),
            }
        }
    }
}

impl Drop for Deflater {
    fn drop(&mut self) {
        // SAFETY: `strm` was initialized by `deflateInit2_` and is ended once.
        let _ = unsafe { bun_zlib::deflateEnd(&raw mut *self.strm) };
    }
}

/// The zlib CRC-32 of `data`, continuing `crc`.
pub(crate) fn crc32(crc: u32, data: &[u8]) -> u32 {
    bun_zlib::crc32_bytes(crc, data)
}
