#!/usr/bin/env bun
// Sampling profile of a short-lived Windows process, without ETW.
//
//   bun scripts/aphrody/win-profile.ts sample [--runs 100] [--interval-us 100] [--out samples.json] -- <exe> [args...]
//   bun scripts/aphrody/win-profile.ts report <samples.json> [--exe <exe with its PDB beside it>] [--top 40]
//
// Kernel ETW providers (`wpr -start CPU`) need an elevated shell. This needs none: it starts the exe
// suspended (CreateProcessW), resumes it, and every `--interval-us` suspends the main thread, reads its
// RIP and the top 4 KB of its stack, and resumes it, until the process exits; `--runs` times. `report`
// symbolizes with llvm-symbolizer and the PDB: the functions the main thread was in, and for samples in a
// system DLL (ntdll is the loader, the heap and every syscall stub) the first return address in the exe
// found on the stack, which names the caller only approximately. The sampling rate depends on how fast
// this loop runs, so compare shares between runs, not sample counts.
import { dlopen, ptr } from "bun:ffi";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = args.shift();
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args.splice(i, 2)[1]!;
}

type Samples = {
  exe: string;
  runs: number;
  intervalUs: number;
  samples: number;
  modules: Record<string, number>;
  /** RVAs in the exe of the samples whose RIP was in it. */
  exeRips: number[];
  /** For the other samples: the RVA of the first exe address on the stack, or -1. */
  callers: number[];
};

if (command === "sample") await sample();
else if (command === "report") await report();
else {
  console.error("usage: win-profile.ts sample [--runs n] [--interval-us n] [--out file] -- <exe> [args...]");
  console.error("       win-profile.ts report <samples.json> [--exe <exe>] [--top n]");
  process.exit(2);
}

async function sample() {
  const runs = Number(flag("--runs", "100"));
  const intervalUs = Number(flag("--interval-us", "100"));
  const out = flag("--out", "samples.json");
  const dash = args.indexOf("--");
  const [exe, ...exeArgs] = dash < 0 ? args : args.slice(dash + 1);
  if (!exe) throw new Error("no exe");
  const k32 = dlopen("kernel32.dll", {
    CreateProcessW: { args: ["ptr", "ptr", "ptr", "ptr", "i32", "u32", "ptr", "ptr", "ptr", "ptr"], returns: "i32" },
    ResumeThread: { args: ["u64"], returns: "u32" },
    SuspendThread: { args: ["u64"], returns: "u32" },
    GetThreadContext: { args: ["u64", "ptr"], returns: "i32" },
    WaitForSingleObject: { args: ["u64", "u32"], returns: "u32" },
    CloseHandle: { args: ["u64"], returns: "i32" },
    ReadProcessMemory: { args: ["u64", "u64", "ptr", "u64", "ptr"], returns: "i32" },
    K32EnumProcessModules: { args: ["u64", "ptr", "u32", "ptr"], returns: "i32" },
    K32GetModuleBaseNameW: { args: ["u64", "u64", "ptr", "u32"], returns: "u32" },
    K32GetModuleInformation: { args: ["u64", "u64", "ptr", "u32"], returns: "i32" },
  }).symbols;
  const quote = (s: string) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  const commandLine = Buffer.from([exe, ...exeArgs].map(quote).join(" ") + "\0", "utf16le");
  // CONTEXT (AMD64) is 1232 bytes and must be 16-byte aligned; ContextFlags at 0x30, Rsp at 0x98, Rip at 0xf8.
  const contextBuffer = new Uint8Array(1232 + 16);
  const offset = (16 - (Number(ptr(contextBuffer)) % 16)) % 16;
  const context = contextBuffer.subarray(offset, offset + 1232);
  const view = new DataView(context.buffer, context.byteOffset, 1232);
  const stack = new BigUint64Array(512);
  const read = new BigUint64Array(1);
  const raw: { rip: bigint; stack: BigUint64Array }[] = [];
  let modules: { name: string; base: bigint; size: bigint }[] | undefined;
  for (let run = 0; run < runs; run++) {
    const startupInfo = new Uint8Array(104);
    new DataView(startupInfo.buffer).setUint32(0, 104, true);
    const info = new BigUint64Array(3);
    const CREATE_SUSPENDED = 0x4;
    if (!k32.CreateProcessW(null, commandLine, null, null, 0, CREATE_SUSPENDED, null, null, startupInfo, info))
      throw new Error(`CreateProcessW failed for ${exe}`);
    const [process_, thread] = [info[0]!, info[1]!];
    k32.ResumeThread(thread);
    let next = performance.now();
    while (k32.WaitForSingleObject(process_, 0) !== 0) {
      const now = performance.now();
      if (now < next) continue;
      next = now + intervalUs / 1000;
      if (k32.SuspendThread(thread) === 0xffffffff) break;
      view.setUint32(0x30, 0x100001, true); // CONTEXT_CONTROL
      if (k32.GetThreadContext(thread, context)) {
        const rsp = view.getBigUint64(0x98, true);
        k32.ReadProcessMemory(process_, rsp, stack, BigInt(stack.byteLength), read);
        raw.push({ rip: view.getBigUint64(0xf8, true), stack: stack.slice(0, Number(read[0]) / 8) });
      }
      // Windows maps an image at the same base in every process of a boot, so one list serves every run.
      // Early in a run the loader has not listed kernel32 yet (or the call fails): ask again later.
      if (!modules?.some(m => m.name === "kernel32.dll") && raw.length % 50 === 49) modules = listModules(process_);
      k32.ResumeThread(thread);
    }
    k32.CloseHandle(thread);
    k32.CloseHandle(process_);
  }
  function listModules(handle: bigint) {
    const bases = new BigUint64Array(512);
    const needed = new Uint32Array(1);
    k32.K32EnumProcessModules(handle, bases, bases.byteLength, needed);
    return [...bases.subarray(0, needed[0]! / 8)].map(base => {
      const name = new Uint16Array(260);
      const length = k32.K32GetModuleBaseNameW(handle, base, name, 260);
      const moduleInfo = new BigUint64Array(3);
      k32.K32GetModuleInformation(handle, base, moduleInfo, 24);
      return {
        name: Buffer.from(name.buffer, 0, length * 2)
          .toString("utf16le")
          .toLowerCase(),
        base,
        size: moduleInfo[1]! & 0xffffffffn,
      };
    });
  }
  const list = modules ?? [];
  const self = list.find(m => m.name.endsWith(".exe"));
  const inSelf = (a: bigint) => self !== undefined && a >= self.base && a < self.base + self.size;
  const result: Samples = {
    exe: resolve(exe),
    runs,
    intervalUs,
    samples: raw.length,
    modules: {},
    exeRips: [],
    callers: [],
  };
  for (const { rip, stack } of raw) {
    const name = list.find(m => rip >= m.base && rip < m.base + m.size)?.name ?? "?";
    result.modules[name] = (result.modules[name] ?? 0) + 1;
    if (inSelf(rip)) result.exeRips.push(Number(rip - self!.base));
    else {
      const caller = stack.find(inSelf);
      result.callers.push(caller === undefined ? -1 : Number(caller - self!.base));
    }
  }
  await Bun.write(out, JSON.stringify(result));
  console.log(
    JSON.stringify({
      out,
      samples: result.samples,
      perRun: +(result.samples / runs).toFixed(1),
      modules: result.modules,
    }),
  );
}

async function report() {
  const file = args.shift();
  if (!file) throw new Error("no samples file");
  const data: Samples = await Bun.file(file).json();
  const exe = flag("--exe", data.exe);
  const top = Number(flag("--top", "40"));
  const headers = Bun.spawnSync({ cmd: ["llvm-objdump", "-p", exe] }).stdout.toString();
  const imageBase = BigInt("0x" + /ImageBase\s+([0-9a-fA-F]+)/.exec(headers)![1]);
  async function names(rvas: number[]) {
    const unique = [...new Set(rvas.filter(r => r >= 0))];
    const input = unique.map(r => "0x" + (imageBase + BigInt(r)).toString(16)).join("\n") + "\n";
    const symbolizer = Bun.spawn({
      cmd: ["llvm-symbolizer", `--obj=${exe}`, "--functions=linkage", "--no-inlines", "--demangle"],
      stdin: new Blob([input]),
      stdout: "pipe",
    });
    const blocks = (await symbolizer.stdout.text()).trim().split(/\r?\n\r?\n/);
    return new Map(unique.map((r, i) => [r, (blocks[i] ?? "?").split(/\r?\n/)[0]!]));
  }
  const short = (name: string) =>
    name
      .replace(/<[^<>]*>/g, "<>")
      .replace(/<[^<>]*>/g, "<>")
      .slice(0, 140);
  async function table(title: string, rvas: number[]) {
    const map = await names(rvas);
    const counts = new Map<string, number>();
    for (const r of rvas) {
      const name = r < 0 ? "(no exe address on the stack)" : short(map.get(r)!);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    console.log(`\n${title}: ${rvas.length} samples, ${((100 * rvas.length) / data.samples).toFixed(1)}% of all`);
    for (const [name, count] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, top))
      console.log(`${((100 * count) / data.samples).toFixed(2).padStart(6)}%  ${name}`);
  }
  console.log(`${data.exe}: ${data.samples} samples over ${data.runs} runs, every ${data.intervalUs} us`);
  for (const [name, count] of Object.entries(data.modules).sort((a, b) => b[1] - a[1]))
    console.log(`${((100 * count) / data.samples).toFixed(1).padStart(6)}%  ${name}`);
  await table("In the exe", data.exeRips);
  await table("In a system DLL, by the exe's caller on the stack", data.callers);
}
