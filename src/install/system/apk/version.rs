//! Alpine version ordering and dependency atoms.
//!
//! Ported from apk-tools `src/version.c` and `apk_dep_parse`
//! (GPL-2.0-only, Copyright (C) 2005-2008 Natanael Copa, 2008-2011 Timo Teräs;
//! aphrody-labs/apk-tools@44dcdfc, apk-tools 3.0.8).
//! Pure: no I/O.

use core::cmp::Ordering;

pub const EQUAL: u8 = 1;
pub const LESS: u8 = 2;
pub const GREATER: u8 = 4;
pub const FUZZY: u8 = 8;
pub const CONFLICT: u8 = 16;
pub const ANY: u8 = EQUAL | LESS | GREATER;
pub const CHECKSUM: u8 = LESS | GREATER;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum Tok {
    InitialDigit,
    Digit,
    Letter,
    Suffix,
    SuffixNo,
    CommitHash,
    RevisionNo,
    End,
    Invalid,
}

// SUFFIX_INVALID=0, ALPHA, BETA, PRE, RC, NONE, CVS, SVN, GIT, HG, P
const SUFFIX_NONE: u8 = 5;

fn suffix_value(s: &[u8]) -> u8 {
    match s {
        b"alpha" => 1,
        b"beta" => 2,
        b"pre" => 3,
        b"rc" => 4,
        b"cvs" => 6,
        b"svn" => 7,
        b"git" => 8,
        b"hg" => 9,
        b"p" => 10,
        _ => 0,
    }
}

struct State<'a> {
    token: Tok,
    suffix: u8,
    number: u64,
    value: &'a [u8],
    rest: &'a [u8],
}

impl<'a> State<'a> {
    fn first(v: &'a [u8]) -> State<'a> {
        let mut s = State { token: Tok::InitialDigit, suffix: 0, number: 0, value: b"", rest: v };
        s.parse_digits();
        s
    }

    fn parse_digits(&mut self) {
        let n = self.rest.iter().take_while(|b| b.is_ascii_digit()).count();
        self.value = &self.rest[..n];
        self.number = self.value.iter().fold(0u64, |acc, &d| acc.wrapping_mul(10).wrapping_add(u64::from(d - b'0')));
        self.rest = &self.rest[n..];
        if n == 0 {
            self.token = Tok::Invalid;
        }
    }

    fn next(&mut self) {
        let Some(&c) = self.rest.first() else {
            self.token = Tok::End;
            return;
        };
        match c {
            b'a'..=b'z' => {
                if self.token > Tok::Digit {
                    self.token = Tok::Invalid;
                    return;
                }
                self.value = &self.rest[..1];
                self.token = Tok::Letter;
                self.rest = &self.rest[1..];
            }
            b'.' | b'0'..=b'9' => {
                if c == b'.' {
                    if self.token > Tok::Digit {
                        self.token = Tok::Invalid;
                        return;
                    }
                    self.rest = &self.rest[1..];
                }
                self.token = match self.token {
                    Tok::InitialDigit | Tok::Digit => Tok::Digit,
                    Tok::Suffix => Tok::SuffixNo,
                    _ => {
                        self.token = Tok::Invalid;
                        return;
                    }
                };
                self.parse_digits();
            }
            b'_' => {
                if self.token > Tok::SuffixNo {
                    self.token = Tok::Invalid;
                    return;
                }
                self.rest = &self.rest[1..];
                let n = self.rest.iter().take_while(|b| b.is_ascii_lowercase()).count();
                self.value = &self.rest[..n];
                self.rest = &self.rest[n..];
                self.suffix = suffix_value(self.value);
                self.token = if self.suffix == 0 { Tok::Invalid } else { Tok::Suffix };
            }
            b'~' => {
                if self.token >= Tok::CommitHash {
                    self.token = Tok::Invalid;
                    return;
                }
                self.rest = &self.rest[1..];
                let n = self.rest.iter().take_while(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')).count();
                self.value = &self.rest[..n];
                self.rest = &self.rest[n..];
                self.token = if n == 0 { Tok::Invalid } else { Tok::CommitHash };
            }
            b'-' => {
                if self.token >= Tok::RevisionNo || !self.rest.starts_with(b"-r") {
                    self.token = Tok::Invalid;
                    return;
                }
                self.rest = &self.rest[2..];
                self.token = Tok::RevisionNo;
                self.parse_digits();
            }
            _ => self.token = Tok::Invalid,
        }
    }
}

fn blob_sort(a: &[u8], b: &[u8]) -> Ordering {
    let n = a.len().min(b.len());
    a[..n].cmp(&b[..n]).then(a.len().cmp(&b.len()))
}

fn token_cmp(a: &State<'_>, b: &State<'_>) -> u8 {
    let (x, y) = match a.token {
        Tok::Digit if a.value.first() == Some(&b'0') || b.value.first() == Some(&b'0') => {
            return ord_to_mask(blob_sort(a.value, b.value));
        }
        Tok::Digit | Tok::InitialDigit | Tok::SuffixNo | Tok::RevisionNo => (a.number, b.number),
        Tok::Letter => (u64::from(a.value[0]), u64::from(b.value[0])),
        Tok::Suffix => (u64::from(a.suffix), u64::from(b.suffix)),
        _ => return ord_to_mask(blob_sort(a.value, b.value)),
    };
    ord_to_mask(x.cmp(&y))
}

fn ord_to_mask(o: Ordering) -> u8 {
    match o {
        Ordering::Less => LESS,
        Ordering::Equal => EQUAL,
        Ordering::Greater => GREATER,
    }
}

/// `apk_version_compare_fuzzy`; `None` stands for a null version.
fn compare_fuzzy(a: Option<&[u8]>, b: Option<&[u8]>, fuzzy: bool) -> u8 {
    let (a, b) = match (a, b) {
        (None, None) => return EQUAL,
        (Some(a), Some(b)) => (a, b),
        _ => return EQUAL | GREATER | LESS,
    };
    let mut ta = State::first(a);
    let mut tb = State::first(b);
    while ta.token == tb.token && ta.token < Tok::End {
        let r = token_cmp(&ta, &tb);
        if r != EQUAL {
            return r;
        }
        ta.next();
        tb.next();
    }
    if ta.token == tb.token {
        return EQUAL;
    }
    if tb.token == Tok::End && fuzzy {
        return EQUAL;
    }
    if ta.token == Tok::Suffix && ta.suffix < SUFFIX_NONE {
        return LESS;
    }
    if tb.token == Tok::Suffix && tb.suffix < SUFFIX_NONE {
        return GREATER;
    }
    if ta.token > tb.token {
        return LESS;
    }
    if tb.token > ta.token {
        return GREATER;
    }
    EQUAL
}

pub fn compare(a: &str, b: &str) -> Ordering {
    match compare_fuzzy(Some(a.as_bytes()), Some(b.as_bytes()), false) {
        LESS => Ordering::Less,
        GREATER => Ordering::Greater,
        _ => Ordering::Equal,
    }
}

pub fn validate(v: &str) -> bool {
    let mut t = State::first(v.as_bytes());
    while t.token < Tok::End {
        t.next();
    }
    t.token == Tok::End
}

/// `apk_version_match(a, op, b)`; `None` versions match like apk's null atoms.
pub fn matches(a: Option<&str>, op: u8, b: Option<&str>) -> bool {
    let mut ok = (op & ANY) == ANY
        || compare_fuzzy(a.map(str::as_bytes), b.map(str::as_bytes), op & FUZZY != 0) & op != 0;
    if op & CONFLICT != 0 {
        ok = !ok;
    }
    ok
}

pub fn op_mask(op: &[u8]) -> u8 {
    let mut r = 0u8;
    for &c in op {
        r |= match c {
            b'<' => LESS,
            b'>' => GREATER,
            b'=' => EQUAL,
            b'~' => FUZZY | EQUAL,
            _ => return 0,
        };
    }
    r
}

pub fn op_string(op: u8) -> &'static str {
    match op & !CONFLICT {
        LESS => "<",
        x if x == LESS | EQUAL => "<=",
        x if x == LESS | EQUAL | FUZZY => "<~",
        x if x == EQUAL | FUZZY || x == FUZZY => "~",
        EQUAL => "=",
        x if x == GREATER | EQUAL => ">=",
        x if x == GREATER | EQUAL | FUZZY => ">~",
        GREATER => ">",
        CHECKSUM => "><",
        ANY => "",
        _ => "?",
    }
}

/// A dependency atom: `[!]name[@tag][op version]`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Dep {
    pub name: String,
    pub op: u8,
    /// `None` when unversioned.
    pub version: Option<String>,
    pub tag: Option<String>,
}

impl Dep {
    pub fn any(name: &str) -> Dep {
        Dep { name: name.to_owned(), op: ANY, version: None, tag: None }
    }

    pub fn is_conflict(&self) -> bool {
        self.op & CONFLICT != 0
    }

    /// Parses one atom; `None` on a malformed one.
    pub fn parse(spec: &str) -> Option<Dep> {
        let mut s = spec.as_bytes();
        let mut op = 0u8;
        if let Some(rest) = s.strip_prefix(b"!") {
            op |= CONFLICT;
            s = rest;
        }
        let cmp_at = bun_core::strings::index_of_any(s, b"<>=~");
        let (name, version) = match cmp_at {
            Some(i) => {
                let tail = &s[i..];
                let n = tail.iter().take_while(|b| matches!(b, b'<' | b'>' | b'=' | b'~')).count();
                let mask = op_mask(&tail[..n]);
                if mask == 0 {
                    return None;
                }
                op |= mask;
                (&s[..i], Some(&tail[n..]))
            }
            None => {
                op |= ANY;
                (s, None)
            }
        };
        let (name, tag) = match bun_core::strings::index_of_char_usize(name, b'@') {
            Some(at) => (&name[..at], Some(&name[at + 1..])),
            None => (name, None),
        };
        if name.is_empty() {
            return None;
        }
        Some(Dep {
            name: core::str::from_utf8(name).ok()?.to_owned(),
            op,
            version: match version {
                Some(v) => Some(core::str::from_utf8(v).ok()?.to_owned()),
                None => None,
            },
            tag: match tag {
                Some(t) => Some(core::str::from_utf8(t).ok()?.to_owned()),
                None => None,
            },
        })
    }

    /// Space-separated list (`D:`, `p:`, `i:`, `r:` fields, world file).
    pub fn parse_list(text: &str) -> Vec<Dep> {
        bun_core::strings::tokenize_any(text.as_bytes(), b" \t\n")
            .filter_map(|w| core::str::from_utf8(w).ok().and_then(Dep::parse))
            .collect()
    }

    /// `apk_dep_is_provided` against a provider version (`None` for unversioned provides).
    pub fn matches_version(&self, version: Option<&str>) -> bool {
        if self.op & !CONFLICT == CHECKSUM {
            return !self.is_conflict();
        }
        matches(version, self.op, self.version.as_deref())
    }
}

impl core::fmt::Display for Dep {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        if self.is_conflict() {
            f.write_str("!")?;
        }
        f.write_str(&self.name)?;
        if let Some(tag) = &self.tag {
            write!(f, "@{tag}")?;
        }
        if let Some(v) = &self.version {
            write!(f, "{}{v}", op_string(self.op))?;
        }
        Ok(())
    }
}

pub fn format_list(deps: &[Dep]) -> String {
    let mut out = String::new();
    for (i, d) in deps.iter().enumerate() {
        if i > 0 {
            out.push(' ');
        }
        out.push_str(&d.to_string());
    }
    out
}
