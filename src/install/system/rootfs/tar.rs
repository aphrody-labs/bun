//! Tar reader over an in-memory stream: ustar, pax (`x`/`g`) and GNU long
//! names. Unlike libarchive it keeps every pax record, which apk needs for the
//! per-file `APK-TOOLS.checksum.*` digests, and it tolerates a stream with no
//! end-of-archive blocks (apk cuts them between its gzip segments).

use super::super::{Error, Result};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    File,
    Hardlink,
    Symlink,
    Char,
    Block,
    Dir,
    Fifo,
}

#[derive(Clone, Debug)]
pub struct Entry<'a> {
    pub path: Vec<u8>,
    pub link: Vec<u8>,
    pub kind: Kind,
    pub mode: u32,
    pub uid: u32,
    pub gid: u32,
    pub uname: Vec<u8>,
    pub gname: Vec<u8>,
    pub mtime: i64,
    pub dev_major: u32,
    pub dev_minor: u32,
    pub data: &'a [u8],
    /// Local pax records of this entry (`path`, `linkpath`, `size` already applied).
    pub pax: Vec<(Vec<u8>, Vec<u8>)>,
}

impl Entry<'_> {
    pub fn pax_value(&self, key: &[u8]) -> Option<&[u8]> {
        self.pax.iter().find(|(k, _)| k.as_slice() == key).map(|(_, v)| v.as_slice())
    }

    /// `SCHILY.xattr.<name>` records as `(name, value)`.
    pub fn xattrs(&self) -> impl Iterator<Item = (&[u8], &[u8])> {
        self.pax.iter().filter_map(|(k, v)| {
            k.strip_prefix(b"SCHILY.xattr.".as_slice()).map(|name| (name, v.as_slice()))
        })
    }
}

fn octal(field: &[u8]) -> u64 {
    if let Some(&first) = field.first() {
        if first & 0x80 != 0 {
            // GNU base-256: big-endian, first byte's high bit is the marker.
            let mut v: u64 = u64::from(first & 0x7f);
            for &b in &field[1..] {
                v = (v << 8) | u64::from(b);
            }
            return v;
        }
    }
    let mut v: u64 = 0;
    for &b in field {
        match b {
            b'0'..=b'7' => v = (v << 3) | u64::from(b - b'0'),
            b' ' | 0 if v == 0 => continue,
            _ => break,
        }
    }
    v
}

fn cstr(field: &[u8]) -> &[u8] {
    match bun_core::strings::index_of_char_usize(field, 0) {
        Some(n) => &field[..n],
        None => field,
    }
}

fn parse_pax(mut body: &[u8], out: &mut Vec<(Vec<u8>, Vec<u8>)>) -> Result<()> {
    // Records: "<len> <key>=<value>\n", where <len> counts the whole record.
    while !body.is_empty() {
        let Some(sp) = bun_core::strings::index_of_char_usize(body, b' ') else {
            break;
        };
        let len: usize = core::str::from_utf8(&body[..sp])
            .ok()
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| Error::Parse("tar: bad pax record length".to_owned()))?;
        if len <= sp + 1 || len > body.len() {
            return Err(Error::Parse("tar: truncated pax record".to_owned()));
        }
        let mut rec = &body[sp + 1..len];
        if rec.last() == Some(&b'\n') {
            rec = &rec[..rec.len() - 1];
        }
        if let Some((k, v)) = bun_core::strings::split_once_char(rec, b'=') {
            out.push((k.to_vec(), v.to_vec()));
        }
        body = &body[len..];
    }
    Ok(())
}

fn pad512(n: usize) -> usize {
    n.div_ceil(512) * 512
}

/// Iterates the entries of an uncompressed tar stream.
pub struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
    global: Vec<(Vec<u8>, Vec<u8>)>,
}

impl<'a> Reader<'a> {
    pub fn new(buf: &'a [u8]) -> Reader<'a> {
        Reader { buf, pos: 0, global: Vec::new() }
    }

    /// Byte offset of the next header (the end of the last returned entry's data).
    pub fn offset(&self) -> usize {
        self.pos
    }

    pub fn next_entry(&mut self) -> Result<Option<Entry<'a>>> {
        let mut long_name: Option<Vec<u8>> = None;
        let mut long_link: Option<Vec<u8>> = None;
        let mut pax: Vec<(Vec<u8>, Vec<u8>)> = Vec::new();
        loop {
            if self.pos + 512 > self.buf.len() {
                return Ok(None);
            }
            let h = &self.buf[self.pos..self.pos + 512];
            if h.iter().all(|&b| b == 0) {
                return Ok(None);
            }
            let stored = octal(&h[148..156]);
            let mut sum: u64 = 0;
            for (i, &b) in h.iter().enumerate() {
                sum += if (148..156).contains(&i) { 32 } else { u64::from(b) };
            }
            if stored != sum {
                return Err(Error::Parse("tar: header checksum mismatch".to_owned()));
            }
            let typeflag = h[156];
            let mut size = octal(&h[124..136]) as usize;
            if let Some(v) = pax.iter().rev().find(|(k, _)| k.as_slice() == b"size") {
                if let Some(n) = core::str::from_utf8(&v.1).ok().and_then(|s| s.parse().ok()) {
                    size = n;
                }
            }
            let data_start = self.pos + 512;
            let data_end = data_start
                .checked_add(size)
                .filter(|&e| e <= self.buf.len())
                .ok_or_else(|| Error::Parse("tar: truncated entry".to_owned()))?;
            let data = &self.buf[data_start..data_end];
            self.pos = (data_start + pad512(size)).min(self.buf.len());
            match typeflag {
                b'x' => {
                    parse_pax(data, &mut pax)?;
                    continue;
                }
                b'g' => {
                    parse_pax(data, &mut self.global)?;
                    continue;
                }
                b'L' => {
                    long_name = Some(cstr(data).to_vec());
                    continue;
                }
                b'K' => {
                    long_link = Some(cstr(data).to_vec());
                    continue;
                }
                _ => {}
            }
            let kind = match typeflag {
                b'0' | 0 | b'7' => Kind::File,
                b'1' => Kind::Hardlink,
                b'2' => Kind::Symlink,
                b'3' => Kind::Char,
                b'4' => Kind::Block,
                b'5' => Kind::Dir,
                b'6' => Kind::Fifo,
                other => {
                    return Err(Error::Parse(format!("tar: unsupported entry type {:?}", other as char)));
                }
            };
            let lookup = |key: &[u8]| -> Option<Vec<u8>> {
                pax.iter()
                    .rev()
                    .chain(self.global.iter().rev())
                    .find(|(k, _)| k.as_slice() == key)
                    .map(|(_, v)| v.clone())
            };
            let path = match lookup(b"path").or(long_name.take()) {
                Some(p) => p,
                None => {
                    let name = cstr(&h[0..100]);
                    let prefix = if &h[257..262] == b"ustar" { cstr(&h[345..500]) } else { b"" };
                    if prefix.is_empty() {
                        name.to_vec()
                    } else {
                        let mut p = prefix.to_vec();
                        p.push(b'/');
                        p.extend_from_slice(name);
                        p
                    }
                }
            };
            let link = lookup(b"linkpath")
                .or(long_link.take())
                .unwrap_or_else(|| cstr(&h[157..257]).to_vec());
            let num = |key: &[u8], field: &[u8]| -> u64 {
                lookup(key)
                    .and_then(|v| {
                        let v = match bun_core::strings::index_of_char_usize(&v, b'.') {
                            Some(dot) => v[..dot].to_vec(),
                            None => v,
                        };
                        core::str::from_utf8(&v).ok().and_then(|s| s.parse::<u64>().ok())
                    })
                    .unwrap_or_else(|| octal(field))
            };
            let entry = Entry {
                kind,
                mode: (octal(&h[100..108]) & 0o7777) as u32,
                uid: num(b"uid", &h[108..116]) as u32,
                gid: num(b"gid", &h[116..124]) as u32,
                mtime: num(b"mtime", &h[136..148]) as i64,
                uname: lookup(b"uname").unwrap_or_else(|| cstr(&h[265..297]).to_vec()),
                gname: lookup(b"gname").unwrap_or_else(|| cstr(&h[297..329]).to_vec()),
                dev_major: octal(&h[329..337]) as u32,
                dev_minor: octal(&h[337..345]) as u32,
                path,
                link,
                data,
                pax,
            };
            return Ok(Some(entry));
        }
    }
}

/// Collects every entry of `buf`.
pub fn entries(buf: &[u8]) -> Result<Vec<Entry<'_>>> {
    let mut r = Reader::new(buf);
    let mut out = Vec::new();
    while let Some(e) = r.next_entry()? {
        out.push(e);
    }
    Ok(out)
}

/// Writes one ustar entry (with a pax header for long names) — used for
/// `lib/apk/db/scripts.tar` and test fixtures.
pub fn write_entry(out: &mut Vec<u8>, path: &[u8], kind: Kind, mode: u32, mtime: i64, data: &[u8]) {
    let mut header = [0u8; 512];
    let put_octal = |h: &mut [u8; 512], range: core::ops::Range<usize>, v: u64| {
        let width = range.len() - 1;
        let s = format!("{v:0width$o}");
        let s = s.as_bytes();
        let s = &s[s.len().saturating_sub(width)..];
        h[range.start..range.start + s.len()].copy_from_slice(s);
    };
    if path.len() > 100 {
        let mut rec = Vec::new();
        let body_len = b" path=\n".len() + path.len();
        let mut total = body_len + 1;
        while total.to_string().len() + body_len != total {
            total = total.to_string().len() + body_len;
        }
        rec.extend_from_slice(total.to_string().as_bytes());
        rec.extend_from_slice(b" path=");
        rec.extend_from_slice(path);
        rec.push(b'\n');
        write_raw(out, b"././@PaxHeader", b'x', 0o644, mtime, &rec);
    }
    let name = if path.len() > 100 { &path[..100] } else { path };
    header[..name.len()].copy_from_slice(name);
    put_octal(&mut header, 100..108, u64::from(mode & 0o7777));
    put_octal(&mut header, 108..116, 0);
    put_octal(&mut header, 116..124, 0);
    put_octal(&mut header, 124..136, data.len() as u64);
    put_octal(&mut header, 136..148, mtime.max(0) as u64);
    header[156] = match kind {
        Kind::File => b'0',
        Kind::Hardlink => b'1',
        Kind::Symlink => b'2',
        Kind::Char => b'3',
        Kind::Block => b'4',
        Kind::Dir => b'5',
        Kind::Fifo => b'6',
    };
    header[257..263].copy_from_slice(b"ustar\0");
    header[263..265].copy_from_slice(b"00");
    finish_header(&mut header);
    out.extend_from_slice(&header);
    out.extend_from_slice(data);
    out.resize(out.len() + (pad512(data.len()) - data.len()), 0);
}

fn write_raw(out: &mut Vec<u8>, name: &[u8], typeflag: u8, mode: u32, mtime: i64, data: &[u8]) {
    let mut header = [0u8; 512];
    header[..name.len()].copy_from_slice(name);
    let fields: [(core::ops::Range<usize>, u64); 5] = [
        (100..108, u64::from(mode)),
        (108..116, 0),
        (116..124, 0),
        (124..136, data.len() as u64),
        (136..148, mtime.max(0) as u64),
    ];
    for (range, v) in fields {
        let width = range.len() - 1;
        let s = format!("{v:0width$o}");
        header[range.start..range.start + width].copy_from_slice(&s.as_bytes()[s.len() - width..]);
    }
    header[156] = typeflag;
    header[257..263].copy_from_slice(b"ustar\0");
    header[263..265].copy_from_slice(b"00");
    finish_header(&mut header);
    out.extend_from_slice(&header);
    out.extend_from_slice(data);
    out.resize(out.len() + (pad512(data.len()) - data.len()), 0);
}

fn finish_header(header: &mut [u8; 512]) {
    header[148..156].copy_from_slice(b"        ");
    let sum: u32 = header.iter().map(|&b| u32::from(b)).sum();
    let s = format!("{sum:06o}\0 ");
    header[148..156].copy_from_slice(s.as_bytes());
}

/// The two zero blocks that end an archive.
pub fn write_end(out: &mut Vec<u8>) {
    out.resize(out.len() + 1024, 0);
}
