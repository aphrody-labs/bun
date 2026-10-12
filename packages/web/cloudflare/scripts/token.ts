// Creates the account-owned automation token "aphrody-automation" with every selectable permission group of the
// account (account, all zones of the account, all R2 buckets), then writes it as CLOUDFLARE_API_TOKEN to the key
// stores: app/.env, ~/.aphrody/config/cloudflare.env and the vps copy (ssh vps, through stdin).
//
//   CLOUDFLARE_BOOTSTRAP_TOKEN=<token> bun packages/web/cloudflare/scripts/token.ts [--no-vps]
//
// The bootstrap token needs "Account > Account API Tokens > Edit" (dashboard: Manage account > Account API tokens),
// the only permission the regular automation token cannot grant itself. It can be revoked once this has run.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { envFile, parseEnv } from "./deploy.ts";

const NAME = "aphrody-automation";

async function cf<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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

type Group = { id: string; name: string; scopes: string[]; is_selectable?: boolean };

/** One policy per resource scope, each granting every selectable group of that scope. */
export function policies(groups: Group[], accountId: string) {
  const resources: Record<string, unknown> = {
    "com.cloudflare.api.account": { [`com.cloudflare.api.account.${accountId}`]: "*" },
    "com.cloudflare.api.account.zone": {
      [`com.cloudflare.api.account.${accountId}`]: { "com.cloudflare.api.account.zone.*": "*" },
    },
    "com.cloudflare.edge.r2.bucket": {
      [`com.cloudflare.api.account.${accountId}`]: { "com.cloudflare.edge.r2.bucket.*": "*" },
    },
  };
  return Object.entries(resources)
    .map(([scope, res]) => ({
      effect: "allow",
      resources: res,
      permission_groups: groups
        .filter(g => g.is_selectable !== false && g.scopes.includes(scope))
        .map(g => ({ id: g.id })),
    }))
    .filter(p => p.permission_groups.length > 0);
}

function upsert(text: string, key: string, value: string): string {
  const lines = text.split(/\r?\n/).filter(line => line !== "");
  const i = lines.findIndex(line => line.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  return lines.join("\n") + "\n";
}

if (import.meta.main) {
  const env = { ...parseEnv(await Bun.file(envFile()).text()), ...process.env } as Record<string, string>;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const bootstrap = env.CLOUDFLARE_BOOTSTRAP_TOKEN;
  if (!account || !bootstrap) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_BOOTSTRAP_TOKEN are required");
  const groups = await cf<Group[]>(bootstrap, "GET", `/accounts/${account}/tokens/permission_groups?per_page=1000`);
  const existing = await cf<{ id: string; name: string }[]>(
    bootstrap,
    "GET",
    `/accounts/${account}/tokens?per_page=100`,
  );
  for (const old of existing.filter(t => t.name === NAME))
    await cf(bootstrap, "DELETE", `/accounts/${account}/tokens/${old.id}`);
  const created = await cf<{ id: string; value: string }>(bootstrap, "POST", `/accounts/${account}/tokens`, {
    name: NAME,
    policies: policies(groups, account),
  });
  await cf(created.value, "GET", `/accounts/${account}/tokens/verify`);

  const stores = [join(import.meta.dir, "..", ".env"), join(homedir(), ".aphrody", "config", "cloudflare.env")];
  for (const store of stores.filter(existsSync))
    await Bun.write(store, upsert(await Bun.file(store).text(), "CLOUDFLARE_API_TOKEN", created.value));
  if (!process.argv.includes("--no-vps")) {
    const keyStore = stores[1];
    const ssh = Bun.spawn({
      cmd: [
        "ssh",
        "-o",
        "ConnectTimeout=15",
        "-o",
        "BatchMode=yes",
        "vps",
        "umask 077; cat > ~/.aphrody/config/cloudflare.env.new && mv ~/.aphrody/config/cloudflare.env.new ~/.aphrody/config/cloudflare.env",
      ],
      stdin: Bun.file(keyStore),
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await ssh.exited) !== 0) throw new Error("vps key store update failed");
  }
  const total = policies(groups, account).reduce((n, p) => n + p.permission_groups.length, 0);
  console.log(
    `${NAME} (${created.id}): ${total} permission groups, stored in ${stores.filter(existsSync).length} local key store(s)`,
  );
}
