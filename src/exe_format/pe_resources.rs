//! Windows resources (`.rsrc`) of a PE image: icon groups and `VS_VERSIONINFO`, edited in memory so
//! `bun build --compile --windows-*` works from any host. The existing resource tree is parsed,
//! changed, and serialized again as a new section by [`crate::pe::PEFile::set_windows_metadata`].

use std::collections::BTreeMap;

use crate::pe::Error;

pub(crate) const RT_ICON: u16 = 3;
pub(crate) const RT_GROUP_ICON: u16 = 14;
pub(crate) const RT_VERSION: u16 = 16;
const LANG_EN_US: u16 = 1033;
const CODE_PAGE_UNICODE: u16 = 1200;

/// What `--windows-*` / `compile.windows` set. Empty strings are ignored, like unset ones.
#[derive(Default, Clone, Copy)]
pub struct WindowsMetadata<'a> {
    /// Contents of an `.ico` file.
    pub icon: Option<&'a [u8]>,
    pub title: Option<&'a [u8]>,
    pub publisher: Option<&'a [u8]>,
    pub version: Option<&'a [u8]>,
    pub description: Option<&'a [u8]>,
    pub copyright: Option<&'a [u8]>,
}

/// A resource type, name or language: a string or a 16-bit id. Named entries sort before ids,
/// names case-insensitively, as the directory format requires.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum ResId {
    Name(Vec<u16>),
    Id(u16),
}

impl Ord for ResId {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        use core::cmp::Ordering;
        match (self, other) {
            (ResId::Name(a), ResId::Name(b)) => {
                let upper = |c: &u16| if (u16::from(b'a')..=u16::from(b'z')).contains(c) { *c - 32 } else { *c };
                a.iter().map(upper).cmp(b.iter().map(upper)).then_with(|| a.cmp(b))
            }
            (ResId::Name(_), ResId::Id(_)) => Ordering::Less,
            (ResId::Id(_), ResId::Name(_)) => Ordering::Greater,
            (ResId::Id(a), ResId::Id(b)) => a.cmp(b),
        }
    }
}

impl PartialOrd for ResId {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone, Debug)]
pub(crate) struct Leaf {
    pub code_page: u32,
    pub data: Vec<u8>,
}

/// type → name → language → data.
pub(crate) type Tree = BTreeMap<ResId, BTreeMap<ResId, BTreeMap<u16, Leaf>>>;

fn u16_at(b: &[u8], off: usize) -> Result<u16, Error> {
    let s = b.get(off..off + 2).ok_or(Error::InvalidResources)?;
    Ok(u16::from_le_bytes([s[0], s[1]]))
}

fn u32_at(b: &[u8], off: usize) -> Result<u32, Error> {
    let s = b.get(off..off + 4).ok_or(Error::InvalidResources)?;
    Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

fn align4(n: usize) -> usize {
    (n + 3) & !3
}

/// Parses the resource directory at the start of `section` (the bytes from the resource data
/// directory RVA to the end of its section). `read_rva` returns the bytes of a data entry.
pub(crate) fn parse_tree(
    section: &[u8],
    read_rva: &dyn Fn(u32, u32) -> Option<Vec<u8>>,
) -> Result<Tree, Error> {
    let mut tree = Tree::new();
    for (ty, ty_off) in parse_dir(section, 0)? {
        let names = tree.entry(ty).or_default();
        for (name, name_off) in parse_dir(section, subdir(ty_off)?)? {
            let langs = names.entry(name).or_default();
            for (lang, entry_off) in parse_dir(section, subdir(name_off)?)? {
                let ResId::Id(lang) = lang else {
                    return Err(Error::InvalidResources);
                };
                if entry_off & 0x8000_0000 != 0 {
                    return Err(Error::InvalidResources);
                }
                let entry = entry_off as usize;
                let rva = u32_at(section, entry)?;
                let size = u32_at(section, entry + 4)?;
                let code_page = u32_at(section, entry + 8)?;
                let data = read_rva(rva, size).ok_or(Error::InvalidResources)?;
                langs.insert(lang, Leaf { code_page, data });
            }
        }
    }
    Ok(tree)
}

fn subdir(off: u32) -> Result<usize, Error> {
    if off & 0x8000_0000 == 0 {
        return Err(Error::InvalidResources);
    }
    Ok((off & 0x7fff_ffff) as usize)
}

fn parse_dir(section: &[u8], off: usize) -> Result<Vec<(ResId, u32)>, Error> {
    let count = usize::from(u16_at(section, off + 12)?) + usize::from(u16_at(section, off + 14)?);
    let mut entries = Vec::with_capacity(count);
    for i in 0..count {
        let at = off + 16 + i * 8;
        let name = u32_at(section, at)?;
        let target = u32_at(section, at + 4)?;
        let id = if name & 0x8000_0000 != 0 {
            let s = (name & 0x7fff_ffff) as usize;
            let len = usize::from(u16_at(section, s)?);
            let mut chars = Vec::with_capacity(len);
            for c in 0..len {
                chars.push(u16_at(section, s + 2 + c * 2)?);
            }
            ResId::Name(chars)
        } else {
            ResId::Id(name as u16)
        };
        entries.push((id, target));
    }
    Ok(entries)
}

/// Serializes `tree` as a resource section whose first byte is at `rva`.
pub(crate) fn serialize_tree(tree: &Tree, rva: u32) -> Result<Vec<u8>, Error> {
    // Layout: every directory table, then the data entries, then the name strings, then the data.
    let dir_size = |n: usize| 16 + n * 8;
    let mut dirs_len = dir_size(tree.len());
    let mut leaves = 0usize;
    let mut strings_len = 0usize;
    let mut string_len = |id: &ResId| {
        if let ResId::Name(s) = id {
            strings_len += 2 + s.len() * 2;
        }
    };
    for (ty, names) in tree {
        string_len(ty);
        dirs_len += dir_size(names.len());
        for (name, langs) in names {
            string_len(name);
            dirs_len += dir_size(langs.len());
            leaves += langs.len();
        }
    }
    let entries_start = dirs_len;
    let strings_start = entries_start + leaves * 16;
    let data_start = align8(strings_start + strings_len);
    let mut data_len = 0usize;
    for langs in tree.values().flat_map(|names| names.values()) {
        for leaf in langs.values() {
            data_len = align8(data_len + leaf.data.len());
        }
    }
    let total = data_start + data_len;
    if u32::try_from(total).is_err() || rva.checked_add(total as u32).is_none() {
        return Err(Error::Overflow);
    }

    let mut out = vec![0u8; total];
    let put16 = |out: &mut [u8], at: usize, v: u16| out[at..at + 2].copy_from_slice(&v.to_le_bytes());
    let put32 = |out: &mut [u8], at: usize, v: u32| out[at..at + 4].copy_from_slice(&v.to_le_bytes());

    let mut next_dir = 0usize;
    let mut next_entry = entries_start;
    let mut next_string = strings_start;
    let mut next_data = data_start;

    let write_name = |out: &mut [u8], id: &ResId, next_string: &mut usize| -> u32 {
        match id {
            ResId::Id(n) => u32::from(*n),
            ResId::Name(s) => {
                let at = *next_string;
                put16(out, at, s.len() as u16);
                for (i, c) in s.iter().enumerate() {
                    put16(out, at + 2 + i * 2, *c);
                }
                *next_string += 2 + s.len() * 2;
                0x8000_0000 | at as u32
            }
        }
    };
    let write_header = |out: &mut [u8], at: usize, ids: &mut dyn Iterator<Item = &ResId>| {
        let (mut named, mut numbered) = (0u16, 0u16);
        for id in ids {
            match id {
                ResId::Name(_) => named += 1,
                ResId::Id(_) => numbered += 1,
            }
        }
        put16(out, at + 12, named);
        put16(out, at + 14, numbered);
    };

    let root = next_dir;
    next_dir += dir_size(tree.len());
    write_header(&mut out, root, &mut tree.keys());
    for (ti, (ty, names)) in tree.iter().enumerate() {
        let names_dir = next_dir;
        next_dir += dir_size(names.len());
        let name_word = write_name(&mut out, ty, &mut next_string);
        put32(&mut out, root + 16 + ti * 8, name_word);
        put32(&mut out, root + 16 + ti * 8 + 4, 0x8000_0000 | names_dir as u32);
        write_header(&mut out, names_dir, &mut names.keys());
        for (ni, (name, langs)) in names.iter().enumerate() {
            let langs_dir = next_dir;
            next_dir += dir_size(langs.len());
            let name_word = write_name(&mut out, name, &mut next_string);
            put32(&mut out, names_dir + 16 + ni * 8, name_word);
            put32(&mut out, names_dir + 16 + ni * 8 + 4, 0x8000_0000 | langs_dir as u32);
            put16(&mut out, langs_dir + 14, langs.len() as u16);
            for (li, (lang, leaf)) in langs.iter().enumerate() {
                let entry = next_entry;
                next_entry += 16;
                put32(&mut out, langs_dir + 16 + li * 8, u32::from(*lang));
                put32(&mut out, langs_dir + 16 + li * 8 + 4, entry as u32);
                put32(&mut out, entry, rva + next_data as u32);
                put32(&mut out, entry + 4, leaf.data.len() as u32);
                put32(&mut out, entry + 8, leaf.code_page);
                out[next_data..next_data + leaf.data.len()].copy_from_slice(&leaf.data);
                next_data = align8(next_data + leaf.data.len());
            }
        }
    }
    debug_assert_eq!(next_dir, entries_start);
    Ok(out)
}

fn align8(n: usize) -> usize {
    (n + 7) & !7
}

/// Applies `meta` to `tree`. Any call clears `OriginalFilename`, so the output does not claim to
/// be `bun.exe`.
pub(crate) fn apply(tree: &mut Tree, meta: &WindowsMetadata<'_>) -> Result<(), Error> {
    let version = match meta.version {
        Some(v) => Some(parse_version(v)?),
        None => None,
    };
    if let Some(ico) = meta.icon {
        set_icon(tree, ico)?;
    }

    let mut strings: Vec<(&str, Vec<u16>)> = Vec::new();
    for (key, value) in [
        ("ProductName", meta.title),
        ("CompanyName", meta.publisher),
        ("FileDescription", meta.description),
        ("LegalCopyright", meta.copyright),
    ] {
        if let Some(v) = value.filter(|v| !v.is_empty()) {
            strings.push((key, utf16(v)?));
        }
    }
    if let Some(v) = version {
        let text = utf16(format!("{}.{}.{}.{}", v[0], v[1], v[2], v[3]).as_bytes())?;
        strings.push(("FileVersion", text.clone()));
        strings.push(("ProductVersion", text));
    }
    strings.push(("OriginalFilename", Vec::new()));

    let names = tree.entry(ResId::Id(RT_VERSION)).or_default();
    let name = names.keys().next().cloned().unwrap_or(ResId::Id(1));
    let langs = names.entry(name).or_default();
    let lang = langs.keys().next().copied().unwrap_or(LANG_EN_US);
    let leaf = langs.entry(lang).or_insert_with(|| Leaf { code_page: 0, data: Vec::new() });

    let mut root = if leaf.data.is_empty() {
        VNode::new("VS_VERSION_INFO", 0, Vec::new())
    } else {
        VNode::parse(&leaf.data, 0)?
    };
    if root.value.len() < FIXED_FILE_INFO_LEN {
        root.value = default_fixed_file_info();
        root.value_len = FIXED_FILE_INFO_LEN as u16;
    }
    if let Some(v) = version {
        let ms = u32::from(v[0]) << 16 | u32::from(v[1]);
        let ls = u32::from(v[2]) << 16 | u32::from(v[3]);
        for (at, word) in [(8, ms), (12, ls), (16, ms), (20, ls)] {
            root.value[at..at + 4].copy_from_slice(&word.to_le_bytes());
        }
    }
    root.set_strings(&strings);
    leaf.data = root.serialize()?;
    Ok(())
}

fn utf16(bytes: &[u8]) -> Result<Vec<u16>, Error> {
    bun_core::strings::to_utf16_alloc_for_real(bytes, false, false).map_err(|_| Error::InvalidResources)
}

/// `1`, `1.2`, `1.2.3` or `1.2.3.4`, each part 0 to 65535; missing parts are 0.
pub(crate) fn parse_version(v: &[u8]) -> Result<[u16; 4], Error> {
    let mut out = [0u16; 4];
    let mut count = 0usize;
    for part in bun_core::strings::tokenize(v, b".") {
        if count == 4 {
            return Err(Error::InvalidVersionFormat);
        }
        out[count] = bun_core::fmt::parse_unsigned::<u16>(part, 10).map_err(|_| Error::InvalidVersionFormat)?;
        count += 1;
    }
    if count == 0 {
        return Err(Error::InvalidVersionFormat);
    }
    Ok(out)
}

/// Replaces the first icon group (and the icons it lists) with the images of `ico`.
fn set_icon(tree: &mut Tree, ico: &[u8]) -> Result<(), Error> {
    if u16_at(ico, 0).ok() != Some(0) || u16_at(ico, 2).ok() != Some(1) {
        return Err(Error::InvalidIcon);
    }
    let count = usize::from(u16_at(ico, 4).map_err(|_| Error::InvalidIcon)?);
    if count == 0 {
        return Err(Error::InvalidIcon);
    }
    let mut images = Vec::with_capacity(count);
    for i in 0..count {
        let entry = ico.get(6 + i * 16..6 + i * 16 + 16).ok_or(Error::InvalidIcon)?;
        let size = u32::from_le_bytes([entry[8], entry[9], entry[10], entry[11]]) as usize;
        let offset = u32::from_le_bytes([entry[12], entry[13], entry[14], entry[15]]) as usize;
        let end = offset.checked_add(size).ok_or(Error::InvalidIcon)?;
        let data = ico.get(offset..end).filter(|d| !d.is_empty()).ok_or(Error::InvalidIcon)?;
        images.push((&entry[..12], data));
    }

    let groups = tree.entry(ResId::Id(RT_GROUP_ICON)).or_default();
    let lang = groups
        .values()
        .flat_map(|langs| langs.keys())
        .min()
        .copied()
        .unwrap_or(LANG_EN_US);
    let group_name = groups
        .iter()
        .find(|(_, langs)| langs.contains_key(&lang))
        .map(|(name, _)| name.clone())
        .unwrap_or(ResId::Id(1));
    let old_group = groups.get_mut(&group_name).and_then(|langs| langs.remove(&lang));

    let icons = tree.entry(ResId::Id(RT_ICON)).or_default();
    if let Some(old) = old_group {
        let old_count = usize::from(u16_at(&old.data, 4).unwrap_or(0));
        for i in 0..old_count {
            if let Ok(id) = u16_at(&old.data, 6 + i * 14 + 12) {
                if let Some(langs) = icons.get_mut(&ResId::Id(id)) {
                    langs.remove(&lang);
                }
            }
        }
    }
    icons.retain(|_, langs| !langs.is_empty());

    let mut group = Vec::with_capacity(6 + images.len() * 14);
    group.extend_from_slice(&[0, 0, 1, 0]);
    group.extend_from_slice(&(images.len() as u16).to_le_bytes());
    let mut next_id: u16 = 1;
    for (header, data) in images {
        while icons.contains_key(&ResId::Id(next_id)) {
            next_id = next_id.checked_add(1).ok_or(Error::InvalidIcon)?;
        }
        // GRPICONDIRENTRY is ICONDIRENTRY with the 4-byte image offset replaced by a 2-byte id.
        group.extend_from_slice(header);
        group.extend_from_slice(&next_id.to_le_bytes());
        icons
            .entry(ResId::Id(next_id))
            .or_default()
            .insert(lang, Leaf { code_page: 0, data: data.to_vec() });
    }
    tree.entry(ResId::Id(RT_GROUP_ICON))
        .or_default()
        .entry(group_name)
        .or_default()
        .insert(lang, Leaf { code_page: 0, data: group });
    Ok(())
}

const FIXED_FILE_INFO_LEN: usize = 52;

fn default_fixed_file_info() -> Vec<u8> {
    let mut info = vec![0u8; FIXED_FILE_INFO_LEN];
    for (at, word) in [
        (0, 0xFEEF_04BDu32), // dwSignature
        (4, 0x0001_0000),    // dwStrucVersion
        (24, 0x3F),          // dwFileFlagsMask
        (32, 0x0004_0004),   // dwFileOS: VOS_NT_WINDOWS32
        (36, 1),             // dwFileType: VFT_APP
    ] {
        info[at..at + 4].copy_from_slice(&word.to_le_bytes());
    }
    info
}

/// A `VS_VERSIONINFO` block: `VS_VERSION_INFO` > `StringFileInfo` > string tables > strings, and
/// `VarFileInfo` > `Translation`.
#[derive(Clone, Debug)]
struct VNode {
    key: Vec<u16>,
    /// 1: text (`value_len` counts UTF-16 units), 0: binary (`value_len` counts bytes).
    ty: u16,
    value_len: u16,
    value: Vec<u8>,
    children: Vec<VNode>,
}

impl VNode {
    fn new(key: &str, ty: u16, value: Vec<u8>) -> VNode {
        VNode {
            key: key.encode_utf16().collect(),
            ty,
            value_len: 0,
            value,
            children: Vec::new(),
        }
    }

    fn key_is(&self, key: &str) -> bool {
        self.key.iter().copied().eq(key.encode_utf16())
    }

    fn parse(b: &[u8], depth: u8) -> Result<VNode, Error> {
        let len = usize::from(u16_at(b, 0)?);
        let b = b.get(..len).filter(|_| len >= 6).ok_or(Error::InvalidResources)?;
        let value_len = u16_at(b, 2)?;
        let ty = u16_at(b, 4)?;
        let mut key = Vec::new();
        let mut off = 6;
        loop {
            let c = u16_at(b, off)?;
            off += 2;
            if c == 0 {
                break;
            }
            key.push(c);
        }
        off = align4(off).min(len);
        let value_bytes = if ty == 1 { usize::from(value_len) * 2 } else { usize::from(value_len) };
        let value_end = (off + value_bytes).min(len);
        let value = b[off..value_end].to_vec();
        off = align4(value_end);
        let mut node = VNode { key, ty, value_len, value, children: Vec::new() };
        // Only VS_VERSION_INFO, StringFileInfo, VarFileInfo and string tables have children.
        if depth == 0 || (node.value.is_empty() && depth < 3) {
            while off + 6 <= len {
                let child_len = usize::from(u16_at(b, off)?);
                if child_len == 0 {
                    break;
                }
                node.children.push(VNode::parse(&b[off..], depth + 1)?);
                off = align4(off + child_len);
            }
        }
        Ok(node)
    }

    fn serialize(&self) -> Result<Vec<u8>, Error> {
        let mut out = Vec::new();
        self.write(&mut out)?;
        Ok(out)
    }

    fn write(&self, out: &mut Vec<u8>) -> Result<(), Error> {
        let start = out.len();
        out.extend_from_slice(&[0, 0]);
        out.extend_from_slice(&self.value_len.to_le_bytes());
        out.extend_from_slice(&self.ty.to_le_bytes());
        for c in self.key.iter().chain([&0u16]) {
            out.extend_from_slice(&c.to_le_bytes());
        }
        if !self.value.is_empty() {
            out.resize(align4(out.len()), 0);
            out.extend_from_slice(&self.value);
        }
        for child in &self.children {
            out.resize(align4(out.len()), 0);
            child.write(out)?;
        }
        let len = u16::try_from(out.len() - start).map_err(|_| Error::ResourceTooLarge)?;
        out[start..start + 2].copy_from_slice(&len.to_le_bytes());
        Ok(())
    }

    /// Sets each string in every string table, adding `StringFileInfo` (en-US, Unicode) and its
    /// `VarFileInfo` translation when the block has none.
    fn set_strings(&mut self, strings: &[(&str, Vec<u16>)]) {
        if !self.children.iter().any(|c| c.key_is("StringFileInfo")) {
            let at = self
                .children
                .iter()
                .position(|c| c.key_is("VarFileInfo"))
                .unwrap_or(self.children.len());
            self.children.insert(at, VNode::new("StringFileInfo", 1, Vec::new()));
        }
        if !self.children.iter().any(|c| c.key_is("VarFileInfo")) {
            let translation = u32::from(CODE_PAGE_UNICODE) << 16 | u32::from(LANG_EN_US);
            let mut var = VNode::new("Translation", 0, translation.to_le_bytes().to_vec());
            var.value_len = 4;
            let mut var_file_info = VNode::new("VarFileInfo", 1, Vec::new());
            var_file_info.children.push(var);
            self.children.push(var_file_info);
        }
        let Some(file_info) = self.children.iter_mut().find(|c| c.key_is("StringFileInfo")) else {
            return;
        };
        if file_info.children.is_empty() {
            let key = format!("{LANG_EN_US:04x}{CODE_PAGE_UNICODE:04x}");
            file_info.children.push(VNode::new(&key, 1, Vec::new()));
        }
        for table in &mut file_info.children {
            for (key, value) in strings {
                let mut bytes = Vec::with_capacity(value.len() * 2 + 2);
                for c in value.iter().chain([&0u16]) {
                    bytes.extend_from_slice(&c.to_le_bytes());
                }
                let value_len = (value.len() + 1) as u16;
                match table.children.iter_mut().find(|s| s.key_is(key)) {
                    Some(s) => {
                        s.ty = 1;
                        s.value_len = value_len;
                        s.value = bytes;
                    }
                    None => {
                        let mut s = VNode::new(key, 1, bytes);
                        s.value_len = value_len;
                        table.children.push(s);
                    }
                }
            }
        }
    }
}
