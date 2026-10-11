//! In-process parser shared with Bun's bundler. The retained cascade owns the
//! resulting strings, not Bun AST pointers or arenas.

pub(crate) fn rules(source: &str) -> Vec<bun_css::browser::BrowserRule> {
    // Browser error recovery happens in bun_css. A fatal parse/print failure
    // makes this stylesheet unusable; it must not silently select a second CSS
    // grammar inside the fused engine.
    bun_css::browser::parse_stylesheet(source).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use crate::css::parse_stylesheet;

    #[test]
    fn retained_cascade_consumes_bun_parser_recovery_and_conditional_rules() {
        let rules = parse_stylesheet(
            ".a { width: ; height: 7px } @media (min-width: 20px) { .b { width: 3px } }",
        );
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].0, ".a");
        assert!(rules[0].1.contains("height: 7px"));
        assert_eq!(rules[1].0, ".b");
        assert!(rules[1].1.contains("width: 3px"));
    }

    #[test]
    fn retained_cascade_preserves_important_and_duplicate_rule_order() {
        let rules = parse_stylesheet(".a { width: 1px } .a { width: 2px !important }");
        assert_eq!(rules.len(), 2);
        assert!(rules[0].1.contains("width: 1px"));
        assert!(rules[1].1.contains("width: 2px !important"));
    }
}
