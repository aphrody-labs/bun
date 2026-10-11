# Shared Bun CSS parser and retained browser cascade

The Bun OS `bun-css` renderer feature calls `bun_css::browser::parse_stylesheet`
inside the process. It uses the same Bun parser, rule AST, arena allocator,
tokenizer and property serializers as the bundler. The previous Bun
top-level character scanner is bypassed in this mode.

The browser entry point enables declaration/rule error recovery and CSS nesting.
It does not call the bundler minifier, rewrite URLs, enable CSS modules, or
choose browser compilation targets. Ordered rules are projected into owned
prelude/body strings before the Bun arena is destroyed. This avoids retaining
erased-lifetime AST pointers in a DOM or stylesheet cache.

Bun retains its DOM selector matching, contextual cascade, viewport/media
evaluation, container condition graph, layer registry, nested selector
projection, Taffy layout and paint. Those are consumers of the shared syntax
engine; this change does not implement a complete CSS browser or replace every
value/cascade parser. Nested bodies pass through the same Bun entry point when
processed as conditional stylesheets. The renderer's nesting projection and
CSS value parsing remain separate follow-up work.

The browser API returns an error for fatal parse/print failure. The retained
renderer ignores the unusable sheet, with no fallback to the previous grammar
inside the fused mode. The legacy scanner remains available only when building
the renderer without `bun-css` for external consumers.

Qualification must run on the SSH VPS: Bun CSS browser tests cover quoted
braces, selector function boundaries, invalid declaration recovery, layer and
media boundaries, URLs and ordered important declarations; renderer tests
exercise the actual retained stylesheet entry point. No local build, Clippy,
or test was run for this change.
