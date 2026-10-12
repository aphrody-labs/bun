// Moves the OVH-hosted DNS of the Aphrody domains to Cloudflare, idempotently:
//   1. host records (vps/dbfr A + AAAA) in the OVH zone, and the reverse DNS of both VPS IPs at OVH;
//   2. the OVH zone (aphrody-ovh dns export) mirrored into the Cloudflare zone: same records, minus SOA/NS and stale
//      ACME challenges; A/AAAA/CNAME records of web hosts are proxied when the origin presents a valid certificate
//      for the name (otherwise they stay DNS-only, as before);
//   3. --switch: registrar name servers moved to Cloudflare. A domain with OVH-hosted DNSSEC first gets its DS
//      removed (--disable-hosted); its name servers move on a later run, once the parent no longer serves a DS;
//   4. hosts served from the edge by a Worker (edge below) are proxied whatever the origin, and the Worker is
//      deployed once its zone is active (Worker routes need an active zone);
//   5. --dnssec: Cloudflare DNSSEC enabled and its DS published at OVH, for zones active on Cloudflare for 48 h
//      (the .com/.fr NS TTL), so no resolver still asks OVH for a zone the parent says is signed by Cloudflare.
//
//   bun packages/web/cloudflare/scripts/ovh.ts [--dry-run] [--switch] [--dnssec]   # prints "migration complete" once every zone is
//                                                             # active on Cloudflare and signed (timer stops)
//
// OVH: aphrody-ovh (aphrody-infra ovh) with its profiles, and the same credential files for the reverse DNS calls.
// Cloudflare: same credentials as deploy.ts.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { connect } from "node:tls";
import { wrangler } from "../../src/wrangler.ts";
import { envFile, parseEnv } from "./deploy.ts";

export const domains = [
  { name: "aphrody.com", profile: "aphrody.com" },
  { name: "dragonballfr.com", profile: "dragonballfr.com" },
  { name: "rosegriffon.fr", profile: "rosegriffon.fr" },
];

export const hosts = [
  {
    name: "vps.aphrody.com",
    profile: "aphrody.com",
    vps: "vps-203bea89.vps.ovh.net",
    ipv4: "51.77.147.152",
    ipv6: "2001:41d0:404:200::4d8e",
  },
  {
    name: "dbfr.aphrody.com",
    profile: "dragonballfr.com",
    vps: "vps-6732365f.vps.ovh.net",
    ipv4: "51.255.162.6",
    ipv6: "2001:41d0:305:2100::a461",
  },
];

/** Names never proxied: SSH/host names, mail, FTP, databases, and hosts served by another platform. */
const dnsOnly = /^(vps|dbfr|omar|ftp|db|mail|imap|pop3|smtp|autoconfig|autodiscover|shop)\./;

/** Web hosts answered by a Worker at the edge rather than by their origin, with the Worker config. */
const edge = [{ host: /(^|.)rosegriffon.fr$/, zone: "rosegriffon.fr", config: "maintenance/wrangler.jsonc" }];

const dryRun = process.argv.includes("--dry-run");
const ovhBin = process.env.APHRODY_OVH ?? join(homedir(), "AppData/Local/aphrody/bin/aphrody-ovh.exe");
const step = (message: string) => console.log(`• ${message}`);

function ovh(args: string[]): string {
  const r = Bun.spawnSync([existsSync(ovhBin) ? ovhBin : "aphrody-ovh", ...args], {
    stderr: "pipe",
  });
  if (!r.success) throw new Error(`aphrody-ovh ${args.join(" ")}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString();
}

export type Rec = {
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number;
  data?: object;
  proxied?: boolean;
};

/** Parses the BIND export of aphrody-ovh (one record per line, owner relative to the zone, blank owner = previous). */
export function parseZone(text: string, zone: string): Rec[] {
  const out: Rec[] = [];
  let owner = zone;
  let ttlDefault = 3600;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith("$TTL")) ttlDefault = Number(raw.split(/\s+/)[1]);
    if (!raw.trim() || raw.startsWith("$") || raw.trim().startsWith(";")) continue;
    const m = raw.match(/^(\S*)\s+(?:(\d+)\s+)?IN\s+([A-Z]+)\s+(.*)$/);
    if (!m) continue;
    const [, name, ttl, type, rest] = m;
    if (name === "@") owner = zone;
    else if (name) owner = name.endsWith(".") ? name.slice(0, -1) : `${name}.${zone}`;
    if (type === "SOA" || type === "NS") continue;
    const rdata = rest.trim().replace(/^\(\s*(.*?)\s*\)$/, "$1");
    const host = (h: string) => (h.endsWith(".") ? h.slice(0, -1) : `${h}.${zone}`);
    const rec: Rec = { type, name: owner, content: rdata, ttl: Number(ttl ?? ttlDefault) };
    if (type === "CNAME") rec.content = host(rdata);
    if (type === "MX") {
      const [prio, target] = rdata.split(/\s+/);
      rec.priority = Number(prio);
      rec.content = host(target);
    }
    if (type === "SRV") {
      const [priority, weight, port, target] = rdata.split(/\s+/);
      rec.data = { priority: +priority, weight: +weight, port: +port, target: host(target) };
      rec.content = `${weight} ${port} ${host(target)}`;
      rec.priority = +priority;
    }
    if (owner.startsWith("_acme-challenge.") || owner === `_acme-challenge.${zone}`) continue;
    if (!out.some(o => key(o) === key(rec))) out.push(rec);
  }
  return out;
}

const unquote = (s: string) => s.replace(/"\s+"/g, "").replace(/^"|"$/g, "");
export const key = (r: Pick<Rec, "type" | "name" | "content">) =>
  `${r.type} ${r.name.toLowerCase()} ${r.type === "TXT" ? unquote(r.content) : r.content.toLowerCase().replace(/\.$/, "")}`;

/** True when the origin presents a certificate valid for `name` (TLS handshake with SNI, CA-verified). */
export function validOrigin(ip: string, name: string): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host: ip, port: 443, servername: name, timeout: 8000 }, () => {
      resolve(socket.authorized);
      socket.end();
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// --- Cloudflare -------------------------------------------------------------------------------------------------
const env = new Proxy({} as Record<string, string>, {
  get: (cache, name: string) => {
    if (!Object.keys(cache).length) Object.assign(cache, parseEnv(readFileSync(envFile(), "utf8")), process.env);
    return cache[name];
  },
});
async function cf<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  if (dryRun && method !== "GET") {
    console.log(`  dry-run ${method} ${path} ${body ? JSON.stringify(body).slice(0, 160) : ""}`);
    return undefined as T;
  }
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as {
    success: boolean;
    result: T;
    errors: { code: number; message: string }[];
  };
  if (!json.success) throw new Error(`${method} ${path}: ${json.errors.map(e => `${e.code} ${e.message}`).join("; ")}`);
  return json.result;
}

type Zone = {
  id: string;
  name: string;
  status: string;
  name_servers: string[];
  activated_on: string | null;
};

async function zone(name: string): Promise<Zone> {
  const [found] = await cf<Zone[]>("GET", `/zones?name=${name}`);
  if (found) return found;
  step(`${name}: Cloudflare zone created`);
  return (
    (await cf<Zone>("POST", "/zones", {
      name,
      account: { id: env.CLOUDFLARE_ACCOUNT_ID },
      type: "full",
    })) ?? {
      id: "dry-run",
      name,
      status: "pending",
      name_servers: [],
      activated_on: null,
    }
  );
}

// --- OVH API (reverse DNS only; everything else goes through aphrody-ovh) ----------------------------------------
function ovhCredentials(profile: string): Record<string, string> {
  const home = homedir();
  const files =
    profile === "aphrody.com"
      ? [".config/aphrody/ovh.env", ".bash_secrets", ".config/ovh/aphrody.conf"]
      : profile === "rosegriffon.fr"
        ? [".ovh.conf", ".config/ovh/rosegriffon.conf"]
        : [".config/ovh/dbfr.conf"];
  for (const file of files.map(f => join(home, f)).filter(existsSync)) {
    const text = readFileSync(file, "utf8").replace(/^\s*(?:export\s+)?(\w+)\s*[=:]\s*/gm, "$1=");
    const vars = Object.fromEntries(
      text
        .split(/\r?\n/)
        .map(l => l.match(/^(\w+)=\s*["']?(.*?)["']?\s*$/))
        .filter(m => m !== null)
        .map(m => [m[1].toUpperCase().replace(/^(?!OVH_)/, "OVH_"), m[2]]),
    );
    if (vars.OVH_CLIENT_ID || vars.OVH_APPLICATION_KEY) return vars;
  }
  throw new Error(`no OVH credentials for ${profile}`);
}

export async function ovhApi(profile: string, method: string, path: string, body?: unknown) {
  const c = ovhCredentials(profile);
  const url = `https://eu.api.ovh.com/1.0${path}`;
  const payload = body === undefined ? "" : JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (c.OVH_CLIENT_ID) {
    const token = await fetch("https://www.ovh.com/auth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: c.OVH_CLIENT_ID,
        client_secret: c.OVH_CLIENT_SECRET,
        scope: "all",
      }),
    }).then(r => r.json() as Promise<{ access_token: string }>);
    headers.Authorization = `Bearer ${token.access_token}`;
  } else {
    const time = await fetch("https://eu.api.ovh.com/1.0/auth/time").then(r => r.text());
    const sig = new Bun.CryptoHasher("sha1")
      .update([c.OVH_APPLICATION_SECRET, c.OVH_CONSUMER_KEY, method, url, payload, time].join("+"))
      .digest("hex");
    Object.assign(headers, {
      "X-Ovh-Application": c.OVH_APPLICATION_KEY,
      "X-Ovh-Consumer": c.OVH_CONSUMER_KEY,
      "X-Ovh-Timestamp": time,
      "X-Ovh-Signature": `$1$${sig}`,
    });
  }
  const res = await fetch(url, { method, headers, body: payload || undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`OVH ${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** Forward records of the VPS host names in the OVH zone (still authoritative), then the reverse DNS of their IPs. */
async function hostRecords() {
  for (const h of hosts) {
    const zoneName = h.name.split(".").slice(1).join(".");
    const sub = h.name.split(".")[0];
    const current = parseZone(ovh(["dns", "export", zoneName, "--profile", "aphrody.com"]), zoneName);
    let added = false;
    for (const [type, ip] of [
      ["A", h.ipv4],
      ["AAAA", h.ipv6],
    ] as const) {
      if (current.some(r => r.type === type && r.name === h.name)) continue;
      if (dryRun) console.log(`  dry-run OVH ${type} ${h.name} ${ip}`);
      else ovh(["dns", "add", zoneName, type, sub, ip, "--ttl", "3600", "--profile", "aphrody.com", "--apply"]);
      step(`OVH ${zoneName}: ${type} ${h.name} ${ip}`);
      added = true;
    }
    if (added && !dryRun) ovh(["dns", "refresh", zoneName, "--profile", "aphrody.com"]);
  }
  for (const h of hosts) {
    for (const ip of [h.ipv4, h.ipv6]) {
      const block = ip.includes(":") ? `${ip}/128` : `${ip}/32`;
      const current = await ovhApi(
        h.profile,
        "GET",
        `/ip/${encodeURIComponent(block)}/reverse/${encodeURIComponent(ip)}`,
      ).catch(() => null);
      if (current?.reverse?.replace(/\.$/, "") === h.name) continue;
      if (dryRun) console.log(`  dry-run reverse ${ip} -> ${h.name}`);
      else
        await ovhApi(h.profile, "POST", `/ip/${encodeURIComponent(block)}/reverse`, {
          ipReverse: ip,
          reverse: `${h.name}.`,
        }).catch(e =>
          console.warn(`  reverse ${ip}: ${(e as Error).message} (forward record not visible yet; re-run later)`),
        );
      step(`reverse ${ip} -> ${h.name}`);
    }
  }
}

async function mirror(domain: { name: string; profile: string }, z: Zone) {
  const want = parseZone(ovh(["dns", "export", domain.name, "--profile", domain.profile]), domain.name);
  const byName = new Map(want.filter(r => ["A", "AAAA", "CNAME"].includes(r.type)).map(r => [r.name, r]));
  const origins = new Set(hosts.flatMap(h => [h.ipv4, h.ipv6]));
  const originOf = (r: Rec, depth = 0): string | null => {
    if ((r.type === "A" || r.type === "AAAA") && origins.has(r.content)) return r.content;
    const next = r.type === "CNAME" ? byName.get(r.content) : undefined;
    return next && depth < 4 ? originOf(next, depth + 1) : null;
  };
  await Promise.all(
    want.map(async r => {
      if (!["A", "AAAA", "CNAME"].includes(r.type) || dnsOnly.test(r.name)) return;
      const ip = originOf(r);
      r.proxied = ip !== null && (edge.some(e => e.host.test(r.name)) || (await validOrigin(ip, r.name)));
    }),
  );
  const existing =
    z.id === "dry-run"
      ? []
      : await cf<(Rec & { id: string; comment?: string })[]>("GET", `/zones/${z.id}/dns_records?per_page=1000`);
  const wanted = new Set(want.map(key));
  for (const r of existing) {
    if (wanted.has(key(r)) || r.comment?.includes("provision.ts") || r.content.endsWith(".cfargotunnel.com")) continue;
    await cf("DELETE", `/zones/${z.id}/dns_records/${r.id}`);
    step(`${domain.name}: - ${r.type} ${r.name} ${r.content.slice(0, 50)}`);
  }
  for (const r of want) {
    const body: Record<string, unknown> = {
      type: r.type,
      name: r.name,
      ttl: r.proxied ? 1 : Math.max(60, r.ttl),
      comment: "packages/web/cloudflare/scripts/ovh.ts (OVH mirror)",
    };
    if (r.type === "SRV") body.data = r.data;
    else body.content = r.content;
    if (r.priority !== undefined && r.type === "MX") body.priority = r.priority;
    if (["A", "AAAA", "CNAME"].includes(r.type)) body.proxied = !!r.proxied;
    const same = existing.find(e => key(e) === key(r));
    if (!same) {
      await cf("POST", `/zones/${z.id}/dns_records`, body);
      step(`${domain.name}: + ${r.type} ${r.name} ${r.content.slice(0, 50)}${r.proxied ? " (proxied)" : ""}`);
    } else if (!!same.proxied !== !!r.proxied || (!r.proxied && same.ttl !== body.ttl) || !same.comment) {
      await cf("PATCH", `/zones/${z.id}/dns_records/${(same as { id: string }).id}`, body);
      step(`${domain.name}: ~ ${r.type} ${r.name}${r.proxied ? " (proxied)" : " (DNS only)"}`);
    }
  }
}

/** Deploys the edge Worker of an active zone unless its routes already exist. */
async function edgeWorker(z: Zone) {
  for (const e of edge.filter(e => e.zone === z.name)) {
    const config = join(import.meta.dir, "..", e.config);
    const { name } = Bun.JSONC.parse(readFileSync(config, "utf8")) as { name: string };
    const routes = await cf<{ script?: string }[]>("GET", `/zones/${z.id}/workers/routes`);
    if (routes.some(r => r.script === name)) continue;
    if (dryRun) {
      step(`${z.name}: dry-run deploy ${name}`);
      continue;
    }
    const code = await wrangler(["deploy", "--config", config], {
      cwd: dirname(config),
      env: { ...env, WRANGLER_SEND_METRICS: "false" },
    }).exited;
    if (code !== 0) throw new Error(`wrangler deploy ${name} exited with ${code}`);
    step(`${z.name}: ${name} deployed`);
  }
}

/** DS of the domain as served by its parent (.com/.fr), through DNS over HTTPS. */
async function parentDs(name: string): Promise<boolean> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=DS`, {
    headers: { Accept: "application/dns-json" },
  });
  const json = (await res.json()) as { Answer?: { type: number }[] };
  return (json.Answer ?? []).some(a => a.type === 43);
}

async function switchNs(domain: { name: string; profile: string }, z: Zone) {
  const info = ovh(["domain", "info", domain.name, "--profile", domain.profile, "--json"]);
  const registrar = JSON.parse(info) as { dnssec_state: string; name_servers: string[] };
  if (JSON.stringify([...registrar.name_servers].sort()) === JSON.stringify([...z.name_servers].sort())) return;
  const hosted = registrar.dnssec_state === "enabled";
  if (hosted) {
    if (!dryRun) ovh(["domain", "dnssec", domain.name, "--profile", domain.profile, "--disable-hosted", "--apply"]);
    step(`${domain.name}: OVH-hosted DNSSEC disabled; name servers move once the parent drops the DS`);
    return;
  }
  if (await parentDs(domain.name)) {
    step(`${domain.name}: parent still serves a DS, name servers unchanged (re-run --switch later)`);
    return;
  }
  if (!dryRun) ovh(["domain", "nameservers", domain.name, ...z.name_servers, "--profile", domain.profile, "--apply"]);
  step(`${domain.name}: name servers -> ${z.name_servers.join(", ")}`);
}

async function dnssec(domain: { name: string; profile: string }, z: Zone) {
  if (z.status !== "active" || !z.activated_on || Date.now() - Date.parse(z.activated_on) < 48 * 3600 * 1000) {
    step(`${domain.name}: DNSSEC waits (zone ${z.status}${z.activated_on ? ` since ${z.activated_on}` : ""})`);
    return;
  }
  let state = await cf<{
    status: string;
    flags?: number;
    algorithm?: string;
    key_tag?: number;
    public_key?: string;
  }>("GET", `/zones/${z.id}/dnssec`);
  if (state.status === "disabled") state = await cf("PATCH", `/zones/${z.id}/dnssec`, { status: "active" });
  if (!state?.public_key || (await parentDs(domain.name))) return;
  const keyArg = `${state.flags} ${state.algorithm} ${state.key_tag} ${state.public_key}`;
  if (!dryRun) ovh(["domain", "dnssec", domain.name, "--profile", domain.profile, "--key", keyArg, "--apply"]);
  step(`${domain.name}: Cloudflare DS published at OVH (key tag ${state.key_tag})`);
}

if (import.meta.main) {
  await hostRecords();
  let complete = true;
  for (const domain of domains) {
    const z = await zone(domain.name);
    // Once Cloudflare answers for the zone it is the source of truth: the OVH copy is no longer mirrored.
    if (z.status !== "active") await mirror(domain, z);
    if (process.argv.includes("--switch")) await switchNs(domain, z);
    if (z.status === "active") await edgeWorker(z);
    if (process.argv.includes("--dnssec")) await dnssec(domain, z);
    if (z.status !== "active")
      console.log(`  ${domain.name}: ${z.status}, Cloudflare name servers ${z.name_servers.join(", ")}`);
    complete &&= z.status === "active" && (await parentDs(domain.name));
  }
  if (complete) console.log("migration complete");
}
