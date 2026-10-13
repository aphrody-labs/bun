// Process-protocol fixture. It exercises ownership, not the NGINX HTTP engine.
import { renameSync, unlinkSync, watch } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const argument = (name: string) => args[args.indexOf(name) + 1];
const mode = args.find(value => value.startsWith("--fixture-mode="))?.slice("--fixture-mode=".length);
if (mode === "worker-child") {
  const worker = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("worker") });
  await atomicWrite(
    join(argument("-p"), "worker-ready.json"),
    JSON.stringify({ pid: process.pid, url: worker.url.href }),
  );
  await new Promise(() => {});
}
if (args.includes("-V")) {
  if (mode === "hang-probe") {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("fixture") });
    await new Promise(() => {});
    server.stop(true);
  }
  process.stderr.write(
    "nginx version: nginx/0.0.0-bun-process-fixture\nconfigure arguments: --with-http_ssl_module --with-http_v2_module --with-stream --with-threads\n",
  );
  process.exit(0);
}
const prefix = argument("-p");
const configFile = argument("-c");
const settings = await Bun.file(configFile).text();
if (args.includes("-t")) {
  if (settings === "invalid") {
    process.stderr.write("nginx: [emerg] synthetic invalid configuration\n");
    process.exit(1);
  }
  JSON.parse(settings);
  if (mode === "test-pidfile") {
    const pid = /\bpid "([^"]+)";/.exec(argument("-g"))?.[1];
    if (!pid) throw new Error("Process fixture did not receive its configured PID path");
    await Bun.write(pid, "");
  }
  process.stderr.write("nginx: configuration file syntax is ok\nnginx: configuration file test is successful\n");
  process.exit(0);
}
const pidFile = join(prefix, "bun-nginx.pid");
const signalFile = join(prefix, "fixture-signal.json");
async function atomicWrite(path: string, value: string) {
  const temporary = path + ".tmp";
  await Bun.write(temporary, value);
  renameSync(temporary, path);
}
if (args.includes("-s")) {
  await atomicWrite(signalFile, JSON.stringify({ signal: argument("-s"), nonce: process.pid }));
  process.exit(0);
}
let configuration = JSON.parse(settings);
if (mode === "with-worker") {
  Bun.spawn([process.execPath, import.meta.path, "--fixture-mode=worker-child", "-p", prefix], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
}
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => new Response(configuration.body ?? "fixture"),
});
await atomicWrite(join(prefix, "fixture-ready.json"), JSON.stringify({ url: server.url.href, pid: process.pid }));
if (mode !== "hang-start") await atomicWrite(pidFile, `${process.pid}\n`);
let watcher: ReturnType<typeof watch>;
await new Promise<void>((resolve, reject) => {
  watcher = watch(prefix, async (_event, filename) => {
    if (String(filename) !== "fixture-signal.json") return;
    try {
      const event = await Bun.file(signalFile).json();
      if (event.signal === "reload") {
        configuration = await Bun.file(configFile).json();
      } else if (event.signal === "crash") {
        process.exit(23);
      } else if (event.signal === "quit") {
        if (mode === "hang-quit") return;
        server.stop(true);
        watcher.close();
        unlinkSync(pidFile);
        resolve();
      }
    } catch (error) {
      reject(error);
    }
  });
});
