// SPDX-License-Identifier: Apache-2.0
import { resolve, join } from "node:path";

type Entry = { url: string; path: string; bytes: number; blake3: string; kind: string };
export function moduleClosureURL(value: string): URL {
  const url = new URL(value, "https://bun.com/");
  if (
    url.origin !== "https://bun.com" ||
    url.username ||
    url.password ||
    !/^\/_assets\/[a-zA-Z0-9_-]+\.js$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw Error("Invalid module closure URL");
  return url;
}
/** Acquire only requested same-origin module dependencies, using the native mirror's byte/hash receipts. */
export async function captureModuleClosure(captureRoot: string, scratchRoot: string, seeds: readonly string[]) {
  const root = resolve(captureRoot),
    scratch = resolve(scratchRoot);
  const manifestFile = Bun.file(join(root, "manifest.json"));
  const manifest = await manifestFile.json();
  if (manifest.seedUrl !== "https://bun.com/" || manifest.failures.length) throw Error("Incomplete homepage capture");
  const known = new Set<string>(manifest.files.map((entry: Entry) => entry.url));
  const queue = [...seeds],
    added: Entry[] = [];
  while (queue.length) {
    const url = moduleClosureURL(queue.shift()!);
    if (known.has(url.href)) continue;
    if (added.length >= 128) throw Error("Module closure exceeds 128 assets");
    const directory = join(scratch, String(added.length));
    const child = Bun.spawn(
      [
        "aphrody",
        "web",
        "mirror",
        url.href,
        directory,
        "--max-pages",
        "1",
        "--max-assets",
        "128",
        "--max-depth",
        "0",
        "--concurrency",
        "1",
        "--delay-ms",
        "300",
        "--allowed-domains",
        "bun.com",
        "--resolve-cdns",
        "false",
        "--json",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const deadline = setTimeout(() => child.kill(), 30000);
    const [code, output, error] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    clearTimeout(deadline);
    if (code) throw Error("Native module capture failed: " + error.slice(0, 500));
    const receipt = await Bun.file(join(directory, "manifest.json")).json();
    if (receipt.failures.length || JSON.parse(output).failures.length)
      throw Error("Native module capture has failures");
    for (const entry of receipt.files as Entry[]) {
      if (entry.url !== url.href || entry.path !== "bun.com" + url.pathname || !/^[a-f0-9]{64}$/.test(entry.blake3))
        throw Error("Unexpected native module receipt");
      const bytes = await Bun.file(join(directory, entry.path)).bytes();
      if (bytes.length !== entry.bytes) throw Error("Native captured module size changed");
      await Bun.write(join(root, entry.path), bytes);
      added.push(entry);
      known.add(entry.url);
      const source = new TextDecoder().decode(bytes);
      for (const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)["']([^"']+\.js)["']/g)) {
        const dependency = new URL(match[1]!, url);
        if (dependency.origin === url.origin && dependency.pathname.startsWith("/_assets/"))
          queue.push(dependency.href);
      }
    }
  }
  manifest.files.push(...added);
  manifest.summary.assetsWritten += added.length;
  manifest.summary.requests += added.length;
  manifest.summary.bytesWritten += added.reduce((sum, entry) => sum + entry.bytes, 0);
  await Bun.write(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  return { added: added.map(entry => ({ url: entry.url, bytes: entry.bytes, blake3: entry.blake3 })) };
}

if (import.meta.main) {
  const [root, scratch, ...urls] = Bun.argv.slice(2);
  if (!root || !scratch || !urls.length)
    throw Error("Usage: capture-module-closure <capture-root> <scratch-root> <module-url> ...");
  console.log(JSON.stringify(await captureModuleClosure(root, scratch, urls)));
}
