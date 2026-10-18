# Browser and crawler benchmark

Harness: `bench/aphrody/browsers/browsers.ts`. Raw samples: `bench/aphrody/browsers/results/*.json`.

## Method

- Site: `https://dragonballfr.com`, two pages: `/wiki/episodes` (index) and `/wiki/episodes/1` (episode).
- Every sample is a cold process: start, load the page, print the rendered document, exit. Five runs per target and
  page, targets interleaved and reversed on odd runs.
- A sample counts as `ok` only when the printed document has at least 100 distinct `/wiki/episodes/<slug>` links
  (index) or contains `Lecteur 1` (episode). A fast tool that skips the page's JavaScript shows up as `0/N`.
- `maxRSS` is the resident set of the launched process only. Chrome renderer and GPU children are not included, and
  the agent-browser daemon is a separate process, so browser targets are under-reported against `obscura`,
  `lightpanda` and `aphrody-web`, which are single processes.
- Crawl: 25 episode pages, 250 ms between requests for both rows, so the site sees the same modest rate.
- Run with `bun-1.4.5` (release build). The global `bun` on the host is a debug build and must not be used for timing.
- Host: 12 CPUs, Linux, system Google Chrome (`--no-sandbox`). The load average was 24 at the start of the run and
  25 at the end (other builds were running on the host), so absolute times are inflated and noisy; compare rows
  within this table only. One host, one site, one day (2026-10-18).

## Results (median ms, 5 runs)

| target                                     | index ms | index ok | episode ms | episode ok | maxRSS MiB (index) |
| ------------------------------------------ | -------: | :------: | ---------: | :--------: | -----------------: |
| aphrody web scrape --html (static profile) |      478 |   5/5    |        192 |    5/5     |                 60 |
| lightpanda fetch                           |     1117 |   5/5    |        805 |    5/5     |                 60 |
| obscura fetch                              |     1711 |   5/5    |       4237 |    5/5     |                 88 |
| Bun.WebView (Chrome)                       |     2375 |   5/5    |       1781 |    5/5     |                 60 |
| @aphrody/bun-web BrowserPage (Chrome)      |     3421 |   5/5    |       2418 |    5/5     |                234 |
| playwright (system Chrome)                 |     4605 |   5/5    |       4214 |    5/5     |                213 |
| agent-browser 0.39                         |    11464 |   5/5    |       7911 |    5/5     |                417 |
| aphrody web browser snapshot               |     1740 |   0/5    |       1719 |    5/5     |                200 |

`aphrody web browser snapshot` prints truncated readable text without hrefs, so it cannot satisfy the index check.

Crawl of 25 pages: sequential `fetch` baseline 9166 ms (25/25); `aphrody web crawl-index` (crawl and index) 9919 ms,
21 pages written and indexed, 0 errors, 4 of 25 attempts produced no page, so it is marked not ok.

## Reading it honestly

- On static fetch the in-process Aphrody engine (no JavaScript) is fastest; Lightpanda is the fastest of the
  JavaScript-running tools. Bun.WebView on Chrome beats Playwright and agent-browser but loses to Lightpanda and, on
  the index page, to Obscura. It is not the fastest tool here.
- The page's links are present in the server-rendered HTML, which is why the no-JavaScript profile passes.
- Before this change `@aphrody/bun-web` returned from `goto` at navigation commit and failed both checks; the
  harness caught it, and `goto` now waits for the load event.
- The difference between `bun-web` and `Bun.WebView` includes launching Chrome with a debugging port inside the
  sample, which the WebView target does through its own backend.
