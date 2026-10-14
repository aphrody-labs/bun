import { expect, test } from "bun:test";
import { join } from "node:path";
import { loadArtifactAsync } from "../src/artifact";
import { assertStagedRuntimeIdentity, stageRuntimeSDK } from "../scripts/stage";

test("staging rejects relative owner paths before a module or compiler can be opened", async () => {
  for (const input of [{ sdkRoot: "." }, { library: "module.dll" }, { artifactRoot: "store" }])
    await expect(stageRuntimeSDK(input)).rejects.toThrow("absolute source, library and artifact paths");
});

test.skipIf(!process.env.BUV_RUNTIME_SDK_GATE_DIR)(
  "staging pins bind the real native ABI, source, target and capabilities",
  async () => {
    const directory = process.env.BUV_RUNTIME_SDK_GATE_DIR!;
    using runtime = await loadArtifactAsync(directory);
    const manifest = await Bun.file(join(directory, "manifest.json")).json();
    const input = {
      native: runtime.buildInfo(),
      capabilities: runtime.capabilities(),
      source: manifest.sources.bun.rev as string,
      target: manifest.target as string,
      abi: manifest.abi as string,
      version: manifest.version as string,
    };
    assertStagedRuntimeIdentity(input);
    for (const change of [
      { source: "a".repeat(40) },
      { source: "main" },
      { target: "foreign-target" },
      { abi: "1.5" },
      { version: "0.0.0" },
      { capabilities: input.capabilities.filter(capability => capability !== "process.wait") },
      { native: { ...input.native, panic_recovery: false } },
    ])
      expect(() => assertStagedRuntimeIdentity({ ...input, ...change })).toThrow("identity/capabilities differ");
  },
);
