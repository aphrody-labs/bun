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
    expect(await Bun.file(output).text()).toBe(`kind=${expected}\n`);
  }
  expect(steps.find(step => step.id === "portable")?.if).toBe(
    "inputs.dry-run != true && steps.qualification.outputs.kind == 'portable-source'",
  );
  expect(steps.find(step => step.run?.includes("download-verify"))?.if).toBe(
    "inputs.dry-run != true && steps.qualification.outputs.kind != 'portable-source'",
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
