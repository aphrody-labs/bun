import { expect, test } from "bun:test";
import { isAphrodyRuntime } from "../../../packages/bun-agent-plugin/src/hooks/common";

test("fork canary and debug provenance require a matching release version and native commit", () => {
  const commit = "2ae8fc65f" + "0".repeat(31);
  const source = "https://github.com/aphrody-labs/bun/releases/download/bun-v1.4.4/bun-windows-x64-full.zip";
  for (const version of [
    "v1.4.4-canary.1 (2ae8fc65f)",
    "1.4.4-canary.1+2ae8fc65f",
    "1.4.4-debug+2ae8fc65f",
    "1.4.4-canary.1-debug+2ae8fc65f",
  ])
    expect(isAphrodyRuntime(version, source, commit)).toBe(true);
  for (const [version, url, nativeCommit] of [
    ["1.4.4-canary.1+2ae8fc65f", source.replace("aphrody-labs", "oven-sh"), commit],
    ["1.4.4-canary.1+2ae8fc65f", source.replace("bun-v1.4.4", "bun-v1.4.3"), commit],
    ["1.4.4-canary.1+111111111", source, commit],
    ["1.4.4-canary.1", source, commit],
    ["1.4.4-nightly+2ae8fc65f", source, commit],
  ])
    expect(isAphrodyRuntime(version!, url, nativeCommit)).toBe(false);
});
