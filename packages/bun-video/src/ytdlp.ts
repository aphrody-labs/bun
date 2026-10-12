import { Python } from "bun:python";
import { resolve } from "node:path";

export interface YtDlpOptions {
  readonly download?: boolean;
  readonly output?: string;
  readonly format?: string;
  readonly quiet?: boolean;
  readonly noWarnings?: boolean;
  readonly [key: string]: unknown;
}

export interface YtDlpRequest {
  readonly url: string;
  readonly options?: YtDlpOptions;
  readonly vendorRoot?: string;
  readonly signal?: AbortSignal;
}

export interface YtDlpResult {
  readonly id?: string;
  readonly title?: string;
  readonly webpage_url?: string;
  readonly formats?: readonly Record<string, unknown>[];
  readonly entries?: readonly Record<string, unknown>[];
  readonly [key: string]: unknown;
}

function validate(request: YtDlpRequest): void {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new TypeError("yt-dlp URL must be absolute");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new TypeError("yt-dlp accepts only HTTP(S) URLs without credentials");
}

/** Run the vendored yt-dlp Python package through Bun's in-process CPython host. */
export async function runYtDlp(request: YtDlpRequest): Promise<YtDlpResult> {
  validate(request);
  request.signal?.throwIfAborted();
  const root = resolve(request.vendorRoot ?? new URL("../vendor/yt-dlp", import.meta.url).pathname);
  const options = { quiet: true, no_warnings: true, ...request.options };
  const code = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(root)})`,
    "from yt_dlp import YoutubeDL",
    `__bun_ytdlp_options = json.loads(${JSON.stringify(JSON.stringify(options))})`,
    `__bun_ytdlp_url = json.loads(${JSON.stringify(JSON.stringify(request.url))})`,
    "with YoutubeDL(__bun_ytdlp_options) as __bun_ytdlp:",
    `    __bun_ytdlp_result = __bun_ytdlp.extract_info(__bun_ytdlp_url, download=${options.download === true ? "True" : "False"})`,
  ].join("\n");
  await using py = await Python.async();
  await py.run(code);
  request.signal?.throwIfAborted();
  return (await py.evalJSON("__bun_ytdlp_result")) as YtDlpResult;
}

export async function extractYtDlp(url: string, options: YtDlpOptions = {}): Promise<YtDlpResult> {
  return await runYtDlp({ url, options: { skip_download: true, ...options } });
}

export async function listYtDlpFormats(url: string, options: YtDlpOptions = {}): Promise<readonly Record<string, unknown>[]> {
  const result = await extractYtDlp(url, options);
  return result.formats ?? [];
}

export async function downloadYtDlp(url: string, output: string, options: YtDlpOptions = {}): Promise<YtDlpResult> {
  return await runYtDlp({ url, options: { outtmpl: output, download: true, ...options } });
}

export async function extractYtDlpPlaylist(url: string, options: YtDlpOptions = {}): Promise<readonly Record<string, unknown>[]> {
  const result = await extractYtDlp(url, { extract_flat: true, ...options });
  return result.entries ?? [];
}
