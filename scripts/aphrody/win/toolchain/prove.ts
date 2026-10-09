// Preuve que llvm-mingw remplace la toolchain gcc de MSYS2 (mingw64/ucrt64) pour nos usages Windows réels.
//
// Usage : bun scripts/aphrody/win/toolchain/prove.ts [--llvm-mingw C:\tools\llvm-mingw] [--work C:\tmp\ms\tc]
//                                                    [--diffutils C:\forks\msys2\uutils-diffutils] [--skip-rust]
//
// Étapes (chacune vérifie les imports PE : aucune DLL MSYS2/Cygwin ni runtime gcc) :
//   c-cpp-threads  hello C + C++ (iostream, std::thread) + pthread, -static, cible x86_64-w64-windows-gnu (UCRT)
//   pigz           pigz 2.8 (madler/pigz, zlib + zopfli embarqués) statique : remplace la recette
//                  « MSYS2 ucrt64 gcc -static » de C:\aphrody\tools\config\host\toolchain.json ; aller-retour -11/-d
//   zlib1          zlib de référence (madler/zlib 1.3.2, version de Git for Windows) en zlib1.dll : ce que canonical-tar.ts (C:\aphrody
//                  packages/infra/workspace) charge aujourd'hui depuis Git\mingw64\bin ; chargé par bun:ffi
//   rust-gnullvm   uutils diffutils (crate réelle) construit pour x86_64-pc-windows-gnullvm, lié par llvm-mingw
// Sources : pigz et zlib sont clonés dans --work s'ils manquent (git clone --depth 1 -b <tag>).
// Rapport : scripts/aphrody/win/toolchain/report.json.
import { dlopen, FFIType } from "bun:ffi";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const LLVM_MINGW = resolve(opt("--llvm-mingw", "C:/tools/llvm-mingw"));
const WORK = resolve(opt("--work", "C:/tmp/ms/tc"));
const DIFFUTILS = resolve(opt("--diffutils", "C:/forks/msys2/uutils-diffutils"));
const SKIP_RUST = args.includes("--skip-rust");
const BIN = join(LLVM_MINGW, "bin");
const CC = join(BIN, "x86_64-w64-mingw32-clang.exe");
const CXX = join(BIN, "x86_64-w64-mingw32-clang++.exe");
const READOBJ = join(BIN, "llvm-readobj.exe");
const FORBIDDEN =
  /^(msys-2\.0|cygwin1|msys-.*|cyg.*|libgcc_s_.*|libstdc\+\+-6|libwinpthread-1|libc\+\+|libunwind)\.dll$/i;

// PATH sans MSYS2 ni Git : rien ne doit venir de C:\msys64 ou de Git\usr\bin, Git\mingw64\bin.
const cleanPath = [BIN, ...(process.env.PATH ?? "").split(";")]
  .filter(p => p && !/msys64|\\Git\\(usr|mingw64)\\|cygwin/i.test(p))
  .join(";");
const env = { ...process.env, PATH: cleanPath };

type Step = { name: string; ok: boolean; detail: string; imports?: Record<string, string[]>; ms: number };
const steps: Step[] = [];

function run(cmd: string[], cwd = WORK, stdin?: Uint8Array) {
  const p = Bun.spawnSync({ cmd, cwd, env, stdin: stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString(), bytes: p.stdout };
}
function must(cmd: string[], cwd = WORK) {
  const r = run(cmd, cwd);
  if (r.code !== 0) throw new Error(`${cmd.join(" ")} → ${r.code}\n${r.err.slice(-2000)}`);
  return r;
}
function imports(exe: string): string[] {
  const out = must([READOBJ, "--coff-imports", exe]).out;
  return [...new Set([...out.matchAll(/Name: (\S+\.dll)/gi)].map(m => m[1]!.toLowerCase()))].sort();
}
function checkImports(files: string[]) {
  const all: Record<string, string[]> = {};
  for (const f of files) {
    all[f.replace(WORK + "\\", "")] = imports(f);
    const bad = all[f.replace(WORK + "\\", "")]!.filter(d => FORBIDDEN.test(d));
    if (bad.length) throw new Error(`${f} importe ${bad.join(", ")}`);
  }
  return all;
}
async function step(
  name: string,
  body: () => { detail: string; files: string[] } | Promise<{ detail: string; files: string[] }>,
) {
  const t = performance.now();
  try {
    const { detail, files } = await body();
    steps.push({ name, ok: true, detail, imports: checkImports(files), ms: Math.round(performance.now() - t) });
  } catch (e) {
    steps.push({
      name,
      ok: false,
      detail: String((e as Error).message ?? e).slice(0, 1500),
      ms: Math.round(performance.now() - t),
    });
  }
  const s = steps.at(-1)!;
  console.log(`${s.ok ? "OK  " : "FAIL"} ${name} (${s.ms} ms) ${s.detail.split("\n")[0]}`);
}
function clone(url: string, tag: string, dir: string) {
  if (!existsSync(join(dir, ".git"))) must(["git", "clone", "-q", "--depth", "1", "-b", tag, url, dir], WORK);
}

mkdirSync(WORK, { recursive: true });
if (!existsSync(CC)) throw new Error(`llvm-mingw absent : ${CC}`);

await step("c-cpp-threads", () => {
  const dir = join(WORK, "hello");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "hello.c"),
    `#include <pthread.h>\n#include <stdio.h>\nstatic void *f(void *p) { *(int *)p = 42; return 0; }\nint main(void) { pthread_t t; int v = 0; pthread_create(&t, 0, f, &v); pthread_join(t, 0); printf("c %d\\n", v); return v != 42; }\n`,
  );
  writeFileSync(
    join(dir, "hello.cpp"),
    `#include <iostream>\n#include <thread>\n#include <vector>\n#include <atomic>\nint main() { std::atomic<int> n{0}; std::vector<std::thread> ts; for (int i = 0; i < 8; i++) ts.emplace_back([&] { n++; }); for (auto &t : ts) t.join(); std::cout << "cpp " << n << std::endl; return n != 8; }\n`,
  );
  must([CC, "-O2", "-static", "-pthread", "-o", "hello-c.exe", "hello.c"], dir);
  must([CXX, "-O2", "-static", "-pthread", "-std=c++20", "-o", "hello-cpp.exe", "hello.cpp"], dir);
  const c = must([join(dir, "hello-c.exe")], dir).out.trim();
  const cpp = must([join(dir, "hello-cpp.exe")], dir).out.trim();
  if (c !== "c 42" || cpp !== "cpp 8") throw new Error(`sorties inattendues : ${c} / ${cpp}`);
  return { detail: `${c} ; ${cpp}`, files: [join(dir, "hello-c.exe"), join(dir, "hello-cpp.exe")] };
});

await step("pigz", () => {
  const dir = join(WORK, "pigz");
  const z = join(WORK, "zlib");
  clone("https://github.com/madler/pigz", "v2.8", dir);
  clone("https://github.com/madler/zlib", "v1.3.2", z);
  const zsrc = ["adler32", "crc32", "deflate", "infback", "inflate", "inffast", "inftrees", "trees", "zutil"].map(f =>
    join(z, f + ".c"),
  );
  const zopfli = [
    "deflate",
    "blocksplitter",
    "tree",
    "lz77",
    "cache",
    "hash",
    "util",
    "squeeze",
    "katajainen",
    "symbols",
  ]
    .map(f => join(dir, "zopfli", "src", "zopfli", f + ".c"))
    .filter(existsSync);
  must(
    [CC, "-O3", "-static", "-pthread", "-I", z, "-o", "pigz.exe", "pigz.c", "yarn.c", "try.c", ...zopfli, ...zsrc],
    dir,
  );
  const exe = join(dir, "pigz.exe");
  const input = new Uint8Array(readFileSync(join(dir, "pigz.c")));
  const packed = run([exe, "-c", "-11"], dir, input);
  if (packed.code !== 0) throw new Error(`pigz -11 : ${packed.err}`);
  const back = run([exe, "-d", "-c"], dir, packed.bytes);
  if (back.code !== 0 || Buffer.compare(Buffer.from(back.bytes), Buffer.from(input)) !== 0)
    throw new Error("aller-retour pigz différent");
  const gunzip = Bun.gunzipSync(packed.bytes);
  if (Buffer.compare(Buffer.from(gunzip), Buffer.from(input)) !== 0)
    throw new Error("Bun.gunzipSync ne relit pas la sortie de pigz");
  const version = must([exe, "--version"], dir).out.trim() || must([exe, "--version"], dir).err.trim();
  return {
    detail: `${version} : ${input.length} → ${packed.bytes.length} o (-11, zopfli), relu par pigz -d et Bun.gunzipSync`,
    files: [exe],
  };
});

await step("zlib1", () => {
  const z = join(WORK, "zlib");
  clone("https://github.com/madler/zlib", "v1.3.2", z);
  const out = join(WORK, "zlib1");
  mkdirSync(out, { recursive: true });
  const src = [
    "adler32",
    "compress",
    "crc32",
    "deflate",
    "gzclose",
    "gzlib",
    "gzread",
    "gzwrite",
    "infback",
    "inffast",
    "inflate",
    "inftrees",
    "trees",
    "uncompr",
    "zutil",
  ].map(f => join(z, f + ".c"));
  const dll = join(out, "zlib1.dll");
  must(
    [
      CC,
      "-O2",
      "-shared",
      "-o",
      dll,
      ...src,
      join(z, "win32", "zlib.def"),
      `-Wl,--out-implib,${join(out, "libz.dll.a")}`,
    ],
    z,
  );
  const symbols = {
    zlibVersion: { args: [], returns: FFIType.cstring },
    compressBound: { args: [FFIType.u64], returns: FFIType.u64 },
    compress2: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u64, FFIType.i32], returns: FFIType.i32 },
  } as const;
  const input = new Uint8Array(readFileSync(join(z, "deflate.c")));
  const deflate = (path: string) => {
    const lib = dlopen(path, symbols);
    const bound = Number(lib.symbols.compressBound(input.length));
    const output = new Uint8Array(bound);
    const length = new BigUint64Array([BigInt(bound)]);
    const rc = lib.symbols.compress2(output, length, input, input.length, 9);
    const version = String(lib.symbols.zlibVersion());
    lib.close();
    if (rc !== 0) throw new Error(`compress2 ${path} → ${rc}`);
    return { version, bytes: output.subarray(0, Number(length[0])) };
  };
  const ours = deflate(dll);
  const version = ours.version;
  if (version !== "1.3.2") throw new Error(`zlibVersion=${version}`);
  const git = join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "mingw64", "bin", "zlib1.dll");
  let vsGit = "zlib1.dll de Git absent : comparaison sautée";
  if (existsSync(git)) {
    const theirs = deflate(git);
    const same = Buffer.compare(Buffer.from(ours.bytes), Buffer.from(theirs.bytes)) === 0;
    if (!same && theirs.version === version) throw new Error(`compress2 diffère de Git zlib ${theirs.version}`);
    vsGit = `compress2 -9 ${same ? "identique" : "différent"} à Git\\mingw64 zlib ${theirs.version}`;
  }
  const bound = ours.bytes.length;
  return {
    detail: `zlib1.dll ${version} chargé par bun:ffi, ${vsGit} (${input.length} → ${bound} o) ; à poser à côté de canonical-tar ou dans %LOCALAPPDATA%\\aphrody\\win\\bin`,
    files: [dll],
  };
});

if (!SKIP_RUST) {
  await step("rust-gnullvm", () => {
    const target = "x86_64-pc-windows-gnullvm";
    const targetDir = join(WORK, "rust-target");
    const linkerEnv = `CARGO_TARGET_${target.toUpperCase().replaceAll("-", "_")}_LINKER`;
    const p = Bun.spawnSync({
      cmd: [
        "cargo",
        "build",
        "--release",
        "--locked",
        "--target",
        target,
        "--target-dir",
        targetDir,
        "--bin",
        "diffutils",
      ],
      cwd: DIFFUTILS,
      env: {
        ...env,
        [linkerEnv]: CC,
        CC_x86_64_pc_windows_gnullvm: CC,
        AR_x86_64_pc_windows_gnullvm: join(BIN, "llvm-ar.exe"),
        RUSTFLAGS: "-C target-feature=+crt-static",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(`cargo build ${target} : ${p.stderr.toString().slice(-1500)}`);
    const exe = join(targetDir, target, "release", "diffutils.exe");
    const a = join(WORK, "a.txt");
    const b = join(WORK, "b.txt");
    writeFileSync(a, "un\ndeux\ntrois\n");
    writeFileSync(b, "un\nDEUX\ntrois\n");
    const d = run([exe, "diff", "-u", a, b]);
    if (d.code !== 1 || !d.out.includes("-deux") || !d.out.includes("+DEUX"))
      throw new Error(`diff -u inattendu (${d.code}) : ${d.out}${d.err}`);
    const same = run([exe, "cmp", a, a]);
    if (same.code !== 0) throw new Error(`cmp a a → ${same.code}`);
    rmSync(a);
    rmSync(b);
    return { detail: `diffutils ${target} : diff -u → 1 avec hunk -deux/+DEUX, cmp identique → 0`, files: [exe] };
  });
}

// rsync de MSYS2 (toolchain.json windowsTools.msys2Packages) : rclone (natif, déjà configuré avec les remotes vps et
// dbfr) pour les copies, et le delta rsync en Rust de C:\aphrody\crates\infra\ssh\src\rsync.rs pour `aphrody infra ssh`.
await step("rsync-rclone", () => {
  const rclone = Bun.which("rclone", { PATH: cleanPath });
  if (!rclone) throw new Error("rclone absent du PATH");
  const src = join(WORK, "sync-src");
  const dst = join(WORK, "sync-dst");
  rmSync(src, { recursive: true, force: true });
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(join(src, "sous"), { recursive: true });
  writeFileSync(join(src, "a.txt"), "alpha\n");
  writeFileSync(
    join(src, "sous", "b.bin"),
    new Uint8Array(70000).map((_, i) => i * 7),
  );
  must([rclone, "sync", "--checksum", src, dst]);
  writeFileSync(join(src, "a.txt"), "alpha modifié\n");
  rmSync(join(src, "sous", "b.bin"));
  must([rclone, "sync", "--checksum", src, dst]);
  const a = readFileSync(join(dst, "a.txt"), "utf8");
  if (a !== "alpha modifié\n" || existsSync(join(dst, "sous", "b.bin")))
    throw new Error("rclone sync n'a pas propagé modification et suppression");
  const version = must([rclone, "version"]).out.split("\n")[0];
  return { detail: `${version} : sync --checksum propage modification et suppression`, files: [rclone] };
});

const report = {
  date: new Date().toISOString(),
  llvmMingw: must([CC, "--version"]).out.split("\n")[0],
  path: "PATH filtré : sans C:\\msys64, Git\\usr\\bin, Git\\mingw64\\bin ni cygwin",
  forbiddenImports: FORBIDDEN.source,
  steps,
};
writeFileSync(join(import.meta.dirname, "report.json"), JSON.stringify(report, null, 2) + "\n");
const failed = steps.filter(s => !s.ok).length;
console.log(`${steps.length - failed}/${steps.length} étapes prouvées`);
process.exit(failed ? 1 : 0);
