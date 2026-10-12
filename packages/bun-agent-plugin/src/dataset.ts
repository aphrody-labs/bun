// The bun-native dataset (scripts/aphrody/dataset) next to the installed plugin, where `examples_search` of
// `bun mcp` reads it: <BUN_INSTALL or ~/.bun>/agent/datasets/bun-native.jsonl. From the checkout's build when
// there is one, else the latest published release (dist.aphrody.app), verified against its sha256.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATASET_URL } from "./native.ts";

export type DatasetReport = { path: string; source: string; entries?: number } | { error: string };

type Latest = { url: string; sha256: string; entries: number; version: string };

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function syncDataset(
  bunHome: string,
  checkout?: string,
  download = true,
  timeoutMs = 20_000,
): Promise<DatasetReport> {
  const dir = join(bunHome, "agent", "datasets");
  const path = join(dir, "bun-native.jsonl");
  const write = (bytes: Uint8Array) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path + ".tmp", bytes);
    renameSync(path + ".tmp", path);
  };
  try {
    const built = checkout && join(checkout, "build", "dataset", "bun-native.jsonl");
    if (built && existsSync(built)) {
      const bytes = readFileSync(built);
      if (!existsSync(path) || sha256(readFileSync(path)) !== sha256(bytes)) write(bytes);
      return { path, source: built };
    }
    if (!download) return { error: "no build/dataset/bun-native.jsonl in the checkout" };
    const signal = AbortSignal.timeout(timeoutMs);
    const latest = (await (await fetch(DATASET_URL, { signal })).json()) as Latest;
    if (existsSync(path) && sha256(readFileSync(path)) === latest.sha256)
      return { path, source: latest.url, entries: latest.entries };
    const res = await fetch(latest.url, { signal });
    if (!res.ok) throw new Error(`${latest.url}: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (sha256(bytes) !== latest.sha256) throw new Error(`${latest.url}: sha256 mismatch`);
    write(bytes);
    return { path, source: latest.url, entries: latest.entries };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
