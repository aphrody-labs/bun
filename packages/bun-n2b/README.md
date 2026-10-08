# @aphrody/bun-plugin-n2b

Node.js to Bun migration for Bun. It runs the n2b Rust analyzer in process through a Node-API addon:

- a Bun plugin that reports findings or rewrites sources while they load, at runtime or in `Bun.build`;
- a typed API (`scan`, `transform`);
- the `n2b` CLI: `bunx @aphrody/bun-plugin-n2b scan|fix|report|rules|prompt|audit …`.

```sh
bun add -d @aphrody/bun-plugin-n2b
```

## CLI

```sh
bunx @aphrody/bun-plugin-n2b scan .          # report, exit 1 when findings remain
bunx @aphrody/bun-plugin-n2b fix .           # apply the safe fixes
bunx @aphrody/bun-plugin-n2b report .        # Markdown report
bunx @aphrody/bun-plugin-n2b . --aggressive  # also migrate Node APIs to Bun APIs
bunx @aphrody/bun-plugin-n2b rules --report=json
```

It is the same CLI as the `n2b` binary of the `aphrody-n2b` crate and `aphrody n2b`. See [docs/cli.md](./docs/cli.md).

## Plugin

```ts
import { n2bPlugin } from "@aphrody/bun-plugin-n2b/plugin";

await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  plugins: [n2bPlugin({ mode: "aggressive" })],
});
```

| Option       | Default       | Meaning                                                                         |
| ------------ | ------------- | ------------------------------------------------------------------------------- |
| `mode`       | `"report"`    | `"report"` logs findings; `"fix"` and `"aggressive"` rewrite each loaded source |
| `onFindings` | `"warn"`      | `"error"` fails the build when findings remain                                  |
| `root`       | `cwd`         | project scanned in `"report"` mode                                              |
| `filter`     | JS/TS sources | files the plugin handles; `node_modules` is always skipped in rewrite modes     |
| `quiet`      | `false`       | hide per-file findings                                                          |
| `ignore`     |               | extra ignore globs for the `"report"` scan                                      |
| `jobs`       |               | scan threads (1 to 6)                                                           |
| `report`     |               | precomputed report, skips the scan                                              |

Rewrites happen in memory: files on disk are never written by the plugin. The same plugin works with
`Bun.plugin()` in a preload.

## API

```ts
import { scan, transform } from "@aphrody/bun-plugin-n2b";

const report = scan(".", { mode: "check" }); // schema v2 report, see docs/json-schema.md
const { code, changed, findings } = transform("index.ts", source, "fix");
```

`@aphrody/bun-plugin-n2b/shims` provides small Bun-native helpers (`env`, `fs`, `path`, `shell`) that
the `aggressive` rewrites can target.

## Native addon

The addon is published per platform as `@aphrody/bun-plugin-n2b-<platform>` (`win32-x64-msvc`,
`darwin-arm64`, `linux-x64-gnu`, `linux-x64-musl`, …) and installed through `optionalDependencies`.
`APHRODY_BUN_PLUGIN_N2B_NATIVE` points the loader at another `.node` file.

From this repository:

```sh
bun scripts/aphrody/build-napi.ts packages/bun-n2b      # writes bun-plugin-n2b.<platform>.node
bun test test/integration/bun-plugin-n2b
```

The Rust crates (`aphrody-n2b-types`, `aphrody-n2b-registry`, `aphrody-n2b-core`, `aphrody-n2b`) are a
separate Cargo workspace in this directory and are published to crates.io by
`scripts/aphrody/publish-crates.ts`.
