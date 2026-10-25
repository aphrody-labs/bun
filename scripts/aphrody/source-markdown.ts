import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { GitTree } from "../../packages/bun-ui/packages/web/site/collect.ts";
import { moduleNames } from "./fork-capabilities.ts";

export const digest = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
export type CommentCandidate = {
  path: string;
  sourceSha: string;
  sourceHash: string;
  commentHash: string;
  start: number;
  end: number;
  line: number;
  text: string;
  language: "review-required" | "undetermined";
  rationale: string[];
  protected: boolean;
};

/** Rust-only lexical selection; prose language and correctness remain review decisions. */
export function selectRustComments(path: string, source: string, sourceSha: string): CommentCandidate[] {
  const candidates: CommentCandidate[] = [];
  const sourceHash = digest(source);
  for (let at = 0; at < source.length;) {
    const rest = source.slice(at);
    const raw = /^(?:br|cr|r)(#{0,255})"/.exec(rest);
    if (raw && (at === 0 || !/[\w]/.test(source[at - 1]!))) {
      const close = '"' + raw[1];
      const end = source.indexOf(close, at + raw[0].length);
      if (end < 0) break;
      at = end + close.length;
      continue;
    }
    if (source[at] === '"') {
      at++;
      while (at < source.length) {
        if (source[at] === "\\") at += 2;
        else if (source[at++] === '"') break;
      }
      continue;
    }
    const char = /^'(?:\\(?:u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|[^\r\n])|[^'\\\r\n])'/u.exec(rest);
    if (char) {
      at += char[0].length;
      continue;
    }
    let end = at;
    if (rest.startsWith("//")) {
      end = source.indexOf("\n", at);
      if (end < 0) end = source.length;
    } else if (rest.startsWith("/*")) {
      let depth = 1;
      end = at + 2;
      while (end < source.length && depth) {
        if (source.slice(end, end + 2) === "/*") {
          depth++;
          end += 2;
        } else if (source.slice(end, end + 2) === "*/") {
          depth--;
          end += 2;
        } else end++;
      }
      if (depth) break;
    }
    if (end === at) {
      at++;
      continue;
    }
    const text = source.slice(at, end);
    const protectedNotice =
      /\b(copyright|license|SPDX|permission is hereby|safety|SAFETY|generated|do not edit)\b/i.test(text);
    const rationale: string[] = [];
    if (/\b(le|les|une|dans|pour|avec|ceci|cette|doit|depuis)\b|[éèàçùœ]/i.test(text))
      rationale.push("French lexical signal; human translation review required");
    if (text.split("\n").length > 4 || text.length > 300)
      rationale.push("Long comment; check whether concise wording preserves its evidence");
    if (/\b(blazing|revolutionary|best[- ]in[- ]class|world[- ]class)\b/i.test(text))
      rationale.push("Promotional wording; verify or remove the unsupported claim");
    if (rationale.length || protectedNotice)
      candidates.push({
        path,
        sourceSha,
        sourceHash,
        commentHash: digest(text),
        start: at,
        end,
        line: source.slice(0, at).split("\n").length,
        text,
        language: rationale.some(r => r.startsWith("French")) ? "review-required" : "undetermined",
        rationale,
        protected: protectedNotice,
      });
    at = end;
  }
  return candidates;
}

export function reviewedReplacement(source: string, candidate: CommentCandidate, replacement: string): string {
  if (candidate.protected) throw new Error("Protected notice or safety comment requires owner review");
  if (
    digest(source) !== candidate.sourceHash ||
    digest(source.slice(candidate.start, candidate.end)) !== candidate.commentHash
  )
    throw new Error("Source changed since selection");
  if (
    !replacement.startsWith(candidate.text.startsWith("//") ? "//" : "/*") ||
    (candidate.text.startsWith("//") && /[\r\n]/.test(replacement)) ||
    (candidate.text.startsWith("/*") && (!replacement.endsWith("*/") || /\/\*|\*\//.test(replacement.slice(2, -2))))
  )
    throw new Error("Replacement must preserve comment boundaries");
  return source.slice(0, candidate.start) + replacement + source.slice(candidate.end);
}

export function markdownInventory(tree: Pick<GitTree, "sha" | "files" | "read">) {
  const paths = [...tree.files.keys()]
    .filter(
      p =>
        p === "package.json" ||
        p === "src/resolve_builtins/HardcodedModule.rs" ||
        /^(?:packages|vendor|src)\/.+\/package\.json$/.test(p) ||
        /^(?:LICENSE[^/]*|COPYING[^/]*)$/.test(p),
    )
    .sort();
  const texts = tree.read(paths);
  const root = JSON.parse(texts.get("package.json") ?? "{}");
  const unresolvedManifests: { path: string; sha256: string; parseError: string }[] = [];
  const packages = paths
    .filter(path => path.endsWith("/package.json"))
    .flatMap(path => {
      const content = texts.get(path)!;
      let declaration: { name?: unknown; version?: unknown; private?: unknown };
      try {
        const parsed: unknown = JSON.parse(content);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new TypeError("Package manifest must be a JSON object");
        declaration = parsed;
      } catch (error) {
        if (!/^(?:vendor\/[^/]+|src)\/.+\/(?:fixtures?|test-fixtures)\//.test(path))
          throw new Error(`Invalid product manifest ${path}: ${String(error)}`);
        unresolvedManifests.push({ path, sha256: digest(content), parseError: String(error) });
        return [];
      }
      return [
        {
          path,
          name: String(declaration.name ?? path),
          version: String(declaration.version ?? "unversioned"),
          private: declaration.private === true,
        },
      ];
    });
  return {
    sourceSha: tree.sha,
    version: String(root.version ?? "unknown"),
    inputs: paths.map(path => ({ path, sha256: digest(texts.get(path) ?? "") })),
    modules: moduleNames(texts.get("src/resolve_builtins/HardcodedModule.rs") ?? ""),
    scripts: Object.entries(root.scripts ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    packages,
    unresolvedManifests,
    licenses: paths.filter(p => /^(LICENSE|COPYING)/.test(p)),
  };
}

export function renderRootMarkdown(inventory: ReturnType<typeof markdownInventory>) {
  const quote = (s: unknown) =>
    String(s)
      .replace(/[|\r\n]/g, " ")
      .replace(/`/g, "\\`");
  const provenance = `Source: Git commit \`${inventory.sourceSha}\`. Source version: \`${inventory.version}\`.\n\nThese are source declarations; they do not establish published packages, supported platforms, benchmarks or runtime qualification.\n`;
  return new Map([
    [
      "SOURCE-INDEX.md",
      `# Source index\n\n${provenance}\n## Registered modules\n\n${inventory.modules.map(m => `- \`${quote(m)}\``).join("\n")}\n\n## Package manifests\n\n| Name | Version | Manifest | Private |\n| --- | --- | --- | --- |\n${inventory.packages.map(p => `| ${quote(p.name)} | ${quote(p.version)} | ${p.path} | ${p.private} |`).join("\n")}\n\n## Unresolved source fixture manifests\n\nThese source fixtures are retained with their hashes and parse errors; they do not declare qualified packages.\n\n${inventory.unresolvedManifests.map(p => `- ${quote(p.path)}: SHA-256 ${p.sha256}; ${quote(p.parseError)}`).join("\n")}\n\n## Licenses\n\n${inventory.licenses.map(p => `- [${p}](${p})`).join("\n")}\n`,
    ],
    [
      "BUILD-COMMANDS.md",
      `# Declared build commands\n\n${provenance}\nCommands below are copied from package.json, not inferred from filenames. Follow AGENTS.md and CLAUDE.md for build ownership and qualification.\n\n| Script | Command |\n| --- | --- |\n${inventory.scripts.map(([name, command]) => `| ${quote(name)} | \`${quote(command)}\` |`).join("\n")}\n`,
    ],
  ]);
}

export async function generateSourceMarkdown(root: string, ref: string, out: string, check = false) {
  const tree = new GitTree(root, ref);
  const inventory = markdownInventory(tree);
  const rustPaths = tree.list("src/**/*.rs").filter(p => !/(?:^|\/)(?:generated|codegen)(?:\/|\.)/.test(p));
  const comments: CommentCandidate[] = [];
  for (let at = 0; at < rustPaths.length; at += 128) {
    for (const [path, text] of tree.read(rustPaths.slice(at, at + 128)))
      comments.push(...selectRustComments(path, text, tree.sha));
  }
  const files = renderRootMarkdown(inventory);
  files.set(
    "source-markdown.json",
    JSON.stringify(
      {
        schemaVersion: 1,
        inventory,
        coverage: {
          language: "Rust",
          paths: rustPaths.length,
          excluded: "vendor, generated directories, non-Rust source; no semantic or language certainty",
        },
        comments,
      },
      null,
      2,
    ) + "\n",
  );
  if (check) {
    for (const [path, content] of files) {
      const file = Bun.file(join(out, path));
      if (!(await file.exists()) || (await file.text()) !== content)
        throw new Error(`Generated source Markdown drift: ${path}`);
    }
  } else {
    await mkdir(out, { recursive: true });
    for (const [path, content] of files) await Bun.write(join(out, path), content);
  }
  return { sourceSha: tree.sha, files: [...files.keys()], comments: comments.length };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      root: { type: "string", default: resolve(import.meta.dir, "../..") },
      ref: { type: "string", default: "HEAD" },
      out: { type: "string" },
      check: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (!values.out)
    throw new Error("--out staging directory is required; owner policy and source are never rewritten automatically");
  console.log(
    JSON.stringify(await generateSourceMarkdown(resolve(values.root!), values.ref!, resolve(values.out), values.check)),
  );
}
