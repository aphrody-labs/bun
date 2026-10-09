//! Compound File Binary (OLE structured storage) reader: the container of `.msi` packages.

const END_OF_CHAIN: u32 = 0xffff_fffe;
const FREE: u32 = 0xffff_ffff;

fn u16_at(data: &[u8], at: usize) -> Result<u16, String> {
    data.get(at..at + 2).map(|b| u16::from_le_bytes([b[0], b[1]])).ok_or_else(|| "truncated compound file".into())
}

fn u32_at(data: &[u8], at: usize) -> Result<u32, String> {
    data.get(at..at + 4)
        .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .ok_or_else(|| "truncated compound file".into())
}

pub struct Stream {
    /// UTF-16 code units, as stored (MSI encodes table names into private-use characters).
    pub name: Vec<u16>,
    pub data: Vec<u8>,
}

struct File<'a> {
    data: &'a [u8],
    shift: u32,
    fat: Vec<u32>,
}

impl File<'_> {
    fn sector(&self, n: u32) -> Result<&[u8], String> {
        let size = 1usize << self.shift;
        let start = (n as usize + 1) << self.shift;
        self.data.get(start..start + size).ok_or_else(|| format!("compound file sector {n} out of range"))
    }

    fn chain(&self, start: u32) -> Result<Vec<u32>, String> {
        let mut out = Vec::new();
        let mut n = start;
        while n != END_OF_CHAIN && n != FREE {
            if out.len() > self.fat.len() {
                return Err("compound file sector chain loops".into());
            }
            out.push(n);
            n = *self.fat.get(n as usize).ok_or("compound file chain out of range")?;
        }
        Ok(out)
    }

    fn read(&self, start: u32, size: Option<usize>) -> Result<Vec<u8>, String> {
        let mut out = Vec::new();
        for n in self.chain(start)? {
            out.extend_from_slice(self.sector(n)?);
        }
        if let Some(size) = size {
            if out.len() < size {
                return Err("compound file stream shorter than its size".into());
            }
            out.truncate(size);
        }
        Ok(out)
    }
}

/// Every stream of the file (storages are flattened: MSI keeps its tables at the root).
pub fn streams(data: &[u8]) -> Result<Vec<Stream>, String> {
    if data.get(0..8) != Some(&[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) {
        return Err("not a compound file (.msi)".into());
    }
    let shift = u16_at(data, 0x1e)? as u32;
    let mini_shift = u16_at(data, 0x20)? as u32;
    if !(9..=12).contains(&shift) || mini_shift >= shift {
        return Err("unsupported compound file sector size".into());
    }
    let fat_sectors = u32_at(data, 0x2c)? as usize;
    let dir_start = u32_at(data, 0x30)?;
    let cutoff = u32_at(data, 0x38)? as usize;
    let minifat_start = u32_at(data, 0x3c)?;
    let mut difat_sector = u32_at(data, 0x44)?;
    let mut fat_list = Vec::with_capacity(fat_sectors);
    for i in 0..109 {
        let n = u32_at(data, 0x4c + i * 4)?;
        if n != FREE {
            fat_list.push(n);
        }
    }
    let mut file = File { data, shift, fat: Vec::new() };
    let per_sector = (1usize << shift) / 4;
    let mut guard = 0;
    while difat_sector != END_OF_CHAIN && difat_sector != FREE && fat_list.len() < fat_sectors {
        guard += 1;
        if guard > fat_sectors + 1 {
            return Err("compound file DIFAT loops".into());
        }
        let sector = file.sector(difat_sector)?;
        for i in 0..per_sector - 1 {
            let n = u32_at(sector, i * 4)?;
            if n != FREE {
                fat_list.push(n);
            }
        }
        difat_sector = u32_at(sector, (per_sector - 1) * 4)?;
    }
    let mut fat = Vec::with_capacity(fat_list.len() * per_sector);
    for &n in fat_list.iter().take(fat_sectors.max(1)) {
        let sector = file.sector(n)?;
        for i in 0..per_sector {
            fat.push(u32_at(sector, i * 4)?);
        }
    }
    file.fat = fat;
    let dir = file.read(dir_start, None)?;
    let minifat_bytes = if minifat_start == END_OF_CHAIN { Vec::new() } else { file.read(minifat_start, None)? };
    let minifat: Vec<u32> = minifat_bytes.chunks_exact(4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
    let mut ministream = Vec::new();
    let mut out = Vec::new();
    for (index, entry) in dir.chunks_exact(128).enumerate() {
        let kind = entry[0x42];
        let start = u32_at(entry, 0x74)?;
        let size = u32_at(entry, 0x78)? as usize;
        if index == 0 {
            if kind != 5 {
                return Err("compound file has no root entry".into());
            }
            ministream = file.read(start, Some(size))?;
            continue;
        }
        if kind != 2 {
            continue;
        }
        let name_bytes = (u16_at(entry, 0x40)? as usize).min(64);
        let mut name: Vec<u16> = entry[..name_bytes].chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect();
        while name.last() == Some(&0) {
            name.pop();
        }
        let data = if size < cutoff {
            let mini_size = 1usize << mini_shift;
            let mut bytes = Vec::with_capacity(size);
            let mut n = start;
            let mut steps = 0;
            while n != END_OF_CHAIN && n != FREE && bytes.len() < size {
                steps += 1;
                if steps > minifat.len() + 1 {
                    return Err("compound file mini chain loops".into());
                }
                let at = n as usize * mini_size;
                bytes.extend_from_slice(ministream.get(at..at + mini_size).ok_or("mini sector out of range")?);
                n = *minifat.get(n as usize).ok_or("mini chain out of range")?;
            }
            if bytes.len() < size {
                return Err("compound file mini stream shorter than its size".into());
            }
            bytes.truncate(size);
            bytes
        } else {
            file.read(start, Some(size))?
        };
        out.push(Stream { name, data });
    }
    Ok(out)
}

/// A version 3 compound file holding `streams` at the root, small ones in the mini stream.
#[cfg(test)]
pub(crate) fn build(streams: &[(Vec<u16>, Vec<u8>)]) -> Vec<u8> {
    const SECTOR: usize = 512;
    let sectors = |len: usize| len.div_ceil(SECTOR);
    let mut mini = Vec::new();
    let mut minifat: Vec<u32> = Vec::new();
    let mut starts = Vec::new();
    let mut large: Vec<&[u8]> = Vec::new();
    for (_, data) in streams {
        if data.len() < 4096 {
            let first = (mini.len() / 64) as u32;
            let count = data.len().div_ceil(64).max(1);
            for i in 0..count {
                minifat.push(if i + 1 == count { END_OF_CHAIN } else { first + i as u32 + 1 });
            }
            mini.extend_from_slice(data);
            mini.resize((first as usize + count) * 64, 0);
            starts.push(Some(first));
        } else {
            starts.push(None);
            large.push(data);
        }
    }
    let dir_sectors = sectors((streams.len() + 1) * 128);
    let minifat_sectors = sectors(minifat.len() * 4);
    let mini_sectors = sectors(mini.len());
    let large_sectors: usize = large.iter().map(|d| sectors(d.len())).sum();
    let other = dir_sectors + minifat_sectors + mini_sectors + large_sectors;
    let mut fat_sectors = 1;
    while (fat_sectors + other) > fat_sectors * 128 {
        fat_sectors += 1;
    }
    let mut fat = vec![FREE; fat_sectors * 128];
    for entry in fat.iter_mut().take(fat_sectors) {
        *entry = 0xffff_fffd;
    }
    let mut next = fat_sectors;
    let mut run = |fat: &mut Vec<u32>, count: usize| -> u32 {
        if count == 0 {
            return END_OF_CHAIN;
        }
        let first = next;
        for i in 0..count {
            fat[first + i] = if i + 1 == count { END_OF_CHAIN } else { (first + i + 1) as u32 };
        }
        next += count;
        first as u32
    };
    let dir_start = run(&mut fat, dir_sectors);
    let minifat_start = run(&mut fat, minifat_sectors);
    let mini_start = run(&mut fat, mini_sectors);
    let large_starts: Vec<u32> = large.iter().map(|d| run(&mut fat, sectors(d.len()))).collect();
    let mut header = vec![0u8; SECTOR];
    header[..8].copy_from_slice(&[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    header[0x18..0x1a].copy_from_slice(&0x3eu16.to_le_bytes());
    header[0x1a..0x1c].copy_from_slice(&3u16.to_le_bytes());
    header[0x1c..0x1e].copy_from_slice(&0xfffeu16.to_le_bytes());
    header[0x1e..0x20].copy_from_slice(&9u16.to_le_bytes());
    header[0x20..0x22].copy_from_slice(&6u16.to_le_bytes());
    header[0x2c..0x30].copy_from_slice(&(fat_sectors as u32).to_le_bytes());
    header[0x30..0x34].copy_from_slice(&dir_start.to_le_bytes());
    header[0x38..0x3c].copy_from_slice(&4096u32.to_le_bytes());
    header[0x3c..0x40].copy_from_slice(&minifat_start.to_le_bytes());
    header[0x40..0x44].copy_from_slice(&(minifat_sectors as u32).to_le_bytes());
    header[0x44..0x48].copy_from_slice(&END_OF_CHAIN.to_le_bytes());
    for i in 0..109 {
        let value = if i < fat_sectors { i as u32 } else { FREE };
        header[0x4c + i * 4..0x50 + i * 4].copy_from_slice(&value.to_le_bytes());
    }
    let entry = |name: &[u16], kind: u8, child: u32, right: u32, start: u32, size: usize| {
        let mut e = vec![0u8; 128];
        for (i, unit) in name.iter().enumerate() {
            e[i * 2..i * 2 + 2].copy_from_slice(&unit.to_le_bytes());
        }
        e[0x40..0x42].copy_from_slice(&(((name.len() + 1) * 2) as u16).to_le_bytes());
        e[0x42] = kind;
        e[0x43] = 1;
        e[0x44..0x48].copy_from_slice(&FREE.to_le_bytes());
        e[0x48..0x4c].copy_from_slice(&right.to_le_bytes());
        e[0x4c..0x50].copy_from_slice(&child.to_le_bytes());
        e[0x74..0x78].copy_from_slice(&start.to_le_bytes());
        e[0x78..0x7c].copy_from_slice(&(size as u32).to_le_bytes());
        e
    };
    let root: Vec<u16> = "Root Entry".encode_utf16().collect();
    let mut dir = entry(&root, 5, if streams.is_empty() { FREE } else { 1 }, FREE, mini_start, mini.len());
    let mut large_index = 0;
    for (i, ((name, data), start)) in streams.iter().zip(&starts).enumerate() {
        let right = if i + 1 < streams.len() { (i + 2) as u32 } else { FREE };
        let start = match start {
            Some(mini_start) => *mini_start,
            None => {
                large_index += 1;
                large_starts[large_index - 1]
            }
        };
        dir.extend_from_slice(&entry(name, 2, FREE, right, start, data.len()));
    }
    let mut out = header;
    let pad = |out: &mut Vec<u8>| {
        let len = out.len().div_ceil(SECTOR) * SECTOR;
        out.resize(len, 0);
    };
    for value in &fat {
        out.extend_from_slice(&value.to_le_bytes());
    }
    out.extend_from_slice(&dir);
    pad(&mut out);
    for value in &minifat {
        out.extend_from_slice(&value.to_le_bytes());
    }
    pad(&mut out);
    out.extend_from_slice(&mini);
    pad(&mut out);
    for data in large {
        out.extend_from_slice(data);
        pad(&mut out);
    }
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_small_and_large_streams() {
        let small: Vec<u16> = "small".encode_utf16().collect();
        let large: Vec<u16> = "large".encode_utf16().collect();
        let big: Vec<u8> = (0..20_000u32).map(|i| i as u8).collect();
        let file = super::build(&[(small.clone(), b"tiny".to_vec()), (large.clone(), big.clone())]);
        let streams = super::streams(&file).unwrap();
        assert_eq!(streams.len(), 2);
        assert_eq!(streams[0].name, small);
        assert_eq!(streams[0].data, b"tiny");
        assert_eq!(streams[1].name, large);
        assert_eq!(streams[1].data, big);
    }
}
