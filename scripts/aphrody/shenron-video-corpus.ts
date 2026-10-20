import { lstat, mkdir, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { mediaSDKHostTarget } from "../../packages/bun-video/src/sdk-platform";

export type Check = {
  status: "passed" | "failed" | "skipped" | "unavailable";
  code?: string;
  evidence?: Record<string, unknown>;
};
export interface CorpusAsset {
  id: string;
  publicationQualified?: boolean;
  localPath?: string;
  localSha256?: string;
  urls?: { role: "source" | "http" | "cdn"; url: string; mime: string; bytes?: number; sha256?: string }[];
}
export interface CorpusOptions {
  assets: CorpusAsset[];
  allowedOrigins: string[];
  allowedLocalRoots?: string[];
  rangeBytes?: number;
  maxNetworkBytes?: number;
  maxAssets?: number;
  timeoutMs?: number;
  workerTimeoutMs?: number;
  deadlineMs?: number;
  maxRemuxBytes?: number;
  ffmpegRemuxFormats?: ("mp4" | "mkv" | "mov")[];
  workDirectory?: string;
  tools?: { ffprobe?: string; ffmpeg?: string; mpv?: string; mpvReceipt?: string };
}
export interface CatalogCursor {
  revision: string;
  page: number;
  entry: number;
}
export interface CatalogOptions {
  cdnOrigin: string;
  sourceOrigin?: string;
  maxPages?: number;
  maxAssets?: number;
  maxMetadataBytes?: number;
  cursor?: CatalogCursor;
  mediaKinds?: ("video" | "image" | "audio" | "playlist")[];
  visitAllEntries?: boolean;
  deadlineMs?: number;
}
export interface EpisodePageOptions {
  siteOrigin: string;
  mediaOrigins?: string[];
  series?: string;
  limit?: number;
  offset?: number;
}
const hex = /^[a-f0-9]{64}$/;
const hash = (bytes: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const defaultStore = () => join(homedir(), ".aphrody/qualifications/shenron");
class Failure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function limit(value: number | undefined, fallback: number, maximum: number) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) throw new Failure("invalid-budget");
  return selected;
}
function publicUrl(value: string): URL {
  const url = new URL(value);
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Failure("non-public-url");
  let decoded = url.pathname;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (
      decoded.includes("\\") ||
      [...decoded].some(character => character.charCodeAt(0) < 32) ||
      decoded.split("/").some(part => ["..", ".", "private", "cookies", ".env"].includes(part))
    )
      throw new Failure("unsafe-public-path");
    const next = decodeURIComponent(decoded);
    if (next === decoded) return url;
    decoded = next;
  }
  throw new Failure("unsafe-public-path");
}
function origin(value: string) {
  const url = publicUrl(value);
  if (url.pathname !== "/") throw new Failure("invalid-origin");
  return url.origin;
}
function inside(base: string, path: string) {
  const within = relative(base, path);
  return (
    within === "" || (!isAbsolute(within) && within !== ".." && !within.startsWith("../") && !within.startsWith("..\\"))
  );
}
function failed(error: unknown): Check {
  const code =
    error instanceof Failure
      ? error.code
      : typeof error === "object" &&
          error &&
          "code" in error &&
          typeof error.code === "string" &&
          /^(?:ERR_[A-Z_]+|ENOENT|EACCES|EPERM)$/.test(error.code)
        ? error.code
        : "operation-failed";
  return { status: "failed", code };
}
async function check(operation: () => Promise<Record<string, unknown>>): Promise<Check> {
  try {
    return { status: "passed", evidence: await operation() };
  } catch (error) {
    return failed(error);
  }
}
class Budget {
  bytes = 0;
  constructor(readonly maximum: number) {}
  async read(response: Response, maximum: number) {
    if (!response.body) throw new Failure("missing-response-body");
    const reader = response.body.getReader(),
      chunks: Uint8Array<ArrayBuffer>[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        this.bytes += value.length;
        if (length > maximum || this.bytes > this.maximum || chunks.length > 8192)
          throw new Failure("network-byte-budget-exceeded");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }
}
function mediaFormat(bytes: Uint8Array) {
  const prefix = Buffer.from(bytes.subarray(0, 64));
  if (prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255) return "jpeg";
  if (/^GIF8[79]a/.test(prefix.toString("ascii", 0, 6))) return "gif";
  if (prefix.toString("ascii", 0, 4) === "RIFF")
    return prefix.toString("ascii", 8, 12) === "WEBP"
      ? "webp"
      : prefix.toString("ascii", 8, 12) === "WAVE"
        ? "wav"
        : "riff";
  if (prefix.toString("ascii", 4, 8) === "ftyp") return "isobmff";
  if (prefix.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) return "matroska";
  if (
    new TextDecoder()
      .decode(prefix)
      .replace(/^\uFEFF/, "")
      .startsWith("#EXTM3U")
  )
    return "hls";
  if (prefix[0] === 0x47) return "mpegts";
  return "unknown";
}
function formatMatches(mime: string, format: string) {
  const types: Record<string, string[]> = {
    png: ["image/png"],
    jpeg: ["image/jpeg"],
    gif: ["image/gif"],
    webp: ["image/webp"],
    wav: ["audio/wav", "audio/x-wav"],
    isobmff: ["video/mp4", "video/quicktime", "image/avif", "image/heic"],
    matroska: ["video/webm", "video/x-matroska"],
    hls: ["application/vnd.apple.mpegurl", "application/x-mpegurl"],
    mpegts: ["video/mp2t"],
  };
  return types[format]?.includes(mime) ?? false;
}

/** Strictly bounded prefix reads test transport; a prefix hash never represents the complete movie. */
export async function probePublicMedia(
  input: NonNullable<CorpusAsset["urls"]>[number],
  allowedOrigins: string[],
  budget = new Budget(8 * 1024 ** 2),
  rangeBytes = 65536,
  timeoutMs = 10000,
) {
  rangeBytes = limit(rangeBytes, 65536, 1024 * 1024);
  timeoutMs = limit(timeoutMs, 10000, 30000);
  if (budget.bytes >= budget.maximum) throw new Failure("network-byte-budget-exhausted");
  const url = publicUrl(input.url);
  if (!allowedOrigins.map(origin).includes(url.origin)) throw new Failure("origin-not-allowed");
  if (input.sha256 !== undefined && !hex.test(input.sha256)) throw new Failure("invalid-asset-digest");
  const signal = AbortSignal.timeout(timeoutMs);
  const head = await fetch(url, {
    method: "HEAD",
    credentials: "omit",
    redirect: "error",
    headers: { "Accept-Encoding": "identity" },
    signal,
  });
  await head.body?.cancel();
  if (head.status !== 200) throw new Failure(`head-http-${head.status}`);
  const headLength = head.headers.get("content-length"),
    headSize = headLength === null ? undefined : Number(headLength);
  const mime = head.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (
    (headSize !== undefined && (!Number.isSafeInteger(headSize) || headSize < 1)) ||
    (input.bytes !== undefined && (!Number.isSafeInteger(input.bytes) || input.bytes < 1)) ||
    mime !== input.mime.toLowerCase() ||
    (input.bytes !== undefined && headSize !== undefined && input.bytes !== headSize)
  )
    throw new Failure("head-media-metadata-mismatch");
  const declaredSize = headSize ?? input.bytes;
  const end = Math.min(declaredSize ?? rangeBytes, rangeBytes) - 1;
  const response = await fetch(url, {
    credentials: "omit",
    redirect: "error",
    headers: { Range: `bytes=0-${end}`, "Accept-Encoding": "identity" },
    signal,
  });
  const ranged = response.status === 206;
  const contentRange = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  let size = ranged ? Number(contentRange?.[2]) : declaredSize;
  let expectedLength = ranged && size !== undefined ? Math.min(size, end + 1) : declaredSize;
  if (
    (!ranged && !(response.status === 200 && (size === undefined || size <= rangeBytes) && /mpegurl$/i.test(mime))) ||
    (ranged &&
      (!Number.isSafeInteger(size) ||
        size! < 1 ||
        Number(contentRange?.[1]) !== expectedLength! - 1 ||
        (declaredSize !== undefined && declaredSize !== size)))
  ) {
    await response.body?.cancel();
    throw new Failure("range-response-mismatch");
  }
  if (
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== mime ||
    (response.headers.get("content-encoding") ?? "identity") !== "identity" ||
    (response.headers.has("content-length") &&
      (!Number.isSafeInteger(Number(response.headers.get("content-length"))) ||
        Number(response.headers.get("content-length")) < 1 ||
        (expectedLength !== undefined && Number(response.headers.get("content-length")) !== expectedLength)))
  ) {
    await response.body?.cancel();
    throw new Failure("range-content-headers-mismatch");
  }
  const bytes = await budget.read(response, expectedLength ?? end + 1);
  size ??= bytes.length;
  expectedLength ??= bytes.length;
  const format = mediaFormat(bytes),
    sha256 = hash(bytes),
    fullBody = bytes.length === size;
  if (
    bytes.length !== expectedLength ||
    (response.headers.has("content-length") && Number(response.headers.get("content-length")) !== bytes.length) ||
    !formatMatches(mime, format)
  )
    throw new Failure("range-content-mismatch");
  if (fullBody && input.sha256 !== undefined && sha256 !== input.sha256) throw new Failure("full-body-digest-mismatch");
  return {
    role: input.role,
    url: url.href,
    status: "passed" as const,
    bytes: size,
    mime,
    format,
    checkedBytes: bytes.length,
    prefixSha256: sha256,
    digestQualification: fullBody ? "full-body" : "prefix-only",
    expectedDigestVerified: fullBody && input.sha256 !== undefined,
    rangeQualified: ranged,
    headContentLengthProvided: headSize !== undefined,
    cacheControl: head.headers.get("cache-control"),
    cors: head.headers.get("access-control-allow-origin"),
    decoded: false,
  };
}

/** Page hashes and a pinned revision permit resumable inventory without scanning a corpus directory. */
export async function readShenronCdnInventory(options: CatalogOptions) {
  const cdn = origin(options.cdnOrigin),
    source = options.sourceOrigin ? origin(options.sourceOrigin) : undefined;
  const maxPages = limit(options.maxPages, 2, 4096),
    maxAssets = limit(options.maxAssets, 16, 256),
    budget = new Budget(limit(options.maxMetadataBytes, 2 * 1024 ** 2, 64 * 1024 ** 2)),
    deadline = Date.now() + limit(options.deadlineMs, 60000, 600000),
    kinds = options.mediaKinds ?? ["video", "image", "audio", "playlist"];
  if (!kinds.length || kinds.some(kind => !["video", "image", "audio", "playlist"].includes(kind)))
    throw new Failure("invalid-catalog-media-kinds");
  const read = async (path: string, expected?: string) => {
    const url = publicUrl(new URL(path, cdn).href);
    if (url.origin !== cdn || !url.pathname.startsWith("/catalog/assets/")) throw new Failure("invalid-catalog-path");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Failure("catalog-deadline-exceeded");
    const response = await fetch(url, {
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(Math.min(10000, remaining)),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Failure(`catalog-http-${response.status}`);
    }
    const bytes = await budget.read(response, 2 * 1024 ** 2);
    if (expected !== undefined && (!hex.test(expected) || hash(bytes) !== expected))
      throw new Failure("catalog-page-digest-mismatch");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  };
  const index = await read("/catalog/assets/index.json");
  if (
    index.schema !== "shenron-public-cdn/v1" ||
    !hex.test(index.revision) ||
    !hex.test(index.inventorySha256) ||
    !Array.isArray(index.files?.pages) ||
    index.files.pages.length > 100000 ||
    !Number.isSafeInteger(index.totalFiles) ||
    index.totalFiles < 0 ||
    !Number.isSafeInteger(index.pageSize) ||
    index.pageSize < 1 ||
    index.pageSize > 500
  )
    throw new Failure("invalid-catalog-index");
  if (options.cursor && options.cursor.revision !== index.revision) throw new Failure("catalog-revision-changed");
  if (
    index.files.pages.reduce((sum: number, descriptor: { count: number }) => sum + descriptor.count, 0) !==
    index.totalFiles
  )
    throw new Failure("catalog-declared-count-mismatch");
  let page = options.cursor?.page ?? 0,
    entry = options.cursor?.entry ?? 0,
    pagesRead = 0,
    entriesVisited = 0,
    matchingMediaEntries = 0;
  if (![page, entry].every(value => Number.isSafeInteger(value) && value >= 0) || page > index.files.pages.length)
    throw new Failure("invalid-catalog-cursor");
  const assets: CorpusAsset[] = [];
  while (
    page < index.files.pages.length &&
    pagesRead < maxPages &&
    (options.visitAllEntries || assets.length < maxAssets) &&
    Date.now() < deadline
  ) {
    const descriptor = index.files.pages[page];
    if (
      typeof descriptor.url !== "string" ||
      !descriptor.url.startsWith(`/catalog/assets/revisions/${index.revision}/`) ||
      !Number.isSafeInteger(descriptor.count) ||
      descriptor.count < 0 ||
      descriptor.count > index.pageSize
    )
      throw new Failure("invalid-catalog-page-descriptor");
    const value = await read(descriptor.url, descriptor.sha256);
    if (
      value.revision !== index.revision ||
      value.page !== page ||
      value.path !== null ||
      value.totalPages !== index.files.pages.length ||
      !Array.isArray(value.entries) ||
      value.entries.length !== descriptor.count ||
      entry > value.entries.length
    )
      throw new Failure("invalid-catalog-page");
    pagesRead++;
    while (entry < value.entries.length && (options.visitAllEntries || assets.length < maxAssets)) {
      const item = value.entries[entry++];
      entriesVisited++;
      if (
        typeof item.path !== "string" ||
        !item.path.startsWith("/") ||
        item.path.startsWith("//") ||
        !Number.isSafeInteger(item.size) ||
        item.size < 0 ||
        typeof item.mime !== "string" ||
        (item.sha256 !== null && !hex.test(item.sha256))
      )
        throw new Failure("invalid-catalog-asset");
      const kind = /mpegurl$/i.test(item.mime) ? "playlist" : item.mime.split("/")[0];
      if (!kinds.includes(kind)) continue;
      matchingMediaEntries++;
      const url = publicUrl(new URL(item.path, cdn).href).href;
      if (assets.length === maxAssets) continue;
      const asset = { url, mime: item.mime, bytes: item.size, ...(item.sha256 ? { sha256: item.sha256 } : {}) };
      assets.push({
        id: `cdn-${hash(item.path).slice(0, 20)}`,
        urls: [
          ...(source
            ? [{ ...asset, role: "http" as const, url: publicUrl(new URL(item.path, source).href).href }]
            : []),
          { ...asset, role: "cdn" },
        ],
      });
    }
    if (entry === value.entries.length) {
      page++;
      entry = 0;
    }
  }
  return {
    assets,
    revision: index.revision,
    inventorySha256: index.inventorySha256,
    declaredTotalFiles: index.totalFiles,
    metadataBytes: budget.bytes,
    pagesRead,
    entriesVisited,
    matchingMediaEntries,
    selectedAssetsTruncated: matchingMediaEntries > assets.length,
    mediaKinds: kinds,
    inventoryComplete: page === index.files.pages.length && !options.cursor,
    nextCursor: page < index.files.pages.length ? { revision: index.revision, page, entry } : null,
    completeCorpusQualified: false,
  };
}

/** Only the public nativeSource projection is used; players, stored headers and embed URLs are ignored. */
export async function readShenronEpisodePage(options: EpisodePageOptions) {
  const site = origin(options.siteOrigin),
    allowed = [site, ...(options.mediaOrigins ?? []).map(origin)],
    pageSize = limit(options.limit, 20, 200),
    offset = options.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new Failure("invalid-episode-offset");
  const series = options.series;
  if (series !== undefined && !/^[A-Z][A-Z0-9_]{0,31}$/.test(series))
    throw new Failure("invalid-episode-series");
  const url = new URL("/api/episodes", site);
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("offset", String(offset));
  if (series !== undefined) url.searchParams.set("series", series);
  const head = await fetch(url, {
    method: "HEAD",
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(10000),
  });
  await head.body?.cancel();
  if (head.status !== 200 || !/^application\/json(?:;|$)/i.test(head.headers.get("content-type") ?? ""))
    throw new Failure(`episode-head-http-${head.status}`);
  const response = await fetch(url, {
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel();
    throw new Failure(`episode-get-http-${response.status}`);
  }
  const budget = new Budget(2 * 1024 ** 2);
  const value = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(await budget.read(response, budget.maximum)),
  );
  if (
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    value.offset !== offset ||
    value.limit !== pageSize ||
    !Array.isArray(value.episodes) ||
    value.episodes.length > pageSize ||
    value.count !== value.episodes.length ||
    (value.count > 0 && offset + value.count > value.total) ||
    (value.count === 0 && offset < value.total)
  )
    throw new Failure("invalid-episode-page");
  const assets: CorpusAsset[] = [];
  const ids = new Set<string>();
  const unavailableEpisodeIds: string[] = [];
  for (const episode of value.episodes) {
    const id = String(episode.id);
    if (!/^\d+$/.test(id) || ids.has(id)) throw new Failure("invalid-public-episode-id");
    if (series !== undefined && episode.series !== series) throw new Failure("episode-series-mismatch");
    ids.add(id);
    const source = episode.nativeSource;
    if (source === null || source === undefined) {
      unavailableEpisodeIds.push(id);
      continue;
    }
    if (typeof source.src !== "string" || typeof source.type !== "string")
      throw new Failure("invalid-public-native-source");
    const media = publicUrl(new URL(source.src, site).href);
    if (
      !allowed.includes(media.origin) ||
      !(
        (source.type === "video/mp4" && media.origin === site && media.pathname === `/api/episodes/${id}/video`) ||
        (source.type === "application/vnd.apple.mpegurl" && media.pathname === `/api/hls/${id}/master.m3u8`)
      )
    )
      throw new Failure("non-canonical-public-native-source");
    assets.push({ id: `episode-${id}`, urls: [{ role: "http", url: media.href, mime: source.type }] });
  }
  return {
    assets,
    declaredTotalEpisodes: value.total as number,
    episodesVisited: value.count as number,
    unavailableSources: unavailableEpisodeIds.length,
    unavailableEpisodeIds,
    ...(series !== undefined ? { series } : {}),
    metadataBytes: budget.bytes,
    endpoint: url.pathname,
    headQualified: true,
    consistency: "mutable-offset-page",
    nextOffset: offset + value.count < value.total ? offset + value.count : null,
    completeCorpusQualified: false,
  };
}

async function readStream(stream: ReadableStream<Uint8Array>, maximum: number, stop: () => void) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum) {
        stop();
        throw new Failure("process-output-budget-exceeded");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}
async function command(executable: string, args: string[], timeoutMs: number, maximum = 1024 * 1024) {
  if (!isAbsolute(executable) || !(await lstat(executable)).isFile()) throw new Failure("qualified-tool-unavailable");
  const environment: Record<string, string> = {};
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"])
    if (process.env[key]) environment[key] = process.env[key]!;
  environment.LD_LIBRARY_PATH = join(dirname(executable), "../lib");
  if (process.env.BUN_CORPUS_WORKER_JOB || args.includes("--worker")) environment.BUN_CORPUS_WORKER_JOB = "1";
  using job =
    process.platform === "win32" ? new (await import("bun:windows")).default.Job({ killOnClose: true }) : null;
  const detached = process.platform !== "win32" && !process.env.BUN_CORPUS_WORKER_JOB;
  const spawn = {
    env: environment,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
    stdin: "ignore" as const,
    detached,
  };
  const child = job ? job.spawn([executable, ...args], spawn) : Bun.spawn([executable, ...args], spawn);
  const stop = () => {
    if (child.exitCode !== null) return;
    if (job) job.terminate();
    else if (detached) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill();
      }
    } else child.kill();
  };
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    stop();
  }, timeoutMs);
  try {
    const [output, _diagnostics, code] = await Promise.all([
      readStream(child.stdout, maximum, stop),
      readStream(child.stderr, 65536, stop),
      child.exited,
    ]);
    if (expired) throw new Failure("process-timeout");
    if (code !== 0) throw new Failure("media-process-failed");
    return output;
  } finally {
    clearTimeout(timer);
    stop();
    await child.exited;
  }
}
function waveEvidence(bytes: Uint8Array) {
  const data = Buffer.from(bytes);
  if (mediaFormat(data) !== "wav" || data.length <= 44) throw new Failure("invalid-pcm-wave");
  let offset = 12;
  while (offset + 24 <= data.length) {
    const length = data.readUInt32LE(offset + 4);
    if (data.toString("ascii", offset, offset + 4) === "fmt ") {
      const pcm = data.readUInt16LE(offset + 8);
      if (
        (pcm !== 1 && !(pcm === 0xfffe && length >= 40 && data.readUInt16LE(offset + 32) === 1)) ||
        data.readUInt16LE(offset + 22) !== 16 ||
        data.readUInt32LE(offset + 12) !== 16000 ||
        data.readUInt16LE(offset + 10) < 1
      )
        throw new Failure("invalid-pcm-wave");
      return { bytes: data.length, channels: data.readUInt16LE(offset + 10), sampleRate: 16000, bitsPerSample: 16 };
    }
    offset += 8 + length + (length % 2);
  }
  throw new Failure("invalid-pcm-wave");
}
async function imageEvidence(bytes: Uint8Array) {
  if (mediaFormat(bytes) !== "png" || bytes.length > 1024 * 1024) throw new Failure("invalid-frame-output");
  const metadata = await new Bun.Image(bytes).metadata();
  if (metadata.width !== 64 || metadata.height !== 36 || metadata.format !== "png")
    throw new Failure("frame-image-metadata-mismatch");
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    bytes: bytes.length,
    sha256: hash(bytes),
  };
}

/** Worker-only local media operations. Inputs are read; all derivatives stay in a disposable private job. */
export async function probeLocalCorpusAsset(asset: CorpusAsset, options: CorpusOptions, work: string) {
  if (!asset.localPath || !isAbsolute(asset.localPath)) throw new Failure("invalid-local-source");
  const path = await realpath(asset.localPath),
    roots = await Promise.all((options.allowedLocalRoots ?? []).map(directory => realpath(directory)));
  if (!roots.some(directory => inside(directory, path)) || !(await lstat(path)).isFile())
    throw new Failure("local-source-not-authorized");
  const actualWork = await realpath(work);
  if (roots.some(directory => inside(directory, actualWork)))
    throw new Failure("work-directory-overlaps-protected-source");
  const sourceInfo = await lstat(path),
    size = sourceInfo.size;
  if (size < 1 || size > 64 * 1024 ** 3) throw new Failure("local-source-size-limit");
  let sourceDigest: string | undefined;
  if (asset.localSha256 !== undefined) {
    if (!hex.test(asset.localSha256)) throw new Failure("invalid-local-digest");
    const hasher = new Bun.CryptoHasher("sha256");
    for await (const bytes of Bun.file(path).stream()) hasher.update(bytes);
    sourceDigest = hasher.digest("hex");
    if (sourceDigest !== asset.localSha256) throw new Failure("local-source-digest-mismatch");
  }
  const timeout = limit(options.timeoutMs, 10000, 30000),
    remuxLimit = limit(options.maxRemuxBytes, 128 * 1024 ** 2, 1024 ** 3),
    remuxFormats = options.ffmpegRemuxFormats ?? ["mp4"];
  if (
    !remuxFormats.length ||
    remuxFormats.length > 3 ||
    new Set(remuxFormats).size !== remuxFormats.length ||
    remuxFormats.some(format => !["mp4", "mkv", "mov"].includes(format))
  )
    throw new Failure("invalid-remux-formats");
  const native: Record<string, Check> = {},
    ffmpeg: Record<string, Check> = {};
  const prefix = await Bun.file(path).slice(0, 64).bytes(),
    format = mediaFormat(prefix);
  const isImage = ["png", "jpeg", "gif", "webp"].includes(format);
  let nativeMetadata: Bun.Video.Metadata | undefined;
  if (typeof Bun.Image !== "function") native.image = { status: "unavailable", code: "native-image-unavailable" };
  else if (isImage)
    native.image = await check(async () =>
      imageEvidence(await new Bun.Image(path).resize(64, 36, { fit: "fill" }).png().bytes()),
    );
  else if (typeof Bun.Video !== "function" || !Bun.Video.available)
    native.video = { status: "unavailable", code: "native-video-unavailable" };
  else {
    native.metadata = await check(async () => {
      nativeMetadata = await new Bun.Video(path).metadata();
      if (
        !nativeMetadata.width ||
        !nativeMetadata.height ||
        !nativeMetadata.codec ||
        !nativeMetadata.container ||
        nativeMetadata.fileBytes !== size
      )
        throw new Failure("native-video-metadata-mismatch");
      return { ...nativeMetadata };
    });
    if (nativeMetadata) {
      const time = Math.min(1, Math.max(0, (nativeMetadata.duration ?? 1) / 2));
      native.frame = await check(async () =>
        imageEvidence(await new Bun.Video(path).frame(time).resize(64, 36, { fit: "fill" }).png().bytes()),
      );
      native.rgba = await check(async () => {
        const pixels = await new Bun.Video(path).frame(time).resize(64, 36, { fit: "fill" }).rgba();
        if (pixels.width !== 64 || pixels.height !== 36 || pixels.channels !== 4 || pixels.data.length !== 64 * 36 * 4)
          throw new Failure("native-frame-rgba-mismatch");
        return { width: pixels.width, height: pixels.height, bytes: pixels.data.length, sha256: hash(pixels.data) };
      });
      native.frames = await check(async () => {
        const frames = await new Bun.Video(path).frames({ start: 0, end: 0.05, step: 0.05, maxFrames: 1 });
        if (frames.length !== 1 || frames[0]!.time < 0) throw new Failure("native-frame-batch-mismatch");
        const metadata = await new Bun.Image(frames[0]!.bytes).metadata();
        if (metadata.width !== nativeMetadata!.width || metadata.height !== nativeMetadata!.height)
          throw new Failure("native-batch-source-resolution-mismatch");
        return { count: 1, width: metadata.width, height: metadata.height, bytes: frames[0]!.bytes.length };
      });
      native.audio = nativeMetadata.audioStreams.length
        ? await check(async () =>
            waveEvidence(await new Bun.Video(path).audio({ start: 0, duration: 0.1, sampleRate: 16000 })),
          )
        : { status: "skipped", code: "no-audio-stream" };
      native.gif = await check(async () => {
        const bytes = await new Bun.Video(path).gif({ start: 0, duration: 0.1, fps: 10, width: 64 });
        const header = Buffer.from(bytes);
        if (mediaFormat(bytes) !== "gif" || bytes.at(-1) !== 0x3b || header.readUInt16LE(6) !== 64)
          throw new Failure("native-gif-content-mismatch");
        return { bytes: bytes.length, width: 64, height: header.readUInt16LE(8), sha256: hash(bytes) };
      });
      native.remux =
        size > remuxLimit
          ? { status: "skipped", code: "remux-byte-budget" }
          : await check(async () => {
              const output = join(work, "native-remux.mp4");
              try {
                const bytes = await new Bun.Video(path).remux(output),
                  metadata = await new Bun.Video(output).metadata();
                if (
                  bytes < 1 ||
                  bytes > remuxLimit ||
                  metadata.width !== nativeMetadata!.width ||
                  metadata.height !== nativeMetadata!.height ||
                  metadata.codec !== nativeMetadata!.codec ||
                  metadata.frameCount !== nativeMetadata!.frameCount
                )
                  throw new Failure("native-remux-metadata-mismatch");
                const before = await lstat(output);
                let refused = false;
                try {
                  await new Bun.Video(path).remux(output);
                } catch {
                  refused = true;
                }
                const after = await lstat(output);
                if (!refused || before.size !== after.size || before.mtimeMs !== after.mtimeMs)
                  throw new Failure("native-remux-overwrite-not-refused");
                return { bytes, codec: metadata.codec, frameCount: metadata.frameCount, overwriteRefused: true };
              } finally {
                await rm(output, { force: true });
              }
            });
    }
  }
  const probe = async (source: string) => {
    const value = JSON.parse(
      (
        await command(
          options.tools!.ffprobe!,
          [
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_entries",
            "stream=index,codec_type,codec_name,width,height,sample_rate,channels,time_base,duration:format=format_name,duration,size",
            "-of",
            "json",
            source,
          ],
          timeout,
          65536,
        )
      ).toString(),
    );
    if (!Array.isArray(value.streams) || !value.streams.length || typeof value.format?.format_name !== "string")
      throw new Failure("ffprobe-media-metadata-mismatch");
    return value as {
      streams: {
        codec_type: string;
        codec_name: string;
        width?: number;
        height?: number;
        sample_rate?: string;
        channels?: number;
        time_base?: string;
        duration?: string;
      }[];
      format: { format_name: string; size: string; duration?: string };
    };
  };
  let probeMetadata: Awaited<ReturnType<typeof probe>> | undefined;
  if (options.tools?.ffprobe)
    ffmpeg.metadata = await check(async () => {
      probeMetadata = await probe(path);
      if (Number(probeMetadata.format.size) !== size) throw new Failure("ffprobe-source-size-mismatch");
      return probeMetadata;
    });
  else ffmpeg.metadata = { status: "unavailable", code: "qualified-ffprobe-not-selected" };
  if (options.tools?.ffmpeg && probeMetadata) {
    if (probeMetadata.streams.some(stream => stream.codec_type === "video"))
      ffmpeg.frame = await check(async () =>
        imageEvidence(
          await command(
            options.tools!.ffmpeg!,
            [
              "-v",
              "error",
              "-threads",
              "1",
              "-filter_threads",
              "1",
              "-protocol_whitelist",
              "file,pipe",
              "-i",
              path,
              "-map",
              "0:v:0",
              "-frames:v",
              "1",
              "-vf",
              "scale=64:36",
              "-f",
              "image2pipe",
              "-c:v",
              "png",
              "-threads:v",
              "1",
              "pipe:1",
            ],
            timeout,
          ),
        ),
      );
    if (probeMetadata.streams.some(stream => stream.codec_type === "audio"))
      ffmpeg.audio = await check(async () =>
        waveEvidence(
          await command(
            options.tools!.ffmpeg!,
            [
              "-v",
              "error",
              "-threads",
              "1",
              "-protocol_whitelist",
              "file,pipe",
              "-i",
              path,
              "-map",
              "0:a:0",
              "-t",
              "0.1",
              "-ar",
              "16000",
              "-c:a",
              "pcm_s16le",
              "-f",
              "wav",
              "pipe:1",
            ],
            timeout,
          ),
        ),
      );
    for (const extension of remuxFormats)
      ffmpeg[extension === "mp4" ? "remux" : `remux_${extension}`] =
        size > remuxLimit
          ? { status: "skipped", code: "remux-byte-budget" }
          : await check(async () => {
              const output = join(work, `ffmpeg-remux.${extension}`);
              try {
                await command(
                  options.tools!.ffmpeg!,
                  [
                    "-v",
                    "error",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-i",
                    path,
                    "-map",
                    "0:v?",
                    "-map",
                    "0:a?",
                    "-map_chapters",
                    "-1",
                    "-c",
                    "copy",
                    "-n",
                    output,
                  ],
                  timeout,
                );
                const restored = await probe(output),
                  bytes = (await lstat(output)).size,
                  selected = probeMetadata!.streams.filter(stream => ["audio", "video"].includes(stream.codec_type));
                const signatures = (streams: typeof selected) =>
                  streams
                    .map(stream =>
                      JSON.stringify([
                        stream.codec_type,
                        stream.codec_name,
                        stream.width,
                        stream.height,
                        stream.sample_rate,
                        stream.channels,
                        extension === "mkv" ? undefined : stream.time_base,
                      ]),
                    )
                    .sort();
                if (
                  bytes < 1 ||
                  bytes > remuxLimit ||
                  Number(restored.format.size) !== bytes ||
                  JSON.stringify(signatures(restored.streams)) !== JSON.stringify(signatures(selected)) ||
                  !Number.isFinite(Number(restored.format.duration)) ||
                  !Number.isFinite(Number(probeMetadata!.format.duration)) ||
                  Math.abs(Number(restored.format.duration) - Number(probeMetadata!.format.duration)) > 0.1
                )
                  throw new Failure("ffmpeg-remux-codecs-mismatch");
                return {
                  bytes,
                  sourceBytes: size,
                  duration: Number(restored.format.duration),
                  sourceDuration: Number(probeMetadata!.format.duration),
                  container: restored.format.format_name,
                  codecs: restored.streams.map(stream => stream.codec_name),
                  timeBases: restored.streams.map(stream => stream.time_base),
                  sourceTimeBases: selected.map(stream => stream.time_base),
                  timeBaseComparison: extension === "mkv" ? "container-rescale-with-duration-check" : "preserved",
                  streamSelection: "video-and-audio-only",
                  chaptersPreserved: false,
                };
              } finally {
                await rm(output, { force: true });
              }
            });
  }
  let mpv: Check = { status: "unavailable", code: "qualified-mpv-not-selected" };
  if (
    options.tools?.mpv &&
    options.tools.mpvReceipt &&
    probeMetadata?.streams.some(stream => stream.codec_type === "video")
  )
    mpv = await check(async () => {
      const receiptFile = Bun.file(options.tools!.mpvReceipt!);
      if (receiptFile.size < 1 || receiptFile.size > 1024 * 1024) throw new Failure("mpv-receipt-size-limit");
      const receiptBytes = await receiptFile.bytes();
      const receipt = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(receiptBytes));
      const expected = receipt.files?.[`bin/${basename(options.tools!.mpv!)}`];
      if (
        receipt.target !== mediaSDKHostTarget() ||
        receipt.api?.major !== 2 ||
        receipt.api?.initialized !== 0 ||
        receipt.probes?.decode?.code !== 0 ||
        !hex.test(expected?.sha256)
      )
        throw new Failure("mpv-qualification-receipt-mismatch");
      const bytes = await Bun.file(options.tools!.mpv!).bytes();
      if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256)
        throw new Failure("mpv-qualified-binary-changed");
      const output = (
        await command(
          options.tools!.mpv!,
          [
            "--no-config",
            "--vo=null",
            "--ao=null",
            "--hwdec=no",
            "--vd-lavc-threads=1",
            "--frames=1",
            "--term-playing-msg=CORPUS_MEDIA|${video-codec}|${width}|${height}",
            path,
          ],
          timeout,
          65536,
        )
      ).toString();
      const match = /CORPUS_MEDIA\|([^|\r\n]+)\|(\d+)\|(\d+)/.exec(output);
      const frameOutput = /\bVO:\s*\[null\]\s*(\d+)x(\d+)/.exec(output);
      if (
        !match ||
        Number(match[2]) < 1 ||
        Number(match[3]) < 1 ||
        !frameOutput ||
        Number(frameOutput[1]) < 1 ||
        Number(frameOutput[2]) < 1
      )
        throw new Failure("mpv-decoded-frame-metadata-missing");
      return {
        codec: match[1],
        width: Number(match[2]),
        height: Number(match[3]),
        videoOutput: "null",
        decodedFrameOutputInitialized: true,
        hardwareDecodeQualified: false,
        receiptSha256: hash(receiptBytes),
      };
    });
  const finalInfo = await lstat(path);
  if (finalInfo.size !== size || finalInfo.mtimeMs !== sourceInfo.mtimeMs)
    throw new Failure("local-source-changed-during-qualification");
  return {
    status: "passed" as const,
    reference: "private-local-input",
    bytes: size,
    format,
    ...(sourceDigest ? { sha256: sourceDigest, expectedDigestVerified: true } : { expectedDigestVerified: false }),
    native,
    ffmpeg,
    mpv,
  };
}

async function localWorker(asset: CorpusAsset, options: CorpusOptions, store: string) {
  const work = await mkdtemp(join(store, "corpus-job-"));
  if (!inside(store, work) || dirname(work) !== store) throw new Failure("unsafe-job-cleanup-path");
  const request = join(work, "request.json");
  const selected: CorpusOptions = { ...options, assets: [], allowedOrigins: [] };
  try {
    await Bun.write(
      request,
      JSON.stringify({
        asset: { id: asset.id, localPath: asset.localPath, localSha256: asset.localSha256 },
        options: selected,
        work,
      }),
      { mode: 0o600 },
    );
    const bytes = await command(
      process.execPath,
      [import.meta.path, "--worker", request],
      limit(options.workerTimeoutMs, 30000, 120000),
      1024 * 1024,
    );
    return JSON.parse(bytes.toString());
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function qualifyShenronCorpus(options: CorpusOptions) {
  const maxAssets = limit(options.maxAssets, 16, 256),
    rangeBytes = limit(options.rangeBytes, 65536, 1024 * 1024),
    timeout = limit(options.timeoutMs, 10000, 30000),
    budget = new Budget(limit(options.maxNetworkBytes, 8 * 1024 ** 2, 32 * 1024 ** 2)),
    deadlineBudget = limit(options.deadlineMs, 60000, 600000),
    deadline = Date.now() + deadlineBudget;
  if (!Array.isArray(options.assets) || options.assets.length > maxAssets || !Array.isArray(options.allowedOrigins))
    throw new Failure("invalid-bounded-corpus-input");
  const store = resolve(options.workDirectory ?? defaultStore());
  for (const sourceRoot of options.allowedLocalRoots ?? []) {
    if (!isAbsolute(sourceRoot) || inside(await realpath(sourceRoot), store))
      throw new Failure("work-directory-overlaps-protected-source");
  }
  await mkdir(store, { recursive: true, mode: 0o700 });
  const actualStore = await realpath(store);
  const assets = [];
  for (const asset of options.assets) {
    if (Date.now() >= deadline) break;
    if (!asset || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(asset.id) || (asset.urls?.length ?? 0) > 8)
      throw new Failure("invalid-corpus-asset");
    const urls = [];
    for (const url of asset.urls ?? []) {
      if (Date.now() >= deadline) {
        urls.push({ role: url.role, status: "skipped" as const, code: "corpus-deadline-exceeded" });
        continue;
      }
      try {
        urls.push(
          await probePublicMedia(
            url,
            options.allowedOrigins,
            budget,
            rangeBytes,
            Math.min(timeout, Math.max(1, deadline - Date.now())),
          ),
        );
      } catch (error) {
        urls.push({ role: url.role, ...failed(error) });
      }
    }
    const passed = urls.filter(item => item.status === "passed" && "prefixSha256" in item);
    const parity: Check =
      passed.length < 2
        ? { status: "skipped", code: "fewer-than-two-qualified-origins" }
        : passed.every(item => item.prefixSha256 === passed[0]!.prefixSha256 && item.bytes === passed[0]!.bytes)
          ? { status: "passed", evidence: { origins: passed.length, comparison: "prefix-and-declared-size-only" } }
          : { status: "failed", code: "origin-prefix-parity-mismatch" };
    let source: Awaited<ReturnType<typeof probeLocalCorpusAsset>> | Check = {
      status: "skipped",
      code: "no-authorized-local-source",
    };
    if (asset.localPath) {
      try {
        source =
          Date.now() >= deadline
            ? { status: "skipped", code: "corpus-deadline-exceeded" }
            : await localWorker(
                asset,
                {
                  ...options,
                  timeoutMs: timeout,
                  workerTimeoutMs: Math.min(
                    limit(options.workerTimeoutMs, 30000, 120000),
                    Math.max(1, deadline - Date.now()),
                  ),
                },
                actualStore,
              );
      } catch (error) {
        source = failed(error);
      }
    }
    assets.push({
      id: asset.id,
      publicationQualified: asset.publicationQualified ?? null,
      source,
      urls,
      originParity: parity,
    });
  }
  const checks = { passed: 0, failed: 0, skipped: 0, unavailable: 0 };
  const countChecks = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if ("status" in value && typeof value.status === "string" && Object.hasOwn(checks, value.status))
      checks[value.status as keyof typeof checks]++;
    for (const child of Object.values(value)) countChecks(child);
  };
  countChecks(assets);
  const report = {
    schema: "shenron-video-corpus-qualification/v1",
    observedAt: new Date().toISOString(),
    runtime: { version: Bun.version, revision: Bun.revision, platform: process.platform, arch: process.arch },
    scope: "selected-assets",
    completeCorpusQualified: false,
    sourceStoresModified: false,
    remoteMediaFilesWritten: false,
    remoteWholeVideoObjectsRead: assets.reduce(
      (sum, asset) =>
        sum +
        asset.urls.filter(
          url =>
            "mime" in url &&
            typeof url.mime === "string" &&
            url.mime.startsWith("video/") &&
            "digestQualification" in url &&
            url.digestQualification === "full-body",
        ).length,
      0,
    ),
    cookiesUsed: false,
    checkedAssets: assets.length,
    requestedAssets: options.assets.length,
    remainingAssets: options.assets.length - assets.length,
    deadlineMs: deadlineBudget,
    checks,
    networkBodyBytes: budget.bytes,
    assets,
  };
  if (JSON.stringify(report).length > 1024 * 1024) throw new Failure("qualification-report-size-limit");
  return report;
}

export async function writePrivateCorpusReport(path: string, report: unknown, store = defaultStore()) {
  if (!isAbsolute(path) || !inside(resolve(store), resolve(path)))
    throw new Failure("private-new-report-path-required");
  const body = JSON.stringify(report, null, 2) + "\n";
  if (Buffer.byteLength(body) > 1024 * 1024) throw new Failure("qualification-report-size-limit");
  await mkdir(store, { recursive: true, mode: 0o700 });
  const actualStore = await realpath(store);
  let parent = resolve(store);
  for (const component of relative(parent, resolve(dirname(path)))
    .split(/[\\/]/)
    .filter(Boolean)) {
    parent = join(parent, component);
    const existing = await lstat(parent).catch(error => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (existing?.isSymbolicLink()) throw new Failure("private-report-parent-escaped");
    if (!existing) await mkdir(parent, { mode: 0o700 });
    if (!inside(actualStore, await realpath(parent))) throw new Failure("private-report-parent-escaped");
  }
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(body);
  } finally {
    await file.close();
  }
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({
      args: Bun.argv.slice(2),
      options: {
        worker: { type: "string" },
        manifest: { type: "string" },
        report: { type: "string" },
        catalog: { type: "string" },
        episodes: { type: "string" },
        "media-origin": { type: "string", multiple: true },
        "episode-limit": { type: "string" },
        "episode-offset": { type: "string" },
        "episode-series": { type: "string" },
        "source-origin": { type: "string" },
        "source-env": { type: "string" },
        "sha256-env": { type: "string" },
        "max-remux-bytes": { type: "string" },
        "ffmpeg-remux-formats": { type: "string" },
        "worker-timeout-ms": { type: "string" },
        "timeout-ms": { type: "string" },
        "deadline-ms": { type: "string" },
        "catalog-revision": { type: "string" },
        "catalog-page": { type: "string" },
        "catalog-entry": { type: "string" },
        "catalog-max-pages": { type: "string" },
        "catalog-max-assets": { type: "string" },
        "catalog-max-metadata-bytes": { type: "string" },
        "catalog-deadline-ms": { type: "string" },
        "catalog-inventory-only": { type: "boolean" },
        help: { type: "boolean" },
      },
      strict: true,
    });
    if (values.help)
      console.log(
        "shenron-video-corpus --manifest PRIVATE_JSON --report PRIVATE_NEW_JSON | --episodes SITE_ORIGIN [--media-origin ORIGIN] [--episode-series SERIES] [--episode-limit N] [--episode-offset N] --report PRIVATE_NEW_JSON | --catalog CDN_ORIGIN [--source-origin ORIGIN] [--catalog-max-pages N] [--catalog-max-assets N] [--catalog-max-metadata-bytes N] [--catalog-deadline-ms N] [--catalog-inventory-only] [--catalog-revision SHA --catalog-page N --catalog-entry N] --report PRIVATE_NEW_JSON | --source-env ENV_NAME [--sha256-env ENV_NAME] [--max-remux-bytes N] [--ffmpeg-remux-formats mp4,mkv,mov] [--worker-timeout-ms N] [--timeout-ms N] --report PRIVATE_NEW_JSON\n--deadline-ms N bounds asset checks (default 60000; maximum 600000). Episode series uses the catalogue's uppercase code (for example DBS_BEERUS); missing native sources remain unavailable. CLI catalogs select video and playlists; inventory-only reads hashed metadata pages and sends no media requests. Reports cover selected assets; catalog cursors and source publication qualification remain separate. No cookies, corpus scans or media files fetched for display.",
      );
    else if (values.worker) {
      try {
        const { asset, options, work } = await Bun.file(values.worker).json();
        console.log(JSON.stringify(await probeLocalCorpusAsset(asset, options, work)));
      } catch (error) {
        console.log(JSON.stringify(failed(error)));
      }
    } else {
      if (values["episode-series"] !== undefined && !values.episodes)
        throw new Failure("episode-series-requires-episodes");
      let inventory:
        | Awaited<ReturnType<typeof readShenronCdnInventory>>
        | Awaited<ReturnType<typeof readShenronEpisodePage>>
        | undefined;
      let options: CorpusOptions;
      if (values.manifest) {
        const manifest = Bun.file(values.manifest);
        if (manifest.size < 1 || manifest.size > 1024 * 1024) throw new Failure("corpus-manifest-size-limit");
        options = await manifest.json();
      } else if (values.episodes) {
        inventory = await readShenronEpisodePage({
          siteOrigin: values.episodes,
          mediaOrigins: values["media-origin"],
          series: values["episode-series"],
          ...(values["episode-limit"] ? { limit: Number(values["episode-limit"]) } : {}),
          ...(values["episode-offset"] ? { offset: Number(values["episode-offset"]) } : {}),
        });
        options = {
          assets: inventory.assets,
          maxAssets: 200,
          allowedOrigins: [values.episodes, ...(values["media-origin"] ?? [])],
        };
      } else if (values.catalog) {
        const hasCursor = [values["catalog-revision"], values["catalog-page"], values["catalog-entry"]].some(
          value => value !== undefined,
        );
        if (hasCursor && (!values["catalog-revision"] || !values["catalog-page"] || !values["catalog-entry"]))
          throw new Failure("complete-catalog-cursor-required");
        inventory = await readShenronCdnInventory({
          cdnOrigin: values.catalog,
          sourceOrigin: values["source-origin"],
          ...(values["catalog-max-pages"] ? { maxPages: Number(values["catalog-max-pages"]) } : {}),
          ...(values["catalog-max-assets"] ? { maxAssets: Number(values["catalog-max-assets"]) } : {}),
          ...(values["catalog-max-metadata-bytes"]
            ? { maxMetadataBytes: Number(values["catalog-max-metadata-bytes"]) }
            : {}),
          ...(values["catalog-deadline-ms"] ? { deadlineMs: Number(values["catalog-deadline-ms"]) } : {}),
          mediaKinds: ["video", "playlist"],
          visitAllEntries: values["catalog-inventory-only"],
          ...(hasCursor
            ? {
                cursor: {
                  revision: values["catalog-revision"]!,
                  page: Number(values["catalog-page"]),
                  entry: Number(values["catalog-entry"]),
                },
              }
            : {}),
        });
        options = {
          assets: values["catalog-inventory-only"] ? [] : inventory.assets,
          allowedOrigins: [values.catalog, ...(values["source-origin"] ? [values["source-origin"]] : [])],
          ...(values["catalog-max-assets"] ? { maxAssets: Number(values["catalog-max-assets"]) } : {}),
        };
      } else if (values["source-env"]) {
        const path = process.env[values["source-env"]];
        if (!path) throw new Failure("selected-source-environment-unavailable");
        options = {
          assets: [
            {
              id: "authorized-local-source",
              localPath: path,
              localSha256: values["sha256-env"] ? process.env[values["sha256-env"]] : undefined,
              publicationQualified: false,
            },
          ],
          allowedOrigins: [],
          allowedLocalRoots: [dirname(path)],
          ...(values["max-remux-bytes"] ? { maxRemuxBytes: Number(values["max-remux-bytes"]) } : {}),
          ...(values["ffmpeg-remux-formats"]
            ? { ffmpegRemuxFormats: values["ffmpeg-remux-formats"].split(",") as CorpusOptions["ffmpegRemuxFormats"] }
            : {}),
          ...(values["worker-timeout-ms"] ? { workerTimeoutMs: Number(values["worker-timeout-ms"]) } : {}),
          ...(values["timeout-ms"] ? { timeoutMs: Number(values["timeout-ms"]) } : {}),
          tools: {
            ffmpeg: process.env.BUN_VIDEO_FFMPEG,
            ffprobe: process.env.BUN_VIDEO_FFPROBE,
            mpv: process.env.BUN_VIDEO_MPV,
            mpvReceipt: process.env.BUN_VIDEO_MPV_RECEIPT,
          },
        };
      } else throw new Failure("explicit-corpus-input-required");
      if (values["deadline-ms"]) options.deadlineMs = Number(values["deadline-ms"]);
      if (values["timeout-ms"]) options.timeoutMs = Number(values["timeout-ms"]);
      if (
        !values.report ||
        !isAbsolute(values.report) ||
        !inside(resolve(defaultStore()), resolve(values.report)) ||
        (await Bun.file(values.report).exists())
      )
        throw new Failure("private-new-report-path-required");
      const report = {
        ...(await qualifyShenronCorpus(options)),
        ...(inventory ? { inventory: { ...inventory, assets: undefined, selectedAssets: inventory.assets } } : {}),
      };
      if (JSON.stringify(report).length > 1024 * 1024) throw new Failure("qualification-report-size-limit");
      await writePrivateCorpusReport(values.report, report);
      console.log(
        JSON.stringify({
          report: values.report,
          checkedAssets: report.checkedAssets,
          networkBodyBytes: report.networkBodyBytes,
          checks: report.checks,
          completeCorpusQualified: false,
        }),
      );
      if (report.checks.failed > 0) process.exitCode = 1;
    }
  } catch (error) {
    console.error(JSON.stringify(failed(error)));
    process.exitCode = 1;
  }
}
