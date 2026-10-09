//! Loose version ordering and ranges shared by the system sources.
//!
//! Versions are dot/dash separated parts; numeric parts compare numerically,
//! others lexically, a missing part counts as `0` (`1.2` == `1.2.0`), and a
//! textual part sorts before a numeric one (`1.0-beta` < `1.0`).
//!
//! Ranges: `*`, `latest`, `""`, an exact version, comparators (`>=1.2 <2`),
//! `^1.2`, `~1.2`, `1.2.x`, alternatives joined with `||`.

use core::cmp::Ordering;

use bun_core::strings;

/// ASCII-delimited pieces of a `&str` are still valid UTF-8.
fn text(piece: &[u8]) -> &str {
    core::str::from_utf8(piece).unwrap_or("")
}

fn parts(v: &str) -> impl Iterator<Item = &str> {
    strings::tokenize_any(v.trim().trim_start_matches(['v', 'V']).as_bytes(), b".-+_").map(text)
}

fn cmp_part(a: Option<&str>, b: Option<&str>) -> Ordering {
    let a = a.unwrap_or("0");
    let b = b.unwrap_or("0");
    match (a.parse::<u64>(), b.parse::<u64>()) {
        (Ok(x), Ok(y)) => x.cmp(&y),
        (Ok(_), Err(_)) => Ordering::Greater,
        (Err(_), Ok(_)) => Ordering::Less,
        (Err(_), Err(_)) => a.to_ascii_lowercase().cmp(&b.to_ascii_lowercase()),
    }
}

pub fn compare(a: &str, b: &str) -> Ordering {
    let mut ia = parts(a);
    let mut ib = parts(b);
    loop {
        match (ia.next(), ib.next()) {
            (None, None) => return Ordering::Equal,
            (x, y) => match cmp_part(x, y) {
                Ordering::Equal => continue,
                o => return o,
            },
        }
    }
}

fn numeric_prefix(v: &str) -> Vec<u64> {
    parts(v).map_while(|p| p.parse::<u64>().ok()).collect()
}

/// `1.2.x` / `1.2.*` / `1.2` as a prefix match on the given parts.
fn prefix_matches(pattern: &str, version: &str) -> bool {
    let pat: Vec<&str> = parts(pattern).take_while(|p| !matches!(*p, "x" | "X" | "*")).collect();
    let ver: Vec<&str> = parts(version).collect();
    pat.iter().enumerate().all(|(i, p)| {
        ver.get(i)
            .is_some_and(|v| cmp_part(Some(p), Some(v)) == Ordering::Equal)
    })
}

fn bump_at(base: &[u64], idx: usize) -> String {
    let mut out: Vec<u64> = base.iter().take(idx + 1).copied().collect();
    while out.len() <= idx {
        out.push(0);
    }
    out[idx] += 1;
    out.iter().map(u64::to_string).collect::<Vec<_>>().join(".")
}

fn comparator_matches(c: &str, version: &str) -> bool {
    let c = c.trim();
    if c.is_empty() || c == "*" || c.eq_ignore_ascii_case("latest") {
        return true;
    }
    for (op, f) in [
        (">=", (|o: Ordering| o != Ordering::Less) as fn(Ordering) -> bool),
        ("<=", |o| o != Ordering::Greater),
        (">", |o| o == Ordering::Greater),
        ("<", |o| o == Ordering::Less),
        ("==", |o| o == Ordering::Equal),
        ("=", |o| o == Ordering::Equal),
    ] {
        if let Some(rest) = c.strip_prefix(op) {
            return f(compare(version, rest.trim()));
        }
    }
    if let Some(rest) = c.strip_prefix('^') {
        let base = numeric_prefix(rest);
        if compare(version, rest) == Ordering::Less {
            return false;
        }
        let first_nonzero = base.iter().position(|&n| n != 0).unwrap_or(base.len().saturating_sub(1));
        return compare(version, &bump_at(&base, first_nonzero)) == Ordering::Less;
    }
    if let Some(rest) = c.strip_prefix('~') {
        let base = numeric_prefix(rest);
        if compare(version, rest) == Ordering::Less {
            return false;
        }
        let idx = if base.len() >= 2 { 1 } else { 0 };
        return compare(version, &bump_at(&base, idx)) == Ordering::Less;
    }
    if strings::split(c.as_bytes(), b".").any(|p| matches!(p, b"x" | b"X" | b"*")) {
        return prefix_matches(c, version);
    }
    compare(version, c) == Ordering::Equal
}

/// Whether `version` satisfies `range`.
pub fn satisfies(range: &str, version: &str) -> bool {
    strings::split(range.as_bytes(), b"||").any(|alt| {
        let mut tokens = strings::tokenize_any(alt, b" \t").map(text);
        let mut all = true;
        let mut any = false;
        while let Some(tok) = tokens.next() {
            // `>= 1.2` written with a space.
            let owned;
            let tok = if matches!(tok, ">=" | "<=" | ">" | "<" | "=" | "==" | "^" | "~") {
                match tokens.next() {
                    Some(next) => {
                        owned = format!("{tok}{next}");
                        owned.as_str()
                    }
                    None => tok,
                }
            } else {
                tok
            };
            any = true;
            all &= comparator_matches(tok, version);
        }
        !any || all
    })
}

/// `true` for ranges that pin one version (no operators or wildcards).
pub fn is_exact(range: &str) -> bool {
    let r = range.trim();
    !r.is_empty()
        && !r.eq_ignore_ascii_case("latest")
        && strings::index_of_any(r.as_bytes(), b"*xX^~<>=| ").is_none()
}

/// Highest version in `versions` satisfying `range`, by `cmp`.
pub fn best_match<'a>(
    versions: impl IntoIterator<Item = &'a str>,
    range: &str,
    cmp: impl Fn(&str, &str) -> Ordering,
) -> Option<&'a str> {
    let mut best: Option<&'a str> = None;
    for v in versions {
        if !satisfies(range, v) {
            continue;
        }
        best = match best {
            Some(b) if cmp(v, b) != Ordering::Greater => Some(b),
            _ => Some(v),
        };
    }
    best
}
