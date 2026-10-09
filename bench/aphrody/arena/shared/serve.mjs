// R1, runtime lane: the runtime's own HTTP server (Bun.serve / Deno.serve) on port 0,
// then batches of sequential fetch() from the same process.
import { measureAsync, report, runtime } from "./common.mjs";

const BODY = "hello arena";
const BATCH = 50;
const handler = () => new Response(BODY);

const t0 = performance.now();
let url, stop;
if (runtime === "bun") {
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: handler });
  url = `http://127.0.0.1:${server.port}/`;
  stop = () => server.stop(true);
} else {
  const { promise, resolve } = Promise.withResolvers();
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: resolve }, handler);
  const addr = await promise;
  url = `http://127.0.0.1:${addr.port}/`;
  stop = () => server.shutdown();
}
await (await fetch(url)).text();
const listen = { cold: performance.now() - t0, samples: [], checksum: BODY.length };

const batch = await measureAsync("batch", async () => {
  let n = 0;
  for (let i = 0; i < BATCH; i++) n += (await (await fetch(url)).text()).length;
  return n;
});

await stop();
report("serve", "runtime", { listen, batch }, { batch: BATCH });
