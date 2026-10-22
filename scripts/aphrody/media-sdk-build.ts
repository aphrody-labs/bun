import { chmod, mkdir, realpath, readdir } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { closeSync, openSync, existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import {
  hashSDKFile,
  mediaSDKPlan,
  type MediaSDKComponent,
  type MediaSDKTarget,
} from "../../packages/bun-video/src/sdk";
import { mediaSDKHostTarget } from "../../packages/bun-video/src/sdk-platform";
import { targetFor, type HostArch, type HostPlatform } from "../../packages/bun-runtime-sdk/src/target";
import { mediaSDKTool, mediaSourceTree, verifyMediaSourceOwner, verifyMediaVulkanOwner } from "./media-sdk-source";
import {
  validateZlibSDKGate,
  zlibSDKLibrary,
  zlibSDKLicense,
  zlibSDKOwner,
  zlibSDKRepository,
  type ZlibSDKGate,
} from "./native-sdk-factory";

export type MediaBuildComponent = MediaSDKComponent | "avio";
export interface MediaBuildInput {
  component: MediaBuildComponent;
  target: MediaSDKTarget;
  root: string;
  sources: string;
  output: string;
  prefix: string;
  source?: string;
  dependencies: Partial<
    Record<"ffmpeg" | "zlib" | "libplacebo" | "freetype" | "fribidi" | "harfbuzz" | "libass", string>
  >;
}
export interface MediaBuildCommand {
  argv: string[];
  cwd: string;
  timeout: number;
}

/** Plans stay portable; executing recipes additionally admit the native host's affinity. */
export function mediaBuildJobs(requested = Bun.env.BUN_MEDIA_JOBS ?? "2", cpus?: number): number {
  if (!/^[1-9][0-9]{0,3}$/.test(requested) || Number(requested) > 1024)
    throw new Error("BUN_MEDIA_JOBS must be an integer from 1 through 1024");
  const jobs = Number(requested);
  if (cpus !== undefined && (!Number.isSafeInteger(cpus) || cpus < 1 || jobs > cpus))
    throw new Error("Media jobs exceed the executing host's available CPUs");
  return jobs;
}

export function mediaGNUCompatibilityRustFlags(object: string, wraps: readonly string[]) {
  if (
    !isAbsolute(object) ||
    /\s/.test(object) ||
    !wraps.includes("getrandom") ||
    !wraps.includes("statx") ||
    !wraps.includes("fcntl64") ||
    wraps.length > 64 ||
    new Set(wraps).size !== wraps.length ||
    wraps.some(symbol => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(symbol))
  )
    throw new Error("Canonical GNU compatibility object lacks its required bounded wrappers");
  return (
    ` -C link-arg=${object} ` +
    wraps.map(symbol => `-C link-arg=-Wl,--wrap=${symbol}`).join(" ") +
    " -C link-arg=-ldl -C link-arg=-lm"
  );
}

function nativeGitBash(): string {
  if (Bun.env.BUN_MEDIA_BASH) return Bun.env.BUN_MEDIA_BASH;
  const git = Bun.which("git");
  const candidates = [
    ...(git ? [resolve(dirname(git), "../bin/bash.exe"), resolve(dirname(git), "../usr/bin/bash.exe")] : []),
    ...[process.env.ProgramFiles, process.env.ProgramW6432]
      .filter((path): path is string => !!path)
      .map(path => join(path, "Git/bin/bash.exe")),
  ];
  const bash = candidates.find(path => existsSync(path));
  if (!bash) throw new Error("Windows media recipes require the existing native Git Bash owner");
  return bash;
}

export function mediaBuildTarget(target: MediaSDKTarget) {
  mediaSDKPlan("ffmpeg", target);
  const [os, architecture] = target.split("-");
  const platform = (os === "windows" ? "win32" : os) as HostPlatform;
  const arch = architecture as HostArch;
  const abi = os === "linux" ? (target.endsWith("-musl") ? "musl" : "gnu") : undefined;
  return {
    platform,
    arch,
    abi,
    rust: targetFor(platform, arch, abi),
    machine: arch === "arm64" ? "aarch64" : "x86_64",
  };
}

/** Pure executable recipes; a plan never attests a native provider or starts a build. */
export function mediaBuildPlan(input: MediaBuildInput) {
  const jobs = mediaBuildJobs();
  const { component, root, sources, output, prefix, target } = input;
  if (![root, sources, output, prefix, ...Object.values(input.dependencies)].every(isAbsolute))
    throw new TypeError("Media build owners and outputs must be absolute");
  if (!["ffmpeg", "mpv", "avio"].includes(component)) throw new TypeError("Unsupported media build component");
  const selected = mediaBuildTarget(target);
  const windows = selected.platform === "win32",
    linux = selected.platform === "linux";
  const source =
    input.source ?? (component === "avio" ? join(root, "packages/bun-video/native") : join(sources, component));
  if (!isAbsolute(source)) throw new TypeError("Media source owner must be absolute");
  for (const destination of [output, prefix]) {
    const within = relative(resolve(source), resolve(destination));
    if (!within || (!within.startsWith("..") && !isAbsolute(within)))
      throw new Error("Media build products overlap their source owner");
    if (resolve(destination) === resolve(root))
      throw new Error("Media build products cannot replace the source checkout root");
  }
  const build = join(output, "build");
  if (linux && component !== "avio" && resolve(prefix) !== resolve(output, "prefix"))
    throw new Error("Portable Linux C recipes install into OUTPUT/prefix");
  const dependencies = component === "ffmpeg" ? (["zlib"] as const) : (["ffmpeg"] as const);
  const sourceDependencies =
    component === "mpv" ? (["libplacebo", "fast_float", "freetype", "fribidi", "harfbuzz", "libass"] as const) : [];
  const missing = dependencies
    .filter(name => !input.dependencies[name])
    .map(name => `Qualified ${target} ${name} SDK prefix`);
  if (component === "mpv") missing.push("Pinned Vulkan header owner and notices for libplacebo CPU stubs");
  const commands: MediaBuildCommand[] = [];
  const command = (argv: string[], cwd: string, timeout: number) => commands.push({ argv, cwd, timeout });
  const native = (argv: string[]) =>
    windows ? [process.execPath, "msvc", "exec", "--arch", selected.arch, "--", ...argv] : argv;
  const sameHostPlatform = process.platform === selected.platform;
  const bash =
      windows && sameHostPlatform
        ? nativeGitBash()
        : (Bun.env.BUN_MEDIA_BASH ?? (sameHostPlatform ? Bun.which("bash") : undefined) ?? "bash"),
    make = Bun.env.BUN_MEDIA_MAKE ?? (sameHostPlatform ? Bun.which("make") : undefined) ?? "make";
  if (windows && sameHostPlatform && (!isAbsolute(bash) || /(?:^|[\\/])(?:System32|SysWOW64)[\\/]/i.test(bash)))
    throw new Error("Windows media recipes require the native Git/MSYS Bash owner; WSL launchers are refused");
  const meson = [process.execPath, "uv", "tool", "run", "--from", "meson", "--with", "jinja2", "meson"];
  const env: Record<string, string> = {
    BUN_MEDIA_JOBS: String(jobs),
    CARGO_BUILD_JOBS: String(jobs),
    OMP_NUM_THREADS: String(jobs),
    PKG_CONFIG_PATH: "",
  };
  if (component === "avio") {
    const ffmpeg = input.dependencies.ffmpeg ?? "<qualified-ffmpeg-prefix>";
    env.FFMPEG_DIR = ffmpeg;
    env.PKG_CONFIG_LIBDIR = join(ffmpeg, "lib/pkgconfig");
    env.CARGO_TARGET_DIR = join(output, "cargo");
    if (!linux && !windows) {
      env.MACOSX_DEPLOYMENT_TARGET = "13.0";
      env.RUSTFLAGS = "-C link-arg=-Wl,-rpath,@loader_path/../lib";
    }
    if (linux) {
      const sysroot =
        Bun.env.BUN_MEDIA_SYSROOT ??
        `/opt/linux-sysroot-${selected.abi === "gnu" ? "glibc" : "musl"}${selected.arch === "arm64" ? "-arm64" : ""}`;
      const llvm = Bun.env.BUN_MEDIA_LLVM_BIN ?? "/usr/lib/llvm-23/bin";
      const gcc = Bun.env.BUN_MEDIA_GCC_DIRECTORY ?? "<measured-target-gcc-directory>";
      const flags = [
        `--target=${selected.machine}-linux-${selected.abi}`,
        `--sysroot=${sysroot}`,
        `--gcc-install-dir=${gcc}`,
      ];
      env.BUN_MEDIA_SYSROOT = sysroot;
      env.BUN_MEDIA_LLVM_BIN = llvm;
      env.BUN_MEDIA_GCC_DIRECTORY = gcc;
      env[`CARGO_TARGET_${selected.rust.replaceAll("-", "_").toUpperCase()}_LINKER`] = join(llvm, "clang");
      env.BINDGEN_EXTRA_CLANG_ARGS = flags.join(" ");
      env.RUSTFLAGS =
        flags.map(flag => `-C link-arg=${flag}`).join(" ") +
        " -C link-arg=-fuse-ld=lld -C link-arg=-static-libgcc -C link-arg=-Wl,--gc-sections";
      if (selected.abi === "gnu") {
        command(
          [
            join(llvm, "clang++"),
            ...flags,
            "-std=c++17",
            "-O2",
            "-fPIC",
            // Linked into a Rust binary without libstdc++: no unwinding or guard symbols, as in Bun's own build.
            "-fno-exceptions",
            "-fno-threadsafe-statics",
            "-ffunction-sections",
            "-fdata-sections",
            "-D_GNU_SOURCE",
            "-c",
            join(root, "src/jsc/bindings/workaround-missing-symbols.cpp"),
            "-o",
            join(output, "bun-glibc-compat.o"),
          ],
          root,
          60_000,
        );
        // rustc links -lgcc_s for std's unwinder and ignores -static-libgcc (it passes -nodefaultlibs); this
        // script, searched before the toolchain's libgcc_s.so, resolves it to the static libgcc_eh instead.
        const unwinder = join(output, "static-unwinder");
        env.RUSTFLAGS += ` -L native=${unwinder}`;
        command(
          [bash, "-c", 'mkdir -p "$1" && printf "INPUT(-lgcc_eh)\\n" > "$1/libgcc_s.so"', "bash", unwinder],
          root,
          60_000,
        );
      } else env.RUSTFLAGS += " -C target-feature=-crt-static";
      missing.push(
        "Installed LLVM, target GCC/sysroot and Rust standard library; native libc closure gates remain mandatory",
      );
    }
    command(
      native([
        process.execPath,
        join(root, "scripts/build/rust/cargo-serial.ts"),
        "build",
        "--locked",
        "--offline",
        "--release",
        "--jobs",
        String(jobs),
        "--target",
        selected.rust,
        "--manifest-path",
        join(source, "Cargo.toml"),
        "--no-default-features",
        "--features",
        "filmcraft,libav,mpv",
      ]),
      root,
      7_200_000,
    );
  } else if (linux) {
    command(
      [
        bash,
        join(root, "scripts/aphrody/media-sdk-linux.sh"),
        target,
        component,
        sources,
        output,
        ...(input.dependencies.ffmpeg ? [input.dependencies.ffmpeg] : []),
      ],
      root,
      10_800_000,
    );
    if (input.dependencies.zlib) env.BUN_MEDIA_ZLIB_PREFIX = input.dependencies.zlib;
  } else if (component === "ffmpeg") {
    const zlib = input.dependencies.zlib ?? "<qualified-zlib-prefix>";
    const flags = windows
      ? [
          "--toolchain=msvc",
          "--cc=clang-cl",
          "--ld=lld-link",
          `--extra-cflags=-I${join(zlib, "include").replaceAll("\\", "/")}`,
          `--extra-ldflags=-libpath:${join(zlib, "lib").replaceAll("\\", "/")}`,
        ]
      : [
          "--cc=clang",
          "--cxx=clang++",
          "--install-name-dir=@rpath",
          `--extra-cflags=-I${join(zlib, "include")} -mmacosx-version-min=13.0`,
          `--extra-ldflags=-L${join(zlib, "lib")} -mmacosx-version-min=13.0 -Wl,-rpath,@loader_path/../lib`,
        ];
    env.PKG_CONFIG_LIBDIR = join(zlib, "lib/pkgconfig");
    if (!windows) env.MACOSX_DEPLOYMENT_TARGET = "13.0";
    command(
      native([
        bash,
        join(source, "configure"),
        `--prefix=${prefix.replaceAll("\\", "/")}`,
        `--arch=${selected.machine}`,
        `--target-os=${windows ? "win32" : "darwin"}`,
        "--enable-shared",
        "--disable-static",
        "--disable-autodetect",
        "--enable-zlib",
        "--disable-doc",
        "--disable-debug",
        "--disable-ffplay",
        "--disable-checkasm",
        "--disable-gpl",
        "--disable-nonfree",
        ...flags,
      ]),
      build,
      300_000,
    );
    for (const args of [
      [make, `-j${jobs}`],
      [make, "install", "V=1"],
    ])
      command(
        native(
          windows
            ? [
                bash,
                "-c",
                'exec "$@"',
                "bun-media",
                ...args,
                `SHELL=${resolve(dirname(bash), "../usr/bin/sh.exe").replaceAll("\\", "/")}`,
              ]
            : args,
        ),
        build,
        args[1] === "install" ? 180_000 : 7_200_000,
      );
  } else {
    env.CC = windows ? "clang-cl" : "clang";
    env.CXX = windows ? "clang-cl" : "clang++";
    env.PKG_CONFIG_LIBDIR = [
      join(prefix, "lib/pkgconfig"),
      ...Object.values(input.dependencies).map(path => join(path, "lib/pkgconfig")),
    ].join(delimiter);
    if (!windows) {
      env.MACOSX_DEPLOYMENT_TARGET = "13.0";
      env.CFLAGS = "-mmacosx-version-min=13.0";
      env.CXXFLAGS = env.CFLAGS;
    }
    const dependencyOptions = {
      freetype: ["-Dharfbuzz=disabled", "-Dzlib=internal"],
      fribidi: ["-Ddocs=false", "-Dbin=false", "-Dtests=false"],
      harfbuzz: [
        "-Dfreetype=enabled",
        "-Dtests=disabled",
        "-Dutilities=disabled",
        "-Ddocs=disabled",
        "-Dintrospection=disabled",
      ],
      libass: [
        "-Dfontconfig=disabled",
        "-Dlibunibreak=disabled",
        "-Drequire-system-font-provider=false",
        "-Dasm=enabled",
      ],
      libplacebo: [
        "-Ddemos=false",
        "-Dtests=false",
        "-Dbench=false",
        "-Dvulkan=disabled",
        "-Dopengl=disabled",
        "-Dd3d11=disabled",
        "-Dglslang=disabled",
        "-Dshaderc=disabled",
        "-Dlcms=disabled",
        "-Ddovi=disabled",
        "-Dlibdovi=disabled",
        "-Dunwind=disabled",
        "-Dxxhash=disabled",
      ],
    };
    for (const [name, options] of Object.entries(dependencyOptions)) {
      const directory = join(output, `build-${name}`);
      command(
        native([
          ...meson,
          "setup",
          directory,
          join(sources, name),
          `--prefix=${prefix}`,
          "--libdir=lib",
          "--buildtype=release",
          "--wrap-mode=nodownload",
          "-Ddefault_library=shared",
          "-Dauto_features=disabled",
          ...options,
        ]),
        root,
        300_000,
      );
      command(native([...meson, "compile", "-C", directory, `-j${jobs}`]), root, 2_400_000);
      command(native([...meson, "install", "-C", directory]), root, 180_000);
    }
    command(
      native([
        ...meson,
        "setup",
        build,
        source,
        `--prefix=${prefix}`,
        "--libdir=lib",
        "--buildtype=release",
        "--wrap-mode=nodownload",
        "-Dlibmpv=true",
        "-Dcplayer=true",
        "-Ddefault_library=shared",
        "-Dbuild-date=false",
        "-Dgpl=false",
        "-Dauto_features=disabled",
        "-Dgl=disabled",
        "-Dvulkan=disabled",
      ]),
      root,
      300_000,
    );
    command(native([...meson, "compile", "-C", build, `-j${jobs}`]), root, 2_400_000);
    command(native([...meson, "install", "-C", build]), root, 180_000);
  }
  return {
    schema: 1,
    target,
    component,
    selected,
    source,
    prefix,
    build,
    env,
    dependencies,
    sourceDependencies,
    missing,
    commands,
    qualification: "recipe-only; source, ABI, closure, native AVIO/CLI and license gates required",
    maxJobs: jobs,
    sidecarFeatures: component === "avio" ? ["filmcraft", "libav", "mpv"] : [],
    hardwareQualification: false,
  };
}

export function validateMediaDependencyReceipt(value: unknown, component: string, target: MediaSDKTarget) {
  if (!value || typeof value !== "object") throw new Error("Qualified media dependency receipt is absent");
  const r = value as Record<string, unknown>;
  const files = r.files as Record<string, unknown> | undefined,
    licenses = r.licenses;
  mediaBuildTarget(target);
  if (
    r.schema !== 1 ||
    r.component !== component ||
    r.target !== target ||
    !files ||
    typeof files !== "object" ||
    !Array.isArray(licenses) ||
    !licenses.length
  )
    throw new Error("Media dependency receipt differs from its component, target or license closure");
  if (
    Object.entries(files).some(
      ([name, digest]) =>
        !name ||
        name.includes("\\") ||
        name.startsWith("/") ||
        /^[A-Za-z]:/.test(name) ||
        name.split("/").includes("..") ||
        typeof digest !== "string" ||
        !/^[a-f0-9]{64}$/.test(digest),
    )
  )
    throw new Error("Media dependency receipt contains an invalid member identity");
  if (licenses.some(name => typeof name !== "string" || !Object.hasOwn(files, name)))
    throw new Error("Media dependency license lacks a file hash");
  if (
    ["ffmpeg", "mpv"].includes(component) &&
    r.sourceRevision !== mediaSDKPlan(component as MediaSDKComponent, target).sourceRevision
  )
    throw new Error("Media dependency source differs from its catalogue pin");
  const qualification = r.nativeQualification as Record<string, unknown> | undefined;
  if (component === "zlib") {
    const objectId = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
    if (
      r.kind !== "native-sdk" ||
      r.package !== "zlib-rs" ||
      r.sourceRepository !== zlibSDKRepository ||
      r.sourceOwner !== zlibSDKOwner ||
      !objectId.test(String(r.sourceRevision)) ||
      !objectId.test(String(r.sourceTree)) ||
      r.consumer !== "aphrody-bun" ||
      r.zlibVersion !== `1.3.2.zlib-rs-${r.version}`
    )
      throw new Error("Canonical zlib-rs native SDK source or identity differs");
    validateZlibSDKGate(r.gate as ZlibSDKGate);
    const library = zlibSDKLibrary(target);
    if (
      JSON.stringify(r.includes) !== JSON.stringify(["include"]) ||
      !Object.hasOwn(files, "include/zlib.h") ||
      !Object.hasOwn(files, "include/zconf.h") ||
      JSON.stringify(r.libraries) !== JSON.stringify([library]) ||
      !Object.hasOwn(files, library) ||
      !licenses.includes(zlibSDKLicense) ||
      !Array.isArray(r.systemLibraries) ||
      r.systemLibraries.length > 32 ||
      r.systemLibraries.some(name => typeof name !== "string" || !/^[A-Za-z0-9_.+:/-]{1,64}$/.test(name))
    )
      throw new Error("Canonical zlib-rs native SDK lacks its headers, static archive or notice");
  } else if (
    !qualification ||
    (qualification.status !== "pass" && qualification.passed !== true) ||
    qualification.target !== target
  )
    throw new Error("Media dependency lacks an executed native target qualification");
  return { ...r, files: files as Record<string, string> };
}

async function verifyDependency(prefix: string, component: string, target: MediaSDKTarget) {
  const mediaFile = Bun.file(join(prefix, "bun-sdk-receipt.json"));
  const receiptFile = (await mediaFile.exists()) ? mediaFile : Bun.file(join(prefix, "bun-native-sdk.json"));
  if (receiptFile.size > 16 * 1024 * 1024) throw new Error("Media dependency receipt exceeded its bound");
  const receipt = validateMediaDependencyReceipt(await receiptFile.json(), component, target);
  const canonical = await realpath(prefix);
  for (const [name, expected] of Object.entries(receipt.files)) {
    const path = await realpath(join(prefix, name));
    const member = relative(canonical, path);
    if (member.startsWith("..") || isAbsolute(member) || (await hashSDKFile(path)) !== expected)
      throw new Error(`Qualified media dependency changed: ${component}: ${name}`);
  }
  return receipt;
}

async function cargoNotices(input: MediaBuildInput, plan: ReturnType<typeof mediaBuildPlan>) {
  const raw = await mediaSDKTool(
    [
      "cargo",
      "metadata",
      "--locked",
      "--offline",
      "--format-version",
      "1",
      "--manifest-path",
      join(plan.source, "Cargo.toml"),
      "--filter-platform",
      plan.selected.rust,
      "--no-default-features",
      "--features",
      "filmcraft,libav,mpv",
    ],
    input.root,
  );
  const metadata = JSON.parse(raw) as {
    packages: Array<{
      id: string;
      name: string;
      version: string;
      license: string | null;
      license_file: string | null;
      manifest_path: string;
      source: string | null;
    }>;
    resolve: {
      root: string | null;
      nodes: Array<{ id: string; deps: Array<{ pkg: string; dep_kinds: Array<{ kind: string | null }> }> }>;
    } | null;
  };
  // The root workspace lists every member; only the sidecar's linked closure (normal and build deps) ships.
  const nodes = new Map(metadata.resolve?.nodes.map(node => [node.id, node]));
  const closure = new Set<string>();
  const pending = metadata.resolve?.root ? [metadata.resolve.root] : [];
  for (let id; (id = pending.pop()) !== undefined; ) {
    if (closure.has(id)) continue;
    closure.add(id);
    for (const dep of nodes.get(id)?.deps ?? [])
      if (dep.dep_kinds.some(kind => kind.kind !== "dev")) pending.push(dep.pkg);
  }
  if (!closure.size) throw new Error("Native media Cargo metadata lacks its resolved sidecar root");
  const linked = metadata.packages.filter(pkg => closure.has(pkg.id));
  if (linked.length !== closure.size || linked.length > 2048)
    throw new Error("Native media Cargo license inventory exceeded its bound");
  const packages: Array<{
      name: string;
      version: string;
      license: string | null;
      source: string;
      notices: Record<string, string>;
    }> = [],
    files: Array<{ source: string; member: string; sha256: string }> = [];
  for (const pkg of linked) {
    if (
      !/^[A-Za-z0-9._+-]+$/.test(pkg.name) ||
      !/^[A-Za-z0-9._+-]+$/.test(pkg.version) ||
      (!pkg.license && !pkg.license_file)
    )
      throw new Error("Native media Cargo source lacks a license identity");
    let base = await realpath(dirname(pkg.manifest_path));
    const notices = new Set<string>();
    for await (const name of new Bun.Glob("{LICENSE*,COPYING*,NOTICE*}").scan({ cwd: base, onlyFiles: true }))
      notices.add(name);
    if (pkg.license_file) notices.add(pkg.license_file);
    // Workspace crates (filmcraft-*) inherit the notices of their nearest owning directory in this checkout.
    if (!pkg.source) {
      const checkout = await realpath(input.root);
      for (let parent = dirname(base); !notices.size; parent = dirname(parent)) {
        const within = relative(checkout, parent);
        if (within.startsWith("..") || isAbsolute(within)) break;
        for await (const name of new Bun.Glob("{LICENSE*,COPYING*,NOTICE*}").scan({ cwd: parent, onlyFiles: true }))
          notices.add(name);
        if (notices.size) base = parent;
        if (!within) break;
      }
    }
    if (!notices.size && pkg.source?.startsWith("git+https://")) {
      const revision = pkg.source.slice(pkg.source.lastIndexOf("#") + 1);
      const workspace = (await mediaSDKTool(["git", "rev-parse", "--show-toplevel"], base)).trim();
      const relativeCrate = relative(workspace, base);
      if (
        !/^[a-f0-9]{40}$/.test(revision) ||
        relativeCrate.startsWith("..") ||
        isAbsolute(relativeCrate) ||
        (await mediaSDKTool(["git", "rev-parse", "HEAD"], workspace)).trim() !== revision ||
        (await mediaSDKTool(["git", "status", "--porcelain", "--", "."], workspace)).trim()
      )
        throw new Error("Git crate workspace notice owner differs from the locked source");
      base = await realpath(workspace);
      for await (const name of new Bun.Glob("{LICENSE*,COPYING*,NOTICE*}").scan({ cwd: base, onlyFiles: true }))
        notices.add(name);
    }
    // A crate that ships no notice file (ffmpeg-sys-next) declares its license only in its published manifest.
    if (!notices.size && pkg.license && pkg.source?.startsWith("registry+")) notices.add("Cargo.toml");
    if (!notices.size) throw new Error(`Native media Cargo source lacks retained notices: ${pkg.name}`);
    const hashes: Record<string, string> = {};
    for (const name of notices) {
      const source = await realpath(join(base, name)),
        member = relative(base, source).replaceAll("\\", "/");
      if (member.startsWith("..") || isAbsolute(member) || Bun.file(source).size > 1024 * 1024)
        throw new Error("Native Cargo notice escaped its source owner");
      const sha256 = await hashSDKFile(source);
      files.push({ source, member: `share/licenses/rust/${pkg.name}/${pkg.version}/${member}`, sha256 });
      hashes[member] = sha256;
    }
    let source = "bun-video-native-workspace";
    if (pkg.source) {
      const url = new URL(pkg.source.replace(/^(?:git|registry)\+/, ""));
      if (url.username || url.password || url.protocol !== "https:")
        throw new Error("Cargo source receipt contains a credential-bearing or foreign source URL");
      source = pkg.source.replace(/\?.*?(?=#|$)/, "");
    }
    packages.push({ name: pkg.name, version: pkg.version, license: pkg.license, source, notices: hashes });
  }
  return { packages, files, lockSHA256: await hashSDKFile(join(input.root, "Cargo.lock")) };
}

/** No subprocess can start before every selected source and dependency is verified. */
export async function verifyMediaBuildInputs(input: MediaBuildInput) {
  const plan = mediaBuildPlan(input);
  let source: Record<string, unknown> | undefined =
    input.component === "avio" ? undefined : await verifyMediaSourceOwner(input.component, plan.source);
  const dependencies: Record<string, unknown> = {};
  for (const name of plan.dependencies) {
    const path = input.dependencies[name];
    if (!path) throw new Error(`Qualified ${input.target} ${name} SDK prefix is absent`);
    dependencies[name] = await verifyDependency(path, name, input.target);
  }
  for (const name of plan.sourceDependencies) {
    const path =
      name === "fast_float" ? join(input.sources, "libplacebo/3rdparty/fast_float") : join(input.sources, name);
    dependencies[`source:${name}`] = await verifyMediaSourceOwner(name, path);
  }
  if (input.component === "mpv") {
    const vulkan = Bun.env.BUN_MEDIA_VULKAN_HEADERS;
    if (!vulkan || !isAbsolute(vulkan) || !(await Bun.file(join(vulkan, "vulkan/vulkan.h")).exists()))
      throw new Error("Media dependency requires the existing pinned Vulkan header owner");
    const notice = Bun.env.BUN_MEDIA_VULKAN_LICENSE;
    if (!notice) throw new Error("Pinned Vulkan headers require their existing license notice owner");
    const qualified = await verifyMediaVulkanOwner(vulkan, notice);
    dependencies["source:vulkan-headers"] = qualified.headers;
    dependencies["source:vulkan-license"] = qualified.license;
    plan.env.CFLAGS = `${plan.env.CFLAGS ?? ""} ${process.platform === "win32" ? "/I" : "-I"}${vulkan}`.trim();
    plan.env.CXXFLAGS = plan.env.CFLAGS;
  }
  if (input.component === "avio") {
    if (
      (
        await mediaSDKTool(
          ["git", "status", "--porcelain", "--untracked-files=normal", "--", "packages/bun-video/native"],
          input.root,
        )
      ).trim()
    )
      throw new Error("Native AVIO source contains unpublished changes");
    const names = (await mediaSDKTool(["git", "ls-files", "-z", "--", "."], plan.source)).split("\0").filter(Boolean);
    source = {
      owner: "packages/bun-video/native",
      repository: "https://github.com/aphrody-labs/bun",
      revision: (await mediaSDKTool(["git", "rev-parse", "HEAD"], input.root)).trim(),
      cleanScope: "packages/bun-video/native",
      ...(await mediaSourceTree(plan.source, names)),
    };
    if (plan.selected.platform === "linux") {
      const directory = join(
        plan.env.BUN_MEDIA_SYSROOT!,
        "usr/lib/gcc",
        `${plan.selected.machine}-linux-${plan.selected.abi}`,
      );
      const entries = await readdir(directory, { withFileTypes: true });
      const gcc =
        Bun.env.BUN_MEDIA_GCC_DIRECTORY ??
        (entries.length === 1 && entries[0]?.isDirectory() ? join(directory, entries[0].name) : undefined);
      if (!gcc || !isAbsolute(gcc)) throw new Error("Portable AVIO needs one measured target GCC directory");
      const within = relative(await realpath(plan.env.BUN_MEDIA_SYSROOT!), await realpath(gcc));
      if (within.startsWith("..") || isAbsolute(within))
        throw new Error("Portable GCC directory escaped its target sysroot");
      for (const command of plan.commands)
        command.argv = command.argv.map(arg => arg.replace("<measured-target-gcc-directory>", gcc));
      for (const key of Object.keys(plan.env))
        plan.env[key] = plan.env[key]!.replaceAll("<measured-target-gcc-directory>", gcc);
      const linker = plan.env[`CARGO_TARGET_${plan.selected.rust.replaceAll("-", "_").toUpperCase()}_LINKER`];
      if (!linker || !(await Bun.file(linker).exists())) throw new Error("Portable AVIO target linker is absent");
    }
  }
  const cargo = input.component === "avio" ? await cargoNotices(input, plan) : undefined;
  return { plan, source, dependencies, cargo };
}

export async function runMediaBuild(input: MediaBuildInput, configureOnly = false) {
  mediaBuildJobs(undefined, availableParallelism());
  const verified = await verifyMediaBuildInputs(input),
    { plan } = verified;
  if (configureOnly && plan.selected.platform === "linux")
    throw new Error(
      "Portable Linux owner runs configure/build/install together; use sdk-build-plan for read-only configuration",
    );
  if (configureOnly && input.component !== "ffmpeg")
    throw new Error("Only the FFmpeg owner exposes configure without compiling dependencies");
  if (
    plan.selected.platform !== process.platform ||
    (plan.selected.platform !== "linux" && input.target !== mediaSDKHostTarget())
  )
    throw new Error("Native media recipe belongs to its requested platform and architecture owner");
  const heavy = Bun.env.BUN_MEDIA_HEAVY_LOCK;
  if (!heavy || !isAbsolute(heavy)) throw new Error("Media build requires the existing host heavy.lock path");
  // Linux C recipes already hold the host flock. Other native recipes must enter through that owner too.
  const externalFlock = process.platform === "linux" && input.component === "avio";
  let fd: number | undefined;
  if (process.platform !== "linux") fd = openSync(heavy, "wx");
  try {
    await mkdir(plan.build, { recursive: true });
    await mkdir(input.prefix, { recursive: true });
    for (const [index, step] of plan.commands.entries()) {
      if (configureOnly && index > 0) break;
      mediaBuildJobs(plan.env.BUN_MEDIA_JOBS, availableParallelism());
      if (input.component === "avio") {
        const files = verified.source!.files as Record<string, { sha256: string }>;
        for (const [name, expected] of Object.entries(files))
          if ((await hashSDKFile(join(plan.source, name))) !== expected.sha256)
            throw new Error("Native AVIO source changed after preflight");
      }
      const argv = externalFlock ? ["flock", "-n", heavy, ...step.argv] : step.argv;
      await mediaSDKTool(argv, step.cwd, step.timeout, {
        ...process.env,
        ...plan.env,
        // verifyMediaBuildInputs hashed every source owner above.
        BUN_MEDIA_SOURCES_VERIFIED: "1",
        GH_TOKEN: undefined,
        GITHUB_TOKEN: undefined,
        TYPESAFE_API_KEY: undefined,
        TYPESAFE_API_KEY_FILE: undefined,
        CPATH: undefined,
        C_INCLUDE_PATH: undefined,
        CPLUS_INCLUDE_PATH: undefined,
        LIBRARY_PATH: undefined,
        LD_LIBRARY_PATH: undefined,
        LD_PRELOAD: undefined,
        RUSTC_WRAPPER: undefined,
        CARGO_BUILD_RUSTC_WRAPPER: undefined,
      });
      if (input.component === "avio" && plan.selected.abi === "gnu" && index === 0) {
        const object = join(input.output, "bun-glibc-compat.o");
        const text = await mediaSDKTool(
          [join(plan.env.BUN_MEDIA_LLVM_BIN!, "llvm-nm"), "--defined-only", "--extern-only", object],
          input.root,
        );
        const wraps = [...text.matchAll(/\b__wrap_([A-Za-z_][A-Za-z0-9_]*)$/gm)].map(match => match[1]!);
        plan.env.RUSTFLAGS += mediaGNUCompatibilityRustFlags(object, wraps);
        verified.dependencies["gnu-compatibility"] = {
          owner: "src/jsc/bindings/workaround-missing-symbols.cpp",
          sourceSHA256: await hashSDKFile(join(input.root, "src/jsc/bindings/workaround-missing-symbols.cpp")),
          objectSHA256: await hashSDKFile(object),
          wrapSymbols: wraps,
        };
      }
      if (index === 0 && input.component === "ffmpeg" && process.platform === "win32")
        for (const name of ["Makefile", "ffbuild/config.mak"])
          await Bun.write(
            join(plan.build, name),
            (await Bun.file(join(plan.build, name)).text()).replace(
              /\/([a-z])\//g,
              (_, drive: string) => `${drive.toUpperCase()}:/`,
            ),
          );
    }
    if (!configureOnly && input.component === "avio") {
      const products = join(input.output, "cargo", plan.selected.rust, "release");
      const windows = plan.selected.platform === "win32";
      for (const [from, to] of [
        [`bun-video-native${windows ? ".exe" : ""}`, "bin"],
        [
          windows
            ? "bun_video_native.dll"
            : `libbun_video_native.${plan.selected.platform === "darwin" ? "dylib" : "so"}`,
          windows ? "bin" : "lib",
        ],
      ]) {
        const source = join(products, from!),
          destination = join(input.prefix, to!, from!);
        await mkdir(dirname(destination), { recursive: true });
        await Bun.write(destination, Bun.file(source));
        if (!windows) await chmod(destination, to === "bin" ? 0o755 : 0o644);
      }
      const cargo = verified.cargo!;
      for (const notice of cargo.files) {
        if ((await hashSDKFile(notice.source)) !== notice.sha256)
          throw new Error("Cargo source notice changed since preflight");
        const destination = join(input.prefix, notice.member);
        await mkdir(dirname(destination), { recursive: true });
        await Bun.write(destination, Bun.file(notice.source));
      }
      await Bun.write(
        join(input.prefix, "share/licenses/rust/manifest.json"),
        JSON.stringify({ packages: cargo.packages, lockSHA256: cargo.lockSHA256 }, null, 2),
      );
    }
    if (!configureOnly) {
      if (input.component !== "avio") {
        const owner = input.component;
        const sources = [owner, ...plan.sourceDependencies];
        const pins = (await import("./media-sdk-sources.json")).default.sources;
        for (const name of sources) {
          for (const license of pins[name as keyof typeof pins].licenses) {
            const destination = join(input.prefix, "share/licenses", name, license);
            await mkdir(dirname(destination), { recursive: true });
            const source =
              name === "fast_float"
                ? join(input.sources, "libplacebo/3rdparty/fast_float", license)
                : join(name === owner ? plan.source : join(input.sources, name), license);
            await Bun.write(destination, Bun.file(source));
          }
        }
        if (input.component === "mpv") {
          const destination = join(input.prefix, "share/licenses/vulkan-headers/copyright");
          await mkdir(dirname(destination), { recursive: true });
          await Bun.write(destination, Bun.file(Bun.env.BUN_MEDIA_VULKAN_LICENSE!));
        }
        // Runtime libraries and their notices stay in the closure of each independently distributed SDK.
        for (const [name, raw] of Object.entries(verified.dependencies)) {
          if (name.startsWith("source:")) continue;
          const receipt = raw as { files: Record<string, string> };
          const base = input.dependencies[name as keyof typeof input.dependencies]!;
          for (const [member, digest] of Object.entries(receipt.files)) {
            if (
              !member.startsWith("share/licenses/") &&
              !/^(?:bin|lib)\/[^/]+\.(?:dll|dylib|so(?:\.[0-9.]+)?)$/.test(member)
            )
              continue;
            const destination = join(input.prefix, member);
            if (await Bun.file(destination).exists()) {
              if ((await hashSDKFile(destination)) !== digest) throw new Error("Media dependency owners collide");
              continue;
            }
            await mkdir(dirname(destination), { recursive: true });
            await Bun.write(destination, Bun.file(join(base, member)));
          }
        }
        if (process.platform === "win32") {
          await mkdir(join(input.prefix, "lib"), { recursive: true });
          for await (const name of new Bun.Glob("*.lib").scan({ cwd: join(input.prefix, "bin"), onlyFiles: true }))
            await Bun.write(join(input.prefix, "lib", name), Bun.file(join(input.prefix, "bin", name)));
          if (input.component === "mpv" && !(await Bun.file(join(input.prefix, "bin/libmpv-2.dll")).exists()))
            await Bun.write(join(input.prefix, "bin/libmpv-2.dll"), Bun.file(join(input.prefix, "bin/mpv-2.dll")));
        }
      }
      const { normalizeMediaSDKPrefix, qualifyMediaSDKClosure } = await import("./media-sdk-factory");
      await normalizeMediaSDKPrefix(input.component === "mpv" ? "mpv" : "ffmpeg", input.target, input.prefix);
      await qualifyMediaSDKClosure(input.target, input.prefix);
    }
    await Bun.write(
      join(input.output, "build-source-receipt.json"),
      JSON.stringify(
        {
          schema: 1,
          target: input.target,
          component: input.component,
          source: verified.source ?? {
            revision: (await mediaSDKTool(["git", "rev-parse", "HEAD"], input.root)).trim(),
            owner: "packages/bun-video/native",
            lockSHA256: await hashSDKFile(join(input.root, "Cargo.lock")),
          },
          dependencies: verified.dependencies,
          features: plan.sidecarFeatures,
          status: "built-awaiting-native-ABI-closure-license-gates",
        },
        null,
        2,
      ),
    );
  } finally {
    if (fd !== undefined) {
      closeSync(fd);
      await Bun.file(heavy).unlink();
    }
  }
  return {
    target: input.target,
    component: input.component,
    prefix: input.prefix,
    qualification: "pending-native-ABI-closure-license-gates",
  };
}

if (import.meta.main) {
  const [action, component, target, sources, output, prefix] = process.argv.slice(2);
  if (!action || !component || !target || !sources || !output || !prefix)
    throw new Error("usage: media-sdk-build.ts plan|build ffmpeg|mpv|avio TARGET SOURCE_ROOT OUTPUT PREFIX");
  const input: MediaBuildInput = {
    component: component as MediaBuildComponent,
    target: target as MediaSDKTarget,
    root: resolve(import.meta.dir, "../.."),
    sources: resolve(sources),
    output: resolve(output),
    prefix: resolve(prefix),
    dependencies: JSON.parse(Bun.env.BUN_MEDIA_DEPENDENCY_PREFIXES ?? "{}"),
  };
  console.log(
    JSON.stringify(
      action === "plan"
        ? mediaBuildPlan(input)
        : action === "build"
          ? await runMediaBuild(input)
          : (() => {
              throw new Error("Unknown media recipe action");
            })(),
      null,
      2,
    ),
  );
}
