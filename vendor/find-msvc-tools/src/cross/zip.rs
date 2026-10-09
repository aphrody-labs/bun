//! Zip reader for VSIX payloads (stored and deflated entries).

use super::inflate::inflate;

fn u16_at(data: &[u8], at: usize) -> Result<u16, String> {
    data.get(at..at + 2).map(|b| u16::from_le_bytes([b[0], b[1]])).ok_or_else(|| "truncated zip".into())
}

fn u32_at(data: &[u8], at: usize) -> Result<u32, String> {
    data.get(at..at + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]])).ok_or_else(|| "truncated zip".into())
}

/// VSIX entry names are percent-encoded (`%2B` for `+`).
pub fn decode_name(name: &str) -> String {
    let bytes = name.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && bytes[i + 1].is_ascii_hexdigit()
            && bytes[i + 2].is_ascii_hexdigit()
        {
            out.push(u8::from_str_radix(&name[i + 1..i + 3], 16).unwrap_or(b'%'));
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Calls `each(name, contents)` for every file entry (directories are skipped).
pub fn for_each(data: &[u8], mut each: impl FnMut(&str, &[u8]) -> Result<(), String>) -> Result<(), String> {
    let search_from = data.len().saturating_sub(22 + 65535);
    let eocd = (search_from..data.len().saturating_sub(21))
        .rev()
        .find(|&i| data[i..i + 4] == [0x50, 0x4b, 0x05, 0x06])
        .ok_or("not a zip archive")?;
    let entries = u16_at(data, eocd + 10)? as usize;
    let mut at = u32_at(data, eocd + 16)? as usize;
    let mut contents = Vec::new();
    for _ in 0..entries {
        if u32_at(data, at)? != 0x0201_4b50 {
            return Err("corrupt zip central directory".into());
        }
        let method = u16_at(data, at + 10)?;
        let compressed = u32_at(data, at + 20)? as usize;
        let size = u32_at(data, at + 24)? as usize;
        let name_len = u16_at(data, at + 28)? as usize;
        let extra_len = u16_at(data, at + 30)? as usize;
        let comment_len = u16_at(data, at + 32)? as usize;
        let local = u32_at(data, at + 42)? as usize;
        let name = data.get(at + 46..at + 46 + name_len).ok_or("truncated zip")?;
        let name = decode_name(&String::from_utf8_lossy(name));
        at += 46 + name_len + extra_len + comment_len;
        if name.ends_with('/') {
            continue;
        }
        if compressed == 0xffff_ffff || size == 0xffff_ffff || local == 0xffff_ffff {
            return Err(format!("{name}: zip64 entries are not supported"));
        }
        if u32_at(data, local)? != 0x0403_4b50 {
            return Err("corrupt zip local header".into());
        }
        let start = local + 30 + u16_at(data, local + 26)? as usize + u16_at(data, local + 28)? as usize;
        let raw = data.get(start..start + compressed).ok_or("truncated zip entry")?;
        match method {
            0 => each(&name, raw)?,
            8 => {
                contents.clear();
                contents.reserve(size);
                inflate(raw, &mut contents).map_err(|e| format!("{name}: {e}"))?;
                if contents.len() != size {
                    return Err(format!("{name}: size mismatch"));
                }
                each(&name, &contents)?;
            }
            other => return Err(format!("{name}: unsupported zip compression method {other}")),
        }
    }
    Ok(())
}

#[cfg(test)]
pub(crate) fn build(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for (name, data) in files {
        let offset = out.len() as u32;
        let deflated = super::inflate::stored(data);
        let mut header = Vec::new();
        header.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        header.extend_from_slice(&[20, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        header.extend_from_slice(&(deflated.len() as u32).to_le_bytes());
        header.extend_from_slice(&(data.len() as u32).to_le_bytes());
        header.extend_from_slice(&(name.len() as u16).to_le_bytes());
        header.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&header);
        out.extend_from_slice(name.as_bytes());
        out.extend_from_slice(&deflated);
        central.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
        central.extend_from_slice(&[20, 0, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        central.extend_from_slice(&(deflated.len() as u32).to_le_bytes());
        central.extend_from_slice(&(data.len() as u32).to_le_bytes());
        central.extend_from_slice(&(name.len() as u16).to_le_bytes());
        central.extend_from_slice(&[0; 12]);
        central.extend_from_slice(&offset.to_le_bytes());
        central.extend_from_slice(name.as_bytes());
    }
    let cd_offset = out.len() as u32;
    out.extend_from_slice(&central);
    out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    out.extend_from_slice(&[0; 4]);
    out.extend_from_slice(&(files.len() as u16).to_le_bytes());
    out.extend_from_slice(&(files.len() as u16).to_le_bytes());
    out.extend_from_slice(&(central.len() as u32).to_le_bytes());
    out.extend_from_slice(&cd_offset.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_entries_and_decodes_names() {
        let zip = super::build(&[("Contents/a%2Bb.h", b"#pragma once\n"), ("Contents/dir/", b""), ("x.txt", b"x")]);
        let mut seen = Vec::new();
        super::for_each(&zip, |name, data| {
            seen.push((name.to_owned(), data.to_vec()));
            Ok(())
        })
        .unwrap();
        assert_eq!(seen, vec![("Contents/a+b.h".to_owned(), b"#pragma once\n".to_vec()), ("x.txt".to_owned(), b"x".to_vec())]);
    }
}
