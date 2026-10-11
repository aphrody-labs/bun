import windows from "bun:windows";
import { copyFileSync, existsSync, linkSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

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
const reportPath = absolute(args.get("--report")!, "qualification report");
const manifestPath = absolute(args.get("--source-manifest")!, "source manifest");
const root = "C:/SSH/omar";
const hashFile = async (path: string) => {
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
};
const samePath = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
const fail = (message: string): never => { throw new Error(message); };
if (!windows.isElevated()) fail("Runtime installation requires an elevated Windows token");
if (![binary, reportPath, manifestPath].every(existsSync)) fail("Binary, qualification report, or manifest is missing");
if (samePath(realpathSync(process.execPath), resolve(`${process.env.SystemRoot ?? "C:/Windows"}/System32/bun.exe`))) fail("Run the installer from outside System32 so the active Bun image can be replaced safely");

const report = await Bun.file(reportPath).json();
const manifest = await Bun.file(manifestPath).json();
const manifestSha256 = await hashFile(manifestPath);
const binarySha256 = await hashFile(binary);
if (report.schema !== "aphrody.bun-runtime-qualification-report/v1" || report.qualified !== true || report.administrator !== true) fail("A successful administrator qualification report is required");
if (!samePath(report.binary?.path, binary) || report.binary.sha256 !== binarySha256 || report.binary.version !== "1.4.4") fail("Qualified binary identity or digest does not match");
if (!samePath(report.sourceManifest?.path, manifestPath) || report.sourceManifest.sha256 !== manifestSha256) fail("Qualification report does not reference this source manifest");
if (manifest.schema !== "aphrody.bun-runtime-qualification/v1" || manifest.artifact?.version !== "1.4.4" || manifest.artifact?.sha256?.toLowerCase() !== binarySha256 || manifest.target !== "windows-x64" || manifest.windowsQualified !== true) fail("Source manifest does not match a Windows-qualified candidate artifact");
if (!samePath(realpathSync(absolute(manifest.artifact.path, "manifest artifact.path")), realpathSync(binary))) fail("Manifest artifact path differs from --binary");
if (report.binary.revision !== manifest.artifact.revision || report.source?.commit !== manifest.source?.commit || report.source?.repository !== manifest.source?.repository || report.source?.baseCommit !== manifest.source?.baseCommit || report.source?.dirty !== manifest.source?.dirty || report.source?.diffSha256 !== manifest.source?.diffSha256) fail("Report provenance differs from the source manifest");
if (!manifest.build?.command || manifest.build.profile !== "release" || !manifest.source?.repository || !/^[a-f0-9]{40,64}$/i.test(manifest.source.baseCommit ?? "") || !/^[a-f0-9]{40,64}$/i.test(manifest.source.commit ?? "") || typeof manifest.source.dirty !== "boolean" || (manifest.source.dirty && !/^[a-f0-9]{64}$/i.test(manifest.source.diffSha256 ?? ""))) fail("Build or source provenance is incomplete");
if (manifest.gates?.status !== "qualified" || manifest.gates?.log?.exitCode !== 0 || !Array.isArray(manifest.gates?.warnings) || manifest.gates.warnings.length !== 0 || !Array.isArray(manifest.gates?.unexpectedExports) || manifest.gates.unexpectedExports.length !== 0) fail("Build gate record is not clean");
const requiredProbes = ["revision", "version", "windows-native-module", "windows-memory-status", "embedded-uv", "msvc-doctor", "bun-python-graph", "graph-index-native-module", "node-compatibility", "wasm-cli", "bun-shell", "bunsh-argv0-dispatch"];
if (!Array.isArray(report.probes) || requiredProbes.some((name) => !report.probes.some((probe: any) => probe.name === name && probe.passed === true))) fail("Qualification report is missing a required passing runtime probe");
const gateLogPath = absolute(manifest.gates.log.path, "gate log path");
if (!existsSync(gateLogPath) || await hashFile(gateLogPath) !== manifest.gates.log.sha256?.toLowerCase()) fail("Gate log digest changed after qualification");
const revisionResult = Bun.spawnSync({ cmd: [binary, "--revision"], stdout: "pipe", stderr: "pipe", timeout: 30_000 });
const revision = revisionResult.stdout.toString().trim().split(/\r?\n/)[0];
const versionResult = Bun.spawnSync({ cmd: [binary, "--version"], stdout: "pipe", stderr: "pipe", timeout: 30_000 });
if (revisionResult.exitCode !== 0 || versionResult.exitCode !== 0 || revision !== manifest.artifact.revision || !/(?:^|\s)1\.4\.4(?:\s|$)/.test(versionResult.stdout.toString())) fail("Candidate version or revision changed after qualification");

const systemRoot = process.env.SystemRoot ?? "C:/Windows";
const system32 = resolve(systemRoot, "System32");
if (!existsSync(system32) || !statSync(system32).isDirectory()) fail("System32 directory could not be verified");
const systemBun = join(system32, "bun.exe");
const targetSpecs: Array<{ target: string; kind: "runtime" | "alias" }> = [
  { target: systemBun, kind: "runtime" },
  { target: join(system32, "bunx.exe"), kind: "alias" },
  { target: join(system32, "bunsh.exe"), kind: "alias" },
  ...["bun.exe", "bunx.exe", "bunsh.exe", "node.exe"].map((name) => ({ target: `C:/Users/omara/.bun/bin/${name}`, kind: "alias" as const })),
  { target: "C:/SSH/omar/server/bin/node.exe", kind: "alias" },
];
// Replace System32/node.exe only when it is already the same Bun binary as System32/bun.exe.
// A standalone Node installation is left untouched.
const systemNode = join(system32, "node.exe");
let systemNodeDecision = "not present; no System32 node.exe target added";
if (existsSync(systemBun) && existsSync(systemNode) && (await hashFile(systemBun)) === (await hashFile(systemNode))) {
  targetSpecs.push({ target: systemNode, kind: "alias" });
  systemNodeDecision = "existing file matched System32/bun.exe and was treated as an existing Bun alias";
} else if (existsSync(systemNode)) {
  systemNodeDecision = "existing file differs from System32/bun.exe; preserved as a separate runtime";
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const transaction = `${stamp}-${crypto.randomUUID()}`;
const backup = join(root, "server/var/runtime-backups", transaction);
const fileBackup = join(backup, "files");
mkdirSync(fileBackup, { recursive: true });
await Bun.write(join(backup, "source-manifest.json"), Bun.file(manifestPath));
await Bun.write(join(backup, "qualification-report.json"), Bun.file(reportPath));
const latestInstallPath = join(root, "server/var/runtime-install.json");
const hadLatestInstall = existsSync(latestInstallPath);
const previousLatestInstall = join(backup, "previous-runtime-install.json");
if (hadLatestInstall) copyFileSync(latestInstallPath, previousLatestInstall);

type State = { target: string; kind: "runtime" | "alias"; staged: string; displaced: string; backupCopy?: string; hadOriginal: boolean; installed: boolean; stageMode?: "hardlink" | "copy-fallback" | "runtime-copy" };
const states: State[] = targetSpecs.map(({ target, kind }, index) => ({
  target, kind,
  staged: join(dirname(target), `.omar-bun-${transaction}-${index}.tmp`),
  displaced: join(dirname(target), `.omar-bun-${transaction}-${index}.previous`),
  backupCopy: existsSync(target) ? join(fileBackup, `${index}-${basename(target)}`) : undefined,
  hadOriginal: existsSync(target),
  installed: false,
}));
const rollbackErrors: string[] = [];
let promoted = false;
let record: Record<string, unknown> | undefined;
try {
  for (const state of states) {
    mkdirSync(dirname(state.target), { recursive: true });
    if (existsSync(state.staged) || existsSync(state.displaced)) fail(`Transaction staging path already exists: ${state.target}`);
    if (state.kind === "runtime") {
      copyFileSync(binary, state.staged);
      state.stageMode = "runtime-copy";
    } else {
      try {
        linkSync(systemBun, state.staged);
        state.stageMode = "hardlink";
      } catch {
        copyFileSync(systemBun, state.staged);
        state.stageMode = "copy-fallback";
      }
    }
    if (await hashFile(state.staged) !== binarySha256) fail(`Staged copy failed digest verification: ${state.target}`);
    if (state.hadOriginal) {
      copyFileSync(state.target, state.backupCopy!);
      const oldDigest = await hashFile(state.target);
      if (await hashFile(state.backupCopy!) !== oldDigest) fail(`Backup digest verification failed: ${state.target}`);
      state.displaced = `${state.target}.omar-previous-${transaction}`;
      renameSync(state.target, state.displaced);
    }
    renameSync(state.staged, state.target);
    state.installed = true;
  }
  for (const state of states) if (await hashFile(state.target) !== binarySha256) fail(`Installed digest verification failed: ${state.target}`);
  const installed = [];
  for (const state of states) installed.push({ path: state.target, sha256: await hashFile(state.target), alias: basename(state.target), kind: state.kind, method: state.stageMode });
  record = {
    schema: "aphrody.bun-runtime-install/v1",
    installedAt: new Date().toISOString(),
    version: manifest.artifact.version,
    revision: manifest.artifact.revision,
    sha256: binarySha256,
    source: manifest.source,
    sourceManifest: { path: manifestPath, sha256: manifestSha256 },
    qualificationReport: { path: reportPath, sha256: await hashFile(reportPath) },
    installed,
    backup,
    systemNodeDecision,
    recovery: "Restore each original from backup/files; remove targets that had no original. Previous files remain beside System32 targets until cleanup is separately requested.",
  };
  await Bun.write(join(backup, "install.json"), `${JSON.stringify(record, null, 2)}\n`);
  await Bun.write(latestInstallPath, `${JSON.stringify(record, null, 2)}\n`);
  promoted = true;
} catch (error) {
  for (const state of [...states].reverse()) {
    try {
      if (state.installed && existsSync(state.target)) rmSync(state.target);
      if (state.hadOriginal && existsSync(state.displaced)) renameSync(state.displaced, state.target);
      if (!state.hadOriginal && existsSync(state.target)) rmSync(state.target);
      if (existsSync(state.staged)) rmSync(state.staged);
    } catch (rollbackError) {
      rollbackErrors.push(`${state.target}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
  }
  try {
    if (hadLatestInstall && existsSync(previousLatestInstall)) copyFileSync(previousLatestInstall, latestInstallPath);
    else rmSync(latestInstallPath, { force: true });
  } catch (rollbackError) {
    rollbackErrors.push(`runtime-install.json: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
  }
  try { rmSync(join(backup, "install.json"), { force: true }); } catch {}
  await Bun.write(join(backup, "rollback.json"), `${JSON.stringify({ attemptedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error), rollbackErrors, states }, null, 2)}\n`);
  throw error;
}

if (!promoted) fail("Promotion did not complete");
console.log(JSON.stringify(record));
