import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

export function aliasRequests(root: string, unresolved: { page: string; href: string }[], page?: string) {
  const base = resolve(root);
  const aliases = new Map<string, string>();
  for (const entry of unresolved) {
    if (page && entry.page !== page) continue;
    const path = entry.href.split(/[?#]/)[0]!;
    if (!path || path.includes("\\") || /^(?:[a-z]+:|\/\/)/i.test(path)) continue;
    const file = resolve(path.startsWith("/") ? base : dirname(resolve(base, entry.page)), path.replace(/^\//, ""));
    if (!file.startsWith(base + sep) || !file.endsWith("index.html")) continue;
    const relativePath = relative(base, file).replaceAll("\\", "/");
    if (relativePath.split("/")[0]!.includes(".")) continue;
    aliases.set(relativePath, "https://bun.com/" + relativePath.replace(/index\.html$/, ""));
  }
  return [...aliases].map(([path, url]) => ({ path, url }));
}
if (import.meta.main) {
  const [directory, ...args] = process.argv.slice(2);
  if (!directory) throw new Error("Usage: repair-redirects.ts <preview-dir> [--page index.html] [--apply]");
  const root = resolve(directory),
    coverage = JSON.parse(readFileSync(resolve(root, "mirror-coverage.json"), "utf8"));
  const page = args.includes("--page") ? args[args.indexOf("--page") + 1] : undefined;
  const requests = aliasRequests(root, coverage.unresolved, page);
  if (!args.includes("--apply"))
    console.log(JSON.stringify({ requests: requests.length, examples: requests.slice(0, 10), maxRequests: 2000 }));
  else {
    const facts: {
      requested: string;
      resolved?: string;
      status?: number;
      alias?: string;
      target?: string;
      error?: string;
    }[] = [];
    for (const request of requests.slice(0, 2000)) {
      const proc = Bun.spawn(["aphrody-web", "response", request.url, "--max-bytes", "256"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (code) {
        facts.push({ requested: request.url, error: stderr.slice(0, 300) });
        continue;
      }
      try {
        const response = JSON.parse(stdout),
          url = new URL(response.url);
        const fact = { requested: request.url, resolved: url.href, status: response.status };
        if (
          !["bun.com", "www.bun.com"].includes(url.hostname) ||
          response.status !== 200 ||
          url.href.replace(/\/$/, "") === request.url.replace(/\/$/, "")
        ) {
          facts.push(fact);
          continue;
        }
        const target = decodeURIComponent(url.pathname).replace(/^\//, "").replace(/\/$/, "") + "/index.html";
        const targetFile = resolve(root, target);
        if (!targetFile.startsWith(root + sep) || !existsSync(targetFile)) {
          facts.push({ ...fact, error: "Redirect target not captured" });
          continue;
        }
        const alias = resolve(root, request.path);
        const href = relative(dirname(alias), targetFile).replaceAll("\\", "/").replaceAll('"', "%22");
        mkdirSync(dirname(alias), { recursive: true });
        writeFileSync(
          alias,
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${Bun.escapeHTML(href)}"><title>Captured upstream redirect</title><a href="${Bun.escapeHTML(href)}">Continue to the captured page</a></html>`,
        );
        facts.push({ ...fact, alias: request.path, target });
      } catch (error) {
        facts.push({ requested: request.url, error: String(error).slice(0, 300) });
      }
    }
    writeFileSync(
      resolve(root, "redirect-evidence.json"),
      JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          source: coverage.source,
          engine: "aphrody-web response",
          requests: facts.length,
          remaining: Math.max(0, requests.length - 2000),
          facts,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        requests: facts.length,
        aliases: facts.filter(f => f.alias).length,
        unresolved: facts.filter(f => !f.alias).length,
      }),
    );
  }
}
