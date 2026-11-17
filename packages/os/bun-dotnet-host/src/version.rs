// SPDX-License-Identifier: MIT
//! `fx_ver_t` of the .NET host: `major.minor.patch[-pre][+build]`, SemVer 2.0 precedence
//! (a release sorts after its prereleases, build metadata is ignored).

use std::cmp::Ordering;
use std::fmt;

#[derive(Debug, Clone)]
pub struct Version {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
    /// Prerelease identifiers (after `-`), empty for a release.
    pub pre: String,
    text: String,
}

impl Version {
    pub fn parse(text: &str) -> Option<Self> {
        let core_and_pre = text.split_once('+').map_or(text, |(left, _)| left);
        let (core, pre) = match core_and_pre.split_once('-') {
            Some((core, pre)) if !pre.is_empty() => (core, pre),
            Some(_) => return None,
            None => (core_and_pre, ""),
        };
        let mut parts = core.split('.');
        let mut next = || -> Option<u64> {
            let part = parts.next()?;
            if part.is_empty() || (part.len() > 1 && part.starts_with('0')) {
                return None;
            }
            part.parse().ok()
        };
        let (major, minor, patch) = (next()?, next()?, next()?);
        if parts.next().is_some() {
            return None;
        }
        Some(Self {
            major,
            minor,
            patch,
            pre: pre.to_owned(),
            text: text.to_owned(),
        })
    }

    pub fn is_prerelease(&self) -> bool {
        !self.pre.is_empty()
    }

    /// SDK feature band: the hundreds of the patch (`10.0.401` → 4).
    pub fn feature_band(&self) -> u64 {
        self.patch / 100
    }

    pub fn as_str(&self) -> &str {
        &self.text
    }
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.text)
    }
}

fn compare_pre(a: &str, b: &str) -> Ordering {
    match (a.is_empty(), b.is_empty()) {
        (true, true) => return Ordering::Equal,
        (true, false) => return Ordering::Greater,
        (false, true) => return Ordering::Less,
        _ => {}
    }
    let mut left = a.split('.');
    let mut right = b.split('.');
    loop {
        match (left.next(), right.next()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) => {
                let order = match (x.parse::<u64>(), y.parse::<u64>()) {
                    (Ok(x), Ok(y)) => x.cmp(&y),
                    (Ok(_), Err(_)) => Ordering::Less,
                    (Err(_), Ok(_)) => Ordering::Greater,
                    (Err(_), Err(_)) => x.cmp(y),
                };
                if order != Ordering::Equal {
                    return order;
                }
            }
        }
    }
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        (self.major, self.minor, self.patch)
            .cmp(&(other.major, other.minor, other.patch))
            .then_with(|| compare_pre(&self.pre, &other.pre))
    }
}

impl PartialEq for Version {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for Version {}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[cfg(test)]
mod tests {
    use super::Version;

    fn v(text: &str) -> Version {
        Version::parse(text).unwrap()
    }

    #[test]
    fn precedence() {
        assert!(v("10.0.100-preview.7") < v("10.0.100-rc.1"));
        assert!(v("10.0.100-rc.1.25451.107") < v("10.0.100"));
        assert!(v("10.0.100-rc.2") < v("10.0.100-rc.10"));
        assert!(v("8.0.23") < v("10.0.12"));
        assert_eq!(v("10.0.401").feature_band(), 4);
        assert!(Version::parse("10.0").is_none());
        assert!(Version::parse("10.0.01").is_none());
        assert_eq!(v("1.2.3+abc"), v("1.2.3+abc"));
    }
}
