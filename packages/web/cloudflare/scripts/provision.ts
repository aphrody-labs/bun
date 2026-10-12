// Idempotent Cloudflare provisioning for aphrody.app and its account: zone security/performance settings,
// DNSSEC, DNS records (CAA, no-mail policy), www redirect, R2 buckets with CDN custom domains, CORS, lifecycle and
// cache rules, smart tiered cache, AI Gateway, Vectorize indexes. Re-running converges to the same state.
//
//   bun packages/web/cloudflare/scripts/provision.ts [--dry-run] [--only zones,ai,vectorize]
//
// Credentials come from the same place as deploy.ts (app/.env, else ~/.aphrody/config/cloudflare.env).
import { envFile, parseEnv } from "./deploy.ts";

const env = { ...parseEnv(await Bun.file(envFile()).text()), ...process.env } as Record<string, string>;
const account = env.CLOUDFLARE_ACCOUNT_ID;
const dryRun = process.argv.includes("--dry-run");
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt >= 0 ? new Set(process.argv[onlyAt + 1]?.split(",")) : undefined;
const wants = (step: string) => !only || only.has(step);
if (!account || !env.CLOUDFLARE_API_TOKEN)
  throw new Error(`${envFile()} lacks CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN`);

type Envelope<T> = { success: boolean; result: T; errors: { code: number; message: string }[] };

async function cf<T = any>(method: string, path: string, body?: unknown, allow: number[] = []): Promise<T> {
  if (dryRun && method !== "GET") {
    console.log(`dry-run ${method} ${path}`);
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
  const json = (await res.json()) as Envelope<T>;
  if (!json.success && !json.errors.some(e => allow.includes(e.code)))
    throw new Error(`${method} ${path}: ${json.errors.map(e => `${e.code} ${e.message}`).join("; ")}`);
  return json.result;
}

const step = (message: string) => console.log(`• ${message}`);

export const site = "aphrody.app";
export const zones = ["aphrody.app", "aphrody.com", "dragonballfr.com", "rosegriffon.fr"];
// Objects are cached 30 days at the edge; on hosts with `channels`, versioned paths a year and the channel files
// (latest.json, manifest.json, rewritten in place by scripts/aphrody/release-r2.ts) a minute. r2.dev stays off.
export const cdn: { bucket: string; domain: string; channels?: boolean }[] = [
  { bucket: "aphrody", domain: "cdn.aphrody.app" },
  { bucket: "dragonballfr", domain: "dragonballfr.aphrody.app" },
  { bucket: "aphrody-assets", domain: "assets.aphrody.app" },
  { bucket: "aphrody-dist", domain: "dist.aphrody.app", channels: true },
];
export const corsOrigins = [
  "https://aphrody.app",
  "https://www.aphrody.app",
  "https://aphrody.com",
  "https://dragonballfr.com",
  "https://www.dragonballfr.com",
];

// Free-plan settings. Rocket Loader and email obfuscation stay off: both inject scripts the site CSP forbids.
export const settings: Record<string, unknown> = {
  ssl: "strict",
  always_use_https: "on",
  min_tls_version: "1.2",
  tls_1_3: "zrt",
  automatic_https_rewrites: "on",
  opportunistic_encryption: "on",
  http3: "on",
  "0rtt": "on",
  early_hints: "on",
  ipv6: "on",
  websockets: "on",
  brotli: "on",
  speed_brain: "on",
  rocket_loader: "off",
  email_obfuscation: "off",
  browser_cache_ttl: 0,
  security_header: {
    strict_transport_security: {
      enabled: true,
      max_age: 63072000,
      include_subdomains: true,
      preload: true,
      nosniff: true,
    },
  },
};

async function zoneSettings(zone: { id: string; name: string }) {
  const current = new Map(
    (await cf<{ id: string; value: unknown }[]>("GET", `/zones/${zone.id}/settings`)).map(s => [s.id, s.value]),
  );
  for (const [id, value] of Object.entries(settings)) {
    const now = current.get(id);
    // includeSubDomains/preload only on aphrody.app (.app is HSTS-preloaded anyway); the other zones keep hosts
    // whose subdomains may not all serve HTTPS yet.
    const hsts = zone.name === site ? {} : { include_subdomains: false, preload: false };
    const want =
      id === "security_header"
        ? { strict_transport_security: { ...(value as any).strict_transport_security, ...hsts } }
        : value;
    if (JSON.stringify(now) === JSON.stringify(want)) continue;
    try {
      await cf("PATCH", `/zones/${zone.id}/settings/${id}`, { value: want });
      step(`${zone.name}: ${id} = ${JSON.stringify(want)}`);
    } catch (e) {
      console.warn(`  ${zone.name}: ${id} skipped (${(e as Error).message})`);
    }
  }
  await cf("PATCH", `/zones/${zone.id}/cache/tiered_cache_smart_topology_enable`, { value: "on" });
}

type DnsRecord = {
  id?: string;
  type: string;
  name: string;
  content?: string;
  data?: object;
  priority?: number;
  ttl?: number;
  proxied?: boolean;
};

/** DNS records owned by this script for the site zone: CAA for the CAs Cloudflare uses, and an explicit no-mail policy. */
export function records(name: string): DnsRecord[] {
  const caa = (tag: string, value: string): DnsRecord => ({
    type: "CAA",
    name,
    data: { flags: 0, tag, value },
    ttl: 1,
  });
  return [
    ...["letsencrypt.org", "pki.goog; cansignhttpexchanges=yes", "ssl.com"].flatMap(ca => [
      caa("issue", ca),
      caa("issuewild", ca),
    ]),
    caa("iodef", "mailto:contact@aphrody.com"),
    { type: "MX", name, content: ".", priority: 0, ttl: 1 },
    { type: "TXT", name, content: '"v=spf1 -all"', ttl: 1 },
    {
      type: "TXT",
      name: `_dmarc.${name}`,
      content: '"v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s"',
      ttl: 1,
    },
    { type: "TXT", name: `*._domainkey.${name}`, content: '"v=DKIM1; p="', ttl: 1 },
  ];
}

const sameRecord = (a: DnsRecord, b: DnsRecord) =>
  a.type === b.type &&
  a.name === b.name &&
  (a.type === "CAA"
    ? JSON.stringify(a.data) === JSON.stringify({ flags: 0, ...(b.data as object) })
    : a.content?.replace(/^"|"$/g, "") === b.content?.replace(/^"|"$/g, ""));

async function dns(zone: { id: string; name: string }) {
  const existing = await cf<DnsRecord[]>("GET", `/zones/${zone.id}/dns_records?per_page=500`);
  for (const record of records(zone.name)) {
    if (existing.some(r => sameRecord(r, record))) continue;
    await cf("POST", `/zones/${zone.id}/dns_records`, {
      ...record,
      comment: "packages/web/cloudflare/scripts/provision.ts",
    });
    step(`${zone.name}: DNS ${record.type} ${record.name} ${record.content ?? JSON.stringify(record.data)}`);
  }
  const dnssec = await cf<{ status: string; ds?: string }>("GET", `/zones/${zone.id}/dnssec`);
  if (dnssec.status === "disabled") {
    await cf("PATCH", `/zones/${zone.id}/dnssec`, { status: "active" });
    step(`${zone.name}: DNSSEC enabled`);
  }
}

type Rule = {
  ref: string;
  description: string;
  expression: string;
  action: string;
  action_parameters?: object;
};

/** Replaces the rules this script owns (ref prefix "aphrody-") in a zone entry-point ruleset, keeping the others. */
async function entrypoint(zone: { id: string; name: string }, phase: string, rules: Rule[]) {
  const current = await cf<{ rules?: (Rule & { id: string })[] } | null>(
    "GET",
    `/zones/${zone.id}/rulesets/phases/${phase}/entrypoint`,
    undefined,
    [10003],
  );
  const kept = (current?.rules ?? []).filter(r => !r.ref?.startsWith("aphrody-"));
  const strip = (r: Rule) => ({
    ref: r.ref,
    description: r.description,
    expression: r.expression,
    action: r.action,
    action_parameters: r.action_parameters,
  });
  const owned = (current?.rules ?? []).filter(r => r.ref?.startsWith("aphrody-")).map(strip);
  if (JSON.stringify(owned) === JSON.stringify(rules.map(strip))) return;
  await cf("PUT", `/zones/${zone.id}/rulesets/phases/${phase}/entrypoint`, {
    rules: [...kept.map(({ id: _id, ...r }) => r), ...rules],
  });
  step(`${zone.name}: ${phase} (${rules.map(r => r.ref).join(", ")})`);
}

const hosts = (list: { domain: string }[]) => `(http.host in {${list.map(c => `"${c.domain}"`).join(" ")}})`;

async function siteRules(zone: { id: string; name: string }) {
  await entrypoint(zone, "http_request_dynamic_redirect", [
    {
      ref: "aphrody-www",
      description: "www.aphrody.app -> aphrody.app",
      expression: `(http.host eq "www.${zone.name}")`,
      action: "redirect",
      action_parameters: {
        from_value: {
          status_code: 301,
          preserve_query_string: true,
          target_url: { expression: `concat("https://${zone.name}", http.request.uri.path)` },
        },
      },
    },
  ]);
  await entrypoint(zone, "http_request_cache_settings", [
    {
      ref: "aphrody-r2-cdn",
      description: "R2 CDN hosts: cache everything for 30 days at the edge",
      expression: hosts(cdn.filter(c => !c.channels)),
      action: "set_cache_settings",
      action_parameters: {
        cache: true,
        edge_ttl: { mode: "override_origin", default: 2592000 },
        browser_ttl: { mode: "respect_origin" },
        serve_stale: { disable_stale_while_updating: false },
      },
    },
    {
      ref: "aphrody-r2-versioned",
      description: "R2 release hosts: versioned objects for a year",
      expression: hosts(cdn.filter(c => c.channels)),
      action: "set_cache_settings",
      action_parameters: {
        cache: true,
        edge_ttl: { mode: "override_origin", default: 31536000 },
        browser_ttl: { mode: "override_origin", default: 31536000 },
        serve_stale: { disable_stale_while_updating: false },
      },
    },
    {
      ref: "aphrody-r2-channels",
      description: "R2 release channels: a minute",
      expression: `${hosts(cdn.filter(c => c.channels))} and (ends_with(http.request.uri.path, "/latest.json") or ends_with(http.request.uri.path, "/manifest.json"))`,
      action: "set_cache_settings",
      action_parameters: {
        cache: true,
        edge_ttl: { mode: "override_origin", default: 60 },
        browser_ttl: { mode: "override_origin", default: 60 },
      },
    },
  ]);
}

async function r2(zoneId: string) {
  const buckets = new Set(
    (await cf<{ buckets: { name: string }[] }>("GET", `/accounts/${account}/r2/buckets?per_page=100`)).buckets.map(
      b => b.name,
    ),
  );
  for (const { bucket, domain } of cdn) {
    if (!buckets.has(bucket)) {
      await cf("POST", `/accounts/${account}/r2/buckets`, { name: bucket, locationHint: "weur" });
      step(`R2 ${bucket} created`);
    }
    const domains = await cf<{ domains: { domain: string }[] }>(
      "GET",
      `/accounts/${account}/r2/buckets/${bucket}/domains/custom`,
    );
    if (!domains.domains.some(d => d.domain === domain)) {
      await cf("POST", `/accounts/${account}/r2/buckets/${bucket}/domains/custom`, {
        domain,
        zoneId,
        enabled: true,
        minTLS: "1.2",
      });
      step(`R2 ${bucket}: custom domain https://${domain}`);
    }
    const managed = await cf<{ enabled: boolean }>("GET", `/accounts/${account}/r2/buckets/${bucket}/domains/managed`);
    if (managed.enabled) {
      await cf("PUT", `/accounts/${account}/r2/buckets/${bucket}/domains/managed`, {
        enabled: false,
      });
      step(`R2 ${bucket}: r2.dev disabled`);
    }
    await cf("PUT", `/accounts/${account}/r2/buckets/${bucket}/cors`, {
      rules: [
        {
          id: "aphrody-read",
          allowed: {
            origins: corsOrigins,
            methods: ["GET", "HEAD"],
            headers: ["Range", "If-None-Match"],
          },
          exposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
          maxAgeSeconds: 86400,
        },
      ],
    });
    await cf("PUT", `/accounts/${account}/r2/buckets/${bucket}/lifecycle`, {
      rules: [
        {
          id: "abort-incomplete-multipart",
          enabled: true,
          conditions: { prefix: "" },
          abortMultipartUploadsTransition: { condition: { type: "Age", maxAge: 86400 } },
        },
      ],
    });
  }
}

export const gateway = {
  id: "aphrody",
  cache_ttl: 3600,
  cache_invalidate_on_update: true,
  collect_logs: true,
  rate_limiting_interval: 60,
  rate_limiting_limit: 300,
  rate_limiting_technique: "sliding",
  authentication: false,
};

async function ai() {
  const gateways = await cf<{ id: string }[]>("GET", `/accounts/${account}/ai-gateway/gateways`);
  if (gateways.some(g => g.id === gateway.id)) {
    const { id, ...rest } = gateway;
    await cf("PUT", `/accounts/${account}/ai-gateway/gateways/${id}`, rest);
  } else {
    await cf("POST", `/accounts/${account}/ai-gateway/gateways`, gateway);
    step(`AI Gateway ${gateway.id} created`);
  }
}

// Vectorize indexes queried by the Worker (wrangler.jsonc "vectorize"); filled by scripts/aphrody/dataset/publish.ts.
// Dimensions and metric are fixed at creation: changing them means a new index name.
export const vectorIndexes = [
  {
    name: "bun-native",
    description: "bun-native dataset (scripts/aphrody/dataset): Bun code examples, signatures and migrations",
    config: { dimensions: 1024, metric: "cosine" },
    metadata: ["kind"],
  },
];

async function vectorize() {
  const existing = await cf<{ name: string }[]>("GET", `/accounts/${account}/vectorize/v2/indexes`);
  for (const index of vectorIndexes) {
    if (!existing.some(i => i.name === index.name)) {
      await cf("POST", `/accounts/${account}/vectorize/v2/indexes`, {
        name: index.name,
        description: index.description,
        config: index.config,
      });
      step(`Vectorize ${index.name} created`);
    }
    const listed = await cf<{ metadataIndexes?: { propertyName: string }[] }>(
      "GET",
      `/accounts/${account}/vectorize/v2/indexes/${index.name}/metadata_index/list`,
    ).catch(() => ({ metadataIndexes: [] }));
    for (const propertyName of index.metadata) {
      if (listed?.metadataIndexes?.some(m => m.propertyName === propertyName)) continue;
      await cf("POST", `/accounts/${account}/vectorize/v2/indexes/${index.name}/metadata_index/create`, {
        propertyName,
        indexType: "string",
      });
      step(`Vectorize ${index.name}: metadata index ${propertyName}`);
    }
  }
}

async function provisionZones() {
  const all = await cf<{ id: string; name: string; status: string; name_servers: string[] }[]>(
    "GET",
    "/zones?per_page=50",
  );
  for (const name of zones) {
    const zone = all.find(z => z.name === name);
    if (!zone) {
      console.warn(`zone ${name} missing from the account`);
      continue;
    }
    await zoneSettings(zone);
    if (zone.status !== "active")
      console.warn(`${name} is ${zone.status}: set its nameservers to ${zone.name_servers.join(", ")}`);
    if (name !== site) {
      // VPS-served zones (DNS mirrored from OVH by ovh.ts): their cdn.* hosts cache at the edge per origin headers.
      await entrypoint(zone, "http_request_cache_settings", [
        {
          ref: "aphrody-origin-cdn",
          description: `cdn.${name}: edge cache following the origin Cache-Control`,
          expression: `(http.host eq "cdn.${name}")`,
          action: "set_cache_settings",
          action_parameters: {
            cache: true,
            edge_ttl: { mode: "respect_origin" },
            browser_ttl: { mode: "respect_origin" },
            serve_stale: { disable_stale_while_updating: false },
          },
        },
      ]);
      continue;
    }
    await dns(zone);
    await siteRules(zone);
    await r2(zone.id);
  }
}

if (wants("zones")) await provisionZones();
if (wants("ai")) await ai();
if (wants("vectorize")) await vectorize();
console.log(dryRun ? "dry-run done" : "provisioned");
