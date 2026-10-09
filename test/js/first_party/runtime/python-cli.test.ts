// SPDX-License-Identifier: MIT
import { afterAll, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { writeFileSync } from "node:fs";
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

async function run(args: string[], input?: string, env = environment) {
  const child = Bun.spawn({
    cmd: [bunExe(), ...args],
    cwd: root,
    env,
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
