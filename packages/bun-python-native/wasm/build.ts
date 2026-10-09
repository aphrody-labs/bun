import { randomUUID } from "node:crypto";
import { copyFile, link, lstat, mkdir, rename, rmdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { scheduler } from "node:timers/promises";
import { parseArgs } from "node:util";
import { BunPython, registryPath } from "../../../scripts/aphrody/pyjs-store.ts";
import toolchain from "./toolchain.json";

export type PythonWasmOptions = {
  entry: string;
  out: string;
  root?: string;
  db?: string;
  cpythonRoot?: string;
  cache?: string;
  host?: "docker" | "local";
  image?: string;
  jobs?: number;
};
type SourceModule = { name: string; path: string; filename: string; package: boolean; sha256: string };
type Overlay = { path: string; sha256: string | null };

async function hash(path: string) {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const bytes of Bun.file(path).stream()) hasher.update(bytes);
  return hasher.digest("hex");
}

function scoped(root: string, path: string) {
  const local = relative(root, resolve(path));
  if (isAbsolute(local) || local === ".." || local.startsWith(".." + sep))
    throw new Error(`Python source escapes its declared root: ${path}`);
  return local;
}

async function capture(command: string[], cwd: string) {
  await using child = Bun.spawn({ cmd: command, cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  if (code !== 0) throw new Error(`${command[0]} failed (${code}): ${stderr}`);
  return stdout.trim();
}

async function download(spec: { url: string; sha256: string }, path: string) {
  if (await Bun.file(path).exists()) {
    if ((await hash(path)) !== spec.sha256) throw new Error(`Cached toolchain checksum mismatch: ${path}`);
    return;
  }
  const response = await fetch(spec.url, { redirect: "follow" });
  if (!response.ok || !response.body)
    throw new Error(`Official toolchain download failed (${response.status}): ${spec.url}`);
  const pending = `${path}.${randomUUID()}.part`;
  await Bun.write(pending, response);
  if ((await hash(pending)) !== spec.sha256) throw new Error(`Official toolchain checksum mismatch: ${spec.url}`);
  await rename(pending, path);
}

export async function prepareModules(root: string, entry: string, work: string): Promise<SourceModule[]> {
  root = resolve(root);
  entry = resolve(entry);
  scoped(root, entry);
  const modules: SourceModule[] = [];
  const skipped = new Set([".git", ".venv", "venv", "node_modules", "__pycache__", "build", "dist"]);
  let bytes = 0;
  for await (const path of new Bun.Glob("**/*.{py,pyd,so,dll,dylib}").scan({
    cwd: root,
    onlyFiles: true,
    followSymlinks: false,
  })) {
    const parts = path.split(/[\\/]/);
    if (parts.some(part => skipped.has(part))) continue;
    if (!path.endsWith(".py"))
      throw new Error(`Native extension must be rebuilt for WASI, not bundled as a host library: ${path}`);
    const original = resolve(root, path);
    const stat = await lstat(original);
    if (!stat.isFile()) throw new Error(`Python module is not a regular source file: ${path}`);
    if (stat.size > 256 * 1024 * 1024 - bytes) throw new Error("Python application exceeds the 256 MiB source limit");
    const content = await Bun.file(original).bytes();
    bytes += content.byteLength;
    if (modules.length >= 10000 || bytes > 256 * 1024 * 1024)
      throw new Error("Python application exceeds the 10000-module or 256 MiB source limit");
    const packageFile = basename(path) === "__init__.py";
    const names = packageFile ? parts.slice(0, -1) : [...parts.slice(0, -1), basename(path, ".py")];
    if (packageFile && names.length === 0) continue;
    let name = names.join(".");
    const importable = name && names.every(part => /^[\p{ID_Start}_][\p{ID_Continue}]*$/u.test(part));
    if (!importable && original === entry && !packageFile)
      name = `__buv_entry_${new Bun.CryptoHasher("sha256").update(parts.join("/")).digest("hex").slice(0, 16)}`;
    else if (!importable) throw new Error(`Frozen Python source requires an importable module name: ${path}`);
    const destination = join(work, "application", path);
    await mkdir(dirname(destination), { recursive: true });
    await Bun.write(destination, content);
    modules.push({
      name,
      path: `application/${parts.join("/")}`,
      filename: `/app/${parts.join("/")}`,
      package: packageFile,
      sha256: new Bun.CryptoHasher("sha256").update(content).digest("hex"),
    });
    await scheduler.yield();
  }
  modules.sort((left, right) => left.name.localeCompare(right.name, "en"));
  if (new Set(modules.map(module => module.name)).size !== modules.length)
    throw new Error("Frozen Python application contains ambiguous module and package names");
  const names = new Set(modules.filter(module => module.package).map(module => module.name));
  for (const module of modules) {
    const parts = module.name.split(".");
    for (let length = 1; length < parts.length; length++) {
      const parent = parts.slice(0, length).join(".");
      if (!names.has(parent)) throw new Error(`Frozen Python packages require __init__.py: ${parent}`);
    }
  }
  const filename = `/app/${scoped(root, entry).split(sep).join("/")}`;
  if (!modules.some(module => module.filename === filename && !module.package))
    throw new Error("Python WASI entry must be an indexed .py file");
  return modules;
}

export async function buildPythonWasm(options: PythonWasmOptions) {
  const entry = resolve(options.entry);
  const out = resolve(options.out);
  if (!out.endsWith(".wasm")) throw new Error("Python WASI output must have the .wasm extension");
  const root = resolve(options.root ?? dirname(entry));
  const cpython = resolve(
    options.cpythonRoot ?? process.env.BUV_CPYTHON_ROOT ?? join(import.meta.dir, "../../../.coord/cpython"),
  );
  const cache = resolve(options.cache ?? process.env.BUV_WASM_CACHE ?? join(homedir(), ".buv/toolchains/python-wasi"));
  const host = options.host ?? "docker";
  const jobs = options.jobs ?? 3;
  if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 12)
    throw new Error("Python WASI jobs must be between 1 and 12");
  if (host === "local" && (process.platform !== "linux" || process.arch !== "x64"))
    throw new Error("The pinned local WASI factory requires Linux x64; use the Docker factory on this host");
  await mkdir(cache, { recursive: true });
  const lock = join(cache, ".build.lock");
  await mkdir(lock).catch(error => {
    throw new Error(`Python WASI cache is busy or unavailable: ${lock}`, { cause: error });
  });
  const work = join(cache, "requests", randomUUID());
  try {
    await mkdir(work, { recursive: true });
    using registry = new BunPython(options.db ?? registryPath);
    const run = registry.startRun("python-wasi-build", [process.execPath, "python-wasi", entry, out], root, {
      target: toolchain.target,
      host,
      jobs,
    });
    let finished = false;
    try {
      const pythonVersion = /#define PY_VERSION\s+"([^"]+)"/.exec(
        await Bun.file(join(cpython, "Include/patchlevel.h")).text(),
      )?.[1];
      if (!pythonVersion?.startsWith("3.13."))
        throw new Error("The Python WASI factory requires a CPython 3.13 source checkout");
      const sourceRevision = await capture(["git", "rev-parse", "HEAD"], cpython);
      if (!/^[0-9a-f]{40}$/.test(sourceRevision))
        throw new Error("CPython source revision is not a complete Git commit");
      await capture(["git", "archive", "--format=tar", "--output", join(work, "cpython.tar"), sourceRevision], cpython);
      const archiveSha256 = await hash(join(work, "cpython.tar"));
      const changed = (await capture(["git", "diff", "--name-only", "-z", "HEAD"], cpython))
        .split("\0")
        .filter(Boolean);
      const overlay: Overlay[] = [];
      for (const path of changed) {
        const source = resolve(cpython, path);
        scoped(cpython, source);
        if (!(await Bun.file(source).exists())) {
          overlay.push({ path, sha256: null });
          continue;
        }
        if (!(await lstat(source)).isFile()) throw new Error(`CPython overlay is not a regular source file: ${path}`);
        const destination = join(work, "overlay", path);
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(source, destination);
        overlay.push({ path: path.split(sep).join("/"), sha256: await hash(destination) });
      }
      const sourceHash = new Bun.CryptoHasher("sha256")
        .update(JSON.stringify({ sourceRevision, archiveSha256, overlay }))
        .digest("hex");
      const modules = await prepareModules(root, entry, work);
      const entryFilename = `/app/${scoped(root, entry).split(sep).join("/")}`;
      const entryModule = modules.find(module => module.filename === entryFilename)!.name;
      const sourceDateEpoch = await capture(["git", "show", "-s", "--format=%ct", sourceRevision], cpython);
      const downloads = join(cache, "downloads");
      await mkdir(downloads, { recursive: true });
      const sdkArchive = join(downloads, `sdk-${toolchain.sdk.sha256}.tar.gz`);
      const runtimeArchive = join(downloads, `runtime-${toolchain.runtime.sha256}.tar.xz`);
      await Promise.all([download(toolchain.sdk, sdkArchive), download(toolchain.runtime, runtimeArchive)]);
      await Promise.all([
        link(sdkArchive, join(work, "sdk.tar.gz")),
        link(runtimeArchive, join(work, "runtime.tar.xz")),
      ]);
      const request = {
        pythonVersion,
        sourceRevision,
        archiveSha256,
        overlay,
        sourceHash,
        sourceDateEpoch,
        modules,
        entryModule,
        jobs: String(jobs),
        toolchain,
      };
      const requestPath = join(work, "request.json");
      await Bun.write(requestPath, JSON.stringify(request));
      const tools = join(work, "tools");
      await mkdir(tools);
      await Promise.all(
        ["driver.py", "freeze.py", "main.c", "toolchain.json", "build.ts"].map(path =>
          copyFile(join(import.meta.dir, path), join(tools, path)),
        ),
      );
      const toolSources = Object.fromEntries(
        await Promise.all(
          ["driver.py", "freeze.py", "main.c", "toolchain.json", "build.ts"].map(async path => [
            path,
            await hash(join(tools, path)),
          ]),
        ),
      );
      await copyFile(join(cpython, "LICENSE"), join(work, "CPython.LICENSE"));
      const image = options.image ?? process.env.BUV_WASM_IMAGE ?? "aphrody/build-linux:26.04";
      const imageId =
        host === "docker" ? await capture(["docker", "inspect", "--format", "{{.Id}}", image], root) : null;
      const command =
        host === "docker"
          ? [
              "docker",
              "run",
              "--rm",
              "--network",
              "none",
              "--cpus",
              String(jobs),
              "--memory",
              "4g",
              "--cap-drop",
              "ALL",
              "--security-opt",
              "no-new-privileges",
              "--platform",
              "linux/amd64",
              "--mount",
              "type=volume,src=buv-python-wasi-cache,dst=/cache",
              "--mount",
              `type=bind,src=${work},dst=/work`,
              "--mount",
              `type=bind,src=${tools},dst=/tools,readonly`,
              imageId!,
              "python3",
              "/tools/driver.py",
              "--request",
              "/work/request.json",
              "--cache",
              "/cache",
              "--tools",
              "/tools",
            ]
          : [
              "python3",
              join(tools, "driver.py"),
              "--request",
              requestPath,
              "--cache",
              join(cache, "factory"),
              "--tools",
              tools,
            ];
      const stdoutPath = join(work, "stdout.log");
      const stderrPath = join(work, "stderr.log");
      registry.event("python-wasi-command", { command, image, imageId, sourceHash, sourceRevision, requestPath }, run);
      await using child = Bun.spawn({
        cmd: command,
        cwd: root,
        stdout: Bun.file(stdoutPath),
        stderr: Bun.file(stderrPath),
      });
      const code = await child.exited;
      await Promise.all([
        registry.artifact(stdoutPath, "python-wasi-stdout", run),
        registry.artifact(stderrPath, "python-wasi-stderr", run),
      ]);
      if (code !== 0)
        throw new Error(
          `CPython WASI factory failed (${code}); ${stderrPath}\n${await Bun.file(stderrPath)
            .slice(Math.max(0, (await lstat(stderrPath)).size - 65536))
            .text()}`,
        );
      const wasmPath = join(work, "output.wasm");
      const stat = await lstat(wasmPath);
      if (!stat.isFile() || stat.size > 256 * 1024 * 1024)
        throw new Error("Python WASI artifact must be a regular module smaller than 256 MiB");
      const binary = await Bun.file(wasmPath).arrayBuffer();
      const module = await WebAssembly.compile(binary);
      if (!WebAssembly.Module.exports(module).some(item => item.name === "_start" && item.kind === "function"))
        throw new Error("Python WASI artifact does not export its executable _start function");
      const imports = WebAssembly.Module.imports(module);
      if (
        !imports.some(item => item.module === "wasi_snapshot_preview1") ||
        imports.some(item => item.module !== "wasi_snapshot_preview1")
      )
        throw new Error("Python artifact does not use the qualified WASI Preview 1 ABI");
      const wasmHash = await hash(wasmPath);
      const buildReceipt = await Bun.file(join(work, "receipt.json")).json();
      if (buildReceipt.sha256 !== wasmHash)
        throw new Error("Python WASI artifact checksum does not match the factory receipt");
      await mkdir(dirname(out), { recursive: true });
      const pending = `${out}.${randomUUID()}.part`;
      await copyFile(wasmPath, pending);
      await rename(pending, out);
      const frozenIndexPath = `${out}.modules.json`;
      const frozenSource = join(work, "modules.json");
      if ((await hash(frozenSource)) !== buildReceipt.frozenIndexSha256)
        throw new Error("Frozen Python index checksum does not match the factory receipt");
      await copyFile(frozenSource, frozenIndexPath);
      const licensePath = `${out}.LICENSE`;
      await copyFile(join(work, "CPython.LICENSE"), licensePath);
      const receipt = {
        ...buildReceipt,
        out,
        work,
        run,
        root,
        entry,
        imageId,
        toolchain,
        toolSources,
        frozenIndexPath,
        licensePath,
        modules,
        imports,
        validation: "WebAssembly.Module + executable _start + WASI Preview 1 imports",
        qualification: "built; application execution is a separate gate",
      };
      const receiptPath = `${out}.json`;
      await Bun.write(receiptPath, JSON.stringify(receipt));
      await Promise.all([
        registry.artifact(out, "python-wasi-module", run, receipt),
        registry.artifact(receiptPath, "python-wasi-receipt", run),
        registry.artifact(frozenIndexPath, "python-wasi-frozen-index", run),
        registry.artifact(licensePath, "python-wasi-license", run),
      ]);
      const frozenModules = (await Bun.file(frozenIndexPath).json()) as Array<{
        name: string;
        filename: string;
        package: boolean;
        sourceSha256: string;
        bytecodeSha256: string;
      }>;
      const repository = registry.repository(`python-wasi/${wasmHash}`, "compiled", dirname(out), sourceRevision, {
        target: toolchain.target,
        sourceHash,
        artifactSha256: wasmHash,
      });
      await registry.importGraph(
        repository,
        {
          producer: "CPython 3.13 native frozen-module compiler",
          graph: { target: toolchain.target, sourceHash, artifactSha256: wasmHash, sourceRevision },
          nodes: [
            {
              id: `artifact:${wasmHash}`,
              label: basename(out),
              kind: "wasm-artifact",
              sha256: wasmHash,
              provenance: "EXTRACTED",
            },
            ...frozenModules.map(item => ({
              id: `module:${item.name}`,
              label: item.name,
              kind: "python-frozen-module",
              ...item,
              provenance: "EXTRACTED",
            })),
          ],
          links: frozenModules.map(item => ({
            source: `artifact:${wasmHash}`,
            target: `module:${item.name}`,
            relation: "contains-frozen-module",
            confidence: "EXTRACTED",
            confidence_score: 1,
          })),
        },
        wasmHash,
      );
      registry.event("python-wasi-built", receipt, run);
      registry.finishRun(run, 0, JSON.stringify({ out, receiptPath, sha256: wasmHash }));
      finished = true;
      return receipt;
    } catch (error) {
      if (!finished) registry.finishRun(run, 1, "", String(error));
      throw error;
    }
  } finally {
    await rmdir(lock);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      entry: { type: "string" },
      out: { type: "string" },
      root: { type: "string" },
      db: { type: "string" },
      "cpython-root": { type: "string" },
      cache: { type: "string" },
      host: { type: "string", default: "docker" },
      image: { type: "string" },
      jobs: { type: "string", default: "3" },
    },
  });
  if (!values.entry || !values.out)
    throw new Error("Usage: python-wasi --entry <file.py> --out <file.wasm> [--root <application>] [--db <registry>]");
  if (values.host !== "docker" && values.host !== "local") throw new Error("Python WASI host must be docker or local");
  console.log(
    JSON.stringify(
      await buildPythonWasm({
        entry: values.entry,
        out: values.out,
        root: values.root,
        db: values.db,
        cpythonRoot: values["cpython-root"],
        cache: values.cache,
        host: values.host,
        image: values.image,
        jobs: Number(values.jobs),
      }),
    ),
  );
}
