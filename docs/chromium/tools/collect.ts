// SPDX-License-Identifier: Apache-2.0
import { mkdirSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute, sep } from "node:path";

const root = resolve(import.meta.dir, "..");
const manifestPath = resolve(root, "inventory.json");
const mode = process.argv[2];
const outputPath = mode === "--plan" ? resolve(root, "plan.json") : manifestPath;
type Entry = {
  family: string;
  path: string;
  url: string;
  revision?: string;
  status: string;
  bytes?: number;
  sha256?: string;
  error?: string;
};
type Corpus = {
  family: string;
  repository: string;
  revision: string;
  prefixes: string[];
  listed: number;
  selected: number;
  treeTruncated: boolean;
  error?: string;
  catalog?: { strategy: string; discovered: number; limit: number; exhausted: boolean };
  warning?: string;
};
const inventory: {
  schemaVersion: number;
  observedOn: string;
  fetchedAt: string;
  scope: string;
  corpora: Corpus[];
  entries: Entry[];
} = {
  schemaVersion: 1,
  observedOn: "2026-10-11",
  fetchedAt: new Date().toISOString(),
  scope:
    "Pinned Markdown/text documentation subtrees and selected official web pages. Not all Google documentation, Chromium source or web assets.",
  corpora: [],
  entries: [],
};
function owned(path: string) {
  const target = resolve(root, path);
  const suffix = relative(root, target);
  if (!suffix || suffix.startsWith(`..${sep}`) || suffix === ".." || isAbsolute(suffix))
    throw new Error(`Unsafe corpus path: ${path}`);
  return target;
}
async function request(url: string, timeout = 30000) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: {
          "User-Agent": "Aphrody-documentation-archive/1.0",
          Accept: "application/json,text/plain,text/html,*/*",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return await response.text();
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
async function save(entry: Entry, transform?: (text: string) => string) {
  if (inventory.entries.some(existing => existing.path === entry.path)) return;
  inventory.entries.push(entry);
  try {
    const file = Bun.file(owned(entry.path));
    if (entry.revision && (await file.exists())) {
      const content = await file.text();
      entry.status = "fetched";
      entry.bytes = Buffer.byteLength(content);
      entry.sha256 = Bun.CryptoHasher.hash("sha256", content, "hex");
      return;
    }
    const raw = await request(entry.url);
    const content = transform ? transform(raw) : raw;
    if (!content.trim()) throw new Error("Empty source response");
    const target = owned(entry.path);
    mkdirSync(dirname(target), { recursive: true });
    await Bun.write(target, content);
    entry.status = "fetched";
    entry.bytes = Buffer.byteLength(content);
    entry.sha256 = Bun.CryptoHasher.hash("sha256", content, "hex");
  } catch (error) {
    entry.status = "failed";
    entry.error = String(error);
  }
}
async function pool<T>(items: T[], action: (item: T) => Promise<void>) {
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < items.length) {
        await action(items[next++]);
        if (++done % 100 === 0) console.log(`Fetched ${done}/${items.length}`);
      }
    }),
  );
}
const repos = [
  {
    family: "chromium",
    repo: "chromium/chromium",
    prefixes: ["docs"],
    extra: ["LICENSE", "AUTHORS"],
  },
  {
    family: "v8",
    repo: "v8/v8.dev",
    prefixes: ["src/docs", "src/blog"],
    extra: ["LICENSE", "README.md"],
  },
  {
    family: "skia",
    repo: "google/skia",
    prefixes: ["site/docs"],
    extra: ["LICENSE", "README.md", "gn/skia.gni"],
  },
];
const archiveRepos = [
  {
    family: "chromium-site",
    repository: "https://chromium.googlesource.com/website",
    prefix: "site",
  },
  {
    family: "chromiumos-docs",
    repository: "https://chromium.googlesource.com/chromiumos/docs",
    prefix: "",
  },
  {
    family: "depot-tools",
    repository: "https://chromium.googlesource.com/chromium/tools/depot_tools",
    prefix: "",
  },
];
async function gitiles(config: (typeof archiveRepos)[number]) {
  const corpus: Corpus = {
    family: config.family,
    repository: config.repository,
    revision: "",
    prefixes: [config.prefix],
    listed: 0,
    selected: 0,
    treeTruncated: false,
  };
  inventory.corpora.push(corpus);
  try {
    const head = JSON.parse(
      (await request(`${config.repository}/+/refs/heads/main?format=JSON`)).replace(/^\)\]\}'\n/, ""),
    );
    corpus.revision = head.commit;
    if (!/^[a-f0-9]{40}$/.test(corpus.revision)) throw new Error("Missing immutable Gitiles commit");
    const archiveURL = `${config.repository}/+archive/${corpus.revision}${config.prefix ? "/" + config.prefix : ""}.tar.gz`;
    const response = await fetch(archiveURL, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${archiveURL}`);
    const archive = new Bun.Archive(await response.arrayBuffer());
    const files = await archive.files();
    corpus.listed = files.size;
    const selected = Array.from(files).filter(
      ([name]) => /\.(?:md|markdown|mdx|rst|txt)$/i.test(name) || /(?:^|\/)(?:LICENSE|COPYING|NOTICE)$/.test(name),
    );
    corpus.selected = selected.length;
    console.log(`${corpus.family}: ${corpus.selected} documentation files at ${corpus.revision}`);
    if (mode === "--plan") return;
    for (const [name, file] of selected) {
      const sourcePath = config.prefix ? `${config.prefix}/${name}` : name;
      const entry: Entry = {
        family: config.family,
        path: `sources/${config.family}/${corpus.revision}/${sourcePath}`,
        url: `${config.repository}/+/${corpus.revision}/${sourcePath}`,
        revision: corpus.revision,
        status: "fetched",
      };
      const target = owned(entry.path);
      const content = await file.arrayBuffer();
      mkdirSync(dirname(target), { recursive: true });
      await Bun.write(target, content);
      entry.bytes = content.byteLength;
      entry.sha256 = Bun.CryptoHasher.hash("sha256", content, "hex");
      inventory.entries.push(entry);
    }
    for (const name of ["LICENSE", "README.md"]) {
      await save(
        {
          family: config.family,
          path: `sources/${config.family}/${corpus.revision}/${name}`,
          url: `${config.repository}/+/${corpus.revision}/${name}?format=TEXT`,
          revision: corpus.revision,
          status: "pending",
        },
        text => Buffer.from(text.trim(), "base64").toString("utf8"),
      );
    }
  } catch (error) {
    corpus.error = String(error);
    console.log(`${config.family}: ${corpus.error}`);
  }
}
async function chromeCatalog() {
  const repository = "https://developer.chrome.com";
  const corpus: Corpus = {
    family: "chrome-pages",
    repository,
    revision: "unversioned-live-pages",
    prefixes: ["/docs/"],
    listed: 0,
    selected: 0,
    treeTruncated: false,
  };
  inventory.corpora.push(corpus);
  try {
    const index = await request(`${repository}/sitemap.xml`);
    const locations = (xml: string) =>
      Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g), match => match[1].replaceAll("&amp;", "&"));
    const urls = new Set<string>();
    for (const sitemap of locations(index)) {
      if (!sitemap.startsWith(repository + "/sitemap")) continue;
      console.log(`Reading ${sitemap}`);
      const xml = await request(sitemap, 10000);
      const filename = new URL(sitemap).pathname.slice(1);
      if (mode === "--collect") {
        const path = `sources/catalogs/${filename}`;
        await Bun.write(owned(path), xml);
        inventory.entries.push({
          family: "chrome-catalog",
          path,
          url: sitemap,
          status: "fetched",
          bytes: Buffer.byteLength(xml),
          sha256: Bun.CryptoHasher.hash("sha256", xml, "hex"),
        });
      }
      for (const url of locations(xml)) {
        corpus.listed++;
        const parsed = new URL(url);
        if (parsed.origin === repository && parsed.pathname.startsWith("/docs/") && !parsed.search) urls.add(url);
      }
    }
    corpus.selected = urls.size;
    console.log(`chrome-pages: ${urls.size} English/default documentation URLs in official sitemaps`);
    if (mode === "--plan") return;
    await pool(Array.from(urls), async url => {
      const entry: Entry = {
        family: "chrome-pages",
        path: `sources/chrome-pages/${new URL(url).pathname.slice(1).replace(/\/$/, "")}.txt`,
        url,
        status: "pending",
      };
      inventory.entries.push(entry);
      try {
        const html = await request(url);
        let main = "";
        await new HTMLRewriter()
          .on("main", {
            text(chunk) {
              main += chunk.text;
            },
          })
          .transform(new Response(html))
          .text();
        if (!main.trim()) throw new Error("No main documentation content");
        const content = `Source: ${url}\nCollected: ${inventory.fetchedAt}\nFormat: HTML main text; scripts, styling, media and navigation excluded.\n\n${main
          .replace(/\n[ \t]+/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim()}\n`;
        const target = owned(entry.path);
        mkdirSync(dirname(target), { recursive: true });
        await Bun.write(target, content);
        entry.status = "fetched";
        entry.bytes = Buffer.byteLength(content);
        entry.sha256 = Bun.CryptoHasher.hash("sha256", content, "hex");
      } catch (error) {
        entry.status = "failed";
        entry.error = String(error);
      }
    });
  } catch (error) {
    corpus.error = String(error);
    console.log(`${corpus.family}: ${corpus.error}`);
    if (mode !== "--plan") await chromeCrawl(corpus);
  }
}
async function chromeCrawl(corpus: Corpus) {
  const origin = "https://developer.chrome.com";
  const seeds = [
    "/docs/",
    "/docs/extensions/",
    "/docs/devtools/",
    "/docs/web-platform/",
    "/docs/chromium/",
    "/docs/chromedriver/",
    "/docs/lighthouse/",
    "/docs/workbox/",
    "/docs/privacy-sandbox/",
  ];
  const queue: string[] = [];
  const seen = new Set<string>();
  const limit = 10000;
  const add = (href: string, base: string) => {
    try {
      const url = new URL(href, base);
      if (url.origin !== origin || !url.pathname.startsWith("/docs/") || url.search) return;
      if (/\.(?:png|svg|jpg|jpeg|webp|gif|ai|ico|pdf|mp4|zip|gz|js|css|wasm)$/i.test(url.pathname)) return;
      url.hash = "";
      url.pathname = url.pathname.replace(/\/$/, "");
      if (seen.has(url.href) || seen.size >= limit) return;
      seen.add(url.href);
      queue.push(url.href);
    } catch {
      /* Ignore malformed upstream hyperlinks. */
    }
  };
  for (const seed of seeds) add(seed, origin);
  let next = 0;
  let completed = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < queue.length) {
        const url = queue[next++];
        const path = `sources/chrome-pages/${new URL(url).pathname.slice(1)}.txt`;
        if (inventory.entries.some(entry => entry.path === path)) continue;
        const entry: Entry = { family: "chrome-pages", path, url, status: "pending" };
        inventory.entries.push(entry);
        try {
          const html = await request(url, 15000);
          let main = "";
          const links = new Set<string>();
          await new HTMLRewriter()
            .on("a[href]", {
              element(element) {
                const href = element.getAttribute("href");
                if (href) {
                  add(href, url);
                  try {
                    links.add(new URL(href, url).href);
                  } catch {}
                }
              },
            })
            .on("main", {
              text(chunk) {
                main += chunk.text;
              },
            })
            .transform(new Response(html))
            .text();
          if (!main.trim()) throw new Error("No main documentation content");
          const content = `Source: ${url}\nCollected: ${inventory.fetchedAt}\nFormat: HTML main text plus original hyperlink catalog; assets excluded.\n\n${main
            .replace(/\n[ \t]+/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim()}\n\nLinks:\n${Array.from(links).join("\n")}\n`;
          mkdirSync(dirname(owned(path)), { recursive: true });
          await Bun.write(owned(path), content);
          entry.status = "fetched";
          entry.bytes = Buffer.byteLength(content);
          entry.sha256 = Bun.CryptoHasher.hash("sha256", content, "hex");
        } catch (error) {
          entry.status = "failed";
          entry.error = String(error);
        }
        if (++completed % 50 === 0) {
          console.log(`Chrome linked crawl: ${completed} fetched attempts / ${queue.length} discovered`);
          await Bun.write(manifestPath, JSON.stringify(inventory, null, 2) + "\n");
        }
      }
    }),
  );
  corpus.listed = queue.length;
  corpus.selected = queue.length;
  corpus.catalog = {
    strategy: "Official documentation hyperlink traversal after sitemap failure",
    discovered: queue.length,
    limit,
    exhausted: seen.size < limit,
  };
  corpus.warning = corpus.error;
  delete corpus.error;
  console.log(`Chrome linked crawl completed: ${queue.length} documents discovered`);
}
async function github(config: (typeof repos)[number]) {
  const corpus: Corpus = {
    family: config.family,
    repository: `https://github.com/${config.repo}`,
    revision: "",
    prefixes: config.prefixes,
    listed: 0,
    selected: 0,
    treeTruncated: false,
  };
  inventory.corpora.push(corpus);
  try {
    const metadata = JSON.parse(await request(`https://api.github.com/repos/${config.repo}`));
    const commit = JSON.parse(
      await request(`https://api.github.com/repos/${config.repo}/commits/${metadata.default_branch}`),
    );
    corpus.revision = commit.sha;
    const targets: { path: string; url: string }[] = [];
    for (const prefix of config.prefixes) {
      const listing = JSON.parse(
        await request(`https://api.github.com/repos/${config.repo}/contents/${prefix}?ref=${corpus.revision}`),
      );
      // Contents returns directory children; trees retain the complete scoped tree in one response.
      const parent = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "";
      const siblings = JSON.parse(
        await request(`https://api.github.com/repos/${config.repo}/contents/${parent}?ref=${corpus.revision}`),
      );
      const dir = siblings.find((item: any) => item.path === prefix && item.type === "dir");
      if (!dir || !Array.isArray(listing)) throw new Error(`Missing source directory: ${prefix}`);
      const tree = JSON.parse(
        await request(`https://api.github.com/repos/${config.repo}/git/trees/${dir.sha}?recursive=1`),
      );
      corpus.treeTruncated ||= Boolean(tree.truncated);
      corpus.listed += tree.tree.length;
      for (const item of tree.tree) {
        if (item.type === "blob" && /\.(?:md|mdx|rst|txt)$/i.test(item.path)) {
          const path = `${prefix}/${item.path}`;
          targets.push({
            path,
            url: `https://raw.githubusercontent.com/${config.repo}/${corpus.revision}/${path}`,
          });
        }
      }
    }
    corpus.selected = targets.length;
    targets.push(
      ...config.extra.map(path => ({
        path,
        url: `https://raw.githubusercontent.com/${config.repo}/${corpus.revision}/${path}`,
      })),
    );
    console.log(`${corpus.family}: ${corpus.selected} documentation files at ${corpus.revision}`);
    if (mode === "--plan") return;
    await pool(targets, async target => {
      await save({
        family: corpus.family,
        path: `sources/${corpus.family}/${corpus.revision}/${target.path}`,
        url: target.url,
        revision: corpus.revision,
        status: "pending",
      });
    });
  } catch (error) {
    corpus.error = String(error);
    console.log(`${config.family}: ${corpus.error}`);
  }
}
const pages = [
  ["chrome", "https://developer.chrome.com/docs/extensions/develop"],
  ["chrome", "https://developer.chrome.com/docs/extensions/reference/api"],
  ["chrome", "https://developer.chrome.com/docs/extensions/develop/concepts/service-workers"],
  ["chrome", "https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging"],
  ["chrome", "https://developer.chrome.com/docs/extensions/develop/ui/themes"],
  ["chrome", "https://developer.chrome.com/docs/devtools"],
  ["chrome", "https://developer.chrome.com/docs/web-platform/webgpu"],
  ["chrome", "https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips"],
  ["chrome", "https://developer.chrome.com/docs/capabilities"],
  ["chrome", "https://developer.chrome.com/blog/remote-debugging-port"],
  ["chrome", "https://developer.chrome.com/docs/chromium/headless"],
  ["chrome", "https://developer.chrome.com/docs/chromedriver"],
  ["chrome", "https://developer.chrome.com/llms.txt"],
  ["chrome", "https://developer.chrome.com/sitemap.xml"],
  ["cdp", "https://chromedevtools.github.io/devtools-protocol/"],
  ["cdp", "https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/browser_protocol.json"],
  ["cdp", "https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json"],
  ["chromiumos", "https://www.chromium.org/chromium-os/developer-library/guides/development/developer-guide/"],
  ["chromiumos", "https://chromium.googlesource.com/chromiumos/manifest/+/HEAD/README.md?format=TEXT"],
  ["depot-tools", "https://chromium.googlesource.com/chromium/tools/depot_tools/+/main/README.md?format=TEXT"],
  ["depot-tools", "https://chromium.googlesource.com/chromium/tools/depot_tools/+/main/LICENSE?format=TEXT"],
  [
    "depot-tools",
    "https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools.html",
  ],
  ["gn", "https://gn.googlesource.com/gn/+/main/docs/reference.md?format=TEXT"],
  ["gn", "https://gn.googlesource.com/gn/+/main/docs/quick_start.md?format=TEXT"],
  ["dawn", "https://dawn.googlesource.com/dawn/+/main/README.md?format=TEXT"],
  ["google", "https://developers.google.com/products"],
  ["google", "https://opensource.google/docs"],
  ["google", "https://developers.google.com/terms/site-policies"],
  ["cef", "https://bitbucket.org/chromiumembedded/cef/wiki/GeneralUsage.md"],
  ["cef", "https://chromiumembedded.github.io/cef/general_usage"],
  ["cef", "https://chromiumembedded.github.io/cef/branches_and_building"],
  [
    "blink",
    "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/bindings/README.md?format=TEXT",
  ],
  [
    "blink",
    "https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/heap/README.md?format=TEXT",
  ],
  ["chromium", "https://chromium.googlesource.com/chromium/src/+/main/services/network/README.md?format=TEXT"],
  ["skia", "https://skia.googlesource.com/skia/+/main/gn/skia.gni?format=TEXT"],
  ["skia", "https://skia.googlesource.com/skia/+/main/modules/canvaskit/compile.sh?format=TEXT"],
  ["google", "https://google.github.io/styleguide/"],
  ["web", "https://web.dev/learn/pwa/"],
];
async function verify() {
  const receipt = (await Bun.file(manifestPath).json()) as typeof inventory;
  let bad = 0;
  for (const entry of receipt.entries) {
    if (entry.status !== "fetched") continue;
    const file = Bun.file(owned(entry.path));
    if (
      !(await file.exists()) ||
      Bun.CryptoHasher.hash("sha256", await file.arrayBuffer(), "hex") !== entry.sha256 ||
      file.size !== entry.bytes
    ) {
      console.error(`Integrity mismatch: ${entry.path}`);
      bad++;
    }
  }
  const fetched = receipt.entries.filter(entry => entry.status === "fetched");
  console.log(
    JSON.stringify({
      fetched: fetched.length,
      failed: receipt.entries.filter(entry => entry.status === "failed").length,
      excluded: receipt.entries.filter(entry => entry.status === "excluded").length,
      corporaFailed: receipt.corpora.filter(c => c.error).length,
      bytes: fetched.reduce((sum, e) => sum + (e.bytes ?? 0), 0),
      integrityErrors: bad,
    }),
  );
  if (bad) process.exitCode = 1;
}
if (mode === "--chrome") {
  Object.assign(inventory, await Bun.file(manifestPath).json());
  inventory.corpora = inventory.corpora.filter(corpus => corpus.family !== "chrome-pages");
  inventory.entries = inventory.entries.filter(entry => entry.family !== "chrome-pages");
  await chromeCatalog();
  inventory.entries.sort((a, b) => a.path.localeCompare(b.path));
  await Bun.write(manifestPath, JSON.stringify(inventory, null, 2) + "\n");
} else if (mode === "--verify") {
  await verify();
} else if (mode === "--collect" || mode === "--plan") {
  for (const config of repos) {
    await github(config);
    await Bun.write(outputPath, JSON.stringify(inventory, null, 2) + "\n");
  }
  for (const config of archiveRepos) {
    await gitiles(config);
    await Bun.write(outputPath, JSON.stringify(inventory, null, 2) + "\n");
  }
  await chromeCatalog();
  if (mode === "--collect") {
    await pool(pages, async ([family, url]) => {
      const parsed = new URL(url);
      const filename = parsed.pathname.split("/").filter(Boolean).join("_") || "index";
      await save(
        {
          family,
          path: `sources/pages/${family}/${filename}${url.includes("format=TEXT") ? ".txt" : ".html"}`,
          url,
          status: "pending",
        },
        url.includes("format=TEXT") ? text => Buffer.from(text.trim(), "base64").toString("utf8") : undefined,
      );
    });
  }
  inventory.entries.sort((a, b) => a.path.localeCompare(b.path));
  await Bun.write(outputPath, JSON.stringify(inventory, null, 2) + "\n");
  console.log(
    `Inventory: ${inventory.entries.filter(e => e.status === "fetched").length} fetched / ${inventory.entries.length} attempted`,
  );
} else {
  throw new Error("Use --plan, --collect, --chrome or --verify; no builds or browser launch are performed.");
}
