// E2, engine lane: JSON.stringify + JSON.parse over a fixed PRNG document.
import { hashString, measureSync, mix, prng, report } from "./common.mjs";

const rnd = prng(99);
const doc = { version: 1, records: [] };
for (let i = 0; i < 4000; i++) {
  doc.records.push({
    id: i,
    name: "item-" + ((rnd() * 1e6) | 0),
    price: Math.round(rnd() * 1e6) / 100,
    tags: ["a", "b", "c", "d"].slice(0, 1 + ((rnd() * 4) | 0)),
    nested: { ok: rnd() > 0.5, depth: [1, [2, [3, null]]], note: 'quote " and \\ and é' },
  });
}

function roundTrip() {
  const s = JSON.stringify(doc);
  const o = JSON.parse(s);
  let h = mix(2166136261, s.length);
  h = hashString(h, s.slice(s.length - 256));
  return mix(h, o.records[o.records.length - 1].id);
}

report("json", "engine", { roundtrip: measureSync("roundtrip", roundTrip) });
