import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { bunEnv, bunExe, tempDir } from "harness";
import { cargoNapiArtifact, napiBuildPlan, platformOf } from "../../scripts/aphrody/build-napi.ts";

const addon = resolve(import.meta.dir, "../../packages/bun-oxc/crates/napi/Cargo.toml");
const artifact = (filename: string, overrides: Record<string, unknown> = {}) => ({
  reason: "compiler-artifact",
  package_id: "path+file:///workspace/addon#bun-plugin-oxc-napi@1.4.4",
  manifest_path: addon,
  target: { name: "custom_addon_library", kind: ["cdylib"], crate_types: ["cdylib"] },
  filenames: [filename],
  fresh: false,
  ...overrides,
});
const lines = (...messages: unknown[]) => messages.map(message => JSON.stringify(message)).join("\r\n") + "\r\n";

test.each([
  ["x86_64-pc-windows-msvc", "custom-target/custom-native.dll", "win32-x64-msvc"],
  ["aarch64-apple-darwin", "arbitrary-cache/libreal-name.dylib", "darwin-arm64"],
  ["aarch64-unknown-linux-musl", "other-output/libnative.so", "linux-arm64-musl"],
])("Cargo owns the actual %s artifact path and library name", (triple, filename, key) => {
  const expected = resolve(filename);
  const output = lines(
    { reason: "compiler-message", message: { rendered: "fixture diagnostic" } },
    artifact(resolve("wrong-addon", filename), { manifest_path: resolve("other-addon/Cargo.toml") }),
    artifact(resolve("dependency/libdep.rlib"), { target: { name: "dependency", crate_types: ["rlib"] } }),
    artifact(expected, { fresh: true, filenames: [expected, expected + ".lib", expected + ".pdb"] }),
    { reason: "build-finished", success: true },
  );
  expect(cargoNapiArtifact(output, addon, triple)).toBe(expected);
  expect(platformOf(triple).key).toBe(key);
});

test("Cargo artifact selection rejects missing, ambiguous and malformed output", () => {
  const first = resolve("one/native.dll"),
    second = resolve("two/native.dll");
  expect(() =>
    cargoNapiArtifact(lines({ reason: "build-finished", success: true }), addon, "x86_64-pc-windows-msvc"),
  ).toThrow("Cargo reported 0 addon cdylibs");
  expect(() => cargoNapiArtifact(lines(artifact(first), artifact(second)), addon, "x86_64-pc-windows-msvc")).toThrow(
    "Cargo reported 2 addon cdylibs",
  );
  expect(() => cargoNapiArtifact("not cargo JSON\n", addon, "x86_64-pc-windows-msvc")).toThrow(
    "Cargo emitted non-JSON stdout",
  );
  expect(() => cargoNapiArtifact(lines(artifact(first, { filenames: null })), addon, "x86_64-pc-windows-msvc")).toThrow(
    "Cargo cdylib artifact has no filenames",
  );
  expect(cargoNapiArtifact(lines(artifact(first), artifact(first)), addon, "x86_64-pc-windows-msvc")).toBe(first);
});

test("addon builds select the root workspace through the native serialized wrapper", () => {
  const root = resolve(import.meta.dir, "../..");
  const windows = napiBuildPlan(
    join(root, "packages/bun-oxc"),
    "bun-plugin-oxc-napi",
    {
      target: "aarch64-pc-windows-msvc",
    },
    "win32",
    "fixture-bun",
  );
  expect(windows).toEqual({
    cwd: root,
    manifest: addon,
    argv: [
      "fixture-bun",
      join(root, "scripts/build/rust/cargo-serial.ts"),
      "--msvc",
      "build",
      "--manifest-path",
      join(root, "Cargo.toml"),
      "--locked",
      "-p",
      "bun-plugin-oxc-napi",
      "--lib",
      "--jobs",
      "1",
      "--message-format=json-render-diagnostics",
      "--config",
      'profile.release.panic="unwind"',
      "--release",
      "--target",
      "aarch64-pc-windows-msvc",
    ],
  });
  const debug = napiBuildPlan(
    join(root, "packages/bun-n2b"),
    "bun-plugin-n2b-napi",
    { debug: true },
    "linux",
    "fixture-bun",
  );
  expect(debug.argv).not.toContain("--msvc");
  expect(debug.argv).not.toContain("--release");
  expect(debug.argv).not.toContain("--target");
  expect(debug.argv).toContain('profile.dev.panic="unwind"');
  expect(debug.manifest).toBe(join(root, "packages/bun-n2b/crates/napi/Cargo.toml"));
});

test("native publication plans use the root-workspace helper and preserve artifact contracts", async () => {
  const workflow = Bun.YAML.parse(
    await Bun.file(new URL("../../.github/workflows/aphrody-publish-native.yml", import.meta.url)).text(),
  ) as any;
  const run = workflow.jobs.plan.steps.find((step: any) => step.run?.includes("native-factory-plan.json"))
    .run as string;
  const script = /bun -e '([\s\S]*)'\s*$/.exec(run)?.[1];
  expect(script).toBeString();
  const fixture = {
    id: "oxc",
    dir: "packages/bun-oxc",
    crate: "bun-plugin-oxc-napi",
    key: "linux-x64-gnu",
    triple: "x86_64-unknown-linux-gnu",
    file: "bun-plugin-oxc.linux-x64-gnu.node",
  };
  using directory = tempDir("native-publication-plan", {
    "scripts/aphrody/publish-native.ts": `export const matrix = () => (${JSON.stringify({ include: [fixture] })});`,
  });
  await using child = Bun.spawn([bunExe(), "-e", script!], {
    cwd: String(directory),
    env: { ...bunEnv, ONLY: "oxc", PLATFORMS: "linux-x64-gnu", GITHUB_SHA: "a".repeat(40) },
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect({ stdout, stderr, code }).toEqual({ stdout: "", stderr: "", code: 0 });
  const plan = await Bun.file(join(String(directory), "native-factory-plan.json")).json();
  const output = "/home/ubuntu/builds/bun-os-factory/artifacts/native/oxc/linux-x64-gnu";
  expect(plan.steps).toEqual([
    {
      id: "oxc",
      key: fixture.key,
      triple: fixture.triple,
      asset: fixture.file,
      directory: "/home/ubuntu/builds/bun-browser-fusion",
      command: [
        "bun",
        "/home/ubuntu/src/aphrody/packages/infra/workspace/src/build-factory-cleanup.ts",
        "/home/ubuntu/builds/bun-browser-fusion/tools/config/fusion-factory.json",
        "env",
        `CARGO_TARGET_DIR=${output}`,
        "bun",
        "scripts/aphrody/build-napi.ts",
        fixture.dir,
        "--target",
        fixture.triple,
        "--out",
        output,
      ],
    },
  ]);
  expect(plan.maxJobs).toBe(2);
  expect(plan.parallelHeavyJobs).toBe(1);
  expect(
    workflow.jobs.publish.steps.some(
      (step: any) => step.name === "Verify eight native full release receipts before publication",
    ),
  ).toBe(true);
});
