import { describe, expect, it } from "bun:test";
import { AphrodyBunRuntimeKernel } from "../index.ts";

describe("AphrodyBunRuntimeKernel", () => {
  it("initializes with secure hermetic defaults", () => {
    const kernel = AphrodyBunRuntimeKernel.getInstance();
    const config = kernel.getConfig();
    expect(config.hermeticMode).toBe(true);
    expect(config.telemetryEnabled).toBe(false);
    expect(config.agentWorkspace).toBe("/home/aphro/.gemini");
  });

  it("registers and retrieves native FFI bridge descriptors", () => {
    const kernel = AphrodyBunRuntimeKernel.getInstance();
    kernel.registerFFIBridge("obscura_cdp", {
      libraryPath: "/home/aphro/.gemini/packages/obscura/target/release/libobscura.so",
      symbols: ["obscura_launch", "obscura_cdp_send"],
      loaded: false,
    });

    const bridge = kernel.getFFIBridge("obscura_cdp");
    expect(bridge).toBeDefined();
    expect(bridge?.symbols).toContain("obscura_launch");
  });

  it("provides comprehensive runtime diagnostics", () => {
    const kernel = AphrodyBunRuntimeKernel.getInstance();
    const diag = kernel.getDiagnostics();
    expect(diag.runtime).toBe("Aphrody Bun Fork");
  });
});
