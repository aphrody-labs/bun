/// <reference path="./media-runtime.d.ts" />
import { basename, dirname, join, resolve } from "node:path";

export interface YtDlpOptions {
  readonly download?: boolean;
  readonly output?: string;
  readonly format?: string;
  readonly quiet?: boolean;
  readonly noWarnings?: boolean;
  readonly no_warnings?: boolean;
  readonly skipDownload?: boolean;
  readonly skip_download?: boolean;
  readonly extractFlat?: boolean | string;
  readonly extract_flat?: boolean | string;
  readonly noPlaylist?: boolean;
  readonly noplaylist?: boolean;
  readonly cookieFile?: string;
  readonly cookiefile?: string;
  readonly cookiesFromBrowser?: readonly unknown[];
  readonly cookiesfrombrowser?: readonly unknown[];
  readonly ffmpegLocation?: string;
  readonly ffmpeg_location?: string;
  readonly socketTimeout?: number;
  readonly socket_timeout?: number;
  readonly httpHeaders?: Readonly<Record<string, string>>;
  readonly http_headers?: Readonly<Record<string, string>>;
  readonly outtmpl?: string | Readonly<Record<string, string>>;
  readonly js_runtimes?: Readonly<Record<string, { readonly path?: string }>>;
  readonly [key: string]: unknown;
}

export interface YtDlpBridgeOptions {
  readonly vendorRoot?: string;
  readonly signal?: AbortSignal;
}

export interface YtDlpExtractorMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly module: string;
  readonly urlPattern: string | null;
  readonly working: boolean;
}

export interface YtDlpRuntimeInfo {
  readonly available: boolean;
  readonly bunVersion: string;
  readonly bunRevision: string;
  readonly pythonVersion?: string;
  readonly ytDlpVersion?: string;
  readonly vendorRoot: string;
  readonly hostLibraryPath: string | null;
  readonly libpythonPath: string | null;
  readonly buv: {
    readonly executable: string | null;
    readonly runtimePath: string | null;
    readonly configPath: string | null;
  };
  readonly error?: string;
}

const aliases: Readonly<Record<string, string>> = {
  output: "outtmpl",
  noWarnings: "no_warnings",
  skipDownload: "skip_download",
  extractFlat: "extract_flat",
  noPlaylist: "noplaylist",
  cookieFile: "cookiefile",
  cookiesFromBrowser: "cookiesfrombrowser",
  ffmpegLocation: "ffmpeg_location",
  socketTimeout: "socket_timeout",
  httpHeaders: "http_headers",
  mergeOutputFormat: "merge_output_format",
  playlistItems: "playlist_items",
  writeInfoJson: "writeinfojson",
  writeSubtitles: "writesubtitles",
  writeAutoSubtitles: "writeautomaticsub",
  subtitlesLangs: "subtitleslangs",
  proxyUrl: "proxy",
  userAgent: "user_agent",
  downloadArchive: "download_archive",
  maxDownloads: "max_downloads",
  ageLimit: "age_limit",
};

/** Snake-case options win if their compatibility alias is supplied as well. Unknown yt-dlp options stay intact. */
export function normalizeYtDlpOptions(options: YtDlpOptions = {}): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    const target = aliases[key] ?? key;
    if (target !== key && Object.hasOwn(options, target)) continue;
    normalized[target] = value;
  }
  return normalized;
}

async function vendorRoot(options: YtDlpBridgeOptions): Promise<string> {
  const explicit = options.vendorRoot ?? Bun.env.BUN_VIDEO_YTDLP_VENDOR_ROOT;
  if (explicit) return resolve(explicit);
  if (Bun.env.BUN_VIDEO_PACKAGE_ROOT) return resolve(Bun.env.BUN_VIDEO_PACKAGE_ROOT, "packages", "yt-dlp");
  if (Bun.isStandaloneExecutable) {
    const vendor = await import("bun-video:ytdlp-vendor");
    return vendor.vendorRoot;
  }
  return Bun.fileURLToPath(new URL("../packages/yt-dlp", import.meta.url));
}

function bunExecutable(): string {
  return Bun.env.BUN_VIDEO_BUN_EXECUTABLE ?? Bun.which("bun") ?? process.execPath;
}

// Keep the CPython owner on its initializing thread. Async sessions attach and detach;
// finalizing between calls can terminate or corrupt CPython extension-module state.
let pythonOwner: import("bun:python").Python | undefined;
function retainPythonOwner(Python: typeof import("bun:python").Python): void {
  if (pythonOwner) return;
  pythonOwner = Python.open();
  process.once("exit", () => pythonOwner?.close());
}

/** Each call owns its namespace; raw options/results are never printed or persisted here. */
async function runBridge<T>(options: YtDlpBridgeOptions, body: string): Promise<T> {
  options.signal?.throwIfAborted();
  const root = await vendorRoot(options);
  if (!(await Bun.file(join(root, "yt_dlp", "__init__.py")).exists()))
    throw new Error("Vendored yt-dlp package is missing");
  const { Python } = await import("bun:python");
  retainPythonOwner(Python);
  await using py = await Python.async();
  const name = `__bun_ytdlp_${crypto.randomUUID().replaceAll("-", "")}`;
  const script = [
    "import json, sys, os",
    "sys.dont_write_bytecode = True",
    `__vendor_root = ${JSON.stringify(root)}`,
    "if __vendor_root not in sys.path: sys.path.insert(0, __vendor_root)",
    "import yt_dlp",
    "if os.path.commonpath([os.path.realpath(yt_dlp.__file__), os.path.realpath(__vendor_root)]) != os.path.realpath(__vendor_root):",
    "    raise RuntimeError('Loaded yt-dlp package does not match the selected vendor root')",
    body,
  ].join("\n");
  try {
    await py.run(`${name} = {}\nexec(${JSON.stringify(script)}, ${name})`);
    options.signal?.throwIfAborted();
    return await py.evalJSON<T>(`${name}['__result']`);
  } finally {
    await py.run(`globals().pop(${JSON.stringify(name)}, None)`);
  }
}

export async function ytDlpRuntimeInfo(options: YtDlpBridgeOptions = {}): Promise<YtDlpRuntimeInfo> {
  const root = await vendorRoot(options);
  let hostLibraryPath: string | null = null;
  let libpythonPath: string | null = null;
  let runtimePath = Bun.env.BUV_RUNTIME ? resolve(Bun.env.BUV_RUNTIME) : null;
  let candidateRuntimePath = runtimePath;
  let configPath: string | null = null;
  let error: string | undefined;
  let versions: { pythonVersion: string; ytDlpVersion: string } | undefined;
  try {
    const bridge = await import("bun:python");
    hostLibraryPath = bridge.pythonHostLibraryPath();
    libpythonPath = bridge.buvLibpython();
    if (!candidateRuntimePath && libpythonPath) {
      const parent = dirname(libpythonPath);
      candidateRuntimePath =
        process.platform === "win32" && basename(parent).toLowerCase() !== "bin" ? parent : dirname(parent);
    }
    if (candidateRuntimePath) {
      const candidate = join(candidateRuntimePath, "share", "buv", "manifest.json");
      if (await Bun.file(candidate).exists()) {
        configPath = candidate;
        runtimePath = candidateRuntimePath;
      }
    }
    versions = await runBridge(
      options,
      "from yt_dlp.version import __version__\n__result = {'pythonVersion': sys.version, 'ytDlpVersion': __version__}",
    );
  } catch (cause) {
    options.signal?.throwIfAborted();
    error = cause instanceof Error ? cause.message : "Native Python host unavailable";
  }
  return {
    available: versions !== undefined,
    bunVersion: Bun.version,
    bunRevision: Bun.revision,
    vendorRoot: root,
    hostLibraryPath,
    libpythonPath,
    buv: { executable: Bun.which("buv"), runtimePath, configPath },
    ...versions,
    ...(error ? { error } : {}),
  };
}

export async function listYtDlpExtractors(
  options: YtDlpBridgeOptions & { ageLimit?: number } = {},
): Promise<readonly YtDlpExtractorMetadata[]> {
  if (options.ageLimit !== undefined && (!Number.isSafeInteger(options.ageLimit) || options.ageLimit < 0))
    throw new RangeError("Invalid extractor age limit");
  return runBridge(
    options,
    [
      "from yt_dlp.extractor import gen_extractors, list_extractors",
      options.ageLimit === undefined
        ? "__extractors = gen_extractors()"
        : `__extractors = list_extractors(${options.ageLimit})`,
      "__result = [{'id': ie.ie_key(), 'name': ie.IE_NAME, 'description': getattr(ie, 'IE_DESC', None) if isinstance(getattr(ie, 'IE_DESC', None), str) else None, 'module': type(ie).__module__, 'urlPattern': getattr(ie, '_VALID_URL', None), 'working': ie.working()} for ie in __extractors]",
    ].join("\n"),
  );
}

function validateCliArguments(args: readonly string[]): void {
  if (!Array.isArray(args) || !args.every(value => typeof value === "string" && !value.includes("\0")))
    throw new TypeError("yt-dlp arguments must be strings without NUL");
}

/** CLI parsing ignores ambient config; explicit config locations remain caller-owned. */
export async function parseYtDlpOptions(
  args: readonly string[],
  options: YtDlpBridgeOptions = {},
): Promise<{ urls: string[]; options: Record<string, unknown> }> {
  validateCliArguments(args);
  return runBridge(
    options,
    [
      "import io, contextlib",
      `__args = json.loads(${JSON.stringify(JSON.stringify(["--ignore-config", ...args, "--no-js-runtimes", "--js-runtimes", `bun:${bunExecutable()}`]))})`,
      "with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):",
      "    try:",
      "        __parsed = yt_dlp.parse_options(__args)",
      "    except SystemExit as __exit:",
      "        raise ValueError('yt-dlp argument parsing failed with exit code ' + str(__exit.code)) from None",
      "def __plain(value):",
      "    if isinstance(value, dict): return {str(k): __plain(v) for k,v in value.items()}",
      "    if isinstance(value, (list, tuple, set)): return [__plain(v) for v in value]",
      "    if value is None or isinstance(value, (str, int, float, bool)): return value",
      "    return str(value)",
      "__result = {'urls': __parsed.urls, 'options': __plain(__parsed.ydl_opts)}",
    ].join("\n"),
  );
}

/** Full upstream CLI executes inside Bun's native Python session. Captured output may contain private URLs. */
export async function runYtDlpCli(
  args: readonly string[],
  options: YtDlpBridgeOptions = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  validateCliArguments(args);
  return runBridge(
    options,
    [
      "import io, contextlib",
      "from yt_dlp.globals import IN_CLI",
      `__args = json.loads(${JSON.stringify(JSON.stringify(["--ignore-config", ...args, "--no-js-runtimes", "--js-runtimes", `bun:${bunExecutable()}`]))})`,
      "__stdout, __stderr = io.StringIO(), io.StringIO()",
      "__code = 0",
      "__previous_in_cli = IN_CLI.value",
      "try:",
      "    with contextlib.redirect_stdout(__stdout), contextlib.redirect_stderr(__stderr):",
      "        try:",
      "            yt_dlp.main(__args)",
      "        except SystemExit as __exit:",
      "            __code = __exit.code if isinstance(__exit.code, int) else (0 if __exit.code is None else 1)",
      "finally:",
      "    IN_CLI.value = __previous_in_cli",
      "__result = {'exitCode': __code, 'stdout': __stdout.getvalue(), 'stderr': __stderr.getvalue()}",
    ].join("\n"),
  );
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
  const options: Record<string, unknown> = {
    quiet: true,
    no_warnings: true,
    ...normalizeYtDlpOptions(request.options),
    js_runtimes: { bun: { path: bunExecutable() } },
  };
  const code = [
    "from yt_dlp import YoutubeDL",
    "class __PrivateLogger:",
    "    def debug(self, message): pass",
    "    def warning(self, message): pass",
    "    def error(self, message): pass",
    `__bun_ytdlp_options = json.loads(${JSON.stringify(JSON.stringify(options))})`,
    "__bun_ytdlp_options['logger'] = __PrivateLogger()",
    `__bun_ytdlp_url = json.loads(${JSON.stringify(JSON.stringify(request.url))})`,
    "with YoutubeDL(__bun_ytdlp_options) as __bun_ytdlp:",
    `    __info = __bun_ytdlp.extract_info(__bun_ytdlp_url, download=${options.download === true ? "True" : "False"})`,
    "    __result = __bun_ytdlp.sanitize_info(__info)",
  ].join("\n");
  return runBridge<YtDlpResult>(request, code);
}

export async function extractYtDlp(url: string, options: YtDlpOptions = {}): Promise<YtDlpResult> {
  return await runYtDlp({ url, options: { skip_download: true, ...options } });
}

export async function listYtDlpFormats(
  url: string,
  options: YtDlpOptions = {},
): Promise<readonly Record<string, unknown>[]> {
  const result = await extractYtDlp(url, options);
  return result.formats ?? [];
}

export async function downloadYtDlp(url: string, output: string, options: YtDlpOptions = {}): Promise<YtDlpResult> {
  return await runYtDlp({ url, options: { outtmpl: output, download: true, ...options } });
}

export async function extractYtDlpPlaylist(
  url: string,
  options: YtDlpOptions = {},
): Promise<readonly Record<string, unknown>[]> {
  const result = await extractYtDlp(url, { extract_flat: true, ...options });
  return result.entries ?? [];
}
