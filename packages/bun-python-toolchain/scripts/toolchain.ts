// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

export const RECEIPT_PATH = join(import.meta.dir, "..", "toolchain.receipt.json");
export const MANIFEST_PATH = "share/vu/manifest.json";
export const ACCEPTED_RECEIPT_SHA256 = "6bf2df7a773112c4242eb4f62c0b1a022f9330551bfcb6efaf356b00186a948f";

export interface AcceptedPin {
  version: string;
  revision: string;
  upstream: string;
  lockBlob: string;
  license: string;
}

export interface ToolchainReceipt {
  schema: string;
  source: { repository: string; revision: string; manifestSchema: number };
  observedArtifacts: {
    name: string;
    target: string;
    revision: string;
    manifestSha256: string;
    files: { uv: string; ruff: string; python: string };
  }[];
  sidecars: { uv: AcceptedPin; ruff: AcceptedPin };
  python: { version: string; release: string; archiveSha256: string };
}

export interface ManifestFile {
  sha256: string;
  bytes: number;
  mode: number;
}

export interface VuManifest {
  schema: number;
  name: string;
  version: string;
  target: string;
  revision: string;
  pins: Record<string, unknown>;
  capabilities: string[];
  files: Record<string, ManifestFile>;
  links: Record<string, string>;
}

export interface RuntimeReport {
  schema: "aphrody.python-toolchain-report/1";
  receiptSha256: string;
  status: "qualified" | "unavailable" | "rejected";
  artifact: { path: string; revision?: string; target?: string; manifestSha256?: string };
  tools: Record<string, { path?: string; version?: string; sha256?: string; status: string }>;
  parser: { implementation: string; status: string; sourceRevision: string };
  pythonCapabilities?: Record<string, unknown>;
  reasons: string[];
}

export function hostTarget(platform = process.platform, arch = process.arch): string {
  const architecture = arch === "x64" ? "x86_64" : arch === "arm64" ? "aarch64" : arch;
  if (platform === "linux") return `${architecture}-unknown-linux-gnu`;
  if (platform === "darwin") return `${architecture}-apple-darwin`;
  if (platform === "win32") return `${architecture}-pc-windows-msvc`;
  throw new Error(`unsupported Python toolchain host: ${platform}/${arch}`);
}

export function artifactPath(env: Record<string, string | undefined>, target: string): string {
  const selected = env["VU_ARTIFACT"] ?? env["VU_PREFIX"];
  if (selected) return resolve(selected);
  const home = env["VU_HOME"] || join(homedir(), ".vu");
  return join(home, "runtime", target, "current");
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function validateManifest(
  manifest: VuManifest,
  target: string,
  receipt: ToolchainReceipt,
  manifestSha256?: string,
): string[] {
  const problems: string[] = [];
  if (receipt.schema !== "aphrody.python-toolchain-receipt/1") problems.push("unsupported toolchain receipt");
  if (manifest.schema !== receipt.source.manifestSchema || manifest.name !== "vu-runtime")
    problems.push("unsupported vu artifact manifest");
  if (!/^[0-9a-f]{40}$/.test(manifest.revision)) problems.push("invalid vu source revision");
  if (manifest.target !== target) problems.push(`artifact target ${manifest.target} does not match host ${target}`);
  if (!manifestSha256 || !receipt.observedArtifacts.some((artifact) =>
    artifact.target === target && artifact.revision === manifest.revision && artifact.manifestSha256 === manifestSha256))
    problems.push("artifact manifest is not covered by the immutable toolchain receipt");
  const artifactReceipt = receipt.observedArtifacts.find((artifact) =>
    artifact.target === target && artifact.revision === manifest.revision && artifact.manifestSha256 === manifestSha256);
  for (const name of ["uv", "ruff", "python"])
    if (!manifest.capabilities.includes(name)) problems.push(`artifact does not declare ${name}`);

  for (const name of ["uv", "ruff"] as const) {
    const actual = manifest.pins[name] as { upstreamTag?: unknown; ref?: unknown } | undefined;
    const expected = receipt.sidecars[name];
    if (actual?.upstreamTag !== expected.version || actual.ref !== expected.revision)
      problems.push(`${name} source pin does not match the accepted receipt`);
    const entry = manifest.files[`bin/${name}`] ?? manifest.files[`bin/${name}.exe`];
    if (!entry || !validDigest(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0)
      problems.push(`${name} has no valid manifested executable`);
    else if (entry.sha256 !== artifactReceipt?.files[name])
      problems.push(`${name} file hash does not match the immutable toolchain receipt`);
  }

  const python = manifest.pins["python"] as { version?: unknown; sha256?: unknown } | undefined;
  if (python?.version !== receipt.python.version || python.sha256 !== receipt.python.archiveSha256)
    problems.push("CPython source pin does not match the accepted receipt");
  const pythonPath = Object.keys(manifest.files).find((path) => /^bin\/python(?:3\.)?\d+(?:\.\d+)?(?:\.exe)?$/.test(path));
  const pythonFileHash = pythonPath ? manifest.files[pythonPath]?.sha256 : undefined;
  if (!pythonFileHash || pythonFileHash !== artifactReceipt?.files.python)
    problems.push("CPython executable hash does not match the immutable toolchain receipt");
  return problems;
}

function binaryPath(root: string, name: string, manifest: VuManifest): string {
  const candidates = process.platform === "win32" ? [`bin/${name}.exe`, `bin/${name}`] : [`bin/${name}`];
  const path = candidates.find((candidate) => manifest.files[candidate] !== undefined);
  if (!path) throw new Error(`${name} is absent from the artifact file manifest`);
  return join(root, path);
}

function pythonBinaryPath(root: string, manifest: VuManifest, version: string): string {
  const [major, minor] = version.split(".");
  const names = process.platform === "win32"
    ? [`bin/python${major}.${minor}.exe`, "bin/python.exe"]
    : [`bin/python${major}.${minor}`, `bin/python${major}.${minor}.0`];
  const path = names.find((candidate) => manifest.files[candidate] !== undefined);
  if (!path) throw new Error(`CPython ${version} executable is absent from the artifact file manifest`);
  return join(root, path);
}

function sha256(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolveHash(hash.digest("hex")));
  });
}

function assertContained(root: string, path: string): void {
  const realRoot = realpathSync(root);
  const realPath = realpathSync(path);
  const relativePath = relative(realRoot, realPath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath === "")
    throw new Error(`artifact path escapes runtime: ${basename(path)}`);
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
    throw new Error(`${basename(path)} must be a regular artifact file`);
}

function probeVersion(path: string, args: string[]): string {
  const result = Bun.spawnSync([path, ...args], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5_000,
  });
  const output = `${result.stdout.toString()}\n${result.stderr.toString()}`.trim();
  if (result.exitCode !== 0) throw new Error(`${basename(path)} version probe failed`);
  return output.split("\n")[0]?.trim() ?? "";
}

function expectedVersion(tool: "uv" | "ruff", output: string, receipt: ToolchainReceipt): boolean {
  const expected = `${tool} ${receipt.sidecars[tool].version}`;
  return output === expected || output.startsWith(`${expected} `);
}

export async function discoverRuntime(options: {
  artifact?: string;
  env?: Record<string, string | undefined>;
  target?: string;
  receipt?: ToolchainReceipt;
  versionProbe?: (path: string, args: string[]) => string;
} = {}): Promise<RuntimeReport> {
  const env = options.env ?? process.env;
  const receiptText = await Bun.file(RECEIPT_PATH).text();
  const receiptSha256 = createHash("sha256").update(receiptText).digest("hex");
  if (receiptSha256 !== ACCEPTED_RECEIPT_SHA256)
    throw new Error("committed toolchain receipt hash changed; refusing discovery");
  const receipt = options.receipt ?? JSON.parse(receiptText) as ToolchainReceipt;
  const target = options.target ?? hostTarget();
  const selectedPath = options.artifact ? resolve(options.artifact) : artifactPath(env, target);
  const report: RuntimeReport = {
    schema: "aphrody.python-toolchain-report/1",
    receiptSha256,
    status: "unavailable",
    artifact: { path: selectedPath },
    tools: {
      uv: { status: "unavailable" },
      ruff: { status: "unavailable" },
      python: { status: "unavailable" },
    },
    parser: {
      implementation: "Ruff parser",
      status: "unavailable",
      sourceRevision: receipt.sidecars.ruff.revision,
    },
    reasons: [],
  };

  try {
    if (!(await Bun.file(join(selectedPath, MANIFEST_PATH)).exists()))
      throw new Error(`no vu manifest at ${join(selectedPath, MANIFEST_PATH)}`);
    const root = resolve(selectedPath);
    const manifestPath = join(root, MANIFEST_PATH);
    const manifestHash = await sha256(manifestPath);
    const manifest = await Bun.file(manifestPath).json() as VuManifest;
    const problems = validateManifest(manifest, target, receipt, manifestHash);
    if (problems.length) {
      report.status = "rejected";
      report.reasons.push(...problems);
      report.artifact.revision = manifest.revision;
      report.artifact.target = manifest.target;
      return report;
    }
    const probe = options.versionProbe ?? probeVersion;
    report.artifact = {
      path: root,
      revision: manifest.revision,
      target: manifest.target,
      manifestSha256: manifestHash,
    };
    for (const name of ["uv", "ruff"] as const) {
      const path = binaryPath(root, name, manifest);
      assertContained(root, path);
      const digest = await sha256(path);
      const relativePath = relative(root, path).split(sep).join("/");
      const entry = manifest.files[relativePath];
      if (statSync(path).size !== entry?.bytes)
        throw new Error(`${name} executable size does not match the vu manifest`);
      if (digest !== entry?.sha256) throw new Error(`${name} executable hash does not match the vu manifest`);
      const version = probe(path, ["--version"]);
      if (!expectedVersion(name, version, receipt)) throw new Error(`${name} version does not match the accepted receipt`);
      report.tools[name] = { path, version, sha256: digest, status: "qualified" };
    }
    const pythonPath = pythonBinaryPath(root, manifest, receipt.python.version);
    assertContained(root, pythonPath);
    const pythonRelative = relative(root, pythonPath).split(sep).join("/");
    const pythonDigest = await sha256(pythonPath);
    if (statSync(pythonPath).size !== manifest.files[pythonRelative]?.bytes)
      throw new Error("CPython executable size does not match the vu manifest");
    if (pythonDigest !== manifest.files[pythonRelative]?.sha256)
      throw new Error("CPython executable hash does not match the vu manifest");
    const pythonVersion = probe(pythonPath, ["--version"]);
    if (pythonVersion !== `Python ${receipt.python.version}`)
      throw new Error("CPython version does not match the accepted receipt");
    report.tools.python = { path: pythonPath, version: pythonVersion, sha256: pythonDigest, status: "qualified" };
    report.tools.uv.status = "qualified";
    report.tools.ruff.status = "qualified";
    report.parser.status = "qualified-via-ruff-cli";
    report.status = "qualified";
  } catch (error) {
    report.status = "rejected";
    report.reasons.push(error instanceof Error ? error.message : String(error));
  }
  return report;
}

const PYTHON_CAPABILITY_PROBE = String.raw`
import importlib.metadata as metadata
import importlib.util
import json
import sys

def package(module, distributions):
    try:
        spec = importlib.util.find_spec(module)
    except (ImportError, ValueError):
        spec = None
    versions = {}
    for name in distributions:
        try:
            versions[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            pass
    if spec is None:
        return {"status": "not-installed", "versions": versions}
    return {"status": "present-unqualified", "origin": spec.origin, "versions": versions}

result = {
    "python": {"status": "available", "version": sys.version.split()[0]},
    "cython": package("Cython", ["Cython"]),
    "jupyter": package("jupyter", ["jupyter", "jupyter-core", "jupyterlab"]),
    "treeSitterPython": package("tree_sitter_python", ["tree-sitter-python"]),
    "treeSitterRuntime": package("tree_sitter", ["tree-sitter"]),
}
try:
    spec = importlib.util.find_spec("torch")
except (ImportError, ValueError):
    spec = None
if spec is None:
    result["torch"] = {"status": "not-installed", "cpuRuntimeAvailable": False,
                       "cudaBuild": None, "cudaRuntimeAvailable": False,
                       "rocmBuild": None, "rocmRuntimeAvailable": False}
else:
    try:
        import torch
        cpu = bool(torch.ones(1).add(1).item() == 2)
        cuda_available = bool(torch.cuda.is_available())
        result["torch"] = {
            "status": "available" if cpu or cuda_available else "installed-runtime-unavailable",
            "version": torch.__version__,
            "cpuRuntimeAvailable": cpu,
            "cudaBuild": torch.version.cuda,
            "cudaRuntimeAvailable": cuda_available if torch.version.cuda else False,
            "rocmBuild": torch.version.hip,
            "rocmRuntimeAvailable": cuda_available if torch.version.hip else False,
        }
    except Exception as error:
        result["torch"] = {"status": "installed-import-failed", "errorType": type(error).__name__,
                            "cpuRuntimeAvailable": False, "cudaBuild": None,
                            "cudaRuntimeAvailable": False, "rocmBuild": None,
                            "rocmRuntimeAvailable": False}
print(json.dumps(result, sort_keys=True))
`;

function hasPythonSelection(env: Record<string, string | undefined>, cwd: string): string | null {
  if (env["VU_PYTHON"]) return "VU_PYTHON selects a managed interpreter; capability probe skipped to avoid resolving or installing it";
  let directory = resolve(cwd);
  for (;;) {
    if (existsSync(join(directory, ".python-version")))
      return `.python-version selects a managed interpreter; capability probe skipped to avoid resolving or installing it`;
    const parent = resolve(directory, "..");
    if (parent === directory) return null;
    directory = parent;
  }
}

export async function probePythonCapabilities(
  report: RuntimeReport,
  options: { env?: Record<string, string | undefined>; cwd?: string } = {},
): Promise<void> {
  if (report.status !== "qualified") throw new Error("refusing capability probe without a qualified vu runtime");
  const env = options.env ?? process.env;
  const selection = hasPythonSelection(env, options.cwd ?? process.cwd());
  if (selection) {
    report.pythonCapabilities = { status: "skipped", reason: selection };
    return;
  }
  const python = report.tools.python?.path;
  if (!python) throw new Error("qualified CPython path is missing");
  const result = Bun.spawnSync([python, "-I", "-B", "-c", PYTHON_CAPABILITY_PROBE], {
    env: { ...env, PYTHONDONTWRITEBYTECODE: "1" },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  if (result.exitCode !== 0) throw new Error("read-only Python capability probe failed");
  try {
    const capabilities = JSON.parse(result.stdout.toString()) as Record<string, unknown>;
    const torch = capabilities["torch"] as TorchRuntimeProbe | undefined;
    if (torch) capabilities["torch"] = { ...torch, availability: classifyTorchAvailability(torch) };
    report.pythonCapabilities = capabilities;
  } catch {
    throw new Error("Python capability probe returned invalid JSON");
  }
}

export interface TorchRuntimeProbe {
  status: string;
  cpuRuntimeAvailable: boolean;
  cudaBuild: string | null;
  cudaRuntimeAvailable: boolean;
  rocmBuild: string | null;
  rocmRuntimeAvailable: boolean;
}

export function classifyTorchAvailability(torch: TorchRuntimeProbe): string {
  if (torch.status === "not-installed") return "not-installed";
  if (torch.status === "installed-import-failed") return "installed-import-failed";
  if (torch.cudaBuild && torch.cudaRuntimeAvailable) return "cuda-runtime-available";
  if (torch.rocmBuild && torch.rocmRuntimeAvailable) return "rocm-runtime-available";
  if (torch.cpuRuntimeAvailable) return "cpu-runtime-available";
  return "installed-runtime-unavailable";
}
