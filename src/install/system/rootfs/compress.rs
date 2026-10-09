//! Decompressors for package archives: gzip (member by member, so callers can
//! hash each compressed segment), xz and zstd.

use super::super::{Error, Result};

/// One gzip member: its compressed byte range in the input and its contents.
pub struct GzMember {
    pub start: usize,
    pub end: usize,
    pub data: Vec<u8>,
}

/// Decodes every concatenated gzip member of `input` separately.
pub fn gunzip_members(input: &[u8], what: &str) -> Result<Vec<GzMember>> {
    use bun_zlib::{FlushValue, InflateDecoder, ReturnCode};
    let bad = || Error::Parse(format!("{what}: corrupt gzip data"));
    let mut members = Vec::new();
    let mut pos = 0usize;
    while pos < input.len() {
        if input.len() - pos < 18 || input[pos] != 0x1f || input[pos + 1] != 0x8b {
            if members.is_empty() {
                return Err(bad());
            }
            // Trailing padding after the last member (some mirrors append zeros).
            break;
        }
        let mut dec = InflateDecoder::new(bun_zlib::MAX_WBITS | 16).map_err(|_| bad())?;
        let start = pos;
        let mut data: Vec<u8> = Vec::new();
        loop {
            let reserve = (input.len() - pos).saturating_mul(4).clamp(64 * 1024, 16 * 1024 * 1024);
            let (consumed, rc) = dec.step(&input[pos..], &mut data, reserve, FlushValue::NoFlush);
            pos += consumed;
            match rc {
                ReturnCode::StreamEnd => break,
                ReturnCode::Ok => {}
                ReturnCode::BufError if consumed == 0 && pos >= input.len() => return Err(bad()),
                ReturnCode::BufError => {}
                _ => return Err(bad()),
            }
        }
        members.push(GzMember { start, end: pos, data });
    }
    Ok(members)
}

/// All members of a gzip stream, concatenated.
pub fn gunzip(input: &[u8], what: &str) -> Result<Vec<u8>> {
    let mut members = gunzip_members(input, what)?;
    if members.len() == 1 {
        return Ok(members.pop().map(|m| m.data).unwrap_or_default());
    }
    let mut out = Vec::new();
    for m in members {
        out.extend_from_slice(&m.data);
    }
    Ok(out)
}

/// xz container (every stream, LZMA2 blocks) over `lzma_rust2`'s raw LZMA2 decoder.
pub fn unxz(input: &[u8], what: &str) -> Result<Vec<u8>> {
    let bad = |why: &str| Error::Parse(format!("{what}: corrupt xz data ({why})"));
    const MAGIC: &[u8] = &[0xfd, b'7', b'z', b'X', b'Z', 0];
    let mut out = Vec::new();
    let mut pos = 0usize;
    while pos < input.len() {
        if input[pos..].iter().all(|&b| b == 0) {
            break;
        }
        if !input[pos..].starts_with(MAGIC) || input.len() - pos < 12 {
            return Err(bad("bad stream header"));
        }
        let check = input[pos + 7] & 0x0f;
        let check_len = match check {
            0 => 0,
            1..=3 => 4,
            4..=6 => 8,
            7..=9 => 16,
            10..=12 => 32,
            _ => 64,
        };
        pos += 12;
        loop {
            let size_byte = *input.get(pos).ok_or_else(|| bad("truncated"))?;
            if size_byte == 0 {
                break;
            }
            let header_len = (usize::from(size_byte) + 1) * 4;
            let header = input.get(pos..pos + header_len).ok_or_else(|| bad("truncated block header"))?;
            let flags = header[1];
            let mut h = 2usize;
            if flags & 0x40 != 0 {
                read_vli(header, &mut h).ok_or_else(|| bad("block header"))?;
            }
            if flags & 0x80 != 0 {
                read_vli(header, &mut h).ok_or_else(|| bad("block header"))?;
            }
            let filters = usize::from(flags & 3) + 1;
            let mut dict_size = None;
            for _ in 0..filters {
                let id = read_vli(header, &mut h).ok_or_else(|| bad("filter flags"))?;
                let props_len = read_vli(header, &mut h).ok_or_else(|| bad("filter flags"))? as usize;
                let props = header.get(h..h + props_len).ok_or_else(|| bad("filter flags"))?;
                h += props_len;
                match id {
                    0x21 if props_len == 1 => {
                        let bits = u32::from(props[0] & 0x3f);
                        dict_size = Some(if bits >= 40 { u32::MAX } else { (2 | (bits & 1)) << (bits / 2 + 11) });
                    }
                    _ => {
                        return Err(Error::Unsupported(format!(
                            "{what}: xz filter 0x{id:x} is not supported (only LZMA2)"
                        )));
                    }
                }
            }
            let dict_size = dict_size.ok_or_else(|| bad("no LZMA2 filter"))?;
            pos += header_len;
            let mut rest: &[u8] = &input[pos..];
            let mut reader = lzma_rust2::Lzma2Reader::new(&mut rest, dict_size, None);
            std::io::Read::read_to_end(&mut reader, &mut out).map_err(|e| bad(&e.to_string()))?;
            drop(reader);
            pos = input.len() - rest.len();
            while pos % 4 != 0 {
                pos += 1;
            }
            pos += check_len;
        }
        // Index: indicator, record count, records, padding, CRC32; then the 12-byte footer.
        let mut i = pos + 1;
        let records = read_vli(input, &mut i).ok_or_else(|| bad("index"))?;
        for _ in 0..records {
            read_vli(input, &mut i).ok_or_else(|| bad("index"))?;
            read_vli(input, &mut i).ok_or_else(|| bad("index"))?;
        }
        while i % 4 != 0 {
            i += 1;
        }
        pos = i + 4 + 12;
        if pos > input.len() {
            return Err(bad("truncated index"));
        }
        while pos < input.len() && input[pos] == 0 {
            pos += 1;
        }
    }
    Ok(out)
}

fn read_vli(buf: &[u8], pos: &mut usize) -> Option<u64> {
    let mut value = 0u64;
    for shift in 0..9 {
        let b = *buf.get(*pos)?;
        *pos += 1;
        value |= u64::from(b & 0x7f) << (shift * 7);
        if b & 0x80 == 0 {
            return Some(value);
        }
    }
    None
}

pub fn unzstd(input: &[u8], what: &str) -> Result<Vec<u8>> {
    bun_zstd::decompress_alloc(input).map_err(|_| Error::Parse(format!("{what}: corrupt zstd data")))
}

/// Picks the decoder from the magic bytes (or returns `input` as is).
pub fn decompress_auto(input: &[u8], what: &str) -> Result<Vec<u8>> {
    if input.starts_with(&[0x1f, 0x8b]) {
        gunzip(input, what)
    } else if input.starts_with(&[0xfd, b'7', b'z', b'X', b'Z', 0]) {
        unxz(input, what)
    } else if input.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
        unzstd(input, what)
    } else if input.starts_with(b"BZh") {
        Err(Error::Unsupported(format!("{what}: bzip2 archives are not supported")))
    } else {
        Ok(input.to_vec())
    }
}

/// Gzip-compresses `data` as one member (used to write test fixtures and caches).
pub fn gzip(data: &[u8]) -> Vec<u8> {
    use bun_zlib::{DeflateEncoder, FlushValue, ReturnCode};
    let mut out = Vec::new();
    let Ok(mut enc) = DeflateEncoder::new(6, bun_zlib::MAX_WBITS | 16, 8, 0) else {
        return out;
    };
    let mut pos = 0;
    loop {
        let (consumed, rc) = enc.step(&data[pos..], &mut out, 64 * 1024, FlushValue::Finish);
        pos += consumed;
        if rc == ReturnCode::StreamEnd || !matches!(rc, ReturnCode::Ok | ReturnCode::BufError) {
            break;
        }
    }
    out
}
