//! Windows Installer (.msi) database reader: enough of the `File`, `Component`, `Directory` and
//! `Media` tables to know which cabinets a package uses and where each cabinet entry installs.

use std::collections::HashMap;

use super::cfb;

const ALPHABET: &[u8; 64] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz._";

/// Decodes an MSI stream name (table names are packed two characters per UTF-16 unit).
pub fn decode_name(units: &[u16]) -> String {
    let mut out = String::new();
    for &unit in units {
        match unit {
            0x3800..=0x47ff => {
                let packed = unit - 0x3800;
                out.push(ALPHABET[(packed & 0x3f) as usize] as char);
                out.push(ALPHABET[((packed >> 6) & 0x3f) as usize] as char);
            }
            0x4800..=0x483f => out.push(ALPHABET[(unit - 0x4800) as usize] as char),
            0x4840 => out.push('!'),
            _ => out.push(char::from_u32(unit as u32).unwrap_or('\u{fffd}')),
        }
    }
    out
}

#[derive(Clone, Debug, PartialEq)]
enum Cell {
    Null,
    Int(i64),
    Str(String),
}

impl Cell {
    fn str(&self) -> Option<&str> {
        match self {
            Cell::Str(s) => Some(s),
            _ => None,
        }
    }
    fn int(&self) -> Option<i64> {
        match self {
            Cell::Int(i) => Some(*i),
            _ => None,
        }
    }
}

struct Database {
    streams: HashMap<String, Vec<u8>>,
    strings: Vec<String>,
    long_refs: bool,
    columns: HashMap<String, Vec<(String, u16)>>,
}

fn le(data: &[u8], at: usize, width: usize) -> u32 {
    let mut value = 0u32;
    for i in 0..width {
        value |= (data[at + i] as u32) << (8 * i);
    }
    value
}

impl Database {
    fn open(data: &[u8]) -> Result<Database, String> {
        let streams: HashMap<String, Vec<u8>> =
            cfb::streams(data)?.into_iter().map(|s| (decode_name(&s.name), s.data)).collect();
        let pool = streams.get("!_StringPool").ok_or("not a Windows Installer database (no string pool)")?;
        let text = streams.get("!_StringData").map(Vec::as_slice).unwrap_or(&[]);
        let words: Vec<u16> = pool.chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect();
        if words.len() < 2 {
            return Err("empty string pool".into());
        }
        let long_refs = words[1] & 0x8000 != 0;
        let mut strings = vec![String::new()];
        let count = words.len() / 2;
        let (mut i, mut offset) = (1usize, 0usize);
        while i < count {
            let (len, refs) = (words[i * 2] as usize, words[i * 2 + 1]);
            if len == 0 && refs == 0 {
                strings.push(String::new());
                i += 1;
                continue;
            }
            let len = if len == 0 {
                if i * 2 + 3 >= words.len() {
                    return Err("corrupt string pool".into());
                }
                let len = ((words[i * 2 + 3] as usize) << 16) | words[i * 2 + 2] as usize;
                i += 2;
                len
            } else {
                i += 1;
                len
            };
            let bytes = text.get(offset..offset + len).ok_or("string pool longer than its data")?;
            strings.push(String::from_utf8_lossy(bytes).into_owned());
            offset += len;
        }
        let mut db = Database { streams, strings, long_refs, columns: HashMap::new() };
        let columns = db.read_raw("!_Columns", &[(true, 0), (false, 2), (true, 0), (false, 2)])?;
        let mut by_table: HashMap<String, Vec<(i64, String, u16)>> = HashMap::new();
        for row in columns {
            let (Some(table), Some(number), Some(name), Some(kind)) = (row[0].str(), row[1].int(), row[2].str(), row[3].int())
            else {
                continue;
            };
            by_table.entry(table.to_owned()).or_default().push((number, name.to_owned(), kind as u16));
        }
        for (table, mut cols) in by_table {
            cols.sort_by_key(|c| c.0);
            db.columns.insert(table, cols.into_iter().map(|(_, name, kind)| (name, kind)).collect());
        }
        Ok(db)
    }

    fn ref_width(&self) -> usize {
        if self.long_refs {
            3
        } else {
            2
        }
    }

    /// `layout`: (is a string, integer width); widths of string and binary columns are the
    /// string reference size.
    fn read_raw(&self, stream: &str, layout: &[(bool, usize)]) -> Result<Vec<Vec<Cell>>, String> {
        let Some(data) = self.streams.get(stream) else {
            return Ok(Vec::new());
        };
        let widths: Vec<usize> = layout.iter().map(|&(s, w)| if s { self.ref_width() } else { w }).collect();
        let row_size: usize = widths.iter().sum();
        if row_size == 0 {
            return Ok(Vec::new());
        }
        let rows = data.len() / row_size;
        let mut out = vec![Vec::with_capacity(layout.len()); rows];
        let mut at = 0;
        for (&(is_str, _), &width) in layout.iter().zip(&widths) {
            for row in out.iter_mut() {
                let raw = le(data, at, width);
                at += width;
                row.push(if raw == 0 {
                    Cell::Null
                } else if is_str {
                    Cell::Str(self.strings.get(raw as usize).cloned().ok_or("string reference out of range")?)
                } else if width == 2 {
                    Cell::Int((raw ^ 0x8000) as i64)
                } else {
                    Cell::Int((raw ^ 0x8000_0000) as i64)
                });
            }
        }
        Ok(out)
    }

    /// Rows of `table` as maps from column name to cell.
    fn table(&self, table: &str) -> Result<Vec<HashMap<String, Cell>>, String> {
        let Some(columns) = self.columns.get(table) else {
            return Ok(Vec::new());
        };
        let layout: Vec<(bool, usize)> = columns
            .iter()
            .map(|(_, kind)| {
                let binary = kind & !0x1000 == 0x0900;
                let string = kind & 0x0800 != 0;
                if binary || string {
                    (true, 0)
                } else if kind & 0xff <= 2 {
                    (false, 2)
                } else {
                    (false, 4)
                }
            })
            .collect();
        let rows = self.read_raw(&format!("!{table}"), &layout)?;
        Ok(rows
            .into_iter()
            .map(|row| columns.iter().map(|(name, _)| name.clone()).zip(row).collect())
            .collect())
    }
}

/// `DefaultDir`/`FileName` value → the long target name (`short|long`, `target:source`).
fn long_name(value: &str) -> &str {
    let target = value.split(':').next().unwrap_or(value);
    target.rsplit('|').next().unwrap_or(target)
}

pub struct MsiFile {
    /// The cabinet entry name (the `File` table key).
    pub key: String,
    /// Install path, as components from the root directory.
    pub path: Vec<String>,
    pub size: u64,
}

pub struct Package {
    pub files: Vec<MsiFile>,
    /// Cabinet file names from the `Media` table (`#name` marks a cabinet embedded as a stream).
    pub cabinets: Vec<String>,
}

pub fn read(data: &[u8]) -> Result<Package, String> {
    let db = Database::open(data)?;
    let mut dirs: HashMap<String, (Option<String>, String)> = HashMap::new();
    for row in db.table("Directory")? {
        let Some(key) = row.get("Directory").and_then(Cell::str) else { continue };
        let parent = row.get("Directory_Parent").and_then(Cell::str).map(str::to_owned);
        let name = row.get("DefaultDir").and_then(Cell::str).map(long_name).unwrap_or(".").to_owned();
        dirs.insert(key.to_owned(), (parent, name));
    }
    let mut memo: HashMap<String, Vec<String>> = HashMap::new();
    fn resolve(
        key: &str,
        dirs: &HashMap<String, (Option<String>, String)>,
        memo: &mut HashMap<String, Vec<String>>,
        depth: usize,
    ) -> Vec<String> {
        if let Some(path) = memo.get(key) {
            return path.clone();
        }
        let Some((parent, name)) = dirs.get(key) else { return Vec::new() };
        let mut path = match parent {
            Some(parent) if parent != key && depth < 64 => resolve(parent, dirs, memo, depth + 1),
            _ => return Vec::new(),
        };
        if name != "." && !name.is_empty() {
            path.push(name.clone());
        }
        memo.insert(key.to_owned(), path.clone());
        path
    }
    let mut components: HashMap<String, String> = HashMap::new();
    for row in db.table("Component")? {
        if let (Some(key), Some(dir)) = (row.get("Component").and_then(Cell::str), row.get("Directory_").and_then(Cell::str)) {
            components.insert(key.to_owned(), dir.to_owned());
        }
    }
    let mut files = Vec::new();
    for row in db.table("File")? {
        let (Some(key), Some(component), Some(name)) = (
            row.get("File").and_then(Cell::str),
            row.get("Component_").and_then(Cell::str),
            row.get("FileName").and_then(Cell::str),
        ) else {
            continue;
        };
        let Some(dir) = components.get(component) else { continue };
        let mut path = resolve(dir, &dirs, &mut memo, 0);
        path.push(long_name(name).to_owned());
        let size = row.get("FileSize").and_then(Cell::int).unwrap_or(0).max(0) as u64;
        files.push(MsiFile { key: key.to_owned(), path, size });
    }
    let mut cabinets = Vec::new();
    for row in db.table("Media")? {
        if let Some(cabinet) = row.get("Cabinet").and_then(Cell::str) {
            if !cabinet.is_empty() {
                cabinets.push(cabinet.to_owned());
            }
        }
    }
    Ok(Package { files, cabinets })
}

#[cfg(test)]
pub(crate) fn encode_name(name: &str) -> Vec<u16> {
    let index = |c: u8| ALPHABET.iter().position(|&a| a == c).map(|i| i as u16);
    let mut out = Vec::new();
    let mut bytes = name.as_bytes();
    if let Some(rest) = bytes.strip_prefix(b"!") {
        out.push(0x4840);
        bytes = rest;
    }
    let mut i = 0;
    while i < bytes.len() {
        match (index(bytes[i]), bytes.get(i + 1).and_then(|&c| index(c))) {
            (Some(a), Some(b)) => {
                out.push(0x3800 + a + (b << 6));
                i += 2;
            }
            (Some(a), None) => {
                out.push(0x4800 + a);
                i += 1;
            }
            _ => {
                out.push(bytes[i] as u16);
                i += 1;
            }
        }
    }
    out
}

/// A minimal database: `Directory`, `Component`, `File` and `Media` tables, for tests.
/// `dirs`: (key, parent, DefaultDir); `files`: (key, directory key, FileName, size).
#[cfg(test)]
pub(crate) fn build(dirs: &[(&str, Option<&str>, &str)], files: &[(&str, &str, &str, u32)], cabinets: &[&str]) -> Vec<u8> {
    let mut strings: Vec<String> = Vec::new();
    let id = |s: &str, strings: &mut Vec<String>| -> u32 {
        match strings.iter().position(|x| x == s) {
            Some(i) => i as u32 + 1,
            None => {
                strings.push(s.to_owned());
                strings.len() as u32
            }
        }
    };
    // (table, columns (name, type)), rows of cells: Some(string) or integer.
    enum V<'a> {
        S(Option<&'a str>),
        I(i32, usize),
    }
    let tables: Vec<(&str, Vec<(&str, u16)>, Vec<Vec<V>>)> = vec![
        (
            "Directory",
            vec![("Directory", 0x2d48), ("Directory_Parent", 0x1d48), ("DefaultDir", 0x0dff)],
            dirs.iter().map(|(k, p, d)| vec![V::S(Some(k)), V::S(*p), V::S(Some(d))]).collect(),
        ),
        (
            "Component",
            vec![("Component", 0x2d48), ("ComponentId", 0x1d26), ("Directory_", 0x0d48), ("Attributes", 0x0502)],
            files.iter().map(|(k, d, _, _)| vec![V::S(Some(k)), V::S(None), V::S(Some(d)), V::I(0, 2)]).collect(),
        ),
        (
            "File",
            vec![("File", 0x2d48), ("Component_", 0x0d48), ("FileName", 0x0dff), ("FileSize", 0x0104)],
            files.iter().map(|(k, _, n, s)| vec![V::S(Some(k)), V::S(Some(k)), V::S(Some(n)), V::I(*s as i32, 4)]).collect(),
        ),
        (
            "Media",
            vec![("DiskId", 0x2502), ("LastSequence", 0x0502), ("Cabinet", 0x1dff)],
            cabinets.iter().enumerate().map(|(i, c)| vec![V::I(i as i32 + 1, 2), V::I(1, 2), V::S(Some(c))]).collect(),
        ),
    ];
    let mut streams: Vec<(Vec<u16>, Vec<u8>)> = Vec::new();
    let mut columns_rows: Vec<(u32, u16, u32, u16)> = Vec::new();
    for (table, columns, rows) in &tables {
        let table_id = id(table, &mut strings);
        for (n, (name, kind)) in columns.iter().enumerate() {
            columns_rows.push((table_id, n as u16 + 1, id(name, &mut strings), *kind));
        }
        let mut data = Vec::new();
        for c in 0..columns.len() {
            for row in rows {
                match &row[c] {
                    V::S(Some(s)) => {
                        let v = id(s, &mut strings);
                        data.extend_from_slice(&(v as u16).to_le_bytes());
                    }
                    V::S(None) => data.extend_from_slice(&0u16.to_le_bytes()),
                    V::I(v, 2) => data.extend_from_slice(&((*v as u16) ^ 0x8000).to_le_bytes()),
                    V::I(v, _) => data.extend_from_slice(&((*v as u32) ^ 0x8000_0000).to_le_bytes()),
                }
            }
        }
        streams.push((encode_name(&format!("!{table}")), data));
    }
    let mut columns = Vec::new();
    for c in 0..4 {
        for row in &columns_rows {
            match c {
                0 => columns.extend_from_slice(&(row.0 as u16).to_le_bytes()),
                1 => columns.extend_from_slice(&(row.1 ^ 0x8000).to_le_bytes()),
                2 => columns.extend_from_slice(&(row.2 as u16).to_le_bytes()),
                _ => columns.extend_from_slice(&(row.3 ^ 0x8000).to_le_bytes()),
            }
        }
    }
    streams.push((encode_name("!_Columns"), columns));
    let mut pool = vec![0u8, 0, 0, 0];
    pool[0..2].copy_from_slice(&1252u16.to_le_bytes());
    let mut text = Vec::new();
    for s in &strings {
        pool.extend_from_slice(&(s.len() as u16).to_le_bytes());
        pool.extend_from_slice(&1u16.to_le_bytes());
        text.extend_from_slice(s.as_bytes());
    }
    streams.push((encode_name("!_StringPool"), pool));
    streams.push((encode_name("!_StringData"), text));
    cfb::build(&streams)
}

#[cfg(test)]
mod tests {
    #[test]
    fn names_round_trip() {
        for name in ["!File", "!_StringPool", "!Directory", "!_Columns", "!Media", "Binary.x"] {
            assert_eq!(super::decode_name(&super::encode_name(name)), name);
        }
    }

    #[test]
    fn resolves_install_paths_and_cabinets() {
        let msi = super::build(
            &[
                ("TARGETDIR", None, "SourceDir"),
                ("KITS", Some("TARGETDIR"), "WINDOW~1|Windows Kits"),
                ("TEN", Some("KITS"), "10"),
                ("INC", Some("TEN"), "Include"),
                ("VER", Some("INC"), "10.0.26100.0"),
                ("UM", Some("VER"), "um"),
            ],
            &[("fil1", "UM", "WINDOWS.H|Windows.h", 12), ("fil2", "UM", "winbase.h", 34)],
            &["a.cab", "b.cab"],
        );
        let package = super::read(&msi).unwrap();
        assert_eq!(package.cabinets, ["a.cab", "b.cab"]);
        let paths: Vec<(String, String, u64)> =
            package.files.iter().map(|f| (f.key.clone(), f.path.join("/"), f.size)).collect();
        assert_eq!(
            paths,
            [
                ("fil1".to_owned(), "Windows Kits/10/Include/10.0.26100.0/um/Windows.h".to_owned(), 12),
                ("fil2".to_owned(), "Windows Kits/10/Include/10.0.26100.0/um/winbase.h".to_owned(), 34),
            ]
        );
    }
}
