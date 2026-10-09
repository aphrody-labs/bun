import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { BunPython, registryPath } from "../../../scripts/aphrody/pyjs-store.ts";
import { buildPythonWasm } from "./build.ts";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: resolve(import.meta.dir, "../../../tmp/bun-python/wasm/fixture.wasm") },
    db: { type: "string", default: registryPath },
    "cpython-root": { type: "string" },
    cache: { type: "string" },
    image: { type: "string" },
    wasmtime: { type: "string", default: "wasmtime" },
  },
});
const receipt = await buildPythonWasm({
  entry: resolve(import.meta.dir, "fixture/entrée été🐍.py"),
  root: resolve(import.meta.dir, "fixture"),
  out: values.out!,
  db: values.db,
  cpythonRoot: values["cpython-root"],
  cache: values.cache,
  image: values.image,
});
const command = [
  values.wasmtime!,
  "run",
  "--wasm",
  "max-wasm-stack=8388608",
  "--argv0",
  "/app/entrée été🐍.py",
  receipt.out,
  "été🐍",
];
using registry = new BunPython(values.db);
const run = registry.startRun("python-wasi-execution", command, import.meta.dir, {
  artifactSha256: receipt.sha256,
  hostFilesystem: "no preopened directories",
});
await using child = Bun.spawn({ cmd: command, stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
await Bun.write(`${receipt.out}.execution.json`, JSON.stringify({ command, stdout, stderr, code }));
await registry.artifact(`${receipt.out}.execution.json`, "python-wasi-execution", run);
try {
  if (code !== 0) throw new Error(`Frozen CPython WASI entry failed (${code}): ${stderr}`);
  const actual = JSON.parse(stdout);
  if (
    actual.answer !== 42 ||
    actual.name !== "__main__" ||
    actual.file !== "/app/entrée été🐍.py" ||
    JSON.stringify(actual.argv) !== JSON.stringify(["été🐍"])
  )
    throw new Error(`Frozen CPython WASI fixture returned incorrect output: ${stdout}`);
} catch (error) {
  registry.finishRun(run, code || 1, stdout, `${stderr}\n${String(error)}`);
  throw error;
}
registry.finishRun(run, 0, stdout, stderr);
registry.event(
  "python-wasi-qualified",
  {
    artifactSha256: receipt.sha256,
    target: receipt.target,
    pythonVersion: receipt.pythonVersion,
    multiModule: true,
    unicodeArgv: true,
    noHostFilesystem: true,
  },
  run,
);
console.log(
  JSON.stringify({
    out: receipt.out,
    sha256: receipt.sha256,
    pythonVersion: receipt.pythonVersion,
    stdout,
    code,
    qualification: "multi-module CPython WASI executed without a host filesystem",
  }),
);
