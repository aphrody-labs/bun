//! Browser-facing projection of Bun's CSS AST.
//!
//! The bundler and browser use the same grammar and tokenizer. This projection
//! owns its strings: neither the parser arena nor its erased AST lifetimes can
//! escape into a retained DOM stylesheet. It performs no minification, URL
//! rewriting, selector lowering, or CSS-module transform.

use crate::css_parser::ParserOpts;
use crate::{
    DefaultAtRule, Parser, ParserFlags, ParserInput, ParserOptions, PrinterOptions, StyleSheet,
    Token,
};
use bun_alloc::Arena;

/// An ordered rule projected from the Bun AST. A missing body denotes a
/// statement at-rule. Braces in strings, URLs and selector functions are tokens,
/// never delimiters guessed by the browser's character scanner.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BrowserRule {
    pub prelude: String,
    pub body: Option<String>,
}

/// Parse author CSS with browser recovery and return an owned ordered tree
/// boundary. Nested bodies remain CSS for the renderer's contextual cascade
/// projection (media, container, layers and nesting).
pub fn parse_stylesheet(source: &str) -> core::result::Result<Vec<BrowserRule>, String> {
    let arena = Arena::new();
    // SAFETY: Bun's current CSS AST erases arena lifetimes. The sheet, symbols,
    // tokens and every printer are destroyed inside this function before arena
    // or source can be freed. Only heap-owned UTF-8 strings escape.
    let parser_arena: &'static Arena = unsafe { &*core::ptr::from_ref(&arena) };
    let mut options = ParserOptions::default(None);
    options.error_recovery = true;
    options.flags.insert(ParserFlags::NESTING);
    let mut imports = Vec::new();
    let (sheet, extra) = StyleSheet::<DefaultAtRule>::parse(
        parser_arena,
        source.as_bytes(),
        options,
        Some(&mut imports),
        bun_ast::Index::source(0),
    )
    .map_err(|error| error.to_string())?;
    let symbols = bun_ast::symbol::Map::init_list(vec![extra.symbols]);
    let mut projected = Vec::with_capacity(sheet.rules.v.len());
    for rule in &sheet.rules.v {
        if matches!(rule, crate::rules::CssRule::Ignored) {
            continue;
        }
        let mut bytes = Vec::new();
        {
            let options = PrinterOptions::default();
            let mut printer = crate::Printer::new(
                &arena,
                bun_alloc::ArenaVec::new_in(&arena),
                &mut bytes,
                &options,
                Some(crate::ImportInfo::init_outside_of_bundler(&imports)),
                None,
                &symbols,
            );
            printer.sources = Some(&sheet.sources);
            rule.to_css(&mut printer)
                .map_err(|_| "Unable to project CSS rule".to_owned())?;
        }
        let serialized = core::str::from_utf8(&bytes).map_err(|error| error.to_string())?;
        if serialized.trim().is_empty() {
            continue;
        }
        let mut input = ParserInput::new(serialized.as_bytes(), &arena);
        let mut parser = Parser::new(&mut input, None, ParserOpts::default(), None);
        let mut boundary = None;
        loop {
            match parser.next_including_whitespace_and_comments() {
                Ok(Token::OpenCurly) => {
                    let end = parser.position();
                    boundary = Some((end - 1, end));
                    break;
                }
                Ok(Token::Semicolon) => break,
                Ok(_) => {}
                Err(_) => break,
            }
        }
        let (prelude, body) = if let Some((start, end)) = boundary {
            let trimmed = serialized.trim_end();
            let close = trimmed
                .len()
                .checked_sub(1)
                .filter(|index| trimmed.as_bytes()[*index] == b'}')
                .ok_or_else(|| "Bun CSS printer emitted an unclosed rule".to_owned())?;
            (
                serialized[..start].trim().to_owned(),
                Some(serialized[end..close].trim().to_owned()),
            )
        } else {
            (
                serialized
                    .trim()
                    .trim_end_matches(';')
                    .trim_end()
                    .to_owned(),
                None,
            )
        };
        projected.push(BrowserRule { prelude, body });
    }
    Ok(projected)
}

#[cfg(test)]
mod tests {
    use super::parse_stylesheet;

    #[test]
    fn shared_ast_keeps_quoted_braces_inside_selectors_and_declarations() {
        let rules = parse_stylesheet(
            r#"[data-mark="{"] { content: "}"; width: 12px } .next { height: 8px }"#,
        )
        .unwrap();
        assert_eq!(rules.len(), 2);
        assert!(rules[0].prelude.contains("data-mark"));
        assert!(rules[0].body.as_ref().unwrap().contains("12px"));
        assert_eq!(rules[1].prelude, ".next");
    }

    #[test]
    fn browser_recovery_retains_valid_declarations_and_rule_order() {
        let rules =
            parse_stylesheet(".a { width: ; height: 7px } .a { height: 9px !important }").unwrap();
        assert_eq!(rules.len(), 2);
        assert!(rules[0].body.as_ref().unwrap().contains("height: 7px"));
        assert!(rules[1].body.as_ref().unwrap().contains("!important"));
    }

    #[test]
    fn layer_statement_and_conditional_body_remain_separate() {
        let rules =
            parse_stylesheet("@layer reset, app; @media (min-width: 20px) { .a { width: 3px } }")
                .unwrap();
        assert!(rules[0].prelude.starts_with("@layer"));
        assert!(rules[0].body.is_none());
        assert!(rules[1].prelude.starts_with("@media"));
        assert!(rules[1].body.as_ref().unwrap().contains(".a"));
    }

    #[test]
    fn relative_urls_are_not_rewritten_or_dropped() {
        let rules = parse_stylesheet(".a { background-image: url(../asset.svg#icon) }").unwrap();
        assert_eq!(rules.len(), 1);
        assert!(
            rules[0]
                .body
                .as_ref()
                .unwrap()
                .contains("../asset.svg#icon")
        );
    }

    #[test]
    fn selector_function_followed_directly_by_block_has_correct_boundary() {
        let rules = parse_stylesheet(":is(.a,.b){width:4px}").unwrap();
        assert_eq!(rules.len(), 1);
        assert!(rules[0].prelude.ends_with(')'));
        assert!(rules[0].body.as_ref().unwrap().contains("width: 4px"));
    }
}
