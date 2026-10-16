/* Copyright (c) 2020 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

//! Brave Speedreader (readability) and web-discovery document extractor,
//! absorbed into Bun. Backs `Bun.HTML.readability` and `Bun.HTML.extract`.

// Ported upstream code keeps its style; dead code and visibility stay gated.
#![allow(
    clippy::all,
    clippy::pedantic,
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::disallowed_macros
)]

#[macro_use]
extern crate html5ever;

pub mod document_extractor;
mod kuchikiki;
mod readability;
mod speedreader;
mod speedreader_readability;

use html5ever::tendril::TendrilSink;
use url::Url;

pub use speedreader::{OutputSink, SpeedReader, SpeedReaderError, SpeedReaderProcessor};

use kuchikiki::Sink;
use readability::{extractor, statistics};

/// Mozilla readability score below which a page is not considered readable.
pub const READABLE_SCORE_THRESHOLD: f64 = 20.0;

#[derive(Default)]
pub struct Options {
    pub url: Option<String>,
    pub min_length: Option<i32>,
    /// Also serialize the Speedreader reader page.
    pub page: bool,
    pub theme: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<String>,
    pub column_width: Option<String>,
}

pub struct Article {
    pub title: String,
    pub byline: Option<String>,
    pub excerpt: Option<String>,
    pub lang: Option<String>,
    /// Cleaned article HTML.
    pub content: String,
    /// Text content of the cleaned article.
    pub text: String,
    /// Mozilla readability score of the original document.
    pub score: f64,
    pub readable: bool,
    /// Speedreader reader page, when requested.
    pub page: Option<String>,
}

fn document_lang(dom: &Sink) -> Option<String> {
    dom.document_node.children().find_map(|child| {
        let element = child.as_element()?;
        if element.name.local != local_name!("html") {
            return None;
        }
        let attributes = element.attributes.borrow();
        let lang = attributes.get(local_name!("lang"))?.trim();
        (!lang.is_empty()).then(|| lang.to_owned())
    })
}

fn first_sentence(text: &str) -> Option<String> {
    let paragraph = text.lines().map(str::trim).find(|line| line.chars().count() >= 25)?;
    let excerpt = if paragraph.chars().count() > 200 {
        let end = readability::first_sentence_boundary(paragraph).unwrap_or(paragraph.len());
        &paragraph[..end]
    } else {
        paragraph
    };
    Some(excerpt.trim().to_owned())
}

/// Extracts the main article of an HTML document.
pub fn extract(html: &[u8], options: Options) -> Result<Article, SpeedReaderError> {
    let url_text = options.url.as_deref().unwrap_or("https://example.com/");
    let url = Url::parse(url_text).map_err(|_| SpeedReaderError::BadURL(url_text.to_owned()))?;

    let mut dom: Sink =
        html5ever::parse_document(Sink::default(), Default::default()).from_utf8().one(html);
    let score = statistics::collect_statistics(&dom).map_or(0.0, |features| features.moz_score);
    let lang = document_lang(&dom);

    let product = extractor::extract_dom(
        &mut dom,
        &url,
        options.min_length,
        options.theme,
        options.font_family,
        options.font_size,
        options.column_width,
        false,
    )
    .map_err(|err| SpeedReaderError::RewritingError(err.to_string()))?;

    let text = product.article_text;
    let excerpt = product
        .meta
        .description
        .filter(|description| !description.trim().is_empty())
        .or_else(|| first_sentence(&text));
    Ok(Article {
        title: product.meta.title,
        byline: product.meta.author,
        excerpt,
        lang,
        content: product.article_html,
        text,
        score,
        readable: score > READABLE_SCORE_THRESHOLD,
        page: options.page.then_some(product.content),
    })
}
