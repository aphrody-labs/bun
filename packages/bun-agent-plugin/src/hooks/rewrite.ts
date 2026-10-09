// Rewrites shell commands that call another runtime or package manager into the Bun fork's equivalent:
// npm/npx/yarn/pnpm -> bun/bunx, node -> bun, pip/python/uv -> `bun uv`, and `bun test` inside a Bun checkout ->
// `bun bd test`. Pure: no I/O, so the hooks and the tests share it.

export type RewriteOptions = {
  /** The working directory is a checkout of the Bun repository (`bun test` there must be `bun bd test`). */
  bunCheckout?: boolean;
  /** The bun that will run the command is the fork, which carries uv (`bun uv`); upstream Bun has none. */
  fork?: boolean;
};

export type Rewrite = { command: string; changes: string[] };

type Token = { raw: string; value: string; start: number; end: number };
type Segment = { tokens: Token[] };

const SEPARATORS = ["&&", "||", ";;", "|&", ";", "|", "&", "\n", "(", ")"];

/** Splits a command line into simple commands. Quotes, `$(...)` and backquotes stay inside their word. */
function segments(line: string): Segment[] {
  const out: Segment[] = [];
  let tokens: Token[] = [];
  let i = 0;
  const flush = () => {
    if (tokens.length) out.push({ tokens });
    tokens = [];
  };
  while (i < line.length) {
    const c = line[i];
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      while (i < line.length && line[i] !== "\n") i++;
      continue;
    }
    // A heredoc body is data: stop rewriting at its marker.
    if (line.startsWith("<<", i)) break;
    const sep = SEPARATORS.find(s => line.startsWith(s, i));
    if (sep) {
      flush();
      i += sep.length;
      continue;
    }
    const start = i;
    let value = "";
    let depth = 0;
    while (i < line.length) {
      const ch = line[i];
      if (depth === 0 && (/\s/.test(ch) || SEPARATORS.some(s => line.startsWith(s, i)) || line.startsWith("<<", i)))
        break;
      if (ch === "\\" && i + 1 < line.length) {
        value += line[i + 1];
        i += 2;
      } else if (ch === "'") {
        const close = line.indexOf("'", i + 1);
        const stop = close === -1 ? line.length : close;
        value += line.slice(i + 1, stop);
        i = stop + 1;
      } else if (ch === '"') {
        let j = i + 1;
        while (j < line.length && line[j] !== '"') {
          if (line[j] === "\\" && j + 1 < line.length) j++;
          value += line[j];
          j++;
        }
        i = j + 1;
      } else if (ch === "`") {
        const close = line.indexOf("`", i + 1);
        const stop = close === -1 ? line.length : close;
        value += line.slice(i, stop + 1);
        i = stop + 1;
      } else if (ch === "$" && line[i + 1] === "(") {
        depth++;
        value += "$(";
        i += 2;
      } else if (depth > 0 && ch === ")") {
        depth--;
        value += ch;
        i++;
      } else {
        value += ch;
        i++;
      }
    }
    i = Math.min(i, line.length);
    tokens.push({ raw: line.slice(start, i), value, start, end: i });
  }
  flush();
  return out;
}

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const WRAPPERS = new Set(["time", "command", "exec", "nohup", "env"]);

function commandName(value: string): string {
  return value.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
}

/** Replaces `--save-dev` and friends with the flags `bun add` and `bun install` take. */
function installFlags(args: string[]): string[] {
  const out: string[] = [];
  for (const a of args) {
    if (a === "--save-dev" || a === "-D") out.push("--dev");
    else if (a === "--save-optional" || a === "-O") out.push("--optional");
    else if (a === "--save-peer") out.push("--peer");
    else if (a === "--save-exact" || a === "-E") out.push("--exact");
    else if (a === "--save" || a === "-S" || a === "--legacy-peer-deps" || a === "--no-fund" || a === "--no-audit")
      continue;
    else if (a === "--global") out.push("-g");
    else out.push(a);
  }
  return out;
}

/** `bunx` arguments from those of npx / pnpm dlx / yarn dlx: drops the confirmation flags. */
function bunxArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-y" || a === "--yes" || a === "--no-install" || a === "-q" || a === "--quiet") continue;
    if (a === "--") continue;
    if ((a === "-p" || a === "--package") && i + 1 < args.length) {
      out.push(`--package=${args[++i]}`);
      continue;
    }
    out.push(a);
  }
  return out;
}

const NPM_ALIASES: Record<string, (rest: string[]) => string[] | undefined> = {
  install: rest => ["bun", "install", ...installFlags(rest)],
  i: rest => ["bun", "i", ...installFlags(rest)],
  add: rest => ["bun", "add", ...installFlags(rest)],
  ci: rest => ["bun", "install", "--frozen-lockfile", ...installFlags(rest)],
  uninstall: rest => ["bun", "remove", ...rest],
  remove: rest => ["bun", "remove", ...rest],
  rm: rest => ["bun", "remove", ...rest],
  un: rest => ["bun", "remove", ...rest],
  r: rest => ["bun", "remove", ...rest],
  run: rest => ["bun", "run", ...rest.filter(a => a !== "--")],
  "run-script": rest => ["bun", "run", ...rest.filter(a => a !== "--")],
  test: rest => ["bun", "run", "test", ...rest.filter(a => a !== "--")],
  t: rest => ["bun", "run", "test", ...rest.filter(a => a !== "--")],
  start: rest => ["bun", "run", "start", ...rest.filter(a => a !== "--")],
  stop: rest => ["bun", "run", "stop", ...rest.filter(a => a !== "--")],
  restart: rest => ["bun", "run", "restart", ...rest.filter(a => a !== "--")],
  exec: rest => ["bunx", ...bunxArgs(rest)],
  x: rest => ["bunx", ...bunxArgs(rest)],
  update: rest => ["bun", "update", ...rest],
  up: rest => ["bun", "update", ...rest],
  upgrade: rest => ["bun", "update", ...rest],
  outdated: rest => ["bun", "outdated", ...rest],
  audit: rest => ["bun", "audit", ...rest],
  publish: rest => ["bun", "publish", ...rest],
  pack: rest => ["bun", "pm", "pack", ...rest],
  link: rest => ["bun", "link", ...rest],
  unlink: rest => ["bun", "unlink", ...rest],
  why: rest => ["bun", "why", ...rest],
  explain: rest => ["bun", "why", ...rest],
  init: rest => ["bun", "init", ...rest.filter(a => a !== "-y" && a !== "--yes")],
  create: rest => ["bun", "create", ...rest],
  ls: rest => ["bun", "pm", "ls", ...rest],
  list: rest => ["bun", "pm", "ls", ...rest],
  view: rest => ["bun", "pm", "view", ...rest],
  info: rest => ["bun", "pm", "view", ...rest],
  show: rest => ["bun", "pm", "view", ...rest],
  pkg: rest => ["bun", "pm", "pkg", ...rest],
  version: rest => (rest.length ? ["bun", "pm", "version", ...rest] : undefined),
  cache: rest => ["bun", "pm", "cache", ...(rest[0] === "clean" ? ["rm"] : rest)],
};

function npm(args: string[]): string[] | undefined {
  if (args.length === 0) return ["bun", "install"];
  const [sub, ...rest] = args;
  return NPM_ALIASES[sub]?.(rest);
}

function yarn(args: string[]): string[] | undefined {
  if (args.length === 0) return ["bun", "install"];
  const [sub, ...rest] = args;
  if (sub === "global" && rest[0] === "add") return ["bun", "add", "-g", ...installFlags(rest.slice(1))];
  if (sub === "global" && rest[0] === "remove") return ["bun", "remove", "-g", ...rest.slice(1)];
  if (sub === "dlx") return ["bunx", ...bunxArgs(rest)];
  if (sub === "install")
    return ["bun", "install", ...rest.filter(a => a !== "--immutable" && a !== "--frozen-lockfile")];
  if (sub === "add") return ["bun", "add", ...installFlags(rest)];
  if (sub === "remove") return ["bun", "remove", ...rest];
  if (sub === "upgrade" || sub === "up") return ["bun", "update", ...rest];
  if (sub === "run") return ["bun", "run", ...rest];
  if (sub === "exec") return ["bunx", ...rest];
  if (sub === "create") return ["bun", "create", ...rest];
  if (sub === "init") return ["bun", "init", ...rest.filter(a => a !== "-y" && a !== "--yes")];
  if (sub === "why") return ["bun", "why", ...rest];
  if (sub === "outdated") return ["bun", "outdated", ...rest];
  if (sub === "link" || sub === "unlink" || sub === "publish" || sub === "audit") return ["bun", sub, ...rest];
  if (sub.startsWith("-")) return undefined;
  // `yarn <script>` runs a package.json script.
  return ["bun", "run", sub, ...rest];
}

function pnpm(args: string[]): string[] | undefined {
  if (args.length === 0) return ["bun", "install"];
  const [sub, ...rest] = args;
  if (sub === "dlx") return ["bunx", ...bunxArgs(rest)];
  if (sub === "exec") return ["bunx", ...rest];
  if (sub === "install") return ["bun", "install", ...installFlags(rest)];
  if (sub === "i") return ["bun", "i", ...installFlags(rest)];
  if (sub === "add") return ["bun", "add", ...installFlags(rest)];
  if (sub === "remove" || sub === "rm" || sub === "uninstall" || sub === "un") return ["bun", "remove", ...rest];
  if (sub === "update" || sub === "up" || sub === "upgrade") return ["bun", "update", ...rest];
  if (sub === "run") return ["bun", "run", ...rest.filter(a => a !== "--")];
  if (sub === "test" || sub === "t" || sub === "start") return ["bun", "run", sub === "t" ? "test" : sub, ...rest];
  if (sub === "create") return ["bun", "create", ...rest];
  if (sub === "init") return ["bun", "init", ...rest];
  if (["why", "outdated", "link", "unlink", "publish", "audit"].includes(sub)) return ["bun", sub, ...rest];
  if (sub.startsWith("-")) return undefined;
  return ["bun", "run", sub, ...rest];
}

function python(args: string[]): string[] {
  if (args[0] === "-m" && (args[1] === "pip" || args[1] === "pip3")) return ["bun", "uv", "pip", ...args.slice(2)];
  if (args[0] === "-m" && args[1] === "venv") return ["bun", "uv", "venv", ...args.slice(2)];
  return ["bun", "uv", "run", "python", ...args];
}

function bunTest(args: string[], env: string[]): string[] | undefined {
  // `bun test` in a checkout runs the installed bun, which lacks the changes under test. Two exceptions from
  // CLAUDE.md: USE_SYSTEM_BUN=1 (proving a test fails without the change) and the bun-types test (no native code).
  if (env.some(e => e.startsWith("USE_SYSTEM_BUN="))) return undefined;
  if (args.some(a => a.replace(/\\/g, "/").includes("integration/bun-types/"))) return undefined;
  return ["bun", "bd", "test", ...args];
}

function quote(arg: string): string {
  if (arg === "") return "''";
  return /^[\w@%+=:,./\\^~-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** The rewritten command, or undefined when nothing in it needs to change. */
export function rewriteCommand(line: string, options: RewriteOptions = {}): Rewrite | undefined {
  if (/#\s*keep-(node|npm|tool)\b/.test(line)) return undefined;
  const edits: { start: number; end: number; text: string; change: string }[] = [];
  for (const { tokens } of segments(line)) {
    let k = 0;
    const env: string[] = [];
    while (k < tokens.length && ENV_ASSIGNMENT.test(tokens[k].value)) env.push(tokens[k++].value);
    while (k < tokens.length && WRAPPERS.has(tokens[k].value)) {
      k++;
      while (k < tokens.length && ENV_ASSIGNMENT.test(tokens[k].value)) env.push(tokens[k++].value);
    }
    if (k >= tokens.length) continue;
    const head = tokens[k];
    // Only bare names: an explicit path is a deliberate choice of binary.
    if (/[\\/]/.test(head.value)) continue;
    const name = commandName(head.value);
    const argTokens = tokens.slice(k + 1);
    const args = argTokens.map(t => t.value);
    let next: string[] | undefined;
    switch (name) {
      case "npm":
        next = npm(args);
        break;
      case "npx":
      case "pnpx":
        next = ["bunx", ...bunxArgs(args)];
        break;
      case "yarn":
        next = yarn(args);
        break;
      case "pnpm":
        next = pnpm(args);
        break;
      case "node":
      case "nodejs":
        next = ["bun", ...args];
        break;
      case "pip":
      case "pip3":
        if (options.fork === false) break;
        next = ["bun", "uv", "pip", ...args];
        break;
      case "python":
      case "python3":
      case "py":
        if (options.fork === false) break;
        next = python(args);
        break;
      case "uv":
        if (options.fork === false) break;
        next = ["bun", "uv", ...args];
        break;
      case "uvx":
        if (options.fork === false) break;
        next = ["bun", "uv", "tool", "run", ...args];
        break;
      case "bun":
        if (options.bunCheckout && args[0] === "test") next = bunTest(args.slice(1), env);
        break;
    }
    if (!next) continue;
    // Keep the original spelling (quotes, escapes) of every argument that passes through unchanged.
    const rawByValue = new Map(argTokens.map(t => [t.value, t.raw]));
    const text = next.map(a => rawByValue.get(a) ?? quote(a)).join(" ");
    const end = argTokens.length ? argTokens[argTokens.length - 1].end : head.end;
    const before = line.slice(head.start, end);
    if (text === before) continue;
    edits.push({ start: head.start, end, text, change: `${before} -> ${text}` });
  }
  if (edits.length === 0) return undefined;
  let out = line;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { command: out, changes: edits.reverse().map(e => e.change) };
}
