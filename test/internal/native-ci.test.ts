// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { gates, main, qualification, validateIdentity } from "../../scripts/aphrody/native-ci.ts";

test("native CI rejects symbolic revisions and unsafe job identifiers", () => {
  expect(() => validateIdentity("main", "job")).toThrow();
  expect(() => validateIdentity("a".repeat(40), "../../secret")).toThrow();
  expect(() => validateIdentity("a".repeat(40), "native-1")).not.toThrow();
});
test("missing, failed and duplicate qualifications remain closed", () => {
  const results = gates.map((gate) => ({ id: gate.id, exitCode: 0 }));
  expect(qualification(results)).toBe(true);
  expect(qualification(results.slice(1))).toBe(false);
  expect(qualification([...results, results[0]!])).toBe(false);
  expect(
    qualification(results.map((result, index) => ({ ...result, exitCode: index ? 0 : 1 }))),
  ).toBe(false);
});
test("native CI only accepts its explicit owner operations", async () => {
  await expect(main(["publish", "--revision", "a".repeat(40), "--id", "job"])).rejects.toThrow();
  await expect(main(["plan", "--command", "rm"])).rejects.toThrow();
  expect(gates.some((gate) => gate.command.includes("-D"))).toBe(true);
  expect(
    gates
      .filter((gate) => gate.command.includes("bd"))
      .every((gate) => gate.command.includes("-j1")),
  ).toBe(true);
});
