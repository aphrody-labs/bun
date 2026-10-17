//! One-shot deflate/zlib/gzip over zlib-rs: the whole input in one call, into a
//! caller-sized output buffer. Used where the complete payload is in memory
//! (`Bun.gzipSync`, HTTP bodies, tarballs); streams go through [`crate::ZlibReaderArrayList`].

use core::ffi::c_int;
use core::mem::MaybeUninit;

use bun_alloc::AllocError;
use zlib_rs::ReturnCode;
use zlib_rs::deflate::{self, DeflateConfig};
use zlib_rs::inflate::{self, InflateConfig};

/// Accepted `level` range. Levels above zlib's 9 compress at 9.
pub const MIN_COMPRESSION_LEVEL: c_int = 0;
pub const MAX_COMPRESSION_LEVEL: c_int = 12;

/// gzip's header and trailer exceed zlib's wrapper by this many bytes.
const GZIP_BOUND_EXTRA: usize = 18 - 6;

#[derive(Copy, Clone, Eq, PartialEq)]
pub enum Encoding {
    Deflate,
    Zlib,
    Gzip,
}

impl Encoding {
    fn window_bits(self) -> i32 {
        match self {
            Encoding::Deflate => -zlib_rs::MAX_WBITS,
            Encoding::Zlib => zlib_rs::MAX_WBITS,
            Encoding::Gzip => zlib_rs::MAX_WBITS + 16,
        }
    }
}

#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum Status {
    Success,
    BadData,
    ShortOutput,
    InsufficientSpace,
}

pub struct Result {
    pub read: usize,
    pub written: usize,
    pub status: Status,
}

pub struct Compressor {
    level: c_int,
}

impl Compressor {
    pub fn max_bytes_needed(&mut self, input: &[u8], encoding: Encoding) -> usize {
        let bound = deflate::bound(None, input.len());
        if encoding == Encoding::Gzip { bound + GZIP_BOUND_EXTRA } else { bound }
    }

    pub fn compress(&mut self, input: &[u8], output: &mut [u8], encoding: Encoding) -> Result {
        let config = self.config(encoding);
        let (written, rc) = deflate::compress_slice(output, input, config);
        compressed(input.len(), written.len(), rc)
    }

    /// Like [`compress`](Self::compress) into a possibly-uninitialized buffer
    /// (e.g. `Vec::spare_capacity_mut()`). On success, `output[..result.written]` is initialized.
    fn compress_into(&mut self, input: &[u8], output: &mut [MaybeUninit<u8>], encoding: Encoding) -> Result {
        let config = self.config(encoding);
        let (written, rc) = deflate::compress(output, input, config);
        compressed(input.len(), written.len(), rc)
    }

    /// Compress `input` onto the end of `out`, reserving the bound first; `Err` if that allocation fails.
    pub fn compress_to_vec(
        &mut self,
        input: &[u8],
        out: &mut Vec<u8>,
        encoding: Encoding,
    ) -> core::result::Result<Result, AllocError> {
        out.try_reserve_exact(self.max_bytes_needed(input, encoding))
            .map_err(|_| AllocError)?;
        let result = self.compress_into(input, out.spare_capacity_mut(), encoding);
        if result.status == Status::Success {
            // SAFETY: `compress_into` initialized spare[..result.written].
            unsafe { out.set_len(out.len() + result.written) };
        }
        Ok(result)
    }

    fn config(&self, encoding: Encoding) -> DeflateConfig {
        DeflateConfig {
            level: self.level.min(9),
            window_bits: encoding.window_bits(),
            ..DeflateConfig::default()
        }
    }
}

/// A compressor at a fixed level.
#[repr(transparent)]
pub struct OwnedCompressor(Box<Compressor>);

impl OwnedCompressor {
    /// `None` if `level` is outside [`MIN_COMPRESSION_LEVEL`]..=[`MAX_COMPRESSION_LEVEL`].
    #[inline]
    pub fn new(level: c_int) -> Option<Self> {
        (MIN_COMPRESSION_LEVEL..=MAX_COMPRESSION_LEVEL)
            .contains(&level)
            .then(|| Self(Box::new(Compressor { level })))
    }
}

impl core::ops::Deref for OwnedCompressor {
    type Target = Compressor;
    #[inline]
    fn deref(&self) -> &Compressor {
        &self.0
    }
}

impl core::ops::DerefMut for OwnedCompressor {
    #[inline]
    fn deref_mut(&mut self) -> &mut Compressor {
        &mut self.0
    }
}

pub struct Decompressor;

impl Decompressor {
    pub fn decompress(&mut self, input: &[u8], output: &mut [u8], encoding: Encoding) -> Result {
        // SAFETY: a `[u8]` is a valid `[MaybeUninit<u8>]`, and inflate only writes.
        let output = unsafe { core::slice::from_raw_parts_mut(output.as_mut_ptr().cast(), output.len()) };
        self.decompress_into(input, output, encoding)
    }

    /// Like [`decompress`](Self::decompress) into a possibly-uninitialized buffer.
    /// On [`Status::Success`], `output[..result.written]` is initialized.
    fn decompress_into(&mut self, input: &[u8], output: &mut [MaybeUninit<u8>], encoding: Encoding) -> Result {
        let config = InflateConfig {
            window_bits: encoding.window_bits(),
        };
        let (read, written, rc) = inflate::uncompress2(output, input, config);
        let status = match rc {
            ReturnCode::Ok => Status::Success,
            // uncompress2 reports a full output buffer as a buffer error and a truncated input as a data error.
            ReturnCode::BufError => Status::InsufficientSpace,
            _ => Status::BadData,
        };
        Result {
            read: usize::try_from(read).unwrap_or(input.len()),
            written: written.len(),
            status,
        }
    }

    /// Decompress `input` into `out`'s **spare capacity** (append mode).
    ///
    /// Does not clear, retry or grow `out`. On [`Status::Success`], `out.len()`
    /// is advanced by `result.written`; otherwise it is left unchanged.
    pub fn decompress_to_vec(&mut self, input: &[u8], out: &mut Vec<u8>, encoding: Encoding) -> Result {
        let result = self.decompress_into(input, out.spare_capacity_mut(), encoding);
        if result.status == Status::Success {
            // SAFETY: `decompress_into` initialized spare[..result.written].
            unsafe { out.set_len(out.len() + result.written) };
        }
        result
    }

    /// [`decompress_to_vec`](Self::decompress_to_vec) with a doubling retry loop.
    ///
    /// Clears `out` first, then doubles its capacity on
    /// [`Status::InsufficientSpace`] — clamped at `max_capacity` — until
    /// success, hard error, or `out.capacity() >= max_capacity` (returned as
    /// the final `InsufficientSpace`). On success, `out.len() == result.written`.
    /// `Err` when a growth step cannot be allocated.
    pub fn decompress_to_vec_grow(
        &mut self,
        input: &[u8],
        out: &mut Vec<u8>,
        encoding: Encoding,
        max_capacity: usize,
    ) -> core::result::Result<Result, AllocError> {
        loop {
            out.clear();
            let result = self.decompress_to_vec(input, out, encoding);
            if result.status != Status::InsufficientSpace || out.capacity() >= max_capacity {
                return Ok(result);
            }
            let new_cap = out.capacity().max(1).saturating_mul(2).min(max_capacity);
            out.try_reserve_exact(new_cap.saturating_sub(out.len()))
                .map_err(|_| AllocError)?;
        }
    }
}

/// A decompressor; holds no state between calls.
#[repr(transparent)]
pub struct OwnedDecompressor(Box<Decompressor>);

impl OwnedDecompressor {
    #[inline]
    pub fn new() -> Option<Self> {
        Some(Self(Box::new(Decompressor)))
    }
}

impl core::ops::Deref for OwnedDecompressor {
    type Target = Decompressor;
    #[inline]
    fn deref(&self) -> &Decompressor {
        &self.0
    }
}

impl core::ops::DerefMut for OwnedDecompressor {
    #[inline]
    fn deref_mut(&mut self) -> &mut Decompressor {
        &mut self.0
    }
}

fn compressed(read: usize, written: usize, rc: ReturnCode) -> Result {
    Result {
        read,
        // libdeflate's contract, kept by the callers: 0 bytes written means the output was too small.
        written: if rc == ReturnCode::Ok { written } else { 0 },
        status: Status::Success,
    }
}
