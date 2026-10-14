import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { parseArgs } from "node:util";
import type { SiteSyncConfig } from "./sync";

class PublicationFailure extends Error {
  constructor(readonly phase: string) {
    super("Automatic site publication failed");
  }
}

/** Follow the existing source owner's archive contract, rather than maintaining another source list. */
export function jitArchivePaths(script: string): string[] {
  const line = script.split(/\r?\n/).find(line => line.startsWith('git -C "$checkout" archive '));
  const match = line?.match(/^git -C "\$checkout" archive "\$site_source" (.+) \| tar -x -C "\$work"$/);
  if (!match) throw new PublicationFailure("archive-contract");
  const paths = match[1].split(" ");
  if (paths.some(path => !/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith("/") || path.split("/").includes(".."))) {
    throw new PublicationFailure("archive-contract");
  }
  return paths;
}

export function productionReceiptQualified(receipt: unknown): receipt is {
  commit: string;
  evidence: string;
  snapshot: { source: string };
  deployment: { source: string; qualified: true; dryRun: false };
} {
  if (!receipt || typeof receipt !== "object") return false;
  const value = receipt as Record<string, any>;
  return (
    /^[a-f0-9]{40}$/.test(value.commit) &&
    /^[a-f0-9]{64}$/.test(value.evidence) &&
    value.snapshot?.source === value.commit &&
    value.deployment?.source === value.commit &&
    value.deployment?.qualified === true &&
    value.deployment?.dryRun === false
  );
}

async function run(
  phase: string,
  command: string[],
  cwd: string,
  timeout: number,
  env: NodeJS.ProcessEnv = Bun.env,
): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout,
    killSignal: "SIGKILL",
    maxBuffer: 4 * 1024 * 1024,
  });
  const [code, stdout] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new PublicationFailure(phase);
  return stdout.trim();
}

function publicationLock(path: string): (() => void) | undefined {
  let fd: number;
  try {
    fd = openSync(path, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new PublicationFailure("lock");
    let previous: { pid?: number };
    try {
      previous = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return undefined;
    }
    if (!Number.isSafeInteger(previous.pid) || previous.pid! <= 0) return undefined;
    try {
      process.kill(previous.pid!, 0);
      return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") return undefined;
    }
    rmSync(path);
    try {
      fd = openSync(path, "wx");
    } catch {
      return undefined;
    }
  }
  const nonce = crypto.randomUUID();
  writeFileSync(fd, JSON.stringify({ pid: process.pid, nonce }));
  return () => {
    closeSync(fd);
    try {
      if (JSON.parse(readFileSync(path, "utf8")).nonce === nonce) rmSync(path);
    } catch {}
  };
}

async function publish(configFile: string, bootstrapBlob: string, dryRun: boolean) {
  let phase = "config";
  let config: SiteSyncConfig | undefined;
  let release: (() => void) | undefined;
  let work: string | undefined;
  let disposable = false;
  let source: string | undefined;
  try {
    config = (await Bun.file(configFile).json()) as SiteSyncConfig;
    for (const field of [
      "checkout",
      "captureRoot",
      "buildRoot",
      "ownerConnectionFile",
      "readerConnectionFile",
      "credentialFile",
    ] as const) {
      if (typeof config[field] !== "string" || !isAbsolute(config[field])) throw new PublicationFailure(phase);
    }
    phase = "bootstrap";
    if (!/^[a-f0-9]{40}$/.test(bootstrapBlob)) throw new PublicationFailure(phase);
    const ownBlob = await run(phase, ["git", "hash-object", import.meta.path], config.checkout, 30_000);
    if (ownBlob !== bootstrapBlob) throw new PublicationFailure(phase);
    if (dryRun) return { status: "preview", intervalMinutes: 5, bootstrapVerified: true };
    mkdirSync(config.buildRoot, { recursive: true });
    release = publicationLock(join(config.buildRoot, "auto-publish.lock"));
    if (!release) return { status: "already-running" };
    const remote = config.sourceRemote ?? "origin";
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(remote)) throw new PublicationFailure("source-remote");
    phase = "fetch";
    const gitEnv = { ...Bun.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" };
    await run(
      phase,
      ["git", "fetch", "--quiet", remote, `refs/heads/main:refs/remotes/${remote}/main`],
      config.checkout,
      30_000,
      gitEnv,
    );
    source = await run(phase, ["git", "rev-parse", `refs/remotes/${remote}/main^{commit}`], config.checkout, 30_000);
    if (!/^[a-f0-9]{40}$/.test(source)) throw new PublicationFailure(phase);
    work = mkdtempSync(join(config.buildRoot, "auto-publish-"));
    const member = relative(realpathSync(config.buildRoot), realpathSync(work));
    if (!member || isAbsolute(member) || member === ".." || member.startsWith("../") || member.startsWith("..\\")) {
      throw new PublicationFailure("workspace");
    }
    disposable = true;
    phase = "archive";
    const ownerScript = await run(
      phase,
      ["git", "show", `${source}:packages/web/site/auto-publish.sh`],
      config.checkout,
      30_000,
    );
    const archive = join(work, "source.tar");
    await run(
      phase,
      ["git", "archive", "--format=tar", `--output=${archive}`, source, "--", ...jitArchivePaths(ownerScript)],
      config.checkout,
      30_000,
    );
    const archiveFile = Bun.file(archive);
    if (archiveFile.size > 512 * 1024 * 1024) throw new PublicationFailure(phase);
    await new Bun.Archive(await archiveFile.arrayBuffer()).extract(work);
    rmSync(archive);
    phase = "jit-metadata";
    const jit = join(work, "packages/web/site/jit-source.ts");
    await run(phase, [process.execPath, "--no-env-file", jit, config.checkout, source, work], work, 60_000);
    phase = "dependencies";
    await run(
      phase,
      [
        process.execPath,
        "install",
        "--cwd",
        work,
        "--filter",
        "@aphrody/web",
        "--production",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--no-progress",
        "--network-concurrency=4",
      ],
      work,
      300_000,
    );
    const installed = join(config.checkout, "packages/bun-cloudflare");
    const captured = join(work, "packages/bun-cloudflare");
    const ownerLock = await Bun.file(join(installed, "bun.lock")).bytes();
    const capturedLock = await Bun.file(join(captured, "bun.lock")).bytes();
    if (!Buffer.from(ownerLock).equals(capturedLock)) throw new PublicationFailure("dependency-lock");
    symlinkSync(
      join(installed, "node_modules"),
      join(captured, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await run(
      "dependency-receipt",
      [process.execPath, "--no-env-file", jit, config.checkout, source, work, "--verify-cloudflare"],
      work,
      60_000,
    );
    phase = "github-auth";
    const token = Bun.env.GH_TOKEN || (await run(phase, ["gh", "auth", "token"], config.checkout, 30_000));
    phase = "production-pipeline";
    await run(
      phase,
      [
        process.execPath,
        "--no-env-file",
        join(work, "packages/web/site/sync.ts"),
        "--config",
        configFile,
        "--source",
        source,
      ],
      work,
      1_200_000,
      { ...Bun.env, GH_TOKEN: token },
    );
    const receipt = await Bun.file(join(config.buildRoot, "last-sync.json")).json();
    if (!productionReceiptQualified(receipt) || receipt.commit !== source)
      throw new PublicationFailure("production-receipt");
    const result = { status: "published", source, endedAt: new Date().toISOString() };
    await Bun.write(join(config.buildRoot, "auto-publish-last.json"), JSON.stringify(result) + "\n");
    return result;
  } catch (error) {
    const result = {
      status: "failed",
      phase: error instanceof PublicationFailure ? error.phase : phase,
      source,
      endedAt: new Date().toISOString(),
    };
    if (config?.buildRoot && isAbsolute(config.buildRoot)) {
      await Bun.write(join(config.buildRoot, "auto-publish-last.json"), JSON.stringify(result) + "\n").catch(() => {});
    }
    throw new PublicationFailure(result.phase);
  } finally {
    if (work && disposable) rmSync(work, { recursive: true, force: true });
    release?.();
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    strict: true,
    options: {
      config: { type: "string" },
      "bootstrap-blob": { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });
  try {
    const config =
      values.config ?? join(Bun.env.APHRODY_HOME ?? join(homedir(), ".aphrody"), "config/bun-site-sync.json");
    console.log(JSON.stringify(await publish(config, values["bootstrap-blob"] ?? "", !!values["dry-run"])));
  } catch (error) {
    console.error(
      JSON.stringify({ status: "failed", phase: error instanceof PublicationFailure ? error.phase : "arguments" }),
    );
    process.exitCode = 1;
  }
}
