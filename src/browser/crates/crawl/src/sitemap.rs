// SPDX-License-Identifier: Apache-2.0

use chrono::{DateTime, NaiveDate};
use std::io::Read;
use url::Url;

pub(crate) fn decode_sitemap_bytes(bytes: &[u8]) -> Result<String, String> {
    const LIMIT: usize = 16 * 1024 * 1024;
    if bytes.len() > LIMIT {
        return Err("Sitemap body exceeds its byte bound".into());
    }
    let body = if bytes.starts_with(&[0x1f, 0x8b]) {
        let mut output = Vec::new();
        flate2::read::MultiGzDecoder::new(bytes)
            .take((LIMIT + 1) as u64)
            .read_to_end(&mut output)
            .map_err(|_| "Invalid gzip sitemap")?;
        if output.len() > LIMIT {
            return Err("Decoded sitemap exceeds its byte bound".into());
        }
        output
    } else {
        bytes.to_vec()
    };
    String::from_utf8(body).map_err(|_| "Sitemap is not valid UTF-8".into())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SitemapKind {
    UrlSet,
    Index,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct SitemapEntry {
    pub url: Url,
    pub last_modified_ms: Option<i64>,
    pub priority: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct ParsedSitemap {
    pub kind: SitemapKind,
    pub urls: Vec<SitemapEntry>,
    pub sitemaps: Vec<Url>,
    pub next_offset: Option<usize>,
    pub entries_processed: usize,
    pub error: Option<&'static str>,
}

/// Parse sitemap indexes, URL sets, and plain-text URL lists without network I/O.
#[must_use]
pub fn parse_sitemap(body: &str, base: &Url) -> ParsedSitemap {
    parse_sitemap_page(body, base, 0, 50_000)
}

pub fn parse_sitemap_page(body: &str, base: &Url, offset: usize, limit: usize) -> ParsedSitemap {
    let body = body.strip_prefix('\u{feff}').unwrap_or(body);
    let mut result = ParsedSitemap {
        kind: SitemapKind::Unknown,
        urls: Vec::new(),
        sitemaps: Vec::new(),
        next_offset: None,
        entries_processed: 0,
        error: None,
    };
    if body.len() > 16 * 1024 * 1024 {
        result.error = Some("Sitemap body exceeds its byte bound");
        return result;
    }
    let limit = limit.clamp(1, 50_000);
    if !body.trim_start().starts_with('<') {
        for (position, line) in body.lines().enumerate().skip(offset) {
            if position - offset >= limit {
                result.next_offset = Some(position);
                break;
            }
            result.entries_processed += 1;
            let line = line.trim();
            if let Ok(url) = Url::parse(line)
                && matches!(url.scheme(), "http" | "https")
            {
                result.urls.push(SitemapEntry {
                    url,
                    last_modified_ms: None,
                    priority: None,
                });
            }
        }
        if !result.urls.is_empty() {
            result.kind = SitemapKind::UrlSet;
        }
        return result;
    }
    if let Err(error) = parse_xml_page(body, base, offset, limit, &mut result) {
        result.urls.clear();
        result.sitemaps.clear();
        result.next_offset = None;
        result.entries_processed = 0;
        result.error = Some(error);
    }
    result
}

fn parse_xml_page(
    body: &str,
    base: &Url,
    offset: usize,
    limit: usize,
    result: &mut ParsedSitemap,
) -> Result<(), &'static str> {
    use quick_xml::{Reader, XmlVersion, events::Event};
    let mut reader = Reader::from_str(body);
    reader.config_mut().enable_all_checks(true);
    reader.config_mut().expand_empty_elements = true;
    let mut depth = 0usize;
    let mut roots = 0;
    let mut entries = 0usize;
    let mut entry_active = false;
    let mut selected = false;
    let mut field = None;
    let mut fields = [String::new(), String::new(), String::new()];
    loop {
        match reader.read_event().map_err(|_| "Malformed sitemap XML")? {
            Event::Start(start) => {
                depth += 1;
                if depth > 64 {
                    return Err("Sitemap XML exceeds its depth bound");
                }
                let name = start.local_name();
                if depth == 1 {
                    roots += 1;
                    if roots > 1 {
                        return Err("Sitemap XML has multiple roots");
                    }
                    result.kind = match name.as_ref() {
                        "sitemapindex" => SitemapKind::Index,
                        "urlset" => SitemapKind::UrlSet,
                        _ => return Err("Unknown sitemap XML root"),
                    };
                } else if depth == 2 {
                    entry_active = (result.kind == SitemapKind::Index
                        && name.as_ref() == "sitemap")
                        || (result.kind == SitemapKind::UrlSet && name.as_ref() == "url");
                    selected = entry_active && entries >= offset && entries - offset < limit;
                    for value in &mut fields {
                        value.clear();
                    }
                } else if depth == 3 && selected {
                    field = match name.as_ref() {
                        "loc" => Some(0),
                        "lastmod" => Some(1),
                        "priority" => Some(2),
                        _ => None,
                    };
                } else if depth > 3 && field.is_some() {
                    return Err("Nested element in sitemap value");
                }
            }
            Event::Text(text) => {
                if depth == 0 && !text.trim().is_empty() {
                    return Err("Text outside sitemap XML root");
                }
                if let Some(field) = field {
                    fields[field].push_str(&text.xml_content(XmlVersion::Implicit1_0));
                }
            }
            Event::CData(text) => {
                if depth == 0 {
                    return Err("CDATA outside sitemap XML root");
                }
                if let Some(field) = field {
                    fields[field].push_str(&text.xml_content(XmlVersion::Implicit1_0));
                }
            }
            Event::GeneralRef(entity) => {
                if depth == 0 {
                    return Err("Entity outside sitemap XML root");
                }
                let character = entity
                    .resolve_char_ref()
                    .map_err(|_| "Invalid sitemap character reference")?;
                if let Some(field) = field {
                    if let Some(character) = character {
                        fields[field].push(character);
                    } else {
                        fields[field].push_str(
                            quick_xml::escape::resolve_xml_entity(&entity)
                                .ok_or("Unknown sitemap entity")?,
                        );
                    }
                }
            }
            Event::End(_) => {
                if depth == 3 {
                    field = None;
                }
                if depth == 2 && entry_active {
                    if selected
                        && let Ok(url) = base.join(fields[0].trim())
                        && !fields[0].trim().is_empty()
                        && matches!(url.scheme(), "http" | "https")
                        && url.username().is_empty()
                        && url.password().is_none()
                    {
                        if result.kind == SitemapKind::Index {
                            result.sitemaps.push(url);
                        } else {
                            result.urls.push(SitemapEntry {
                                url,
                                last_modified_ms: parse_date(fields[1].trim()),
                                priority: fields[2]
                                    .trim()
                                    .parse::<f64>()
                                    .ok()
                                    .filter(|value| value.is_finite())
                                    .map(|value| value.clamp(0.0, 1.0)),
                            });
                        }
                    }
                    entries += 1;
                    if entries > offset.saturating_add(limit) {
                        result.next_offset = Some(offset.saturating_add(limit));
                    }
                    entry_active = false;
                    selected = false;
                }
                depth = depth.checked_sub(1).ok_or("Unbalanced sitemap XML")?;
            }
            Event::DocType(_) => return Err("Sitemap DTD is unsupported"),
            Event::Eof => {
                if depth != 0 || roots != 1 {
                    return Err("Incomplete sitemap XML");
                }
                break;
            }
            _ => {}
        }
        if fields.iter().any(|value| value.len() > 16_384) {
            return Err("Sitemap value exceeds its byte bound");
        }
    }
    result.entries_processed = entries.saturating_sub(offset).min(limit);
    Ok(())
}

/// Recency and sitemap priority prior from the source seed ingestion policy.
#[must_use]
pub fn seed_boost(entry: &SitemapEntry, now_ms: i64) -> f64 {
    let recency = entry.last_modified_ms.map_or(0.25, |last| {
        0.5_f64.powf(now_ms.saturating_sub(last).max(0) as f64 / (14.0 * 86_400_000.0))
    });
    recency + entry.priority.unwrap_or(0.5)
}

fn parse_date(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.timestamp_millis())
        .or_else(|_| {
            NaiveDate::parse_from_str(value, "%Y-%m-%d").map(|date| {
                date.and_hms_opt(0, 0, 0)
                    .expect("midnight is valid")
                    .and_utc()
                    .timestamp_millis()
            })
        })
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_gzip_and_rejects_truncated_or_oversized_members() {
        use std::io::Write;
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(b"https://example.test/a").unwrap();
        let compressed = encoder.finish().unwrap();
        assert_eq!(
            decode_sitemap_bytes(&compressed).unwrap(),
            "https://example.test/a"
        );
        assert!(decode_sitemap_bytes(&compressed[..compressed.len() - 4]).is_err());
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder
            .write_all(&vec![b'a'; 16 * 1024 * 1024 + 1])
            .unwrap();
        assert!(decode_sitemap_bytes(&encoder.finish().unwrap()).is_err());
    }

    #[test]
    fn parses_namespaced_index_and_cdata_urlset() {
        let base = Url::parse("https://example.test/sitemap.xml").unwrap();
        let index = parse_sitemap(
            "<sm:sitemapindex><sm:sitemap><sm:loc>https://example.test/a.xml</sm:loc></sm:sitemap></sm:sitemapindex>",
            &base,
        );
        assert_eq!(index.kind, SitemapKind::Index);
        assert_eq!(index.sitemaps[0].as_str(), "https://example.test/a.xml");
        let set = parse_sitemap(
            "<urlset><url><loc><![CDATA[https://example.test/a?x=1&y=2]]></loc><lastmod>2026-09-29</lastmod><priority>0.8</priority></url></urlset>",
            &base,
        );
        assert_eq!(set.urls[0].url.as_str(), "https://example.test/a?x=1&y=2");
        assert_eq!(set.urls[0].priority, Some(0.8));
        assert!(set.urls[0].last_modified_ms.is_some());
    }

    #[test]
    fn parses_text_sitemaps_and_entity_urls() {
        let base = Url::parse("https://example.test/sitemap.txt").unwrap();
        let set = parse_sitemap(
            "<urlset><url><loc>https://example.test/a?x=1&amp;y=2</loc></url></urlset>",
            &base,
        );
        assert_eq!(set.urls[0].url.as_str(), "https://example.test/a?x=1&y=2");
        let text = parse_sitemap("https://example.test/a\nhttps://example.test/b", &base);
        assert_eq!(text.urls.len(), 2);
    }

    #[test]
    fn xml_comments_cdata_and_page_offsets_preserve_entry_boundaries() {
        let base = Url::parse("https://example.test/sitemap.xml").unwrap();
        let body = "<sm:sitemapindex xmlns:sm='urn:fixture'><!-- <sitemap><loc>/false.xml</loc></sitemap> --><sm:sitemap><sm:loc><![CDATA[/a.xml?x=1&y=2]]></sm:loc></sm:sitemap><sm:sitemap><sm:loc>/b.xml?x=&#49;&amp;y=2</sm:loc></sm:sitemap><sm:sitemap><sm:loc>/c.xml</sm:loc></sm:sitemap></sm:sitemapindex>";
        let first = parse_sitemap_page(body, &base, 0, 2);
        assert_eq!(first.error, None);
        assert_eq!(first.next_offset, Some(2));
        assert_eq!(first.entries_processed, 2);
        assert_eq!(
            first.sitemaps[0].as_str(),
            "https://example.test/a.xml?x=1&y=2"
        );
        assert_eq!(
            first.sitemaps[1].as_str(),
            "https://example.test/b.xml?x=1&y=2"
        );
        let second = parse_sitemap_page(body, &base, first.next_offset.unwrap(), 2);
        assert_eq!(second.next_offset, None);
        assert_eq!(second.sitemaps.len(), 1);
        assert_eq!(second.sitemaps[0].as_str(), "https://example.test/c.xml");
        let invalid = parse_sitemap("<urlset><url><loc>/a</loc></url>", &base);
        assert!(invalid.error.is_some());
        assert!(invalid.urls.is_empty());
        assert!(
            parse_sitemap(
                "<!DOCTYPE urlset SYSTEM 'https://external.test/dtd'><urlset/>",
                &base
            )
            .error
            .is_some()
        );
    }
}
