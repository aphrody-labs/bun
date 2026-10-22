// Publishes a built bun-native dataset (build.ts) to Cloudflare:
//
// - R2 bucket aphrody-dist, served by https://dist.aphrody.app: datasets/bun-native/<version>/bun-native-<commit12>.jsonl
//   (immutable, cached a year at the edge), datasets/bun-native/<version>/manifest.json and
//   datasets/bun-native/latest.json (channels, cached a minute: see provision.ts);
// - Vectorize index bun-native (provision.ts --only vectorize creates it): one vector per entry, embedded with
//   Workers AI (@cf/baai/bge-m3), metadata = what /api/bun/search returns. Vectors of entries gone since the
//   previous publish are deleted.
//
//   bun scripts/aphrody/dataset/publish.ts [--dir build/dataset] [--dry-run] [--no-index]
//
// Credentials: packages/web/cloudflare/.env, else ~/.aphrody/config/cloudflare.env (CLOUDFLARE_ACCOUNT_ID,
// CLOUDFLARE_API_TOKEN, R2_ENDPOINT and R2/AWS access keys).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { envFile, parseEnv } from "../../../packages/web/cloudflare/scripts/deploy.ts";
import { DATASET, type Entry } from "./build.ts";

export const BUCKET = "aphrody-dist";
export const PUBLIC = "https://dist.aphrody.app";
export const PREFIX = `datasets/${DATASET}`;
export const INDEX = DATASET;
export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const DIMENSIONS = 1024;

/** Vectorize ids are at most 64 bytes: a hash of the entry id. */
export const vectorId = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 32);

const clip = (s: string, bytes: number) => {
  const b = Buffer.from(s);
  return b.length <= bytes ? s : b.subarray(0, bytes).toString().replace(/�$/, "") + "…";
};

/** The text embedded for an entry: what a query about it would say. */
export function embedText(e: Entry): string {
  return clip([e.instruction, e.api.join(" "), e.code.slice(0, 1200)].filter(Boolean).join("\n"), 4000);
}

/** Vector metadata (Vectorize caps it at 10 KiB): everything a search result shows. */
export function metadata(e: Entry) {
  return {
    id: e.id,
    kind: e.kind,
    api: e.api.join(" "),
    instruction: clip(e.instruction, 600),
    code: clip(e.code || e.response, 6000),
    lang: e.lang,
    source: e.source,
    version: e.version,
  };
}

export function keys(version: string, commit: string) {
  const dir = `${PREFIX}/${version}`;
  return {
    data: `${dir}/${DATASET}-${commit.slice(0, 12)}.jsonl`,
    vectors: `${dir}/vectors-${commit.slice(0, 12)}.json`,
    manifest: `${dir}/manifest.json`,
    latest: `${PREFIX}/latest.json`,
  };
}

function env(): Record<string, string> {
  return {
    ...parseEnv(readFileSync(envFile(), "utf8")),
    ...(process.env as Record<string, string>),
  };
}

async function cf<T>(
  e: Record<string, string>,
  method: string,
  path: string,
  body?: BodyInit,
  type = "application/json",
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${e.CLOUDFLARE_ACCOUNT_ID}${path}`, {
      method,
      headers: { Authorization: `Bearer ${e.CLOUDFLARE_API_TOKEN}`, "Content-Type": type },
      body,
    });
    const json = (await res.json()) as { success: boolean; result: T; errors: { code: number; message: string }[] };
    if (json.success) return json.result;
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      await Bun.sleep(1000 * 2 ** attempt);
      continue;
    }
    throw new Error(`${method} ${path}: ${res.status} ${json.errors?.map(x => `${x.code} ${x.message}`).join("; ")}`);
  }
}

async function embed(e: Record<string, string>, texts: string[]): Promise<number[][]> {
  const r = await cf<{ data: number[][] }>(e, "POST", `/ai/run/${EMBEDDING_MODEL}`, JSON.stringify({ text: texts }));
  if (r.data?.length !== texts.length || r.data[0]?.length !== DIMENSIONS)
    throw new Error("unexpected embedding shape");
  return r.data;
}

async function main(args: string[]) {
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const root = join(import.meta.dir, "..", "..", "..");
  const dir = opt("--dir") ?? join(root, "build", "dataset");
  const dryRun = args.includes("--dry-run");
  const manifest = await Bun.file(join(dir, "manifest.json")).json();
  const jsonl = await Bun.file(join(dir, `${DATASET}.jsonl`)).text();
  const sha256 = createHash("sha256").update(jsonl).digest("hex");
  if (sha256 !== manifest.sha256) throw new Error("manifest.json does not match the jsonl: rebuild");
  const entries = jsonl
    .trim()
    .split("\n")
    .map(l => JSON.parse(l) as Entry);
  const k = keys(manifest.version, manifest.commit);
  const e = env();
  const s3 = new Bun.S3Client({
    endpoint: e.R2_ENDPOINT,
    accessKeyId: e.R2_ACCESS_KEY_ID ?? e.AWS_ACCESS_KEY_ID,
    secretAccessKey: e.R2_SECRET_ACCESS_KEY ?? e.AWS_SECRET_ACCESS_KEY,
    bucket: BUCKET,
  });
  const ids = entries.map(x => vectorId(x.id));
  const latest = {
    name: DATASET,
    version: manifest.version,
    commit: manifest.commit,
    entries: manifest.entries,
    sha256,
    bytes: manifest.bytes,
    url: `${PUBLIC}/${k.data}`,
    manifest: `${PUBLIC}/${k.manifest}`,
    vectors: k.vectors,
    search: "https://bun.aphrody.app/api/bun/search?q=",
  };
  console.log(`${entries.length} entries -> ${PUBLIC}/${k.data}`);
  if (dryRun) return;

  let previous: string[] = [];
  try {
    const old = await s3.file(k.latest).json();
    if (old.vectors && old.vectors !== k.vectors) previous = await s3.file(old.vectors).json();
  } catch {}

  await s3.write(k.data, jsonl, { type: "application/x-ndjson" });
  await s3.write(k.vectors, JSON.stringify(ids), { type: "application/json" });
  await s3.write(k.manifest, JSON.stringify({ ...manifest, url: latest.url }, null, 2), { type: "application/json" });

  if (!args.includes("--no-index")) {
    const batch = 50;
    let upserted = 0;
    for (let i = 0; i < entries.length; i += batch * 10) {
      const slice = entries.slice(i, i + batch * 10);
      const vectors: number[][] = [];
      for (let j = 0; j < slice.length; j += batch)
        vectors.push(...(await embed(e, slice.slice(j, j + batch).map(embedText))));
      const ndjson = slice
        .map((x, j) => JSON.stringify({ id: vectorId(x.id), values: vectors[j], metadata: metadata(x) }))
        .join("\n");
      await cf(e, "POST", `/vectorize/v2/indexes/${INDEX}/upsert`, ndjson, "application/x-ndjson");
      upserted += slice.length;
      console.log(`indexed ${upserted}/${entries.length}`);
    }
    const keep = new Set(ids);
    const stale = previous.filter(id => !keep.has(id));
    for (let i = 0; i < stale.length; i += 500)
      await cf(
        e,
        "POST",
        `/vectorize/v2/indexes/${INDEX}/delete_by_ids`,
        JSON.stringify({ ids: stale.slice(i, i + 500) }),
      );
    if (stale.length) console.log(`deleted ${stale.length} stale vectors`);
  }

  // The channel moves last: readers never see a latest.json pointing at a missing file.
  await s3.write(k.latest, JSON.stringify(latest, null, 2), { type: "application/json" });
  console.log(`published ${PUBLIC}/${k.latest}`);
}

if (import.meta.main) await main(process.argv.slice(2));
