// Runs .github/workflows/*.yml locally with nektos/act on the local Docker,
// mapped by .actrc onto the Aphrody build images, so a workflow is checked
// before a push without spending GitHub Actions minutes.
//
//   bun scripts/aphrody/act.ts list
//   bun scripts/aphrody/act.ts run <workflow> [act args...]          (e.g. -j publish, -n for a dry run)
//   bun scripts/aphrody/act.ts tmux <name> <workflow> [act args...]  (background job ci-<name>, see tmux.ts)

import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");
// Docker Desktop's engine is a named pipe on Windows; elsewhere act finds the socket itself.
const SOCKET = process.platform === "win32" ? ["--container-daemon-socket", "npipe:////./pipe/docker_engine"] : [];
// `-s NAME` makes act read the value from its environment, so no secret appears in argv or logs.
const SECRETS = ["NPM_TOKEN", "GITHUB_TOKEN", "CARGO_REGISTRY_TOKEN"]
  .filter(s => process.env[s])
  .flatMap(s => ["-s", s]);

function workflow(query: string): string {
  for (const p of [query, join(WORKFLOWS, query), join(WORKFLOWS, `${query}.yml`), join(WORKFLOWS, `${query}.yaml`)])
    if (existsSync(p)) return resolve(p);
  const files = readdirSync(WORKFLOWS).filter(f => /\.ya?ml$/.test(f));
  const match = files.filter(f => f.toLowerCase().includes(query.toLowerCase()));
  if (match.length === 1) return join(WORKFLOWS, match[0]!);
  throw new Error(
    `${match.length ? "ambiguous" : "no"} workflow matching "${query}": ${(match.length ? match : files).join(", ")}`,
  );
}

function actArgs(rest: string[]): string[] {
  const target = rest.shift();
  if (!target) throw new Error("workflow required");
  return ["-W", workflow(target), ...SOCKET, ...SECRETS, ...rest];
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  switch (cmd) {
    case "list":
    case "ls":
      process.exit(
        Bun.spawnSync(["act", "-l", ...SOCKET], { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] }).exitCode,
      );
    case "run": {
      const args = actArgs(rest);
      console.log(`$ act ${args.join(" ")}`);
      process.exit(await Bun.spawn(["act", ...args], { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] }).exited);
    }
    case "tmux": {
      const name = rest.shift();
      if (!name) throw new Error("job name required");
      const args = actArgs(rest);
      const job = ["act", ...args].map(a => (/[\s'"]/.test(a) ? `'${a.replaceAll("'", "''")}'` : a)).join(" ");
      const tmux = join(import.meta.dir, "tmux.ts");
      process.exit(
        Bun.spawnSync([process.execPath, tmux, "run", `ci-${name}`, "--", job], {
          cwd: ROOT,
          stdio: ["inherit", "inherit", "inherit"],
        }).exitCode,
      );
    }
    default:
      console.log(
        `usage: bun scripts/aphrody/act.ts list | run <workflow> [act args] | tmux <name> <workflow> [act args]\n(${basename(WORKFLOWS)}: .github/workflows)`,
      );
  }
} catch (err) {
  console.error(`error: ${(err as Error).message}`);
  process.exit(1);
}
