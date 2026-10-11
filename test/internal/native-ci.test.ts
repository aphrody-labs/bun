// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  gateEnvironment,
  gates,
  main,
  qualification,
  validateIdentity,
} from "../../scripts/aphrody/native-ci.ts";

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

test("Clippy selects each source owner's configuration without changing strict warnings", async () => {
  const checkout = resolve(import.meta.dir, "../..");
  const inherited = { CLIPPY_CONF_DIR: "/foreign/config", CARGO_BUILD_JOBS: "1" };
  const directories = {
    "rust-google-clippy": "packages/bun-google/aphrody",
    "rust-web-clippy": "packages/bun-aphrody-web",
    "rust-install-clippy": ".",
  };
  for (const [id, directory] of Object.entries(directories)) {
    const gate = gates.find((candidate) => candidate.id === id)!;
    const environment = gateEnvironment(gate, checkout, inherited);
    expect(environment.CLIPPY_CONF_DIR).toBe(resolve(checkout, directory));
    expect(environment.CARGO_BUILD_JOBS).toBe("1");
    expect(gate.command.slice(-3)).toEqual(["--", "-D", "warnings"]);
    const config = Bun.TOML.parse(
      await Bun.file(resolve(checkout, directory, "clippy.toml")).text(),
    );
    if (directory === ".") {
      expect(config["disallowed-methods"]).toContainEqual({
        path: "std::env::var",
        reason: "use bun_core::env_var",
      });
    } else {
      expect(config).toEqual({});
    }
  }
  expect(inherited.CLIPPY_CONF_DIR).toBe("/foreign/config");
  expect(gates.filter((gate) => gate.env).map((gate) => gate.id)).toEqual([
    "rust-google-clippy",
    "rust-install-clippy",
    "rust-web-clippy",
  ]);
  expect(gateEnvironment(gates[0]!, checkout, inherited)).toEqual(inherited);
});
