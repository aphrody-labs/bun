// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  compatSeries,
  foreignTables,
  inline,
  lockDowngrades,
  lockVersions,
  merge,
  migrateTables,
  nestedWorkspaces,
  rebase,
  rewriteMember,
  stripWorkspace,
} from "./flatten-workspace";

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

test("a member without lints opts out of the root lints and ends with a newline", () => {
  expect(rewriteMember('[package]\nname = "a"\n\n[dependencies]\nregex = "1"\n', ws, "/ws", "/ws/a")).toBe(
    '[package]\nname = "a"\n\n[dependencies]\nregex = "1"\n\n[lints]\n',
  );
});

describe("root-only tables of the nested manifest", () => {
  const root = Bun.TOML.parse(`
[profile.release]
lto = "off"
[profile.cosmic]
inherits = "release"
strip = true
[patch.crates-io]
swc_common = { path = "packages/mdx/swc_common" }
`) as Record<string, unknown>;

  test("are listed unless the root declares them identically, conflicts flagged", () => {
    const nested = Bun.TOML.parse(`
[package]
name = "x"
[profile.release]
lto = true
[profile.cosmic]
inherits = "release"
strip = true
[profile.small]
opt-level = "z"
[patch.crates-io]
swc_common = { path = "swc_common" }
pyo3 = { git = "https://github.com/aphrody-labs/pyo3", rev = "451d99f" }
[replace]
"foo:0.1.0" = { path = "foo" }
`) as Record<string, unknown>;
    expect(foreignTables(nested, root)).toEqual([
      { key: ["profile", "release"], value: { lto: true }, conflict: true },
      { key: ["profile", "small"], value: { "opt-level": "z" }, conflict: false },
      { key: ["patch", "crates-io", "swc_common"], value: { path: "swc_common" }, conflict: true },
      {
        key: ["patch", "crates-io", "pyo3"],
        value: { git: "https://github.com/aphrody-labs/pyo3", rev: "451d99f" },
        conflict: false,
      },
      { key: ["replace", "foo:0.1.0"], value: { path: "foo" }, conflict: false },
    ]);
    expect(foreignTables(Bun.TOML.parse('[package]\nname = "x"\n') as Record<string, unknown>, root)).toEqual([]);
  });

  test("migrate into the root manifest with rebased paths", () => {
    const rootText =
      '[workspace]\nmembers = []\n\n[patch.crates-io]\nswc_common = { path = "packages/mdx/swc_common" }\n';
    const migrated = migrateTables(
      rootText,
      [
        { key: ["profile", "small"], value: { "opt-level": "z", strip: true }, conflict: false },
        {
          key: ["patch", "crates-io", "pyo3"],
          value: { git: "https://github.com/aphrody-labs/pyo3" },
          conflict: false,
        },
        { key: ["patch", "https://github.com/aphrody-labs/aphrody", "rag"], value: { path: "rag" }, conflict: false },
        { key: ["replace", "foo:0.1.0"], value: { path: "vendor/foo" }, conflict: false },
      ],
      "/repo/packages/x",
      "/repo",
    );
    expect(migrated).toBe(
      [
        "[workspace]",
        "members = []",
        "",
        "[patch.crates-io]",
        'swc_common = { path = "packages/mdx/swc_common" }',
        'pyo3 = { git = "https://github.com/aphrody-labs/pyo3" }',
        "",
        "[profile.small]",
        'opt-level = "z"',
        "strip = true",
        "",
        '[patch."https://github.com/aphrody-labs/aphrody"]',
        'rag = { path = "packages/x/rag" }',
        "",
        "[replace]",
        '"foo:0.1.0" = { path = "packages/x/vendor/foo" }',
        "",
      ].join("\n"),
    );
    expect(Bun.TOML.parse(migrated)).toBeObject();
    expect(() =>
      migrateTables(rootText, [{ key: ["profile", "release"], value: {}, conflict: true }], "/repo/x", "/repo"),
    ).toThrow("profile.release differs from the root declaration");
  });
});

describe("lockfile snapshot", () => {
  const lock = (...packages: [string, string][]) =>
    `version = 4\n${packages.map(([name, version]) => `\n[[package]]\nname = "${name}"\nversion = "${version}"\n`).join("")}`;

  test("semver-compatible series", () => {
    expect(["1.14.0", "0.13.2", "0.0.4", "2.0.0-rc.1"].map(compatSeries)).toEqual(["1", "0.13", "0.0.4", "2"]);
  });

  test("reports a version that went back within its series, from any lockfile before the fold", () => {
    const root = lock(["jobserver", "0.1.34"], ["syn", "2.0.100"]);
    const nested = lock(["jobserver", "0.1.35"], ["synstructure", "0.14.0"], ["calloop", "0.14.5"]);
    const after = lock(["jobserver", "0.1.34"], ["syn", "2.0.101"], ["synstructure", "0.13.2"], ["calloop", "0.14.3"]);
    expect(lockDowngrades([root, nested], after)).toEqual([
      { name: "calloop", from: "0.14.5", to: "0.14.3" },
      { name: "jobserver", from: "0.1.35", to: "0.1.34" },
    ]);
    expect(lockDowngrades([root, nested], lock(["jobserver", "0.1.35"], ["calloop", "0.14.5"]))).toEqual([]);
  });

  test("keeps the highest version of each series", () => {
    expect(lockVersions(lock(["windows-sys", "0.52.0"], ["windows-sys", "0.61.2"], ["windows-sys", "0.61.1"]))).toEqual(
      new Map([
        ["windows-sys@0.52", "0.52.0"],
        ["windows-sys@0.61", "0.61.2"],
      ]),
    );
  });
});

test("--check lists committed manifests with a [workspace] outside the root and its exclude", () => {
  const files: Record<string, string> = {
    "Cargo.toml": "[workspace]\nmembers = []\n",
    "crates/a/Cargo.toml": '[package]\nname = "a"\n',
    "bench/interop/Cargo.toml": '[package]\nname = "b"\n\n[workspace]\n',
    "packages/x/Cargo.toml": '[workspace]\nmembers = ["y"]\n[workspace.package]\nversion = "1"\n',
    "scripts/verify-baseline-static/Cargo.toml": '[package]\nname = "v"\n[workspace]\n',
    "vendor/lolhtml/Cargo.toml": "[workspace]\n",
    "test/broken/Cargo.toml": "[workspace\nnot toml",
    "test/fixture/Cargo.toml": "[workspace.dependencies]\n",
  };
  expect(
    nestedWorkspaces(Object.keys(files), ["scripts/verify-baseline-static", "vendor/"], path => files[path]!),
  ).toEqual(["bench/interop/Cargo.toml", "packages/x/Cargo.toml", "test/fixture/Cargo.toml"]);
});
