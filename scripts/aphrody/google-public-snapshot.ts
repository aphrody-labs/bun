// SPDX-License-Identifier: MIT
// Export only reports whose native crawl transport/redirect/robots guards were
// independently qualified. This module neither crawls nor qualifies transport.
import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

export interface PublicSnapshotPolicy {
  collection: string;
  seeds: string[];
  hosts: string[];
  maxRequests: number;
  maxDepth: number;
  obeyRobots: true;
  anonymous: true;
}
export interface PublicSnapshotContext {
  /** Job completion from the caller's receipt, not cached document freshness. */
  generatedAt: string;
  timedOut: boolean;
}
export interface PublicSnapshot {
  schemaVersion: 1;
  collection: string;
  generatedAt: string;
  provenance: {
    owner: "aphrody-web-crawl";
    sourceRevision: string;
    policySha256: string;
    anonymous: true;
    public: true;
  };
  coverage: {
    attempted: number;
    done: number;
    pending: number;
    locked: number;
    failed: number;
    complete: boolean;
    timedOut: boolean;
    exported: number;
  };
  documents: {
    url: string;
    title: string;
    text: string;
    contentBytes: number;
    contentSha256: string;
  }[];
}
export interface PublicSnapshotPointer {
  schemaVersion: 1;
  collection: string;
  file: string;
  sha256: string;
}
const MAX_BYTES = 4 * 1024 * 1024;
const slug = /^[a-z0-9][a-z0-9-]{0,63}$/;
const hash = /^[a-f0-9]{64}$/;
function fail(): never {
  throw new Error("Invalid public snapshot export");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function integer(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) fail();
  return value;
}
function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    Array.from(value).some((char) => {
      const code = char.charCodeAt(0);
      return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13);
    }) ||
    Buffer.byteLength(value) > max ||
    Buffer.from(value).toString("utf8") !== value
  )
    fail();
  return value;
}
export function canonicalPublicJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalPublicJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = object(value);
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalPublicJson(record[key])}`)
      .join(",")}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined || (typeof value === "number" && !Number.isFinite(value))) fail();
  return result;
}
export function publicSha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function publicHost(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 253 ||
    value.split(".").some((label) => label.length > 63) ||
    value !== value.toLowerCase() ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value) ||
    isIP(value) ||
    /(?:^|\.)(?:localhost|local|internal|invalid|test|home|lan|onion)$/.test(value)
  )
    fail();
  return value;
}
function publicUrl(value: unknown, hosts: string[]): string {
  const input = text(value, 8192);
  if (Array.from(input).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127))
    fail();
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !hosts.includes(publicHost(url.hostname))
  )
    fail();
  return url.href;
}
function validatePolicy(input: PublicSnapshotPolicy): PublicSnapshotPolicy {
  const policy = object(input);
  const keys = [
    "collection",
    "seeds",
    "hosts",
    "maxRequests",
    "maxDepth",
    "obeyRobots",
    "anonymous",
  ];
  if (
    Object.keys(policy).some((key) => !keys.includes(key)) ||
    typeof policy.collection !== "string" ||
    !slug.test(policy.collection) ||
    policy.obeyRobots !== true ||
    policy.anonymous !== true
  )
    fail();
  if (!Array.isArray(policy.hosts) || policy.hosts.length < 1 || policy.hosts.length > 32) fail();
  const hosts = policy.hosts.map(publicHost);
  if (
    new Set(hosts).size !== hosts.length ||
    !Array.isArray(policy.seeds) ||
    policy.seeds.length < 1 ||
    policy.seeds.length > 1000
  )
    fail();
  const seeds = policy.seeds.map((seed) => {
    publicUrl(seed, hosts);
    return seed as string;
  });
  if (new Set(seeds.map((seed) => new URL(seed).href)).size !== seeds.length) fail();
  const maxRequests = integer(policy.maxRequests, 5000);
  if (maxRequests < 1) fail();
  return {
    collection: policy.collection,
    seeds,
    hosts,
    maxRequests,
    maxDepth: integer(policy.maxDepth, 10),
    obeyRobots: true,
    anonymous: true,
  };
}
/** Projects the existing handle_web_crawl --json report. No home/database reads. */
export function buildPublicSnapshot(
  report: unknown,
  inputPolicy: PublicSnapshotPolicy,
  sourceRevision: string,
  context: PublicSnapshotContext,
): PublicSnapshot {
  const policy = validatePolicy(inputPolicy);
  if (
    !/^[a-f0-9]{40}$/.test(sourceRevision) ||
    !context ||
    typeof context.timedOut !== "boolean" ||
    typeof context.generatedAt !== "string" ||
    !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      context.generatedAt,
    ) ||
    !Number.isFinite(Date.parse(context.generatedAt))
  )
    fail();
  const calendar = new Date(`${context.generatedAt.slice(0, 10)}T00:00:00Z`);
  if (
    !Number.isFinite(calendar.valueOf()) ||
    calendar.toISOString().slice(0, 10) !== context.generatedAt.slice(0, 10)
  )
    fail();
  const crawl = object(report);
  if (
    Object.keys(crawl).some(
      (key) =>
        !["attempts", "pages", "errors", "frontier", "exactDuplicates", "nearDuplicates"].includes(
          key,
        ),
    )
  )
    fail();
  const attempted = integer(crawl.attempts, policy.maxRequests);
  if (
    !Array.isArray(crawl.pages) ||
    crawl.pages.length > 1000 ||
    crawl.pages.length > attempted ||
    !Array.isArray(crawl.errors) ||
    crawl.errors.length > attempted
  )
    fail();
  const frontier = object(crawl.frontier);
  if (Object.keys(frontier).some((key) => !["pending", "locked", "done", "failed"].includes(key)))
    fail();
  const done = integer(frontier.done, attempted);
  const failed = integer(frontier.failed, attempted);
  const pending = integer(frontier.pending, 100000);
  const locked = integer(frontier.locked, attempted);
  if (done + failed + locked > attempted || done < crawl.pages.length) fail();
  for (const error of crawl.errors) {
    if (!Array.isArray(error) || error.length !== 2) fail();
    publicUrl(error[0], policy.hosts);
    text(error[1], 8192);
  }
  const seen = new Set<string>();
  const documents: PublicSnapshot["documents"] = [];
  for (const value of crawl.pages) {
    const page = object(value);
    if (
      Object.keys(page).some(
        (key) =>
          ![
            "url",
            "depth",
            "status",
            "title",
            "description",
            "canonical",
            "lang",
            "markdown",
            "text",
            "blocks",
            "wordCount",
            "duplicate",
            "discoveredLinks",
          ].includes(key),
      )
    )
      fail();
    const url = publicUrl(page.url, policy.hosts);
    integer(page.depth, policy.maxDepth);
    const status = integer(page.status, 599);
    if (status < 100 || seen.has(url)) fail();
    seen.add(url);
    if (status < 200 || status >= 300) continue;
    const content = text(page.text, 32768);
    const title = text(page.title, 2048);
    if (Array.from(title).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
      fail();
    documents.push({
      url,
      title,
      text: content,
      contentBytes: Buffer.byteLength(content),
      contentSha256: publicSha256(content),
    });
  }
  const snapshot: PublicSnapshot = {
    schemaVersion: 1,
    collection: policy.collection,
    generatedAt: context.generatedAt,
    provenance: {
      owner: "aphrody-web-crawl",
      sourceRevision,
      policySha256: publicSha256(canonicalPublicJson(policy)),
      anonymous: true,
      public: true,
    },
    coverage: {
      attempted,
      done,
      pending,
      locked,
      failed,
      complete:
        done === attempted &&
        pending === 0 &&
        locked === 0 &&
        failed === 0 &&
        crawl.errors.length === 0 &&
        !context.timedOut,
      timedOut: context.timedOut,
      exported: documents.length,
    },
    documents,
  };
  if (Buffer.byteLength(canonicalPublicJson(snapshot) + "\n") > MAX_BYTES) fail();
  return snapshot;
}

/** CLI consumes only a separately guard-qualified public report. Plan is default;
 * --apply writes only the explicitly supplied owner export directory. Example:
 * bun google-public-snapshot.ts --report report.json --policy policy.json
 * --source-revision <40-hex> --generated-at <job-completion-RFC3339>
 * --timed-out false --root <public-export-directory> [--apply]
 * Report completion/transport evidence is the operator's responsibility.
 */
export async function runPublicSnapshotCli(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      report: { type: "string" },
      policy: { type: "string" },
      "source-revision": { type: "string" },
      "generated-at": { type: "string" },
      "timed-out": { type: "string" },
      root: { type: "string" },
      apply: { type: "boolean" },
    },
  });
  if (
    !values.report ||
    !values.policy ||
    !values.root ||
    !values["source-revision"] ||
    !values["generated-at"] ||
    !["true", "false"].includes(values["timed-out"] ?? "")
  )
    fail();
  const report = JSON.parse(
    (await regularBytes(resolve(values.report), 40 * 1024 * 1024)).toString("utf8"),
  ) as unknown;
  const policy = JSON.parse(
    (await regularBytes(resolve(values.policy), 16384)).toString("utf8"),
  ) as PublicSnapshotPolicy;
  const context = { generatedAt: values["generated-at"], timedOut: values["timed-out"] === "true" };
  const revision = values["source-revision"];
  const snapshot = buildPublicSnapshot(report, policy, revision, context);
  await canonicalRoot(values.root);
  const result = values.apply
    ? await publishPublicSnapshot(values.root, report, policy, revision, context)
    : undefined;
  console.log(
    JSON.stringify({
      mode: values.apply ? "apply" : "plan",
      collection: snapshot.collection,
      policySha256: snapshot.provenance.policySha256,
      coverage: snapshot.coverage,
      ...(result ? { pointer: result.pointer, rollbackFile: result.rollbackFile } : {}),
    }),
  );
}
if (import.meta.main) {
  runPublicSnapshotCli(process.argv.slice(2)).catch(() => {
    console.error("Public snapshot export failed");
    process.exitCode = 1;
  });
}
async function regularBytes(path: string, limit: number): Promise<Buffer> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > limit) fail();
  const bytes = await readFile(path);
  if (bytes.length > limit) fail();
  return bytes;
}
async function canonicalRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) fail();
  const absolute = resolve(root);
  let path = absolute;
  while (true) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
    const parent = dirname(path);
    if (parent === path) break;
    path = parent;
  }
  const actual = resolve(await realpath(absolute));
  if (
    process.platform === "win32"
      ? actual.toLowerCase() !== absolute.toLowerCase()
      : actual !== absolute
  )
    fail();
  return absolute;
}
async function exclusiveBytes(path: string, bytes: Buffer): Promise<void> {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!(await regularBytes(path, MAX_BYTES)).equals(bytes)) fail();
    return;
  }
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
/** Owner-only export directory; it must already exist. Never uses a default DB/home.
 * Rebuilds the snapshot from the verified report before touching publication files.
 * A collection lock serializes cooperating publishers; external filesystem writers
 * must remain excluded by the directory owner. Retained pointer files allow rollback.
 */
export async function publishPublicSnapshot(
  root: string,
  report: unknown,
  policy: PublicSnapshotPolicy,
  revision: string,
  context: PublicSnapshotContext,
) {
  const snapshot = buildPublicSnapshot(report, policy, revision, context);
  const directory = await canonicalRoot(root);
  const bytes = Buffer.from(canonicalPublicJson(snapshot) + "\n");
  const sha256 = publicSha256(bytes);
  const pointer: PublicSnapshotPointer = {
    schemaVersion: 1,
    collection: snapshot.collection,
    file: `${sha256}.json`,
    sha256,
  };
  const pointerPath = join(directory, `${snapshot.collection}.pointer.json`);
  const lockPath = join(directory, `${snapshot.collection}.publish.lock`);
  const lock = await open(lockPath, "wx", 0o600);
  const temporary = join(directory, `${snapshot.collection}.${randomUUID()}.tmp`);
  try {
    let previous: Buffer | undefined;
    try {
      previous = await regularBytes(pointerPath, 1024);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    let rollbackFile: string | undefined;
    if (previous) {
      const old = object(JSON.parse(previous.toString("utf8")));
      if (
        Object.keys(old).length !== 4 ||
        old.schemaVersion !== 1 ||
        old.collection !== snapshot.collection ||
        typeof old.sha256 !== "string" ||
        !hash.test(old.sha256) ||
        old.file !== `${old.sha256}.json`
      )
        fail();
      const oldBytes = await regularBytes(join(directory, old.file as string), MAX_BYTES);
      if (publicSha256(oldBytes) !== old.sha256) fail();
      const oldSnapshot = object(JSON.parse(oldBytes.toString("utf8")));
      if (
        oldSnapshot.schemaVersion !== 1 ||
        oldSnapshot.collection !== snapshot.collection ||
        object(oldSnapshot.provenance).owner !== "aphrody-web-crawl"
      )
        fail();
      rollbackFile = `${snapshot.collection}.pointer-${publicSha256(previous)}.json`;
      await exclusiveBytes(join(directory, rollbackFile), previous);
    }
    await exclusiveBytes(join(directory, pointer.file), bytes);
    await exclusiveBytes(temporary, Buffer.from(canonicalPublicJson(pointer) + "\n"));
    await rename(temporary, pointerPath);
    return { snapshot, pointer, rollbackFile };
  } finally {
    await unlink(temporary).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
    await lock.close();
    await unlink(lockPath);
  }
}
