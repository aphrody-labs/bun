// R1, runtime lane: fetch() client against the driver's fixed peer (ARENA_FETCH_URL),
// batches of sequential GETs of a 16 KiB body.
import { env, hashString, measureAsync, mix, report } from "./common.mjs";

const url = env("ARENA_FETCH_URL");
if (!url) throw new Error("ARENA_FETCH_URL is not set (the driver starts fetch-server.mjs)");
const BATCH = 50;

const batch = await measureAsync("batch", async () => {
  let h = 2166136261;
  for (let i = 0; i < BATCH; i++) {
    const text = await (await fetch(url)).text();
    h = mix(h, text.length);
    if (i === 0) h = hashString(h, text.slice(0, 64));
  }
  return h;
});

report("fetch", "runtime", { batch }, { batch: BATCH });
