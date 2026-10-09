//! Cabinet (.cab) reader for the Windows SDK payloads: uncompressed and MSZIP folders.

use super::inflate::inflate;

fn u16_at(data: &[u8], at: usize) -> Result<u16, String> {
    data.get(at..at + 2).map(|b| u16::from_le_bytes([b[0], b[1]])).ok_or_else(|| "truncated cabinet".into())
}

fn u32_at(data: &[u8], at: usize) -> Result<u32, String> {
    data.get(at..at + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]])).ok_or_else(|| "truncated cabinet".into())
}

fn cstr(data: &[u8], at: usize) -> Result<(String, usize), String> {
    let rest = data.get(at..).ok_or("truncated cabinet")?;
    let end = rest.iter().position(|&b| b == 0).ok_or("truncated cabinet name")?;
    Ok((String::from_utf8_lossy(&rest[..end]).into_owned(), at + end + 1))
}

struct Folder {
    data_offset: usize,
    blocks: usize,
    compression: u16,
}

/// Calls `each(name, contents)` for every file of the cabinet, folder by folder.
pub fn for_each(data: &[u8], mut each: impl FnMut(&str, &[u8]) -> Result<(), String>) -> Result<(), String> {
    if data.get(0..4) != Some(b"MSCF") {
        return Err("not a cabinet".into());
    }
    let files_offset = u32_at(data, 16)? as usize;
    let folders = u16_at(data, 26)? as usize;
    let files = u16_at(data, 28)? as usize;
    let flags = u16_at(data, 30)?;
    let mut at = 36;
    let (mut folder_reserve, mut data_reserve) = (0usize, 0usize);
    if flags & 4 != 0 {
        let header_reserve = u16_at(data, 36)? as usize;
        folder_reserve = data[38] as usize;
        data_reserve = data[39] as usize;
        at = 40 + header_reserve;
    }
    if flags & 1 != 0 {
        at = cstr(data, cstr(data, at)?.1)?.1;
    }
    if flags & 2 != 0 {
        at = cstr(data, cstr(data, at)?.1)?.1;
    }
    let mut folder_list = Vec::with_capacity(folders);
    for _ in 0..folders {
        folder_list.push(Folder {
            data_offset: u32_at(data, at)? as usize,
            blocks: u16_at(data, at + 4)? as usize,
            compression: u16_at(data, at + 6)?,
        });
        at += 8 + folder_reserve;
    }
    let mut by_folder: Vec<Vec<(String, usize, usize)>> = vec![Vec::new(); folders];
    let mut at = files_offset;
    for _ in 0..files {
        let size = u32_at(data, at)? as usize;
        let offset = u32_at(data, at + 4)? as usize;
        let folder = u16_at(data, at + 8)? as usize;
        let (name, next) = cstr(data, at + 16)?;
        at = next;
        if folder >= folders {
            return Err(format!("{name}: files spanning cabinets are not supported"));
        }
        by_folder[folder].push((name, offset, size));
    }
    let mut out = Vec::new();
    for (folder, entries) in folder_list.iter().zip(by_folder) {
        if entries.is_empty() {
            continue;
        }
        out.clear();
        let mut block = folder.data_offset;
        for _ in 0..folder.blocks {
            let compressed = u16_at(data, block + 4)? as usize;
            let uncompressed = u16_at(data, block + 6)? as usize;
            let start = block + 8 + data_reserve;
            let payload = data.get(start..start + compressed).ok_or("truncated cabinet block")?;
            let before = out.len();
            match folder.compression & 0x0f {
                0 => out.extend_from_slice(payload),
                1 => {
                    if payload.get(0..2) != Some(b"CK") {
                        return Err("corrupt MSZIP block".into());
                    }
                    inflate(&payload[2..], &mut out)?;
                }
                2 => return Err("Quantum-compressed cabinets are not supported".into()),
                3 => return Err("LZX-compressed cabinets are not supported".into()),
                other => return Err(format!("unknown cabinet compression {other}")),
            }
            if out.len() - before != uncompressed {
                return Err("cabinet block size mismatch".into());
            }
            block = start + compressed;
        }
        for (name, offset, size) in entries {
            let contents = out.get(offset..offset + size).ok_or_else(|| format!("{name}: outside its folder"))?;
            each(&name, contents)?;
        }
    }
    Ok(())
}

/// A single-folder MSZIP cabinet (stored deflate blocks), for tests.
#[cfg(test)]
pub(crate) fn build(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut stream = Vec::new();
    let mut table = Vec::new();
    for (name, data) in files {
        table.extend_from_slice(&(data.len() as u32).to_le_bytes());
        table.extend_from_slice(&(stream.len() as u32).to_le_bytes());
        table.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0x20, 0]);
        table.extend_from_slice(name.as_bytes());
        table.push(0);
        stream.extend_from_slice(data);
    }
    let mut blocks = Vec::new();
    let chunks: Vec<&[u8]> = stream.chunks(32768).collect();
    for chunk in &chunks {
        let mut payload = b"CK".to_vec();
        payload.extend_from_slice(&super::inflate::stored(chunk));
        blocks.extend_from_slice(&0u32.to_le_bytes());
        blocks.extend_from_slice(&(payload.len() as u16).to_le_bytes());
        blocks.extend_from_slice(&(chunk.len() as u16).to_le_bytes());
        blocks.extend_from_slice(&payload);
    }
    let files_offset = 36 + 8;
    let data_offset = files_offset + table.len();
    let mut out = Vec::new();
    out.extend_from_slice(b"MSCF");
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&((data_offset + blocks.len()) as u32).to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&(files_offset as u32).to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&[3, 1]);
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&(files.len() as u16).to_le_bytes());
    out.extend_from_slice(&[0, 0, 0, 0, 0, 0]);
    out.extend_from_slice(&(data_offset as u32).to_le_bytes());
    out.extend_from_slice(&(chunks.len() as u16).to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&table);
    out.extend_from_slice(&blocks);
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_mszip_folders() {
        let big: Vec<u8> = (0..100_000u32).map(|i| (i % 251) as u8).collect();
        let cab = super::build(&[("fil1", b"one"), ("fil2", &big), ("fil3", b"three")]);
        let mut seen = Vec::new();
        super::for_each(&cab, |name, data| {
            seen.push((name.to_owned(), data.to_vec()));
            Ok(())
        })
        .unwrap();
        assert_eq!(seen.len(), 3);
        assert_eq!(seen[0], ("fil1".to_owned(), b"one".to_vec()));
        assert_eq!(seen[1].1, big);
        assert_eq!(seen[2], ("fil3".to_owned(), b"three".to_vec()));
    }
}
