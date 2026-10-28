// The bun-native rules every agent gets: Bun APIs before Node.js modules and npm packages. PAIRS is one Node.js /
// npm snippet and its Bun-native equivalent per common task; the generator turns it, with the n2b registry
// (src/migrate/registry/data/packages.toml), into the `bun-native` skill and the data of the
// user-prompt-submit hook. scripts/aphrody/dataset/build.ts ships the pairs in the bun-native dataset and
// typechecks their `after` side against packages/bun-types. Runs under Bun and Node.

export type Pair = {
  task: string;
  instead: string[];
  use: string;
  before: string;
  after: string;
};

export const PAIRS: Pair[] = [
  {
    task: "HTTP server with JSON routes",
    instead: ["express", "fastify", "koa", "node:http"],
    use: "Bun.serve({ routes })",
    before: `import express from "express";
const app = express();
app.use(express.json());
app.get("/users/:id", (req, res) => res.json({ id: req.params.id }));
app.post("/users", (req, res) => res.status(201).json(req.body));
app.listen(3000);`,
    after: `const server = Bun.serve({
  port: 3000,
  routes: {
    "/users/:id": req => Response.json({ id: req.params.id }),
    "/users": {
      POST: async req => Response.json(await req.json(), { status: 201 }),
    },
  },
  fetch: () => new Response("Not found", { status: 404 }),
});
console.log(\`listening on \${server.url}\`);`,
  },
  {
    task: "WebSocket server",
    instead: ["ws", "socket.io", "uWebSockets.js"],
    use: "Bun.serve({ websocket })",
    before: `import { WebSocketServer } from "ws";
const wss = new WebSocketServer({ port: 8080 });
wss.on("connection", ws => ws.on("message", data => ws.send(data)));`,
    after: `Bun.serve({
  port: 8080,
  fetch(req, server) {
    if (server.upgrade(req)) return;
    return new Response("Upgrade failed", { status: 400 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("chat");
    },
    message(ws, message) {
      ws.publish("chat", message);
    },
  },
});`,
  },
  {
    task: "Read and write files",
    instead: ["fs.readFile", "fs.writeFile", "fs-extra"],
    use: "Bun.file / Bun.write",
    before: `import { readFile, writeFile } from "node:fs/promises";
const text = await readFile("input.txt", "utf8");
const config = JSON.parse(await readFile("config.json", "utf8"));
await writeFile("output.txt", text.toUpperCase());`,
    after: `const text = await Bun.file("input.txt").text();
const config = await Bun.file("config.json").json();
await Bun.write("output.txt", text.toUpperCase());
console.log(config, await Bun.file("output.txt").exists());`,
  },
  {
    task: "SQLite database",
    instead: ["better-sqlite3", "sqlite3", "sqlite"],
    use: "bun:sqlite",
    before: `import Database from "better-sqlite3";
const db = new Database("app.db");
db.prepare("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)").run();
const user = db.prepare("SELECT * FROM users WHERE id = ?").get(1);`,
    after: `import { Database } from "bun:sqlite";
const db = new Database("app.db", { strict: true });
db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)");
db.query("INSERT INTO users (name) VALUES ($name)").run({ name: "Ada" });
const user = db.query<{ id: number; name: string }, [number]>("SELECT * FROM users WHERE id = ?").get(1);
console.log(user);`,
  },
  {
    task: "PostgreSQL queries",
    instead: ["pg", "postgres", "mysql2"],
    use: "Bun.sql / Bun.SQL",
    before: `import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [1]);`,
    after: `import { sql, SQL } from "bun";
const rows = await sql\`SELECT * FROM users WHERE id = \${1}\`;
const mysql = new SQL("mysql://user:pass@localhost:3306/app");
const [one] = await mysql\`SELECT 1 AS x\`;
console.log(rows, one);`,
  },
  {
    task: "Redis client",
    instead: ["ioredis", "redis"],
    use: "Bun.redis / Bun.RedisClient",
    before: `import Redis from "ioredis";
const redis = new Redis(process.env.REDIS_URL);
await redis.set("key", "value");
const value = await redis.get("key");`,
    after: `import { redis, RedisClient } from "bun";
await redis.set("key", "value");
const value = await redis.get("key");
const other = new RedisClient("redis://localhost:6379");
await other.incr("visits");
console.log(value);`,
  },
  {
    task: "S3 / R2 object storage",
    instead: ["@aws-sdk/client-s3", "aws-sdk", "minio"],
    use: "Bun.s3 / Bun.S3Client",
    before: `import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
const s3 = new S3Client({ region: "auto" });
await s3.send(new PutObjectCommand({ Bucket: "b", Key: "k.txt", Body: "hi" }));`,
    after: `import { S3Client } from "bun";
const s3 = new S3Client({ bucket: "b", endpoint: "https://<account>.r2.cloudflarestorage.com" });
await s3.write("k.txt", "hi");
const text = await s3.file("k.txt").text();
const url = s3.presign("k.txt", { expiresIn: 3600 });
console.log(text, url);`,
  },
  {
    task: "Run a shell command",
    instead: ["execa", "shelljs", "child_process.exec"],
    use: "Bun.$ (Bun Shell)",
    before: `import { execSync } from "node:child_process";
const branch = execSync("git branch --show-current").toString().trim();`,
    after: `import { $ } from "bun";
const branch = (await $\`git branch --show-current\`.text()).trim();
await $\`ls -la \${"some dir"}\`.quiet();
const { exitCode } = await $\`false\`.nothrow();
console.log(branch, exitCode);`,
  },
  {
    task: "Spawn a subprocess",
    instead: ["child_process.spawn", "cross-spawn"],
    use: "Bun.spawn / Bun.spawnSync",
    before: `import { spawn } from "node:child_process";
const child = spawn("node", ["--version"]);
child.stdout.on("data", d => console.log(String(d)));`,
    after: `const proc = Bun.spawn(["bun", "--version"], { stdout: "pipe", stderr: "pipe" });
const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
const sync = Bun.spawnSync(["git", "status"]);
console.log(stdout, exitCode, sync.success);`,
  },
  {
    task: "Unit tests",
    instead: ["jest", "vitest", "mocha", "chai", "ts-jest"],
    use: "bun:test",
    before: `import { describe, it, expect, vi } from "vitest";
describe("sum", () => {
  it("adds", () => expect(1 + 1).toBe(2));
});`,
    after: `import { describe, test, expect, mock, beforeEach } from "bun:test";
const fn = mock((x: number) => x * 2);
beforeEach(() => fn.mockClear());
describe("sum", () => {
  test("adds", () => {
    expect(1 + 1).toBe(2);
    expect(fn(2)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});`,
  },
  {
    task: "Hash passwords",
    instead: ["bcrypt", "bcryptjs", "argon2"],
    use: "Bun.password",
    before: `import bcrypt from "bcrypt";
const hash = await bcrypt.hash("secret", 10);
const ok = await bcrypt.compare("secret", hash);`,
    after: `const hash = await Bun.password.hash("secret", { algorithm: "argon2id" });
const ok = await Bun.password.verify("secret", hash);
console.log(ok);`,
  },
  {
    task: "Hash data",
    instead: ["crypto.createHash", "xxhash", "murmurhash"],
    use: "Bun.CryptoHasher / Bun.hash",
    before: `import { createHash } from "node:crypto";
const hex = createHash("sha256").update("data").digest("hex");`,
    after: `const hex = new Bun.CryptoHasher("sha256").update("data").digest("hex");
const fast = Bun.hash("data");
const xx = Bun.hash.xxHash3("data");
console.log(hex, fast, xx);`,
  },
  {
    task: "Glob files",
    instead: ["glob", "fast-glob", "globby", "minimatch"],
    use: "Bun.Glob",
    before: `import fg from "fast-glob";
const files = await fg("src/**/*.ts");`,
    after: `const glob = new Bun.Glob("src/**/*.ts");
const files: string[] = [];
for await (const file of glob.scan(".")) files.push(file);
console.log(files, glob.match("src/index.ts"));`,
  },
  {
    task: "Environment variables",
    instead: ["dotenv", "dotenv/config", "cross-env"],
    use: "Bun.env (.env loaded automatically)",
    before: `import "dotenv/config";
const port = process.env.PORT ?? "3000";`,
    after: `// .env, .env.local and .env.<NODE_ENV> are loaded by Bun before the script runs.
const port = Bun.env.PORT ?? "3000";
console.log(port);`,
  },
  {
    task: "HTTP requests",
    instead: ["node-fetch", "axios", "got", "cross-fetch", "undici"],
    use: "global fetch",
    before: `import fetch from "node-fetch";
const res = await fetch("https://example.com/api");
const data = await res.json();`,
    after: `const res = await fetch("https://example.com/api", {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(5000),
});
if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
const data = await res.json();
console.log(data);`,
  },
  {
    task: "Bundle for production",
    instead: ["esbuild", "webpack", "rollup", "parcel", "tsup"],
    use: "Bun.build / bun build",
    before: `import { build } from "esbuild";
await build({ entryPoints: ["src/index.ts"], bundle: true, outdir: "dist", minify: true });`,
    after: `const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  minify: true,
  sourcemap: "linked",
});
if (!result.success) for (const log of result.logs) console.error(log);`,
  },
  {
    task: "Run TypeScript directly",
    instead: ["ts-node", "tsx", "nodemon", "node --watch"],
    use: "bun <file>.ts / bun --watch",
    before: `// package.json
// "dev": "nodemon --exec ts-node src/index.ts"`,
    after: `// package.json: "dev": "bun --watch src/index.ts", "start": "bun src/index.ts"
console.log(import.meta.path, import.meta.dir, import.meta.main);`,
  },
  {
    task: "UUIDs",
    instead: ["uuid", "nanoid"],
    use: "crypto.randomUUID / Bun.randomUUIDv7",
    before: `import { v4 as uuidv4 } from "uuid";
const id = uuidv4();`,
    after: `const id = crypto.randomUUID();
const sortable = Bun.randomUUIDv7();
console.log(id, sortable);`,
  },
  {
    task: "Parse YAML and TOML",
    instead: ["js-yaml", "yaml", "@iarna/toml", "toml", "jsonc-parser", "json5"],
    use: "Bun.YAML / Bun.TOML / Bun.JSONC / Bun.JSON5 (or import the file)",
    before: `import yaml from "js-yaml";
import fs from "node:fs";
const config = yaml.load(fs.readFileSync("config.yaml", "utf8"));`,
    after: `const config = Bun.YAML.parse(await Bun.file("config.yaml").text());
const cargo = Bun.TOML.parse(await Bun.file("Cargo.toml").text());
const tsconfig = Bun.JSONC.parse(await Bun.file("tsconfig.json").text());
console.log(config, cargo, tsconfig);`,
  },
  {
    task: "Compare semver versions",
    instead: ["semver"],
    use: "Bun.semver",
    before: `import semver from "semver";
semver.satisfies("1.2.3", "^1.0.0");`,
    after: `const ok = Bun.semver.satisfies("1.2.3", "^1.0.0");
const order = Bun.semver.order("1.2.3", "1.10.0");
console.log(ok, order);`,
  },
  {
    task: "Compression",
    instead: ["zlib.gzipSync", "pako", "node-gzip"],
    use: "Bun.gzipSync / Bun.zstdCompress",
    before: `import { gzipSync, gunzipSync } from "node:zlib";
const packed = gzipSync(Buffer.from("hello"));`,
    after: `const packed = Bun.gzipSync("hello");
const text = new TextDecoder().decode(Bun.gunzipSync(packed));
const zstd = await Bun.zstdCompress("hello");
console.log(text, zstd.byteLength);`,
  },
  {
    task: "HTML rewriting and scraping",
    instead: ["cheerio", "jsdom", "node-html-parser"],
    use: "HTMLRewriter",
    before: `import * as cheerio from "cheerio";
const $ = cheerio.load(html);
const links = $("a").map((_, a) => $(a).attr("href")).get();`,
    after: `const links: string[] = [];
const rewriter = new HTMLRewriter().on("a[href]", {
  element(el) {
    links.push(el.getAttribute("href")!);
  },
});
await rewriter.transform(new Response("<a href='/x'>x</a>")).text();
console.log(links);`,
  },
  {
    task: "Utilities",
    instead: ["string-width", "escape-html", "fast-deep-equal", "which", "strip-ansi", "util.promisify(setTimeout)"],
    use: "Bun.stringWidth / Bun.escapeHTML / Bun.deepEquals / Bun.which / Bun.stripANSI / Bun.sleep",
    before: `import stringWidth from "string-width";
import escapeHtml from "escape-html";
import equal from "fast-deep-equal";
import which from "which";`,
    after: `await Bun.sleep(10);
console.log(
  Bun.stringWidth("héllo"),
  Bun.escapeHTML("<b>"),
  Bun.deepEquals({ a: 1 }, { a: 1 }),
  Bun.which("git"),
  Bun.stripANSI("\\u001b[31mred\\u001b[0m"),
);`,
  },
  {
    task: "Cookies",
    instead: ["cookie", "cookie-parser"],
    use: "req.cookies / Bun.CookieMap",
    before: `import cookieParser from "cookie-parser";
app.use(cookieParser());
app.get("/", (req, res) => res.cookie("seen", "1").send(req.cookies.session));`,
    after: `Bun.serve({
  routes: {
    "/": req => {
      const session = req.cookies.get("session");
      req.cookies.set("seen", "1", { httpOnly: true, sameSite: "lax" });
      return new Response(session ?? "anonymous");
    },
  },
});
const jar = new Bun.CookieMap("a=1; b=2");
console.log(jar.get("a"));`,
  },
  {
    task: "Worker threads",
    instead: ["worker_threads", "piscina", "threads"],
    use: "Web Worker (new Worker)",
    before: `import { Worker } from "node:worker_threads";
const worker = new Worker(new URL("./worker.js", import.meta.url));
worker.on("message", m => console.log(m));`,
    after: `const worker = new Worker(new URL("./worker.ts", import.meta.url).href);
worker.onmessage = event => console.log(event.data);
worker.postMessage({ n: 42 });`,
  },
  {
    task: "Call a C library",
    instead: ["ffi-napi", "node-ffi", "koffi"],
    use: "bun:ffi",
    before: `import ffi from "ffi-napi";
const libm = ffi.Library("libm", { cos: ["double", ["double"]] });`,
    after: `import { dlopen, FFIType, suffix } from "bun:ffi";
const lib = dlopen(\`libm.\${suffix}\`, { cos: { args: [FFIType.f64], returns: FFIType.f64 } });
console.log(lib.symbols.cos(0));
lib.close();`,
  },
  {
    task: "Store secrets in the OS keychain",
    instead: ["keytar"],
    use: "Bun.secrets",
    before: `import keytar from "keytar";
await keytar.setPassword("my-app", "token", "s3cr3t");`,
    after: `await Bun.secrets.set({ service: "my-app", name: "token", value: "s3cr3t" });
const token = await Bun.secrets.get({ service: "my-app", name: "token" });
console.log(token !== null);`,
  },
  {
    task: "Package scripts and CLI",
    instead: ["npm install", "npx", "yarn", "pnpm", "npm run"],
    use: "bun install / bun fmt / bun run; bunx only for commands without a native Bun owner",
    before: `npm install
bun fmt .
npm run build`,
    after: `// bun install, bun add <pkg>, bun add -d <pkg>, bun fmt ., bun run build
console.log(Bun.version);`,
  },
];

export const NATIVE_SKILL = "bun-native";
export const DATASET_URL = "https://dist.aphrody.app/datasets/bun-native/latest.json";
export const SEARCH_URL = "https://bun.aphrody.app/api/bun/search?q=";

/** Compact, injected at session start (hooks/context.md) and summarized by the user-prompt-submit hook. */
export const RULES = [
  "Use official Bun APIs when appropriate for the project's supported runtimes and compatibility requirements.",
  "Use official upstream Bun canary by default. Choose project-appropriate quality tools; fork-only commands require an explicitly selected compatible component.",
  "Bun provides Bun.serve, Bun.file, Bun.write, bun:sqlite, Bun.spawn and bun:test; choose APIs to fit the application.",
  "Media capabilities specific to the Aphrody fork require an explicitly installed compatible extension; upstream Bun does not provide Bun.Video.",
  "Also built in: fetch, Bun.s3, Bun.password, Bun.hash, Bun.CryptoHasher, Bun.Glob, Bun.build, Bun.YAML/TOML/JSONC, Bun.semver, HTMLRewriter, bun:ffi, Worker; .env is loaded without dotenv; TypeScript runs without ts-node/tsx.",
  "Check upstream Bun documentation and the actual runtime version before relying on an API. Legacy MCP tools require a separately configured compatible server.",
];

export type Replacement = { names: string[]; use: string; task?: string };

/** `[[packages]]` of the n2b registry whose id is imports/bun-native, parsed without a TOML library. */
export function n2bPackages(toml: string): Replacement[] {
  const out: Replacement[] = [];
  for (const block of toml.split(/^\[\[packages\]\]\s*$/m).slice(1)) {
    const field = (k: string) => new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, "m").exec(block)?.[1];
    if (field("id") !== "imports/bun-native") continue;
    const name = field("package");
    const replacement = field("replacement");
    if (!name || !replacement) continue;
    const use =
      replacement === "<auto>"
        ? "nothing: built into Bun"
        : replacement.startsWith("<")
          ? replacement.slice(1, -1)
          : replacement;
    out.push({ names: [name], use });
  }
  return out;
}

/** Every replacement: the curated pairs first, then the n2b packages they do not cover. */
export function replacements(n2bToml?: string): Replacement[] {
  const out: Replacement[] = PAIRS.map(p => ({ names: p.instead, use: p.use, task: p.task }));
  const covered = new Set(out.flatMap(r => r.names.map(n => n.toLowerCase())));
  for (const r of n2bToml ? n2bPackages(n2bToml) : [])
    if (!covered.has(r.names[0]!.toLowerCase())) {
      covered.add(r.names[0]!.toLowerCase());
      out.push(r);
    }
  return out;
}

export function nativeSkill(version: string, n2bToml?: string): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const rows = replacements(n2bToml).map(r => `| ${esc(r.names.join(", "))} | ${esc(r.use)} |`);
  const examples = PAIRS.map(
    p => `### ${p.task}\n\nInstead of ${p.instead.join(", ")}:\n\n\`\`\`ts\n${p.after}\n\`\`\``,
  );
  const description =
    `Write Bun-native code for Bun ${version}: Bun APIs before Node.js modules and npm packages (Bun.serve, Bun.file/Bun.write, ` +
    "bun:sqlite, Bun.sql, Bun.redis, Bun.s3, Bun.$, Bun.spawn, bun:test, Bun.build, Bun.password, Bun.Glob, HTMLRewriter, " +
    "bun:ffi). Use whenever writing, reviewing or migrating JavaScript or TypeScript that runs on Bun.";
  return [
    "---",
    `name: ${NATIVE_SKILL}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    `# Writing Bun-native code (Bun ${version})`,
    "",
    RULES.map(r => `- ${r}`).join("\n"),
    "",
    "## Instead of X, use Y",
    "",
    "| Instead of | Use |",
    "| --- | --- |",
    ...rows,
    "",
    "## Idioms",
    "",
    examples.join("\n\n"),
    "",
    "## More examples",
    "",
    "The bun-native dataset has thousands of working snippets from the docs, the exact signatures of bun-types, " +
      "short tests and the n2b migration rules of this Bun version:",
    "",
    '- `examples_search` of `bun mcp` (`{"query": "Bun.serve websocket"}`, `kind`: example, signature, test, migration, cli, config), from `~/.bun/agent/datasets/bun-native.jsonl`;',
    `- hosted semantic search: \`${SEARCH_URL}<words>\` (JSON, \`k\` and \`kind\` parameters);`,
    `- the dataset itself: \`${DATASET_URL}\` (JSONL, one entry per line: instruction, code, api, source, version).`,
    "",
  ].join("\n");
}

/** Package names that are everyday words: a prompt saying them is not about the package. */
const ENGLISH = new Set(["which", "got", "threads", "debug", "cookie"]);

/** hooks/native.json: what the user-prompt-submit hook matches prompts against. */
export function nativeHookData(n2bToml?: string) {
  return {
    skill: NATIVE_SKILL,
    search: SEARCH_URL,
    instead: replacements(n2bToml)
      .map(r => ({ names: r.names.filter(n => !ENGLISH.has(n)), use: r.use }))
      .filter(r => r.names.length),
  };
}
