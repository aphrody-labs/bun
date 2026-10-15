import { chmodSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repository = "aphrody-labs/bun";
const assetName = process.platform === "win32" ? "bun-windows-x64.exe" : "bun-linux-x64";
const requestedTarget = process.argv[2];

if (!requestedTarget) {
  console.error("usage: bun sync-main-runtime.ts <absolute-target>");
  process.exit(2);
}

const target = resolve(requestedTarget);
if (
  !target.startsWith(
    resolve(process.env.USERPROFILE ?? process.env.HOME ?? ".") + (process.platform === "win32" ? "\\" : "/"),
  )
) {
  throw new Error("Runtime target must remain inside the current user home");
}

const headers = { Accept: "application/vnd.github+json", "User-Agent": "aphrody-main-runtime-sync" };
const releasesResponse = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=30`, { headers });
if (!releasesResponse.ok) throw new Error(`GitHub releases: HTTP ${releasesResponse.status}`);
const releases = (await releasesResponse.json()) as Array<{
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  target_commitish: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}>;
const release = releases.find(
  item => !item.draft && item.prerelease && /^main-runtime-[a-f0-9]{12}$/.test(item.tag_name),
);
if (!release || !/^[a-f0-9]{40}$/.test(release.target_commitish))
  throw new Error("No exact main runtime release found");

const binary = release.assets.find(asset => asset.name === assetName);
const sums = release.assets.find(asset => asset.name === "SHA256SUMS.txt");
if (!binary || !sums) throw new Error("Main runtime release is incomplete");

const [binaryResponse, sumsResponse] = await Promise.all([
  fetch(binary.browser_download_url, { headers }),
  fetch(sums.browser_download_url, { headers }),
]);
if (!binaryResponse.ok || !sumsResponse.ok) throw new Error("Unable to download the main runtime release");
const bytes = new Uint8Array(await binaryResponse.arrayBuffer());
const sumsText = await sumsResponse.text();
const expected = sumsText
  .split(/\r?\n/)
  .map(line => line.trim().split(/\s+/))
  .find(parts => parts.at(-1)?.replace(/^\*/, "") === assetName)?.[0];
const actual = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
if (!expected || expected !== actual) throw new Error("Main runtime checksum mismatch");

const temporary = `${target}.next`;
await Bun.write(temporary, bytes);
if (process.platform !== "win32") chmodSync(temporary, 0o755);
const probe = Bun.spawnSync([temporary, "--revision"], { stdout: "pipe", stderr: "pipe", windowsHide: true });
const revision = probe.stdout.toString().trim();
const revisionSuffix = /^\d+\.\d+\.\d+\+([a-f0-9]{7,40})$/.exec(revision)?.[1] ?? "";
if (probe.exitCode !== 0 || !revisionSuffix || !release.target_commitish.startsWith(revisionSuffix)) {
  rmSync(temporary, { force: true });
  throw new Error("Downloaded runtime source identity differs");
}

await Bun.write(dirname(target) + "/.aphrody-main-runtime", release.target_commitish + "\n");
rmSync(target, { force: true });
renameSync(temporary, target);
console.log(JSON.stringify({ target, revision, release: release.tag_name }));
