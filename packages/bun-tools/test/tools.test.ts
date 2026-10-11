import { expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { assetName, platformTag } from "../src/assets.ts";
import { rsync, toWslPath } from "../src/rsync.ts";

test("toWslPath convertit les chemins Windows seulement", () => {
  expect(toWslPath("C:\\Users\\a\\x")).toBe("/mnt/c/Users/a/x");
  expect(toWslPath("-avz")).toBe("-avz");
  expect(toWslPath("host:/srv")).toBe("host:/srv");
});

test("assetName suit la plateforme", () => {
  const t = platformTag();
  expect(assetName("rclone")).toBe(`rclone-${t}${t === "windows-x64" ? ".exe" : ""}`);
  expect(assetName("librclone")).toBe(`librclone-${t}${t === "windows-x64" ? ".dll" : ".so"}`);
});

test("tool cache verifies bytes and replaces corruption only after a valid download", async () => {
  using directory = tempDir("bun-tools-cache", {});
  const modulePath = new URL("../src/assets.ts", import.meta.url).href;
  const script = `
    import { ensureAsset } from ${JSON.stringify(modulePath)};
    import { readdirSync } from "node:fs";
    const name = "rclone-linux-x64";
    const path = process.env.APHRODY_TOOLS_DIR + "/" + name;
    const good = "qualified-tool-bytes";
    const digest = new Bun.CryptoHasher("sha256").update(good).digest("hex");
    let downloads = 0;
    let download = good;
    globalThis.fetch = async url => {
      if (String(url).endsWith("/SHA256SUMS.txt")) return new Response(digest + "  " + name + "\\n");
      downloads++;
      return new Response(download);
    };
    await Bun.write(path, good);
    await ensureAsset(name);
    const cachedDownloads = downloads;
    await Bun.write(path, "corrupted-cache");
    download = "invalid-download";
    let rejected = false;
    try { await ensureAsset(name); } catch { rejected = true; }
    const preserved = await Bun.file(path).text();
    download = good;
    await ensureAsset(name);
    console.log(JSON.stringify({ cachedDownloads, rejected, preserved, repaired: await Bun.file(path).text(), downloads,
      partials: readdirSync(process.env.APHRODY_TOOLS_DIR).filter(name => name.endsWith(".part")).length }));
  `;
  await using child = Bun.spawn({
    cmd: [bunExe(), "-e", script],
    env: { ...bunEnv, APHRODY_TOOLS_DIR: String(directory) },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(stdout.trim()).toBe(
    '{"cachedDownloads":0,"rejected":true,"preserved":"corrupted-cache","repaired":"qualified-tool-bytes","downloads":2,"partials":0}',
  );
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test.skipIf(process.platform !== "win32")(
  "rsync rejects Windows before starting a compatibility process",
  async () => {
    await expect(rsync(["--version"])).rejects.toThrow("Native rsync is unsupported on Windows");
  },
);
