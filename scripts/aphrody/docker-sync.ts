// Synchronise les images Docker du PC, du vps et de dbfr : chaque image du profil est copiée (docker save | docker load,
// en flux) vers les hôtes qui ne l'ont pas. Une image présente avec un autre ID n'est remplacée qu'avec --force.
//   bun scripts/aphrody/docker-sync.ts [--dry-run] [--force] [--from pc|vps|dbfr] [image...]
// Profils : "all" = sur les trois hôtes ; "build" = pc + vps seulement (images lourdes de build, jamais sur la prod).
const HOSTS = ["pc", "vps", "dbfr"] as const;
type Host = (typeof HOSTS)[number];

const PROFILES: { hosts: Host[]; images: string[] }[] = [
  { hosts: ["pc", "vps", "dbfr"], images: ["ghcr.io/aphrody-labs/bun:1.4.4", "aphrody:runtime"] },
  { hosts: ["pc", "vps"], images: ["aphrody/build-linux:26.04", "aphrody/build-alpine:3.24"] },
];

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const from = args.includes("--from") ? (args[args.indexOf("--from") + 1] as Host) : undefined;
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--from");

const sh = (host: Host, cmd: string) =>
  host === "pc" ? ["bash", "-c", cmd] : ["ssh", "-o", "BatchMode=yes", host, cmd];

async function imageId(host: Host, image: string): Promise<string | null> {
  const p = Bun.spawn(sh(host, `docker image inspect -f '{{.Id}}' ${image} 2>/dev/null`), {
    stdout: "pipe",
    stderr: "ignore",
  });
  const out = (await new Response(p.stdout).text()).trim();
  return (await p.exited) === 0 && out ? out : null;
}

async function copy(image: string, src: Host, dst: Host) {
  // Les flux passent par le PC : save -> load, sans fichier intermédiaire.
  const cmd = `${sh(src, `docker save ${image}`)
    .map(a => JSON.stringify(a))
    .join(" ")} | ${sh(dst, "docker load")
    .map(a => JSON.stringify(a))
    .join(" ")}`;
  const p = Bun.spawn(["bash", "-c", cmd], { stdout: "inherit", stderr: "inherit" });
  if ((await p.exited) !== 0) throw new Error(`copie ${image} ${src} -> ${dst} échouée`);
}

let failed = 0;
for (const { hosts, images } of PROFILES) {
  for (const image of images) {
    if (only.length && !only.includes(image)) continue;
    const ids = Object.fromEntries(await Promise.all(hosts.map(async h => [h, await imageId(h, image)]))) as Record<
      Host,
      string | null
    >;
    const have = hosts.filter(h => ids[h]);
    const source = from && ids[from] ? from : have[0];
    if (!source) {
      console.error(`${image}: absente de ${hosts.join(", ")}`);
      failed++;
      continue;
    }
    for (const h of hosts) {
      if (h === source) continue;
      const diff = ids[h] && ids[h] !== ids[source];
      if (ids[h] && !diff) continue;
      if (diff && !flag("--force")) {
        console.error(
          `${image}: ${h} a un autre ID (${ids[h]!.slice(7, 19)} ≠ ${ids[source]!.slice(7, 19)}), --force pour remplacer`,
        );
        continue;
      }
      console.log(`${image}: ${source} -> ${h}`);
      if (!flag("--dry-run")) await copy(image, source, h).catch(e => (console.error(String(e)), failed++));
    }
  }
}
process.exit(failed ? 1 : 0);
