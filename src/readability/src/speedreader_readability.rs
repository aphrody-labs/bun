// Copyright (c) 2021 The Brave Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at https://mozilla.org/MPL/2.0/.

use html5ever::driver::{ParseOpts, Parser};
use html5ever::tendril::stream::Utf8LossyDecoder;
use html5ever::tendril::TendrilSink;
use crate::kuchikiki::Sink;
use lol_html::OutputSink;
use url::Url;

use crate::speedreader::*;

use crate::readability::{extractor, statistics};


pub(crate) struct SpeedReaderReadability<O>
where
    O: OutputSink,
{
    min_out_length: Option<i32>,
    theme: Option<String>,
    font_family: Option<String>,
    font_size: Option<String>,
    column_width: Option<String>,
    debug_view: bool,
    // Decodes UTF-8 across chunk boundaries.
    parser: Option<Utf8LossyDecoder<Parser<Sink>>>,
    url: Url,
    output_sink: O,
}

impl<O: OutputSink> SpeedReaderProcessor for SpeedReaderReadability<O> {
    fn set_min_out_length(&mut self, min_out_length: i32) {
        self.min_out_length = Some(min_out_length);
    }

    fn set_theme(&mut self, theme: &str) {
        self.theme = Some(String::from(theme));
    }

    fn set_font_family(&mut self, font: &str) {
        self.font_family = Some(String::from(font));
    }

    fn set_font_size(&mut self, size: &str) {
        self.font_size = Some(String::from(size));
    }

    fn set_column_width(&mut self, width: &str) {
        self.column_width = Some(String::from(width));
    }

    fn set_debug_view(&mut self, debug_view: bool) {
        self.debug_view = debug_view;
    }

    fn write(&mut self, input: &[u8]) -> Result<(), SpeedReaderError> {
        if let Some(ref mut parser) = self.parser {
            parser.process(html5ever::tendril::ByteTendril::from_slice(input));
            Ok(())
        } else {
            Err(SpeedReaderError::ProcessorClosed)
        }
    }

    fn end(&mut self) -> Result<(), SpeedReaderError> {
        if let Some(parser) = self.parser.take() {
            let mut dom: Sink = parser.finish();
            if let Some(features) = statistics::collect_statistics(&dom) {
                if features.moz_score > crate::READABLE_SCORE_THRESHOLD {
                    let extracted = extractor::extract_dom(
                        &mut dom,
                        &self.url,
                        self.min_out_length,
                        self.theme.clone(),
                        self.font_family.clone(),
                        self.font_size.clone(),
                        self.column_width.clone(),
                        self.debug_view,
                    )?;
                    self.output_sink.handle_chunk(extracted.content.as_bytes());
                    Ok(())
                } else {
                    Err(SpeedReaderError::RewritingError(
                        format!("Not readable. Moz score: {}", features.moz_score).to_owned(),
                    ))
                }
            } else {
                Err(SpeedReaderError::RewritingError("Could not score document".to_owned()))
            }
        } else {
            Err(SpeedReaderError::ProcessorClosed)
        }
    }
}

impl<O: OutputSink> SpeedReaderReadability<O> {
    pub(crate) fn try_new(url: Url, output_sink: O) -> Result<Self, SpeedReaderError> {
        let scheme = url.scheme();

        if scheme == "http" || scheme == "https" {
            let parser = html5ever::parse_document(Sink::default(), ParseOpts::default()).from_utf8();
            Ok(SpeedReaderReadability {
                min_out_length: None,
                theme: None,
                font_family: None,
                font_size: None,
                column_width: None,
                debug_view: false,
                parser: Some(parser),
                url,
                output_sink,
            })
        } else {
            Err(SpeedReaderError::InvalidUrl(url.to_string()))
        }
    }
}
