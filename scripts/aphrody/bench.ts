import { copyFileSync, mkdirSync } from "node:fs";
import { cpus, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { BunPython, registryPath } from "./pyjs-store.ts";
import { arenaCases, parseArenaReport, validateArenaPair } from "./v8.ts";

type Command = { name: string; argv: string[]; cwd?: string; internal?: boolean; arena?: boolean };
type Case = { name: string; left: Command; right: Command; check?: string };
type Result = {
  name: string;
  left: string;
  right: string;
  leftMs: number;
  rightMs: number;
  leftP95Ms: number;
  rightP95Ms: number;
  ratio: number;
};

function stats(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const midpoint = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(midpoint)]! : (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
  return { median, p95: sorted[Math.ceil(sorted.length * 0.95) - 1]! };
}

const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
};
const count = (name: string, fallback: number, minimum: number) => {
  const value = Number(option(name, String(fallback)));
  if (!Number.isSafeInteger(value) || value < minimum || value > 1000) throw new Error(`invalid ${name}`);
  return value;
};
const bun = resolve(option("--bun", process.execPath)!);
const pythonOption = option("--python");
if (pythonOption === undefined) throw new Error("--python requires a qualified CPython executable");
const python = resolve(pythonOption);
const uv = option("--uv", Bun.which("uv") ?? undefined);
const oxc = option("--oxc", Bun.which("oxlint") ?? undefined);
const ruff = option("--ruff", Bun.which("ruff") ?? undefined);
const native = option("--native");
const dotnet = args.includes("--no-dotnet") ? undefined : option("--dotnet", Bun.which("dotnet") ?? undefined);
const deno = args.includes("--no-deno") ? undefined : option("--deno", Bun.which("deno") ?? undefined);
const samples = count("--samples", 25, 3);
const warmup = count("--warmup", 3, 0);
const root = resolve(import.meta.dir, "../..");
const out = resolve(option("--out", join(root, "tmp", "runtime-bench"))!);
mkdirSync(out, { recursive: true });
const env = {
  ...process.env,
  PATH: `${dirname(python)}${platform() === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
  ARENA_ITERS: "1",
  ARENA_WARMUP: "10",
  DENO_NO_UPDATE_CHECK: "1",
};
const droppedEngineFlags: string[] = [];
for (const key of Object.keys(env)) {
  if (key.startsWith("BUN_JSC_") || key === "DENO_V8_FLAGS") {
    delete (env as Record<string, string | undefined>)[key];
    droppedEngineFlags.push(key);
  }
}
using registry = new BunPython(option("--db", registryPath));
const benchmarkRun = registry.startRun("benchmark", [process.execPath, ...process.argv.slice(1)], root, {
  bun: Bun.version,
  host: platform(),
  cpu: cpus()[0]?.model,
  samples,
  warmup,
  out,
  droppedEngineFlags,
});
let benchmarkFinished = false;

async function run(command: Command) {
  const runId = registry.startRun("benchmark-command", command.argv, command.cwd ?? out, {
    parent: benchmarkRun,
    implementation: command.name,
    internal: command.internal ?? false,
  });
  let recorded = false;
  try {
    const start = performance.now();
    await using proc = Bun.spawn({ cmd: command.argv, cwd: command.cwd ?? out, env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    const elapsed = performance.now() - start;
    registry.finishRun(runId, code, stdout, stderr);
    recorded = true;
    if (code !== 0) throw new Error(`${command.name} exited ${code}: ${stderr.trim() || stdout.trim()}`);
    if (command.arena) {
      const arena = parseArenaReport(stdout);
      registry.event("arena-process", arena, runId);
      return { duration: elapsed, value: arena.checksum, arena };
    }
    if (!command.internal) return { duration: elapsed, value: stdout.trim(), arena: undefined };
    const [duration, value] = stdout.trim().split(";");
    const milliseconds = Number(duration);
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || value === undefined) {
      throw new Error(`${command.name} returned an invalid measurement: ${stdout}`);
    }
    return { duration: milliseconds, value, arena: undefined };
  } catch (error) {
    if (!recorded) registry.finishRun(runId, 1, "", String(error));
    throw error;
  }
}

async function fixture(name: string, body: string) {
  const path = join(out, name);
  await Bun.write(path, body);
  return path;
}

async function micro(name: string, setupJs: string, bodyJs: string, setupPy: string, bodyPy: string, repeats = 1) {
  const js = await fixture(
    `${name}.js`,
    `${setupJs}\nfunction operation(){${bodyJs}}\nfor(let i=0;i<4;i++)operation();\nconst t=performance.now();let result;for(let i=0;i<${repeats};i++)result=operation();\nconsole.log(((performance.now()-t)/${repeats}).toFixed(9)+";"+result);\n`,
  );
  const py = await fixture(
    `${name}.py`,
    `import time\n${setupPy}\ndef operation():\n${bodyPy
      .split("\n")
      .map(line => `    ${line}`)
      .join(
        "\n",
      )}\nfor _ in range(4): operation()\nt=time.perf_counter_ns()\nfor _ in range(${repeats}): result=operation()\nprint(f"{(time.perf_counter_ns()-t)/1e6/${repeats}:.9f};{result}")\n`,
  );
  return {
    name,
    left: { name: "Bun / JSC", argv: [bun, js], internal: true },
    right: { name: "CPython", argv: [python, py], internal: true },
  } satisfies Case;
}

try {
  const payloadPath = join(out, "payload.json");
  const payload = JSON.stringify(Array.from({ length: 10000 }, (_, i) => ({ x: i, y: `item-${i}` })));
  await Bun.write(payloadPath, payload);
  const binaryPath = join(out, "payload.bin");
  await Bun.write(binaryPath, new Uint8Array(8 * 1024 * 1024).fill(31));
  const cases: Case[] = [
    {
      name: "CLI --version",
      left: { name: "Bun", argv: [bun, "--version"] },
      right: { name: "CPython", argv: [python, "--version"] },
    },
    {
      name: "VM initialization",
      left: { name: "Bun / JSC", argv: [bun, "-e", ""] },
      right: { name: "CPython", argv: [python, "-c", "pass"] },
    },
    await micro(
      "float64-loop",
      "",
      "let sum=0;for(let i=0;i<500000;i++)sum+=((i%97)*(i%97)+0.5)/8;return sum;",
      "",
      "total=0.0\nfor i in range(500000): total+=((i%97)*(i%97)+0.5)/8\nreturn total",
    ),
    await micro(
      "json-parse",
      `const text=await Bun.file(${JSON.stringify(payloadPath)}).text();`,
      "const value=JSON.parse(text);return value.length+value[9999].x;",
      `import json\ntext=open(${JSON.stringify(payloadPath)},encoding='utf-8').read()`,
      "value=json.loads(text)\nreturn len(value)+value[9999]['x']",
      10,
    ),
    await micro(
      "sha256-8MiB",
      `const data=await Bun.file(${JSON.stringify(binaryPath)}).arrayBuffer();`,
      "return new Bun.CryptoHasher('sha256').update(data).digest('hex');",
      `import hashlib\ndata=open(${JSON.stringify(binaryPath)},'rb').read()`,
      "return hashlib.sha256(data).hexdigest()",
      3,
    ),
    await micro(
      "json-stringify",
      `const value=JSON.parse(await Bun.file(${JSON.stringify(payloadPath)}).text());`,
      "return JSON.stringify(value).length;",
      `import json\nvalue=json.load(open(${JSON.stringify(payloadPath)},encoding='utf-8'))`,
      "return len(json.dumps(value,separators=(',',':')))",
      10,
    ),
    await micro(
      "gzip-roundtrip-8MiB",
      `import {gzipSync,gunzipSync} from 'node:zlib';const data=await Bun.file(${JSON.stringify(binaryPath)}).arrayBuffer();`,
      "const result=gunzipSync(gzipSync(new Uint8Array(data),{level:6}));return result.length+result[result.length-1];",
      `import gzip\ndata=open(${JSON.stringify(binaryPath)},'rb').read()`,
      "result=gzip.decompress(gzip.compress(data,compresslevel=6,mtime=0))\nreturn len(result)+result[-1]",
    ),
    await micro(
      "regexp-10000-records",
      "const text='item-123 value=456\\n'.repeat(10000);",
      "let count=0;for(const match of text.matchAll(/item-(\\d+) value=(\\d+)/g))count+=Number(match[1])+Number(match[2]);return count;",
      "import re\ntext='item-123 value=456\\n'*10000\npattern=re.compile(r'item-(\\d+) value=(\\d+)')",
      "return sum(int(m[1])+int(m[2]) for m in pattern.finditer(text))",
      3,
    ),
    await micro(
      "sqlite-1000-inserts",
      "import {Database} from 'bun:sqlite';",
      "const db=new Database(':memory:');try{db.run('CREATE TABLE records(value INTEGER)');db.run('BEGIN');const query=db.query('INSERT INTO records VALUES (?)');for(let i=0;i<1000;i++)query.run(i);db.run('COMMIT');return db.query('SELECT sum(value) AS total FROM records').get().total;}finally{db.close();}",
      "import sqlite3",
      "db=sqlite3.connect(':memory:')\ntry:\n    db.execute('CREATE TABLE records(value INTEGER)')\n    db.execute('BEGIN')\n    for i in range(1000): db.execute('INSERT INTO records VALUES (?)',(i,))\n    db.commit()\n    return db.execute('SELECT sum(value) FROM records').fetchone()[0]\nfinally:\n    db.close()",
      3,
    ),
  ];

  if (deno) {
    cases.push(
      {
        name: "Bun vs Deno / CLI --version",
        left: { name: "Bun", argv: [bun, "--version"] },
        right: { name: "Deno", argv: [deno, "--version"] },
      },
      {
        name: "Bun vs Deno / VM initialization",
        left: { name: "Bun / JSC", argv: [bun, "-e", ""] },
        right: { name: "Deno / V8", argv: [deno, "eval", "--no-config", "--no-lock", "--no-remote", "--no-npm", ""] },
      },
      ...arenaCases(bun, deno, root),
    );
    const bunVersions = await run({
      name: "Bun engine provenance",
      argv: [
        bun,
        "-e",
        "console.log(JSON.stringify({runtime:'bun',version:Bun.version,revision:Bun.revision,engine:'JavaScriptCore',webkit:process.versions.webkit}))",
      ],
    });
    const denoVersions = await run({
      name: "Deno engine provenance",
      argv: [
        deno,
        "eval",
        "--no-config",
        "--no-lock",
        "--no-remote",
        "--no-npm",
        "console.log(JSON.stringify({runtime:'deno',engine:'V8',...Deno.version}))",
      ],
    });
    registry.event(
      "engine-provenance",
      {
        bun: JSON.parse(bunVersions.value),
        deno: JSON.parse(denoVersions.value),
        timing: "Arena per-process internal kernel duration; startup measured from spawn to exit",
        engineComparison: "Same arena source, checksums validated; engine executed inside each host runtime",
        allocatorAndHost: "Each host retains its allocator, GC configuration and embedding",
      },
      benchmarkRun,
    );
    await registry.artifact(bun, "benchmark-executable", benchmarkRun, { implementation: "Bun / JSC" });
    await registry.artifact(deno, "benchmark-executable", benchmarkRun, { implementation: "Deno / V8" });
    for (const name of ["common", "compute", "json", "gzip"])
      await registry.artifact(
        join(root, "bench", "aphrody", "arena", "shared", `${name}.mjs`),
        "arena-source",
        benchmarkRun,
      );
  }

  const jsRead = await fixture(
    "read.js",
    `const path=${JSON.stringify(binaryPath)};for(let i=0;i<4;i++)await Bun.file(path).arrayBuffer();const t=performance.now();const data=await Bun.file(path).arrayBuffer();console.log((performance.now()-t).toFixed(9)+';'+data.byteLength);`,
  );
  const pyRead = await fixture(
    "read.py",
    `import time\npath=${JSON.stringify(binaryPath)}\nfor _ in range(4): open(path,'rb').read()\nt=time.perf_counter_ns()\ndata=open(path,'rb').read()\nprint(f"{(time.perf_counter_ns()-t)/1e6:.9f};{len(data)}")`,
  );
  cases.push({
    name: "read-8MiB",
    left: { name: "Bun.file", argv: [bun, jsRead], internal: true },
    right: { name: "CPython read", argv: [python, pyRead], internal: true },
  });
  const jsShell = await fixture(
    "shell.js",
    "import { $ } from 'bun';for(let i=0;i<4;i++)await $`echo 42`.quiet();const t=performance.now();const value=await $`echo 42`.quiet().text();console.log((performance.now()-t).toFixed(9)+';'+value.trim());",
  );
  const pyShell = await fixture(
    "shell.py",
    "import subprocess,time\nfor _ in range(4): subprocess.run('echo 42',shell=True,capture_output=True,check=True)\nt=time.perf_counter_ns()\nvalue=subprocess.run('echo 42',shell=True,capture_output=True,check=True).stdout.decode().strip()\nprint(f'{(time.perf_counter_ns()-t)/1e6:.9f};{value}')",
  );
  cases.push({
    name: "shell echo",
    left: { name: "Bun Shell builtin", argv: [bun, jsShell], internal: true },
    right: { name: "CPython subprocess + OS shell", argv: [python, pyShell], internal: true },
    check: "42",
  });

  if (uv) {
    const jsProject = join(out, "install-js"),
      pyProject = join(out, "install-py");
    await Bun.write(join(jsProject, "package.json"), '{"name":"runtime-benchmark","private":true}');
    await Bun.write(
      join(pyProject, "pyproject.toml"),
      '[project]\nname="runtime-benchmark"\nversion="0.0.0"\nrequires-python=">=3.11"\ndependencies=[]\n',
    );
    const left = {
      name: "Bun install offline",
      argv: [bun, "install", "--offline", "--ignore-scripts"],
      cwd: jsProject,
    };
    const right = {
      name: "uv sync offline",
      argv: [uv, "sync", "--offline", "--no-build", "--python", python],
      cwd: pyProject,
    };
    await run(left);
    await run(right);
    cases.push({ name: "warm dependency-free install", left, right });
  }
  if (oxc && ruff) {
    const lintRoot = join(tmpdir(), "aphrody-runtime-bench", Bun.hash(out).toString(16));
    const jsTree = join(lintRoot, "lint-js"),
      pyTree = join(lintRoot, "lint-py");
    for (let i = 0; i < 100; i++) {
      await Bun.write(
        join(jsTree, `mod${i}.js`),
        Array.from({ length: 100 }, (_, j) => `export function fn${j}(value) { return value + ${i + j}; }`).join("\n"),
      );
      await Bun.write(
        join(pyTree, `mod${i}.py`),
        Array.from({ length: 100 }, (_, j) => `def fn${j}(value):\n    return value + ${i + j}\n`).join("\n"),
      );
    }
    cases.push({
      name: "lint 100 files / 10000 functions",
      left: {
        name: "OXC / JavaScript",
        argv: [oxc, "--no-ignore", jsTree],
        cwd: jsTree,
      },
      right: { name: "Ruff / Python", argv: [ruff, "check", "--isolated", "--no-cache", pyTree], cwd: pyTree },
    });
  }
  const vswhere = join(
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio\\Installer\\vswhere.exe",
  );
  if (
    platform() === "win32" &&
    !args.includes("--no-msvc") &&
    (await Bun.file(vswhere).exists()) &&
    Bun.spawnSync([bun, "msvc", "--help"], { env: { ...env, BUN_BE_BUN: "1" } }).exitCode === 0
  ) {
    const vcvars = await fixture(
      "vcvars.cmd",
      [
        "@echo off",
        `for /f "usebackq delims=" %%i in (\`"${vswhere}" -all -prerelease -latest -products * -property installationPath\`) do set "VSDIR=%%i"`,
        'call "%VSDIR%\\VC\\Auxiliary\\Build\\vcvarsall.bat" x64 >nul || exit /b 1',
        "set VCToolsVersion",
        "",
      ].join("\r\n"),
    );
    cases.push({
      name: "MSVC x64 environment discovery",
      left: { name: "bun msvc env", argv: [bun, "msvc", "env", "--arch", "x64", "--format", "cmd"] },
      right: { name: "vswhere + vcvarsall.bat", argv: ["cmd.exe", "/d", "/c", vcvars] },
    });
  }
  if (native) {
    const nativePath = resolve(native);
    const extensionPath = join(out, platform() === "win32" ? "bun_runtime_bench.pyd" : "bun_runtime_bench.so");
    copyFileSync(nativePath, extensionPath);
    const numbers = new Float64Array(Array.from({ length: 32 }, (_, i) => i / 4));
    const numbersPath = join(out, "numbers.bin");
    await Bun.write(numbersPath, numbers);
    const ffi = await fixture(
      "ffi.js",
      `import assert from 'node:assert/strict';import {dlopen,FFIType,ptr} from 'bun:ffi';const bytes=new Uint8Array(await Bun.file(${JSON.stringify(numbersPath)}).arrayBuffer());const lib=dlopen(${JSON.stringify(nativePath)},{bun_bench_sum_f64:{args:[FFIType.ptr,FFIType.usize],returns:FFIType.f64}});const p=ptr(bytes);assert.equal(lib.symbols.bun_bench_sum_f64(null,0),0);assert.ok(Number.isNaN(lib.symbols.bun_bench_sum_f64(p,7)));assert.equal(lib.symbols.bun_bench_sum_f64(p,bytes.length),124);for(let i=0;i<10000;i++)lib.symbols.bun_bench_sum_f64(p,bytes.length);const t=performance.now();let value;for(let i=0;i<100000;i++)value=lib.symbols.bun_bench_sum_f64(p,bytes.length);console.log(((performance.now()-t)/100000).toFixed(9)+';'+value);lib.close();`,
    );
    const pyo3 = await fixture(
      "pyo3.py",
      `import importlib.util,time\nspec=importlib.util.spec_from_file_location('bun_runtime_bench',${JSON.stringify(extensionPath)})\nmodule=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\ndata=open(${JSON.stringify(numbersPath)},'rb').read()\nassert module.sum_f64(b'') == 0\ntry:\n    module.sum_f64(b'invalid')\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('invalid binary input accepted')\nassert module.sum_f64(data) == 124\nfor _ in range(10000): module.sum_f64(data)\nt=time.perf_counter_ns()\nfor _ in range(100000): value=module.sum_f64(data)\nprint(f'{(time.perf_counter_ns()-t)/1e6/100000:.9f};{value}')`,
    );
    cases.push({
      name: "same Rust sum / 32 float64 / one call",
      left: { name: "Bun FFI", argv: [bun, ffi], internal: true },
      right: { name: "CPython + PyO3", argv: [python, pyo3], internal: true },
    });
  }

  if (dotnet) {
    cases.push(
      {
        name: "CLR / .NET SDK --version",
        left: { name: "bun dotnet (in-process hostfxr)", argv: [bun, "dotnet", "--version"] },
        right: { name: "dotnet", argv: [dotnet, "--version"] },
      },
      {
        name: "CLR / install inventory",
        left: { name: "bun dotnet info", argv: [bun, "dotnet", "info"] },
        right: { name: "dotnet --info", argv: [dotnet, "--info"] },
      },
    );
  }

  console.log(
    `Host: ${platform()} / ${cpus()[0]?.model}; ${samples} samples; ${warmup} warmups; warm filesystem caches`,
  );
  for (const [name, executable] of [
    ["Bun", bun],
    ["CPython", python],
    ["uv", uv],
    ["OXC", oxc],
    ["Ruff", ruff],
    ["Deno", deno],
    [".NET SDK", dotnet],
  ]) {
    if (!executable) continue;
    const value = await run({ name: name!, argv: [executable, "--version"] });
    console.log(`${name}: ${value.value}`);
  }
  const results: Result[] = [],
    raw: string[] = ["case,implementation,sample,milliseconds"];
  const csv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const selected = option("--case");
  const selectedCases = selected === undefined ? cases : cases.filter(entry => entry.name.includes(selected));
  if (!selectedCases.length) throw new Error(`No benchmark matches --case ${selected}`);
  for (const entry of selectedCases) {
    const left: number[] = [],
      right: number[] = [];
    const arenaMetrics = new Map<string, { left: number[]; right: number[] }>();
    for (let i = -warmup; i < samples; i++) {
      const order = i % 2 === 0 ? [entry.left, entry.right] : [entry.right, entry.left];
      const values = new Map<Command, Awaited<ReturnType<typeof run>>>();
      for (const command of order) values.set(command, await run(command));
      const l = values.get(entry.left)!,
        r = values.get(entry.right)!;
      if (l.arena || r.arena) {
        if (!l.arena || !r.arena) throw new Error(`${entry.name}: missing arena report`);
        const metrics = validateArenaPair(l.arena, r.arena);
        for (const metric of metrics) {
          if (l.arena.samples[metric]!.length !== 1 || r.arena.samples[metric]!.length !== 1)
            throw new Error(`${entry.name}: expected one measurement per process`);
          if (i < 0) continue;
          const name = `${entry.name} / ${metric}`;
          const measured = arenaMetrics.get(metric) ?? { left: [], right: [] };
          const leftDuration = l.arena.samples[metric]![0]!,
            rightDuration = r.arena.samples[metric]![0]!;
          registry.db.transaction(() => {
            registry.sample(benchmarkRun, name, entry.left.name, i, leftDuration, String(l.arena!.checksums[metric]));
            registry.sample(benchmarkRun, name, entry.right.name, i, rightDuration, String(r.arena!.checksums[metric]));
          })();
          measured.left.push(leftDuration);
          measured.right.push(rightDuration);
          arenaMetrics.set(metric, measured);
          raw.push(
            [name, entry.left.name, i, leftDuration].map(csv).join(","),
            [name, entry.right.name, i, rightDuration].map(csv).join(","),
          );
        }
        continue;
      }
      if (
        entry.left.internal &&
        entry.right.internal &&
        Number.isFinite(Number(l.value)) &&
        Number.isFinite(Number(r.value))
      ) {
        if (Number(l.value) !== Number(r.value))
          throw new Error(`${entry.name}: results differ (${l.value} / ${r.value})`);
      } else if (entry.left.internal && l.value !== r.value) throw new Error(`${entry.name}: results differ`);
      if (entry.check && (l.value !== entry.check || r.value !== entry.check))
        throw new Error(`${entry.name}: invalid result`);
      if (i >= 0) {
        registry.db.transaction(() => {
          registry.sample(benchmarkRun, entry.name, entry.left.name, i, l.duration, l.value);
          registry.sample(benchmarkRun, entry.name, entry.right.name, i, r.duration, r.value);
        })();
        left.push(l.duration);
        right.push(r.duration);
        raw.push(
          [entry.name, entry.left.name, i, l.duration].map(csv).join(","),
          [entry.name, entry.right.name, i, r.duration].map(csv).join(","),
        );
      }
    }
    const metrics = arenaMetrics.size
      ? [...arenaMetrics].map(([name, values]) => ({ name: `${entry.name} / ${name}`, ...values }))
      : [{ name: entry.name, left, right }];
    for (const metric of metrics) {
      const l = stats(metric.left),
        r = stats(metric.right);
      results.push({
        name: metric.name,
        left: entry.left.name,
        right: entry.right.name,
        leftMs: l.median,
        rightMs: r.median,
        leftP95Ms: l.p95,
        rightP95Ms: r.p95,
        ratio: r.median / l.median,
      });
      console.log(
        `${metric.name}: ${l.median.toFixed(6)} / ${r.median.toFixed(6)} ms; right/left=${(r.median / l.median).toFixed(3)}`,
      );
    }
    await Bun.write(join(out, "samples.csv"), raw.join("\n") + "\n");
    await Bun.write(
      join(out, "comparison.csv"),
      [
        "case,left,right,left_median_ms,right_median_ms,left_p95_ms,right_p95_ms,right_over_left",
        ...results.map(row => Object.values(row).map(csv).join(",")),
      ].join("\n") + "\n",
    );
  }
  await Bun.write(join(out, "samples.csv"), raw.join("\n") + "\n");
  await Bun.write(
    join(out, "comparison.csv"),
    [
      "case,left,right,left_median_ms,right_median_ms,left_p95_ms,right_p95_ms,right_over_left",
      ...results.map(row => Object.values(row).map(csv).join(",")),
    ].join("\n") + "\n",
  );
  console.table(results);
  registry.event("benchmark-summary", results, benchmarkRun);
  await registry.artifact(join(out, "samples.csv"), "benchmark-samples", benchmarkRun);
  await registry.artifact(join(out, "comparison.csv"), "benchmark-comparison", benchmarkRun);
  registry.finishRun(benchmarkRun, 0);
  benchmarkFinished = true;
  if (!args.includes("--no-export")) await registry.export();
} catch (error) {
  if (!benchmarkFinished) registry.finishRun(benchmarkRun, 1, "", String(error));
  if (!args.includes("--no-export")) await registry.export();
  throw error;
}
