#!/usr/bin/env bun
/**
 * Package a previously qualified Aphrody Bun Windows x64 artifact locally.
 * This script never builds, promotes, publishes, or substitutes a binary.
 *
 * bun server/tools/package-runtime-release.ts \
 *   --binary C:/bun/build/release/bun.exe \
 *   --source-manifest C:/SSH/omar/server/var/runtime-qualification/source-manifest.json \
 *   --report C:/SSH/omar/server/var/runtime-qualification/report.json
 */
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

type Json = Record<string, any>;
const args = new Map<string, string>();
for (let i = 2; i < Bun.argv.length; i += 2) {
  const key = Bun.argv[i];
  const value = Bun.argv[i + 1];
  if (!key?.startsWith("--") || !value || args.has(key)) throw new Error(`Invalid or duplicate argument: ${key ?? "<missing>"}`);
  args.set(key, value);
}
const required = ["--binary", "--source-manifest", "--report"];
for (const key of required) if (!args.has(key)) throw new Error(`Required argument: ${key} <absolute path>`);
for (const key of args.keys()) if (!required.includes(key)) throw new Error(`Unknown argument: ${key}`);

const absolute = (value: string, label: string) => {
  if (!isAbsolute(value)) throw new Error(`${label} must be an absolute path`);
  return resolve(value);
};
const binary = absolute(args.get("--binary")!, "binary");
const manifestPath = absolute(args.get("--source-manifest")!, "source manifest");
const reportPath = absolute(args.get("--report")!, "qualification report");
const root = "C:/SSH/omar";
const serverRoot = join(root, "server");
const artifactRoot = join(serverRoot, "var/releases");
const fail = (message: string): never => { throw new Error(message); };
const sha256 = async (path: string) => {
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
};
const samePath = (left: string, right: string) => resolve(left).toLowerCase() === resolve(right).toLowerCase();
const run = (cmd: string[]) => Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe", timeout: 60_000 });
const output = (result: ReturnType<typeof run>) => result.stdout.toString().trim();

if (![binary, manifestPath, reportPath].every(existsSync)) fail("Binary, source manifest, or qualification report is missing");
if (!statSync(binary).isFile() || !statSync(manifestPath).isFile() || !statSync(reportPath).isFile()) fail("All three inputs must be regular files");

const [manifest, report] = await Promise.all([
  Bun.file(manifestPath).json() as Promise<Json>,
  Bun.file(reportPath).json() as Promise<Json>,
]);
const binarySha256 = await sha256(binary);
const sourceManifestSha256 = await sha256(manifestPath);
const reportSha256 = await sha256(reportPath);
const canonicalBinary = realpathSync(binary);

if (manifest.schema !== "aphrody.bun-runtime-qualification/v1") fail("Unsupported source qualification manifest schema");
if (report.schema !== "aphrody.bun-runtime-qualification-report/v1" || report.qualified !== true || report.administrator !== true) fail("A successful administrator qualification report is required");
if (manifest.artifact?.version !== "1.4.4" || manifest.target !== "windows-x64" || manifest.windowsQualified !== true) fail("Only a Windows x64 stable 1.4.4 artifact can be packaged");
if (typeof manifest.artifact.revision !== "string" || !manifest.artifact.revision || /canary|alpha|beta|rc/i.test(manifest.artifact.revision)) fail("Canary or prerelease revisions cannot be packaged");
if (!/^[a-f0-9]{64}$/i.test(manifest.artifact.sha256 ?? "") || manifest.artifact.sha256.toLowerCase() !== binarySha256) fail("Source manifest artifact digest does not match --binary");
if (!samePath(realpathSync(absolute(manifest.artifact.path, "manifest artifact path")), canonicalBinary)) fail("Source manifest artifact path does not match --binary");
if (!samePath(report.binary?.path, binary) || report.binary.sha256?.toLowerCase() !== binarySha256 || report.binary.version !== "1.4.4" || report.binary.revision !== manifest.artifact.revision) fail("Qualification report binary identity or digest does not match");
if (!samePath(report.sourceManifest?.path, manifestPath) || report.sourceManifest.sha256?.toLowerCase() !== sourceManifestSha256) fail("Qualification report does not authenticate this source manifest");
if (report.source?.repository !== manifest.source?.repository || report.source?.baseCommit !== manifest.source?.baseCommit || report.source?.commit !== manifest.source?.commit || report.source?.dirty !== manifest.source?.dirty || report.source?.diffSha256 !== manifest.source?.diffSha256) fail("Qualification report source provenance differs from the source manifest");
if (!manifest.build?.command || manifest.build.profile !== "release" || !manifest.source?.repository || !/^[a-f0-9]{40,64}$/i.test(manifest.source.baseCommit ?? "") || !/^[a-f0-9]{40,64}$/i.test(manifest.source.commit ?? "") || typeof manifest.source.dirty !== "boolean") fail("Release build or source pin provenance is incomplete");
if (manifest.source.dirty && !/^[a-f0-9]{64}$/i.test(manifest.source.diffSha256 ?? "")) fail("Dirty source is missing its recorded diff digest");
if (manifest.gates?.status !== "qualified" || manifest.gates?.log?.exitCode !== 0 || !Array.isArray(manifest.gates?.warnings) || manifest.gates.warnings.length !== 0 || !Array.isArray(manifest.gates?.unexpectedExports) || manifest.gates.unexpectedExports.length !== 0) fail("Build gates are not cleanly qualified");
const gateLogPath = absolute(manifest.gates.log.path, "gate log path");
if (!existsSync(gateLogPath) || await sha256(gateLogPath) !== manifest.gates.log.sha256?.toLowerCase()) fail("Gate log is missing or its digest changed");
const requiredProbes = ["revision", "version", "windows-native-module", "windows-memory-status", "embedded-uv", "msvc-doctor", "bun-python-graph", "graph-index-native-module", "node-compatibility", "wasm-cli", "bun-shell", "bunsh-argv0-dispatch"];
if (!Array.isArray(report.probes) || requiredProbes.some((name) => !report.probes.some((probe: Json) => probe.name === name && probe.passed === true))) fail("Qualification report is missing a required passing probe");

const revisionResult = run([binary, "--revision"]);
const versionResult = run([binary, "--version"]);
const actualRevision = output(revisionResult).split(/\r?\n/)[0];
const actualVersion = output(versionResult).split(/\r?\n/)[0];
if (revisionResult.exitCode !== 0 || versionResult.exitCode !== 0 || actualRevision !== manifest.artifact.revision || !/^1\.4\.4(?:\s|$)/.test(actualVersion) || /canary|alpha|beta|rc/i.test(actualVersion)) fail("Binary does not report the exact qualified stable 1.4.4 identity");

const sourceCommit = manifest.source.commit.toLowerCase();
const safeCommit = sourceCommit.slice(0, 12);
const version = "1.4.4";
mkdirSync(artifactRoot, { recursive: true });
const archiveName = `bun-${version}-${safeCommit}-windows-x64.tar.gz`;
const archivePath = join(artifactRoot, archiveName);
if (existsSync(archivePath)) fail(`Release archive already exists; refusing to overwrite: ${archiveName}`);
const temporaryArchive = `${archivePath}.tmp-${crypto.randomUUID()}`;

function redactLocalPaths(value: any): any {
  if (Array.isArray(value)) return value.map(redactLocalPaths);
  if (!value || typeof value !== "object") return value;
  const result: Json = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase() === "path" && typeof item === "string" && isAbsolute(item)) result[key] = "<local-path-redacted>";
    else result[key] = redactLocalPaths(item);
  }
  return result;
}

const files: Record<string, BlobPart> = {
  // Bun.Archive.write needs concrete bytes here; a BunFile BlobPart can be
  // recorded with a zero-length TAR entry even though its size is non-zero.
  "bun.exe": new Uint8Array(await Bun.file(binary).arrayBuffer()),
  "source-manifest.redacted.json": `${JSON.stringify(redactLocalPaths(manifest), null, 2)}\n`,
  "qualification-report.redacted.json": `${JSON.stringify(redactLocalPaths(report), null, 2)}\n`,
  "qualification-inputs.json": `${JSON.stringify({
    schema: "aphrody.bun-runtime-release-inputs/v1",
    version,
    revision: manifest.artifact.revision,
    sourceCommit,
    binarySha256,
    sourceManifestOriginalSha256: sourceManifestSha256,
    qualificationReportOriginalSha256: reportSha256,
    note: "Absolute local paths are redacted in the packaged JSON copies; verified source and binary hash records remain unchanged.",
  }, null, 2)}\n`,
  "LICENSE.md": new Uint8Array(await Bun.file("C:/bun/LICENSE.md").arrayBuffer()),
  "BUILD-AND-RELINK.md": "# Build and relink notes\n\nThis local bundle contains one `bun.exe`; `bunx.exe` and `bunsh.exe` are intended to be hardlinks to that file when installed. The archive does not contain duplicate runtime executables.\n\nThe qualified source repository is recorded in `source-manifest.redacted.json`. Check out the exact `sourceCommit` recorded in `qualification-inputs.json`. The build profile and command are recorded in the manifest. This artifact was built from a dirty source tree: its `diffSha256` is preserved in the manifest, but the corresponding patch is not included here, so this bundle alone does not reproduce those local changes.\n\nFor the documented JavaScriptCore/WebKit relink path, consult `LICENSE.md`: clone the referenced patched WebKit source into `vendor/WebKit`, run `bun sync-webkit-source` to select Bun's pinned WebKit revision, then run `bun run build:local`. Use the source checkout and build configuration recorded by the qualification manifest.\n\nThis file records source pins and relink references only. It makes no separate legal conclusion about redistribution or license compliance.\n",
};
files["BUILD-AND-RELINK.md"] = `# Build and relink notes\n\nThis local bundle contains one bun.exe. Install bunx.exe and bunsh.exe as hardlinks to that executable.\n\nRepository: ${manifest.source.repository}\nSource commit: ${sourceCommit}\nBuild profile: release\nBuild command: ${manifest.build.command}\n\n${manifest.source.dirty ? (manifest.source.buildInputsClean === true ? "All build inputs belong to the recorded commit. The source manifest separately records excluded local documentation edits.\n" : "The checkout had local changes; the manifest records their digest. Reproducing this artifact also requires the recorded local patch.\n") : "The build was made from the recorded source commit.\n"}\nThe documented JavaScriptCore/WebKit relink path is in LICENSE.md: check out the referenced patched WebKit source in vendor/WebKit, select the pinned WebKit revision with bun sync-webkit-source, and run bun run build:local.\n`;

const vendorRoot = "C:/bun/vendor";
for await (const path of new Bun.Glob("**/{LICENSE,LICENSE.*,COPYING,COPYING.*,NOTICE,NOTICE.*}").scan({ cwd: vendorRoot, absolute: true, onlyFiles: true, followSymlinks: false })) {
  const rel = relative(vendorRoot, path).split(sep).join("/");
  if (rel.split("/").some((part) => part === "test" || part === "tests" || part === "fixtures")) continue;
  files[`licenses/vendor/${rel}`] = new Uint8Array(await Bun.file(path).arrayBuffer());
}

const checksums: string[] = [];
for (const [name, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : await new Response(data).arrayBuffer();
  const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  checksums.push(`${hash}  ${name}`);
}
files["SHA256SUMS"] = `${checksums.join("\n")}\n`;

try {
  await Bun.Archive.write(temporaryArchive, files, { compress: "gzip", mtime: 0 });
  if (!existsSync(temporaryArchive) || statSync(temporaryArchive).size === 0) fail("Bun.Archive did not produce a non-empty archive");
  renameSync(temporaryArchive, archivePath);
} catch (error) {
  // Keep an incomplete temp archive out of the release directory.
  try { if (existsSync(temporaryArchive)) rmSync(temporaryArchive); } catch {}
  throw error;
}

console.log(JSON.stringify({ archive: archivePath, version, revision: manifest.artifact.revision, sourceCommit, binarySha256, sourceManifestSha256, qualificationReportSha256: reportSha256, packagedFiles: Object.keys(files).length, vendorLicenseFiles: Object.keys(files).filter((name) => name.startsWith("licenses/vendor/")).length, published: false }));
