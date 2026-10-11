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

An optional browser desktop served by Bun. Install `@aphrody/bun-webos` and run
`bun-webos --port 3000`. The server listens on loopback. Host commands, files,
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
plugins = ["@aphrody/bun-webos/tailwind"]
```

```ts
import { startWebOS } from "@aphrody/bun-webos";

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
