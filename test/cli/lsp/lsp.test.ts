import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";

const env = {
  ...bunEnv,
  // Never download a server: the tests that need one are skipped when it is not installed.
  BUN_LSP_OFFLINE: "1",
  // A daemon that a failed test leaves behind exits soon.
  BUN_LSP_IDLE_MS: "60000",
};

async function run(args: string[], cwd?: string) {
  await using proc = Bun.spawn({ cmd: [bunExe(), "lsp", ...args], env, cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

/** An editor on the stdio of `bun lsp`. */
class Editor {
  proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  buffer = Buffer.alloc(0);
  messages: any[] = [];
  waiters: { match: (message: any) => boolean; resolve: (message: any) => void }[] = [];
  nextId = 1;

  constructor(cwd: string) {
    this.proc = Bun.spawn({
      cmd: [bunExe(), "lsp", "--stdio"],
      env,
      cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.read();
  }

  async read() {
    for await (const chunk of this.proc.stdout) {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      while (true) {
        const end = this.buffer.indexOf("\r\n\r\n");
        if (end < 0) break;
        const length = Number(/Content-Length: (\d+)/i.exec(this.buffer.subarray(0, end).toString())?.[1]);
        if (this.buffer.length < end + 4 + length) break;
        const message = JSON.parse(this.buffer.subarray(end + 4, end + 4 + length).toString());
        this.buffer = this.buffer.subarray(end + 4 + length);
        this.messages.push(message);
        this.waiters = this.waiters.filter(waiter => !(waiter.match(message) && (waiter.resolve(message), true)));
      }
    }
  }

  send(message: object) {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message });
    this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    this.proc.stdin.flush();
  }

  waitFor(match: (message: any) => boolean): Promise<any> {
    const seen = this.messages.find(match);
    if (seen) return Promise.resolve(seen);
    return new Promise(resolve => this.waiters.push({ match, resolve }));
  }

  request(method: string, params: object) {
    const id = this.nextId++;
    this.send({ id, method, params });
    return this.waitFor(message => message.id === id && !("method" in message));
  }

  notify(method: string, params: object) {
    this.send({ method, params });
  }
}

const uri = (path: string) => Bun.pathToFileURL(path).href;

describe("bun lsp --stdio", () => {
  test("initialize, shutdown and exit", async () => {
    using dir = tempDir("lsp-init", { "package.json": "{}" });
    const editor = new Editor(String(dir));
    const initialized = await editor.request("initialize", {
      processId: null,
      rootUri: uri(String(dir)),
      capabilities: {},
    });
    expect(initialized.result.serverInfo.name).toBe("bun lsp");
    expect(initialized.result.capabilities).toMatchObject({
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      textDocumentSync: { openClose: true, change: 1 },
    });
    editor.notify("initialized", {});
    const shutdown = await editor.request("shutdown", {});
    expect(shutdown.result).toBeNull();
    editor.notify("exit", {});
    expect(await editor.proc.exited).toBe(0);
  });

  test("publishes TypeScript diagnostics of an open document from bun check", async () => {
    const text = `const count: number = "three";\nexport { count };\n`;
    using dir = tempDir("lsp-ts", {
      "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true } }),
      "index.ts": text,
    });
    const file = join(String(dir), "index.ts");
    const editor = new Editor(String(dir));
    await editor.request("initialize", { processId: null, rootUri: uri(String(dir)), capabilities: {} });
    editor.notify("initialized", {});
    editor.notify("textDocument/didOpen", {
      textDocument: { uri: uri(file), languageId: "typescript", version: 1, text },
    });
    const published = await editor.waitFor(
      message =>
        message.method === "textDocument/publishDiagnostics" &&
        message.params.diagnostics.some((it: any) => it.source === "bun"),
    );
    const diagnostic = published.params.diagnostics.find((it: any) => it.source === "bun");
    expect(diagnostic).toMatchObject({
      code: 2322,
      severity: 1,
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } },
    });
    expect(diagnostic.message).toContain("is not assignable to type 'number'");

    // Fixed: the next publication is empty.
    editor.notify("textDocument/didChange", {
      textDocument: { uri: uri(file), version: 2 },
      contentChanges: [{ text: `const count: number = 3;\nexport { count };\n` }],
    });
    await editor.waitFor(
      message =>
        message.method === "textDocument/publishDiagnostics" &&
        message.params.version === 2 &&
        !message.params.diagnostics.some((it: any) => it.source === "bun"),
    );
    await editor.request("shutdown", {});
    editor.notify("exit", {});
    expect(await editor.proc.exited).toBe(0);
  });
});

describe("bun lsp query", () => {
  using dir = tempDir("lsp-query", {
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true } }),
    "bad.ts": `export const name: string = 42;\n`,
    "good.ts": `export const name: string = "bun";\n`,
  });
  const cwd = String(dir);
  afterAll(async () => {
    await run(["stop", cwd], cwd);
  });

  test("diagnostics --json through the daemon", async () => {
    const { stdout, stderr, exitCode } = await run(["query", "diagnostics", "bad.ts", "--json"], cwd);
    const answer = JSON.parse(stdout);
    expect(answer).toMatchObject({
      kind: "diagnostics",
      language: "typescript",
      servers: ["bun check"],
      complete: true,
    });
    expect(answer.items).toHaveLength(1);
    expect(answer.items[0]).toMatchObject({ line: 1, column: 14, severity: "error", code: "2322" });
    expect(stderr).toBe("");
    expect(exitCode).toBe(1);

    // The daemon is warm now.
    const good = await run(["query", "diagnostics", "good.ts", "--json"], cwd);
    expect(JSON.parse(good.stdout).items).toEqual([]);
    expect(good.exitCode).toBe(0);

    const status = await run(["status", cwd, "--json"], cwd);
    expect(JSON.parse(status.stdout).pid).toBeNumber();
    expect(status.exitCode).toBe(0);
  });

  test("text output, without a daemon", async () => {
    const { stdout, exitCode } = await run(["query", "diag", "bad.ts", "--no-daemon"], cwd);
    expect(stdout).toBe("bad.ts:1:14: error TS2322: Type 'number' is not assignable to type 'string'.\n");
    expect(exitCode).toBe(1);
  });

  test("errors", async () => {
    const unknown = await run(["query", "nope", "bad.ts"], cwd);
    expect(unknown.stderr).toContain('unknown query "nope"');
    expect(unknown.exitCode).toBe(2);
    const position = await run(["query", "hover", "bad.ts", "--no-daemon"], cwd);
    expect(position.stderr).toContain("hover needs a position");
    expect(position.exitCode).toBe(2);
  });
});

test("bun lsp servers --json names a server or what to install, for each language", async () => {
  using dir = tempDir("lsp-servers", { "package.json": "{}" });
  const { stdout, exitCode } = await run(["servers", "--json"], String(dir));
  const languages = JSON.parse(stdout);
  expect(languages.map((it: any) => it.language)).toEqual(["typescript", "python", "rust", "cpp"]);
  for (const language of languages) expect(language.servers.length > 0 || language.missing).toBeTruthy();
  expect(exitCode).toBe(0);
});

const python = ["ty", "basedpyright-langserver", "pyright-langserver", "ruff"].some(it => Bun.which(it));
test.skipIf(!python)(
  "python diagnostics",
  async () => {
    using dir = tempDir("lsp-python", {
      "pyproject.toml": `[project]\nname = "x"\nversion = "0"\n`,
      "main.py": "print(undefined_name)\n",
    });
    const { stdout, exitCode } = await run(["query", "diagnostics", "main.py", "--json", "--no-daemon"], String(dir));
    const answer = JSON.parse(stdout);
    expect(answer.language).toBe("python");
    expect(answer.items.some((it: any) => it.line === 1 && it.message.includes("undefined_name"))).toBe(true);
    expect(exitCode).toBe(1);
  },
  60_000,
);

test.skipIf(!Bun.which("rust-analyzer"))(
  "rust symbols",
  async () => {
    using dir = tempDir("lsp-rust", {
      "Cargo.toml": `[package]\nname = "x"\nversion = "0.1.0"\nedition = "2021"\n`,
      "src/lib.rs": "pub fn hello() -> u32 {\n    1\n}\n\npub struct Point {\n    pub x: i32,\n}\n",
    });
    const { stdout, exitCode } = await run(["query", "symbols", "src/lib.rs", "--json", "--no-daemon"], String(dir));
    const answer = JSON.parse(stdout);
    expect(answer.servers).toEqual(["rust-analyzer"]);
    expect(answer.items.map((it: any) => [it.name, it.symbolKind, it.line])).toEqual([
      ["hello", "function", 1],
      ["Point", "struct", 5],
      ["x", "field", 6],
    ]);
    expect(exitCode).toBe(0);
  },
  60_000,
);

const llvm = isWindows ? join(process.env.ProgramFiles ?? "C:\\Program Files", "LLVM", "bin", "clangd.exe") : "";
const clangd = Bun.which("clangd") ?? (llvm && existsSync(llvm) ? llvm : null);
describe.skipIf(!clangd)("c and c++ through clangd", () => {
  test("diagnostics and symbols with compile_flags.txt", async () => {
    using dir = tempDir("lsp-cpp", {
      "compile_flags.txt": "-std=c++17\n",
      "main.cpp": "struct Point { int x; };\n\nint main() {\n  return missing;\n}\n",
    });
    const cwd = String(dir);
    const diagnostics = JSON.parse(
      (await run(["query", "diagnostics", "main.cpp", "--json", "--no-daemon"], cwd)).stdout,
    );
    expect(diagnostics.servers).toEqual(["clangd"]);
    expect(diagnostics.items).toMatchObject([{ line: 4, severity: "error" }]);
    expect(diagnostics.items[0].message).toContain("missing");
    const symbols = JSON.parse((await run(["query", "symbols", "main.cpp", "--json", "--no-daemon"], cwd)).stdout);
    expect(symbols.items.map((it: any) => it.name)).toContain("main");
  }, 60_000);

  test.skipIf(!Bun.which("ninja"))("compdb writes compile_commands.json from build.ninja", async () => {
    using dir = tempDir("lsp-compdb", {
      "a.c": "int a(void) { return 1; }\n",
      "build/build.ninja":
        "rule cc\n  command = clang -c $in -o $out\nrule link\n  command = clang $in -o $out\nbuild a.o: cc ../a.c\nbuild a: link a.o\n",
    });
    const { stdout, exitCode } = await run(["compdb"], String(dir));
    expect(stdout.trim()).toBe(join(String(dir), "build", "compile_commands.json"));
    const database = await Bun.file(join(String(dir), "build", "compile_commands.json")).json();
    expect(database.map((it: any) => it.output)).toEqual(["a.o"]);
    expect(exitCode).toBe(0);
  });
});
