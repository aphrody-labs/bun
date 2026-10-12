# @aphrody/bun-cloudflare

The Cloudflare developer platform on the Aphrody Bun runtime. Installs the official Cloudflare npm packages
in one dependency and adds Bun entry points for the parts that need glue.

```sh
bun add @aphrody/bun-cloudflare
bunx bun-cloudflare packages   # bundled packages and installed versions
bunx bun-cloudflare doctor     # every package resolves, every bin exists
bunx bun-cloudflare whoami     # verifies CLOUDFLARE_API_TOKEN
bunx bun-cloudflare deploy     # anything else goes to wrangler, run by Bun
bunx bun-cloudflare exec workerd --version
```

## Local Workers with bindings

`startWorker` runs a Worker in workerd through Miniflare. Every Miniflare option is accepted:
`kvNamespaces`, `d1Databases`, `r2Buckets`, `durableObjects`, `queueProducers`, and so on.
Defaults: ES modules, `nodejs_compat`, a recent compatibility date.

```ts
import { startWorker, serveWorker } from "@aphrody/bun-cloudflare/worker";

await using worker = await startWorker({ scriptPath: "./src/worker.ts", kvNamespaces: ["KV"] });
await worker.fetch("/hello");
const env = await worker.bindings(); // env.KV from Bun

await using served = await serveWorker({ scriptPath: "./dist/worker.js", port: 8787 }); // Bun.serve in front of workerd
```

`getPlatformProxy` (re-exported from wrangler) reads `wrangler.jsonc` and hands its bindings to code running in Bun.

`toWorker(handler)` turns a Bun-style `fetch(request)` handler into a Workers module, and `serveModule(module, env)`
serves a Workers module directly with `Bun.serve`, without workerd.

## REST API

```ts
import { createClient } from "@aphrody/bun-cloudflare/api";

const cf = createClient(); // CLOUDFLARE_API_TOKEN, or CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL
for await (const zone of cf.zones.list()) console.log(zone.name);
```

## Bundled packages

`src/catalog.ts` lists every package with its category and docs:

| Category   | Packages                                                                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tooling    | wrangler, miniflare, workerd, create-cloudflare, @cloudflare/vite-plugin, @cloudflare/vitest-plugin, @cloudflare/config, @cloudflare/autoconfig, @cloudflare/codemods, @cloudflare/build-output-utils, @cloudflare/pages-functions, @cloudflare/unenv-preset, @cloudflare/worker-bundler, @cloudflare/kv-asset-handler |
| types      | @cloudflare/workers-types, @cloudflare/runtime-types, @cloudflare/types                                                                                                                                                                                                                                                |
| api        | cloudflare, chanfana, @cloudflare/cabidela                                                                                                                                                                                                                                                                             |
| frameworks | @opennextjs/cloudflare, vinext                                                                                                                                                                                                                                                                                         |
| runtime    | @cloudflare/containers, @cloudflare/sandbox, @cloudflare/actors, @cloudflare/streamline, @cloudflare/dynamic-workflows, @cloudflare/workers-oauth-provider, @cloudflare/workers-response-store, @cloudflare/flagship, @cloudflare/computer                                                                             |
| ai         | agents, @cloudflare/ai-chat, @cloudflare/think, @cloudflare/codemode, @cloudflare/shell, @cloudflare/ai-gateway, @cloudflare/tanstack-ai, workers-ai-provider                                                                                                                                                          |
| browser    | @cloudflare/puppeteer, @cloudflare/playwright, @cloudflare/speedtest                                                                                                                                                                                                                                                   |
| realtime   | @cloudflare/realtimekit, partyserver, partysocket                                                                                                                                                                                                                                                                      |
| crypto     | @cloudflare/privacypass-ts, @cloudflare/voprf-ts, @cloudflare/blindrsa-ts                                                                                                                                                                                                                                              |

Left out: deprecated packages (`@cloudflare/vitest-pool-workers`, `@cloudflare/next-on-pages`), workers-sdk
internals (`*-shared`, `workers-utils`, `workers-auth`, `deploy-helpers`), dashboard UI components, and
framework-specific UI kits (`@cloudflare/realtimekit-react*`, `@cloudflare/stream-react`, `@cloudflare/kumo`).
Add those to your app directly when you need them.

## aphrody.app

`app/` is the production Worker of https://aphrody.app: the Aphrody Bun site as static assets and an API under
`/api` (R2 buckets `aphrody` and `dragonballfr`, D1, KV, Queues, Workflows, a Durable Object, Workers AI through
the `aphrody` AI Gateway). Credentials come from `app/.env` (git-ignored, see `app/.env.example`) or the host key
store `~/.aphrody/config/cloudflare.env`.

```sh
bun app/scripts/provision.ts   # zones, DNS, DNSSEC, TLS, cache and redirect rules, R2 domains, AI Gateway
bun app/scripts/deploy.ts      # builds the site, deploys the Worker and its assets, applies D1 migrations
bun app/scripts/token.ts       # account-owned automation token (needs CLOUDFLARE_BOOTSTRAP_TOKEN)
```

The vps timer `aphrody-site-publish` runs `scripts/aphrody/site/publish.ts`, which deploys through `deploy.ts`.

## Tests

```sh
cd packages/bun-cloudflare && bun install && bun test ./test
```
