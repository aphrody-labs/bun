use std::{
    collections::{HashMap, VecDeque},
    sync::RwLock,
};

/// Origins whose robots.txt rules are kept per context; past this the oldest is
/// evicted and refetched if visited again.
const MAX_ROBOTS_ENTRIES: usize = 4096;
/// Bytes of a robots.txt body that are parsed (Google's documented limit).
const MAX_ROBOTS_BODY_BYTES: usize = 500 * 1024;

pub struct RobotsCache {
    cache: RwLock<RobotsEntries>,
}

#[derive(Default)]
struct RobotsEntries {
    rules: HashMap<String, RobotsRules>,
    /// Origins in insertion order, oldest first, for eviction.
    order: VecDeque<String>,
}

#[derive(Debug, Clone)]
struct RobotsRules {
    disallowed: Vec<String>,
    allowed: Vec<String>,
}

impl RobotsCache {
    pub fn new() -> Self {
        RobotsCache {
            cache: RwLock::new(RobotsEntries::default()),
        }
    }

    pub fn parse_and_store(&self, domain: &str, body: &str, our_agent: &str) {
        let rules = parse_robots_txt(truncate_body(body), our_agent);
        let mut cache = self.cache.write().unwrap();
        if cache.rules.insert(domain.to_string(), rules).is_none() {
            cache.order.push_back(domain.to_string());
        }
        while cache.rules.len() > MAX_ROBOTS_ENTRIES {
            let Some(oldest) = cache.order.pop_front() else {
                break;
            };
            cache.rules.remove(&oldest);
        }
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.cache.read().unwrap().rules.len()
    }

    pub fn contains(&self, origin: &str) -> bool {
        self.cache.read().unwrap().rules.contains_key(origin)
    }

    pub fn is_allowed(&self, domain: &str, path: &str) -> bool {
        let cache = self.cache.read().unwrap();
        let rules = match cache.rules.get(domain) {
            Some(r) => r,
            None => return true,
        };

        // RFC 9309 2.2.2: longest rule wins, with Allow winning equal matches.
        let longest = |patterns: &[String]| {
            patterns
                .iter()
                .filter(|pattern| path_matches(path, pattern))
                .map(|pattern| pattern.len())
                .max()
        };
        match (longest(&rules.allowed), longest(&rules.disallowed)) {
            (Some(allow), Some(disallow)) => allow >= disallow,
            (None, Some(_)) => false,
            _ => true,
        }
    }
}

impl Default for RobotsCache {
    fn default() -> Self {
        Self::new()
    }
}

/// The first `MAX_ROBOTS_BODY_BYTES` of `body`, cut back to the last complete
/// line so no rule is parsed from a truncated line.
fn truncate_body(body: &str) -> &str {
    if body.len() <= MAX_ROBOTS_BODY_BYTES {
        return body;
    }
    let mut end = MAX_ROBOTS_BODY_BYTES;
    while !body.is_char_boundary(end) {
        end -= 1;
    }
    let head = &body[..end];
    head.rfind('\n').map_or(head, |newline| &head[..newline])
}

fn parse_robots_txt(body: &str, our_agent: &str) -> RobotsRules {
    // RFC 9309 2.2.1: a group applies when its product token equals one of
    // ours, case-insensitively. Our identification string is a full
    // User-Agent, so split it into its product tokens. Substring matching in
    // either direction let "User-agent: Moz" govern a Mozilla/5.0 UA and
    // "User-agent: BunBrowserBot" govern a UA of "BunBrowser".
    let our_tokens: Vec<String> = our_agent
        .split(|c: char| c.is_whitespace() || matches!(c, '/' | '(' | ')' | ';' | ','))
        .filter(|token| !token.is_empty())
        .map(str::to_lowercase)
        .collect();
    let mut specific = RobotsRules {
        disallowed: Vec::new(),
        allowed: Vec::new(),
    };
    let mut wildcard = specific.clone();
    let mut group_specific = false;
    let mut group_wildcard = false;
    let mut has_rules = false;
    let mut found_specific = false;

    for line in body.lines() {
        let line = line.split('#').next().unwrap_or("").trim();
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        match key.trim().to_ascii_lowercase().as_str() {
            "user-agent" => {
                // Consecutive headers share rules; a header after rules starts a group.
                if has_rules {
                    group_specific = false;
                    group_wildcard = false;
                    has_rules = false;
                }
                let matches = our_tokens
                    .iter()
                    .any(|token| token.eq_ignore_ascii_case(value));
                group_specific |= matches;
                group_wildcard |= value == "*";
                found_specific |= matches;
            }
            key @ ("allow" | "disallow") => {
                has_rules = true;
                if !value.starts_with('/') {
                    continue;
                }
                for (matches, rules) in [
                    (group_specific, &mut specific),
                    (group_wildcard, &mut wildcard),
                ] {
                    if matches {
                        if key == "allow" {
                            rules.allowed.push(value.to_string());
                        } else {
                            rules.disallowed.push(value.to_string());
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if found_specific {
        specific
    } else {
        wildcard
    }
}

fn path_matches(path: &str, pattern: &str) -> bool {
    if pattern.ends_with('*') {
        path.starts_with(&pattern[..pattern.len() - 1])
    } else if pattern.ends_with('$') {
        path == &pattern[..pattern.len() - 1]
    } else {
        path.starts_with(pattern)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn specific_groups_replace_wildcard_and_merge_shared_agent_headers() {
        let cache = RobotsCache::new();
        for body in [
            "User-agent: *\nDisallow: /wild\nUser-agent: BunBrowser\nUser-agent: OtherBot\nDisallow: /shared\nUser-agent: BunBrowser\nDisallow: /second\n",
            "User-agent: OtherBot\nUser-agent: BunBrowser # crawler\nDisallow: /shared # comment\nUser-agent: BunBrowser\nDisallow: /second\nUser-agent: *\nDisallow: /wild\n",
        ] {
            cache.parse_and_store("test", body, "BunBrowser");
            assert!(cache.is_allowed("test", "/wild"));
            assert!(!cache.is_allowed("test", "/shared/file"));
            assert!(!cache.is_allowed("test", "/second"));
            cache.parse_and_store("other", body, "UnknownBot");
            assert!(!cache.is_allowed("other", "/wild"));
            assert!(cache.is_allowed("other", "/shared"));
        }
    }

    #[test]
    fn longest_rule_wins_and_allow_breaks_ties() {
        let cache = RobotsCache::new();
        cache.parse_and_store("test", "User-agent: *\nAllow: /\nDisallow: /private\nAllow: /private/public\nDisallow: /tie\nAllow: /tie\n", "BunBrowser");
        assert!(cache.is_allowed("test", "/page"));
        assert!(!cache.is_allowed("test", "/private/secret"));
        assert!(cache.is_allowed("test", "/private/public/file"));
        assert!(cache.is_allowed("test", "/tie"));
    }

    #[test]
    fn empty_specific_group_does_not_inherit_wildcard_rules() {
        let cache = RobotsCache::new();
        cache.parse_and_store(
            "test",
            "User-agent: *\nDisallow: /\nUser-agent: BunBrowser\n",
            "BunBrowser",
        );
        assert!(cache.is_allowed("test", "/page"));
    }
    #[test]
    fn test_parse_basic_robots() {
        let body = "User-agent: *\nDisallow: /private/\nDisallow: /admin\nAllow: /admin/public\n";
        let cache = RobotsCache::new();
        cache.parse_and_store("example.com", body, "BunBrowser");
        assert!(cache.is_allowed("example.com", "/"));
        assert!(cache.is_allowed("example.com", "/page"));
        assert!(!cache.is_allowed("example.com", "/private/secret"));
        assert!(!cache.is_allowed("example.com", "/admin"));
        assert!(cache.is_allowed("example.com", "/admin/public"));
    }

    #[test]
    fn agent_groups_match_product_tokens_not_substrings() {
        // RFC 9309 2.2.1: a group applies when its product token equals one of
        // ours. Substring matching in either direction let "User-agent: Moz"
        // govern a Mozilla/5.0 UA and "User-agent: BunBrowserBot" govern "BunBrowser".
        let chrome = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) \
                      Chrome/145.0.0.0 Safari/537.36";
        let cache = RobotsCache::new();
        cache.parse_and_store("a.test", "User-agent: Moz\nDisallow: /\n", chrome);
        assert!(
            cache.is_allowed("a.test", "/page"),
            "a token prefix is not a match"
        );
        cache.parse_and_store("b.test", "User-agent: chrome\nDisallow: /\n", chrome);
        assert!(
            !cache.is_allowed("b.test", "/page"),
            "an exact token still matches, case-insensitively"
        );
        cache.parse_and_store(
            "c.test",
            "User-agent: BunBrowserBot\nDisallow: /\n",
            "BunBrowser",
        );
        assert!(
            cache.is_allowed("c.test", "/page"),
            "our token being a substring of theirs is not a match"
        );
        cache.parse_and_store(
            "d.test",
            "User-agent: BunBrowser\nDisallow: /\n",
            "BunBrowser/1.0 (+https://example.test)",
        );
        assert!(
            !cache.is_allowed("d.test", "/page"),
            "a product token followed by a version matches"
        );
    }

    #[test]
    fn test_no_rules_means_allowed() {
        let cache = RobotsCache::new();
        assert!(cache.is_allowed("unknown.com", "/anything"));
        assert!(!cache.contains("unknown.com"));

        cache.parse_and_store("unknown.com", "", "BunBrowser");
        assert!(cache.contains("unknown.com"));
        assert!(cache.is_allowed("unknown.com", "/anything"));
    }

    #[test]
    fn test_disallow_all() {
        let body = "User-agent: *\nDisallow: /\n";
        let cache = RobotsCache::new();
        cache.parse_and_store("blocked.com", body, "BunBrowser");
        assert!(!cache.is_allowed("blocked.com", "/"));
        assert!(!cache.is_allowed("blocked.com", "/page"));
    }

    // One entry per navigated origin must not grow the cache without bound in
    // a long-lived context; the oldest origin is evicted and simply refetched.
    #[test]
    fn cache_evicts_oldest_origin_past_the_entry_cap() {
        let cache = RobotsCache::new();
        for i in 0..MAX_ROBOTS_ENTRIES + 10 {
            cache.parse_and_store(&format!("https://site{i}.test"), "", "BunBrowser");
        }
        assert_eq!(cache.len(), MAX_ROBOTS_ENTRIES);
        assert!(!cache.contains("https://site0.test"));
        assert!(cache.contains(&format!("https://site{}.test", MAX_ROBOTS_ENTRIES + 9)));

        // Re-storing a cached origin does not duplicate its eviction slot.
        let last = format!("https://site{}.test", MAX_ROBOTS_ENTRIES + 9);
        cache.parse_and_store(&last, "", "BunBrowser");
        assert_eq!(cache.len(), MAX_ROBOTS_ENTRIES);
    }

    // Like Google, only the first 500 KiB of a robots.txt body is parsed, so one
    // oversized file cannot inflate its cache entry.
    #[test]
    fn rules_past_the_body_cap_are_ignored() {
        let mut body = String::from("User-agent: *\nDisallow: /early\n");
        while body.len() <= MAX_ROBOTS_BODY_BYTES {
            body.push_str("# padding padding padding padding padding\n");
        }
        body.push_str("Disallow: /late\n");
        let cache = RobotsCache::new();
        cache.parse_and_store("big.test", &body, "BunBrowser");
        assert!(!cache.is_allowed("big.test", "/early"));
        assert!(cache.is_allowed("big.test", "/late"));
    }
}
