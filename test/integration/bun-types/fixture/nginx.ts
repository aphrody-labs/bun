import Nginx, { create, probe, type NginxInfo, type NginxOptions } from "bun:nginx";
import Alias from "bun:Nginixx";

const options = { prefix: "./private-nginx", configFile: "nginx.conf", timeoutMs: 1000 } satisfies NginxOptions;
const instance: Promise<Nginx> = create(options);
const alias: typeof Nginx = Alias;
const info: Promise<NginxInfo> = probe({ binary: "nginx", signal: AbortSignal.timeout(1000) });
async function checked() {
  await using nginx = await instance;
  const valid: true = (await nginx.validate()).valid;
  const pid: number | null = (await nginx.start()).pid;
  await nginx.reload({ timeoutMs: 500 });
  await nginx.quit();
  const provider = await info;
  if (provider.available) {
    const tls: boolean = provider.capabilities.httpTLS;
    const worker: 1 | null = provider.capabilities.effectiveWorkersMaximum;
    void [tls, worker];
  } else {
    const missing: "ERR_NGINX_PROVIDER_UNAVAILABLE" = provider.code;
    void missing;
  }
  void [valid, pid, alias];
}
// @ts-expect-error an isolated prefix is required
create({ configFile: "nginx.conf" });
// @ts-expect-error configuration path is required
create({ prefix: "./owned" });
// @ts-expect-error provider limits are numbers
probe({ timeoutMs: "1000" });
// @ts-expect-error direct construction cannot create a native handle
new Nginx();
void checked;
