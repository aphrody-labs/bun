// SPDX-License-Identifier: Apache-2.0
//! Native Hugging Face configuration: where the cache, the token and the endpoint are, the environment handed to every
//! child of the runtime, and a download into the hub-compatible cache layout (`models--org--name/{blobs,snapshots,refs}`),
//! so `huggingface_hub`, `transformers`, vLLM and friends find what buv fetched, and the reverse.
//!
//! The token is read from `HF_TOKEN`, then `HF_TOKEN_PATH`, then `<HF_HOME>/token`; it is only ever sent as a Bearer header
//! to the configured endpoint and never printed (status reports `present`/`absent` and its source).

import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

type Env = Readonly<Record<string, string | undefined>>;

export interface HfConfig {
  readonly home: string;
  readonly hubCache: string;
  readonly endpoint: string;
  readonly offline: boolean;
  readonly token: {
    readonly present: boolean;
    readonly source: "HF_TOKEN" | "HF_TOKEN_PATH" | "file" | null;
  };
}

const filled = (value: string | undefined): string | undefined =>
  value !== undefined && value !== "" ? value : undefined;

export function hfHome(env: Env = process.env, home: string = homedir()): string {
  const explicit = filled(env["HF_HOME"]);
  if (explicit) return resolve(explicit);
  const xdg = filled(env["XDG_CACHE_HOME"]);
  return join(xdg ?? join(home, ".cache"), "huggingface");
}

export function readToken(
  env: Env = process.env,
  home: string = homedir(),
): { value: string; source: NonNullable<HfConfig["token"]["source"]> } | null {
  const direct = filled(env["HF_TOKEN"]) ?? filled(env["HUGGING_FACE_HUB_TOKEN"]);
  if (direct) return { value: direct.trim(), source: "HF_TOKEN" };
  const path = filled(env["HF_TOKEN_PATH"]);
  const candidates: [string, "HF_TOKEN_PATH" | "file"][] = [];
  if (path) candidates.push([resolve(path), "HF_TOKEN_PATH"]);
  candidates.push([join(hfHome(env, home), "token"), "file"]);
  for (const [file, source] of candidates) {
    if (existsSync(file)) {
      const value = readFileSync(file, "utf8").trim();
      if (value !== "") return { value, source };
    }
  }
  return null;
}

export function resolveHf(env: Env = process.env, home: string = homedir(), publicOnly = false): HfConfig {
  const base = hfHome(env, home);
  const token = publicOnly ? null : readToken(env, home);
  return {
    home: base,
    hubCache: resolve(filled(env["HF_HUB_CACHE"]) ?? filled(env["HUGGINGFACE_HUB_CACHE"]) ?? join(base, "hub")),
    endpoint: (filled(env["HF_ENDPOINT"]) ?? "https://huggingface.co").replace(/\/+$/, ""),
    offline: filled(env["HF_HUB_OFFLINE"]) === "1",
    token: { present: token !== null, source: token?.source ?? null },
  };
}

/** The variables a child process (uv, python, vllm) must see so every tool agrees on the same cache and endpoint. */
export function hfChildEnv(env: Env = process.env, home: string = homedir()): Record<string, string> {
  const config = resolveHf(env, home);
  return { HF_HOME: config.home, HF_HUB_CACHE: config.hubCache, HF_ENDPOINT: config.endpoint };
}

/** `org/name` to the hub cache folder name. */
export function repoFolder(repo: string, kind: "model" | "dataset" | "space" = "model"): string {
  if (!/^[\w.-]+(\/[\w.-]+)?$/.test(repo)) throw new Error(`invalid repository id: ${repo}`);
  return `${kind}s--${repo.replaceAll("/", "--")}`;
}

export interface DownloadResult {
  readonly path: string;
  readonly commit: string;
  readonly cached: boolean;
}

export interface DownloadIntegrity {
  readonly bytes: number;
  readonly sha256?: string;
  /** Git blob identity for files stored directly in Git, not LFS pointer blobs. */
  readonly gitBlobSHA1?: string;
}

/** Only the transport call is injected; fetch.preconnect is not used here. */
export type HfFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface HfDownloadOptions {
  readonly revision?: string;
  readonly env?: Env;
  readonly home?: string;
  readonly fetcher?: HfFetcher;
  readonly expected?: DownloadIntegrity;
  /** Public acquisition never reads or sends a token. */
  readonly publicOnly?: boolean;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly onProgress?: (bytes: number) => void;
}

function safeRelative(value: string): boolean {
  return (
    value !== "" &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    value.split("/").every(part => part !== "" && part !== "." && part !== "..")
  );
}

function validateIntegrity(expected: DownloadIntegrity | undefined): void {
  if (!expected) return;
  if (
    !Number.isSafeInteger(expected.bytes) ||
    expected.bytes < 0 ||
    (!expected.sha256 && !expected.gitBlobSHA1) ||
    (expected.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(expected.sha256)) ||
    (expected.gitBlobSHA1 !== undefined && !/^[0-9a-f]{40}$/.test(expected.gitBlobSHA1))
  ) {
    throw new Error("Invalid download integrity descriptor");
  }
}

/** Re-hashes the complete file through a bounded stream, including cached bytes. */
export async function verifyDownload(path: string, expected: DownloadIntegrity, signal?: AbortSignal): Promise<string> {
  validateIntegrity(expected);
  if (Bun.file(path).size !== expected.bytes) throw new Error("Download size does not match pinned metadata");
  return consume(Bun.file(path).stream(), expected, signal);
}

async function consume(
  stream: ReadableStream<Uint8Array>,
  expected: DownloadIntegrity | undefined,
  signal?: AbortSignal,
  write?: (chunk: Uint8Array, bytes: number) => Promise<void>,
): Promise<string> {
  const sha256 = new Bun.CryptoHasher("sha256");
  const blob = expected?.gitBlobSHA1 ? new Bun.CryptoHasher("sha1").update(`blob ${expected.bytes}\0`) : undefined;
  let bytes = 0;
  const reader = stream.getReader();
  try {
    while (true) {
      signal?.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (expected && bytes > expected.bytes) throw new Error("Download exceeds pinned size");
      sha256.update(next.value);
      blob?.update(next.value);
      await write?.(next.value, bytes);
    }
    const actual = sha256.digest("hex");
    if (expected && bytes !== expected.bytes) throw new Error("Download size does not match pinned metadata");
    if (expected?.sha256 && actual !== expected.sha256)
      throw new Error("Download SHA256 does not match pinned metadata");
    if (expected?.gitBlobSHA1 && blob?.digest("hex") !== expected.gitBlobSHA1) {
      throw new Error("Download Git blob does not match pinned metadata");
    }
    return actual;
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Downloads one file of a repository into the hub cache layout: the content under `blobs/<etag>`, a relative symlink in
 * `snapshots/<commit>/<file>`, the revision in `refs/<revision>`. A file already in the snapshot is not fetched again.
 */
export async function downloadFile(
  repo: string,
  file: string,
  options: HfDownloadOptions = {},
): Promise<DownloadResult> {
  const env = options.env ?? process.env;
  const config = resolveHf(env, options.home, options.publicOnly);
  const revision = options.revision ?? "main";
  if (!safeRelative(file) || !safeRelative(revision)) throw new Error("Invalid repository file or revision");
  validateIntegrity(options.expected);
  const timeoutMs = options.timeoutMs ?? 30 * 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60 * 60_000)
    throw new Error("Invalid download timeout");
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const folder = join(config.hubCache, repoFolder(repo));
  const ref = join(folder, "refs", revision);
  const knownCommit = /^[0-9a-f]{40}$/.test(revision)
    ? revision
    : existsSync(ref)
      ? readFileSync(ref, "utf8").trim()
      : null;
  if (knownCommit && /^[0-9a-f]{40}$/.test(knownCommit)) {
    const commit = knownCommit;
    const known = join(folder, "snapshots", commit, file);
    if (existsSync(known)) {
      if (options.expected) await verifyDownload(known, options.expected, signal);
      return { path: known, commit, cached: true };
    }
  }
  if (config.offline) throw new Error(`${repo}/${file} is not cached and HF_HUB_OFFLINE=1`);
  const token = options.publicOnly ? null : readToken(env, options.home);
  const url = `${config.endpoint}/${repo}/resolve/${encodeURIComponent(revision)}/${file.split("/").map(encodeURIComponent).join("/")}`;
  const response = await (options.fetcher ?? fetch)(url, {
    headers: token ? { authorization: `Bearer ${token.value}` } : {},
    redirect: "follow",
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  const commit = response.headers.get("x-repo-commit") ?? (/^[0-9a-f]{40}$/.test(revision) ? revision : null);
  const etag =
    options.expected?.sha256 ??
    options.expected?.gitBlobSHA1 ??
    (response.headers.get("x-linked-etag") ?? response.headers.get("etag") ?? "").replaceAll(/^W\/|"/g, "");
  if (
    commit === null ||
    !/^[0-9a-f]{40}$/.test(commit) ||
    !/^[\w-]+$/.test(etag) ||
    (/^[0-9a-f]{40}$/.test(revision) && commit !== revision)
  ) {
    await response.body?.cancel();
    throw new Error(`${url}: invalid repository commit or etag`);
  }
  if (!response.body) throw new Error(`${url}: response has no body`);
  const blob = join(folder, "blobs", etag);
  mkdirSync(dirname(blob), { recursive: true, mode: 0o700 });
  const partial = `${blob}.incomplete`;
  if (existsSync(blob)) {
    if (!options.expected) throw new Error("Untracked blob already exists; refusing to overwrite it");
    await verifyDownload(blob, options.expected, signal);
    await response.body.cancel();
  } else {
    let ownsPartial = false;
    let sink: ReturnType<ReturnType<typeof Bun.file>["writer"]> | undefined;
    try {
      // Exclusive creation preserves a concurrent transfer and sets permissions before bytes arrive.
      const descriptor = openSync(partial, "wx", 0o600);
      closeSync(descriptor);
      ownsPartial = true;
      sink = Bun.file(partial).writer({ highWaterMark: 256 * 1024 });
      let pendingBytes = 0;
      await consume(response.body, options.expected, signal, async (chunk, bytes) => {
        sink!.write(chunk);
        pendingBytes += chunk.byteLength;
        if (pendingBytes >= 256 * 1024) {
          await sink!.flush();
          pendingBytes = 0;
        }
        options.onProgress?.(bytes);
      });
      await sink.end();
      sink = undefined;
      renameSync(partial, blob);
    } catch (error) {
      await response.body.cancel().catch(() => {});
      throw error;
    } finally {
      await sink?.end();
      if (ownsPartial) rmSync(partial, { force: true });
    }
  }
  chmodSync(blob, 0o600);
  const link = join(folder, "snapshots", commit, file);
  mkdirSync(dirname(link), { recursive: true, mode: 0o700 });
  const pendingLink = `${link}.incomplete`;
  symlinkSync(relative(dirname(link), blob), pendingLink);
  renameSync(pendingLink, link);
  mkdirSync(dirname(ref), { recursive: true, mode: 0o700 });
  const pendingRef = `${ref}.incomplete`;
  writeFileSync(pendingRef, commit, { mode: 0o600, flag: "wx" });
  renameSync(pendingRef, ref);
  return { path: link, commit, cached: false };
}

if (import.meta.main) {
  const [command, repo, file] = process.argv.slice(2);
  if (command === "status" || command === undefined) {
    console.log(JSON.stringify(resolveHf(), null, 2));
  } else if (command === "download" && repo && file) {
    console.log(JSON.stringify(await downloadFile(repo, file)));
  } else {
    console.error("usage: bun scripts/huggingface.ts [status | download <org/name> <file>]");
    process.exit(2);
  }
}
