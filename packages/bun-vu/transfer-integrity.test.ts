// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dir;
const sourceRevision = "6ea52f1aada7269d81470dd9d93144555610868e";
const sourceFiles: Record<string, string> = {
  NOTICE: "366c865b0b0e95cb6489ef10a5793934d25945c7eccb4852421e5ac1e64023cd",
  "crates/vu/Cargo.toml": "a1235316a917e2f39609725a5ad1635346559226a54852bbb4e22448cb134d67",
  "crates/vu/build.rs": "26bbcbadb8788cd03c1c80a43c96b288ad3c6809e72ff3d153ea056f9f5078bb",
  "crates/vu/src/main.rs": "08aaee60d7683b7c667ef0f9b71b7f9a0157febf77129a265da0abd4ecdc297e",
  "crates/vu-runtime/Cargo.toml": "37904559543f9bc11e4c2fa00f420c42e047778efa9e9c8ab175f6d2c789c1e4",
  "crates/vu-runtime/build.rs": "ca4a4a4bdcb661fb1a43d6f4cf752f6246da932981eb450a045d50334dd0837d",
  "crates/vu-runtime/py/compile.py": "ed4799fed84ae2a68414d2000bb2019e056fbaf12b86aedb6f1a68863d830a45",
  "crates/vu-runtime/py/hf.py": "14433da3c65765d552c46ec26004ada0b0dee44c6bc55d162a5055ed8cf75c15",
  "crates/vu-runtime/src/commands.rs": "23acc280c86d78a8e1c491dec39296bee7c6cfa17185a0ac6d15cfbb9b104f40",
  "crates/vu-runtime/src/launcher.rs": "348e604fedc7de1eabfbdebf856cc0827ef550033dcb584d836eff82227a0b79",
  "crates/vu-runtime/src/lib.rs": "d5e1d6971908208595d8d1f34fdd3ae0dfa6a1a67a332d9fc05313ddbeabc52b",
};
const cargoLockSha256 = "345d0e466450b4b63ffa82c980dd7da05816ed5e51d52d17d84fd0b6e7d1f871";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}

test("vu runtime code and lockfile match the immutable source revision", () => {
  const provenance = JSON.parse(readFileSync(join(root, "provenance.json"), "utf8"));
  expect(provenance.source.revision).toBe(sourceRevision);
  expect(provenance.source.sourceFiles).toBeDefined();

  for (const [path, digest] of Object.entries(sourceFiles)) {
    expect(provenance.source.sourceFiles[path]).toBe(digest);
    expect(sha256(path)).toBe(digest);
  }
  expect(sha256("Cargo.lock")).toBe(cargoLockSha256);

  for (const [path, digest] of Object.entries(provenance.transfer.files))
    expect(sha256(path)).toBe(digest);
});

test("Apache license provenance records source bytes and normalized transfer bytes", () => {
  const provenance = JSON.parse(readFileSync(join(root, "provenance.json"), "utf8"));
  expect(provenance.source.sourceFiles.LICENSE).toBe(
    "1eb85fc97224598dad1852b5d6483bbcf0aa8608790dcc657a5a2a761ae9c8c6",
  );
  expect(provenance.transfer.files.LICENSE).toBe(
    "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
  );
  expect(sha256("LICENSE")).toBe(provenance.transfer.files.LICENSE);
});

test("uv, ruff, PyO3, and CPython remain exactly pinned external inputs", () => {
  const vendor = JSON.parse(readFileSync(join(root, "vendor.json"), "utf8"));
  const source = (name: string) => vendor.sources.find((entry: { name: string }) => entry.name === name);
  expect(source("uv").ref).toBe("46b84fd0bfec23b72f29e8e2185ba68a65052f48");
  expect(source("ruff").ref).toBe("3265ed1f944c98bb4c04d632fbefb1257cdb583d");
  expect(source("pyo3").ref).toBe("451d99fdcdcddf159e8e0a1186960b332cdb5d7c");
  const python = vendor.releases.find((entry: { name: string }) => entry.name === "python-build-standalone");
  expect(python.commit).toBe("5e46737f6480fc315ebfea83866910cbfcc772f0");
  expect(python.assets.find((entry: { python: string }) => entry.python === "3.12.15").sha256).toBe(
    "731af898886c5f821890dc901eca3c651cca8e51fa7308c159d12a1194aeac91",
  );
  expect(python.assets.find((entry: { python: string }) => entry.python === "3.14.8").sha256).toBe(
    "d9ec7a6935ade8b671a57ebaf111083d7314eab8dae5071d167054dadd2b97d6",
  );
});

test("package metadata keeps vu optional and avoids import-time runtime activation", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const packageCargo = readFileSync(join(root, "Cargo.toml"), "utf8");
  const bunCargo = readFileSync(join(root, "../../Cargo.toml"), "utf8");

  expect(packageJson.name).toBe("@aphrody/bun-vu");
  expect(packageJson.private).toBe(true);
  expect(packageJson.dependencies).toBeUndefined();
  expect(packageJson.exports).toBeUndefined();
  expect(packageJson.main).toBeUndefined();
  for (const name of ["preinstall", "install", "postinstall", "prepare"])
    expect(packageJson.scripts[name]).toBeUndefined();
  expect(packageCargo).toContain('members = ["crates/vu", "crates/vu-runtime"]');
  expect(packageCargo).not.toMatch(/\buv\s*=|\bruff\s*=/);
  expect(bunCargo).not.toContain('"packages/bun-vu"');
  expect(readFileSync(join(root, ".gitignore"), "utf8")).toMatch(/^\/vendor\/$/m);
  expect(readFileSync(join(root, ".gitignore"), "utf8")).toMatch(/^\/build\/$/m);
});

test("standalone Clippy clears Bun-engine-only policy without allowing warnings", () => {
  const config = readFileSync(join(root, "clippy.toml"), "utf8");
  expect(config).toContain("disallowed-methods = []");
  expect(config).toContain("disallowed-macros = []");
  expect(config).toContain("disallowed-types = []");
  expect(config).not.toMatch(/^\s*allow\s*=/m);
});

test("transfer metadata excludes caches, source checkouts, artifacts, and receipts", () => {
  const provenance = JSON.parse(readFileSync(join(root, "provenance.json"), "utf8"));
  const excluded = new Set(provenance.transfer.excluded);
  for (const path of [
    ".git",
    ".claude",
    "receipts/**",
    "**/__pycache__/**",
    "**/*.pyc",
    "vendor/**",
    "build/**",
    "target/**",
    "dist/**",
  ])
    expect(excluded.has(path)).toBe(true);

  for (const path of Object.keys(provenance.transfer.files)) {
    expect(path).not.toMatch(/(^|\/)(\.git|\.claude|vendor|build|target|dist|receipts)(\/|$)/);
    expect(path).not.toMatch(/(^|\/)__pycache__(\/|$)|\.(pyc|pyo)$/);
  }
});
