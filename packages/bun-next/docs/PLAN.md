# Next.js on Bun: plan

Targets: `next` 16.1.6 (installed by the test fixtures, the only version `lib/patch.js` accepts) and the Next.js
16.5.0-canary.4 checkout in `vendor/next.js` (source reading). This file replaces the aphrody "next-fork" plan
(`docs/plans/web/next-fork/PLAN.md`) and its Vercel Rust crates research, moved here on 2026-10-08.

## Routes

- **A, chosen: `Bun.build` as a Next bundler**, like next-rspack. Next's runtime, server, manifests and route templates stay;
  the compile step becomes `Bun.build` passes plus SWC through `@next/swc` (`getLoaderSWCOptions` + `transform`). Needs a small
  Next patch (`lib/patch.js`) because Next has no bundler registry.
- **B, rejected: link the Turbopack crates into Bun.** About 326k lines of Rust, 1033 crates in its lockfile against 286 here,
  a second SWC, tokio multi-thread, `catch_unwind` under Bun's `panic = "abort"`, a conflicting global allocator and a different
  nightly. Bun already loads the same code as the `@next/swc` N-API module, so linking it gains nothing.
- **C, not primary: bake as the host.** Bake lacks server actions (`registerServerReference` is a `todo_panic!` in the parser),
  `use cache`, metadata routes and Next's app-render. Its IncrementalGraph and HMR socket may serve route A's dev mode later.

Turbopack under `bun --bun` stays the default until a milestone below reaches parity.

## Milestones

| Step | Deliverable                                                                                                    | Gate (system Bun)                                                   | State                                   |
| ---- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| J0   | App Router fixture built and served under `bun --bun`, Turbopack and webpack, PostCSS on Bun                   | `test/integration/next-app/test/next-app.test.ts`                   | done                                    |
| J0b  | `next-bun` runner: the app's `next` on Bun, `node` shim first on `PATH`                                        | same file, variant "turbopack via next-bun"; `next-bun/runner.test` | done                                    |
| J1   | Pages Router production build with `Bun.build` (`withBun`, `next-bun patch`)                                   | `test/integration/next-bun-pages/test/next-bun-pages.test.ts`       | done; no CSS, next/dynamic, browser run |
| J2   | CSS and CSS modules, `next/dynamic`, then App Router RSC layers (rsc, ssr, browser), client reference manifest | Next e2e `app-dir/app` subset in start mode                         | open                                    |
| J3   | Server actions and `use cache` (action layer, server reference manifest, encryption key)                       | e2e `app-dir/actions`, `use-cache` subsets                          | open                                    |
| J4   | next/font, next/image, metadata routes, middleware/proxy, instrumentation, edge, `output: "standalone"`        | matching e2e subsets, standalone test                               | open                                    |
| J5   | Dev mode: a `HotReloaderBun` on `Bun.build` watch                                                              | `NEXT_TEST_MODE=dev` subset                                         | open                                    |
| J6   | SWC transforms as a native `onBeforeParse` plugin; deploy adapter targeting `Bun.serve`                        | benchmarks against Turbopack, `NEXT_TEST_MODE=deploy`               | open                                    |

Also in this package, from aphrody: Next 16 and Tailwind 4 codemods (`codemods/`) and the instant navigation testing helper
(`testing/`, a port of `@next/playwright` 16.5's `instant()` that also drives CDP-backed pages).

## Findings

- Turbopack's Node.js worker pool (`turbopack-node`, `process_pool`) runs `Command::new("node")`, and `config-shared` defaults
  `turbopackPluginRuntimeStrategy` to `childProcesses`. On Windows with Next 16.1.6 and 16.5.0-canary.4, PostCSS still ran on Bun
  with no `node` on `PATH`, and a fake `node` placed first on `PATH` was never called. The `next-bun` shim is kept for other hosts;
  that it is needed there is not verified here.
- Windows: `require()` of a mixed-separator absolute path gives the module a wrong `__dirname` (`lib/build.js` uses `path.join`).
- `lib/patch.js` anchors were written against 16.1.6 only; other versions are refused rather than guessed.

## Next.js and Turbopack crates (16.5.0-canary.4)

Next: `next-api`, `next-build`, `next-core`, `next-custom-transforms` (SWC transforms: RSC directives, server actions, `use cache`,
next/font, next/dynamic), `next-code-frame`, `next-taskless`, `next-napi-bindings`. Turbopack: `turbo-tasks*` (memoized task engine,
fs, persistence, malloc), `turbopack*` (core graph, ecmascript, css via lightningcss, node workers, image, mdx, wasm, static).
The useful piece for route A is `next-custom-transforms`, which could become a Bun native `onBeforeParse` plugin built as a separate
cdylib, out of the Bun workspace.
