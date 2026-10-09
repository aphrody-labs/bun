import { cpus, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mkdirSync, copyFileSync } from "node:fs";
import { stats } from "./perf-gate.ts";

type Command = { name: string; argv: string[]; cwd?: string; internal?: boolean };
type Case = { name: string; left: Command; right: Command; check?: string };
type Result = { name: string; left: string; right: string; leftMs: number; rightMs: number; ratio: number };

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
const python = resolve(option("--python")!);
const uv = option("--uv", Bun.which("uv") ?? undefined);
const oxc = option("--oxc", Bun.which("oxlint") ?? undefined);
const ruff = option("--ruff", Bun.which("ruff") ?? undefined);
const native = option("--native");
const samples = count("--samples", 25, 3);
const warmup = count("--warmup", 3, 0);
const root = resolve(import.meta.dir, "../..");
const out = resolve(option("--out", join(root, "tmp", "runtime-bench"))!);
mkdirSync(out, { recursive: true });
const env = {
  ...process.env,
  PATH: `${dirname(python)}${platform() === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
};

async function run(command: Command) {
  const start = performance.now();
  await using proc = Bun.spawn({ cmd: command.argv, cwd: command.cwd ?? out, env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  const elapsed = performance.now() - start;
  if (code !== 0) throw new Error(`${command.name} exited ${code}: ${stderr.trim() || stdout.trim()}`);
  if (!command.internal) return { duration: elapsed, value: stdout.trim() };
  const [duration, value] = stdout.trim().split(";");
  const milliseconds = Number(duration);
  if (!Number.isFinite(milliseconds) || milliseconds < 0 || value === undefined) {
    throw new Error(`${command.name} returned an invalid measurement: ${stdout}`);
  }
  return { duration: milliseconds, value };
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
];

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
  const left = { name: "Bun install offline", argv: [bun, "install", "--offline", "--ignore-scripts"], cwd: jsProject };
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
  const jsTree = join(out, "lint-js"),
    pyTree = join(out, "lint-py");
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
    left: { name: "OXC / JavaScript", argv: [oxc, jsTree] },
    right: { name: "Ruff / Python", argv: [ruff, "check", "--isolated", "--no-cache", pyTree] },
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
    `import {dlopen,FFIType,ptr} from 'bun:ffi';const bytes=new Uint8Array(await Bun.file(${JSON.stringify(numbersPath)}).arrayBuffer());const lib=dlopen(${JSON.stringify(nativePath)},{bun_bench_sum_f64:{args:[FFIType.ptr,FFIType.usize],returns:FFIType.f64}});const p=ptr(bytes);for(let i=0;i<10000;i++)lib.symbols.bun_bench_sum_f64(p,bytes.length);const t=performance.now();let value;for(let i=0;i<100000;i++)value=lib.symbols.bun_bench_sum_f64(p,bytes.length);console.log(((performance.now()-t)/100000).toFixed(9)+';'+value);lib.close();`,
  );
  const pyo3 = await fixture(
    "pyo3.py",
    `import importlib.util,time\nspec=importlib.util.spec_from_file_location('bun_runtime_bench',${JSON.stringify(extensionPath)})\nmodule=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\ndata=open(${JSON.stringify(numbersPath)},'rb').read()\nfor _ in range(10000): module.sum_f64(data)\nt=time.perf_counter_ns()\nfor _ in range(100000): value=module.sum_f64(data)\nprint(f'{(time.perf_counter_ns()-t)/1e6/100000:.9f};{value}')`,
  );
  cases.push({
    name: "same Rust sum / 32 float64 / one call",
    left: { name: "Bun FFI", argv: [bun, ffi], internal: true },
    right: { name: "CPython + PyO3", argv: [python, pyo3], internal: true },
  });
}

console.log(`Host: ${platform()} / ${cpus()[0]?.model}; ${samples} samples; ${warmup} warmups; warm filesystem caches`);
for (const [name, executable] of [
  ["Bun", bun],
  ["CPython", python],
  ["uv", uv],
  ["OXC", oxc],
  ["Ruff", ruff],
]) {
  if (!executable) continue;
  const value = await run({ name: name!, argv: [executable, "--version"] });
  console.log(`${name}: ${value.value}`);
}
const results: Result[] = [],
  raw: string[] = ["case,implementation,sample,milliseconds"];
const csv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
for (const entry of cases) {
  const left: number[] = [],
    right: number[] = [];
  for (let i = -warmup; i < samples; i++) {
    const order = i % 2 === 0 ? [entry.left, entry.right] : [entry.right, entry.left];
    const values = new Map<Command, Awaited<ReturnType<typeof run>>>();
    for (const command of order) values.set(command, await run(command));
    const l = values.get(entry.left)!,
      r = values.get(entry.right)!;
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
      left.push(l.duration);
      right.push(r.duration);
      raw.push(
        [entry.name, entry.left.name, i, l.duration].map(csv).join(","),
        [entry.name, entry.right.name, i, r.duration].map(csv).join(","),
      );
    }
  }
  const l = stats(left),
    r = stats(right);
  results.push({
    name: entry.name,
    left: entry.left.name,
    right: entry.right.name,
    leftMs: l.median,
    rightMs: r.median,
    ratio: r.median / l.median,
  });
  console.log(
    `${entry.name}: ${l.median.toFixed(6)} / ${r.median.toFixed(6)} ms; right/left=${(r.median / l.median).toFixed(3)}`,
  );
}
await Bun.write(join(out, "samples.csv"), raw.join("\n") + "\n");
await Bun.write(
  join(out, "comparison.csv"),
  [
    "case,left,right,left_median_ms,right_median_ms,right_over_left",
    ...results.map(row => Object.values(row).map(csv).join(",")),
  ].join("\n") + "\n",
);
console.table(results);
