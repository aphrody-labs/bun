# @aphrody/next-bun

Next.js on Bun, for Next 16. One package, several entry points:

| Entry point                                                 | What it does                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next-bun dev\|build\|start …`                              | Runs the app's own `next` as `bun --bun next …` with a `node` that is Bun first on `PATH`, so nothing Next spawns falls back to Node.js.                                                                                     |
| `next-bun patch\|check [dir]`                               | Patches `next` 16.1.6 so `NEXT_BUN=1 next build --webpack` builds the Pages Router with `Bun.build` (experimental, see `withBun`).                                                                                           |
| `next-bun codemod <ids\|group\|all> <dir>`                  | Next 16 and Tailwind 4 codemods (`--list`, `--apply`, `--json`). `next-bun pages-hints <dir>` lists Pages Router → App Router hints.                                                                                         |
| `@aphrody/next-bun`                                         | `withBun(config, options)`: workspace root, shared Turbopack/webpack aliases and dedupes, TypeScript-source packages transpiled, `next start` pinned to its build; Bun.build for `next build` unless `bundler: "turbopack"`. |
| `@aphrody/next-bun/run`                                     | `runNext(argv, cwd)`, `nextCommand(args, cwd, shim)`, `bunNodeShim(dir, bun)`, `nextBin(cwd)`, `bunExecutable()`.                                                                                                            |
| `next-bun standalone <dir>`, `@aphrody/next-bun/standalone` | `flattenStandalone(dir)`: hoists Bun's isolated store of an `output: "standalone"` tree, no symlinks left.                                                                                                                   |
| `@aphrody/next-bun/codemods`                                | `CODEMODS`, `NEXT16_CODEMODS`, `TAILWIND4_CODEMODS`, `CODEMOD_GROUPS`, `selectCodemods`, `runCodemods`, `tailwindConfigToCss`.                                                                                               |
| `@aphrody/next-bun/codemods/cli`                            | `runCodemodCli(argv, { program, codemods, groupHelp })`, to embed the codemod CLI with extra codemods.                                                                                                                       |
| `@aphrody/next-bun/testing`                                 | `instant(page, fn, { baseURL })`: Next.js instant navigation testing for Playwright pages and CDP-backed pages (`_cdp` or `_send`).                                                                                          |

The codemods and testing entry points are TypeScript and run as is on Bun.

## `withBun`

```ts
import { withBun } from "@aphrody/next-bun";

export default withBun(nextConfig, {
  bundler: "turbopack", // leave the bundler to Next; the default "bun" builds with Bun.build
  projectDir: __dirname,
  alias: { "next-intl/config": "./src/i18n/request.ts" }, // Turbopack and webpack alike
  dedupe: ["prosemirror-transform"], // one installed copy for every importer
});
```

In every phase `withBun` also sets `turbopack.root` and `outputFileTracingRoot` to the workspace root when they
are unset (Bun's isolated linker keeps packages in the root `node_modules/.bun`), adds every dependency that
ships TypeScript sources (`exports` pointing at `.ts`/`.tsx`, followed transitively) to `transpilePackages`
unless it is in `serverExternalPackages`, and makes `next start` reuse the `assetPrefix` and `deploymentId`
of its build (`<distDir>/required-server-files.json`): Turbopack bakes both into the client runtime, and a
server environment that differs from the build's otherwise serves HTML whose chunks never load. Each rewrite
has an option to turn it off (`root: false`, `transpileSources: false`, `freezeBuildConfig: false`).

## The `node` shim

`bunNodeShim()` puts a `node` (a hard link or copy of Bun on Windows, a symlink elsewhere) in a temp directory and `next-bun` prepends it to
`PATH`. Next 16.5's Turbopack starts its JS workers through `Command::new("node")` with the default `childProcesses` strategy. On Windows,
with Next 16.1.6 and 16.5.0-canary.4, the fixture's PostCSS plugin already runs on Bun without the shim; the shim covers hosts where it
does not.

## Tests

Pure JS, run with the installed Bun (the debug build is not needed):

```sh
bun test test/integration/next-bun/
bun test test/integration/next-app/test/next-app.test.ts
bun test test/integration/next-bun-pages/test/next-bun-pages.test.ts
```

Plan and history: [docs/PLAN.md](docs/PLAN.md).
