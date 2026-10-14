import { expect, test } from "bun:test";
import { setupInstallEnvironment } from "../../scripts/ci-install-environment.ts";
import { TestRegistry } from "../packages/registry/test-registry.ts";
import { join } from "node:path";
import { bunEnv, tempDir } from "harness";

test("fixture environments ignore personal config without overriding store opt-ins", async () => {
  expect(bunEnv.XDG_CONFIG_HOME).toBe(join(import.meta.dir, "..", "config", "bunfig", "fixtures"));
  expect(await Bun.file(join(bunEnv.XDG_CONFIG_HOME!, ".bunfig.toml")).exists()).toBe(false);
  expect(bunEnv.BUN_INSTALL_GLOBAL_STORE).toBe(process.env.BUN_INSTALL_GLOBAL_STORE);
});

test("dependency setup cannot link into the cache deleted after its subprocess", () => {
  const environment = { BUN_INSTALL_GLOBAL_STORE: "1", KEEP: "fixture" };
  expect(setupInstallEnvironment(environment)).toEqual({
    PUPPETEER_SKIP_DOWNLOAD: "1",
    BUN_INSTALL_GLOBAL_STORE: "0",
    KEEP: "fixture",
  });
  expect(environment).toEqual({ BUN_INSTALL_GLOBAL_STORE: "1", KEEP: "fixture" });
});

test("persistent CI setup caches retain store opt-ins and caller opt-outs", () => {
  expect(setupInstallEnvironment({}, "persistent-cache")).toEqual({
    PUPPETEER_SKIP_DOWNLOAD: "1",
    BUN_INSTALL_CACHE_DIR: "persistent-cache",
  });
  for (const globalStore of ["0", "1"]) {
    expect(setupInstallEnvironment({ BUN_INSTALL_GLOBAL_STORE: globalStore }, "persistent-cache")).toEqual({
      PUPPETEER_SKIP_DOWNLOAD: "1",
      BUN_INSTALL_CACHE_DIR: "persistent-cache",
      BUN_INSTALL_GLOBAL_STORE: globalStore,
    });
  }
});

test("install fixture configs pin store locality and preserve explicit opt-ins", async () => {
  using registry = new TestRegistry();
  using dir = tempDir("global-store-bunfig", {});
  for (const [options, expected] of [
    [{}, false],
    [{ globalStore: false }, false],
    [{ globalStore: true }, true],
  ] as const) {
    await registry.writeBunfig(String(dir), { npm: true, ...options });
    const config = Bun.TOML.parse(await Bun.file(join(String(dir), "bunfig.toml")).text()) as {
      install: { globalStore: boolean; linker?: string };
    };
    expect(config.install.globalStore).toBe(expected);
    expect(config.install.linker).toBeUndefined();
  }
  await registry.writeBunfig(String(dir), { npm: true, linker: "isolated", globalStore: true });
  const config = Bun.TOML.parse(await Bun.file(join(String(dir), "bunfig.toml")).text()) as {
    install: { globalStore: boolean; linker: string };
  };
  expect(config.install).toMatchObject({ linker: "isolated", globalStore: true });
});
