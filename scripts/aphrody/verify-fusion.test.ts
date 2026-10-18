import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import factory from "../../tools/config/fusion-factory.json";
import verification from "./fusion-verification.json";
import {
  assertVps,
  diagnosticPaths,
  factoryCommand,
  gateFlags,
  fileHash,
  mayRetry,
  orderSteps,
  research,
  resourceBlockReason,
  selectSteps,
  testsQualified,
  type FusionConfig,
  type FusionStep,
  type StepReceipt,
} from "./verify-fusion.ts";
import type { FactoryHostProfile } from "./build-host.ts";

const step = (id: string, requires: string[] = [], scope = [id], allOnly = false): FusionStep => ({
  id,
  requires,
  scope,
  allOnly,
  command: ["bun", "bd", "--version"],
  kind: "heavy",
  required: true,
});
const config: FusionConfig = {
  schema: 1,
  vpsHostnames: ["vps-203bea89"],
  factory: {
    resource: "/owner/factory.ts",
    cargoWrapper: "/owner/cargo-serial.ts",
  },
  research: ["https://bun.sh/docs"],
  pipeline: ".buildkite/ci.ts",
  steps: [],
};

describe("recursive fusion verification", () => {
  test("declared build owners exist in this checkout and share the factory cache", () => {
    const root = resolve(import.meta.dir, "../..");
    for (const path of Object.values(verification.factory)) expect(existsSync(resolve(root, path))).toBe(true);
    expect(verification.execution.cargoTargetDir).toBe(`${factory.cacheRoot}/cargo`);
  });
  test("qualification flags enable fixtures without changing tool or resource authority", () => {
    expect(gateFlags({ ...step("apt-fixture"), env: { BUN_SYSTEM_DEB_TEST_ROOT: "1" } })).toEqual({
      BUN_SYSTEM_DEB_TEST_ROOT: "1",
    });
    for (const name of ["PATH", "APHRODY_CARGO_JOBS", "BUN_FEATURE_FLAG_EXPERIMENTAL_MCP_NATIVE_TOOLS"])
      expect(() => orderSteps([{ ...step("invalid"), env: { [name]: "1" } }])).toThrow(
        "Unsupported qualification flag",
      );
    expect(() => gateFlags({ ...step("invalid"), env: { BUN_LIVE_WEBSITE_TEST: "yes" } })).toThrow();
  });
  test("gate admission observes current disk and memory without inventing a RAM quota", () => {
    const observed = { filesystemType: 0xef53n, availableDiskMiB: 8192, availableMemoryMiB: 2048 };
    expect(resourceBlockReason(observed)).toBeUndefined();
    expect(resourceBlockReason({ ...observed, availableDiskMiB: 8191 })).toContain("8192 MiB");
    expect(resourceBlockReason({ ...observed, availableMemoryMiB: 2047 })).toContain("2048 MiB");
    expect(resourceBlockReason({ ...observed, filesystemType: 0x01021994n })).toContain("persistent");
    expect(resourceBlockReason({ ...observed, filesystemType: 0x858458f6n })).toContain("persistent");
    expect(resourceBlockReason({ ...observed, availableMemoryMiB: NaN })).toContain("MemAvailable");
  });
  test("orders prerequisites once and rejects cycles or missing dependencies", () => {
    expect(orderSteps([step("test", ["build"]), step("build")]).map(entry => entry.id)).toEqual(["build", "test"]);
    expect(() => orderSteps([step("a", ["b"]), step("b", ["a"])])).toThrow("cycle");
    expect(() => orderSteps([step("a", ["missing"])])).toThrow("Missing dependency");
  });
  test("rejects duplicate or unsafe identities before writing output", () => {
    expect(() => orderSteps([step("a"), step("a")])).toThrow("Duplicate");
    expect(() => orderSteps([step("../escape")])).toThrow("Unsafe");
  });
  test("changed mode selects recursive dependents and prerequisites but omits full suites", () => {
    const steps = [
      step("check", [], ["src/browser"]),
      step("build", ["check"], ["src/runtime"]),
      step("test", ["build"], ["test/js/web"]),
      step("matrix", ["test"], ["."], true),
    ];
    expect(selectSteps(steps, "changed", ["src/browser/crates/dom/lib.rs"]).map(entry => entry.id)).toEqual([
      "check",
      "build",
      "test",
    ]);
    expect(selectSteps(steps, "all", []).map(entry => entry.id)).toEqual(["check", "build", "test", "matrix"]);
    expect(selectSteps(steps, "changed", ["src/browser-old/file.rs"])).toEqual([]);
  });
  test("unchanged failed inputs cannot enter an automatic retry loop", () => {
    const prior: StepReceipt = {
      id: "check",
      inputHash: "abc",
      state: "failed",
      exitCode: 1,
      log: "/tmp/check.log",
      diagnosticPaths: [],
      startedAt: "",
      endedAt: "",
    };
    expect(mayRetry(prior, "abc")).toBe(false);
    expect(mayRetry(prior, "source-changed")).toBe(true);
    expect(mayRetry(undefined, "abc")).toBe(true);
  });
  test("collects source diagnostics without executing snippets", () => {
    expect(
      diagnosticPaths(
        "error\n --> src/css/browser.rs:41:3\n scripts/aphrody/verify-fusion.ts:11\n --> src/css/browser.rs:99",
      ),
    ).toEqual(["scripts/aphrody/verify-fusion.ts", "src/css/browser.rs"]);
  });
  test("VPS assertion rejects the Windows owner workstation before inspecting factory paths", () => {
    expect(() => assertVps(config, { host: "vps" } as FactoryHostProfile, "win32", "vps-203bea89", ".")).toThrow(
      "SSH VPS",
    );
    expect(() => assertVps(config, { host: "vps" } as FactoryHostProfile, "linux", "other-host", ".")).toThrow(
      "SSH VPS",
    );
  });
  test("Cargo stays behind resource owner and serialized wrapper", () => {
    const command = factoryCommand(config, {
      ...step("cargo"),
      command: ["cargo", "+nightly", "check", "--locked"],
    });
    expect(command).toEqual([
      process.execPath,
      config.factory.resource,
      "run",
      "--",
      process.execPath,
      config.factory.cargoWrapper,
      "+nightly",
      "check",
      "--locked",
    ]);
  });
  test("native runtime suites use factory owner's configured resource lease", () => {
    const command = factoryCommand(config, step("runtime"));
    expect(command.slice(1, 4)).toEqual([config.factory.resource, "run", "--"]);
    expect(command.slice(-2)).toEqual(["bd", "--version"]);
  });
  test("official-source HTTP and network failures remain failed evidence", async () => {
    const unavailable = (() => Promise.resolve(new Response("missing", { status: 404 }))) as typeof fetch;
    const receipts = await research(["https://bun.sh/blog/bun-v1.4.3"], unavailable);
    expect(receipts[0]!.status).toBe(404);
    expect(receipts[0]!.sha256).toBeNull();
    const offline = (() => Promise.reject(new Error("offline"))) as typeof fetch;
    const errors = await research(["https://bun.sh"], offline);
    expect(errors[0]!.status).toBe(0);
    expect(errors[0]!.error).toContain("offline");
    await expect(research(["https://example.com/code"], unavailable)).rejects.toThrow("official");
  });
  test("log checksums stream beyond the diagnostic tail size", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fusion-verification-"));
    try {
      const path = join(directory, "full.log");
      const contents = "diagnostic\n".repeat(20_000);
      await Bun.write(path, contents);
      expect(await fileHash(path)).toBe(new Bun.CryptoHasher("sha256").update(contents).digest("hex"));
    } finally {
      const file = Bun.file(join(directory, "full.log"));
      if (await file.exists()) await file.delete();
      rmdirSync(directory);
    }
  });
  test("required native test filters cannot succeed with zero tests or skipped tests", () => {
    const required = { ...step("css"), minimumPasses: 1, maximumSkips: 0 };
    expect(testsQualified(required, " 0 pass\n 1 skip\n")).toBe(false);
    expect(testsQualified(required, "no tests found")).toBe(false);
    expect(testsQualified(required, " 2 pass\n 0 fail\n")).toBe(true);
  });
});
