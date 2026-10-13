import { describe, expect, test } from "bun:test";
import { join } from "path";
import { bunEnv, bunExe, tempDir } from "harness";

async function invoke(args: string[], sudo = false) {
  await using process = Bun.spawn({
    cmd: [...(sudo ? ["sudo", "-n"] : []), bunExe(), "pm", "apt", ...args],
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    process.stdout.text(),
    process.stderr.text(),
    process.exited,
  ]);
  return { stdout, stderr, code };
}

describe("Debian native APT adapter", () => {
  test("advertises the native adapter and explicit root boundary", async () => {
    const result = await invoke(["--help"]);
    expect(result.stdout).toContain("APT/dpkg native adapter");
    expect(result.stdout).toContain("explicit initialized Debian root");
    expect(result.code).toBe(0);
  });

  test("rejects an implicit installation root before invoking APT", async () => {
    const result = await invoke(["install", "curl"]);
    expect(result.stderr).toContain("require --root DIR explicitly");
    expect(result.code).toBe(1);
  });

  test("rejects arbitrary trust bypass options", async () => {
    const result = await invoke(["--allow-unauthenticated", "install", "curl"]);
    expect(result.stderr).toContain("unsupported APT option");
    expect(result.code).toBe(1);
  });

  test("rejects ambiguous root traversal", async () => {
    const result = await invoke(["--root", "/srv/../root", "install", "curl"]);
    expect(result.stderr).toContain("without dot components");
    expect(result.code).toBe(1);
  });

  // Explicit opt-in for an Ubuntu factory with passwordless sudo. No host
  // package, repository or dpkg database is changed by this local fixture.
  test.skipIf(process.platform !== "linux" || process.env.BUN_SYSTEM_DEB_TEST_ROOT !== "1")(
    "installs and removes a real local deb without changing the host dpkg database",
    async () => {
      const ownerUid = process.getuid?.();
      const ownerGid = process.getgid?.();
      if (ownerUid === undefined || ownerGid === undefined)
        throw new Error("Debian fixture requires POSIX uid/gid");
      using dir = tempDir("system-deb", {
        "root/var/lib/dpkg/status": "",
        "root/var/lib/dpkg/info/.keep": "",
        "root/var/lib/dpkg/updates/.keep": "",
        "root/var/lib/dpkg/triggers/Unincorp": "",
        "root/etc/apt/sources.list": "",
        "root/var/lib/apt/lists/partial/.keep": "",
        "root/var/cache/apt/archives/partial/.keep": "",
        "root/var/log/apt/.keep": "",
        "pkg/DEBIAN/control":
          "Package: bun-deb-fixture\nVersion: 1.0-1\nArchitecture: all\nMaintainer: Bun tests <tests@example.invalid>\nDescription: isolated native APT fixture\n",
        "pkg/usr/share/bun-deb-fixture/marker": "installed by native APT\n",
      });
      const root = join(String(dir), "root");
      const archive = join(String(dir), "fixture.deb");
      const hostStatus = await Bun.file("/var/lib/dpkg/status").arrayBuffer();
      const hostHash = new Bun.CryptoHasher("sha256").update(hostStatus).digest("hex");
      await using build = Bun.spawn({
        cmd: [
          "/usr/bin/dpkg-deb",
          "--build",
          "--root-owner-group",
          join(String(dir), "pkg"),
          archive,
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [buildOut, buildError, buildCode] = await Promise.all([
        build.stdout.text(),
        build.stderr.text(),
        build.exited,
      ]);
      expect(buildOut).toContain("bun-deb-fixture");
      expect(buildError).toBe("");
      expect(buildCode).toBe(0);

      try {
        const installed = await invoke(["--root", root, "--yes", "install", archive], true);
        expect(installed.stdout).toContain("Setting up bun-deb-fixture");
        expect(installed.code).toBe(0);
        expect(await Bun.file(join(root, "usr/share/bun-deb-fixture/marker")).text()).toBe(
          "installed by native APT\n",
        );
        expect(await Bun.file(join(root, "var/lib/dpkg/status")).text()).toContain(
          "Status: install ok installed",
        );
        const listed = await invoke(["--root", root, "list", "bun-deb-fixture"]);
        expect(listed.stdout).toContain("bun-deb-fixture\t1.0-1");
        expect(listed.code).toBe(0);

        const removed = await invoke(["--root", root, "--yes", "remove", "bun-deb-fixture"], true);
        expect(removed.stdout).toContain("Removing bun-deb-fixture");
        expect(removed.code).toBe(0);
        expect(await Bun.file(join(root, "usr/share/bun-deb-fixture/marker")).exists()).toBe(false);
        const currentHostStatus = await Bun.file("/var/lib/dpkg/status").arrayBuffer();
        expect(new Bun.CryptoHasher("sha256").update(currentHostStatus).digest("hex")).toBe(
          hostHash,
        );
      } finally {
        // APT creates root-owned fixture directories. Restore this test's owner
        // before tempDir disposes them; -P/-h never follow package symlinks.
        await using cleanup = Bun.spawn({
          cmd: [
            "sudo",
            "-n",
            "/usr/bin/chown",
            "-R",
            "-h",
            "-P",
            `${ownerUid}:${ownerGid}`,
            "--",
            String(dir),
          ],
          env: bunEnv,
          stdout: "ignore",
          stderr: "pipe",
        });
        const [stderr, code] = await Promise.all([cleanup.stderr.text(), cleanup.exited]);
        expect(code, stderr).toBe(0);
      }
    },
    30_000,
  );
});
