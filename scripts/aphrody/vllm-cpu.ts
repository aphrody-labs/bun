// SPDX-License-Identifier: MIT
// CPU-only vLLM (aphrody-labs/vllm, branch `aphrody`) driven by uv and the embedded CPython.
//
//   bun scripts/aphrody/vllm-cpu.ts env                 print the tuned environment (sh syntax)
//   bun scripts/aphrody/vllm-cpu.ts run <args…>         run `python -m vllm.entrypoints.openai.api_server <args>` with that environment
//   bun scripts/aphrody/vllm-cpu.ts update              fetch upstream, rebase `aphrody`, build when the sha changed (build host only)
//   bun scripts/aphrody/vllm-cpu.ts bench <model>       tokens/s with the default environment, then with the tuned one
//
// Home: $VLLM_CPU_HOME (default ~/vllm-cpu): src/ checkout, venv/ virtualenv, built.sha, queue.lock.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, homedir } from "node:os";
import { join } from "node:path";

const home = process.env.VLLM_CPU_HOME ?? join(homedir(), "vllm-cpu");
const src = join(home, "src");
const venv = join(home, "venv");
const FORK = "https://github.com/aphrody-labs/vllm.git";
const UPSTREAM = "https://github.com/vllm-project/vllm.git";

function flags(): Set<string> {
  try {
    const line = readFileSync("/proc/cpuinfo", "utf8").split("\n").find(l => l.startsWith("flags"));
    return new Set(line?.split(":")[1]?.trim().split(/\s+/));
  } catch {
    return new Set();
  }
}

/** ISA tier the vLLM CPU backend can use on this host: amx > avx512 > avx2. */
export function isaTier(): "amx" | "avx512" | "avx2" | "none" {
  const f = flags();
  if (f.has("amx_tile") && f.has("avx512f")) return "amx";
  if (f.has("avx512f")) return "avx512";
  return f.has("avx2") ? "avx2" : "none";
}

export function tunedEnv(): Record<string, string> {
  const logical = cpus().length;
  let smt = false;
  try {
    smt = readFileSync("/sys/devices/system/cpu/smt/active", "utf8").trim() === "1";
  } catch {}
  const physical = smt ? Math.ceil(logical / 2) : logical;
  const threads = Math.max(1, physical);
  const env: Record<string, string> = {
    VLLM_TARGET_DEVICE: "cpu",
    OMP_NUM_THREADS: String(threads),
    OMP_PROC_BIND: "close",
    OMP_PLACES: "cores",
    MKL_NUM_THREADS: String(threads),
    KMP_BLOCKTIME: "1",
    VLLM_CPU_OMP_THREADS_BIND: "auto",
    VLLM_CPU_KVCACHE_SPACE: process.env.VLLM_CPU_KVCACHE_SPACE ?? "4",
    MALLOC_ARENA_MAX: "2",
    TOKENIZERS_PARALLELISM: "false",
    BUN_PYTHON_EXECUTABLE: join(venv, "bin", "python"),
    VIRTUAL_ENV: venv,
  };
  for (const lib of ["/usr/lib/x86_64-linux-gnu/libtcmalloc_minimal.so.4", "/usr/lib/x86_64-linux-gnu/libjemalloc.so.2"]) {
    if (existsSync(lib)) {
      env.LD_PRELOAD = lib;
      break;
    }
  }
  return env;
}

async function sh(cmd: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  const p = Bun.spawn({ cmd, cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdout: "inherit", stderr: "inherit" });
  const code = await p.exited;
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited ${code}`);
}
const out = (cmd: string[], cwd?: string) => Bun.spawnSync({ cmd, cwd, stdout: "pipe" }).stdout.toString().trim();

async function update() {
  mkdirSync(home, { recursive: true });
  const lock = join(home, "queue.lock");
  try {
    mkdirSync(lock);
  } catch {
    console.log("a build is already queued or running");
    return;
  }
  try {
    if (!existsSync(src)) await sh(["git", "clone", "--branch", "aphrody", FORK, src]);
    await sh(["git", "remote", "add", "upstream", UPSTREAM], { cwd: src }).catch(() => {});
    await sh(["git", "fetch", "--no-tags", "upstream", "main"], { cwd: src });
    await sh(["git", "fetch", "--no-tags", "origin", "aphrody"], { cwd: src });
    await sh(["git", "checkout", "-q", "aphrody"], { cwd: src });
    await sh(["git", "reset", "-q", "--hard", "origin/aphrody"], { cwd: src });
    try {
      await sh(["git", "rebase", "upstream/main"], { cwd: src });
    } catch {
      await sh(["git", "rebase", "--abort"], { cwd: src }).catch(() => {});
      throw new Error("rebase on upstream/main conflicts: resolve on the fork");
    }
    const sha = out(["git", "rev-parse", "HEAD"], src);
    const marker = join(home, "built.sha");
    if (existsSync(marker) && readFileSync(marker, "utf8").trim() === sha) {
      console.log(`up to date at ${sha}`);
      return;
    }
    const tier = isaTier();
    if (tier === "none") throw new Error("host has no AVX2: vLLM CPU backend unsupported");
    const env = { ...tunedEnv(), MAX_JOBS: String(Math.max(1, Math.floor(cpus().length / 2))), CMAKE_BUILD_PARALLEL_LEVEL: String(Math.max(1, Math.floor(cpus().length / 2))) };
    // The previous environment is purged before the new one is built (one release kept).
    rmSync(venv, { recursive: true, force: true });
    await sh(["uv", "venv", venv, "--python", out(["which", "python3"])]);
    const nice = ["nice", "-n", "15"];
    const uvEnv = { ...env, VIRTUAL_ENV: venv };
    await sh([...nice, "uv", "pip", "install", "-r", "requirements/build/cpu.txt", "--extra-index-url", "https://download.pytorch.org/whl/cpu"], { cwd: src, env: uvEnv });
    await sh([...nice, "uv", "pip", "install", "-r", "requirements/cpu.txt", "--extra-index-url", "https://download.pytorch.org/whl/cpu"], { cwd: src, env: uvEnv });
    await sh([...nice, "uv", "pip", "install", ".", "--no-build-isolation"], { cwd: src, env: uvEnv });
    writeFileSync(marker, sha + "\n");
    console.log(`built ${sha} (${tier})`);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

const [cmd, ...rest] = Bun.argv.slice(2);
if (import.meta.main) {
  if (cmd === "env") {
    for (const [k, v] of Object.entries(tunedEnv())) console.log(`export ${k}='${v}'`);
  } else if (cmd === "run") {
    await sh([join(venv, "bin", "python"), "-m", "vllm.entrypoints.openai.api_server", ...rest], { env: tunedEnv() });
  } else if (cmd === "update") {
    await update();
  } else if (cmd === "bench") {
    const model = rest[0];
    if (!model) throw new Error("usage: bench <model>");
    const py = join(venv, "bin", "python");
    const script = `import time,sys\nfrom vllm import LLM,SamplingParams\nl=LLM(sys.argv[1],dtype='bfloat16',max_model_len=512)\nsp=SamplingParams(max_tokens=64,temperature=0,ignore_eos=True)\nl.generate(['warm'],sp)\nt=time.time();o=l.generate(['Write a story.']*4,sp);d=time.time()-t\nprint('tok/s',sum(len(x.outputs[0].token_ids) for x in o)/d)`;
    for (const [label, env] of [["default", {}], ["tuned", tunedEnv()]] as const) {
      console.log(`== ${label}`);
      await sh([py, "-c", script, model], { env: { VLLM_TARGET_DEVICE: "cpu", ...env } });
    }
  } else {
    console.error("usage: vllm-cpu.ts env|run|update|bench");
    process.exit(2);
  }
}
