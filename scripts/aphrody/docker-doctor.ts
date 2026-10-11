// Vérifie les fonctions Docker exploitées par le fork sur le PC, le vps et dbfr : moteur + magasin containerd, compose,
// buildx, réseau host, Model Runner (API 12434), Kubernetes (Docker Desktop / kind) et l'image du fork.
//   bun scripts/aphrody/docker-doctor.ts [pc|vps|dbfr ...]
const HOSTS = ["pc", "vps", "dbfr"] as const;
type Host = (typeof HOSTS)[number];
const IMAGE = "ghcr.io/aphrody-labs/bun:1.4.4";

const CHECKS: [string, string, (out: string) => boolean][] = [
  ["moteur", `docker info -f '{{.ServerVersion}} {{.DriverStatus}}'`, o => o.includes("containerd.snapshotter")],
  ["compose", "docker compose version --short", o => /^v?\d/.test(o)],
  ["buildx", "docker buildx version", o => o.includes("buildx")],
  ["réseau host", "docker run --rm --network host alpine:3.24 sh -c 'ip -4 addr | grep -c inet'", o => Number(o) > 1],
  ["model runner", "curl -sf -m5 localhost:12434/engines/v1/models", o => o.includes('"object":"list"')],
  ["kubernetes", "kubectl get nodes --no-headers", o => /\sReady\s/.test(o)],
  ["image fork", `docker image inspect -f '{{.Id}}' ${IMAGE}`, o => o.startsWith("sha256:")],
];

const sh = (host: Host, cmd: string) =>
  host === "pc" ? ["bash", "-c", cmd] : ["ssh", "-o", "BatchMode=yes", host, cmd];

async function run(host: Host, cmd: string) {
  const p = Bun.spawn(sh(host, cmd), { stdout: "pipe", stderr: "pipe" });
  const [out, code] = await Promise.all([p.stdout.text(), p.exited]);
  return { out: out.trim(), code };
}

const hosts = (process.argv.slice(2).length ? process.argv.slice(2) : HOSTS) as Host[];
let failed = 0;
const rows = await Promise.all(
  hosts.map(async h => {
    const res = await Promise.all(
      CHECKS.map(async ([name, cmd, ok]) => {
        const { out, code } = await run(h, cmd);
        const pass = code === 0 && ok(out);
        if (!pass) failed++;
        return `${pass ? "ok  " : "ÉCHEC"} ${name}${pass ? "" : `: ${out.split("\n")[0]?.slice(0, 100) ?? ""}`}`;
      }),
    );
    return `== ${h}\n${res.join("\n")}`;
  }),
);
console.log(rows.join("\n"));
process.exit(failed ? 1 : 0);
