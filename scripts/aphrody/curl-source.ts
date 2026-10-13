import { resolve } from "node:path";
import { CURL_COMMIT } from "../build/deps/curl.ts";

const root = resolve(import.meta.dir, "../..");
const source = resolve(root, "src/runtime/curl/upstream");

async function git(args: string[]): Promise<string> {
  const child = Bun.spawn(["git", ...args], { cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  if (code !== 0) throw new Error(`git source operation failed (${code}): ${stderr}`);
  return stdout.trim();
}

if (!(await Bun.file(resolve(source, "CMakeLists.txt")).exists())) {
  await git(["clone", "--filter=blob:none", "--no-checkout", "https://github.com/curl/curl.git", source]);
  await git(["-C", source, "checkout", "--detach", CURL_COMMIT]);
}
const revision = await git(["-C", source, "rev-parse", "HEAD"]);
if (revision !== CURL_COMMIT) throw new Error(`Curl source revision mismatch: ${revision}`);
if (await git(["-C", source, "status", "--porcelain", "--untracked-files=no"]))
  throw new Error("Curl source has local modifications; preserve them and resolve the source receipt explicitly");
await Bun.write(resolve(source, ".bun-source.json"), JSON.stringify({ schema: 1, repository: "curl/curl", revision, version: "8.22.0" }, null, 2) + "\n");
console.log(`Curl source verified: ${revision}`);
