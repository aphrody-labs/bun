import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CLEF,
  assertAcquisition,
  headCommand,
  offlineHeadEnvironment,
  prepareHeadRecords,
  recordRole,
} from "./clef.ts";
const roots: string[] = [];
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { force: true, recursive: true });
});
const hash = (input: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(input).digest("hex");
test("head controller never falls back to a repository download or a hosted model", () => {
  const command = headCommand({
    bun: "qualified-bun",
    python: "existing-python",
    store: "/protected/clef",
    mode: "inspect",
  });
  expect(command.slice(0, 5)).toEqual(["qualified-bun", "uv", "run", "--no-project", "--offline"]);
  expect(command).toContain("--no-python-downloads");
  expect(command).not.toContain("Cloudflare/clef-flash");
  expect(() => headCommand({ bun: "bun", python: "python", store: "/protected", mode: "probe" })).toThrow("heavy lock");
  expect(() => headCommand({ bun: "bun", python: "python", store: "/protected", mode: "train" })).toThrow("heavy lock");
});
test("offline head environment strips provider credentials and bounds CPU threads", () => {
  const env = offlineHeadEnvironment("/protected", {
    PATH: "tools",
    HF_TOKEN: "not-forwarded",
    OPENAI_API_KEY: "not-forwarded",
    JEV_API_KEY: "not-forwarded",
    OMP_NUM_THREADS: "256",
  });
  expect(env).toMatchObject({
    PATH: "tools",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HF_HUB_DISABLE_IMPLICIT_TOKEN: "1",
    OMP_NUM_THREADS: "1",
    MKL_NUM_THREADS: "1",
    CUDA_VISIBLE_DEVICES: "",
  });
  expect(Object.keys(env)).not.toContain("HF_TOKEN");
  expect(Object.keys(env)).not.toContain("OPENAI_API_KEY");
  expect(Object.keys(env)).not.toContain("JEV_API_KEY");
});
test("head identity remains official and synthetic probes cannot qualify training", async () => {
  const script = await Bun.file(join(import.meta.dir, "clef-head.py")).text();
  expect(CLEF.dependencies).toEqual({
    torch: "2.11.0+cpu",
    transformers: "5.10.2",
    safetensors: "0.8.0",
    accelerate: "1.15.0",
    pillow: "12.3.0",
  });
  expect(script).toContain("head = owner.JointSchemaHead(**config)");
  expect(script).toContain("head.load_state_dict(load_file(");
  expect(script).toContain('"syntheticInput": True');
  expect(script).toContain('"trained": False, "artifactQualified": False');
  expect(script).toContain("local_files_only=True, trust_remote_code=False");
  expect(script).not.toContain("snapshot_download(");
});
test("foreign or incomplete acquisition rejects before any model import", () => {
  const receipt = {
    repository: CLEF.repository,
    revision: CLEF.revision,
    complete: true,
    completelyRehashed: false,
    modelPath: "fake",
    bytes: CLEF.bytes,
    files: [],
  };
  expect(() => assertAcquisition(receipt)).toThrow("completely rehashed");
  expect(() => assertAcquisition({ ...receipt, repository: "foreign/model" })).toThrow("pinned");
});
test("public roles link skills, MCP, docs, types and behavior tests to their owning Git paths", () => {
  expect(recordRole(".claude/skills/bun-graph/SKILL.md")).toBe("skill");
  expect(recordRole("packages/bun-types/video.d.ts")).toBe("api_types");
  expect(recordRole("src/runtime/mcp/tools.rs")).toBe("mcp");
  expect(recordRole("packages/bun-agent-plugin/src/native.ts")).toBe("mcp");
  expect(recordRole("docs/runtime/video.mdx")).toBe("docs");
  expect(recordRole("test/js/bun/video/test.ts")).toBe("behavior_test");
  expect(recordRole("src/runtime/video.rs")).toBe("source");
});
test("derived records retain hashes, independent splits and labels without copying binary/private stores", async () => {
  const root = mkdtempSync(join(tmpdir(), "clef-public-records-"));
  roots.push(root);
  const owners = [
    {
      repository: "oven-sh/bun",
      revision: "a".repeat(40),
      path: "docs/runtime/source.mdx",
      mode: "100644",
      group: "docs",
    },
  ];
  const source = ["train", "validation", "test"].map((split, i) => ({
    kind: "public-source",
    sha256: hash(split),
    gitBlob: "b".repeat(40),
    bytes: 10,
    offset: 0,
    sourceEncoding: "utf8",
    split,
    evaluation: "code-agent",
    owners,
    data: Buffer.from("Bun source " + i).toString("base64"),
  }));
  source.push({ ...source[0]!, sourceEncoding: "binary" });
  const data = source.map(row => JSON.stringify(row)).join("\n") + "\n";
  await Bun.write(join(root, "source-00000.jsonl"), data);
  const manifest = {
    schema: "bun.public-source-dataset/1",
    sourceBlobsComplete: true,
    trained: false,
    sources: [
      { repository: "oven-sh/bun", revision: "a".repeat(40) },
      { repository: "aphrody-labs/bun", revision: "c".repeat(40) },
    ],
    splits: { heldOutAvailable: true },
    shards: [{ path: "source-00000.jsonl", bytes: Buffer.byteLength(data), sha256: hash(data) }],
  };
  const text = JSON.stringify(manifest);
  await Bun.write(join(root, "source-manifest.json"), text);
  const output = join(root, "head-records.jsonl"),
    receipt = await prepareHeadRecords(root, output);
  expect(receipt.counts).toEqual({ train: 1, validation: 1, test: 1 });
  expect(receipt.roles).toEqual({ docs: 3 });
  expect(receipt.dropped.binary).toBe(1);
  expect(receipt.trained).toBe(false);
  expect(receipt.multimodalPrepared).toBe(false);
  const rows = (await Bun.file(output).text())
    .trim()
    .split("\n")
    .map(line => JSON.parse(line));
  expect(rows.map(row => row.targets)).toEqual([{ role: "docs" }, { role: "docs" }, { role: "docs" }]);
  expect(rows.every(row => row.sourceManifestSHA256 === hash(text) && row.behaviorExecuted === false)).toBe(true);
  expect(hash(await Bun.file(output).bytes())).toBe(receipt.sha256);
  await expect(prepareHeadRecords(root, output)).rejects.toThrow("already exist");
});
test("changed source shard fails before publishing a derived record file", async () => {
  const root = mkdtempSync(join(tmpdir(), "clef-corrupt-records-"));
  roots.push(root);
  await Bun.write(join(root, "source-00000.jsonl"), "changed\n");
  await Bun.write(
    join(root, "source-manifest.json"),
    JSON.stringify({
      schema: "bun.public-source-dataset/1",
      sourceBlobsComplete: true,
      trained: false,
      sources: [
        { repository: "oven-sh/bun", revision: "a".repeat(40) },
        { repository: "aphrody-labs/bun", revision: "b".repeat(40) },
      ],
      splits: { heldOutAvailable: true },
      shards: [{ path: "source-00000.jsonl", bytes: 8, sha256: hash("original") }],
    }),
  );
  const output = join(root, "records.jsonl");
  await expect(prepareHeadRecords(root, output)).rejects.toThrow("SHA256");
  expect(await Bun.file(output).exists()).toBe(false);
});

test("UTF-8 spanning source chunks stays exact in the derived view and cookie payloads stay excluded", async () => {
  const root = mkdtempSync(join(tmpdir(), "clef-utf8-records-"));
  roots.push(root);
  const text = "Public Bun é🙂";
  const raw = Buffer.from(text);
  const boundary = raw.indexOf(Buffer.from("é")) + 1;
  const owners = [
    { repository: "oven-sh/bun", revision: "a".repeat(40), path: "docs/source.mdx", mode: "100644", group: "docs" },
  ];
  const dataRows = ["train", "validation", "test"].flatMap(split => [
    {
      kind: "public-source",
      sha256: hash(text + split),
      offset: 0,
      bytes: raw.length,
      sourceEncoding: "utf8",
      split,
      evaluation: "code-agent",
      owners,
      data: raw.subarray(0, boundary).toString("base64"),
    },
    {
      kind: "public-source",
      sha256: hash(text + split),
      offset: boundary,
      bytes: raw.length,
      sourceEncoding: "utf8",
      split,
      evaluation: "code-agent",
      owners,
      data: raw.subarray(boundary).toString("base64"),
    },
  ]);
  dataRows.push({ ...dataRows[0]!, owners: [{ ...owners[0]!, path: "test/testdata/cookies/session.txt" }] });
  const data = dataRows.map(r => JSON.stringify(r)).join("\n") + "\n";
  await Bun.write(join(root, "source-00000.jsonl"), data);
  await Bun.write(
    join(root, "source-manifest.json"),
    JSON.stringify({
      schema: "bun.public-source-dataset/1",
      sourceBlobsComplete: true,
      trained: false,
      sources: [
        { repository: "oven-sh/bun", revision: "a".repeat(40) },
        { repository: "aphrody-labs/bun", revision: "c".repeat(40) },
      ],
      splits: { heldOutAvailable: true },
      shards: [{ path: "source-00000.jsonl", bytes: Buffer.byteLength(data), sha256: hash(data) }],
    }),
  );
  const out = join(root, "records.jsonl"),
    receipt = await prepareHeadRecords(root, out);
  const output = (await Bun.file(out).text())
    .trim()
    .split("\n")
    .map(line => JSON.parse(line));
  expect(output.length).toBe(6);
  expect(
    output
      .slice(0, 2)
      .map(r => r.state.code)
      .join(""),
  ).toBe(text);
  expect(receipt.dropped.protectedPayload).toBe(1);
  expect((await Bun.file(out + ".manifest.json").json()).sha256).toBe(receipt.sha256);
});
