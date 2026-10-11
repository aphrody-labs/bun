import windows from "bun:windows";
import { copyFileSync, existsSync, linkSync, mkdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

type Json = Record<string, any>;
const args = new Map<string, string>();
for (let i = 2; i < Bun.argv.length; i += 2) {
  const key = Bun.argv[i];
  const value = Bun.argv[i + 1];
  if (!key?.startsWith("--") || !value || args.has(key)) throw new Error(`Invalid or duplicate argument: ${key ?? "<missing>"}`);
  args.set(key, value);
}
for (const key of ["--binary", "--report", "--source-manifest"])
  if (!args.has(key)) throw new Error(`Required argument: ${key} <absolute path>`);

const absolute = (value: string, label: string) => {
  if (!isAbsolute(value)) throw new Error(`${label} must be an absolute path`);
  return resolve(value);
};
const binary = absolute(args.get("--binary")!, "binary");
const reportPath = absolute(args.get("--report")!, "report");
const manifestPath = absolute(args.get("--source-manifest")!, "source manifest");
const hashFile = async (path: string) => {
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
};
const fail = (message: string): never => { throw new Error(message); };
const run = (cmd: string[], cwd?: string) => Bun.spawnSync({ cmd, cwd, stdout: "pipe", stderr: "pipe", timeout: 60_000 });
const textOut = (result: ReturnType<typeof run>) => `${result.stdout.toString()}\n${result.stderr.toString()}`.trim();
const check = (name: string, cmd: string[], cwd?: string, expected?: RegExp) => {
  const result = run(cmd, cwd);
  const output = textOut(result);
  const passed = result.exitCode === 0 && (!expected || expected.test(output));
  probes.push({ name, exitCode: result.exitCode, passed });
  if (!passed) fail(`Qualification probe failed: ${name}`);
  return output;
};
const probes: Array<{ name: string; exitCode: number | null; passed: boolean }> = [];
let report: Json;
let ok = false;
let failure: string | undefined;
let manifestSha256: string | undefined;
let binarySha256: string | undefined;
let revision: string | undefined;
let version: string | undefined;
let manifest: Json | undefined;

try {
  if (!existsSync(binary) || !existsSync(manifestPath)) fail("Binary or source manifest does not exist");
  const canonicalBinary = realpathSync(binary);
  manifestSha256 = await hashFile(manifestPath);
  binarySha256 = await hashFile(binary);
  manifest = await Bun.file(manifestPath).json();
  if (manifest.schema !== "aphrody.bun-runtime-qualification/v1") fail("Unsupported manifest schema");
  if (realpathSync(absolute(manifest.artifact?.path, "manifest artifact.path")) !== canonicalBinary) fail("Manifest artifact path differs from --binary");
  if (!/^[a-f0-9]{64}$/i.test(manifest.artifact?.sha256 ?? "") || manifest.artifact.sha256.toLowerCase() !== binarySha256) fail("Artifact SHA-256 mismatch");
  if (manifest.artifact.version !== "1.4.4" || manifest.target !== "windows-x64" || manifest.windowsQualified !== true) fail("Artifact version, target, or Windows gate is invalid");
  if (manifest.gates?.status !== "qualified" || manifest.gates?.log?.exitCode !== 0) fail("Build gates are not qualified");
  if (!Array.isArray(manifest.gates.warnings) || manifest.gates.warnings.length || !Array.isArray(manifest.gates.unexpectedExports) || manifest.gates.unexpectedExports.length) fail("Warnings or unexpected exports remain");
  const gateLog = absolute(manifest.gates.log.path, "gate log path");
  if (!existsSync(gateLog) || !/^[a-f0-9]{64}$/i.test(manifest.gates.log.sha256 ?? "") || (await hashFile(gateLog)) !== manifest.gates.log.sha256.toLowerCase()) fail("Gate log is missing or its digest does not match");
  const src = manifest.source;
  if (!src?.repository || !/^[a-f0-9]{40,64}$/i.test(src.baseCommit ?? "") || !/^[a-f0-9]{40,64}$/i.test(src.commit ?? "") || typeof src.dirty !== "boolean") fail("Source provenance is incomplete");
  if (src.dirty && !/^[a-f0-9]{64}$/i.test(src.diffSha256 ?? "")) fail("Dirty source requires diffSha256");
  if (!manifest.build?.command || manifest.build.profile !== "release") fail("Release build provenance is incomplete");

  const revisionOutput = check("revision", [binary, "--revision"]);
  const versionOutput = check("version", [binary, "--version"]);
  revision = revisionOutput.split(/\r?\n/).find((line) => line.trim())?.trim();
  version = versionOutput.split(/\r?\n/).find((line) => line.trim())?.trim();
  if (!revision || revision !== manifest.artifact.revision) fail("Candidate --revision differs from manifest artifact.revision");
  if (!version || !/(?:^|\s)1\.4\.4(?:\s|$)/.test(version)) fail("Candidate --version does not report 1.4.4");
  if (!windows.isElevated()) fail("Qualification requires an elevated Windows token");
  check("windows-native-module", [binary, "--eval", 'import("bun:windows").then(m=>{if(typeof m.default.isElevated!=="function")process.exit(2);console.log("ok")})'], undefined, /ok/);
  check("windows-memory-status", [binary, "--eval", 'import("bun:windows").then(({default:w})=>{const m=w.memory.status();if(!(m.totalPhysical>0&&m.availablePhysical>=0&&m.availablePhysical<=m.totalPhysical&&m.totalPageFile>0&&m.totalVirtual>0&&m.memoryLoad>=0&&m.memoryLoad<=100))process.exit(2);console.log("ok")})'], undefined, /ok/);
  check("node-compatibility", [binary, "--eval", 'if(!process.versions.node)process.exit(2);console.log(process.versions.node)'], undefined, /\d/);
  check("embedded-uv", [binary, "uv", "--version"], undefined, /uv\s+0\.12\.24\b/i);
  check("msvc-doctor", [binary, "msvc", "doctor"], undefined, /Windows SDK/i);
  check("bun-python-graph", [binary, "--eval", 'import("bun:graph").then(({BunPython})=>{const db=new BunPython(":memory:");try{const c=db.counts();const f=db.db.query("PRAGMA foreign_keys").get();if(!(c.nodes===0&&c.edges===0&&f.foreign_keys===1))process.exit(2);console.log("ok")}finally{db[Symbol.dispose]()}})'], undefined, /ok/);
  check("graph-index-native-module", [binary, "--eval", 'import("bun:graph-index").then(({default:g})=>{if(typeof g.indexCodebase!=="function")process.exit(2);console.log("ok")})'], undefined, /ok/);
  check("wasm-cli", [binary, "wasm", "--help"], undefined, /wasm/i);
  check("bun-shell", [binary, "-e", 'const r=await Bun.$`echo omar-bun-shell`.text(); if(r.trim()!=="omar-bun-shell")process.exit(2); console.log("ok")'], undefined, /ok/);
  const probeDir = `${dirname(reportPath)}/.bunsh-probe-${crypto.randomUUID()}`;
  const bunsh = `${probeDir}/bunsh.exe`;
  try {
    mkdirSync(probeDir, { recursive: true });
    try { linkSync(binary, bunsh); } catch { copyFileSync(binary, bunsh); }
    const result = run([bunsh, "-c", "echo omar-bunsh-dispatch"]);
    const output = textOut(result);
    const passed = result.exitCode === 0 && output.split(/\r?\n/).some((line) => line.trim() === "omar-bunsh-dispatch");
    probes.push({ name: "bunsh-argv0-dispatch", exitCode: result.exitCode, passed });
    if (!passed) fail("Qualification probe failed: bunsh argv0 dispatch");
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
  ok = true;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
}

report = {
  schema: "aphrody.bun-runtime-qualification-report/v1",
  qualified: ok,
  checkedAt: new Date().toISOString(),
  binary: { path: binary, sha256: binarySha256, version, revision },
  sourceManifest: { path: manifestPath, sha256: manifestSha256 },
  source: manifest?.source,
  build: manifest?.build,
  gates: manifest?.gates,
  administrator: windows.isElevated(),
  probes,
  ...(failure ? { failure } : {}),
};
mkdirSync(dirname(reportPath), { recursive: true });
const temporary = `${reportPath}.tmp-${crypto.randomUUID()}`;
await Bun.write(temporary, `${JSON.stringify(report, null, 2)}\n`);
renameSync(temporary, reportPath);
console.log(JSON.stringify(report));
if (!ok) process.exitCode = 1;
