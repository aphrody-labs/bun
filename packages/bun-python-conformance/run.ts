// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type Check = { name: string; status: "passed" | "failed" | "skipped"; reason?: string };

const abiVersion = 1;
const pythonChecks = ["argv", "sys.path", "venv", "encoding", "exit", "traceback", "stdin", "-c", "-m"];

function hardware() {
  const deviceNode = ["/dev/nvidiactl", "/dev/nvidia0"].some(existsSync);
  const nvidiaSmi = spawnSync("nvidia-smi", ["--list-gpus"], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 });
  const model = process.env["VU_TORCH_TEST_MODEL"];
  return {
    nvidiaDeviceNode: deviceNode,
    nvidiaDriver: nvidiaSmi.status === 0,
    cudaHardwareAvailable: deviceNode && nvidiaSmi.status === 0,
    torchModelConfigured: model !== undefined && model.length > 0,
    torchModelPresent: model !== undefined && model.length > 0 && existsSync(model),
  };
}

export function terminalExitStatus(exitCode: number): number {
  return exitCode & 0xff;
}

function report(checks: Check[], nativeDispatchExecuted: boolean, status: "open" | "failed" | "passed") {
  return {
    schema: "aphrody.bun-python-conformance/1",
    status,
    entrypoint: "bun_py_main(argc, argv, out_exit_code)",
    systemExitContract: "A host may terminate the process during Py_BytesMain; terminal status is reported separately from returned ABI out_exit_code.",
    abiVersion,
    nativeDispatchExecuted,
    activationVerified: false,
    hardware: hardware(),
    checks,
    pending: [
      "Installed Bun/runtime activation is not exercised by this direct C ABI harness.",
      "Mixed Python/JavaScript values, Rust FFI, zero-copy buffer ownership, GC roots, callbacks, cancellation, and thread teardown remain open until the parent exposes and gates those calls.",
      "CUDA inference requires detected NVIDIA hardware and driver; model inference requires an explicitly supplied VU_TORCH_TEST_MODEL.",
    ],
  };
}

function skippedChecks(reason: string): Check[] {
  return [
    ...pythonChecks.map((name) => ({ name, status: "skipped" as const, reason })),
    { name: "pytorch-cpu-import", status: "skipped", reason },
    { name: "pytorch-cuda-import", status: "skipped", reason },
  ];
}

function sourceModule(directory: string) {
  writeFileSync(
    join(directory, "vu_conformance_module.py"),
    `import json, sys\nprint(json.dumps({"name": __name__, "found": ${JSON.stringify(directory)} in sys.path}))\n`,
  );
}

function main() {
  const library = process.env["BUN_PYTHON_HOST_LIBRARY"];
  const pythonLibrary = process.env["BUN_PYTHON_LIBPYTHON"];
  const pythonExecutable = process.env["BUN_PYTHON_EXECUTABLE"];
  if (library === undefined || library.trim() === "" || !existsSync(library)) {
    console.log(
      JSON.stringify(
        report(skippedChecks("No real shared host library was supplied in BUN_PYTHON_HOST_LIBRARY."), false, "open"),
      ),
    );
    return 77;
  }
  if (pythonLibrary === undefined || pythonLibrary.trim() === "" || !existsSync(pythonLibrary)) {
    console.log(
      JSON.stringify(
        report(skippedChecks("No explicit shared libpython was supplied in BUN_PYTHON_LIBPYTHON."), false, "open"),
      ),
    );
    return 77;
  }
  if (pythonExecutable === undefined || pythonExecutable.trim() === "" || !existsSync(pythonExecutable)) {
    console.log(
      JSON.stringify(
        report(skippedChecks("No installed Python executable was supplied in BUN_PYTHON_EXECUTABLE."), false, "open"),
      ),
    );
    return 77;
  }
  if (process.platform !== "linux" && process.platform !== "darwin") {
    console.log(
      JSON.stringify(report(skippedChecks("The dynamic ABI driver is currently qualified only on POSIX."), false, "open")),
    );
    return 77;
  }

  const temporary = mkdtempSync(join(tmpdir(), "bun-python-conformance-"));
  try {
    const driver = join(temporary, "bun-python-conformance");
    const compiler = process.env["CC"] ?? "cc";
    const compileArgs = ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-o", driver, join(import.meta.dir, "driver.c")];
    if (process.platform === "linux") compileArgs.push("-ldl");
    const compile = spawnSync(compiler, compileArgs, { encoding: "utf8" });
    if (compile.status !== 0) {
      console.log(
        JSON.stringify(
          report(
            [{ name: "compile-native-driver", status: "failed", reason: compile.error?.message ?? compile.stderr.trim() }],
            false,
            "failed",
          ),
        ),
      );
      return 1;
    }

    const probe = spawnSync(driver, ["--probe", resolve(library)], { encoding: "utf8" });
    if (probe.status === 86) {
      console.log(JSON.stringify(report(skippedChecks("The configured library does not expose bun_py_abi_version and bun_py_main yet."), false, "open")));
      return 77;
    }
    if (probe.status !== 0) {
      const check = { name: "abi-v1-probe", status: "failed" as const, reason: probe.stderr.trim() || probe.stdout.trim() };
      console.log(JSON.stringify(report([check, ...skippedChecks("ABI v1 probe failed.")], false, "failed")));
      return 1;
    }

    const scratch = join(temporary, "python");
    const modules = join(scratch, "modules");
    mkdirSync(modules, { recursive: true });
    sourceModule(modules);

    const checks: Check[] = [{ name: "abi-v1-probe", status: "passed" }];
    let nativeDispatchExecuted = false;
    function invoke(name: string, executable: string, args: string[], expectedExit: number, validate: (stdout: string, stderr: string) => string | undefined, options: { env?: Record<string, string>; input?: string } = {}): InvocationResult {
      const result = spawnSync(driver, ["--invoke", resolve(library), resolve(pythonLibrary), "--", resolve(executable), ...args], {
        encoding: "utf8",
        env: { ...process.env, ...options.env },
        input: options.input,
      });
      const marker = /^BUN_PY_CONFORMANCE phase=(load|main) host_status=(-?\d+) python_exit=(-?\d+)\r?$/m;
      const markers = [...result.stderr.matchAll(new RegExp(marker.source, "gm"))];
      const loadMarker = markers.find((entry) => entry[1] === "load");
      const mainMarker = markers.find((entry) => entry[1] === "main");
      const pythonStderr = result.stderr.replace(new RegExp(marker.source, "gm"), "").trim();
      let failure: string | undefined;
      if (loadMarker === undefined) failure = `native host did not report aphrody_py_load (driver=${result.status})`;
      else if (Number(loadMarker[2]) !== 0) failure = `aphrody_py_load returned status ${loadMarker[2]}`;
      else if (mainMarker !== undefined && Number(mainMarker[2]) !== 0)
        failure = `bun_py_main returned host status ${mainMarker[2]}`;
      else {
        nativeDispatchExecuted = true;
        if (mainMarker !== undefined) {
          if (Number(mainMarker[3]) !== expectedExit) failure = `expected returned Python exit ${expectedExit}, received ${mainMarker[3]}`;
          else if (result.status !== 0) failure = `driver exited ${result.status} after bun_py_main returned`;
        } else if (result.status === null) {
          failure = `native host terminated by signal ${result.signal ?? "unknown"} before returning from bun_py_main`;
        } else if (terminalExitStatus(expectedExit) !== result.status) {
          failure = `expected terminal Python exit ${terminalExitStatus(expectedExit)}, received process exit ${result.status}`;
        }
      }
      if (failure === undefined) failure = validate(result.stdout, pythonStderr);
      checks.push(failure === undefined ? { name, status: "passed" } : { name, status: "failed", reason: failure });
      return { stdout: result.stdout, stderr: pythonStderr, failure };
    }

    invoke(
      "argv-and-utf8-argument",
      resolve(pythonExecutable),
      ["-c", "import json,sys; print(json.dumps(sys.argv, ensure_ascii=True))", "alpha", "café"],
      0,
      (stdout) => {
        try {
          const argv = JSON.parse(stdout) as string[];
          return argv[0] === "-c" && argv[1] === "alpha" && argv[2] === "café" ? undefined : `unexpected sys.argv ${stdout.trim()}`;
        } catch {
          return `invalid sys.argv JSON ${stdout.trim()}`;
        }
      },
    );

    invoke(
      "m-mode-and-sys.path",
      resolve(pythonExecutable),
      ["-m", "vu_conformance_module"],
      0,
      (stdout) => {
        try {
          const value = JSON.parse(stdout) as { name: string; found: boolean };
          return value.name === "__main__" && value.found ? undefined : `unexpected -m/sys.path result ${stdout.trim()}`;
        } catch {
          return `invalid -m result ${stdout.trim()}`;
        }
      },
      { env: { PYTHONPATH: modules } },
    );

    invoke(
      "venv-create",
      resolve(pythonExecutable),
      ["-m", "venv", "--without-pip", join(scratch, ".venv")],
      0,
      (stdout) => (stdout.length === 0 ? undefined : `unexpected venv creation output ${stdout.trim()}`),
    );
    const venvPython = join(scratch, ".venv", "bin", "python");
    if (!existsSync(venvPython)) {
      checks.push({ name: "venv-executable-discovery", status: "failed", reason: `created venv has no executable at ${venvPython}` });
    }
    invoke(
      "venv-executable-prefix-and-site-packages",
      venvPython,
      ["-c", "import json,site,sys; print(json.dumps({'executable':sys.executable,'prefix':sys.prefix,'base':sys.base_prefix,'site':site.getsitepackages()}))"],
      0,
      (stdout) => {
        try {
          const value = JSON.parse(stdout) as { executable: string; prefix: string; base: string; site: string[] };
          return resolve(value.executable) === resolve(venvPython) && resolve(value.prefix) === resolve(join(scratch, ".venv")) && value.base !== value.prefix && value.site.some((path) => path.startsWith(value.prefix))
            ? undefined
            : `venv prefix was not selected: ${stdout.trim()}`;
        } catch {
          return `invalid venv metadata ${stdout.trim()}`;
        }
      },
      { env: { VIRTUAL_ENV: join(scratch, ".venv") } },
    );

    invoke(
      "utf8-stdio-encoding",
      resolve(pythonExecutable),
      ["-c", "import sys; sys.stdout.write('café 東京|' + sys.stdout.encoding)"],
      0,
      (stdout) => (stdout === "café 東京|utf-8" ? undefined : `UTF-8 output mismatch ${JSON.stringify(stdout)}`),
      { env: { PYTHONIOENCODING: "utf-8:strict" } },
    );
    invoke(
      "stdin-bytes",
      resolve(pythonExecutable),
      ["-c", "import sys; sys.stdout.write(sys.stdin.buffer.read().hex())"],
      0,
      (stdout) => (stdout === Buffer.from("stdin café\n", "utf8").toString("hex") ? undefined : `stdin mismatch ${stdout}`),
      { input: "stdin café\n" },
    );
    invoke("-c-dispatch", resolve(pythonExecutable), ["-c", "print('native-c')"], 0, (stdout) => (stdout === "native-c\n" ? undefined : `unexpected output ${stdout}`));
    invoke("positive-exit-code-terminal", resolve(pythonExecutable), ["-c", "raise SystemExit(7)"], 7, () => undefined);
    invoke("negative-exit-code-terminal", resolve(pythonExecutable), ["-c", "raise SystemExit(-1)"], -1, () => undefined);
    invoke(
      "traceback-and-error-exit",
      resolve(pythonExecutable),
      ["-c", "raise RuntimeError('native-conformance-traceback')"],
      1,
      (_, stderr) => (stderr.includes("Traceback") && stderr.includes("native-conformance-traceback") ? undefined : "Python traceback was not preserved"),
    );

    const torch = invoke(
      "pytorch-cpu-import",
      resolve(pythonExecutable),
      ["-c", "import json,torch; x=torch.tensor([2,3],device='cpu').add(1); print(json.dumps({'version':torch.__version__,'cpu':x.tolist(),'cuda':torch.cuda.is_available()}))"],
      0,
      (stdout) => {
        try {
          const value = JSON.parse(stdout) as { version: string; cpu: number[]; cuda: boolean };
          return value.version.length > 0 && value.cpu.join(",") === "3,4" ? undefined : "PyTorch CPU tensor operation returned an unexpected result";
        } catch {
          return `PyTorch import output was invalid: ${stdout.trim()}`;
        }
      },
    );

    if (torch.failure !== undefined && /ModuleNotFoundError: No module named ['"]torch['"]/.test(torch.stderr)) {
      const at = checks.findIndex((check) => check.name === "pytorch-cpu-import");
      checks[at] = { name: "pytorch-cpu-import", status: "skipped", reason: "The selected native runtime has no installed PyTorch module." };
      checks.push({ name: "pytorch-cuda-import", status: "skipped", reason: "PyTorch is not installed in the selected native runtime." });
    } else if (torch.failure !== undefined) {
      checks.push({ name: "pytorch-cuda-import", status: "skipped", reason: "CPU PyTorch import failed; CUDA was not attempted." });
    } else if (!hardware().cudaHardwareAvailable) {
      checks.push({ name: "pytorch-cuda-import", status: "skipped", reason: "No NVIDIA device and working nvidia-smi driver were detected." });
    } else {
      invoke(
        "pytorch-cuda-import-and-tensor",
        resolve(pythonExecutable),
        ["-c", "import torch; x=torch.tensor([2,3],device='cuda').add(1); print(','.join(map(str,x.cpu().tolist())))"],
        0,
        (stdout) => (stdout.trim() === "3,4" ? undefined : `unexpected CUDA tensor result ${stdout.trim()}`),
      );
    }

    checks.push({
      name: "pytorch-model-inference",
      status: "skipped",
      reason: hardware().torchModelPresent
        ? "Weights were configured, but this harness does not select or load a model."
        : "No explicit VU_TORCH_TEST_MODEL weights were supplied; no model inference was attempted.",
    });
    const failed = checks.some((check) => check.status === "failed");
    const open = checks.some((check) => check.status === "skipped");
    console.log(JSON.stringify(report(checks, nativeDispatchExecuted, failed ? "failed" : open ? "open" : "passed")));
    return failed ? 1 : open ? 77 : 0;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exit(main());
