import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "harness";
import {
  apply,
  check,
  git,
  parseCefConfig,
  parsePatchArguments,
  patchName,
  readOverlay,
  refresh,
  reset,
  splitDiff,
} from "../../scripts/aphrody/chromium-patches";

function commit(cwd: string, message: string) {
  git(cwd, ["add", "-A"]);
  git(cwd, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]).stdout.trim();
}

test("patch names flatten paths and diffs split per file", () => {
  expect(patchName("chrome/browser/BUILD.gn")).toBe("chrome-browser-BUILD.gn.patch");
  const sections = splitDiff("diff --git a/x b/x\n+1\ndiff --git a/y/z b/y/z\n+2\n");
  expect([...sections.keys()]).toEqual(["x", "y/z"]);
  expect(sections.get("y/z")).toBe("diff --git a/y/z b/y/z\n+2\n");
  expect(() => parsePatchArguments(["check", "--base", "a;b"])).toThrow("Git revision");
});

test("refresh, check, apply and reset round-trip a downstream on its base", () => {
  using dir = tempDir("chromium-patches", {
    "src/base/a.cc": "int a = 1;\n",
    "src/chrome/BUILD.gn": 'group("x") {}\n',
  });
  const source = join(String(dir), "src");
  const patches = join(String(dir), "patches");
  git(source, ["init", "-q"]);
  const base = commit(source, "base");
  writeFileSync(join(source, "base/a.cc"), "int a = 2;\n");
  writeFileSync(join(source, "chrome/BUILD.gn"), 'group("x") { deps = [ "//chrome/owned" ] }\n');
  git(source, ["checkout", "-q", "-b", "fork"]);
  Bun.spawnSync(["mkdir", "-p", join(source, "chrome/owned")]);
  writeFileSync(join(source, "chrome/owned/BUILD.gn"), 'group("owned") {}\n');
  const fork = commit(source, "fork");

  const options = {
    ...parsePatchArguments(["refresh"]),
    source,
    patches,
    cef: join(String(dir), "cef"),
    base,
    to: fork,
  };
  expect(refresh(options)).toEqual({ patches: 2, removed: 0, overlay: ["chrome/owned"] });
  expect(readFileSync(join(patches, "base-a.cc.patch"), "utf8")).toContain("+int a = 2;");
  const overlay = readOverlay(patches)!;
  overlay.repository = source;
  writeFileSync(join(patches, "overlay.json"), JSON.stringify(overlay));

  expect(check({ ...options, command: "check", expect: fork })).toMatchObject({
    patches: 2,
    conflicts: [],
    mismatched: [],
  });

  git(source, ["checkout", "-q", base]);
  expect(existsSync(join(source, "chrome/owned"))).toBe(false);
  expect(apply({ ...options, command: "apply" })).toMatchObject({ applied: 2, failed: [], overlayApplied: true });
  expect(readFileSync(join(source, "base/a.cc"), "utf8")).toBe("int a = 2;\n");
  expect(readFileSync(join(source, "chrome/owned/BUILD.gn"), "utf8")).toBe('group("owned") {}\n');
  expect(apply({ ...options, command: "apply" })).toMatchObject({ applied: 0, unchanged: 2, overlayApplied: false });

  expect(reset({ ...options, command: "reset" })).toMatchObject({ restored: 2, removedOverlay: ["chrome/owned"] });
  expect(readFileSync(join(source, "base/a.cc"), "utf8")).toBe("int a = 1;\n");
  expect(existsSync(join(source, "chrome/owned"))).toBe(false);
  expect(git(source, ["status", "--porcelain"]).stdout).toBe("");

  // An upstream bump touching a patched line is reported as a conflict.
  writeFileSync(join(source, "base/a.cc"), "int a = 3;\n");
  const moved = commit(source, "upstream bump");
  expect(check({ ...options, base: moved, command: "check" }).conflicts.map(c => c.patch)).toEqual(["base-a.cc.patch"]);
});

test("CEF patch.cfg entries parse with optional path and condition", () => {
  const cfg = `# {'name': 'commented'}
patches = [
  {
    # Comment with 'name': 'ignored'
    'name': 'gn_config',
  },
  { 'name': 'v8_build', 'path': 'v8' },
  { 'name': 'win_only', 'condition': 'CEF_WIN' },
]`;
  expect(parseCefConfig(cfg)).toEqual([
    { name: "gn_config" },
    { name: "v8_build", path: "v8" },
    { name: "win_only", condition: "CEF_WIN" },
  ]);
});
