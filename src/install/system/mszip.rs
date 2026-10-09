//! MSZIP container used by winget's `*.mszyml` files: a 24-byte header
//! (`magic[8]`, `u64` uncompressed size, `u64` block size), then blocks of
//! `u32` length + `"CK"` + raw deflate. Each block may reference the previous
//! 32 KiB of output, so it is inflated with that window as dictionary.

use bun_zlib::{FlushValue, ReturnCode, z_stream as zStream_struct};

use super::{Error, Result};

const WINDOW: usize = 32 * 1024;

fn bad(what: &str) -> Error {
    Error::Parse(format!("malformed MSZIP data ({what})"))
}

fn le32(b: &[u8], at: usize) -> Result<usize> {
    let s = b.get(at..at + 4).ok_or_else(|| bad("truncated"))?;
    Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]) as usize)
}

pub fn decode(data: &[u8]) -> Result<Vec<u8>> {
    if data.len() < 24 {
        return Err(bad("short header"));
    }
    let total = u64::from_le_bytes(data[8..16].try_into().expect("8 bytes"));
    let total = usize::try_from(total).map_err(|_| bad("size"))?;
    if total > 256 * 1024 * 1024 {
        return Err(bad("size"));
    }
    let mut out: Vec<u8> = Vec::with_capacity(total);
    let mut at = 24;
    while at < data.len() && out.len() < total {
        let len = le32(data, at)?;
        at += 4;
        let block = data.get(at..at + len).ok_or_else(|| bad("truncated block"))?;
        at += len;
        let deflated = block.strip_prefix(b"CK").ok_or_else(|| bad("missing CK"))?;
        let dict_start = out.len().saturating_sub(WINDOW);
        let dict = out[dict_start..].to_vec();
        inflate_block(deflated, &dict, &mut out, total)?;
    }
    if out.len() != total {
        return Err(bad("size mismatch"));
    }
    Ok(out)
}

fn inflate_block(input: &[u8], dict: &[u8], out: &mut Vec<u8>, total: usize) -> Result<()> {
    let mut strm: zStream_struct = bun_core::ffi::zeroed();
    // SAFETY: `strm` is zeroed (the documented pre-init state) and lives for this call.
    let rc = unsafe {
        bun_zlib::inflateInit2_(
            &raw mut strm,
            -15,
            bun_zlib::zlibVersion().cast::<u8>(),
            size_of::<zStream_struct>() as core::ffi::c_int,
        )
    };
    if rc != ReturnCode::Ok {
        return Err(bad("inflateInit2"));
    }
    let _end = scopeguard::guard(&raw mut strm, |s| {
        // SAFETY: `s` was initialized by inflateInit2_ above.
        unsafe { bun_zlib::inflateEnd(s) };
    });
    if !dict.is_empty() {
        // SAFETY: stream initialized; `dict` is readable for its length.
        let rc = unsafe { bun_zlib::inflateSetDictionary(&raw mut strm, dict.as_ptr(), dict.len() as _) };
        if rc != ReturnCode::Ok {
            return Err(bad("dictionary"));
        }
    }
    strm.next_in = input.as_ptr();
    strm.avail_in = input.len() as _;
    loop {
        let room = (total - out.len()).clamp(1, WINDOW);
        out.reserve(room);
        let before = out.len();
        // SAFETY: `reserve` guarantees `room` writable bytes past `len`.
        strm.next_out = unsafe { out.as_mut_ptr().add(before) };
        strm.avail_out = room as _;
        // SAFETY: stream initialized; in/out pointers valid for their avail counts.
        let rc = unsafe { bun_zlib::inflate(&raw mut strm, FlushValue::NoFlush) };
        let produced = room - strm.avail_out as usize;
        // SAFETY: zlib wrote `produced` initialized bytes at `before`.
        unsafe { out.set_len(before + produced) };
        match rc {
            ReturnCode::StreamEnd => return Ok(()),
            ReturnCode::Ok if produced > 0 || strm.avail_in > 0 => {
                if out.len() > total {
                    return Err(bad("overrun"));
                }
            }
            ReturnCode::Ok | ReturnCode::BufError => return Ok(()),
            _ => return Err(bad("inflate")),
        }
    }
}
