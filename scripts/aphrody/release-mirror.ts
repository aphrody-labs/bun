// Runtime releases published on the Aphrody distribution mirror (dist.aphrody.app/bun/<tag>/), the source of the
// installers. A git tag counts as a release only when the mirror serves its SHA256SUMS.txt; assets, sizes and
// checksums come from the mirror and the notes from the commits between the tag and the previous runtime tag.
import { parseSums, type Release } from "../../packages/bun-ui/packages/web/site/build.ts";
import { PRIVATE_TERMS } from "../../packages/bun-ui/packages/web/site/collect.ts";

export const MIRROR = "https://dist.aphrody.app/bun";
const RUNTIME_TAG = /^(?:bun-v|aphrody-v)\d/;

const git = (root: string, args: string[]) => {
  const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode) throw new Error(`git ${args[0]}: ${result.stderr.toString().trim()}`);
  return result.stdout.toString();
};

/** Runtime tags, newest first by tag date. The upstream tags inherited from oven-sh/bun are older than the fork's
 * releases, so only the newest ones are worth asking the mirror about. */
export function runtimeTags(root: string, limit = 20): string[] {
  return git(root, ["tag", "--list", "--sort=-creatordate", "bun-v*", "aphrody-v*"])
    .split("\n")
    .map(tag => tag.trim())
    .filter(tag => RUNTIME_TAG.test(tag))
    .slice(0, limit);
}

/** Markdown notes from the conventional commit subjects between two tags: features, fixes, performance. */
export function releaseNotes(root: string, previous: string | undefined, tag: string): string {
  const range = previous ? `${previous}..${tag}` : tag;
  const subjects = git(root, ["log", "--no-merges", "--format=%s", range])
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !PRIVATE_TERMS.test(line));
  const sections: [string, RegExp][] = [
    ["Features", /^feat(?:\([^)]*\))?!?:\s*(.+)$/i],
    ["Fixes", /^fix(?:\([^)]*\))?!?:\s*(.+)$/i],
    ["Performance", /^perf(?:\([^)]*\))?!?:\s*(.+)$/i],
  ];
  const parts = [`${subjects.length} commits${previous ? ` since \`${previous}\`` : ""}.`];
  for (const [title, pattern] of sections) {
    const items = [...new Set(subjects.map(line => pattern.exec(line)?.[1]).filter((item): item is string => !!item))];
    if (!items.length) continue;
    const shown = items.slice(0, 40).map(item => `- ${item.replace(/[<>]/g, "")}`);
    if (items.length > shown.length) shown.push(`- and ${items.length - shown.length} more`);
    parts.push(`### ${title}\n\n${shown.join("\n")}`);
  }
  return parts.join("\n\n");
}

/** Releases whose files are on the mirror, newest first. */
export async function mirrorReleases(root: string, repo: string, mirror = MIRROR): Promise<Release[]> {
  const tags = runtimeTags(root);
  const latest = (await fetch(`${mirror}/latest.json`, { signal: AbortSignal.timeout(30_000) }).then(r =>
    r.ok ? r.json() : null,
  )) as { tag: string; published: string; assets: { name: string; size: number; sha256: string }[] } | null;
  const releases: Release[] = [];
  for (const [index, tag] of tags.entries()) {
    const response = await fetch(`${mirror}/${tag}/SHA256SUMS.txt`, { signal: AbortSignal.timeout(30_000) });
    // 404: the tag was never published. Any other failure must not silently drop a release from the site.
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`${tag}: the mirror answers ${response.status} for SHA256SUMS.txt`);
    const sums = parseSums(await response.text());
    const known = latest?.tag === tag ? new Map(latest.assets.map(asset => [asset.name, asset.size])) : new Map();
    const assets: Release["assets"] = await Promise.all(
      [...sums].map(async ([name, sha256]) => {
        const url = `${mirror}/${tag}/${name}`;
        let size = known.get(name) as number | undefined;
        if (size === undefined) {
          const head = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(30_000) });
          if (!head.ok)
            throw new Error(`${tag}: ${name} is listed in SHA256SUMS.txt but the mirror answers ${head.status}`);
          size = Number(head.headers.get("content-length") ?? 0);
        }
        return { name, url, size, sha256 };
      }),
    );
    assets.push({ name: "SHA256SUMS.txt", url: `${mirror}/${tag}/SHA256SUMS.txt`, size: 0 });
    const published =
      latest?.tag === tag
        ? latest.published
        : new Date(response.headers.get("last-modified") ?? Date.now()).toISOString();
    const version = tag.replace(/^(?:bun-v|aphrody-v)/, "");
    releases.push({
      tag,
      name: `Bun ${version}`,
      url: `https://github.com/${repo}/tree/${tag}`,
      publishedAt: published,
      body: releaseNotes(root, tags[index + 1], tag),
      prerelease: /-(?:alpha|beta|rc|canary)/.test(version),
      assets,
    });
  }
  return releases.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
