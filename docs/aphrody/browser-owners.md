<!-- SPDX-License-Identifier: Apache-2.0 -->

# Browser command owners

`bun run chrome` and `bun run obscura` share [browser.ts](../../scripts/aphrody/browser.ts).
They load the existing `bun:chromium` or `bun:obscura` builtin on demand. The CLI
contains argument routing and lifecycle handling; CDP transport, endpoint checks,
executable discovery, readiness and process cleanup remain in their builtins.

```sh
bun run chrome help
bun run chrome connect ws://127.0.0.1:9222/devtools/browser/ID
bun run chrome launch --url https://example.com
bun run chrome launch --headless --no-webgpu
bun run obscura launch --workers 1
```

`connect` probes `Browser.getVersion`, prints the response and disconnects. It
does not terminate the existing browser. `launch` waits for the launched process;
Ctrl+C signals the builtin to close it. Chrome keeps its builtin defaults: visible
UI and WebGPU enabled. `--extension` selects an unpacked extension explicitly;
`--user-data-dir` selects a dedicated Chrome profile. Obscura supports its own
worker/executable options and requires one worker on Windows.

The runtime connects only to loopback WebSocket debugging endpoints, validated
by `bun:chromium`. This CLI reads no session stores or default browser profiles.
Profile selection does not grant additional host capabilities to remote pages.

Compilation has separate owners:

| Command            | Responsibility                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `bun run gn`       | Pinned GN bootstrap, graph generation and an existing project's Ninja build; [GN details](../chromium/gn.md) |
| `bun run chromium` | Pinned Chromium/depot_tools source setup, synchronization, generation and complete Chrome target build       |
| `bun run chrome`   | Connect to or launch an installed Chrome-compatible executable through `bun:chromium`                        |
| `bun run obscura`  | Connect to or launch the existing native headless owner through `bun:obscura`                                |

GN generates build graphs; CDP controls running browsers. A successful GN build
does not prove CDP readiness or WebGPU availability. CLI argument tests use fake
owners without launching a browser; actual runtime protocol and process behavior
are qualified by the builtin tests. The current `bun:obscura` declaration identifies
its executable as the native V8 headless engine. This CLI does not establish JSC
parity or replace the ongoing native browser migration.
