#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Deploys the unified app to a host as the user service `aphrody-desktop`, in public mode: it listens on
 * 127.0.0.1 with hostAccess off (no terminal, files, processes or eval). Transport and remote commands use the
 * Bun fork's own SSH client (`bun ssh cp --native`, `bun ssh exec`), never the platform scp.
 *
 *   bun scripts/deploy-vps.ts [--host vps] [--port 18791] [--keep 3]            print the plan, change nothing
 *   bun scripts/deploy-vps.ts --apply [--skip-build] [--allow-dirty]             build, test, upload, switch, verify
 *   bun scripts/deploy-vps.ts --rollback                                         point `current` at the previous release
 *
 * An apply builds dist/, runs the dist smoke test, ships an archive checked by SHA-256, unpacks it as a new
 * release beside the others, switches the `current` link, restarts the service and probes it. If the probe fails,
 * the link and the service go back to the previous release and the script exits 1.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = Bun.argv.slice(2);
const value = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const host = value("--host", "vps");
const port = Number(value("--port", "18791"));
const keep = Number(value("--keep", "3"));
const apply = args.includes("--apply");
const rollback = args.includes("--rollback");
if (!/^[A-Za-z0-9_.@-]+$/.test(host)) throw new Error("--host must be an SSH alias or user@host");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port must be 1024..65535");
if (!Number.isInteger(keep) || keep < 2 || keep > 20) throw new Error("--keep must be 2..20");

const desktop = resolve(import.meta.dir, "..");
const bun = process.execPath;
const base = "apps/aphrody-desktop";

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(command: string[], cwd = desktop): Promise<Result> {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code: await child.exited, stdout, stderr };
}

/** Runs a bash script on the host through `bun ssh exec --json`. */
async function remote(script: string): Promise<Result> {
  const result = await run([bun, "ssh", "exec", "--json", host, "bash", "-lc", script]);
  if (result.code !== 0 && !result.stdout.startsWith("{")) return result;
  try {
    return JSON.parse(result.stdout) as Result;
  } catch {
    return result;
  }
}

const step = (message: string) => console.log(`\n== ${message}`);
const fail = (message: string, detail = ""): never => {
  console.error(`\nFAILED: ${message}${detail ? `\n${detail.trim()}` : ""}`);
  process.exit(1);
};

const unit = (name: string) => `[Unit]
Description=Aphrody desktop: the unified app in public mode (no terminal, files or eval)
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/${base}/current
Environment=NODE_ENV=production
ExecStart=%h/.local/bin/bun server.js --hostname 127.0.0.1 --port ${port} --no-host-access --media %h/${base}/media --data %h/${base}/data
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes
MemoryMax=1G

[Install]
WantedBy=default.target
# release ${name}
`;

// --- Rollback ---------------------------------------------------------------------------------------------------

if (rollback) {
  step(`rollback on ${host}`);
  const result = await remote(`set -euo pipefail
cd "$HOME/${base}/releases"
current="$(basename "$(readlink ../current)")"
previous="$(ls -1 | grep -E '^[0-9]{8}-[0-9]{6}-[0-9a-f]+$' | sort | grep -B1 -x "$current" | head -n1)"
if [ -z "$previous" ] || [ "$previous" = "$current" ]; then echo "no earlier release than $current"; exit 2; fi
ln -sfn "$HOME/${base}/releases/$previous" ../current
systemctl --user restart aphrody-desktop.service
sleep 3
systemctl --user is-active aphrody-desktop.service
echo "now serving $previous (was $current)"`);
  console.log(result.stdout + result.stderr);
  process.exit(result.code);
}

// --- Plan -------------------------------------------------------------------------------------------------------

const revision = (await run(["git", "rev-parse", "--short=10", "HEAD"])).stdout.trim();
const dirty = (await run(["git", "status", "--porcelain", "--", "."])).stdout.trim();
if (!/^[0-9a-f]{10}$/.test(revision)) fail("not inside a git checkout");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const release = `${stamp}-${revision}`;
const archive = `aphrody-desktop-${revision}.tgz`;

step(`plan: release ${release} to ${host}`);
const facts = await remote(`echo "user: $(whoami)"; echo "bun: $("$HOME/.local/bin/bun" --version)"; echo "service: $(systemctl --user is-active aphrody-desktop.service 2>&1 || true)"; echo "current: $(readlink "$HOME/${base}/current" 2>/dev/null || echo none)"; echo "port ${port} in use: $(ss -ltn | grep -c ":${port} " || true)"; df -h "$HOME" | tail -1`);
console.log(facts.stdout.trim() || facts.stderr.trim());
console.log(`
  1. ${args.includes("--skip-build") ? "(skipped)" : "bun build.ts, then the dist smoke test"}
  2. archive dist/ and upload it with \`bun ssh cp --native\` to ~/${base}/incoming/${archive}
  3. check its SHA-256 on the host, unpack to ~/${base}/releases/${release}
  4. switch ~/${base}/current, install and restart the user service on 127.0.0.1:${port} (hostAccess off)
  5. probe /, /api/video/works and /manifest.webmanifest; on failure restore the previous release
  6. keep the ${keep} newest releases, remove older ones under ~/${base}/releases only`);
if (dirty) console.log(`\n  uncommitted changes under apps/desktop:\n${dirty.split("\n").map(line => `    ${line}`).join("\n")}`);
if (!apply) {
  console.log("\nNothing changed. Run again with --apply to deploy.");
  process.exit(0);
}
if (dirty && !args.includes("--allow-dirty")) fail("refusing to deploy uncommitted code (use --allow-dirty to override)");
if (facts.code !== 0) fail("the host is not reachable", facts.stderr);

// --- Apply ------------------------------------------------------------------------------------------------------

if (!args.includes("--skip-build")) {
  step("build");
  const build = await run([bun, "build.ts"]);
  if (build.code !== 0) fail("build failed", build.stderr || build.stdout);
  step("smoke test of dist");
  const smoke = await run([bun, "scripts/smoke-dist.ts"]);
  console.log(smoke.stdout.trim());
  if (smoke.code !== 0) fail("the dist smoke test failed", smoke.stderr);
}

step("archive");
const work = await mkdtemp(join(tmpdir(), "aphrody-deploy-"));
const local = join(work, archive);
const packed = await run(["tar", "-czf", local, "-C", join(desktop, "dist"), "."]);
if (packed.code !== 0) fail("could not create the archive", packed.stderr);
const bytes = new Uint8Array(await Bun.file(local).arrayBuffer());
const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
console.log(`${archive}: ${bytes.byteLength} bytes, sha256 ${sha256}`);

step("upload");
const prepare = await remote(`mkdir -p "$HOME/${base}/incoming" "$HOME/${base}/releases" "$HOME/${base}/media" "$HOME/${base}/data" "$HOME/.config/systemd/user"`);
if (prepare.code !== 0) fail("could not prepare the host directories", prepare.stderr);
const upload = await run([bun, "ssh", "cp", "--native", local, `${host}:${base}/incoming/${archive}`]);
if (upload.code !== 0) fail("upload failed", upload.stderr || upload.stdout);

step("install and verify");
const unitB64 = Buffer.from(unit(release)).toString("base64");
const install = await remote(`set -euo pipefail
base="$HOME/${base}"
cd "$base/incoming"
echo "${sha256}  ${archive}" | sha256sum -c -
mkdir -p "$base/releases/${release}"
tar -xzf "${archive}" -C "$base/releases/${release}"
previous="$(readlink "$base/current" || true)"
echo "previous release: \${previous:-none}"
ln -sfn "$base/releases/${release}" "$base/current"
echo ${unitB64} | base64 -d > "$HOME/.config/systemd/user/aphrody-desktop.service"
systemctl --user daemon-reload
systemctl --user enable aphrody-desktop.service
systemctl --user restart aphrody-desktop.service
ok=0
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${port}/robots.txt" && curl -fsS "http://127.0.0.1:${port}/api/video/works" | grep -q '"works"' && curl -fsS -o /dev/null "http://127.0.0.1:${port}/manifest.webmanifest"; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != 1 ]; then
  journalctl --user -u aphrody-desktop.service -n 30 --no-pager || true
  if [ -n "$previous" ]; then ln -sfn "$previous" "$base/current"; systemctl --user restart aphrody-desktop.service || true; echo "rolled back to $previous"; fi
  exit 1
fi
echo "service: $(systemctl --user is-active aphrody-desktop.service)"
curl -fsS -o /dev/null -w "GET / -> %{http_code}\\n" "http://127.0.0.1:${port}/"
cd "$base/releases"
ls -1 | grep -E '^[0-9]{8}-[0-9]{6}-[0-9a-f]+$' | sort | head -n -${keep} | while read -r old; do
  [ "$old" != "$(basename "$(readlink "$base/current")")" ] && rm -rf -- "$base/releases/$old" && echo "pruned $old"
done || true
echo done`);
console.log(install.stdout.trim());
if (install.code !== 0) fail("the release did not become healthy and was rolled back", install.stderr);
console.log(`\nDeployed ${release} to ${host} (127.0.0.1:${port}, public mode).`);
