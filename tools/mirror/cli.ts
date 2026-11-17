#!/usr/bin/env bun
// bun tools/mirror/cli.ts <command>
//   gate [--live] [--fetch] [--fresh] [--json]   install + docs/types versus upstream (+ sitemap coverage); exit 1 on a problem
//   crawl [--limit=N] [--match=GLOB] [--no-assets]   crawl the origin's sitemap into the store (resumable)
//   status                                        store tiers, page counts, manifest
//   search <words>                                full-text search of the mirrored pages
//   serve [--port=N]                              serve the mirror from the store
//   build <dir>                                   write the static mirror
//   publish <dir>                                 upload a built tree to the S3 tier
import { loadConfig } from "./config.ts";
import { crawl } from "./crawl.ts";
import { runGate, summarize } from "./gate.ts";
import { build, publish, serve } from "./site.ts";
import { Store } from "./store.ts";

const [command = "gate", ...rest] = Bun.argv.slice(2);
const flags = new Map<string, string>();
const words: string[] = [];
for (const arg of rest) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
  if (m) flags.set(m[1]!, m[2] ?? "true");
  else words.push(arg);
}

const cfg = await loadConfig();
const store = await Store.open({ dir: cfg.store.dir });
let code = 0;
try {
  switch (command) {
    case "gate": {
      const report = await runGate(cfg, store, { live: flags.has("live"), fetch: flags.has("fetch"), fresh: flags.has("fresh") });
      console.log(flags.has("json") ? JSON.stringify(report, null, 2) : summarize(report));
      code = report.problems.length ? 1 : 0;
      break;
    }
    case "crawl": {
      let last = 0;
      const report = await crawl(cfg, store, {
        limit: flags.has("limit") ? Number(flags.get("limit")) : undefined,
        match: flags.get("match"),
        assets: !flags.has("no-assets"),
        onProgress: (done, total, page) => {
          if (done - last < 200 && page.state !== "failed") return;
          last = done;
          console.log(`${done}/${total} ${page.state} ${page.status ?? ""} ${page.url}`);
        },
      });
      console.log(JSON.stringify(report));
      break;
    }
    case "status":
      console.log(JSON.stringify({ dir: store.dir, tiers: store.tiers(), pages: store.counts(), manifest: store.manifest().hash }, null, 2));
      break;
    case "search":
      for (const hit of store.search(words.join(" "))) console.log(`${hit.url}\n  ${hit.title}\n  ${Bun.stripANSI(hit.snippet)}`);
      break;
    case "serve": {
      const server = serve(cfg, store, { port: Number(flags.get("port") ?? Bun.env.PORT ?? 0) });
      console.log(`mirror of ${cfg.origin.url} on ${server.url}`);
      await new Promise<void>((resolve) => process.once("SIGINT", resolve));
      await server.stop();
      break;
    }
    case "build":
    case "publish": {
      const dir = words[0];
      if (!dir) throw new Error(`usage: ${command} <dir>`);
      console.log(JSON.stringify(command === "build" ? await build(cfg, store, dir) : { objects: await publish(store, dir) }));
      break;
    }
    default:
      console.error(`unknown command: ${command}`);
      code = 2;
  }
} finally {
  await store.close();
}
process.exit(code);
