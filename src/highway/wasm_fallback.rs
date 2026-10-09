//! Scalar Rust versions of the `highway_*` kernels for wasm32, where the
//! Highway C++ objects are not linked. Same signatures and return contracts
//! (not-found is `len` for the byte scans, `usize::MAX` for `mem*mem*`).

use core::slice::{from_raw_parts, from_raw_parts_mut};

/// # Safety
/// `ptr` must be valid for reads of `len` elements (any value when `len == 0`).
#[inline]
unsafe fn s<'a, T>(ptr: *const T, len: usize) -> &'a [T] {
    if len == 0 {
        return &[];
    }
    // SAFETY: caller contract.
    unsafe { from_raw_parts(ptr, len) }
}

/// # Safety
/// `ptr` must be valid for writes of `len` elements (any value when `len == 0`).
#[inline]
unsafe fn s_mut<'a, T>(ptr: *mut T, len: usize) -> &'a mut [T] {
    if len == 0 {
        return &mut [];
    }
    // SAFETY: caller contract.
    unsafe { from_raw_parts_mut(ptr, len) }
}

#[inline]
fn first(h: &[u8], f: impl Fn(u8) -> bool) -> usize {
    h.iter().position(|&c| f(c)).unwrap_or(h.len())
}

fn find<T: Eq>(h: &[T], n: &[T]) -> Option<usize> {
    if n.is_empty() {
        return Some(0);
    }
    if h.len() < n.len() {
        return None;
    }
    (0..=h.len() - n.len()).find(|&i| h[i..i + n.len()] == *n)
}

fn rfind<T: Eq>(h: &[T], n: &[T]) -> Option<usize> {
    if n.is_empty() {
        return Some(h.len());
    }
    if h.len() < n.len() {
        return None;
    }
    (0..=h.len() - n.len()).rev().find(|&i| h[i..i + n.len()] == *n)
}

pub(crate) unsafe fn highway_index_of_char(haystack: *const u8, haystack_len: usize, needle: u8) -> usize {
    // SAFETY: caller contract.
    first(unsafe { s(haystack, haystack_len) }, |c| c == needle)
}

pub(crate) unsafe fn highway_last_index_of_char(haystack: *const u8, haystack_len: usize, needle: u8) -> usize {
    // SAFETY: caller contract.
    let h = unsafe { s(haystack, haystack_len) };
    h.iter().rposition(|&c| c == needle).unwrap_or(h.len())
}

pub(crate) unsafe fn highway_index_of_not_char(haystack: *const u8, haystack_len: usize, value: u8) -> usize {
    // SAFETY: caller contract.
    first(unsafe { s(haystack, haystack_len) }, |c| c != value)
}

pub(crate) unsafe fn highway_count_char(haystack: *const u8, haystack_len: usize, needle: u8) -> usize {
    // SAFETY: caller contract.
    unsafe { s(haystack, haystack_len) }.iter().filter(|&&c| c == needle).count()
}

pub(crate) unsafe fn highway_memmem(
    haystack: *const u8,
    haystack_len: usize,
    needle: *const u8,
    needle_len: usize,
) -> *const u8 {
    // SAFETY: caller contract.
    match find(unsafe { s(haystack, haystack_len) }, unsafe { s(needle, needle_len) }) {
        Some(i) => haystack.wrapping_add(i),
        None => core::ptr::null(),
    }
}

pub(crate) unsafe fn highway_memrmem(
    haystack: *const u8,
    haystack_len: usize,
    needle: *const u8,
    needle_len: usize,
) -> usize {
    // SAFETY: caller contract.
    rfind(unsafe { s(haystack, haystack_len) }, unsafe { s(needle, needle_len) }).unwrap_or(usize::MAX)
}

pub(crate) unsafe fn highway_memmem16(
    haystack: *const u16,
    haystack_len: usize,
    needle: *const u16,
    needle_len: usize,
) -> usize {
    // SAFETY: caller contract.
    find(unsafe { s(haystack, haystack_len) }, unsafe { s(needle, needle_len) }).unwrap_or(usize::MAX)
}

pub(crate) unsafe fn highway_memrmem16(
    haystack: *const u16,
    haystack_len: usize,
    needle: *const u16,
    needle_len: usize,
) -> usize {
    // SAFETY: caller contract.
    rfind(unsafe { s(haystack, haystack_len) }, unsafe { s(needle, needle_len) }).unwrap_or(usize::MAX)
}

pub(crate) unsafe fn highway_index_of_interesting_character_in_string_literal(
    text: *const u8,
    text_len: usize,
    quote: u8,
) -> usize {
    // SAFETY: caller contract.
    first(unsafe { s(text, text_len) }, |c| {
        c == quote || c == b'\\' || !(0x20..=0x7E).contains(&c)
    })
}

pub(crate) unsafe fn highway_index_of_interesting_character_in_multiline_comment(
    text: *const u8,
    text_len: usize,
) -> usize {
    // SAFETY: caller contract.
    first(unsafe { s(text, text_len) }, |c| {
        c == b'*' || c == b'\r' || c == b'\n' || c > 127
    })
}

pub(crate) unsafe fn highway_index_of_newline_or_non_ascii(haystack: *const u8, haystack_len: usize) -> usize {
    // SAFETY: caller contract.
    first(unsafe { s(haystack, haystack_len) }, |c| c > 127 || c < 0x20)
}

pub(crate) unsafe fn highway_index_of_newline_or_non_ascii_or_hash_or_at(
    haystack: *const u8,
    haystack_len: usize,
) -> usize {
    // SAFETY: caller contract.
    first(unsafe { s(haystack, haystack_len) }, |c| {
        c == b'#' || c == b'@' || !(0x20..=0x7E).contains(&c)
    })
}

pub(crate) unsafe fn highway_index_of_space_or_newline_or_non_ascii(
    haystack: *const u8,
    haystack_len: usize,
) -> usize {
    // SAFETY: caller contract.
    first(unsafe { s(haystack, haystack_len) }, |c| c <= b' ' || c > 127)
}

pub(crate) unsafe fn highway_contains_newline_or_non_ascii_or_quote(text: *const u8, text_len: usize) -> bool {
    // SAFETY: caller contract.
    unsafe { s(text, text_len) }
        .iter()
        .any(|&c| c > 127 || c < 0x20 || c == b'"')
}

pub(crate) unsafe fn highway_index_of_needs_escape_for_javascript_string(
    text: *const u8,
    text_len: usize,
    quote_char: u8,
) -> usize {
    let backtick = quote_char == b'`';
    // SAFETY: caller contract.
    first(unsafe { s(text, text_len) }, |c| {
        c >= 127 || c < 0x20 || c == b'\\' || c == quote_char || (backtick && c == b'$')
    })
}

pub(crate) unsafe fn highway_index_of_any_char(
    text: *const u8,
    text_len: usize,
    chars: *const u8,
    chars_len: usize,
) -> usize {
    // SAFETY: caller contract.
    let set = unsafe { s(chars, chars_len) };
    // SAFETY: caller contract.
    first(unsafe { s(text, text_len) }, |c| set.contains(&c))
}

pub(crate) unsafe fn highway_last_index_of_any_char(
    text: *const u8,
    text_len: usize,
    chars: *const u8,
    chars_len: usize,
) -> usize {
    // SAFETY: caller contract.
    let (h, set) = unsafe { (s(text, text_len), s(chars, chars_len)) };
    h.iter().rposition(|c| set.contains(c)).unwrap_or(h.len())
}

pub(crate) unsafe fn highway_fill_with_skip_mask(
    mask: *const u8,
    mask_len: usize,
    output: *mut u8,
    input: *const u8,
    length: usize,
    skip_mask: bool,
) {
    // SAFETY: caller contract; `output` may equal `input`, so go through raw
    // pointers (read before write per byte).
    unsafe {
        let mask = s(mask, mask_len);
        for i in 0..length {
            let b = input.add(i).read();
            output
                .add(i)
                .write(if skip_mask || mask.is_empty() { b } else { b ^ mask[i % mask.len()] });
        }
    }
}

pub(crate) unsafe fn highway_copy_u16_to_u8(input: *const u16, count: usize, output: *mut u8) {
    // SAFETY: caller contract.
    let (src, dst) = unsafe { (s(input, count), s_mut(output, count)) };
    for (d, &u) in dst.iter_mut().zip(src) {
        *d = u as u8;
    }
}

pub(crate) unsafe fn highway_copy_ascii_prefix(src: *const u8, len: usize, dst: *mut u8) -> usize {
    // SAFETY: caller contract.
    let (src, dst) = unsafe { (s(src, len), s_mut(dst, len)) };
    let n = first(src, |c| c > 0x7F);
    dst[..n].copy_from_slice(&src[..n]);
    n
}

pub(crate) unsafe fn highway_encode_hex_lower(input: *const u8, len: usize, output: *mut u8) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    // SAFETY: caller contract (`output` holds `2 * len` bytes).
    let (src, dst) = unsafe { (s(input, len), s_mut(output, len * 2)) };
    for (i, &b) in src.iter().enumerate() {
        dst[2 * i] = HEX[usize::from(b >> 4)];
        dst[2 * i + 1] = HEX[usize::from(b & 0x0F)];
    }
}

#[inline]
fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

fn decode_hex_pairs(out: &mut [u8], unit: impl Fn(usize) -> u8) -> usize {
    for (i, slot) in out.iter_mut().enumerate() {
        match (hex_val(unit(2 * i)), hex_val(unit(2 * i + 1))) {
            (Some(hi), Some(lo)) => *slot = (hi << 4) | lo,
            _ => return i,
        }
    }
    out.len()
}

pub(crate) unsafe fn highway_decode_hex8(input: *const u8, output: *mut u8, out_len: usize) -> usize {
    // SAFETY: caller contract (`input` holds `2 * out_len` bytes).
    let (src, dst) = unsafe { (s(input, out_len * 2), s_mut(output, out_len)) };
    decode_hex_pairs(dst, |i| src[i])
}

pub(crate) unsafe fn highway_decode_hex16(input: *const u16, output: *mut u8, out_len: usize) -> usize {
    // SAFETY: caller contract (`input` holds `2 * out_len` units).
    let (src, dst) = unsafe { (s(input, out_len * 2), s_mut(output, out_len)) };
    decode_hex_pairs(dst, |i| src[i] as u8)
}

pub(crate) unsafe fn highway_count_mapping_delims(bytes: *const u8, len: usize) -> usize {
    // SAFETY: caller contract.
    unsafe { s(bytes, len) }
        .iter()
        .filter(|&&c| c == b',' || c == b';')
        .count()
}

/// No SIMD pass on wasm32: zero rows, resume the scalar decoder at offset 0
/// with the accumulator untouched.
#[allow(clippy::too_many_arguments)]
pub(crate) unsafe fn highway_parse_mappings(
    _bytes: *const u8,
    _len: usize,
    _out_generated: *mut i32,
    _out_original: *mut i32,
    _out_src_idx: *mut i32,
    _out_name_idx: *mut i32,
    _cap: usize,
    _sources_count: i32,
    _state: *mut i32,
    err_at: *mut usize,
) -> usize {
    // SAFETY: caller passes a valid `err_at`.
    unsafe { err_at.write(0) };
    0
}

// ── xxHash (scalar port of src/jsc/bindings/xxhash3.cpp) ─────────────────────

const P32_1: u32 = 0x9E37_79B1;
const P32_2: u32 = 0x85EB_CA77;
const P32_3: u32 = 0xC2B2_AE3D;
const P32_4: u32 = 0x27D4_EB2F;
const P32_5: u32 = 0x1656_67B1;
const P64_1: u64 = 0x9E37_79B1_85EB_CA87;
const P64_2: u64 = 0xC2B2_AE3D_27D4_EB4F;
const P64_3: u64 = 0x1656_67B1_9E37_79F9;
const P64_4: u64 = 0x85EB_CA77_C2B2_AE63;
const P64_5: u64 = 0x27D4_EB2F_1656_67C5;
const PRIME_MX1: u64 = 0x1656_6791_9E37_79F9;
const PRIME_MX2: u64 = 0x9FB2_1C65_1E98_DF25;

const SECRET: [u8; 192] = [
    0xb8, 0xfe, 0x6c, 0x39, 0x23, 0xa4, 0x4b, 0xbe, 0x7c, 0x01, 0x81, 0x2c, 0xf7, 0x21, 0xad, 0x1c,
    0xde, 0xd4, 0x6d, 0xe9, 0x83, 0x90, 0x97, 0xdb, 0x72, 0x40, 0xa4, 0xa4, 0xb7, 0xb3, 0x67, 0x1f,
    0xcb, 0x79, 0xe6, 0x4e, 0xcc, 0xc0, 0xe5, 0x78, 0x82, 0x5a, 0xd0, 0x7d, 0xcc, 0xff, 0x72, 0x21,
    0xb8, 0x08, 0x46, 0x74, 0xf7, 0x43, 0x24, 0x8e, 0xe0, 0x35, 0x90, 0xe6, 0x81, 0x3a, 0x26, 0x4c,
    0x3c, 0x28, 0x52, 0xbb, 0x91, 0xc3, 0x00, 0xcb, 0x88, 0xd0, 0x65, 0x8b, 0x1b, 0x53, 0x2e, 0xa3,
    0x71, 0x64, 0x48, 0x97, 0xa2, 0x0d, 0xf9, 0x4e, 0x38, 0x19, 0xef, 0x46, 0xa9, 0xde, 0xac, 0xd8,
    0xa8, 0xfa, 0x76, 0x3f, 0xe3, 0x9c, 0x34, 0x3f, 0xf9, 0xdc, 0xbb, 0xc7, 0xc7, 0x0b, 0x4f, 0x1d,
    0x8a, 0x51, 0xe0, 0x4b, 0xcd, 0xb4, 0x59, 0x31, 0xc8, 0x9f, 0x7e, 0xc9, 0xd9, 0x78, 0x73, 0x64,
    0xea, 0xc5, 0xac, 0x83, 0x34, 0xd3, 0xeb, 0xc3, 0xc5, 0x81, 0xa0, 0xff, 0xfa, 0x13, 0x63, 0xeb,
    0x17, 0x0d, 0xdd, 0x51, 0xb7, 0xf0, 0xda, 0x49, 0xd3, 0x16, 0x55, 0x26, 0x29, 0xd4, 0x68, 0x9e,
    0x2b, 0x16, 0xbe, 0x58, 0x7d, 0x47, 0xa1, 0xfc, 0x8f, 0xf8, 0xb8, 0xd1, 0x7a, 0xd0, 0x31, 0xce,
    0x45, 0xcb, 0x3a, 0x8f, 0x95, 0x16, 0x04, 0x28, 0xaf, 0xd7, 0xfb, 0xca, 0xbb, 0x4b, 0x40, 0x7e,
];

#[inline]
fn r32(b: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}
#[inline]
fn r64(b: &[u8], at: usize) -> u64 {
    let mut a = [0u8; 8];
    a.copy_from_slice(&b[at..at + 8]);
    u64::from_le_bytes(a)
}
#[inline]
fn mul128_fold64(a: u64, b: u64) -> u64 {
    let p = u128::from(a) * u128::from(b);
    (p as u64) ^ ((p >> 64) as u64)
}
#[inline]
fn xxh64_avalanche(mut h: u64) -> u64 {
    h ^= h >> 33;
    h = h.wrapping_mul(P64_2);
    h ^= h >> 29;
    h = h.wrapping_mul(P64_3);
    h ^ (h >> 32)
}
#[inline]
fn avalanche(mut h: u64) -> u64 {
    h ^= h >> 37;
    h = h.wrapping_mul(PRIME_MX1);
    h ^ (h >> 32)
}
#[inline]
fn rrmxmx(mut h: u64, len: u64) -> u64 {
    h ^= h.rotate_left(49) ^ h.rotate_left(24);
    h = h.wrapping_mul(PRIME_MX2);
    h ^= (h >> 35).wrapping_add(len);
    h = h.wrapping_mul(PRIME_MX2);
    h ^ (h >> 28)
}
#[inline]
fn mix16b(input: &[u8], at: usize, secret: &[u8], sat: usize, seed: u64) -> u64 {
    mul128_fold64(
        r64(input, at) ^ r64(secret, sat).wrapping_add(seed),
        r64(input, at + 8) ^ r64(secret, sat + 8).wrapping_sub(seed),
    )
}

fn xxh3_0to16(input: &[u8], secret: &[u8], seed: u64) -> u64 {
    let len = input.len();
    if len > 8 {
        let bitflip1 = (r64(secret, 24) ^ r64(secret, 32)).wrapping_add(seed);
        let bitflip2 = (r64(secret, 40) ^ r64(secret, 48)).wrapping_sub(seed);
        let lo = r64(input, 0) ^ bitflip1;
        let hi = r64(input, len - 8) ^ bitflip2;
        let acc = (len as u64)
            .wrapping_add(lo.swap_bytes())
            .wrapping_add(hi)
            .wrapping_add(mul128_fold64(lo, hi));
        return avalanche(acc);
    }
    if len >= 4 {
        let seed = seed ^ (u64::from((seed as u32).swap_bytes()) << 32);
        let in1 = r32(input, 0);
        let in2 = r32(input, len - 4);
        let bitflip = (r64(secret, 8) ^ r64(secret, 16)).wrapping_sub(seed);
        let in64 = u64::from(in2).wrapping_add(u64::from(in1) << 32);
        return rrmxmx(in64 ^ bitflip, len as u64);
    }
    if len > 0 {
        let combined = (u32::from(input[0]) << 16)
            | (u32::from(input[len >> 1]) << 24)
            | u32::from(input[len - 1])
            | ((len as u32) << 8);
        let bitflip = u64::from(r32(secret, 0) ^ r32(secret, 4)).wrapping_add(seed);
        return xxh64_avalanche(u64::from(combined) ^ bitflip);
    }
    xxh64_avalanche(seed ^ (r64(secret, 56) ^ r64(secret, 64)))
}

fn xxh3_17to128(input: &[u8], secret: &[u8], seed: u64) -> u64 {
    let len = input.len();
    let mut acc = (len as u64).wrapping_mul(P64_1);
    if len > 32 {
        if len > 64 {
            if len > 96 {
                acc = acc.wrapping_add(mix16b(input, 48, secret, 96, seed));
                acc = acc.wrapping_add(mix16b(input, len - 64, secret, 112, seed));
            }
            acc = acc.wrapping_add(mix16b(input, 32, secret, 64, seed));
            acc = acc.wrapping_add(mix16b(input, len - 48, secret, 80, seed));
        }
        acc = acc.wrapping_add(mix16b(input, 16, secret, 32, seed));
        acc = acc.wrapping_add(mix16b(input, len - 32, secret, 48, seed));
    }
    acc = acc.wrapping_add(mix16b(input, 0, secret, 0, seed));
    acc = acc.wrapping_add(mix16b(input, len - 16, secret, 16, seed));
    avalanche(acc)
}

fn xxh3_129to240(input: &[u8], secret: &[u8], seed: u64) -> u64 {
    let len = input.len();
    let mut acc = (len as u64).wrapping_mul(P64_1);
    for i in 0..8 {
        acc = acc.wrapping_add(mix16b(input, 16 * i, secret, 16 * i, seed));
    }
    let mut acc_end = mix16b(input, len - 16, secret, 136 - 17, seed);
    acc = avalanche(acc);
    for i in 8..len / 16 {
        acc_end = acc_end.wrapping_add(mix16b(input, 16 * i, secret, 16 * (i - 8) + 3, seed));
    }
    avalanche(acc.wrapping_add(acc_end))
}

fn accumulate512(acc: &mut [u64; 8], input: &[u8], at: usize, secret: &[u8], sat: usize) {
    for i in 0..8 {
        let data = r64(input, at + 8 * i);
        let key = data ^ r64(secret, sat + 8 * i);
        acc[i ^ 1] = acc[i ^ 1].wrapping_add(data);
        acc[i] = acc[i].wrapping_add((key & 0xFFFF_FFFF).wrapping_mul(key >> 32));
    }
}

fn scramble(acc: &mut [u64; 8], secret: &[u8], sat: usize) {
    for (i, a) in acc.iter_mut().enumerate() {
        let mut v = *a ^ (*a >> 47);
        v ^= r64(secret, sat + 8 * i);
        *a = v.wrapping_mul(u64::from(P32_1));
    }
}

fn xxh3_long(input: &[u8], secret: &[u8]) -> u64 {
    let len = input.len();
    let mut acc: [u64; 8] = [
        u64::from(P32_3),
        P64_1,
        P64_2,
        P64_3,
        P64_4,
        u64::from(P32_2),
        P64_5,
        u64::from(P32_1),
    ];
    let stripes_per_block = (192 - 64) / 8;
    let block_len = 64 * stripes_per_block;
    let nb_blocks = (len - 1) / block_len;
    for n in 0..nb_blocks {
        for st in 0..stripes_per_block {
            accumulate512(&mut acc, input, n * block_len + st * 64, secret, st * 8);
        }
        scramble(&mut acc, secret, 192 - 64);
    }
    let nb_stripes = ((len - 1) - block_len * nb_blocks) / 64;
    for st in 0..nb_stripes {
        accumulate512(&mut acc, input, nb_blocks * block_len + st * 64, secret, st * 8);
    }
    accumulate512(&mut acc, input, len - 64, secret, 192 - 64 - 7);
    let mut result = (len as u64).wrapping_mul(P64_1);
    for i in 0..4 {
        result = result.wrapping_add(mul128_fold64(
            acc[2 * i] ^ r64(secret, 11 + 16 * i),
            acc[2 * i + 1] ^ r64(secret, 11 + 16 * i + 8),
        ));
    }
    avalanche(result)
}

pub(crate) unsafe fn highway_xxhash3_64(input: *const u8, len: usize, seed: u64) -> u64 {
    // SAFETY: caller contract.
    let input = unsafe { s(input, len) };
    if len <= 16 {
        return xxh3_0to16(input, &SECRET, seed);
    }
    if len <= 128 {
        return xxh3_17to128(input, &SECRET, seed);
    }
    if len <= 240 {
        return xxh3_129to240(input, &SECRET, seed);
    }
    if seed == 0 {
        return xxh3_long(input, &SECRET);
    }
    let mut custom = [0u8; 192];
    for i in 0..12 {
        let lo = r64(&SECRET, 16 * i).wrapping_add(seed);
        let hi = r64(&SECRET, 16 * i + 8).wrapping_sub(seed);
        custom[16 * i..16 * i + 8].copy_from_slice(&lo.to_le_bytes());
        custom[16 * i + 8..16 * i + 16].copy_from_slice(&hi.to_le_bytes());
    }
    xxh3_long(input, &custom)
}

#[inline]
fn xxh32_round(acc: u32, input: u32) -> u32 {
    acc.wrapping_add(input.wrapping_mul(P32_2))
        .rotate_left(13)
        .wrapping_mul(P32_1)
}

pub(crate) unsafe fn highway_xxhash32(input: *const u8, len: usize, seed: u32) -> u32 {
    // SAFETY: caller contract.
    let input = unsafe { s(input, len) };
    let mut p = 0;
    let mut h = if len >= 16 {
        let mut v = [
            seed.wrapping_add(P32_1).wrapping_add(P32_2),
            seed.wrapping_add(P32_2),
            seed,
            seed.wrapping_sub(P32_1),
        ];
        while p + 16 <= len {
            for (k, lane) in v.iter_mut().enumerate() {
                *lane = xxh32_round(*lane, r32(input, p + 4 * k));
            }
            p += 16;
        }
        v[0].rotate_left(1)
            .wrapping_add(v[1].rotate_left(7))
            .wrapping_add(v[2].rotate_left(12))
            .wrapping_add(v[3].rotate_left(18))
    } else {
        seed.wrapping_add(P32_5)
    };
    h = h.wrapping_add(len as u32);
    while p + 4 <= len {
        h = h.wrapping_add(r32(input, p).wrapping_mul(P32_3));
        h = h.rotate_left(17).wrapping_mul(P32_4);
        p += 4;
    }
    while p < len {
        h = h.wrapping_add(u32::from(input[p]).wrapping_mul(P32_5));
        h = h.rotate_left(11).wrapping_mul(P32_1);
        p += 1;
    }
    h ^= h >> 15;
    h = h.wrapping_mul(P32_2);
    h ^= h >> 13;
    h = h.wrapping_mul(P32_3);
    h ^ (h >> 16)
}

#[inline]
fn xxh64_round(acc: u64, input: u64) -> u64 {
    acc.wrapping_add(input.wrapping_mul(P64_2))
        .rotate_left(31)
        .wrapping_mul(P64_1)
}
#[inline]
fn xxh64_merge(acc: u64, val: u64) -> u64 {
    (acc ^ xxh64_round(0, val))
        .wrapping_mul(P64_1)
        .wrapping_add(P64_4)
}
fn xxh64_converge(v: &[u64; 4]) -> u64 {
    let mut h = v[0]
        .rotate_left(1)
        .wrapping_add(v[1].rotate_left(7))
        .wrapping_add(v[2].rotate_left(12))
        .wrapping_add(v[3].rotate_left(18));
    for &lane in v {
        h = xxh64_merge(h, lane);
    }
    h
}
fn xxh64_finalize(mut h: u64, tail: &[u8]) -> u64 {
    let mut p = 0;
    let len = tail.len();
    while p + 8 <= len {
        h ^= xxh64_round(0, r64(tail, p));
        h = h.rotate_left(27).wrapping_mul(P64_1).wrapping_add(P64_4);
        p += 8;
    }
    if p + 4 <= len {
        h ^= u64::from(r32(tail, p)).wrapping_mul(P64_1);
        h = h.rotate_left(23).wrapping_mul(P64_2).wrapping_add(P64_3);
        p += 4;
    }
    while p < len {
        h ^= u64::from(tail[p]).wrapping_mul(P64_5);
        h = h.rotate_left(11).wrapping_mul(P64_1);
        p += 1;
    }
    xxh64_avalanche(h)
}
fn xxh64_init(seed: u64) -> [u64; 4] {
    [
        seed.wrapping_add(P64_1).wrapping_add(P64_2),
        seed.wrapping_add(P64_2),
        seed,
        seed.wrapping_sub(P64_1),
    ]
}

pub(crate) unsafe fn highway_xxhash64(input: *const u8, len: usize, seed: u64) -> u64 {
    // SAFETY: caller contract.
    let input = unsafe { s(input, len) };
    let mut p = 0;
    let h = if len >= 32 {
        let mut v = xxh64_init(seed);
        while p + 32 <= len {
            for (k, lane) in v.iter_mut().enumerate() {
                *lane = xxh64_round(*lane, r64(input, p + 8 * k));
            }
            p += 32;
        }
        xxh64_converge(&v)
    } else {
        seed.wrapping_add(P64_5)
    };
    xxh64_finalize(h.wrapping_add(len as u64), &input[p..])
}

/// Mirror of the C++ `XXH64State` (80 bytes): total_len, v[4], mem[32], memsize.
#[repr(C)]
struct Xxh64State {
    total_len: u64,
    v: [u64; 4],
    mem: [u8; 32],
    memsize: u32,
    _pad: u32,
}
const _: () = assert!(size_of::<Xxh64State>() == 80);

pub(crate) unsafe fn highway_xxhash64_reset(state: *mut u8, seed: u64) {
    // SAFETY: caller passes 80 writable, 8-aligned bytes.
    unsafe {
        state.cast::<Xxh64State>().write(Xxh64State {
            total_len: 0,
            v: xxh64_init(seed),
            mem: [0; 32],
            memsize: 0,
            _pad: 0,
        })
    };
}

pub(crate) unsafe fn highway_xxhash64_update(state: *mut u8, input: *const u8, len: usize) {
    // SAFETY: caller passes a state initialised by `highway_xxhash64_reset`.
    let (st, input) = unsafe { (&mut *state.cast::<Xxh64State>(), s(input, len)) };
    if len == 0 {
        return;
    }
    st.total_len = st.total_len.wrapping_add(len as u64);
    let buffered = st.memsize as usize;
    if buffered + len < 32 {
        st.mem[buffered..buffered + len].copy_from_slice(input);
        st.memsize += len as u32;
        return;
    }
    let mut p = 0;
    if buffered > 0 {
        p = 32 - buffered;
        st.mem[buffered..].copy_from_slice(&input[..p]);
        let mem = st.mem;
        for (k, lane) in st.v.iter_mut().enumerate() {
            *lane = xxh64_round(*lane, r64(&mem, 8 * k));
        }
        st.memsize = 0;
    }
    while p + 32 <= len {
        for (k, lane) in st.v.iter_mut().enumerate() {
            *lane = xxh64_round(*lane, r64(input, p + 8 * k));
        }
        p += 32;
    }
    if p < len {
        st.mem[..len - p].copy_from_slice(&input[p..]);
        st.memsize = (len - p) as u32;
    }
}

pub(crate) unsafe fn highway_xxhash64_digest(state: *const u8) -> u64 {
    // SAFETY: caller passes a state initialised by `highway_xxhash64_reset`.
    let st = unsafe { &*state.cast::<Xxh64State>() };
    let h = if st.total_len >= 32 {
        xxh64_converge(&st.v)
    } else {
        st.v[2].wrapping_add(P64_5)
    };
    xxh64_finalize(h.wrapping_add(st.total_len), &st.mem[..st.memsize as usize])
}
