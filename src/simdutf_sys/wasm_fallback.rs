//! Scalar Rust versions of the `simdutf__*` entry points for wasm32, where the
//! simdutf C++ objects are not linked. Same signatures and result contract.
#![allow(non_snake_case)]

use core::ffi::c_int;

use crate::simdutf::{SIMDUTFResult, Status};

const HEADER_BITS: Status = Status(1);
const TOO_LONG: Status = Status(3);
const OVERLONG: Status = Status(4);
const TOO_LARGE: Status = Status(5);
const BASE64_INPUT_REMAINDER: Status = Status(8);
const OUTPUT_BUFFER_TOO_SMALL: Status = Status(10);

#[inline]
fn ok(count: usize) -> SIMDUTFResult {
    SIMDUTFResult { status: Status::SUCCESS, count }
}
#[inline]
fn err(status: Status, count: usize) -> SIMDUTFResult {
    SIMDUTFResult { status, count }
}

/// # Safety
/// `ptr` must be valid for reads of `len` elements (any value when `len == 0`).
unsafe fn slice<'a, T>(ptr: *const T, len: usize) -> &'a [T] {
    if len == 0 {
        return &[];
    }
    // SAFETY: caller contract.
    unsafe { core::slice::from_raw_parts(ptr, len) }
}

/// # Safety
/// `ptr` must be valid for writes of `len` elements (any value when `len == 0`).
unsafe fn slice_mut<'a, T>(ptr: *mut T, len: usize) -> &'a mut [T] {
    if len == 0 {
        return &mut [];
    }
    // SAFETY: caller contract.
    unsafe { core::slice::from_raw_parts_mut(ptr, len) }
}

fn utf8_error(input: &[u8]) -> Option<SIMDUTFResult> {
    let e = core::str::from_utf8(input).err()?;
    let at = e.valid_up_to();
    let b = input[at];
    let next = input.get(at + 1).copied().unwrap_or(0);
    let status = if e.error_len().is_none() {
        Status::TOO_SHORT
    } else if (0x80..0xC0).contains(&b) {
        TOO_LONG
    } else if b >= 0xF8 {
        HEADER_BITS
    } else if b == 0xC0 || b == 0xC1 || (b == 0xE0 && next < 0xA0) || (b == 0xF0 && next < 0x90) {
        OVERLONG
    } else if b == 0xED && next >= 0xA0 {
        Status::SURROGATE
    } else if b >= 0xF5 || (b == 0xF4 && next >= 0x90) {
        TOO_LARGE
    } else {
        Status::TOO_SHORT
    };
    Some(err(status, at))
}

fn utf16_error(input: &[u16]) -> Option<usize> {
    let mut i = 0;
    while i < input.len() {
        let u = input[i];
        if (0xD800..0xDC00).contains(&u) {
            match input.get(i + 1) {
                Some(&lo) if (0xDC00..0xE000).contains(&lo) => i += 2,
                _ => return Some(i),
            }
        } else if (0xDC00..0xE000).contains(&u) {
            return Some(i);
        } else {
            i += 1;
        }
    }
    None
}

fn encode_utf16_as_utf8(input: &[u16], out: &mut [u8]) -> usize {
    let mut n = 0;
    for c in char::decode_utf16(input.iter().copied()) {
        let c = c.unwrap_or(char::REPLACEMENT_CHARACTER);
        n += c.encode_utf8(&mut out[n..]).len();
    }
    n
}

/// # Safety
/// `buf` must be valid for `len` bytes.
pub unsafe fn simdutf__validate_utf8(buf: *const u8, len: usize) -> bool {
    // SAFETY: caller contract.
    core::str::from_utf8(unsafe { slice(buf, len) }).is_ok()
}
/// # Safety
/// `buf` must be valid for `len` bytes.
pub unsafe fn simdutf__validate_utf8_with_errors(buf: *const u8, len: usize) -> SIMDUTFResult {
    // SAFETY: caller contract.
    let input = unsafe { slice(buf, len) };
    utf8_error(input).unwrap_or(ok(len))
}
/// # Safety
/// `buf` must be valid for `len` bytes.
pub unsafe fn simdutf__validate_ascii(buf: *const u8, len: usize) -> bool {
    // SAFETY: caller contract.
    unsafe { slice(buf, len) }.is_ascii()
}
/// # Safety
/// `buf` must be valid for `len` bytes.
pub unsafe fn simdutf__validate_ascii_with_errors(buf: *const u8, len: usize) -> SIMDUTFResult {
    // SAFETY: caller contract.
    let input = unsafe { slice(buf, len) };
    match input.iter().position(|b| !b.is_ascii()) {
        Some(at) => err(TOO_LARGE, at),
        None => ok(len),
    }
}
/// # Safety
/// `buf` must be valid for `len` u16s.
pub unsafe fn simdutf__validate_utf16le(buf: *const u16, len: usize) -> bool {
    // SAFETY: caller contract.
    utf16_error(unsafe { slice(buf, len) }).is_none()
}
/// # Safety
/// `buf` valid for `len` bytes; `utf16_output` large enough for the converted text.
pub unsafe fn simdutf__convert_utf8_to_utf16le_with_errors(
    buf: *const u8,
    len: usize,
    utf16_output: *mut u16,
) -> SIMDUTFResult {
    // SAFETY: caller contract.
    let input = unsafe { slice(buf, len) };
    if let Some(e) = utf8_error(input) {
        return e;
    }
    // SAFETY: validated above.
    let s = unsafe { core::str::from_utf8_unchecked(input) };
    let mut n = 0;
    for unit in s.encode_utf16() {
        // SAFETY: caller guarantees capacity for every produced unit.
        unsafe { utf16_output.add(n).write(unit) };
        n += 1;
    }
    ok(n)
}
/// # Safety
/// `buf` valid for `len` u16s; `utf8_buffer` large enough for the converted text.
pub unsafe fn simdutf__convert_utf16le_to_utf8_with_errors(
    buf: *const u16,
    len: usize,
    utf8_buffer: *mut u8,
) -> SIMDUTFResult {
    // SAFETY: caller contract.
    let input = unsafe { slice(buf, len) };
    if let Some(at) = utf16_error(input) {
        return err(Status::SURROGATE, at);
    }
    // SAFETY: caller guarantees capacity for the UTF-8 length of `input`.
    let out = unsafe { slice_mut(utf8_buffer, utf8_len_utf16(input, 3)) };
    ok(encode_utf16_as_utf8(input, out))
}
/// # Safety
/// `buf` valid for `len` u16s; `utf8_buffer` large enough for the converted text.
pub unsafe fn simdutf__convert_valid_utf16le_to_utf8(buf: *const u16, len: usize, utf8_buffer: *mut u8) -> usize {
    // SAFETY: caller contract.
    let input = unsafe { slice(buf, len) };
    // SAFETY: caller guarantees capacity for the UTF-8 length of `input`.
    let out = unsafe { slice_mut(utf8_buffer, utf8_len_utf16(input, 3)) };
    encode_utf16_as_utf8(input, out)
}

fn utf8_len_utf16(input: &[u16], unpaired: usize) -> usize {
    char::decode_utf16(input.iter().copied())
        .map(|c| c.map_or(unpaired, char::len_utf8))
        .sum()
}

/// # Safety
/// `input` must be valid for `length` u16s.
pub unsafe fn simdutf__utf8_length_from_utf16le(input: *const u16, length: usize) -> usize {
    // SAFETY: caller contract.
    unsafe { slice(input, length) }
        .iter()
        .map(|&u| match u {
            0..0x80 => 1,
            0x80..0x800 => 2,
            0xD800..0xE000 => 2,
            _ => 3,
        })
        .sum()
}
/// # Safety
/// `input` must be valid for `length` u16s.
pub unsafe fn simdutf__utf8_length_from_utf16le_with_replacement(input: *const u16, length: usize) -> usize {
    // SAFETY: caller contract.
    utf8_len_utf16(unsafe { slice(input, length) }, 3)
}
/// # Safety
/// `input` must be valid for `length` bytes.
pub unsafe fn simdutf__utf16_length_from_utf8(input: *const u8, length: usize) -> usize {
    // SAFETY: caller contract.
    unsafe { slice(input, length) }
        .iter()
        .map(|&b| usize::from(b & 0xC0 != 0x80) + usize::from(b >= 0xF0))
        .sum()
}
/// # Safety
/// `input` must be valid for `length` bytes.
pub unsafe fn simdutf__utf8_length_from_latin1(input: *const u8, length: usize) -> usize {
    // SAFETY: caller contract.
    length + unsafe { slice(input, length) }.iter().filter(|b| !b.is_ascii()).count()
}

const STD: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

fn base64_value(c: u8, std: bool, url: bool) -> Option<u8> {
    Some(match c {
        b'A'..=b'Z' => c - b'A',
        b'a'..=b'z' => c - b'a' + 26,
        b'0'..=b'9' => c - b'0' + 52,
        b'+' if std => 62,
        b'/' if std => 63,
        b'-' if url => 62,
        b'_' if url => 63,
        _ => return None,
    })
}

#[inline]
fn is_base64_space(c: u8) -> bool {
    matches!(c, b' ' | b'\t' | b'\n' | b'\x0C' | b'\r')
}

fn base64_len(length: usize, is_urlsafe: bool) -> usize {
    if is_urlsafe {
        length / 3 * 4 + [0, 2, 3][length % 3]
    } else {
        length.div_ceil(3) * 4
    }
}

/// # Safety
/// `output` must be valid for `base64_len(length, is_urlsafe)` bytes.
pub(crate) unsafe fn simdutf__base64_encode(input: *const u8, length: usize, output: *mut u8, is_urlsafe: c_int) -> usize {
    let url = is_urlsafe != 0;
    let table = if url { URL } else { STD };
    // SAFETY: caller contract.
    let input = unsafe { slice(input, length) };
    let total = base64_len(length, url);
    // SAFETY: caller contract.
    let out = unsafe { slice_mut(output, total) };
    let mut n = 0;
    for chunk in input.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let quad = [
            table[usize::from(b[0] >> 2)],
            table[usize::from(((b[0] & 0x03) << 4) | (b[1] >> 4))],
            table[usize::from(((b[1] & 0x0F) << 2) | (b[2] >> 6))],
            table[usize::from(b[2] & 0x3F)],
        ];
        let keep = chunk.len() + 1;
        for (i, &c) in quad.iter().enumerate() {
            if i < keep {
                out[n] = c;
                n += 1;
            } else if !url {
                out[n] = b'=';
                n += 1;
            }
        }
    }
    n
}

/// # Safety
/// No preconditions.
pub(crate) unsafe fn simdutf__base64_length_from_binary(length: usize, options: c_int) -> usize {
    base64_len(length, options != 0)
}

fn flush_quantum(acc: u32, count: usize, out: &mut [u8], n: &mut usize) -> bool {
    let bytes = match count {
        4 => 3,
        3 => 2,
        2 => 1,
        _ => 0,
    };
    let word = acc << (6 * (4 - count as u32));
    for i in 0..bytes {
        let Some(slot) = out.get_mut(*n) else {
            return false;
        };
        *slot = (word >> (16 - 8 * i)) as u8;
        *n += 1;
    }
    true
}

fn base64_decode(input: &[u8], out: &mut [u8], std: bool, url: bool, lenient: bool) -> SIMDUTFResult {
    let mut end = input.len();
    while end > 0 && is_base64_space(input[end - 1]) {
        end -= 1;
    }
    let mut padding = 0;
    if !lenient {
        while end > 0 && (input[end - 1] == b'=' || is_base64_space(input[end - 1])) {
            if input[end - 1] == b'=' {
                padding += 1;
            }
            end -= 1;
        }
        if padding > 2 {
            return err(Status::INVALID_BASE64_CHARACTER, end);
        }
    }
    let (mut acc, mut count, mut total, mut n) = (0u32, 0usize, 0usize, 0usize);
    for (i, &c) in input[..end].iter().enumerate() {
        if let Some(v) = base64_value(c, std, url) {
            acc = (acc << 6) | u32::from(v);
            count += 1;
            total += 1;
            if count == 4 {
                if !flush_quantum(acc, 4, out, &mut n) {
                    return err(OUTPUT_BUFFER_TOO_SMALL, n);
                }
                acc = 0;
                count = 0;
            }
        } else if lenient {
            if c == b'=' {
                break;
            }
        } else if !is_base64_space(c) {
            return err(Status::INVALID_BASE64_CHARACTER, i);
        }
    }
    if !lenient {
        if padding > 0 && (total + padding) % 4 != 0 {
            return err(Status::INVALID_BASE64_CHARACTER, end);
        }
        if count == 1 {
            return err(BASE64_INPUT_REMAINDER, n);
        }
    }
    if !flush_quantum(acc, count, out, &mut n) {
        return err(OUTPUT_BUFFER_TOO_SMALL, n);
    }
    ok(n)
}

/// # Safety
/// `input` valid for `length` bytes; `output` valid for `outlen` bytes.
pub(crate) unsafe fn simdutf__base64_decode_from_binary(
    input: *const u8,
    length: usize,
    output: *mut u8,
    outlen: usize,
    is_urlsafe: c_int,
) -> SIMDUTFResult {
    let url = is_urlsafe != 0;
    // SAFETY: caller contract.
    let (input, out) = unsafe { (slice(input, length), slice_mut(output, outlen)) };
    base64_decode(input, out, !url, url, false)
}

/// # Safety
/// `input` valid for `length` bytes; `output` valid for `outlen` bytes.
pub(crate) unsafe fn simdutf__base64_decode_from_binary_lenient(
    input: *const u8,
    length: usize,
    output: *mut u8,
    outlen: usize,
) -> SIMDUTFResult {
    // SAFETY: caller contract.
    let (input, out) = unsafe { (slice(input, length), slice_mut(output, outlen)) };
    base64_decode(input, out, true, true, true)
}
