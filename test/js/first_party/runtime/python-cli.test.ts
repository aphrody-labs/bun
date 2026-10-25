// SPDX-License-Identifier: MIT
import { afterAll, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { Database } from "bun:sqlite";
import { chmodSync, copyFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const fixture = tempDir("bun-python-cli", {});
const root = String(fixture);
afterAll(() => fixture[Symbol.dispose]());
const python = process.env.BUN_PYTHON_EXECUTABLE;
const environment: NodeJS.ProcessEnv = {
  ...bunEnv,
  ...process.env,
  PYTHONHOME: "",
  BUN_DEBUG_QUIET_LOGS: "1",
};
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

test.concurrent("uv plugin reports its own version", async () => {
  const result = await run(["uv", "--version"]);
  expect(result.out).toMatch(/^uv 0\.12\.24(?: .*)?$/);
  expect(result.err).toBe("");
  expect(result.code).toBe(0);
});

test.concurrent("buv dispatches to the uv plugin", async () => {
  const result = await run(["uv", "--version"], undefined, environment, "buv");
  expect(result.out).toMatch(/^uv 0\.12\.24(?: .*)?$/);
  expect(result.err).toBe("");
  expect(result.code).toBe(0);
});

for (const command of ["uv", "uvx"]) {
  test.concurrent(`${command} argv0 dispatches to the uv plugin`, async () => {
    const result = await run(["--version"], undefined, environment, command);
    expect(result.out).toMatch(new RegExp(`^${command} 0\\.12\\.24(?: .*)?$`));
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
  });
}

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

nativeTest.concurrent(
  "bun:python shares writable CPython buffers with JSC and keeps failed close recoverable",
  async () => {
    success(
      await run([
        "-e",
        `
    import { Python, PythonError, PyStatus } from "bun:python";
    const py = Python.open();
    const peer = Python.open();
    if (!py.started || peer.started) throw new Error("Python client ownership mismatch");
    py.exec\`shared = bytearray(b"abc")\`;
    function exercise() {
      const shared = py.buffer("shared");
      const bytes = new Uint8Array(shared);
      bytes[0] = 122;
      if (py.eval("shared[0]") !== "122") throw new Error("JavaScript write was not visible to CPython");
      py.exec\`shared[1] = 121\`;
      if (bytes[1] !== 121) throw new Error("CPython write was not visible to JavaScript");
      const batch = py.evalBatch(["shared[0]", "shared[1]", "len(shared)"]);
      if (JSON.stringify(batch) !== '["122","121","3"]') throw new Error("batched evaluation mismatch");
      try {
        py.close();
        throw new Error("close accepted a live Python buffer lease");
      } catch (error) {
        if (!(error instanceof PythonError) || error.status !== PyStatus.State) throw error;
      }
      if (py.eval("len(shared)") !== "3") throw new Error("failed close poisoned the Python handle");
    }
    exercise();
    Bun.gc(true);
    py.run("pass");
    py.close();
    if (peer.eval("bytes(shared)") !== "b'zyc'") throw new Error("owner close stopped an attached client");
    peer.close();
    console.log("PYTHON_BUFFER_OK");
  `,
      ]),
      "PYTHON_BUFFER_OK",
    );
  },
);

nativeTest.concurrent("async Python runs in a worker in the same process and serializes dependent calls", async () => {
  success(
    await run([
      "-e",
      `
    import { Python } from "pyjs:python";
    await using py = await Python.async();
    await py.exec\`import os; value = 40\`;
    const [first, second, batch, pid] = await Promise.all([py.eval("value + 2"), py.eval("value + 3"), py.evalBatch(["value + 4", "value + 5"]), py.evalJSON("os.getpid()")]);
    if (pid !== process.pid) throw new Error("Python worker process mismatch");
    console.log(JSON.stringify([first, second, batch]));
  `,
    ]),
    '["42","43",["44","45"]]',
  );
});

test.skipIf(process.env.BUN_TEST_PYCUDA !== "1")("PyCUDA computes through the shared Buv and PyJS host", async () => {
  expect(python).toBeTruthy();
  expect(process.env.BUN_PYTHON_HOST_LIBRARY).toBeTruthy();
  expect(process.env.BUN_PYTHON_LIBPYTHON).toBeTruthy();
  const result = await run([
    "-e",
    `
    import { Python } from "buv:python";
    import { Python as PyJS } from "pyjs:python";
    if (Python !== PyJS) throw new Error("Python host alias mismatch");
    using py = Python.open();
    py.exec\`import os
import numpy as np
cuda_dll_directory = None
if os.name == "nt" and os.environ.get("CUDA_PATH"):
    cuda_dll_directory = os.add_dll_directory(os.path.join(os.environ["CUDA_PATH"], "bin"))
import pycuda.driver as cuda
from pycuda.compiler import SourceModule
cuda.init()
device = cuda.Device(0)
assert device.compute_capability() >= (8, 9)
context = device.make_context()
try:
    source = np.arange(37, dtype=np.int32)
    allocation = cuda.mem_alloc(source.nbytes)
    try:
        cuda.memcpy_htod(allocation, source)
        module = SourceModule('extern "C" __global__ void twice(int *x, int n) { int i = blockIdx.x * blockDim.x + threadIdx.x; if (i < n) x[i] *= 2; }', no_extern_c=True)
        module.get_function("twice")(allocation, np.int32(source.size), block=(32, 1, 1), grid=(2, 1, 1))
        context.synchronize()
        result = np.empty_like(source)
        cuda.memcpy_dtoh(result, allocation)
        assert np.array_equal(result, source * 2)
        verified = result.tolist()
    finally:
        allocation.free()
finally:
    context.pop()
    context.detach()
    if cuda_dll_directory is not None:
        cuda_dll_directory.close()\`;
    if (py.evalJSON("os.getpid()") !== process.pid) throw new Error("Python process mismatch");
    const result = py.evalJSON("verified");
    if (JSON.stringify(result) !== JSON.stringify(Array.from({length: 37}, (_, i) => i * 2)))
      throw new Error("CUDA readback mismatch");
    if (process.env.BUN_TEST_BUV_GPU === "1") {
      if (!process.env.BUV_RUNTIME_LIB) throw new Error("GPU qualification requires the canonical provider path");
      const { GpuRuntime } = await import(${JSON.stringify(new URL("../../../../packages/bun-python/buv/gpu.ts", import.meta.url).href)});
      using gpu = GpuRuntime.load({ libraryPath: process.env.BUV_RUNTIME_LIB });
      const report = await gpu.info();
      if (!report.selected?.nvidia || !report.cuda?.nvrtcLoaded) throw new Error("NVIDIA GPU/NVRTC unavailable");
      if (process.platform === "win32" && report.selected.backend !== "Dx12") throw new Error("D3D12 backend not selected");
      const expected = Array.from({length: 37}, (_, i) => i * 2);
      const wgsl = await gpu.wgsl({
        shader: "@group(0) @binding(0) var<storage, read_write> data: array<u32>; @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3<u32>) { if (id.x < arrayLength(&data)) { data[id.x] *= 2u; } }",
        workgroups: [1, 1, 1],
        data: Uint32Array.from({length: 37}, (_, i) => i),
      });
      const wgslValues = new Uint32Array(wgsl.data.buffer, wgsl.data.byteOffset, 37);
      if (JSON.stringify([...wgslValues]) !== JSON.stringify(expected)) throw new Error("WGSL readback mismatch");
      const native = await gpu.cuda({
        source: 'extern "C" __global__ void twice(float *data, unsigned int n) { unsigned int i = blockIdx.x * blockDim.x + threadIdx.x; if (i < n) data[i] *= 2.0f; }',
        kernel: "twice",
        data: Float32Array.from({length: 37}, (_, i) => i),
      });
      if (JSON.stringify([...native.data]) !== JSON.stringify(expected)) throw new Error("Native CUDA readback mismatch");
    }
    console.log(process.env.BUN_TEST_BUV_GPU === "1" ? "PYCUDA_SHARED_HOST_GPU_SDK_OK" : "PYCUDA_SHARED_HOST_OK");
  `,
  ]);
  expect(result.out).toBe(
    process.env.BUN_TEST_BUV_GPU === "1" ? "PYCUDA_SHARED_HOST_GPU_SDK_OK" : "PYCUDA_SHARED_HOST_OK",
  );
  expect(result.code).toBe(0);
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

test.concurrent("uv plugin rejects unknown arguments", async () => {
  const result = await run(["uv", "--aphrody-invalid-option"]);
  expect(result.err).toContain("--aphrody-invalid-option");
  expect(result.code).toBe(2);
});

test.concurrent("uv plugin accepts its Python command namespace", async () => {
  const result = await run(["uv", "python", "--help"]);
  expect(result.out).toContain("Manage Python versions");
  expect(result.code).toBe(0);
});

test.concurrent("uv plugin runs under its executable alias", async () => {
  const result = await run(["--version"], undefined, environment, "uv");
  expect(result.out).toMatch(/^uv 0\.12\.24(?: .*)?$/);
  expect(result.err).toBe("");
  expect(result.code).toBe(0);
});

test.concurrent("uv plugin frees the paths it canonicalizes", async () => {
  using dir = tempDir("uv-canonicalize", {});
  const result = await run(["uv", "tool", "dir"], undefined, {
    ...environment,
    UV_TOOL_DIR: String(dir),
  });
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

test.concurrent("uv plugin runs under an upper-case executable extension", async () => {
  const result = await run(["--version"], undefined, environment, "UV.EXE");
  expect(result.out).toMatch(/^uv 0.12.24(?: .*)?$/);
  expect(result.err).toBe("");
  expect(result.code).toBe(0);
});

test.concurrent("uv plugin honors explicit engine dispatch under another name", async () => {
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

test.skipIf(!python)("uv plugin preserves child process status offline", async () => {
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
// The CLI makes the standard streams UTF-8 but leaves CPython's other text defaults alone, so
// open() and subprocess keep the locale encoding that stock CPython uses on Windows.
nativeTest
  .skipIf(process.platform !== "win32")
  .concurrent("Python keeps the locale text encoding while its standard streams are UTF-8", async () => {
    success(
      await run([
        "python",
        "-c",
        "import io,sys; print(sys.flags.utf8_mode, io.text_encoding(None), sys.stdout.encoding)",
      ]),
      "0 locale utf-8",
    );
  });
// pytest's descriptor capture redirects 0 to 2 with os.dup2; a child started afterwards must still
// get valid standard handles.
nativeTest
  .skipIf(process.platform !== "win32")
  .concurrent("Python subprocess works after descriptor 0 is redirected with os.dup2", async () => {
    const code = [
      "import os, subprocess, sys",
      "saved = os.dup(0)",
      "null = os.open(os.devnull, os.O_RDONLY)",
      "os.dup2(null, 0)",
      "os.close(null)",
      "child = subprocess.run([sys.executable, '-c', 'print(42)'], capture_output=True, text=True)",
      "os.dup2(saved, 0)",
      "print(child.stdout.strip())",
    ].join("\n");
    success(await run(["python", "-c", code]), "42");
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
const projectEnvironment = (() => {
  const { BUN_PYTHON_EXECUTABLE, BUN_PYTHON_LIBPYTHON, VIRTUAL_ENV, ...rest } = environment;
  return rest;
})();
async function runIn(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
  await using child = Bun.spawn({ cmd: [bunExe(), ...args], cwd, env, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  return { code, out: out.trim(), err: err.trim() };
}
async function makeVenv(venv: string) {
  await using made = Bun.spawn([python!, "-m", "venv", "--without-pip", venv], {
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([made.stdout.text(), made.stderr.text(), made.exited]);
  expect({ out, err, code }).toEqual({ out: "", err: "", code: 0 });
}
nativeTest.concurrent("project .venv selects its interpreter and shared library from a subdirectory", async () => {
  using dir = tempDir("buv-project-venv", { "pyproject.toml": "[project]\nname = 'demo'\n", "src/app/.keep": "" });
  const venv = join(String(dir), ".venv");
  await makeVenv(venv);
  const check =
    "import os,sys; assert os.path.samefile(sys.prefix, os.environ['EXPECTED_VENV']); assert sys.prefix != sys.base_prefix; print('PROJECT_VENV_OK')";
  expect(
    await runIn(join(String(dir), "src", "app"), ["python", "-c", check], {
      ...projectEnvironment,
      EXPECTED_VENV: venv,
    }),
  ).toEqual({ code: 0, out: "PROJECT_VENV_OK", err: "" });
});
nativeTest.concurrent("project console scripts run in the hosted interpreter", async () => {
  using dir = tempDir("buv-project-script", { "pyproject.toml": "[project]\nname = 'demo'\n" });
  const venv = join(String(dir), ".venv");
  await makeVenv(venv);
  const main =
    "import os,sys; print('SCRIPT', os.path.basename(sys.argv[0]), sys.argv[1:], sys.prefix != sys.base_prefix)";
  if (process.platform === "win32") {
    // Installer launchers carry the program as an appended zip application.
    await using zipped = Bun.spawn(
      [
        python!,
        "-c",
        "import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); z.writestr('__main__.py', sys.argv[2]); z.close(); open(sys.argv[1],'wb').write(b'MZ'+bytes(510)+b.getvalue())",
        join(venv, "Scripts", "hello.exe"),
        main,
      ],
      { env: environment, stdout: "pipe", stderr: "pipe" },
    );
    expect(await zipped.exited).toBe(0);
  } else {
    writeFileSync(join(venv, "bin", "hello"), `#!${join(venv, "bin", "python")}\n${main}\n`, { mode: 0o755 });
  }
  const scriptName = process.platform === "win32" ? "hello.exe" : "hello";
  expect(await runIn(String(dir), ["run", "hello", "été🐍", "--flag"], projectEnvironment)).toEqual({
    code: 0,
    out: `SCRIPT ${scriptName} ['été🐍', '--flag'] True`,
    err: "",
  });
});
nativeTest.concurrent("Python shebang files without a suffix run in the hosted interpreter", async () => {
  using dir = tempDir("buv-shebang", {
    tool: "#!/usr/bin/env python3\nimport sys\nprint('SHEBANG', sys.argv[1:])\n",
    "node-tool": "#!/usr/bin/env node\nconsole.log('NODE_SHEBANG');\n",
  });
  for (const target of ["./tool", "tool"]) {
    expect(await runIn(String(dir), ["run", target, "été🐍"], environment)).toEqual({
      code: 0,
      out: "SHEBANG ['été🐍']",
      err: "",
    });
  }
  expect(await runIn(String(dir), ["run", "./node-tool"], environment)).toEqual({
    code: 0,
    out: "NODE_SHEBANG",
    err: "",
  });
});
nativeTest.concurrent("environment and shared library version mismatch is refused", async () => {
  using dir = tempDir("buv-venv-mismatch", {
    ".venv/pyvenv.cfg": `home = ${join(root, "absent-python")}\nversion = 3.99.0\n`,
  });
  const executable = join(String(dir), ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  mkdirSync(dirname(executable), { recursive: true });
  copyFileSync(python!, executable);
  chmodSync(executable, 0o755);
  const result = await runIn(String(dir), ["python", "-c", "print('UNREACHABLE')"], {
    ...projectEnvironment,
    BUN_PYTHON_LIBPYTHON: process.env.BUN_PYTHON_LIBPYTHON,
  });
  expect(result.out).toBe("");
  expect(result.err).toContain("uses Python 3.99 but BUN_PYTHON_LIBPYTHON is Python 3.");
  expect(result.code).toBe(1);
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
for (const backend of ["cython", "nuitka"] as const) {
  compilerTest(
    `offline native ${backend} produces a loadable Python extension and a real executable`,
    async () => {
      using dir = tempDir("buv-cython-products", {
        "calc.py": "def add(a, b):\n    return a + b\n",
        "app.py": "print('COMPILED_PYTHON_OK')\n",
      });
      const library = join(String(dir), process.platform === "win32" ? "calc.pyd" : "calc.so");
      const registry = join(String(dir), "compiler.sqlite");
      const module = await run([
        "build",
        join(String(dir), "calc.py"),
        "--compile",
        "--backend",
        backend,
        "--format",
        "shared",
        "--outfile",
        library,
        "--db",
        registry,
        "--offline",
      ]);
      expect(module.err).not.toContain("buv compile:");
      expect({ code: module.code, err: module.err }).toMatchObject({ code: 0 });
      const moduleReceipt = JSON.parse(module.out.split(/\r?\n/).at(-1)!);
      expect(moduleReceipt.abi).toBe("PyInit_calc");
      expect(moduleReceipt.standalone).toBe(false);
      using db = new Database(registry, { readonly: true });
      const recorded = db
        .query<{ sha256: string }, [string]>("SELECT sha256 FROM artifacts WHERE path = ?")
        .get(library);
      expect(recorded?.sha256).toBe(moduleReceipt.sha256);
      const loaded = await run([
        "python",
        "-c",
        `import importlib.util; spec=importlib.util.spec_from_file_location('calc',${JSON.stringify(library)}); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); print(mod.add(19,23))`,
      ]);
      expect(loaded.out).toBe("42");
      expect(loaded.code).toBe(0);
      const executable = join(String(dir), process.platform === "win32" ? "program.exe" : "program");
      const built = await run([
        "compile",
        join(String(dir), "app.py"),
        "--backend",
        backend,
        "--outfile",
        executable,
        "--offline",
      ]);
      expect({ code: built.code, err: built.err, out: built.out }).toMatchObject({ code: 0 });
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
      expect({ out: out.replaceAll("\r\n", "\n"), err }).toEqual({
        out: "COMPILED_PYTHON_OK\n",
        err: "",
      });
      expect(code).toBe(0);
    },
    backend === "nuitka" ? 60000 : 15000,
  );
}
