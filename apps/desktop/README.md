# Bun WebOS

The desktop includes **Permissions navigateur**. Each button invokes a specific
browser capability after a click: files and read-only directory selection, camera,
microphone, screen, location, notifications, clipboard, USB, HID, serial, Bluetooth,
fullscreen, persistent storage and WebGPU. Unsupported capabilities stay disabled;
denial is displayed without granting any other capability. Media probes stop their
tracks immediately. File imports copy at most eight files / 16 MiB into a new OPFS
batch on the visitor's device and send no file contents to the server.

Browser permission does not grant shell, SSH, FFI or arbitrary Windows/Linux access.
Those applications use the installed local Bun server, whose host routes remain
restricted to loopback and the authorized origin. Browser WebAssembly currently
provides the shipped parser, semver, markdown and app modules; it does not emulate
the Windows/Linux kernel or provide the entire native Bun runtime.

The browser desktop is served by the canonical `@aphrody/desktop` package. Run
`bun run apps/desktop/server.ts --port 3000`. The server listens on loopback. Host commands, files,
metadata and assistant routes require a loopback listener and same-origin requests.
Set `hostAccess: false` to disable host routes, including system and process
measurements. Capabilities then omit local paths and the selected shell.
For a private loopback reverse proxy, explicitly list its exact HTTP(S) origins
in `trustedOrigins`; request peers must remain on loopback and browser requests
must have the same origin. There are no wildcard authorities.

When serving the source entry from another project, enable the installed Tailwind
plugin in that project's `bunfig.toml`:

```toml
[serve.static]
plugins = ["@aphrody/desktop/tailwind"]
```

```ts
import { startWebOS } from "@aphrody/desktop";

const server = await startWebOS({
  port: 0,
  explorer: {
    databasePath: "/path/to/your/metadata.sqlite",
    servicesUrl: "http://127.0.0.1:9000/health",
    assistant: { baseUrl: "http://127.0.0.1:8080", model: "your-model" },
  },
});
```

The index, services, cache and assistant are disabled until explicitly configured.
The index opens read-only and uses `ntfs_entries`, optional `ntfs_paths`,
`pe_artifacts`, optional `pe_import_edges`, `graph_snapshots`, `nodes`, `edges`
and `resources` tables. Set `resourcesTable` for a different resource table and
`volume` to restrict indexed filesystem results. The CLI accepts `--index` and
`--volume`; advanced integrations use `startWebOS` options.

The same server can mount the canonical M3 UI and retain the WebOS, explorer,
search and assistant APIs:

```ts
await startWebOS({
  publicSite: { staticRoot: "/var/www/aphrody/app-ui" },
  explorer: {
    assistant: { baseUrl: "http://127.0.0.1:8080", model: "default" },
  },
});
```

`assistant.baseUrl` identifies an OpenAI-compatible server base, without `/v1`.
Supply `model`, optional `apiKey`, and optional `maxTokens`. `llamaContext: true`
enables llama.cpp `/props`, `/apply-template` and `/tokenize` preparation, dropping
old conversation turns if necessary. The backend forwards only user and assistant
messages; it reads no credential files and enables no model-specific flags.

Set `redisUrl` for optional cache diagnostics and `cacheManifestKey` to inspect a
metadata manifest. No Redis connection or personal resource store is assumed.
Service health accepts `{ services: [{ id, healthy }] }` from `servicesUrl`.

Build production assets with `bun run build`. `dist/server.js` serves the bundled
desktop and workers; use `--dist <package>/dist` when launching the built server.
WASM compilation belongs to the Bun native build factory. Stage its output with
`bun scripts/stage-bun-wasm.ts --artifact /path/to/bun_wasm.wasm`, then run
`bun scripts/qualify-bun-wasm.ts`. The generated manifest records the bytes and
hash actually staged and stays under `dist/`.

The explorer was generalized from the Omar integration; see NOTICE for provenance.

The browser desktop starts with browser access controls and the Bun REPL. Browser
permissions are requested individually after a user action. The WASM REPL keeps
its files in the origin's private OPFS directory `bun-webos-files`; imported files
appear under `imports/`. It never sends these files to the server. The native REPL
is enabled only when the local server explicitly reports host access enabled.

The public search application uses the same-origin `/api/search` endpoint and
accepts the public crawl cache contract. An unavailable backend is shown as an
error; personal indexes and generated sample results are never used as fallbacks.

Public deployment separates the desktop and OS APIs on `os.aphrody.com` from
the homepage, public search, documentation, templates, guides and downloads on
`aphrody.com`. The OS search route can forward to the same public search backend.
Private host integrations remain on their authorized private addresses.

To produce a public archive from this checkout, use the exact local Tailwind owner:

```sh
bun scripts/pack.ts --output /path/to/bun-webos.tgz
```

`--tailwind-package /path/to/bun-plugin-tailwind` selects an explicit owner checkout.
The script packs that owner, installs its archive with `--backend=copyfile` in a
temporary staging directory, and packs WebOS with the materialized dependency.
Folder dependencies remain live file links even with `--backend=copyfile`; pack
intentionally excludes symlinks. Archive installation therefore provides the
regular files needed by `bundledDependencies`. Source manifests and lockfiles are
not modified. The archived manifest names the compatible published range
`>=0.1.0 <2` instead of its checkout-relative folder; the bundled owner's
package metadata retains its exact version. No registry publication is performed.

`public-site/` is a standalone public introduction and browser-only demonstration.
It serves no backend APIs, host snapshots, private index or model endpoint. Deploy
those static files under `/labs/webos/`; public downloads use the qualified package
archives. The installed WebOS is a separate loopback application with explicit
host access policy and optional integrations.

## One app for the repository

`/` is the hub of the unified app, a Material 3 shell (`@aphrody/m3-react`, `@aphrody/m3-theme`) routed by
TanStack Router with TanStack Query for data: `/video` (catalogue, player, series, shorts, studio), `/os` (the
windowed WebOS), `/tools` (every bun-video module with live panels), `/m3` (the Material 3 components). Docs
and the other server-rendered sections keep their paths.

Development: `bun run dev` bundles without HMR and restarts on change. `bun run dev:hmr` (`bun --hot`) cannot
load the app: Bun's dev bundler evaluates a module's dependencies before it defines its exports, so a circular
import that uses an imported function at load time (`@tanstack/router-core`: `router.js` and `load-client.js`)
reads `null`. Production bundling and the tests are unaffected.

`bun run shots [out-dir] [--routes /,/video] [--widths 1280,390]` drives the served app with `Bun.WebView`
and writes one screenshot per route and a JSON report. In Git Bash set `MSYS_NO_PATHCONV=1` when an argument
starts with `/`, and write the output directory as a Windows path.
