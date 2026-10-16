import { expect, test } from "bun:test";
import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import {
  inspectPortableNpmArchive,
  consumePortableNpmArchive,
  portableNpmSelection,
  validatePortableNpmProof,
  verifyQualifiedPortableNpmArchive,
  verifyPortableNpmMetadata,
  type PortableNpmProof,
  npmSourceQualificationRoute,
  npmSelectionIncludesPlugin,
  inspectPluginNpmArchive,
  validatePluginNpmProof,
  verifyPluginNpmPublication,
  type PluginNpmProof,
  verifyPluginTestSummary,
} from "./release-portable-npm";

test("portable source qualification never substitutes for native or mixed selections", () => {
  expect(portableNpmSelection("bun-tools,bun-supervisor")).toEqual(["bun-supervisor", "bun-tools"]);
  expect(portableNpmSelection("bun-tauri")).toEqual(["bun-tauri"]);
  for (const only of [
    undefined,
    "",
    "bun-types",
    "bun-runtime-sdk",
    "bun-nginx",
    "win32",
    "bun-tools,bun-types",
    "bun-tools,bun-tools",
    " bun-tools",
    "bun-tools,",
  ])
    expect(portableNpmSelection(only)).toBeNull();
});

test("plugin gate summaries refuse exit-zero no-tests, skipped suites and absent owner paths", () => {
  const suite = "./test/cli/mcp/mcp.test.ts";
  const log = "test/cli/mcp/mcp.test.ts:\n29 pass\n0 fail\nRan 29 tests across 1 file.";
  expect(() => verifyPluginTestSummary(log, [suite])).not.toThrow();
  for (const changed of [
    "[exit_status:0]",
    log.replace("29 pass", "0 pass"),
    log.replace("0 fail", "1 fail"),
    log + "\n1 skip",
    log.replace("test/cli/mcp/mcp.test.ts:", "foreign.test.ts:"),
  ])
    expect(() => verifyPluginTestSummary(changed, [suite])).toThrow("complete test suites");
});

const fixture = (changes: Record<string, string> = {}, pkg: Record<string, unknown> = {}) =>
  new Bun.Archive(
    {
      "package/package.json": JSON.stringify({
        name: "@aphrody/bun-tools",
        version: "1.4.4-aphrody.1",
        exports: { ".": "./src/index.ts", "./part/*": "./src/part/*.ts" },
        ...pkg,
      }),
      "package/src/index.ts": "export const toolAssetPin = () => 'fixture';",
      "package/src/part/one.ts": "export const one = 1;",
      ...changes,
    },
    { format: "tar", compress: "gzip" },
  ).bytes();

test("archive qualification resolves every wildcard export and pins actual shipped source", async () => {
  const bytes = await fixture();
  const { proof } = await inspectPortableNpmArchive(bytes, "bun-tools");
  expect(proof.name).toBe("@aphrody/bun-tools");
  expect(proof.exports.map(file => file.path)).toEqual(["package/src/index.ts", "package/src/part/one.ts"]);
  expect(proof.archiveBytes).toBe(bytes.length);
  await expect(verifyQualifiedPortableNpmArchive(proof, bytes)).resolves.toBeUndefined();
  await expect(
    verifyQualifiedPortableNpmArchive(proof, await fixture({ "package/src/part/one.ts": "export const one = 2;" })),
  ).rejects.toThrow("differs");
  await expect(
    verifyQualifiedPortableNpmArchive(proof, await fixture({}, { version: "1.4.4-aphrody.2" })),
  ).rejects.toThrow("differs");
});

test("source-only archives reject native bytes, private captures and unknown file roots", async () => {
  for (const name of [
    "package/src/lib.so.1",
    "package/src/engine.node",
    "package/src/native.dll",
    "package/src/a.exe",
    "package/.env",
    "package/src/cookies/jar.json",
    "package/src/corpus/data.json",
    "package/unknown.ts",
  ])
    await expect(
      inspectPortableNpmArchive(await fixture({ [name]: "controlled fixture" }), "bun-tools"),
    ).rejects.toThrow("source closure");
});

test("unqualified dependency and export closures cannot reach publication", async () => {
  for (const pkg of [
    { dependencies: { external: "1.0.0" } },
    { optionalDependencies: { external: "1.0.0" } },
    { peerDependencies: { external: "1.0.0" } },
    { bundledDependencies: ["external"] },
  ])
    await expect(inspectPortableNpmArchive(await fixture({}, pkg), "bun-tools")).rejects.toThrow("dependency closure");
  for (const exports of [{ ".": "./missing.ts" }, { ".": "../escape.ts" }, { ".": { browser: "./src/index.ts" } }])
    await expect(inspectPortableNpmArchive(await fixture({}, { exports }), "bun-tools")).rejects.toThrow("export");
});

test("license and NOTICE metadata cannot silently disappear behind npm files filters", async () => {
  const value = "controlled NOTICE fixture";
  const expected = [
    { path: "NOTICE", mode: "100644", sha256: new Bun.CryptoHasher("sha256").update(value).digest("hex") },
  ];
  const missing = await inspectPortableNpmArchive(await fixture(), "bun-tools");
  await expect(verifyPortableNpmMetadata(missing.files, expected)).rejects.toThrow("metadata");
  const present = await inspectPortableNpmArchive(await fixture({ "package/NOTICE": value }), "bun-tools");
  await expect(verifyPortableNpmMetadata(present.files, expected)).resolves.toBeUndefined();
  await expect(verifyPortableNpmMetadata(present.files, [{ ...expected[0]!, sha256: "f".repeat(64) }])).rejects.toThrow(
    "metadata",
  );
});

test("source proofs bind source, lock, exact selection, runtime and retained gate evidence", async () => {
  const { proof: pkg } = await inspectPortableNpmArchive(await fixture(), "bun-tools");
  const proof: PortableNpmProof = {
    schema: 1,
    kind: "bun-portable-npm-source-qualification",
    source: "a".repeat(40),
    lockSHA256: "b".repeat(64),
    runtime: {
      version: "1.4.4",
      revision: "c".repeat(40),
      sourceUrl: "https://github.com/aphrody-labs/bun/releases/download/bun-v1.4.4/bun-linux-x64.zip",
    },
    selection: ["bun-tools"],
    nativePayloadQualified: false,
    standaloneTypesQualified: false,
    packages: [pkg],
    logs: [0, 1].map(index => ({ name: `gate-${index}.log`, sha256: "d".repeat(64) })),
  };
  expect(() => validatePortableNpmProof(proof, proof.source, "bun-tools")).not.toThrow();
  for (const changed of [
    { ...proof, source: "e".repeat(40) },
    { ...proof, lockSHA256: "bad" },
    { ...proof, logs: proof.logs.slice(1) },
    { ...proof, packages: [{ ...pkg, archiveSHA256: "bad" }] },
    { ...proof, nativePayloadQualified: true },
    { ...proof, standaloneTypesQualified: true },
  ])
    expect(() => validatePortableNpmProof(changed, proof.source, "bun-tools")).toThrow();
  expect(() => validatePortableNpmProof(proof, proof.source, "bun-tools,bun-nginx")).toThrow();
  expect(proof.nativePayloadQualified).toBe(false);
});

test("CI routes only exact qualified source selections away from the native release gate", async () => {
  const workflow = Bun.YAML.parse(
    await Bun.file(new URL("../../.github/workflows/aphrody-publish-npm.yml", import.meta.url)).text(),
  ) as {
    jobs: { publish: { steps: { id?: string; name?: string; run?: string; if?: string }[] } };
  };
  const steps = workflow.jobs.publish.steps;
  const route = steps.find(step => step.id === "qualification");
  expect(typeof route?.run).toBe("string");
  using directory = tempDir("portable-npm-workflow-route", {});
  for (const [only, expected] of [
    ["bun-tools,bun-tauri", "portable-source"],
    ["bun-agent-plugin", "plugin-source"],
    ["bun-tools,bun-agent-plugin", "native-full"],
    ["bun-tools,bun-runtime-sdk", "native-full"],
    ["", "native-full"],
    ["bun-tools,bun-tools", "native-full"],
    ["windows-win32", "native-full"],
  ]) {
    const output = join(String(directory), "github-output");
    await Bun.write(output, "");
    const child = Bun.spawn(["bash", "-e", "-c", route!.run!], {
      cwd: join(import.meta.dir, "../.."),
      env: { ...process.env, ONLY: only, GITHUB_OUTPUT: output },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      Bun.readableStreamToText(child.stdout),
      Bun.readableStreamToText(child.stderr),
      child.exited,
    ]);
    expect(stdout).toBe("");
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(await Bun.file(output).text()).toBe(
      `kind=${expected}\nplugin=${npmSelectionIncludesPlugin(only)}\nruntime-version=${(await Bun.file(join(import.meta.dir, "../../package.json")).json()).version}\n`,
    );
  }
  expect(steps.find(step => step.id === "portable")?.if).toBe(
    "inputs.dry-run != true && steps.qualification.outputs.kind == 'portable-source'",
  );
  expect(steps.find(step => step.run?.includes("download-verify"))?.if).toBe(
    "inputs.dry-run != true && steps.qualification.outputs.kind != 'portable-source' && steps.qualification.outputs.kind != 'plugin-source'",
  );
  const publish = steps.findIndex(step => step.name === "Publish");
  expect(publish).toBeGreaterThan(steps.findIndex(step => step.id === "portable"));
  expect(steps[publish]?.run).toContain("--portable-qualification");
});

test.each(["bun-supervisor", "bun-tools", "bun-tauri"] as const)(
  "real tracked %s archive exposes all declared exports to an isolated consumer",
  async selected => {
    const { exportTrackedPackage, packageSourcePaths, PACKAGES } = await import("./publish-npm");
    const root = join(import.meta.dir, "../..");
    const git = async (...args: string[]) => {
      await using child = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([
        Bun.readableStreamToText(child.stdout),
        Bun.readableStreamToText(child.stderr),
        child.exited,
      ]);
      if (code !== 0) throw new Error(`Fixture source query failed: ${stderr}`);
      return stdout;
    };
    const revision = (await git("rev-parse", "HEAD")).trim();
    using directory = tempDir("portable-npm-real-consumer", {});
    {
      const source = join(String(directory), selected + "-source");
      const manifest = JSON.parse(await git("show", `${revision}:packages/${selected}/package.json`));
      const spec = PACKAGES.find(spec => spec.dir === selected)!;
      await exportTrackedPackage(
        root,
        revision,
        `packages/${selected}`,
        source,
        packageSourcePaths(root, revision, spec, manifest),
      );
      const archive = join(String(directory), selected + ".tgz");
      const pack = Bun.spawn([process.execPath, "pm", "pack", "--ignore-scripts", "--filename", archive], {
        cwd: source,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, status] = await Promise.all([
        Bun.readableStreamToText(pack.stdout),
        Bun.readableStreamToText(pack.stderr),
        pack.exited,
      ]);
      expect(status, stderr + stdout).toBe(0);
      const { proof, imported } = await consumePortableNpmArchive(
        await Bun.file(archive).bytes(),
        selected,
        join(String(directory), selected + "-consumer"),
      );
      expect(proof.exports.length).toBeGreaterThan(1);
      expect(imported.trim()).toBe("qualified source exports");
      await expect(verifyQualifiedPortableNpmArchive(proof, await Bun.file(archive).bytes())).resolves.toBeUndefined();
      // Publishing regenerates the archive: timestamps must not change its pinned bytes.
      await utimes(join(source, "package.json"), new Date(0), new Date(1_000_000));
      const repacked = join(String(directory), selected + "-repacked.tgz");
      await using repeat = Bun.spawn([process.execPath, "pm", "pack", "--ignore-scripts", "--filename", repacked], {
        cwd: source,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [repeatOut, repeatError, repeatStatus] = await Promise.all([
        Bun.readableStreamToText(repeat.stdout),
        Bun.readableStreamToText(repeat.stderr),
        repeat.exited,
      ]);
      expect(repeatStatus, repeatError + repeatOut).toBe(0);
      await expect(verifyQualifiedPortableNpmArchive(proof, await Bun.file(repacked).bytes())).resolves.toBeUndefined();
    }
  },
  60_000,
);

test("plugin source route is exact while mixed and all retain native-full plus plugin evidence", () => {
  expect(npmSourceQualificationRoute("bun-agent-plugin")).toBe("plugin-source");
  expect(portableNpmSelection("bun-agent-plugin")).toBeNull();
  for (const only of [undefined, "", "bun-tools,bun-agent-plugin", "bun-agent-plugin,bun-agent-plugin"]) {
    expect(npmSourceQualificationRoute(only)).toBe("native-full");
    expect(npmSelectionIncludesPlugin(only)).toBe(true);
  }
  for (const only of ["bun-tools", " bun-agent-plugin", "bun-agent-plugin-extra"])
    expect(npmSelectionIncludesPlugin(only)).toBe(false);
});

function pluginFixture() {
  const files = new Map<string, string | Uint8Array>([
    [
      "package/package.json",
      JSON.stringify({
        name: "@aphrody/bun-agent-plugin",
        version: "1.4.5",
        engines: { bun: ">=1.4.5" },
        exports: {
          ".": "./src/cli.ts",
          "./rewrite": "./src/hooks/rewrite.ts",
          "./decision": "./src/decision.ts",
          "./package.json": "./package.json",
        },
        bin: { "bun-agent-plugin": "./bin/bun-agent-plugin.ts" },
      }),
    ],
    ["package/src/cli.ts", "export const main = () => {};"],
    ["package/src/hooks/rewrite.ts", "export const rewrite = () => {};"],
    ["package/src/decision.ts", "export const decide = () => {};"],
    ["package/bin/bun-agent-plugin.ts", "console.log('controlled bin');"],
    ["package/plugins/codex/AGENTS.md", "# Controlled generated instructions"],
    ["package/README.md", "controlled README"],
    ["package/LICENSE.md", "controlled license"],
  ]);
  const archive = (members = files) =>
    new Bun.Archive(Object.fromEntries(members), { format: "tar", compress: "gzip" }).bytes();
  return { files, archive };
}

test("plugin archive checks exact generated, source, exports, bin and license bytes before extraction", async () => {
  const { files, archive } = pluginFixture();
  const actual = await inspectPluginNpmArchive(await archive(), files, "1.4.5");
  expect(actual.members.length).toBe(files.size);
  expect(actual.archive.name).toBe("@aphrody/bun-agent-plugin");
  for (const path of [
    "package/plugins/codex/AGENTS.md",
    "package/src/cli.ts",
    "package/LICENSE.md",
    "package/bin/bun-agent-plugin.ts",
  ]) {
    const changed = new Map(files);
    changed.set(path, "altered member");
    await expect(inspectPluginNpmArchive(await archive(changed), files, "1.4.5")).rejects.toThrow("member differs");
    changed.delete(path);
    await expect(inspectPluginNpmArchive(await archive(changed), files, "1.4.5")).rejects.toThrow("closure differs");
  }
  for (const path of ["package/private/secret.json", "package/src/lib.so", "package/src/.env"]) {
    const changed = new Map(files).set(path, "must not ship");
    await expect(inspectPluginNpmArchive(await archive(changed), changed, "1.4.5")).rejects.toThrow("source closure");
  }
  const foreign = new Map(files);
  const pkg = JSON.parse(String(files.get("package/package.json")));
  foreign.set("package/package.json", JSON.stringify({ ...pkg, dependencies: { foreign: "1.0.0" } }));
  await expect(inspectPluginNpmArchive(await archive(foreign), foreign, "1.4.5")).rejects.toThrow("dependency closure");
  foreign.set("package/package.json", JSON.stringify({ ...pkg, bin: { other: "./src/cli.ts" } }));
  await expect(inspectPluginNpmArchive(await archive(foreign), foreign, "1.4.5")).rejects.toThrow("exports, bin");
});

test("plugin proof is distinct, source-strict and requires every native MCP and owner gate", async () => {
  const { files, archive } = pluginFixture();
  const actual = await inspectPluginNpmArchive(await archive(), files, "1.4.5");
  const source = "a".repeat(40),
    hash = "b".repeat(64);
  const proof: PluginNpmProof = {
    schema: 1,
    kind: "bun-plugin-npm-source-qualification",
    source,
    selection: ["bun-agent-plugin"],
    runtime: {
      version: "1.4.5",
      revision: source,
      sourceUrl: "https://github.com/aphrody-labs/bun/releases/download/bun-v1.4.5/bun-linux-x64-full.zip",
      sha256: hash,
    },
    lockSHA256: hash,
    nativePayloadQualified: false,
    allPlatformsQualified: false,
    inputs: [{ path: ".claude/commands/source.md", sha256: hash }],
    members: actual.members,
    archive: actual.archive,
    logs: ["generate", "generate-check", "pack", "consumer", "doctor", "owner-tests", "mcp"].map(name => ({
      path: `${name}.log`,
      sha256: hash,
    })),
    mcp: { source, suiteSHA256: hash, passed: true, logSHA256: hash },
  };
  expect(() => validatePluginNpmProof(proof, source)).not.toThrow();
  const changed: unknown[] = [
    { ...proof, kind: "bun-portable-npm-source-qualification" },
    { ...proof, selection: ["bun-agent-plugin", "bun-tools"] },
    { ...proof, runtime: { ...proof.runtime, revision: "c".repeat(40) } },
    { ...proof, logs: proof.logs.slice(1) },
    { ...proof, mcp: { ...proof.mcp, passed: false } },
    { ...proof, mcp: { ...proof.mcp, logSHA256: "d".repeat(64) } },
    { ...proof, allPlatformsQualified: true },
    { ...proof, nativePayloadQualified: true },
    { ...proof, members: [...proof.members, proof.members[0]] },
    { ...proof, inputs: [{ path: "../foreign", sha256: hash }] },
    { ...proof, archive: { ...proof.archive, version: "1.4.6" } },
  ];
  for (const value of changed) expect(() => validatePluginNpmProof(value as PluginNpmProof, source)).toThrow();
  await expect(
    verifyPluginNpmPublication("unused", { source, directory: "bun-tools", archive: "unused" }),
  ).rejects.toThrow("another package");
});
