// bun tools/aphrody/bench-render.ts [--runs N] [--lines N] [--apis direct3d11,direct3d12]
// Compares the AtlasEngine backends of the installed Dev package (bun run deploy):
// * throughput: wall time of `seq 1 N` and of `type` on a colored file, printed in a new tab,
// * frames: PresentMon (elevated through gsudo) on the Dev WindowsTerminal process during the output,
// * memory: working set and private bytes of the process, GPU dedicated/shared memory (typeperf).
// The runs alternate between the APIs; the Dev process is restarted for every run.
// Results: obj/aphrody/bench-render/results.json. The settings.json of the Dev package is restored at the end.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LAYOUT_DIR, LOCALAPPDATA, OUT, PACKAGE_NAME, elevator, ensureDir, log, pwsh } from "./lib.ts";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

// Child mode, runs inside the benchmarked tab: waits for `go`, runs the workload, reports, waits for `close`.
if (process.argv.includes("--emit")) {
  const [dir, kind] = [arg("--dir", ""), arg("--kind", "seq")];
  const cmd = JSON.parse(readFileSync(join(dir, "cmd.json"), "utf8")) as string[];
  writeFileSync(join(dir, "ready"), "");
  while (!existsSync(join(dir, "go"))) await Bun.sleep(5);
  const t0 = performance.now();
  const code = await Bun.spawn(cmd, { stdin: "ignore", stdout: "inherit", stderr: "inherit" }).exited;
  const ms = performance.now() - t0;
  writeFileSync(join(dir, "done"), JSON.stringify({ kind, ms, code }));
  while (!existsSync(join(dir, "close"))) await Bun.sleep(5);
  process.exit(0);
}

const runs = Number(arg("--runs", "5"));
const lines = Number(arg("--lines", "2000000"));
const apis = arg("--apis", "direct3d11,direct3d12").split(",");
const out = ensureDir(join(OUT, "bench-render"));
const aliases = join(LOCALAPPDATA, "Microsoft", "WindowsApps");
const presentmon = Bun.which("presentmon") ?? join(LOCALAPPDATA, "Microsoft", "WinGet", "Links", "presentmon.exe");
const seq = Bun.which("seq") ?? "C:\\Program Files\\Git\\usr\\bin\\seq.exe";
const sudo = elevator();

const pkg = JSON.parse(
  (
    await pwsh(`Get-AppxPackage -Name ${PACKAGE_NAME} | Select-Object PackageFamilyName | ConvertTo-Json -Compress`)
  ).out.trim() || "null",
) as { PackageFamilyName: string } | null;
if (!pkg) throw new Error(`${PACKAGE_NAME} n'est pas installé : bun run deploy`);
const settingsPath = join(LOCALAPPDATA, "Packages", pkg.PackageFamilyName, "LocalState", "settings.json");
const originalSettings = await Bun.file(settingsPath).text();

// 256-color SGR text with box drawing characters (BuiltinGlyphs), about 20 MB.
const colorFile = join(out, "colors.txt");
if (!existsSync(colorFile)) {
  const parts: string[] = [];
  for (let i = 0; i < 200_000; i++) {
    let line = "";
    for (let c = 0; c < 12; c++)
      line += `\x1b[38;5;${(i + c * 17) % 256}m${"\u2500\u2502\u250c"[c % 3]}word${c}\x1b[0m `;
    parts.push(line + `${i}\r\n`);
  }
  await Bun.write(colorFile, parts.join(""));
}

const workloads: Record<string, string[]> = {
  seq: [seq, "1", String(lines)],
  colors: ["cmd.exe", "/d", "/c", "type", colorFile],
};

const devProcesses = `Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${LAYOUT_DIR.replaceAll("'", "''")}*' }`;

async function stopDev(): Promise<void> {
  await pwsh(`${devProcesses} | Stop-Process -Force`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && (await devPids()).length) await Bun.sleep(100);
}

async function devPids(): Promise<number[]> {
  const r = await pwsh(`@(${devProcesses} | ForEach-Object { $_.Id }) -join ','`);
  return r.out.trim().split(",").filter(Boolean).map(Number);
}

async function waitFor(path: string, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`délai dépassé : ${path}`);
    await Bun.sleep(5);
  }
}

async function memory(pid: number) {
  const proc = JSON.parse(
    (await pwsh(`Get-Process -Id ${pid} | Select-Object WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`))
      .out,
  ) as { WorkingSet64: number; PrivateMemorySize64: number };
  const gpu: Record<string, number> = {};
  for (const counter of ["Dedicated Usage", "Shared Usage"]) {
    const r = Bun.spawnSync(["typeperf", `\\GPU Process Memory(*)\\${counter}`, "-sc", "1"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const rows = r.stdout
      .toString()
      .split(/\r?\n/)
      .filter(l => l.startsWith('"'));
    if (rows.length < 2) continue;
    const cells = (l: string) => l.split('","').map(c => c.replaceAll('"', ""));
    const header = cells(rows[0]);
    const values = cells(rows[1]);
    gpu[counter] = header.reduce((sum, h, i) => (h.includes(`(pid_${pid}_`) ? sum + Number(values[i] || 0) : sum), 0);
  }
  return {
    workingSetMB: proc.WorkingSet64 / 2 ** 20,
    privateMB: proc.PrivateMemorySize64 / 2 ** 20,
    gpuDedicatedMB: (gpu["Dedicated Usage"] ?? NaN) / 2 ** 20,
    gpuSharedMB: (gpu["Shared Usage"] ?? NaN) / 2 ** 20,
  };
}

function frameStats(csvPath: string) {
  if (!existsSync(csvPath)) return undefined;
  const [head, ...rows] = readFileSync(csvPath, "utf8").trim().split(/\r?\n/) as string[];
  const cols = head.split(",");
  const pick = (name: string) => {
    const i = cols.indexOf(name);
    if (i < 0) return undefined;
    const xs = rows
      .map(r => Number(r.split(",")[i]))
      .filter(x => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    if (!xs.length) return undefined;
    const q = (p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
    return { median: q(0.5), p95: q(0.95), mean: xs.reduce((a, b) => a + b, 0) / xs.length };
  };
  return {
    presents: rows.length,
    frameTime: pick("FrameTime") ?? pick("MsBetweenPresents"),
    cpuBusy: pick("CPUBusy"),
    gpuBusy: pick("GPUBusy") ?? pick("MsGPUActive"),
    gpuTime: pick("GPUTime"),
    displayLatency: pick("DisplayLatency"),
    presentMode: rows[0]?.split(",")[cols.indexOf("PresentMode")],
    runtime: rows[0]?.split(",")[cols.indexOf("PresentRuntime")],
  };
}

async function setApi(api: string): Promise<void> {
  const json = JSON.parse(originalSettings) as Record<string, unknown>;
  json["rendering.graphicsAPI"] = api;
  await Bun.write(settingsPath, JSON.stringify(json, null, 2) + "\n");
}

async function once(api: string, kind: string, run: number) {
  const dir = join(out, `${api}-${kind}-${run}`);
  rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  await stopDev();
  await setApi(api);

  const emit = [process.execPath, import.meta.path, "--emit", "--dir", dir, "--kind", kind];
  writeFileSync(join(dir, "cmd.json"), JSON.stringify(workloads[kind]));
  Bun.spawn(
    [
      join(aliases, "wtd.exe"),
      "-w",
      "new",
      "--pos",
      "40,40",
      "--size",
      "160,48",
      "nt",
      "--title",
      "aphrody-bench",
      ...emit,
    ],
    {
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  await waitFor(join(dir, "ready"), 30_000);
  const [pid] = await devPids();
  if (!pid) throw new Error("processus Dev introuvable");
  // Let the first frames settle.
  await Bun.sleep(500);

  const csv = join(dir, "presentmon.csv");
  const session = `aphrody_bench_${process.pid}`;
  const pm = sudo
    ? Bun.spawn(
        [
          ...sudo,
          presentmon,
          "--process_id",
          String(pid),
          "--output_file",
          csv,
          "--no_console_stats",
          "--v2_metrics",
          "--session_name",
          session,
          "--stop_existing_session",
        ],
        {
          stdout: "ignore",
          stderr: "ignore",
        },
      )
    : undefined;
  if (pm) await Bun.sleep(1500);

  writeFileSync(join(dir, "go"), "");
  await waitFor(join(dir, "done"), 600_000);
  const done = JSON.parse(await Bun.file(join(dir, "done")).text()) as { ms: number; code: number };
  // Frames still pending after the producer finished belong to the workload.
  await Bun.sleep(1000);
  if (pm && sudo) {
    Bun.spawnSync([...sudo, presentmon, "--session_name", session, "--terminate_existing_session"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await pm.exited;
  }
  const mem = await memory(pid);
  writeFileSync(join(dir, "close"), "");
  const usesD3D12 =
    (
      await pwsh(`[bool]((Get-Process -Id ${pid}).Modules | Where-Object ModuleName -eq 'd3d11on12.dll')`)
    ).out.trim() === "True";
  await stopDev();
  const r = { api, kind, run, ms: done.ms, exitCode: done.code, usesD3D12, ...mem, frames: frameStats(csv) };
  log(
    `${api} ${kind} #${run}`,
    `${Math.round(r.ms)} ms, ${r.frames?.presents ?? "?"} presents, d3d11on12=${usesD3D12}, ws ${r.workingSetMB.toFixed(1)} MB, gpu ${r.gpuDedicatedMB.toFixed(1)} MB`,
  );
  return r;
}

const results: Awaited<ReturnType<typeof once>>[] = [];
try {
  for (let run = 0; run < runs; run++) {
    const order = run % 2 ? [...apis].reverse() : apis;
    for (const kind of Object.keys(workloads)) for (const api of order) results.push(await once(api, kind, run));
  }
} finally {
  await stopDev();
  await Bun.write(settingsPath, originalSettings);
  await Bun.write(
    join(out, "results.json"),
    JSON.stringify({ at: new Date().toISOString(), lines, runs, results }, null, 2),
  );
}

const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
for (const kind of Object.keys(workloads)) {
  for (const api of apis) {
    const rs = results.filter(r => r.api === api && r.kind === kind);
    log(
      `${kind} ${api}`,
      [
        `temps ${median(rs.map(r => r.ms)).toFixed(0)} ms`,
        `presents ${median(rs.map(r => r.frames?.presents ?? NaN))}`,
        `FrameTime ${median(rs.map(r => r.frames?.frameTime?.median ?? NaN)).toFixed(2)} ms`,
        `CPUBusy ${median(rs.map(r => r.frames?.cpuBusy?.median ?? NaN)).toFixed(2)} ms (p95 ${median(rs.map(r => r.frames?.cpuBusy?.p95 ?? NaN)).toFixed(2)})`,
        `GPUBusy ${median(rs.map(r => r.frames?.gpuBusy?.median ?? NaN)).toFixed(3)} ms`,
        `latence ${median(rs.map(r => r.frames?.displayLatency?.median ?? NaN)).toFixed(2)} ms`,
        `WS ${median(rs.map(r => r.workingSetMB)).toFixed(1)} MB`,
        `privé ${median(rs.map(r => r.privateMB)).toFixed(1)} MB`,
        `GPU ded ${median(rs.map(r => r.gpuDedicatedMB)).toFixed(1)} MB`,
        `GPU shared ${median(rs.map(r => r.gpuSharedMB)).toFixed(1)} MB`,
      ].join(", "),
    );
  }
}
