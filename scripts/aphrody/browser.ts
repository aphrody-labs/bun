#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0

export const HELP = `Usage: bun run chrome|obscura help|connect|launch [options]

  connect <ws://loopback/endpoint>   Probe an existing CDP endpoint, then disconnect
  launch                           Run the selected browser until it exits or Ctrl+C
  download <HTTP(S) URL> --outfile <path>  Save bounded HTML with its remote asset base
  compile <file|HTTP(S) URL> --outfile <path>  Build a standalone Bun executable
                                            HTML opens Bun.WebView; JS/TS runs as a script
  pwa <HTML|JS|JSX|TS|TSX|HTTP(S) URL> --outdir <dir> --icon <PNG> [--name <name>]
  compile --mode script|webview|pwa  Explicit entrypoint mode (HTML defaults to webview)
  compile --minimal                Disable executable configuration autoloading

Common: --executable <path> --timeout <milliseconds>
Chrome launch: --headless --no-webgpu --url <HTTP(S)|about:blank>
               --user-data-dir <path> --extension <path> (repeatable)
Obscura launch: --workers <1> (shared Chromium browser)

Runtime owners: bun:chromium and bun:obscura. Chrome is visible with WebGPU by default.
HTML executables use the qualified Chrome WebView backend (--backend chrome).
They embed local imported assets; downloaded HTML keeps remote assets at its original base.
Compiled executables contain the standard Bun runtime and require an installed browser.
Client JS/JSX/TS/TSX with webview or pwa mode must mount its own UI into #app.
PWA outputs must be served over HTTPS or localhost; generation does not install the app.
Build owners: bun run gn and bun run chromium; those commands compile sources.
`;

type Engine = "chrome" | "obscura";
export interface Options {
  engine: Engine;
  command: "help" | "connect" | "launch" | "download" | "compile" | "pwa";
  endpoint?: string;
  outfile?: string;
  backend?: "chrome";
  mode?: "script" | "webview" | "pwa";
  minimal?: boolean;
  outdir?: string;
  name?: string;
  icon?: string;
  launch: import("bun:chromium").LaunchOptions & import("bun:obscura").LaunchOptions;
}

export function parseArguments(args: string[]): Options {
  const engine = args[0];
  if (engine !== "chrome" && engine !== "obscura") throw new Error("Select chrome or obscura");
  const options: Options = { engine, command: "help", launch: {} };
  if (args.slice(1).some(arg => arg === "--help" || arg === "-h")) return options;
  const command = args[1] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") return options;
  if (!["connect", "launch", "download", "compile", "pwa"].includes(command))
    throw new Error(`Unknown command: ${command}`);
  options.command = command as Options["command"];
  let index = 2;
  if (command === "connect" || command === "download" || command === "compile" || command === "pwa") {
    const endpoint = args[index++];
    if (!endpoint || endpoint.startsWith("--")) throw new Error(`${command} needs an endpoint`);
    options.endpoint = endpoint;
  }
  for (; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === "--help" || flag === "-h") return { ...options, command: "help" };
    if (flag === "--minimal") {
      if (command !== "compile") throw new Error("--minimal requires compile");
      options.minimal = true;
      continue;
    }
    if (flag === "--headless" || flag === "--no-webgpu") {
      if (command !== "launch") throw new Error(`${flag} requires browser launch`);
      if (flag === "--headless") options.launch.headless = true;
      else options.launch.webgpu = false;
      continue;
    }
    const shared = flag === "--timeout";
    const commonLaunch = flag === "--executable";
    const chromeLaunch = ["--url", "--user-data-dir", "--extension"].includes(flag);
    const obscuraLaunch = flag === "--workers";
    const downloadOutput = (command === "download" || command === "compile") && flag === "--outfile";
    const compileBackend = command === "compile" && flag === "--backend";
    const compileMode = command === "compile" && flag === "--mode";
    const pwaOption = (command === "pwa" || command === "compile") && ["--outdir", "--name", "--icon"].includes(flag);
    if (
      !shared &&
      !downloadOutput &&
      !compileBackend &&
      !compileMode &&
      !pwaOption &&
      !(command === "launch" && (commonLaunch || chromeLaunch || (obscuraLaunch && engine === "obscura")))
    )
      throw new Error(`Unsupported option for ${engine} ${command}: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    if (shared || obscuraLaunch) {
      const maximum = shared ? 2147483647 : 1;
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum)
        throw new Error(`${flag} must be an integer from 1 to ${maximum}`);
      if (shared) options.launch.timeout = Number(value);
      else options.launch.workers = Number(value);
    } else if (compileMode) {
      if (!["script", "webview", "pwa"].includes(value)) throw new Error("--mode must be script, webview or pwa");
      options.mode = value as Options["mode"];
    } else if (pwaOption) {
      if (flag === "--outdir") options.outdir = value;
      else if (flag === "--icon") options.icon = value;
      else options.name = value;
    } else if (compileBackend) {
      if (value !== "chrome") throw new Error("compile currently supports the qualified Chrome WebView backend only");
      options.backend = value;
    } else if (downloadOutput) options.outfile = value;
    else if (flag === "--executable") options.launch.executable = value;
    else if (flag === "--url") options.launch.url = value;
    else if (flag === "--user-data-dir") options.launch.userDataDir = value;
    else (options.launch.extensions ??= []).push(value);
  }
  if ((command === "download" || (command === "compile" && options.mode !== "pwa")) && !options.outfile)
    throw new Error(`${command} needs --outfile`);
  if ((command === "pwa" || options.mode === "pwa") && (!options.outdir || !options.icon))
    throw new Error("pwa needs --outdir and --icon");
  return options;
}

async function htmlEntrypoint(input: string, staging: string): Promise<string> {
  const { relative, join, resolve } = await import("node:path");
  if (/\.html?$/i.test(input)) return resolve(input);
  if (!/\.(?:jsx?|tsx?)$/i.test(input)) throw new Error("Browser UI requires HTML, JS, JSX, TS or TSX");
  const source = relative(staging, resolve(input))
    .replaceAll("\\", "/")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");
  const entry = join(staging, "client.html");
  await Bun.write(
    entry,
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="app"></main><script type="module" src="${source}"></script></body></html>`,
  );
  return entry;
}

export async function buildPWA(options: Options): Promise<void> {
  const { resolve, join, basename } = await import("node:path");
  const { mkdir, rm, open, unlink } = await import("node:fs/promises");
  const output = resolve(options.outdir!);
  const assets = new Set<string>();
  async function writeOwned(path: string, data: string | Blob | Uint8Array) {
    const destination = join(output, path);
    let file;
    try {
      file = await open(destination, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`PWA output already exists: ${path}`);
      throw error;
    }
    assets.add(`./${path}`);
    try {
      await Bun.write(Bun.file(file.fd), data);
    } finally {
      await file.close();
    }
  }
  try {
    const icon = Bun.file(resolve(options.icon!));
    if (icon.size > 16 * 1024 * 1024) throw new Error("PWA icon exceeds the 16 MiB input limit");
    const bytes = await icon.bytes();
    if (bytes.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte))
      throw new Error("PWA icon must be an actual PNG");
    const icons = [];
    for (const size of [192, 512]) {
      const data = await new Bun.Image(bytes).resize(size, size, { fit: "fill" }).png().bytes();
      icons.push({ size, data });
    }
    await mkdir(output, { recursive: true });
    const remote = /^https?:\/\//i.test(options.endpoint!);
    let html: string;
    if (remote) html = await downloadPage(options.endpoint!, options.launch.timeout, options.launch.signal);
    else {
      const staging = join(output, `.bun-client-${crypto.randomUUID()}`);
      await mkdir(staging, { recursive: true });
      let result;
      try {
        result = await Bun.build({
          entrypoints: [await htmlEntrypoint(options.endpoint!, staging)],
          target: "browser",
          naming: { entry: "index.[ext]", chunk: "chunk-[hash].[ext]", asset: "[name]-[hash].[ext]" },
          minify: true,
        });
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
      if (!result.success) throw new AggregateError(result.logs, "PWA browser bundle failed");
      const entry = result.outputs.find(file => basename(file.path) === "index.html");
      if (!entry) throw new Error("PWA bundle produced no HTML entrypoint");
      html = await entry.text();
      for (const file of result.outputs) if (file !== entry) await writeOwned(basename(file.path), file);
    }
    const { manifests } = await import("bun:chromium");
    const origin = "https://bun.invalid/";
    const manifest = manifests.createPWA({
      name: options.name ?? "Bun application",
      start_url: origin,
      scope: origin,
      icons: icons.map(({ size }) => ({
        src: new URL(`icon-${size}.png`, origin).href,
        sizes: `${size}x${size}`,
        type: "image/png",
      })),
    });
    manifest.start_url = "./";
    manifest.scope = "./";
    for (const entry of manifest.icons as { src: string }[]) entry.src = `./${new URL(entry.src).pathname.slice(1)}`;
    const registration = `const manifest=document.createElement('link');manifest.rel='manifest';manifest.href=new URL('./manifest.webmanifest',location.href).href;document.head.append(manifest);if('serviceWorker'in navigator&&isSecureContext)navigator.serviceWorker.register(new URL('./service-worker.js',location.href),{scope:new URL('./',location.href).href}).catch(console.error);`;
    let hasHead = false;
    html = await new HTMLRewriter()
      .on("head", {
        element(head) {
          hasHead = true;
          head.append(`<script>${registration}</script>`, { html: true });
        },
      })
      .transform(new Response(html))
      .text();
    if (!hasHead) html = `<head><script>${registration}</script></head>${html}`;
    await writeOwned("index.html", html);
    await writeOwned("manifest.webmanifest", `${JSON.stringify(manifest, null, 2)}\n`);
    for (const { size, data } of icons) await writeOwned(`icon-${size}.png`, data);
    const cached = [...assets].sort();
    const hasher = new Bun.CryptoHasher("sha256");
    const files = [];
    for (const asset of cached) {
      const data = await Bun.file(join(output, asset)).bytes();
      const sha256 = new Bun.CryptoHasher("sha256").update(data).digest("hex");
      files.push({ path: asset, sha256 });
      hasher.update(asset).update(sha256);
    }
    const revision = hasher.digest("hex").slice(0, 16);
    const worker = `const CACHE='bun-pwa:'+encodeURIComponent(new URL('./',self.location.href).href)+':${revision}';const ASSETS=${JSON.stringify(cached)};self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match(event.request).then(hit=>hit||(event.request.mode==='navigate'?cache.match(new URL('./index.html',self.location.href)):new Response('Offline',{status:503}))))));});`;
    await writeOwned("service-worker.js", worker);
    await writeOwned(
      "bun-pwa.json",
      `${JSON.stringify({ schema: 1, downloadedHTML: remote, offline: "only listed local files are cached; external dependencies require network", files }, null, 2)}\n`,
    );
  } catch (error) {
    await Promise.all([...assets].map(path => unlink(join(output, path)).catch(() => {})));
    throw error;
  }
}

export async function compileApplication(options: Options): Promise<void> {
  if (options.mode === "pwa") return buildPWA(options);
  const { resolve, dirname, join, extname } = await import("node:path");
  const input = options.endpoint!;
  const output = resolve(options.outfile!);
  const remote = /^https?:\/\//i.test(input);
  const entry = remote ? undefined : resolve(input);
  if (entry && (process.platform === "win32" ? entry.toLowerCase() === output.toLowerCase() : entry === output))
    throw new Error("Compiled output must not overwrite its source entrypoint");
  if (entry) {
    const { realpath } = await import("node:fs/promises");
    const sourcePath = await realpath(entry);
    const outputPath = await realpath(output).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (
      outputPath &&
      (process.platform === "win32" ? sourcePath.toLowerCase() === outputPath.toLowerCase() : sourcePath === outputPath)
    )
      throw new Error("Compiled output must not overwrite its source entrypoint");
  }
  const minimal = { autoloadDotenv: false, autoloadBunfig: false, autoloadTsconfig: false, autoloadPackageJson: false };
  if (entry && ![".html", ".htm", ".js", ".jsx", ".ts", ".tsx"].includes(extname(entry).toLowerCase()))
    throw new Error("compile supports HTML, JavaScript, JSX, TypeScript and TSX entrypoints");
  const html = options.mode === "webview" || (options.mode !== "script" && (remote || /\.html?$/i.test(input)));
  if (options.mode === "script" && (remote || /\.html?$/i.test(input)))
    throw new Error("Script mode requires a local JS, JSX, TS or TSX entrypoint");
  if (!html) {
    const result = await Bun.build({
      entrypoints: [entry!],
      target: "bun",
      compile: { outfile: output, executablePath: process.execPath, ...(options.minimal ? minimal : {}) },
      minify: true,
    });
    if (!result.success) throw new AggregateError(result.logs, "Application compilation failed");
    return;
  }
  const { mkdir, rm } = await import("node:fs/promises");
  const staging = join(dirname(output), `.bun-browser-${crypto.randomUUID()}`);
  await mkdir(staging, { recursive: true });
  try {
    const resource = remote
      ? `const page = new Response(${JSON.stringify(await downloadPage(input, options.launch.timeout, options.launch.signal))}, {headers:{"content-type":"text/html; charset=utf-8"}});`
      : `import page from ${JSON.stringify(await htmlEntrypoint(entry!, staging))};`;
    const harness = join(staging, "app.ts");
    await Bun.write(
      harness,
      `${resource}
const server = Bun.serve({hostname:"127.0.0.1",port:0,${remote ? "fetch(){return page.clone();}" : 'routes:{"/":page}'}});
let view;
let closing = false;
let resolveStop;
const stopped = new Promise(resolve => { resolveStop = resolve; });
const stop = () => { closing = true; view?.close(); resolveStop(); };
process.once("SIGINT",stop); process.once("SIGTERM",stop);
try { view = new Bun.WebView({backend:{type:"chrome",url:false},headless:false}); view.addEventListener("close",stop,{once:true}); await view.navigate(server.url.href); await stopped; }
catch(error) { if(!closing) throw error; }
finally { view?.close(); server.stop(true); process.removeListener("SIGINT",stop); process.removeListener("SIGTERM",stop); }
`,
    );
    const result = await Bun.build({
      entrypoints: [harness],
      target: "bun",
      compile: { outfile: output, executablePath: process.execPath, ...minimal },
      minify: true,
    });
    if (!result.success) throw new AggregateError(result.logs, "HTML application compilation failed");
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function downloadPage(url: string, timeout = 30000, signal?: AbortSignal): Promise<string> {
  const address = new URL(url);
  if (!["http:", "https:"].includes(address.protocol) || address.username || address.password)
    throw new Error("download requires an HTTP(S) URL without embedded credentials");
  const abort = AbortSignal.timeout(timeout);
  const response = await fetch(address, {
    signal: signal ? AbortSignal.any([signal, abort]) : abort,
    credentials: "omit",
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`download failed: HTTP ${response.status}`);
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    await response.body?.cancel().catch(() => {});
    throw new Error("download requires an HTML response");
  }
  const maximum = 16 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel().catch(() => {});
    throw new Error("download exceeds the 16 MiB HTML limit");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("download returned no HTML body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error("download exceeds the 16 MiB HTML limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  let sourceBase: string | undefined;
  const original = await new HTMLRewriter()
    .on("base[href]", {
      element(base) {
        if (sourceBase === undefined) {
          const resolved = new URL(base.getAttribute("href")!, response.url);
          if (resolved.username || resolved.password) throw new Error("HTML asset base contains embedded credentials");
          sourceBase = resolved.href;
          base.setAttribute("href", resolved.href);
        }
      },
    })
    .transform(new Response(new Blob(chunks)))
    .text();
  if (sourceBase !== undefined) return original;
  const base = (sourceBase ?? response.url).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  let hasHead = false;
  const rewritten = await new HTMLRewriter()
    .on("head", {
      element(head) {
        hasHead = true;
        head.prepend(`<base href="${base}">`, { html: true });
      },
    })
    .transform(new Response(original))
    .text();
  return hasHead ? rewritten : `<head><base href="${base}"></head>${rewritten}`;
}

export interface Connection {
  send(method: string): Promise<unknown>;
  close(): void;
}
export interface Browser {
  process: { exited: Promise<number> };
  close(): Promise<void>;
}
export interface Owner {
  connect(endpoint: string, options: { timeout?: number; signal?: AbortSignal }): Promise<Connection>;
  launch(options: Options["launch"]): Promise<Browser>;
}

async function loadOwner(engine: Engine): Promise<Owner> {
  const owner = engine === "chrome" ? await import("bun:chromium") : await import("bun:obscura");
  return {
    connect: owner.connect,
    launch: async options => {
      const path = await import("node:path");
      const source = process.env.BUN_CHROMIUM_SOURCE ?? path.resolve(import.meta.dir, "../../vendor/chromium/src");
      const executable =
        options.executable ??
        process.env.BUN_CHROMIUM_PATH ??
        path.join(
          source,
          "out/bun",
          process.platform === "win32"
            ? "chrome.exe"
            : process.platform === "darwin"
              ? "Chromium.app/Contents/MacOS/Chromium"
              : "chrome",
        );
      if (!Bun.which(executable)) throw new Error(`Owner Chromium executable not found: ${executable}`);
      return owner.launch({ ...options, executable });
    },
  };
}

export async function runBrowser(
  options: Options,
  load: (engine: Engine) => Promise<Owner> = loadOwner,
  report: (value: string) => void = console.log,
): Promise<number> {
  if (options.command === "help") {
    report(HELP);
    return 0;
  }
  if (options.command === "download") {
    const html = await downloadPage(options.endpoint!, options.launch.timeout, options.launch.signal);
    await Bun.write(options.outfile!, html);
    report(options.outfile!);
    return 0;
  }
  if (options.command === "compile") {
    await compileApplication(options);
    report(options.mode === "pwa" ? options.outdir! : options.outfile!);
    return 0;
  }
  if (options.command === "pwa") {
    await buildPWA(options);
    report(options.outdir!);
    return 0;
  }
  const owner = await load(options.engine);
  if (options.command === "connect") {
    const connection = await owner.connect(options.endpoint!, {
      timeout: options.launch.timeout,
      signal: options.launch.signal,
    });
    try {
      report(JSON.stringify(await connection.send("Browser.getVersion")));
      return 0;
    } finally {
      connection.close();
    }
  }
  const browser = await owner.launch(options.launch);
  try {
    report(`${options.engine} ready; stop with Ctrl+C`);
    return await browser.process.exited;
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const options = parseArguments(Bun.argv.slice(2));
    options.launch.signal = controller.signal;
    process.exitCode = await runBrowser(options);
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
