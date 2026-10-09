// SPDX-License-Identifier: MIT
import { afterAll, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { realpathSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const fixture = tempDir("bun-python-cli", {});
const root = String(fixture);
afterAll(() => fixture[Symbol.dispose]());
const python = process.env.BUN_PYTHON_EXECUTABLE;
const environment: NodeJS.ProcessEnv = { ...bunEnv, ...process.env, PYTHONHOME: "", BUN_DEBUG_QUIET_LOGS: "1" };
// CPython is an external optional artifact. The native factory supplies all three exact paths.
const nativeTest = test.skipIf(!python || !process.env.BUN_PYTHON_HOST_LIBRARY || !process.env.BUN_PYTHON_LIBPYTHON);
const executableCheck = "import os,sys; assert sys.executable == os.environ['BUN_PYTHON_EXECUTABLE']; ";
const script = join(root, "été script🐍.py");
writeFileSync(
  script,
  executableCheck +
    "import json,pathlib\nassert sys.argv[1] == 'été🐍'\nassert str(pathlib.Path(__file__).parent) in sys.path\nprint(json.dumps({'argv':sys.argv[1]}, ensure_ascii=False))\n",
);
writeFileSync(join(root, "cli_module.py"), executableCheck + "assert sys.argv[1]=='été🐍'; print('MODULE_OK')\n");

async function run(args: string[], input?: string, env = environment, argv0?: string) {
  await using child = Bun.spawn({
    cmd: [bunExe(), ...(args[0] === "-e" ? ["--no-install"] : []), ...args],
    cwd: root,
    env,
    argv0,
    stdin: input === undefined ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect(child.signalCode).toBeNull();
  return { code, out: out.trim(), err: err.trim() };
}
function success(result: Awaited<ReturnType<typeof run>>, output: string) {
  expect(result).toEqual({ code: 0, out: output, err: "" });
}

test.concurrent("native bun:graph records dependency edges in SQLite", async () => {
  success(
    await run([
      "-e",
      `
    import { BunPython, PyJS } from "bun:graph";
    if (PyJS !== BunPython) throw new Error("Graph constructor alias mismatch");
    using graph = new BunPython(":memory:");
    const repository = graph.repository("bun", "source", process.cwd());
    await graph.importGraph(repository, {
      nodes: [{ id: "cli", label: "CLI", source_file: "src/runtime/cli/mod.rs" }],
      links: [{ source: "cli", target: "uv", relation: "calls", confidence: "EXTRACTED" }],
    }, "native-smoke");
    const counts = graph.counts();
    console.log(JSON.stringify({ nodes: counts.nodes, edges: counts.edges,
      snapshots: counts.graph_snapshots, foreignKeys: graph.db.query("PRAGMA foreign_key_check").all() }));
  `,
    ]),
    '{"nodes":2,"edges":1,"snapshots":1,"foreignKeys":[]}',
  );
});

test.concurrent("native buv and pyjs graph aliases share the SQLite and serialization APIs", async () => {
  success(
    await run([
      "-e",
      `
    import { PyJS } from "buv:graph";
    import { BunPython } from "pyjs:graph";
    import { encodeJSON, decodeJSON, markdown, html } from "buv:graphx";
    if (PyJS !== BunPython) throw new Error("Graph aliases do not share their constructor");
    using graph = new PyJS(":memory:");
    graph.repository("buv", "source", process.cwd());
    const report = await markdown(graph);
    console.log(encodeJSON({ same: PyJS === BunPython,
      json: decodeJSON(encodeJSON({ value: 42 })),
      markdown: report.includes("buv"), html: html(report).includes("<main>") }));
  `,
    ]),
    '{"same":true,"json":{"value":42},"markdown":true,"html":true}',
  );
});

test.concurrent("embedded uv reports its own version", async () => {
  const result = await run(["uv", "--version"]);
  expect(result.out).toMatch(/^uv 0\.12\.24(?: .*)?$/);
  expect(result.err).toBe("");
  expect(result.code).toBe(0);
});

test.concurrent("buv dispatches its embedded UV command", async () => {
  const result = await run(["uv", "--version"], undefined, environment, "buv");
  expect(result.out).toMatch(/^uv 0\.12\.24(?: .*)?$/);
  expect(result.err).toBe("");
  expect(result.code).toBe(0);
});

test.concurrent("pyjs executes JavaScript through the native engine", async () => {
  success(await run(["-e", "console.log('PYJS_JS_OK')"], undefined, environment, "pyjs"), "PYJS_JS_OK");
});

for (const [extension, source] of [
  ["pyjs", "export const value = 42;"],
  ["pyts", "export const value: number = 42;"],
  [
    "pytsx",
    "/* @jsxRuntime classic @jsx element */ function element(tag: string, props: unknown, value: number) { return value; } export const value = <span>{42}</span>;",
  ],
]) {
  test.concurrent(`native ${extension} modules use their JavaScript, TypeScript or TSX grammar`, async () => {
    using dir = tempDir(`buv-${extension}`, {
      [`value.${extension}`]: source,
      "entry.pyts": "import { value } from './value'; console.log(value);",
    });
    await using child = Bun.spawn({
      cmd: [bunExe(), "entry.pyts"],
      cwd: String(dir),
      env: environment,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    expect({ out, err }).toEqual({ out: "42\n", err: "" });
    expect(code).toBe(0);
  });
}

nativeTest.concurrent("pyjs embeds CPython in the JavaScript process through its native ABI", async () => {
  success(
    await run([
      "-e",
      `
    import { Python, PythonError } from "buv:python";
    using py = Python.open();
    py.exec\`import os; value = {'text': 'café🐍', 'n': 42}\`;
    if (py.evalJSON("__import__('os').getpid()") !== process.pid) throw new Error("Python process mismatch");
    try { py.eval("1 / 0"); } catch (error) {
      if (!(error instanceof PythonError) || !error.message.includes("division by zero")) throw error;
    }
    console.log(JSON.stringify(py.evalJSON("value")));
  `,
    ]),
    '{"text":"café🐍","n":42}',
  );
});

nativeTest.concurrent("async Python runs in a worker in the same process and serializes dependent calls", async () => {
  success(
    await run([
      "-e",
      `
    import { Python } from "pyjs:python";
    await using py = await Python.async();
    await py.exec\`import os; value = 40\`;
    const [first, second, pid] = await Promise.all([py.eval("value + 2"), py.eval("value + 3"), py.evalJSON("os.getpid()")]);
    if (pid !== process.pid) throw new Error("Python worker process mismatch");
    console.log(JSON.stringify([first, second]));
  `,
    ]),
    '["42","43"]',
  );
});

nativeTest.concurrent("pyjs dispatches Python files through the selected host", async () => {
  success(await run([basename(script), "été🐍"], undefined, environment, "pyjs"), '{"argv": "été🐍"}');
});

test.concurrent("Bun help advertises its embedded UV command", async () => {
  const result = await run(["--help"]);
  expect(result.out).toContain("Manage Python packages and projects with UV");
  expect(result.err).toBe("");
  expect(result.code).toBe(0);
});

test.concurrent("embedded uv rejects unknown arguments", async () => {
  const result = await run(["uv", "--aphrody-invalid-option"]);
  expect(result.err).toContain("--aphrody-invalid-option");
  expect(result.code).toBe(2);
});

test.concurrent("embedded uv accepts its Python command namespace", async () => {
  const result = await run(["uv", "python", "--help"]);
  expect(result.out).toContain("Manage Python versions");
  expect(result.code).toBe(0);
});

test.concurrent("embedded uv runs under its executable alias", async () => {
  const result = await run(["--version"], undefined, environment, "uv");
  expect(result.out).toMatch(/^uv 0\.12\.24(?: .*)?$/);
  expect(result.err).toBe("");
  expect(result.code).toBe(0);
});

test.concurrent("embedded uv frees the paths it canonicalizes", async () => {
  using dir = tempDir("uv-canonicalize", {});
  const result = await run(["uv", "tool", "dir"], undefined, { ...environment, UV_TOOL_DIR: String(dir) });
  expect(realpathSync(result.out)).toBe(realpathSync(String(dir)));
  expect(result.code).toBe(0);
});

test.concurrent("embedded uvx uses its tool command namespace", async () => {
  const result = await run(["--help"], undefined, environment, "uvx");
  expect(result.out.split(/\r?\n/, 1)[0]).toBe("Run a command provided by a Python package.");
  expect(result.out).toContain("Usage: uvx [OPTIONS] [COMMAND]");
  expect(result.err).toBe("");
  expect(result.code).toBe(0);
});

test.concurrent("embedded uv honors explicit engine dispatch under another name", async () => {
  const result = await run(["uv", "--version"], undefined, { ...environment, BUN_BE_BUN: "1" }, "custom-runtime");
  expect(result.out).toMatch(/^uv 0\.12\.24(?: .*)?$/);
  expect(result.err).toBe("");
  expect(result.code).toBe(0);
});

test.concurrent("node alias keeps scripts named uv", async () => {
  using dir = tempDir("node-uv-script", { uv: "console.log('NODE_UV_SCRIPT');\n" });
  await using child = Bun.spawn({
    cmd: [bunExe(), "uv"],
    argv0: "node",
    cwd: String(dir),
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect({ out, err }).toEqual({ out: "NODE_UV_SCRIPT\n", err: "" });
  expect(code).toBe(0);
});

test.skipIf(!python)("embedded uv preserves child process status offline", async () => {
  const result = await run([
    "uv",
    "run",
    "--offline",
    "--no-project",
    "--no-python-downloads",
    "--python",
    python!,
    "--",
    "python",
    "-c",
    "import sys; assert sys.argv[1] == 'été🐍'; print('UV_CHILD_OK'); sys.exit(37)",
    "été🐍",
  ]);
  expect(result.out).toBe("UV_CHILD_OK");
  expect(result.code).toBe(37);
});

test("optional Python host remains lazy for JavaScript", async () => {
  success(
    await run(["-e", "console.log('JS_OK')"], undefined, {
      ...environment,
      BUN_PYTHON_HOST_LIBRARY: join(root, "absent-host.so"),
    }),
    "JS_OK",
  );
});
for (const prefix of [[], ["run"]]) {
  for (const path of [script, basename(script)]) {
    nativeTest.concurrent("native Python file dispatch " + [...prefix, path].join(" "), async () => {
      success(await run([...prefix, path, "été🐍"]), '{"argv": "été🐍"}');
    });
  }
}
nativeTest.concurrent("native Python -c preserves Unicode argv and selected interpreter", async () => {
  success(
    await run(["python", "-c", executableCheck + "assert sys.argv[1]=='été🐍'; print('CODE_OK')", "été🐍"]),
    "CODE_OK",
  );
});
nativeTest.concurrent("native Python -m preserves current module search path", async () => {
  success(await run(["python", "-m", "cli_module", "été🐍"]), "MODULE_OK");
});
nativeTest.concurrent("native Python stdin executes input", async () => {
  success(await run(["python", "-"], executableCheck + "print('STDIN_OK')\n"), "STDIN_OK");
});
nativeTest.concurrent("Python UTF-8 stdio survives native dispatch", async () => {
  success(await run(["python", "-c", executableCheck + "print('café🐍')"]), "café🐍");
});

nativeTest.concurrent("Python honors explicit standard-stream encoding", async () => {
  success(
    await run(["python", "-c", "import sys; print(sys.stdout.encoding)"], undefined, {
      ...environment,
      PYTHONIOENCODING: "ascii:backslashreplace",
    }),
    "ascii",
  );
  success(
    await run(["python", "-c", "print('été🐍')"], undefined, {
      ...environment,
      PYTHONIOENCODING: "ascii:backslashreplace",
    }),
    "\\xe9t\\xe9\\U0001f40d",
  );
});

nativeTest.concurrent("Python honors explicit UTF-8 mode flags", async () => {
  success(await run(["python", "-X", "utf8=0", "-c", "import sys; print(sys.flags.utf8_mode)"]), "0");
  success(await run(["python", "-Xutf8=1", "-c", "import sys; print(sys.flags.utf8_mode)"]), "1");
});
nativeTest.concurrent("Python imports the standard native extensions", async () => {
  success(
    await run(["python", "-c", executableCheck + "import ctypes,ssl,sqlite3,json; print('IMPORTS_OK')"]),
    "IMPORTS_OK",
  );
});
for (const [pythonExit, processExit] of [
  [7, 7],
  [-1, 255],
]) {
  nativeTest.concurrent("Python SystemExit preserves terminal status " + pythonExit, async () => {
    const result = await run(["python", "-c", executableCheck + "sys.exit(" + pythonExit + ")"]);
    expect(result).toEqual({ code: processExit, out: "", err: "" });
  });
}
nativeTest.concurrent("Python exceptions retain traceback and failing exit status", async () => {
  const result = await run(["python", "-c", executableCheck + "raise RuntimeError('PYTHON_TRACEBACK')"]);
  expect(result.code).toBe(1);
  expect(result.err).toContain("RuntimeError: PYTHON_TRACEBACK");
});
nativeTest.concurrent("real virtual environment retains prefix and site paths", async () => {
  const venv = join(root, "venv space");
  const made = Bun.spawn([python!, "-m", "venv", "--without-pip", venv], {
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([made.stdout.text(), made.stderr.text(), made.exited]);
  expect({ out, err, code }).toEqual({ out: "", err: "", code: 0 });
  const executable = join(venv, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  success(
    await run(
      [
        "python",
        "-c",
        executableCheck +
          "import site; assert sys.prefix!=sys.base_prefix; assert any(sys.prefix in p for p in site.getsitepackages()); print('VENV_OK')",
      ],
      undefined,
      { ...environment, BUN_PYTHON_EXECUTABLE: executable, VIRTUAL_ENV: venv },
    ),
    "VENV_OK",
  );
});
nativeTest.concurrent("missing host fails before Python source evaluation", async () => {
  const result = await run([script, "été🐍"], undefined, {
    ...environment,
    BUN_PYTHON_HOST_LIBRARY: join(root, "missing-host.so"),
  });
  expect(result.code).toBe(1);
  expect(result.err).toContain("cannot load Python host");
});

test.concurrent("Python compiler help distinguishes native executables, extension ABI and WASI", async () => {
  const result = await run(["compile", "--help"]);
  expect(result.out).toContain("--format exe|shared|wasm");
  expect(result.out).toContain("PyInit_*");
  expect(result.out).toContain("CPython WASI toolchain");
  expect(result.code).toBe(0);
});

nativeTest.concurrent("Python compilation cannot overwrite a source or rename host formats", async () => {
  using dir = tempDir("buv-compile-validation", { "entry.py": "print('SOURCE_PRESERVED')\n" });
  const source = join(String(dir), "entry.py");
  const initial = await Bun.file(source).text();
  const collision = await run(["compile", source, "--outfile", source, "--force", "--backend-ready"]);
  expect(collision.err).toContain("output cannot replace Python source");
  expect(await Bun.file(source).text()).toBe(initial);
  expect(collision.code).toBe(1);
  const incompatible = await run([
    "compile",
    source,
    "--format",
    "shared",
    "--outfile",
    join(String(dir), "renamed.wasm"),
    "--backend-ready",
  ]);
  expect(incompatible.err).toContain("shared library suffix is incompatible");
  expect(await Bun.file(join(String(dir), "renamed.wasm")).exists()).toBe(false);
  expect(incompatible.code).toBe(1);
});

nativeTest.concurrent("Python WASM compilation rejects an unavailable real builder without an artifact", async () => {
  using dir = tempDir("buv-compile-wasi-unavailable", { "entry.py": "print(42)\n" });
  const output = join(String(dir), "entry.wasm");
  const result = await run([
    "build",
    join(String(dir), "entry.py"),
    "--compile",
    "--target=wasm",
    "--outfile",
    output,
    "--wasm-builder",
    join(String(dir), "missing-builder.ts"),
  ]);
  expect(result.err).toContain("WASM builder and native Buv executable must exist");
  expect(await Bun.file(output).exists()).toBe(false);
  expect(result.code).toBe(1);
});

const compilerTest = test.skipIf(
  !python ||
    !process.env.BUN_PYTHON_HOST_LIBRARY ||
    !process.env.BUN_PYTHON_LIBPYTHON ||
    process.env.BUV_TEST_PYTHON_COMPILER !== "1",
);
compilerTest(
  "offline native Cython produces a loadable Python extension and a real executable",
  async () => {
    using dir = tempDir("buv-cython-products", {
      "calc.py": "def add(a, b):\n    return a + b\n",
      "app.py": "print('COMPILED_PYTHON_OK')\n",
    });
    const library = join(String(dir), process.platform === "win32" ? "calc.pyd" : "calc.so");
    const module = await run([
      "build",
      join(String(dir), "calc.py"),
      "--compile",
      "--format",
      "shared",
      "--outfile",
      library,
      "--offline",
    ]);
    expect(module.err).not.toContain("buv compile:");
    expect(module.code).toBe(0);
    const moduleReceipt = JSON.parse(module.out.split(/\r?\n/).at(-1)!);
    expect(moduleReceipt.abi).toBe("PyInit_calc");
    expect(moduleReceipt.standalone).toBe(false);
    const loaded = await run([
      "python",
      "-c",
      `import importlib.util; spec=importlib.util.spec_from_file_location('calc',${JSON.stringify(library)}); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); print(mod.add(19,23))`,
    ]);
    expect(loaded.out).toBe("42");
    expect(loaded.code).toBe(0);
    const executable = join(String(dir), process.platform === "win32" ? "program.exe" : "program");
    const built = await run(["compile", join(String(dir), "app.py"), "--outfile", executable, "--offline"]);
    expect(built.code).toBe(0);
    const receipt = JSON.parse(built.out.split(/\r?\n/).at(-1)!);
    expect(receipt.abi).toBe("CPython-embedded-executable");
    expect(receipt.runtimeDependencies).toContain("CPython standard library");
    await using child = Bun.spawn({
      cmd: [executable],
      cwd: String(dir),
      env: {
        ...environment,
        PYTHONHOME: receipt.python.prefix,
        PATH: receipt.python.prefix + (process.platform === "win32" ? ";" : ":") + (environment.PATH ?? ""),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    expect({ out, err }).toEqual({ out: "COMPILED_PYTHON_OK\n", err: "" });
    expect(code).toBe(0);
  },
  15000,
);
