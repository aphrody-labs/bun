// Generates the three plugins (Claude Code, Codex, Antigravity/Gemini CLI) from one source: the repository's
// skills and slash commands, its docs (docs/project/agent-plugin.mdx, docs.json, docs/runtime), its code
// (package.json scripts, the Cargo workspace, test/harness.ts), CLAUDE.md and the memory fiches in memory/.
// Deterministic: same inputs, same bytes. Runs under Bun and Node (the build's codegen may run under either).

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { catalogInputs, lspExtensions, mcpTools } from "./catalog.ts";
import { forbiddenIn, sanitizeText } from "./sanitize.ts";
import {
  AUTHOR,
  COMMAND_ROOTS,
  DERIVED_SKILLS,
  DISPLAY_NAME,
  HOOKS,
  LSP_SERVER,
  MARKETPLACE,
  MCP_SERVER,
  PLUGIN,
  PREFER,
  REPOSITORY,
  SKILL_ROOTS,
} from "./spec.ts";

export type Files = Map<string, string | Uint8Array>;
export type GenerateOptions = {
  /** Repository root (the checkout). */
  root: string;
  /** Package directory (memory/ and src/hooks/); default `<root>/packages/bun-agent-plugin`. */
  pkg?: string;
  /** More skill directories (`<dir>/<name>/SKILL.md`), searched after SKILL_ROOTS. */
  skillDirs?: string[];
};

const TARGETS = ["claude", "codex", "agy"] as const;

// ─── Reading sources ───────────────────────────────────────────────────────

function text(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function maybe(path: string): string | undefined {
  return existsSync(path) ? text(path) : undefined;
}

function sorted(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function walk(dir: string, base = dir, out: string[] = []): string[] {
  for (const name of sorted(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).replace(/\\/g, "/"));
  }
  return out;
}

/** The body of the markdown section titled `title` (any level), without its heading. */
export function section(md: string, title: string): string | undefined {
  const lines = md.split("\n");
  let inFence = false;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (!m) continue;
    if (start === -1) {
      if (m[2] === title) {
        start = i + 1;
        level = m[1]!.length;
      }
    } else if (m[1]!.length <= level) {
      return lines.slice(start, i).join("\n").trim();
    }
  }
  return start === -1 ? undefined : lines.slice(start).join("\n").trim();
}

/** Front matter fields of a markdown file (flat `key: value` lines only). */
export function frontMatter(md: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1]!.split("\n")) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2]!.trim();
    if (/^".*"$/.test(v)) {
      try {
        v = JSON.parse(v);
      } catch {
        v = v.slice(1, -1);
      }
    } else if (/^'.*'$/.test(v)) v = v.slice(1, -1).replace(/''/g, "'");
    out[kv[1]!] = v;
  }
  return out;
}

function stripFrontMatter(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

/** MDX to markdown: drops JSX-only lines (`<CodeGroup>`, `<Note>`...). */
function mdx(md: string): string {
  return md
    .split("\n")
    .filter(l => !/^\s*<\/?[A-Z][\w.]*[^>]*>\s*$/.test(l))
    .join("\n");
}

type Skill = { name: string; files: Map<string, string | Uint8Array>; source: string };

const TEXT = /\.(md|mdx|txt|json|ts|js|mjs|toml|ya?ml|sh|ps1|py|rs)$/i;

function readSkillDir(dir: string): Map<string, string | Uint8Array> {
  const files = new Map<string, string | Uint8Array>();
  for (const rel of walk(dir)) {
    const p = join(dir, rel);
    files.set(rel, TEXT.test(rel) ? sanitizeText(text(p), { drop: false }) : new Uint8Array(readFileSync(p)));
  }
  return files;
}

function yamlString(s: string): string {
  return JSON.stringify(s.replace(/\s+/g, " ").trim());
}

/** Skills and slash commands of the repository, plus any extra directory. */
export function repoSkills(root: string, extra: string[] = []): Skill[] {
  const out = new Map<string, Skill>();
  for (const base of [...SKILL_ROOTS.map(d => join(root, d)), ...extra]) {
    for (const name of sorted(base)) {
      const dir = join(base, name);
      if (out.has(name) || !statSync(dir).isDirectory() || !existsSync(join(dir, "SKILL.md"))) continue;
      out.set(name, { name, files: readSkillDir(dir), source: relative(root, dir).replace(/\\/g, "/") });
    }
  }
  for (const base of COMMAND_ROOTS.map(d => join(root, d))) {
    for (const file of sorted(base)) {
      if (!file.endsWith(".md")) continue;
      const name = file.slice(0, -3);
      // `.agents/skills/source-command-<name>` is the same command already converted to a skill.
      if (out.has(name) || out.has(`source-command-${name}`)) continue;
      const md = text(join(base, file));
      const fm = frontMatter(md);
      const description =
        fm.description ??
        stripFrontMatter(md)
          .split("\n")
          .find(l => l.trim()) ??
        name;
      const body = sanitizeText(stripFrontMatter(md), { drop: false });
      const skill = `---\nname: ${name}\ndescription: ${yamlString(description)}\n---\n\n${body.trim()}\n`;
      out.set(name, {
        name,
        files: new Map([["SKILL.md", skill]]),
        source: relative(root, join(base, file)).replace(/\\/g, "/"),
      });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

type Fiche = { name: string; description: string; text: string };

export function memoryFiches(pkg: string): Fiche[] {
  const dir = join(pkg, "memory");
  return sorted(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const md = text(join(dir, f));
      return { name: f.slice(0, -3), description: frontMatter(md).description ?? "", text: md };
    });
}

function packageScripts(root: string): [string, string][] {
  const pkg = JSON.parse(text(join(root, "package.json")));
  return Object.entries(pkg.scripts ?? {}).map(([k, v]) => [k, String(v)] as [string, string]);
}

function crates(root: string): { name: string; path: string; doc: string }[] {
  const cargo = text(join(root, "Cargo.toml"));
  const members = /\bmembers\s*=\s*\[([\s\S]*?)\]/.exec(cargo)?.[1] ?? "";
  const out: { name: string; path: string; doc: string }[] = [];
  for (const m of members.matchAll(/"([^"]+)"/g)) {
    const path = m[1]!;
    const manifest = maybe(join(root, path, "Cargo.toml"));
    if (!manifest) continue;
    const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(manifest)?.[1] ?? path;
    const description = /^\s*description\s*=\s*"([^"]+)"/m.exec(manifest)?.[1];
    const libPath = /\[lib\][^[]*?\bpath\s*=\s*"([^"]+)"/.exec(manifest)?.[1];
    const lib = [libPath, "lib.rs", "src/lib.rs", "main.rs", "src/main.rs"]
      .filter((p): p is string => !!p)
      .map(p => join(root, path, p))
      .find(p => existsSync(p));
    let doc = description ?? "";
    if (!doc && lib) {
      const docLines: string[] = [];
      for (const line of text(lib).split("\n")) {
        const d = /^\s*\/\/!\s?(.*)$/.exec(line);
        if (d) {
          if (!d[1]!.trim()) {
            if (docLines.length) break;
            continue;
          }
          docLines.push(d[1]!.trim());
        } else if (docLines.length || !/^\s*(#!?\[|$|\/\/)/.test(line)) break;
      }
      doc = docLines.join(" ");
    }
    out.push({ name, path, doc: sanitizeText(doc.replace(/\|/g, "\\|"), { drop: false }).slice(0, 220) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function harnessExports(root: string): string[] {
  const src = maybe(join(root, "test", "harness.ts")) ?? "";
  const names = new Set<string>();
  for (const m of src.matchAll(
    /^export\s+(?:async\s+)?(?:function\*?|const|let|class|enum|type|interface)\s+([\w$]+)/gm,
  ))
    names.add(m[1]!);
  return [...names].sort();
}

type DocPage = { group: string; page: string; title: string; description: string };

function docPages(root: string): DocPage[] {
  const config = maybe(join(root, "docs", "docs.json"));
  if (!config) return [];
  const out: DocPage[] = [];
  const visit = (node: any, group: string) => {
    if (typeof node === "string") {
      const file = ["mdx", "md"].map(ext => join(root, "docs", `${node.replace(/^\//, "")}.${ext}`)).find(existsSync);
      const fm = file ? frontMatter(text(file)) : {};
      out.push({ group, page: node, title: fm.title ?? node, description: fm.description ?? "" });
      return;
    }
    if (Array.isArray(node)) return node.forEach(n => visit(n, group));
    if (node && typeof node === "object") {
      const g = node.group ?? node.tab ?? group;
      for (const key of ["tabs", "groups", "pages"]) if (node[key]) visit(node[key], g);
    }
  };
  visit(JSON.parse(config).navigation, "");
  return out;
}

/** The rules every agent gets: the "Agent rules" section of docs/project/agent-plugin.mdx. */
function agentRules(root: string): string {
  const page = maybe(join(root, "docs", "project", "agent-plugin.mdx"));
  const rules = page && section(mdx(page), "Agent rules");
  if (!rules) throw new Error("docs/project/agent-plugin.mdx has no '## Agent rules' section");
  return rules;
}

function hasCommand(root: string, name: string): boolean {
  const cli = join(root, "src", "runtime", "cli");
  if (existsSync(join(cli, `${name}_command.rs`)) || existsSync(join(cli, name))) return true;
  const mod = maybe(join(cli, "mod.rs")) ?? "";
  return mod.includes(`b"${name}"`);
}

// ─── Writing targets ───────────────────────────────────────────────────────

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function table(rows: string[][], head: string[]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map(r => `| ${r.map(esc).join(" | ")} |`),
  ].join("\n");
}

function skillDoc(name: string, description: string, body: string[]): string {
  return `---\nname: ${name}\ndescription: ${yamlString(description)}\n---\n\n${body.filter(Boolean).join("\n\n").trim()}\n`;
}

function referencesList(fiches: Fiche[]): string {
  if (!fiches.length) return "";
  return [
    "## References",
    "",
    "Read the one that matches the task (`references/<name>.md`):",
    "",
    ...fiches.map(f => `- [${f.name}](references/${f.name}.md): ${f.description.replace(/\s+/g, " ")}`),
  ].join("\n");
}

function derivedSkills(root: string, fiches: Fiche[], repo: Skill[]): Skill[] {
  const shipped = new Set(fiches.map(f => f.name));
  const groups = new Map<string, Fiche[]>(DERIVED_SKILLS.map(d => [d.name, []]));
  for (const f of fiches) {
    const owner = DERIVED_SKILLS.find(d => d.fiches.some(r => r.test(f.name)))!;
    groups.get(owner.name)!.push(f);
  }
  const claude = text(join(root, "CLAUDE.md"));
  const rules = agentRules(root);
  const out: Skill[] = [];
  const make = (name: string, description: string, body: string[], extra: [string, string][] = []) => {
    const files = new Map<string, string | Uint8Array>([["SKILL.md", skillDoc(name, description, body)]]);
    for (const f of groups.get(name) ?? [])
      files.set(`references/${f.name}.md`, sanitizeText(f.text, { shipped: n => shipped.has(n) }).trimEnd() + "\n");
    for (const [rel, content] of extra) files.set(rel, sanitizeText(content, { drop: false }).trimEnd() + "\n");
    out.push({ name, files, source: "generated" });
  };

  const scripts = packageScripts(root);
  make(
    "bun-build",
    `Build, run and lint the Aphrody runtime (aphrody-labs/bun) from a checkout: \`bun bd\`, the ${scripts.length} package.json scripts (${scripts
      .slice(0, 8)
      .map(([k]) => k)
      .join(", ")}, ...), build profiles, Windows/Linux toolchains, codegen and vendored dependencies.`,
    [
      "# Building the Aphrody runtime",
      section(claude, "Building and Running Bun") ?? "",
      "## package.json scripts",
      table(
        scripts.map(([k, v]) => [`\`bun run ${k}\``, `\`${v}\``]),
        ["Script", "Runs"],
      ),
      section(text(join(root, "scripts", "build", "CLAUDE.md")), "Gotchas")
        ? "See also `scripts/build/CLAUDE.md` (build system internals and gotchas)."
        : "",
      referencesList(groups.get("bun-build")!),
    ],
  );

  const harness = harnessExports(root);
  const testGuide = maybe(join(root, "test", "CLAUDE.md"));
  make(
    "bun-tests",
    "Write and run tests in the Aphrody runtime (aphrody-labs/bun): `bun bd test <file>`, where a test goes (test/js, test/cli, test/bundler, regression), the harness (bunExe, bunEnv, tempDir, normalizeBunSnapshot...), CI runner and review rules.",
    [
      "# Testing the Aphrody runtime",
      section(claude, "Testing") ?? "",
      harness.length ? `## Exports of test/harness.ts\n\n${harness.map(n => `\`${n}\``).join(", ")}` : "",
      testGuide
        ? "The full test guide of the repository is in [references/test-guide.md](references/test-guide.md)."
        : "",
      referencesList(groups.get("bun-tests")!),
    ],
    testGuide ? [["references/test-guide.md", testGuide]] : [],
  );

  const ws = crates(root);
  const srcGuide = maybe(join(root, "src", "CLAUDE.md"));
  make(
    "bun-crates",
    `Navigate the Rust side of the Aphrody runtime (aphrody-labs/bun): the ${ws.length} crates of the Cargo workspace (bun_core, bun_sys, bun_jsc, bun_runtime, js_parser, bundler, install...), Rust idioms, JSC bindings, GC lifetimes, event loop, parser, printer, resolver, bundler and CSS.`,
    [
      "# The crates of the Aphrody runtime",
      section(claude, "Code Architecture") ?? "",
      "## Workspace members",
      table(
        ws.map(c => [`\`${c.name}\``, `\`${c.path}\``, c.doc]),
        ["Crate", "Path", "What"],
      ),
      srcGuide ? "Rules for Rust in `src/`: [references/src-guide.md](references/src-guide.md)." : "",
      referencesList(groups.get("bun-crates")!),
    ],
    srcGuide ? [["references/src-guide.md", srcGuide]] : [],
  );

  const pages = docPages(root);
  const runtimePages = pages.filter(p => p.page.startsWith("/runtime/"));
  make(
    "bun-runtime",
    "How the Aphrody runtime works and is documented: Bun APIs, CLI commands, built-in JS modules, node:* compatibility, Bun.serve, fetch and streams, HTTP/SQL/Valkey, the shell, the test runner and the package manager (bun install, lockfile, linkers).",
    [
      "# The Bun runtime",
      "## Runtime documentation pages (docs/)",
      table(
        runtimePages.map(p => [p.title, `\`docs${p.page}.mdx\``, p.description]),
        ["Page", "File", "About"],
      ),
      referencesList(groups.get("bun-runtime")!),
    ],
  );

  const groupsOfDocs = [...new Set(pages.map(p => p.group))];
  make(
    "bun-docs",
    `Find the right page of the Aphrody runtime's documentation (docs/, ${pages.length} pages: runtime, bundler, package manager, test runner, guides, project) and the packages in packages/.`,
    [
      "# The documentation of the Aphrody runtime",
      "`docs/docs.json` is the navigation; each page is `docs/<path>.mdx`.",
      ...groupsOfDocs.map(g =>
        [
          `## ${g || "Pages"}`,
          ...pages
            .filter(p => p.group === g)
            .map(p => `- \`docs${p.page}.mdx\`: ${p.title}${p.description ? ` (${p.description})` : ""}`),
        ].join("\n"),
      ),
      referencesList(groups.get("bun-docs")!),
    ],
  );

  const all = [...repo.map(s => s.name), ...DERIVED_SKILLS.map(d => d.name)].sort();
  make(
    "bun-aphrody",
    "Start here for any work with Bun: use the Aphrody runtime (aphrody-labs/bun) for everything (bun, bunx, bun uv instead of node, npm, npx, yarn, pnpm, pip, python), install and upgrade it, and pick the skill or memory fiche for the task.",
    [
      "# Working with the Aphrody runtime",
      rules,
      "## Skills of this plugin",
      all.map(n => `- \`${n}\``).join("\n"),
      referencesList(groups.get("bun-aphrody")!),
    ],
  );
  return out;
}

// ─── Assembling ────────────────────────────────────────────────────────────

export function bunVersion(root: string): string {
  return JSON.parse(text(join(root, "package.json"))).version;
}

function hashOf(files: Files): string {
  const h = createHash("sha256");
  for (const k of [...files.keys()].sort()) {
    h.update(k);
    h.update("\0");
    h.update(files.get(k)!);
    h.update("\0");
  }
  return h.digest("hex");
}

export function generate(options: GenerateOptions): Files {
  const root = options.root;
  const pkg = options.pkg ?? join(root, "packages", "bun-agent-plugin");
  const fiches = memoryFiches(pkg);
  const repo = repoSkills(root, options.skillDirs);
  const derived = derivedSkills(root, fiches, repo);
  const skills = [...repo, ...derived.filter(d => !repo.some(r => r.name === d.name))].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const version = bunVersion(root);
  const rules = agentRules(root);
  const lspExt = hasCommand(root, "lsp") ? lspExtensions(root) : {};
  const lsp = Object.keys(lspExt).length > 0;
  const tools = mcpTools(root);
  const has = new Set(tools.map(t => t.name));
  const prefer = PREFER.map(p => ({ ...p, use: p.use.filter(n => has.has(n)) })).filter(p => p.use.length);
  const code = (s: string) => "`" + s + "`";
  const toolsDoc = [
    `## Tools of ${code("bun mcp")}`,
    tools.length
      ? table(
          tools.map(t => [code(t.name), t.title]),
          ["Tool", "What"],
        )
      : `This checkout has no ${code("bun mcp")} tools.`,
    ...prefer.map(p => `Prefer ${p.use.map(code).join(", ")} over ${p.instead} for code in a project.`),
    lsp
      ? `${code("bun lsp")} is one language server for ${[...new Set(Object.values(lspExt))].join(", ")} (${Object.keys(lspExt).join(" ")}).`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const entry = skills.find(s => s.name === "bun-aphrody");
  if (entry) entry.files.set("SKILL.md", String(entry.files.get("SKILL.md")).trimEnd() + "\n\n" + toolsDoc + "\n");
  const description =
    "The Aphrody runtime (aphrody-labs/bun) for coding agents: its MCP server (bun mcp), hooks that run bun, bunx and bun uv " +
    "instead of node, npm, npx, yarn, pnpm, pip and python, and skills for building, testing and navigating Bun.";
  const keywords = ["bun", "aphrody", "mcp", "runtime", "package-manager", "rust", "skills", "hooks"];
  const skillIndex = skills
    .map(s => {
      const fm = frontMatter(String(s.files.get("SKILL.md")));
      return `- \`${s.name}\`: ${(fm.description ?? "").replace(/\s+/g, " ")}`;
    })
    .join("\n");
  const instructions = `# Bun (Aphrody runtime)\n\n${rules}\n\n${toolsDoc}\n\n## Skills\n\n${skillIndex}\n`;
  const context = rules;

  // Content shared by every target, before the version stamp.
  const common: Files = new Map();
  for (const s of skills) for (const [rel, content] of s.files) common.set(`skills/${s.name}/${rel}`, content);
  for (const h of HOOKS) common.set(`hooks/${h}`, text(join(pkg, "src", "hooks", h)));
  common.set("hooks/context.md", context.trimEnd() + "\n");
  common.set(
    "hooks/tools.json",
    json({
      server: MCP_SERVER.name,
      plugin: PLUGIN,
      tools: tools.map(t => t.name),
      prefer: prefer.map(({ instead, bash, use }) => ({ instead, bash, use })),
    }),
  );
  const hash = hashOf(
    new Map([...common, ["instructions", instructions], ["lsp", JSON.stringify(lspExt)], ["v", version]]),
  );
  const pluginVersion = `${version}+${hash.slice(0, 12)}`;
  const meta = json({ name: PLUGIN, version: pluginVersion, bunVersion: version, hash });

  const files: Files = new Map();
  const hook = (script: string, t: string, root: string) =>
    `bun --no-install --no-env-file "${root}/hooks/${script}.ts" ${t}`;
  for (const t of TARGETS) {
    for (const [rel, content] of common) files.set(`${t}/${rel}`, content);
    files.set(`${t}/meta.json`, meta);
  }

  // Claude Code
  const claudeHooks = (t: "claude" | "codex", rootVar: string) => ({
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume|clear|compact",
          hooks: [{ type: "command", command: hook("session-start", t, rootVar), timeout: 10 }],
        },
      ],
      PreToolUse: [
        {
          matcher: t === "claude" && prefer.length ? ["Bash", ...prefer.map(p => p.instead)].join("|") : "Bash",
          hooks: [{ type: "command", command: hook("pre-tool-use", t, rootVar), timeout: 5 }],
        },
      ],
      PostToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: hook("post-tool-use", t, rootVar), timeout: 5 }],
        },
      ],
    },
  });
  const mcp = {
    mcpServers: { [MCP_SERVER.name]: { type: "stdio", command: MCP_SERVER.command, args: MCP_SERVER.args } },
  };
  files.set(
    "claude/.claude-plugin/plugin.json",
    json({
      $schema: "https://json.schemastore.org/claude-code-plugin-manifest.json",
      name: PLUGIN,
      version: pluginVersion,
      description,
      author: AUTHOR,
      homepage: REPOSITORY,
      repository: REPOSITORY,
      license: "MIT",
      keywords,
      ...(lsp
        ? {
            lspServers: {
              [LSP_SERVER.name]: { command: LSP_SERVER.command, args: LSP_SERVER.args, extensionToLanguage: lspExt },
            },
          }
        : {}),
    }),
  );
  files.set("claude/.mcp.json", json(mcp));
  files.set("claude/hooks/hooks.json", json(claudeHooks("claude", "${CLAUDE_PLUGIN_ROOT}")));
  files.set(
    ".claude-plugin/marketplace.json",
    json({
      name: MARKETPLACE,
      owner: AUTHOR,
      metadata: {
        description: "The Aphrody runtime (aphrody-labs/bun) as a coding-agent plugin",
        version: pluginVersion,
      },
      plugins: [{ name: PLUGIN, source: "./claude", version: pluginVersion, description, category: "development" }],
    }),
  );

  // Codex
  files.set(
    "codex/.codex-plugin/plugin.json",
    json({
      name: PLUGIN,
      version: pluginVersion,
      description,
      author: AUTHOR,
      homepage: REPOSITORY,
      repository: REPOSITORY,
      license: "MIT",
      keywords,
      interface: {
        displayName: DISPLAY_NAME,
        shortDescription: "Aphrody: MCP, hooks, skills",
        developerName: AUTHOR.name,
        category: "Developer Tools",
      },
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      hooks: "./hooks/hooks.json",
    }),
  );
  files.set("codex/.mcp.json", json(mcp));
  files.set("codex/hooks/hooks.json", json(claudeHooks("codex", "${PLUGIN_ROOT}")));
  files.set("codex/AGENTS.md", instructions);
  files.set(
    "codex/config.toml",
    [
      "# The bun MCP server for ~/.codex/config.toml, for use without the plugin.",
      `[mcp_servers.${MCP_SERVER.name}]`,
      `command = ${JSON.stringify(MCP_SERVER.command)}`,
      `args = ${JSON.stringify(MCP_SERVER.args)}`,
      "startup_timeout_sec = 30",
      "",
    ].join("\n"),
  );
  files.set(
    ".agents/plugins/marketplace.json",
    json({
      name: MARKETPLACE,
      interface: { displayName: "aphrody-labs/bun" },
      plugins: [
        {
          name: PLUGIN,
          source: { source: "local", path: "./codex" },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Developer Tools",
        },
      ],
    }),
  );

  // Antigravity (agy) plugin, which is also a Gemini CLI extension.
  files.set(
    "agy/plugin.json",
    json({
      name: PLUGIN,
      displayName: DISPLAY_NAME,
      description,
      version: pluginVersion,
      suggestedPrompts: [
        "Build this Bun checkout and run the tests of the file I am changing",
        "Migrate this project's npm and node commands to the Aphrody runtime",
        "Which Bun crate implements this API?",
      ],
    }),
  );
  files.set(
    "agy/mcp_config.json",
    json({ mcpServers: { [MCP_SERVER.name]: { command: MCP_SERVER.command, args: MCP_SERVER.args } } }),
  );
  const agyHook = (script: string) => ({
    type: "command",
    command: `bun --no-install --no-env-file hooks/${script}.ts agy`,
    timeout: 10,
  });
  files.set(
    "agy/hooks.json",
    json({
      [`${PLUGIN}-session`]: { PreInvocation: [agyHook("session-start")] },
      [`${PLUGIN}-commands`]: {
        PreToolUse: [{ matcher: "run_command", hooks: [agyHook("pre-tool-use")] }],
        PostToolUse: [{ matcher: "run_command", hooks: [agyHook("post-tool-use")] }],
      },
    }),
  );
  files.set("agy/rules/AGENTS.md", instructions);
  files.set("agy/GEMINI.md", instructions);
  files.set(
    "agy/gemini-extension.json",
    json({
      name: PLUGIN,
      version: pluginVersion,
      description,
      contextFileName: "GEMINI.md",
      mcpServers: { [MCP_SERVER.name]: { command: MCP_SERVER.command, args: MCP_SERVER.args } },
    }),
  );

  for (const [path, content] of files) {
    if (typeof content !== "string") continue;
    const bad = forbiddenIn(content);
    if (bad) throw new Error(`${path}: forbidden content (${bad})`);
  }
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Every file `generate` reads, for the build's dependency tracking. */
export function inputFiles(root: string, pkg = join(root, "packages", "bun-agent-plugin")): string[] {
  const out = new Set<string>();
  const add = (p: string) => existsSync(p) && out.add(p);
  for (const base of SKILL_ROOTS) {
    const dir = join(root, base);
    for (const name of sorted(dir))
      if (statSync(join(dir, name)).isDirectory()) for (const f of walk(join(dir, name))) add(join(dir, name, f));
  }
  for (const base of COMMAND_ROOTS) for (const f of sorted(join(root, base))) add(join(root, base, f));
  for (const f of sorted(join(pkg, "memory"))) add(join(pkg, "memory", f));
  for (const f of sorted(join(pkg, "src"))) if (f.endsWith(".ts")) add(join(pkg, "src", f));
  for (const h of HOOKS) add(join(pkg, "src", "hooks", h));
  for (const f of ["package.json", "README.md", "bin/bun-agent-plugin.ts"]) add(join(pkg, f));
  for (const f of [
    "CLAUDE.md",
    "package.json",
    "Cargo.toml",
    "test/harness.ts",
    "test/CLAUDE.md",
    "src/CLAUDE.md",
    "scripts/build/CLAUDE.md",
    "docs/docs.json",
    "docs/project/agent-plugin.mdx",
    "src/runtime/cli/mod.rs",
  ])
    add(join(root, f));
  for (const f of walk(join(root, "docs"))) if (/\.mdx?$/.test(f)) add(join(root, "docs", f));
  for (const f of catalogInputs(root)) add(f);
  return [...out].sort();
}
