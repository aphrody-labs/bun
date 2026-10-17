// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { inline, merge, rebase, rewriteMember, stripWorkspace } from "./flatten-workspace";

const ws = Bun.TOML.parse(`
[workspace]
members = ["a"]
[workspace.package]
version = "0.5.28"
edition = "2021"
[workspace.dependencies]
local = { path = "local", version = "0.5.28" }
serde = { version = "1.0.228", features = ["derive"] }
regex = "1.12.3"
[workspace.lints.rust]
unsafe_op_in_unsafe_fn = "deny"
`) as Record<string, unknown>;

test("member manifests keep resolved fields, specs and lints inline", () => {
  const member = [
    "[package]",
    'name = "a"',
    "version.workspace = true",
    "edition = { workspace = true }",
    "",
    "[dependencies]",
    "local = { workspace = true }",
    'serde = { workspace = true, features = ["std"], optional = true }',
    "regex.workspace = true",
    "",
    "[lints]",
    "workspace = true",
  ].join("\n");
  expect(rewriteMember(member, ws, "/ws", "/ws/a")).toBe(
    [
      "[package]",
      'name = "a"',
      'version = "0.5.28"',
      'edition = "2021"',
      "",
      "[dependencies]",
      'local = { path = "../local", version = "0.5.28" }',
      'serde = { version = "1.0.228", features = ["derive", "std"], optional = true }',
      'regex = { version = "1.12.3" }',
      "",
      "[lints.rust]",
      'unsafe_op_in_unsafe_fn = "deny"',
      "",
    ].join("\n"),
  );
});

test("helpers serialize, rebase and merge specs", () => {
  expect(inline({ a: [1, "b"], "c.d": true })).toBe('{ a = [1, "b"], "c.d" = true }');
  expect(rebase({ path: "x" }, "/ws", "/ws/a/b")).toEqual({ path: "../../x" });
  expect(merge({ version: "1", features: ["a"] }, { workspace: true, features: ["a", "b"] })).toEqual({
    version: "1",
    features: ["a", "b"],
  });
});

test("a nested root without a package is removed, one with a package keeps only it", () => {
  expect(stripWorkspace("[workspace]\nmembers = []\n")).toBeNull();
  expect(stripWorkspace('[package]\nname = "x"\n\n[workspace]\nmembers = []\n[profile.release]\nlto = true\n')).toBe(
    '[package]\nname = "x"\n',
  );
});
