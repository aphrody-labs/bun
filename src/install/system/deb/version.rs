// SPDX-License-Identifier: Apache-2.0
//! Debian version ordering, deliberately distinct from npm semantic versions.
use super::AsciiFields;
use std::cmp::Ordering;

fn integer(a: &[u8], b: &[u8]) -> Ordering {
    let a = &a[a.iter().position(|c| *c != b'0').unwrap_or(a.len())..];
    let b = &b[b.iter().position(|c| *c != b'0').unwrap_or(b.len())..];
    a.len().cmp(&b.len()).then_with(|| a.cmp(b))
}

fn order(c: Option<u8>) -> i16 {
    match c {
        Some(b'~') => -1,
        None => 0,
        Some(c) if c.is_ascii_alphabetic() => c as i16,
        Some(c) => c as i16 + 256,
    }
}

fn part(mut a: &[u8], mut b: &[u8]) -> Ordering {
    while !a.is_empty() || !b.is_empty() {
        while a.first().is_some_and(|c| !c.is_ascii_digit())
            || b.first().is_some_and(|c| !c.is_ascii_digit())
        {
            let ca = a.first().copied().filter(|c| !c.is_ascii_digit());
            let cb = b.first().copied().filter(|c| !c.is_ascii_digit());
            let cmp = order(ca).cmp(&order(cb));
            if cmp != Ordering::Equal {
                return cmp;
            }
            if ca.is_some() {
                a = &a[1..];
            }
            if cb.is_some() {
                b = &b[1..];
            }
        }
        let na = a
            .iter()
            .position(|c| !c.is_ascii_digit())
            .unwrap_or(a.len());
        let nb = b
            .iter()
            .position(|c| !c.is_ascii_digit())
            .unwrap_or(b.len());
        let cmp = integer(&a[..na], &b[..nb]);
        if cmp != Ordering::Equal {
            return cmp;
        }
        a = &a[na..];
        b = &b[nb..];
    }
    Ordering::Equal
}

pub fn valid(s: &str) -> bool {
    let (_, rest) = s.split_ascii_once(":").unwrap_or(("0", s));
    let epoch = s.split_ascii_once(":").map(|(e, _)| e).unwrap_or("0");
    !epoch.is_empty()
        && epoch.bytes().all(|c| c.is_ascii_digit())
        && rest.as_bytes().first().is_some_and(u8::is_ascii_digit)
        && rest
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b".+~-:".contains(&c))
        && !rest.ends_with('-')
}

pub fn compare(a: &str, b: &str) -> Ordering {
    let (ea, a) = a.split_ascii_once(":").unwrap_or(("0", a));
    let (eb, b) = b.split_ascii_once(":").unwrap_or(("0", b));
    let (ua, ra) = a.rsplit_ascii_once("-").unwrap_or((a, "0"));
    let (ub, rb) = b.rsplit_ascii_once("-").unwrap_or((b, "0"));
    integer(ea.as_bytes(), eb.as_bytes())
        .then_with(|| part(ua.as_bytes(), ub.as_bytes()))
        .then_with(|| part(ra.as_bytes(), rb.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dpkg_order() {
        for (a, b) in [
            ("1.0~rc1", "1.0"),
            ("1.9", "1.10"),
            ("1.0-2", "1.0-10"),
            ("9.0", "1:1.0"),
            ("1.0a", "1.0+"),
        ] {
            assert_eq!(compare(a, b), Ordering::Less);
            assert_eq!(compare(b, a), Ordering::Greater);
        }
        assert_eq!(compare("1.01", "1.1"), Ordering::Equal);
        assert_eq!(compare("1.0", "1.0-0"), Ordering::Equal);
    }
}
