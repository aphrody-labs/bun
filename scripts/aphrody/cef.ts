#!/usr/bin/env bun
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { batchCommand, childEnvironment } from "./chromium";

export const CEF_VERSION = "157.0.0";
export const CEF_CHROMIUM_VERSION = "157.0.8099.0";
export const CHROMIUM_REVISION = "95ff46fdacff0d4973f17710418f12e1ceedeed9";
export const CHROMIUM_BASE_REVISION = "ce0615a76d6347f1914d673f1da66285b328d494";
export const CHROMIUM_UPSTREAM_REVISION = "e20c553087353010f4b71143841c189447ac1628";
export const CEF_REVISION = "c7272dcfe46849b77d1a3c0789dc38b1bfb14c9c";
export const CEF_UPSTREAM_CHROMIUM_VERSION = "156.0.8078.0";
export const SDK_PACKAGE_VERSION = "10.0.28000.2270";
export const SDK_VERSION = "10.0.28000.0";

export function sdkPlan(root = repoRoot()) {
  const cache = join(root, "build/cef-sdk");
  return {
    cache,
    sdk: join(cache, "c"),
    version: SDK_VERSION,
    packageVersion: SDK_PACKAGE_VERSION,
    packages: ["microsoft.windows.sdk.cpp", "microsoft.windows.sdk.cpp.x64", "microsoft.windows.sdk.cpp.x86"],
  };
}

async function sdkFetch(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "api.nuget.org" || parsed.username || parsed.password)
    throw new Error("SDK package metadata must use the official NuGet API");
  const response = await fetch(parsed, { signal: AbortSignal.timeout(120000), redirect: "error", credentials: "omit" });
  if (!response.ok) throw new Error(`SDK package fetch failed: ${response.status}`);
  return response;
}

export async function setupSdk(root = repoRoot()) {
  if (process.platform !== "win32") throw new Error("CEF's Windows SDK provider requires Windows");
  const spec = sdkPlan(root);
  mkdirSync(spec.cache, { recursive: true });
  if (realpathSync(spec.cache).toLowerCase() !== resolve(spec.cache).toLowerCase())
    throw new Error("SDK cache must not traverse a link");
  if (existsSync(spec.sdk) && lstatSync(spec.sdk).isSymbolicLink())
    throw new Error("SDK payload must not traverse a link");
  const index = await (await sdkFetch("https://api.nuget.org/v3/index.json")).json();
  const registration = index.resources.find((resource: any) => resource["@type"] === "RegistrationsBaseUrl/3.6.0")?.[
    "@id"
  ];
  if (typeof registration !== "string") throw new Error("NuGet registration resource is missing");
  const packages = [];
  for (const id of spec.packages) {
    const registered = await (await sdkFetch(`${registration}${id}/${spec.packageVersion}.json`)).json();
    if (typeof registered.catalogEntry !== "string" || typeof registered.packageContent !== "string")
      throw new Error("SDK registration metadata is incomplete");
    const catalog = await (await sdkFetch(registered.catalogEntry)).json();
    if (
      typeof catalog.id !== "string" ||
      catalog.id.toLowerCase() !== id ||
      catalog.version !== spec.packageVersion ||
      catalog.packageHashAlgorithm !== "SHA512" ||
      typeof catalog.packageHash !== "string" ||
      !Number.isSafeInteger(catalog.packageSize) ||
      catalog.packageSize <= 0 ||
      catalog.packageSize > 512 * 1024 * 1024
    )
      throw new Error("SDK catalog does not match its exact package pin");
    const archivePath = join(spec.cache, id === "microsoft.windows.sdk.cpp" ? "sdk-common.nupkg" : `${id}.nupkg`);
    let bytes: Uint8Array;
    if (existsSync(archivePath)) bytes = new Uint8Array(readFileSync(archivePath));
    else {
      const response = await sdkFetch(registered.packageContent);
      const length = Number(response.headers.get("content-length"));
      if (!Number.isSafeInteger(length) || length !== catalog.packageSize)
        throw new Error("SDK archive length does not match catalog");
      bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== length) throw new Error("SDK archive length is incomplete");
      writeFileSync(archivePath, bytes);
    }
    const sha512 = new Bun.CryptoHasher("sha512").update(bytes).digest("base64");
    if (sha512 !== catalog.packageHash || bytes.length !== catalog.packageSize)
      throw new Error(`SDK archive integrity mismatch: ${id}`);
    const entries = await new Bun.Archive(bytes).extract(spec.cache, { glob: "c/**" });
    packages.push({ id, version: spec.packageVersion, sha512, bytes: bytes.length, entries });
  }
  for (const relative of [
    `Include/${spec.version}/um/Windows.h`,
    `Include/${spec.version}/ucrt/stdio.h`,
    `Lib/${spec.version}/um/x64/kernel32.lib`,
    `Lib/${spec.version}/um/x86/kernel32.lib`,
    `bin/${spec.version}/x64/rc.exe`,
  ])
    if (!existsSync(join(spec.sdk, relative))) throw new Error(`SDK native payload is missing: ${relative}`);
  const receipt = { schema: 1, sdk: spec.sdk, version: spec.version, packages };
  writeFileSync(join(spec.cache, ".bun-cef-sdk.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export interface CEFLayout {
  root: string;
  chromiumSource: string;
  cache: string;
  distribution: string;
  marker: string;
  target: string;
  cefSource: string;
  cefLink: string;
}

function targetTriple(platform = process.platform, arch = process.arch): string {
  if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
  if (platform === "win32" && arch === "arm64") return "aarch64-pc-windows-msvc";
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "darwin") return "x86_64-apple-darwin";
  if (platform === "linux" && arch === "arm64") return "aarch64-unknown-linux-gnu";
  if (platform === "linux") return "x86_64-unknown-linux-gnu";
  throw new Error(`CEF n'est pas supporté pour ${platform}/${arch}`);
}

function marker(platform = process.platform): string {
  if (platform === "win32") return "libcef.dll";
  if (platform === "darwin") return "Chromium Embedded Framework.framework";
  if (platform === "linux") return "libcef.so";
  throw new Error(`CEF n'est pas supporté pour ${platform}`);
}

export function repoRoot(from = import.meta.dir): string {
  return resolve(from, "../..");
}

export function layout(env: NodeJS.ProcessEnv = process.env): CEFLayout {
  const root = repoRoot();
  const target = targetTriple();
  const cache = resolve(env.CEF_CACHE ?? join(root, "build", "cef-cache"));
  const explicit = env.CEF_PATH ? resolve(env.CEF_PATH) : undefined;
  const distribution = explicit ?? join(cache, CEF_VERSION, target);
  return {
    root,
    chromiumSource: join(root, "vendor", "chromium", "src"),
    cache,
    distribution,
    marker: marker(),
    target,
    cefSource: join(root, "vendor", "cef"),
    cefLink: join(root, "vendor", "chromium", "src", "cef"),
  };
}

export function validate(layoutValue = layout()): string[] {
  const errors: string[] = [];
  if (!existsSync(layoutValue.chromiumSource)) errors.push(`Chromium source absent: ${layoutValue.chromiumSource}`);
  if (!existsSync(join(layoutValue.chromiumSource, ".gn"))) errors.push("Chromium source non configuré (.gn absent)");
  if (!existsSync(join(layoutValue.cefSource, "BUILD.gn"))) errors.push("CEF source absent");
  if (!existsSync(layoutValue.distribution)) errors.push(`Distribution CEF absente: ${layoutValue.distribution}`);
  if (!existsSync(join(layoutValue.distribution, layoutValue.marker)))
    errors.push(`Fichier CEF absent: ${join(layoutValue.distribution, layoutValue.marker)}`);
  const receiptPath = join(layoutValue.distribution, ".bun-cef-build.json");
  if (!existsSync(receiptPath)) errors.push("CEF native build receipt absent");
  else {
    try {
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      if (
        receipt.schema !== 1 ||
        receipt.chromiumRevision !== CHROMIUM_REVISION ||
        receipt.chromiumVersion !== CEF_CHROMIUM_VERSION ||
        receipt.cefRevision !== CEF_REVISION ||
        receipt.target !== layoutValue.target ||
        typeof receipt.apiHash !== "string" ||
        !receipt.apiHash
      )
        errors.push("CEF native build receipt does not match source/API target");
      if (receipt.binary?.path !== layoutValue.marker || !/^[0-9a-f]{64}$/i.test(receipt.binary?.sha256 ?? ""))
        errors.push("CEF native binary receipt is invalid");
      else if (
        new Bun.CryptoHasher("sha256")
          .update(readFileSync(join(layoutValue.distribution, layoutValue.marker)))
          .digest("hex") !== receipt.binary.sha256
      )
        errors.push("CEF native binary checksum does not match receipt");
    } catch {
      errors.push("CEF native build receipt is malformed");
    }
  }
  return errors;
}

export function environment(layoutValue = layout(), current: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...current, CEF_PATH: layoutValue.distribution };
  env.BUN_CHROMIUM_SOURCE = layoutValue.chromiumSource;
  env.BUN_CEF_VERSION = CEF_VERSION;
  env.BUN_CEF_CHROMIUM_VERSION = CEF_CHROMIUM_VERSION;
  env.BUN_CHROMIUM_REVISION = CHROMIUM_REVISION;
  env.BUN_CEF_SOURCE_REVISION = CEF_REVISION;
  return env;
}

async function buildEnvironment(value: CEFLayout) {
  let current = environment(value);
  if (process.platform === "win32") {
    const child = Bun.spawn([process.execPath, "msvc", "env", "--format", "json"], {
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    });
    const [output, , code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    if (code !== 0) throw new Error(`Native MSVC discovery failed: ${code}`);
    const selected = JSON.parse(output);
    const year = ({ "18.0": "2026", "17.0": "2022", "16.0": "2019", "15.0": "2017" } as Record<string, string>)[
      selected.VisualStudioVersion
    ];
    if (!year || !selected.VSINSTALLDIR || !selected.WindowsSdkDir || !selected.WindowsSDKVersion)
      throw new Error("Native MSVC discovery returned an incomplete toolchain");
    current = {
      ...current,
      ...selected,
      GYP_MSVS_OVERRIDE_PATH: selected.VSINSTALLDIR.replace(/[\\/]+$/, ""),
      GYP_MSVS_VERSION: year,
      WINDOWSSDKDIR: selected.WindowsSdkDir,
      WindowsSDKVersion: selected.WindowsSDKVersion,
    };
    const selectedPath = Object.keys(selected).find(key => key.toLowerCase() === "path");
    if (!selectedPath) throw new Error("Native MSVC discovery returned no tool PATH");
    for (const key of Object.keys(current)) if (key.toLowerCase() === "path") delete current[key];
    current.PATH = selected[selectedPath];
    const sdk = sdkPlan(value.root);
    const sdkReceipt = join(sdk.cache, ".bun-cef-sdk.json");
    if (existsSync(sdkReceipt)) {
      const receipt = JSON.parse(readFileSync(sdkReceipt, "utf8"));
      if (
        receipt.schema !== 1 ||
        receipt.version !== SDK_VERSION ||
        receipt.sdk !== sdk.sdk ||
        receipt.packages?.length !== sdk.packages.length ||
        !sdk.packages.every(id =>
          receipt.packages.some(
            (entry: any) =>
              entry.id === id && entry.version === SDK_PACKAGE_VERSION && typeof entry.sha512 === "string",
          ),
        )
      )
        throw new Error("Optional CEF SDK receipt does not match its exact owner pin");
      const preparedDir = join(sdk.cache, "env");
      mkdirSync(preparedDir, { recursive: true });
      for (const arch of ["x64", "x86"]) {
        const query = Bun.spawn([process.execPath, "msvc", "env", "--arch", arch, "--format", "json"], {
          stdout: "pipe",
          stderr: "pipe",
          windowsHide: true,
        });
        const [json, , status] = await Promise.all([query.stdout.text(), query.stderr.text(), query.exited]);
        if (status !== 0) throw new Error(`Native MSVC ${arch} discovery failed: ${status}`);
        const native = JSON.parse(json);
        const prepared: Record<string, string> = {};
        const whitelist = new Set([
          "path",
          "include",
          "lib",
          "libpath",
          "systemroot",
          "temp",
          "tmp",
          "vcinstalldir",
          "vsinstalldir",
          "windowssdkdir",
          "windowssdkversion",
          "vctoolsinstalldir",
          "visualstudioversion",
          "universalcrtsdkdir",
          "ucrtversion",
        ]);
        const oldRoot = String(native.WindowsSdkDir ?? "").replace(/[\\/]+$/, "");
        const oldVersion = String(native.WindowsSDKVersion ?? "").replace(/[\\/]+$/, "");
        if (!oldRoot || !oldVersion) throw new Error("Native MSVC SDK metadata is incomplete");
        const escaped = oldRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        for (const [key, original] of Object.entries(native)) {
          if (whitelist.has(key.toLowerCase()) && typeof original === "string")
            prepared[key] = original.replace(new RegExp(escaped, "gi"), sdk.sdk).replaceAll(oldVersion, SDK_VERSION);
        }
        writeFileSync(join(preparedDir, `${arch}.json`), `${JSON.stringify(prepared)}\n`);
      }
      const redist = join(selected.VCToolsRedistDir ?? "", "x64");
      if (!selected.VCToolsRedistDir || !existsSync(redist))
        throw new Error("Native MSVC runtime metadata is incomplete");
      const crt = readdirSync(redist).find(name => /^Microsoft\.VC\d+\.CRT$/.test(name));
      if (!crt) throw new Error("Native MSVC runtime payload is absent");
      Object.assign(current, {
        WIN_CUSTOM_TOOLCHAIN: "1",
        CEF_VCVARS: "none",
        CEF_MSVC_ENV_DIR: preparedDir,
        SDK_ROOT: sdk.sdk,
        SDK_VERSION,
        VS_CRT_ROOT: join(redist, crt),
      });
    }
  }
  return {
    ...childEnvironment(value.root, current),
    GN_DEFINES: "is_debug=false is_component_build=false use_remoteexec=false symbol_level=0",
    GN_OUT_CONFIGS: `Release_GN_${process.arch === "arm64" ? "arm64" : "x64"}`,
  };
}

export function sourceCommands(value = layout(), platform = process.platform) {
  const out = `out/Release_GN_${process.arch === "arm64" ? "arm64" : "x64"}`;
  return {
    source: value.cefSource,
    link: value.cefLink,
    chromiumSource: value.chromiumSource,
    upstreamChromiumVersion: CEF_UPSTREAM_CHROMIUM_VERSION,
    targetChromiumVersion: CEF_CHROMIUM_VERSION,
    qualification: "source-port-pending-native-build",
    headers: [
      {
        cwd: value.chromiumSource,
        argv: [
          process.execPath,
          "uv",
          "run",
          "python",
          join(value.cefLink, "tools/version_manager.py"),
          "-u",
          "--fast-check",
        ],
      },
      {
        cwd: value.chromiumSource,
        argv: [
          process.execPath,
          "uv",
          "run",
          "python",
          join(value.cefLink, "tools/make_version_header.py"),
          join(value.cefSource, "include/cef_version.h"),
          "--sandbox-files",
          ...[
            "chrome/chrome_elf/chrome_elf_main.h",
            "sandbox/policy/mojom/sandbox.mojom",
            "sandbox/win/src/sandbox.h",
            "sandbox/win/src/sandbox_types.h",
          ].map(file => join(value.chromiumSource, file)),
        ],
      },
      {
        cwd: value.chromiumSource,
        argv: [
          process.execPath,
          "uv",
          "run",
          "python",
          join(value.cefLink, "tools/make_api_versions_header.py"),
          join(value.cefSource, "include/cef_api_versions.h"),
          join(value.cefSource, "libcef_dll/cef_api_versions.inc"),
          join(value.cefSource, "cef_api_versions.json"),
          join(value.cefSource, "cef_api_untracked.json"),
        ],
      },
    ],
    gen: {
      cwd: value.chromiumSource,
      argv: [process.execPath, "uv", "run", "python", join(value.cefLink, "tools/gclient_hook.py")],
    },
    build: {
      cwd: value.chromiumSource,
      argv: batchCommand(
        [
          join(value.root, "vendor/depot_tools", platform === "win32" ? "autoninja.bat" : "autoninja"),
          "-C",
          out,
          "cefclient",
          "cefsimple",
          "ceftests",
        ],
        platform,
      ),
    },
    package: {
      cwd: value.chromiumSource,
      argv: [
        process.execPath,
        "uv",
        "run",
        "python",
        join(value.cefLink, "tools/make_distrib.py"),
        "--ninja-build",
        process.arch === "arm64" ? "--arm64-build" : "--x64-build",
        "--minimal",
        `--output-dir=${join(value.root, "build/cef-distributions")}`,
      ],
    },
    distribution: value.distribution,
  };
}

export async function nativeReceipt(value = layout()) {
  const { dlopen, CString, FFIType } = await import("bun:ffi");
  const binary = join(value.distribution, value.marker);
  const headers = JSON.parse(readFileSync(join(value.cefSource, ".bun-cef-headers.json"), "utf8"));
  if (
    headers.cefRevision !== CEF_REVISION ||
    headers.chromiumRevision !== CHROMIUM_REVISION ||
    headers.target !== value.target ||
    !Number.isSafeInteger(headers.apiVersion)
  )
    throw new Error("CEF generated header receipt does not match target");
  const library = dlopen(binary, {
    cef_version_info: { args: [FFIType.i32], returns: FFIType.i32 },
    cef_api_hash: { args: [FFIType.i32, FFIType.i32], returns: FFIType.ptr },
  });
  try {
    const version = [4, 5, 6, 7].map(entry => library.symbols.cef_version_info(entry)).join(".");
    if (version !== CEF_CHROMIUM_VERSION || library.symbols.cef_version_info(0) !== Number(CEF_VERSION.split(".")[0]))
      throw new Error(`CEF binary version does not match target Chromium: ${version}`);
    const pointer = library.symbols.cef_api_hash(headers.apiVersion, 0);
    if (!pointer) throw new Error("CEF binary does not implement the generated API version");
    const apiHash = String(new CString(pointer));
    if (!/^[0-9a-f]{40}$/i.test(apiHash)) throw new Error("CEF binary API hash is invalid");
    const sourceHashes = [
      ...readFileSync(join(value.cefSource, "include/cef_api_versions.h"), "utf8").matchAll(
        new RegExp(`#define CEF_API_HASH_${headers.apiVersion} "([0-9a-f]+)"`, "g"),
      ),
    ];
    const platformIndex = process.platform === "win32" ? 0 : process.platform === "darwin" ? 1 : 2;
    if (sourceHashes[platformIndex]?.[1] !== apiHash)
      throw new Error("CEF binary API hash does not match generated headers");
    const receipt = {
      schema: 1,
      chromiumRevision: CHROMIUM_REVISION,
      chromiumVersion: version,
      cefRevision: CEF_REVISION,
      target: value.target,
      apiVersion: headers.apiVersion,
      apiHash,
      binary: { path: value.marker, sha256: new Bun.CryptoHasher("sha256").update(readFileSync(binary)).digest("hex") },
    };
    writeFileSync(join(value.distribution, ".bun-cef-build.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  } finally {
    library.close();
  }
}

export function linkSource(value = layout()) {
  if (!existsSync(join(value.cefSource, "BUILD.gn")) || !existsSync(join(value.chromiumSource, ".gn")))
    throw new Error("CEF and Chromium source owners must exist before linking");
  const version = readFileSync(join(value.chromiumSource, "chrome/VERSION"), "utf8");
  const actual = ["MAJOR", "MINOR", "BUILD", "PATCH"]
    .map(key => new RegExp(`^${key}=(\\d+)\\r?$`, "m").exec(version)?.[1])
    .join(".");
  if (actual !== CEF_CHROMIUM_VERSION) throw new Error(`CEF source target mismatch: Chromium ${actual}`);
  try {
    const entry = lstatSync(value.cefLink);
    if (!entry.isSymbolicLink() || realpathSync(value.cefLink) !== realpathSync(value.cefSource))
      throw new Error("Chromium cef path already has another owner");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    symlinkSync(value.cefSource, value.cefLink, process.platform === "win32" ? "junction" : "dir");
  }
}

export function plan(env: NodeJS.ProcessEnv = process.env) {
  const value = layout(env);
  return {
    ...value,
    cefVersion: CEF_VERSION,
    chromiumVersion: CEF_CHROMIUM_VERSION,
    chromiumRevision: CHROMIUM_REVISION,
    cefRevision: CEF_REVISION,
    source: sourceCommands(value),
    valid: validate(value).length === 0,
    errors: validate(value),
  };
}

function help() {
  console.log(
    `Usage: bun cef <doctor|plan|env|link|headers|gen|build|package|receipt|sdk>\n\nCEF source unique vendor/cef reliée à vendor/chromium/src/cef. SDK officiel optionnel : sdk --plan ou sdk --setup. Aucun prebuilt CEF téléchargé.`,
  );
}

if (import.meta.main) {
  const command = process.argv[2] ?? "help";
  if (command === "help" || command === "-h") help();
  else if (command === "sdk") {
    if (process.argv[3] === "--setup") console.log(JSON.stringify(await setupSdk(), null, 2));
    else if (process.argv[3] === "--plan") console.log(JSON.stringify(sdkPlan(), null, 2));
    else throw new Error("SDK activation requires explicit --plan or --setup");
  } else if (command === "plan") console.log(JSON.stringify(plan(), null, 2));
  else if (command === "env") {
    const value = environment();
    console.log(
      JSON.stringify(
        Object.fromEntries(
          [
            "CEF_PATH",
            "BUN_CHROMIUM_SOURCE",
            "BUN_CEF_VERSION",
            "BUN_CEF_CHROMIUM_VERSION",
            "BUN_CHROMIUM_REVISION",
            "BUN_CEF_SOURCE_REVISION",
          ].map(key => [key, value[key]]),
        ),
        null,
        2,
      ),
    );
  } else if (command === "link") linkSource();
  else if (command === "receipt") console.log(JSON.stringify(await nativeReceipt(), null, 2));
  else if (command === "headers" || command === "gen" || command === "build" || command === "package") {
    linkSource();
    const value = layout();
    const commands = sourceCommands(value);
    const env = await buildEnvironment(value);
    for (const action of command === "build"
      ? [commands.gen, commands.build]
      : command === "headers"
        ? commands.headers
        : command === "package"
          ? [commands.package]
          : [commands.gen]) {
      const child = Bun.spawn(action.argv, {
        cwd: action.cwd,
        env,
        stdio: ["inherit", "inherit", "inherit"],
        windowsHide: true,
      });
      const code = await child.exited;
      if (code !== 0) throw new Error(`CEF ${command} failed: ${code}`);
    }
    if (command === "headers") {
      const header = readFileSync(join(value.cefSource, "include/cef_api_versions.h"), "utf8");
      const apiVersion = Number(/#define CEF_API_VERSION_LAST (?:CEF_API_VERSION_)?(\d+)/.exec(header)?.[1]);
      if (!Number.isSafeInteger(apiVersion) || apiVersion <= 0) throw new Error("CEF generated API version is invalid");
      writeFileSync(
        join(value.cefSource, ".bun-cef-headers.json"),
        `${JSON.stringify({ schema: 1, target: value.target, cefRevision: CEF_REVISION, chromiumRevision: CHROMIUM_REVISION, chromiumVersion: CEF_CHROMIUM_VERSION, apiVersion, qualification: "translated-headers-only" }, null, 2)}\n`,
      );
    }
  } else if (command === "doctor") {
    const result = plan();
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } else {
    console.error(`Commande CEF inconnue: ${command}`);
    process.exitCode = 2;
  }
}
