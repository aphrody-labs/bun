# Upstream interface capture

`scripts/aphrody/site-mirror/mirror.ts` invokes the native Aphrody Web owner.
Capture runs on a qualified SSH host in a separate state directory. It never
changes a source checkout or the active production release.

```sh
bun scripts/aphrody/site-mirror/mirror.ts plan /path/to/new-capture
bun scripts/aphrody/site-mirror/mirror.ts capture /path/to/new-capture
bun scripts/aphrody/site-mirror/mirror.ts build /path/to/capture /path/to/new-preview <release-source-sha>
```

The native mirror follows bun.com and www.bun.com links, up to 2,500 pages,
12,000 assets and depth 20, with four concurrent requests and a 300 ms start
delay. CDN traversal is disabled. These are limits, not measured coverage.
The original HTML, CSS, JavaScript and asset bytes remain in `upstream/`.
The native JSON report and error log remain beside it.

For sitemap and robots coverage, use the separate native persistent frontier:

```sh
aphrody web crawl https://bun.com --sqlite /path/to/capture/frontier.sqlite \
  --max-depth 20 --max-requests 2500 --concurrency 2 \
  --allowed-domains bun.com,www.bun.com --per-host-delay 300 \
  --max-per-host 2 --max-retries 2 --obey-robots --sitemaps --json
```

This frontier can be reopened. Compare its discovered URLs with the mirror
report before claiming a complete capture. Linked assets and dynamic JavaScript
imports need separate inspection; the collector does not imply browser parity.
Public assets are retained in private capture state, not committed to Git.

The reference sitemap can contain many pages absent from ordinary navigation.
`complete-reference.ts <capture-dir>` plans missing canonical bun.com reference
URLs from the frontier SQLite database. `--apply` acquires their original HTML
through `aphrody-web response`, with two workers, a 300 ms request interval,
a 2 MB response limit and at most 20,000 URLs with three attempts each. HTTP 429
uses the actual `Retry-After` header, or exponential backoff when absent. A wait
above five minutes defers the batch rather than retrying before the server asks.
Existing captured bytes are
retained. SHA-256 receipts in `reference-capture.jsonl` allow interrupted runs
to resume. Truncated responses and HTTP errors remain failures. The completion
report explicitly separates this reference family from other unlinked routes.
Rebuild a new preview after the collector ends; keep the previous preview.

Native mirroring can rewrite an old documentation link to an alias while storing
only the HTTP redirect target. `repair-redirects.ts <preview-dir>` plans these
missing aliases; `--apply` observes each redirect with the native response owner
and writes an alias only when its confirmed canonical target is already captured.
No redirect destination is guessed. Redirect evidence is stored beside coverage.

The preview retains captured DOM order, layout, JavaScript and navigation.
An additional stylesheet and script map upstream color variables onto the
current Aphrody M3 semantic roles and apply shape tokens. Captured typography
retains upstream `--font-display` and `--font-sans`, mapped to the M3 brand
and plain typeface roles. The captured stylesheet declares Archivo for display
and its existing system stack for plain text. Bun OS surfaces use Aphrody
Google Sans Flex independently, without changing captured line breaks.
Bun OS navigation exposes release downloads, docs, guides, plugin skills, the
visual code graph and measured benchmarks. Installer and canonical URLs change
to bun.aphrody.app. Upstream analytics are removed. Upstream benchmark values
retain their original provenance and measurement scope.

`mirror-coverage.json` records each original and adapted SHA-256, missing local
HTML references, the exact release source SHA and collection limits. Missing
references and unmeasured screenshot or interaction parity remain visible.
`aphrody web browser snapshot` exposes readable snapshots. The native owner
`aphrody-web launch --host 127.0.0.1 --port 9298 --workers 1` exposes Obscura CDP,
including actual `Page.captureScreenshot`. `capture-browser.ts` records PNG
bytes and hashes, the viewport, source DOM links/buttons/scripts, and actual
installer and benchmark tab smoke observations. For a trusted local preview,
scope `OBSCURA_ALLOW_PRIVATE_NETWORK=1` to this isolated browser process only.
`serve-preview.ts` binds 127.0.0.1:8799 and applies the production CSP;
executable inline scripts become deterministic same-origin assets, preserving
source order and module attributes. JSON data remains inert. No CSP relaxation
or global network configuration is required.

Screenshots establish capture evidence, not pixel equality. M3 colors and shapes are
intentional visual differences; compare geometry and behavior separately.
The installed Obscura `Emulation.setEmulatedMedia` currently applies reduced
motion but not color scheme. A requested dark viewport is not evidence of a
dark rendering: inspect `observedTheme` and qualify that view separately.

The 2026-10-11 native capture reported 3,178 requests, 2,196 pages,
966 assets and 694,723,122 bytes, with 16 failed resources. The sitemap
frontier still contained 16,214 pending URLs; the separate reference collector
continues resumably. These counts do not establish complete coverage.
At 390 by 844, upstream and preview both selected the five tested installer
and benchmark tabs. An isolated page clipboard collector observed the upstream
Windows installer and its Bun OS URL replacement. Neither rendering exposed a
theme button or a visible search input after the search action. Both reported
the mobile menu's `aria-expanded` as false after its opening action. Menu and
search parity therefore remain unqualified. The initial M3 font override reduced
the heading height by 37 pixels and moved subsequent tabs upward by 63 pixels.
After retaining captured font metrics, all six observed boxes matched upstream
in x, y, width and height at both 390 by 844 and 1280 by 900. The five tested
tabs remained selectable. These twelve box observations do not establish pixel
equality or cover other routes. The separate `brand-geometry-receipt.json`
records source SHA, adaptation CSS SHA, generator SHA and screenshot hashes;
the original coverage manifest predates this staging-only CSS change.

Stage the result under an upstream preview route. Before promoting its home
page, compare light/dark desktop and narrow layouts, navigation, search,
installer tabs and copy actions, benchmark tabs, workflow controls, terminal
replay, release links, responsive menus and keyboard behavior. Keep the release
gateway authoritative for `/docs`, `/guides`, `/knowledge`, `/plugin`, `/graph`,
`/benchmarks`, `/downloads`, installers and runtime version metadata. Preserve the
previous static release and its Nginx configuration for rollback.

Sources inspected: [Bun](https://bun.com/), the installed
`aphrody web mirror --help`, `aphrody web crawl --help` and
`aphrody web browser snapshot --help`. No screenshot parity or complete site
coverage is implied by these documents.
