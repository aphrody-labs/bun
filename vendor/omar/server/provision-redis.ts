import { mkdirSync, existsSync } from "node:fs";
import windows from "bun:windows";
const root = "C:/SSH/omar/server";
const privateRoot = "C:/Users/omara/.aphrody/private/omar-redis";
mkdirSync(privateRoot, { recursive: true });
mkdirSync(`${root}/config`, { recursive: true });
const run = (cmd: string[]) => {
  const p = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe", cwd: root });
  if (p.exitCode !== 0) throw new Error(`${cmd[0]} ${cmd[1]} failed (${p.exitCode})`);
  return p.stdout.toString();
};
const passwordPath = `${privateRoot}/password.txt`;
let password: string;
if (existsSync(passwordPath)) password = (await Bun.file(passwordPath).text()).trim();
else {
  password = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  await Bun.write(passwordPath, password + "\n");
}
if (!/^[a-f0-9]{64}$/.test(password)) throw new Error("Invalid existing Redis credential format");
const identity = run(["whoami.exe", "/user", "/fo", "csv", "/nh"]).match(/S-1-5-21-(?:\d+-){3}\d+/)?.[0];
if (!identity) throw new Error("Windows user SID missing");
run(["icacls.exe", privateRoot, "/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F", `*${identity}:(OI)(CI)F`]);
await Bun.write(`${privateRoot}/redis.conf`, [
  "bind 0.0.0.0", "protected-mode yes", "port 6379",
  `requirepass ${password}`, "dir /data", "appendonly yes", "appendfsync everysec",
  "save 900 1", "save 300 100", "maxmemory 512mb", "maxmemory-policy allkeys-lru",
  "maxclients 128", "tcp-keepalive 60", "loglevel notice", "databases 16", ""
].join("\n"));
const composePath = `${root}/config/redis.compose.yml`;
await Bun.write(composePath, `services:
  omar-redis:
    image: redis:8.10.2-alpine
    container_name: omar-redis
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - "omar-redis-data:/data"
      - "omar-redis-config:/usr/local/etc/redis"
    command: ["redis-server", "/usr/local/etc/redis/redis.conf"]
    mem_limit: 768m
    cpus: 1.0
    security_opt:
      - no-new-privileges:true
volumes:
  omar-redis-data:
    name: omar-redis-data
  omar-redis-config:
    name: omar-redis-config
`);
console.log(JSON.stringify({ event: "provisioning", container: "omar-redis", image: "redis:8.10.2-alpine", hostBind: "127.0.0.1:6379" }));
run(["docker.exe", "compose", "-f", composePath, "create"]);
run(["docker.exe", "cp", `${privateRoot}/redis.conf`, "omar-redis:/usr/local/etc/redis/redis.conf"]);
run(["docker.exe", "compose", "-f", composePath, "start"]);
const redisUrl = `redis://:${password}@127.0.0.1:6379/0`;
await Bun.write(`${privateRoot}/client.json`, JSON.stringify({ url: redisUrl }) + "\n");
for(const name of ["password.txt","redis.conf","client.json"])run(["icacls.exe", `${privateRoot}/${name}`, "/inheritance:r", "/grant:r", "*S-1-5-18:F", "*S-1-5-32-544:F", `*${identity}:F`]);
const client = new Bun.RedisClient(redisUrl);
for(let attempt=0;attempt<30;attempt++){
  try { await client.connect(); break; } catch { if(attempt===29)throw new Error("Redis startup timeout"); await Bun.sleep(500); }
}
run(["docker.exe", "exec", "--user", "root", "omar-redis", "chown", "redis:redis", "/usr/local/etc/redis/redis.conf"]);
run(["docker.exe", "exec", "--user", "root", "omar-redis", "chmod", "600", "/usr/local/etc/redis/redis.conf"]);
const info = await client.send("INFO", ["server"]);
await client.set("omar:runtime:revision", Bun.revision);
await client.set("omar:cache:manifest", JSON.stringify({ owner: "Bun 1.4.4", createdAt: new Date().toISOString(), durableInventory: "SQLite", ttlSeconds: 3600, maxmemoryMiB: 512 }));
const ok = await client.get("omar:runtime:revision") === Bun.revision;
client.close();
if (!ok) throw new Error("Redis native client readback failed");
const image = JSON.parse(run(["docker.exe", "image", "inspect", "redis:8.10.2-alpine", "--format", "{{json .RepoDigests}}"]));
await Bun.write(`${root}/var/redis-qualification.json`, JSON.stringify({ observedAt: new Date().toISOString(), version: String(info).match(/redis_version:([^\r\n]+)/)?.[1], image, hostBind: "127.0.0.1:6379", auth: true, persistence: "AOF everysec + RDB", nativeClientReadback: ok, maxmemoryMiB: 512 }, null, 2) + "\n");
const catalogPath = "C:/aphrody/tools/config/service-catalog.json";
const raw = await Bun.file(catalogPath).text();
const catalog = JSON.parse(raw);
if (!catalog.services.some((s: any) => s.id === "omar-redis")) catalog.services.push({ id: "omar-redis", application: "omar", kind: "cache", runtime: "redis", container: "omar-redis", host: "local", health: "tcp://127.0.0.1:6379", target: "local:127.0.0.1:6379", public: false, note: "Redis 8.10.2, authenticated loopback; Bun native Redis client, durable AOF/RDB volume. Compose owner C:/SSH/omar/server/config/redis.compose.yml; maxmemory 512MiB, Docker memory 768MiB." });
if (!catalog.boot.entries.some((e: any) => e.host === "local" && e.kind === "docker" && e.container === "omar-redis")) catalog.boot.entries.push({ host: "local", kind: "docker", container: "omar-redis" });
await Bun.write(`${root}/var/checkpoints/catalog-before-redis.json`, raw);
if (await Bun.file(catalogPath).text() !== raw) throw new Error("Catalog changed concurrently; Redis healthy, registration deferred");
await Bun.write(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(JSON.stringify({ qualified: true, container: "omar-redis", auth: true, nativeClient: Bun.version, persistent: true, catalogRegistered: true }));
