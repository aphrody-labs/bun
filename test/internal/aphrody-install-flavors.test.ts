import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bunEnv, bunExe, tempDir } from "harness";

const installer = join(import.meta.dirname, "../../scripts/aphrody/install.sh");

// The shell fixture supplies release metadata; JS checks run in the candidate
// Bun. No release, user installation or network endpoint is changed.
describe.if(process.platform === "linux")("fork installer flavors", () => {
  for (const flavor of ["perf", "full"] as const) {
    test(`${flavor} archive installs after checksum and feature checks`, async () => {
      await installFixture(flavor, flavor, true, true);
    });
  }
  test("full rejects a perf feature manifest before installation", async () => {
    await installFixture("full", "perf", false, false);
  });
  test("full rejects a manifest without compiled coreutils", async () => {
    await installFixture("full", "full", false, false);
  });
});

async function installFixture(flavor: "perf" | "full", manifestFlavor: string, coreutils: boolean, success: boolean) {
  using directory = tempDir("bun-install-flavor", {});
  const root = String(directory);
  const target = `bun-linux-${process.arch === "arm64" ? "aarch64" : "x64"}${flavor === "full" ? "-full" : ""}`;
  const packageDir = join(root, target);
  const mocks = join(root, "mocks");
  mkdirSync(packageDir);
  mkdirSync(mocks);
  writeFileSync(join(root, "releases.json"), '[{"tag_name":"bun-v1.4.4","draft":false,"prerelease":false}]');
  writeFileSync(
    join(packageDir, "release-flavor.json"),
    JSON.stringify({ flavor: manifestFlavor, compiledFeatures: { coreutils } }),
  );
  writeFileSync(
    join(packageDir, "bun"),
    `#!/bin/bash
case "$1" in
  --revision) echo aphrody-installer-fixture ;;
  --version) echo 1.4.4 ;;
  *) exec "$REAL_BUN" "$@" ;;
esac
`,
  );
  chmodSync(join(packageDir, "bun"), 0o755);
  writeFileSync(
    join(mocks, "curl"),
    `#!/bin/bash
set -euo pipefail
destination=
while (( $# )); do
  if [[ $1 = -o ]]; then destination=$2; shift 2; else url=$1; shift; fi
done
if [[ -n $destination ]]; then asset=$(basename "$url"); cp "$MOCK_RELEASE/$asset" "$destination";
else cat "$MOCK_RELEASE/releases.json"; fi
`,
  );
  chmodSync(join(mocks, "curl"), 0o755);
  const archive = join(root, `${target}.zip`);
  const zip = Bun.spawnSync(["/usr/bin/zip", "-qr", archive, target], { cwd: root, env: bunEnv });
  expect(zip.exitCode).toBe(0);
  const digest = new Bun.CryptoHasher("sha256").update(await Bun.file(archive).arrayBuffer()).digest("hex");
  writeFileSync(join(root, "SHA256SUMS.txt"), `${digest}  ${target}.zip\n`);
  const install = join(root, "installed");
  const result = Bun.spawnSync(["/bin/bash", installer, "latest", flavor], {
    cwd: root,
    env: {
      ...bunEnv,
      GITHUB_TOKEN: "",
      GH_TOKEN: "",
      APHRODY_BUN_REPO: "aphrody-labs/bun",
      BUN_INSTALL: install,
      REAL_BUN: bunExe(),
      MOCK_RELEASE: root,
      PATH: `${mocks}:/usr/bin:/bin`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode === 0).toBe(success);
  expect(existsSync(join(install, "bin/bun"))).toBe(success);
  if (!success) expect(result.stderr.toString()).toContain("full archive must contain its compiled feature manifest");
}
