// SPDX-License-Identifier: Apache-2.0
// Bun pilots the audited original joint head. No hosted completion or model downloader.
import { chmodSync, mkdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { verifyDownload } from "./huggingface.ts";

export const CLEF = {
  repository: "Cloudflare/clef-flash",
  revision: "8b2e5fd17c09fd49bc2880b805d5323ec7ff4ff3",
  receiptSHA256: "696fc87f2f4b99c07ee6effc26f68b6ea4b271184dac6b890915b9809b8fb6bb",
  codeSHA256: "0e304cf7c6500e8bb59bef7e2afd2c6373f82596dfb3b57d1aa93c175e2dc3a3",
  headSHA256: "19cdcec8c81dc9212be320fff47462ab342fbc1278be4368fb3da71241cf5ba0",
  bytes: 19083378312,
  dependencies: {
    torch: "2.11.0+cpu",
    transformers: "5.10.2",
    safetensors: "0.8.0",
    accelerate: "1.15.0",
    pillow: "12.3.0",
  },
  // Original README/config pins Torch 2.11 and Transformers 5.10.2; CPU index avoids the CUDA package graph.
  cpuWheel: {
    url: "https://download-r2.pytorch.org/whl/cpu/torch-2.11.0%2Bcpu-cp312-cp312-manylinux_2_28_x86_64.whl",
    sha256: "f82e2ae20c1545bb03997d1cc3143d94e14b800038669ee1aca45808a9acc338",
  },
} as const;
interface AcquiredFile {
  name: string;
  bytes: number;
  sha256: string;
  path: string;
  mode: number;
}
export interface Acquisition {
  repository: string;
  revision: string;
  complete: boolean;
  completelyRehashed: boolean;
  modelPath: string;
  bytes: number;
  files: AcquiredFile[];
}
const hash = (value: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
function confined(root: string, path: string) {
  const suffix = relative(root, path);
  return !suffix.startsWith("..") && !isAbsolute(suffix);
}
export function assertAcquisition(receipt: Acquisition) {
  if (
    receipt.repository !== CLEF.repository ||
    receipt.revision !== CLEF.revision ||
    receipt.complete !== true ||
    receipt.completelyRehashed !== true ||
    receipt.bytes !== CLEF.bytes ||
    !Array.isArray(receipt.files) ||
    receipt.files.length !== 17 ||
    new Set(receipt.files.map(f => f.name)).size !== 17
  )
    throw new Error("Clef acquisition is not the pinned completely rehashed original");
  for (const file of receipt.files)
    if (
      !/^[a-zA-Z0-9_.-]+$/.test(file.name) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes <= 0 ||
      file.mode !== 0o600
    )
      throw new Error("Invalid protected Clef file descriptor");
  if (
    receipt.files.reduce((sum, file) => sum + file.bytes, 0) !== CLEF.bytes ||
    receipt.files.find(f => f.name === "joint_schema_model.py")?.sha256 !== CLEF.codeSHA256 ||
    receipt.files.find(f => f.name === "joint_head.safetensors")?.sha256 !== CLEF.headSHA256
  )
    throw new Error("Clef code or head identity changed");
  return receipt;
}
export async function validateClef(store: string, fullRehash = false) {
  const root = realpathSync(store),
    file = Bun.file(join(root, "acquisition.json"));
  if (file.size > 1048576) throw new Error("Clef receipt exceeds byte limit");
  const bytes = await file.bytes();
  if (hash(bytes) !== CLEF.receiptSHA256) throw new Error("Clef acquisition receipt checksum mismatch");
  const receipt = assertAcquisition(JSON.parse(new TextDecoder().decode(bytes)));
  const modelPath = realpathSync(receipt.modelPath);
  if (!confined(root, modelPath)) throw new Error("Clef snapshot leaves the protected owner store");
  for (const entry of receipt.files) {
    const path = realpathSync(join(receipt.modelPath, entry.name));
    if (!confined(root, path) || Bun.file(path).size !== entry.bytes)
      throw new Error("Clef source is missing or leaves its store");
    if (
      fullRehash ||
      ["joint_schema_model.py", "joint_head.safetensors", "joint_head_config.json"].includes(entry.name)
    )
      await verifyDownload(path, { bytes: entry.bytes, sha256: entry.sha256 });
  }
  return receipt;
}
export type HeadMode = "inspect" | "probe" | "train";
export function headCommand(options: {
  bun: string;
  python: string;
  store: string;
  mode: HeadMode;
  heavyLock?: string;
  records?: string;
  output?: string;
}) {
  const script = join(import.meta.dir, "clef-head.py");
  const args = ["--mode", options.mode, "--store", resolve(options.store)];
  if (options.mode !== "inspect" && (!options.heavyLock || process.platform !== "linux"))
    throw new Error("Head execution requires the coordinated Linux heavy lock");
  if (options.mode === "train" && (!options.records || !options.output))
    throw new Error("Training requires qualified public records and protected output");
  if (options.records) args.push("--records", resolve(options.records));
  if (options.output) args.push("--output", resolve(options.output));
  const command =
    options.mode === "inspect"
      ? [
          options.bun,
          "uv",
          "run",
          "--no-project",
          "--offline",
          "--no-python-downloads",
          "--python",
          options.python,
          "python",
          script,
          ...args,
        ]
      : [options.bun, "uv", "run", "--script", "--no-python-downloads", "--python", options.python, script, ...args];
  // No polling or waiting for a build slot; a busy lock refuses the heavy operation immediately.
  return options.mode === "inspect" ? command : ["flock", "-n", options.heavyLock!, ...command];
}
export function offlineHeadEnvironment(store: string, env: Readonly<Record<string, string | undefined>> = process.env) {
  const child: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "SystemRoot", "WINDIR", "TEMP", "TMP", "UV_CACHE_DIR"])
    if (env[key]) child[key] = env[key]!;
  return {
    ...child,
    HF_HOME: join(store, ".hub"),
    HF_HUB_CACHE: join(store, ".hub"),
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HF_HUB_DISABLE_IMPLICIT_TOKEN: "1",
    TOKENIZERS_PARALLELISM: "false",
    OMP_NUM_THREADS: "1",
    MKL_NUM_THREADS: "1",
    OPENBLAS_NUM_THREADS: "1",
    CUDA_VISIBLE_DEVICES: "",
  };
}
async function* lines(path: string) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  for await (const bytes of Bun.file(path).stream()) {
    pending += decoder.decode(bytes, { stream: true });
    let newline: number;
    while ((newline = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (Buffer.byteLength(line) > 4 * 1024 * 1024) throw new Error("Public dataset row exceeds bound");
      if (line) yield JSON.parse(line);
    }
    if (Buffer.byteLength(pending) > 4 * 1024 * 1024) throw new Error("Public dataset row exceeds bound");
  }
  pending += decoder.decode();
  if (pending) throw new Error("Public dataset is not complete newline-delimited JSON");
}
export function recordRole(path: string) {
  if (path.endsWith("SKILL.md") || /(^|\/)skills\//.test(path)) return "skill";
  if (path.startsWith("packages/bun-types/") && path.endsWith(".d.ts")) return "api_types";
  if (/^src\/runtime\/mcp\/|^packages\/bun-agent-plugin\//.test(path)) return "mcp";
  if (/^docs\/|(^|\/)README(\.md)?$/.test(path)) return "docs";
  if (/^test\/|\.(test|spec)\.[^.]+$/.test(path)) return "behavior_test";
  return "source";
}
const criteria = {
  api_types: "Bun API type declarations",
  docs: "Public Bun documentation",
  skill: "Public Bun agent skill",
  mcp: "Public Bun MCP or agent-plugin contract",
  behavior_test: "Bun behavior test source",
  source: "Bun implementation or build source",
};
/** Path-derived owner labels are evidence, not teacher-model judgments or executed behavior claims. */
export async function prepareHeadRecords(dataset: string, output: string) {
  const root = realpathSync(dataset),
    manifestFile = Bun.file(join(root, "source-manifest.json"));
  if (manifestFile.size > 1048576) throw new Error("Public dataset manifest exceeds bound");
  const bytes = await manifestFile.bytes(),
    manifest = JSON.parse(new TextDecoder().decode(bytes));
  if (
    manifest.schema !== "bun.public-source-dataset/1" ||
    manifest.sourceBlobsComplete !== true ||
    manifest.trained !== false ||
    !Array.isArray(manifest.sources) ||
    manifest.sources.length !== 2 ||
    manifest.sources.some(
      (s: { repository: string; revision: string }) =>
        !["oven-sh/bun", "aphrody-labs/bun"].includes(s.repository) || !/^[a-f0-9]{40}$/.test(s.revision),
    ) ||
    !manifest.splits?.heldOutAvailable
  )
    throw new Error("Training records require complete pinned public Bun source and independent holdouts");
  const target = resolve(output);
  if (!confined(root, target)) throw new Error("Training records belong to the protected dataset owner store");
  if ((await Bun.file(target).exists()) || (await Bun.file(target + ".incomplete").exists()))
    throw new Error("Training records already exist");
  mkdirSync(join(target, ".."), { recursive: true, mode: 0o700 });
  const writer = Bun.file(target + ".incomplete").writer();
  const counts = { train: 0, validation: 0, test: 0 },
    roles: Record<string, number> = {},
    dropped = { binary: 0, ambiguousOwner: 0, symlink: 0, protectedPayload: 0 };
  let pending = 0;
  let decodedSHA = "";
  let textDecoder = new TextDecoder("utf-8", { fatal: true });
  const digest = new Bun.CryptoHasher("sha256");
  try {
    for (const shard of manifest.shards) {
      if (!/^source-\d{5}\.jsonl$/.test(shard.path)) continue;
      const path = realpathSync(join(root, shard.path));
      if (!confined(root, path)) throw new Error("Public dataset shard leaves its store");
      await verifyDownload(path, { bytes: shard.bytes, sha256: shard.sha256 });
      for await (const row of lines(path)) {
        if (
          row.kind !== "public-source" ||
          !/^[a-f0-9]{64}$/.test(row.sha256) ||
          !["train", "validation", "test"].includes(row.split) ||
          !Array.isArray(row.owners) ||
          !row.owners.length
        )
          throw new Error("Invalid public source training record");
        if (row.sourceEncoding !== "utf8") {
          dropped.binary++;
          continue;
        }
        if (row.owners.some((o: { mode: string }) => o.mode === "120000")) {
          dropped.symlink++;
          continue;
        }
        if (
          row.owners.some(
            (o: { path: string }) =>
              /(^|\/)(sessions|conversations|cookies)\//i.test(o.path) ||
              /(^|\/)\.env(?:\.|$)|\.(sqlite|safetensors|ckpt|pth)$/i.test(o.path),
          )
        ) {
          dropped.protectedPayload++;
          continue;
        }
        const categories = new Set<string>(row.owners.map((o: { path: string }) => recordRole(o.path)));
        if (categories.size !== 1) {
          dropped.ambiguousOwner++;
          continue;
        }
        const role = [...categories][0]!;
        // Preserve UTF-8 across the fixed byte-chunk boundary; the source pool retains every original byte.
        if (decodedSHA !== row.sha256) {
          textDecoder = new TextDecoder("utf-8", { fatal: true });
          decodedSHA = row.sha256;
        }
        const raw = Buffer.from(row.data, "base64");
        const code = textDecoder.decode(raw, { stream: row.offset + raw.length !== row.bytes });
        const record = {
          id: hash(row.sha256 + ":" + row.offset),
          fileSHA256: row.sha256,
          split: row.split,
          owners: row.owners,
          sourceManifestSHA256: hash(bytes),
          evaluation: row.evaluation,
          provenance: "public-git-owner-path",
          behaviorExecuted: false,
          chunk: { offset: row.offset, fileBytes: row.bytes },
          state: { code },
          questions: {
            role: { type: "choice", instructions: "Which public Bun source role owns this fragment?", criteria },
          },
          targets: { role },
        };
        const text = JSON.stringify(record) + "\n";
        writer.write(text);
        digest.update(text);
        pending += Buffer.byteLength(text);
        counts[row.split as keyof typeof counts]++;
        roles[role] = (roles[role] ?? 0) + 1;
        if (pending >= 262144) {
          await writer.flush();
          pending = 0;
        }
      }
    }
    if (!counts.train || !counts.validation || !counts.test)
      throw new Error("Derived public records have no independent train/validation/test groups");
    await writer.end();
    chmodSync(target + ".incomplete", 0o600);
    const { renameSync } = await import("node:fs");
    renameSync(target + ".incomplete", target);
    const receipt = {
      records: target,
      sha256: digest.digest("hex"),
      sourceManifestSHA256: hash(bytes),
      sources: manifest.sources,
      counts,
      roles,
      dropped,
      multimodalPrepared: false,
      trained: false,
      labels: "deterministic-public-owner-path; no behavioral or semantic teacher labels",
    };
    await Bun.write(target + ".manifest.json.incomplete", JSON.stringify(receipt, null, 2) + "\n");
    chmodSync(target + ".manifest.json.incomplete", 0o600);
    renameSync(target + ".manifest.json.incomplete", target + ".manifest.json");
    return receipt;
  } catch (error) {
    try {
      await writer.end();
    } catch {}
    throw error;
  }
}
if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      mode: { type: "string", default: "inspect" },
      store: { type: "string" },
      python: { type: "string" },
      "heavy-lock": { type: "string" },
      records: { type: "string" },
      output: { type: "string" },
      dataset: { type: "string" },
    },
    strict: true,
  });
  if (values.help) {
    console.log(
      "bun packages/buv/scripts/clef.ts --mode inspect --store <protected-acquisition> --python <existing-python>\n" +
        "  --mode records --dataset <protected-public-source> --output <records.jsonl>\n" +
        "  --mode probe|train --store <protected-acquisition> --python <existing-python> --heavy-lock <coordinated-lock> [--records <jsonl> --output <protected-model>]\n" +
        "Inspect imports no Torch. Probe checks original head gradients on synthetic inputs; it does not train Yolo.\n" +
        "Train updates only the original joint head against qualified public Bun records; it needs the frozen CPU backbone and independent evaluation.",
    );
  } else if (values.mode === "records") {
    if (!values.dataset || !values.output) throw new Error("Records mode requires protected --dataset and --output");
    console.log(JSON.stringify(await prepareHeadRecords(values.dataset, values.output)));
  } else {
    if (!values.store || !values.python || !["inspect", "probe", "train"].includes(values.mode))
      throw new Error("Select --mode inspect|probe|train, --store and existing --python");
    const mode = values.mode as HeadMode;
    // Full backbone rehash belongs under the lock in the Python train owner, not before contention is checked.
    await validateClef(values.store);
    const command = headCommand({
      bun: process.execPath,
      python: values.python,
      store: values.store,
      mode,
      ...(values["heavy-lock"] ? { heavyLock: values["heavy-lock"] } : {}),
      ...(values.records ? { records: values.records } : {}),
      ...(values.output ? { output: values.output } : {}),
    });
    const child = Bun.spawn(command, {
      stdout: "inherit",
      stderr: "inherit",
      env: offlineHeadEnvironment(values.store),
      timeout: mode === "inspect" ? 60000 : 3600000,
    });
    process.exit(await child.exited);
  }
}
