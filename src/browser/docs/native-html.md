# Native persistent HTML in Bun OS

`Bun.HTML.parse(markup)` uses `bun_browser_dom::parse_html` in process. The resulting
`HTMLDocument` retains an `Arc<DomTree>`; browser integration can wrap the same
tree through `HTMLDocument::from_tree`, without serializing or copying the DOM.
Node IDs and selector matching refer to that tree. Attribute mutation and HTML
serialization use its existing implementation. Markup is inert: parsing performs
no navigation, resource fetch, or script execution.

The `.classes.ts` generator owns the JSC wrapper and finalizer. The backing Rust
object retains no JS values, so there are no hidden JS roots. Atomic reference
counts permit GC finalization while another wrapper retains the tree. All DOM
reads and mutations remain confined to the owning VM's mutator thread; the tree
must not be transferred between workers. JS argument conversion finishes before
any DOM borrow starts, so coercion cannot reenter while a RefCell is borrowed.

This API is a persistent DOM primitive, not the browser-standard `Document`
interface. `select()` returns document-scoped numeric IDs. It does not expose
node removal or creation, preventing ID reuse through this API. Browser node
objects and realm script execution are separate integration work. Existing
HTMLRewriter keeps its streaming semantics and uses lol-html; replacing it with
an eager DOM parser would change observable behavior and memory requirements.

Qualification must run on the SSH VPS: `bun bd test
test/js/web/html/html-rewriter-doctype.test.ts`. No local native build or test
has been run for this integration.

`Bun.HTML.parseCSS(source)` projects ordered top-level rules through
`bun_css::browser::parse_stylesheet`, the same parser/AST used by the renderer
when its `bun-css` feature is enabled. It returns owned `{ prelude, body }`
records, performs no network loading, and applies no bundler transformation or
DOM cascade. The native test checks quoted braces and nested media boundaries.

The explicit `BUN_LIVE_WEBSITE_TEST=1` gate retrieves `https://bun.sh` and
`https://bun.sh/blog/bun-v1.4.3` over HTTPS, then checks the parsed document.
It is a transport and HTML parsing smoke test; script execution, layout and
rendering of these pages require separate browser gates.
