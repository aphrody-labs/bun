// Checks the generated Win32 families against the real ABI:
//   bun scripts/aphrody/win32/verify.ts layouts   sizeof/offsetof of every generated struct, compiled with clang-cl
//                                                 against the Windows SDK and MSVC headers (x64)
//   bun scripts/aphrody/win32/verify.ts exports   LoadLibraryExW + GetProcAddress of every generated function
// Headers are only read by the compiler; nothing from them is written to the repo.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(import.meta.dir, "..", "..", "..");
const shared = join(repo, "packages", "bun-windows-win32");
const mode = process.argv[2] ?? "layouts";
const work = join(process.env.TEMP ?? "C:/tmp", "bun-win32-verify");
mkdirSync(work, { recursive: true });

type Struct = { s: number; a: number; u?: 1; x?: 1; f: [string, string, number][] };

if (mode === "layouts") {
  const structs: [string, Struct][] = [];
  for (const file of readdirSync(join(shared, "ns"))) {
    const data = JSON.parse(readFileSync(join(shared, "ns", file), "utf8"));
    for (const [name, s] of Object.entries((data.structs ?? {}) as Record<string, Struct>))
      if (!name.includes("/") && name !== "GUID") structs.push([name, s]);
  }
  const kits = "C:/Program Files (x86)/Windows Kits/10/Include/10.0.26100.0";
  const vsRoot = "C:/Program Files (x86)/Microsoft Visual Studio";
  const msvc = [...new Bun.Glob("*/*/VC/Tools/MSVC/*/include").scanSync({ cwd: vsRoot, onlyFiles: false })]
    .map(p => join(vsRoot, p))
    .sort()[0];
  const headers = `#define WIN32_LEAN_AND_MEAN
#define _WIN32_WINNT 0x0A00
#define NTDDI_VERSION 0x0A000010
#define SECURITY_WIN32
#define INITGUID
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <winternl.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <iphlpapi.h>
#include <powrprof.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <shlobj.h>
#include <commctrl.h>
#include <wtsapi32.h>
#include <setupapi.h>
#include <dbghelp.h>
#include <taskschd.h>
#include <uiautomation.h>
#include <d3d11.h>
#include <dxgi1_6.h>
#include <wincodec.h>
#include <sspi.h>
#include <wincrypt.h>
#include <winhttp.h>
#include <userenv.h>
#include <lm.h>
#include <pdh.h>
#include <winevt.h>
#include <evntrace.h>
#include <mmsystem.h>
#include <dbt.h>
#include <cfgmgr32.h>
#include <shellscalingapi.h>
#include <processsnapshot.h>
#include <jobapi2.h>
#include <cstddef>
#include <cstdio>
`;
  let lines = structs.map(([name, s]) => {
    const fields = s.f
      .filter(([f]) => !/^(Anonymous|_bitfield)/.test(f))
      .map(
        ([f, , off]) =>
          `+ (offsetof(${name}, ${f}) != ${off} ? (printf("${name}.${f} %zu != ${off}\\n", offsetof(${name}, ${f})), 1) : 0)`,
      )
      .join(" ");
    // Flexible arrays are declared [1] in the metadata; headers use [1], [0] or [], so only offsets are comparable.
    if (s.x) return `n++; bad += 0 ${fields};`;
    return `n++; if (sizeof(${name}) != ${s.s}) printf("${name} size %zu != ${s.s}\\n", sizeof(${name})), bad++; bad += 0 ${fields};`;
  });
  const exe = join(work, "layouts.exe");
  for (let pass = 0; pass < 8; pass++) {
    const src = `${headers}int main() { int n = 0, bad = 0;\n${lines.join("\n")}\nprintf("CHECKED %d %d\\n", n, bad); return 0; }\n`;
    const cpp = join(work, "layouts.cpp");
    writeFileSync(cpp, src);
    const first = headers.split("\n").length;
    const build = Bun.spawnSync({
      cmd: [
        "clang-cl",
        "/nologo",
        "/std:c++17",
        "/EHsc",
        "-ferror-limit=0",
        "-Wno-everything",
        `/imsvc${msvc}`,
        ...["ucrt", "um", "shared", "winrt"].map(d => `/imsvc${kits}/${d}`),
        cpp,
        `/Fe${exe}`,
        `/Fo${join(work, "layouts.obj")}`,
        "/link",
        `/LIBPATH:${msvc.replace(/include$/, "lib/x64")}`,
        `/LIBPATH:${kits.replace("Include", "Lib")}/ucrt/x64`,
        `/LIBPATH:${kits.replace("Include", "Lib")}/um/x64`,
      ],
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = build.stdout.toString() + build.stderr.toString();
    writeFileSync(join(work, `pass.log`), output);
    const bad = new Set<number>();
    for (const m of output.matchAll(/layouts\.cpp\((\d+),\d+\): error/g)) bad.add(Number(m[1]) - first - 1);
    if (bad.size === 0) {
      if (build.exitCode !== 0) throw new Error(output.slice(0, 4000));
      break;
    }
    lines = lines.filter((_, i) => !bad.has(i));
  }
  const run = Bun.spawnSync({ cmd: [exe], stdout: "pipe" }).stdout.toString();
  const tail = run.trim().split("\n");
  const [, checked, mismatched] = /CHECKED (\d+) (\d+)/.exec(tail.at(-1)!)!;
  console.log(
    `${structs.length} generated structs; ${checked} found in the SDK headers and checked (size + named field offsets); ${mismatched} mismatches`,
  );
  for (const line of tail.slice(0, -1).slice(0, 40)) console.log("  " + line);
  process.exit(Number(mismatched) ? 1 : 0);
}

if (mode === "exports") {
  const { dlopen, ptr } = require("bun:ffi");
  const k32 = dlopen("kernel32.dll", {
    LoadLibraryExW: { args: ["ptr", "ptr", "u32"], returns: "ptr" },
    GetProcAddress: { args: ["ptr", "ptr"], returns: "ptr" },
  }).symbols;
  const manifest = JSON.parse(readFileSync(join(shared, "manifest.json"), "utf8"));
  let total = 0;
  let found = 0;
  let missingDlls: string[] = [];
  const missing: string[] = [];
  for (const name of Object.keys(manifest.families)) {
    const dir = join(repo, "packages", `bun-windows-${name}`);
    if (!existsSync(join(dir, "family.json"))) continue;
    const family = JSON.parse(readFileSync(join(dir, "family.json"), "utf8"));
    const module = k32.LoadLibraryExW(ptr(Buffer.from(family.dll + "\0", "utf16le")), null, 0x800);
    const fns = Object.entries(family.functions) as [string, unknown[]][];
    total += fns.length;
    if (!module) {
      missingDlls.push(family.dll);
      continue;
    }
    for (const [fn, entry] of fns) {
      const symbol = (entry[4] as string) ?? fn;
      const address = symbol.startsWith("#")
        ? k32.GetProcAddress(module, Number(symbol.slice(1)))
        : k32.GetProcAddress(module, ptr(Buffer.from(symbol + "\0")));
      if (address) found++;
      else missing.push(`${family.dll}!${symbol}`);
    }
  }
  console.log(
    `${total} functions in ${Object.keys(manifest.families).length} families; ${found} resolved by GetProcAddress; ${missing.length} absent from present DLLs; ${missingDlls.length} DLLs not installed on this machine`,
  );
  console.log("  absent DLLs: " + missingDlls.join(", "));
  console.log("  absent exports (first 30): " + missing.slice(0, 30).join(", "));
}
