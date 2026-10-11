import windows from "bun:windows";
import { mkdirSync } from "node:fs";
import { withBunMcp } from "./bun-mcp-client";

const root = "C:/SSH/omar/server";
const source = await Bun.file("C:/bun/src/bun_core/env_var.rs").text();
const enabled = [
  "BUN_FEATURE_FLAG_EXPERIMENTAL_MCP_NATIVE_TOOLS",
  "BUN_FEATURE_FLAG_EXPERIMENTAL_DOCKER_MUTATIONS",
  "BUN_ENABLE_EXPERIMENTAL_SHELL_BUILTINS",
  "BUN_FEATURE_FLAG_EXPERIMENTAL_BAKE",
  "BUN_FEATURE_FLAG_EXPERIMENTAL_HTTP2_CLIENT",
  "BUN_FEATURE_FLAG_EXPERIMENTAL_HTTP3_CLIENT",
  "BUN_FEATURE_FLAG_NO_ORPHANS",
];
const disabled = [...new Set(source.match(/BUN_FEATURE_FLAG_DISABLE_[A-Z0-9_]+/g) ?? [])];
const env: Record<string, string> = Object.fromEntries([
  ...enabled.map(name => [name, "1"]),
  ...disabled.map(name => [name, "0"]),
  ["BUN_FEATURE_FLAG_NO_LIBDEFLATE", "0"],
  ["BUN_WINDOWS_FAMILY_PATH", "C:/bun/packages"],
  ["BUN_WINUI_VERSION", "1.8"],
]);
for (const name of [...enabled, ...disabled, "BUN_FEATURE_FLAG_NO_LIBDEFLATE"]) {
  if (!source.includes(name)) throw new Error(`Unknown source flag: ${name}`);
}
const registryKeys = ["HKCU\\Environment", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"];
mkdirSync(`${root}/var/checkpoints`, { recursive: true });
const before = Object.fromEntries(registryKeys.map(key => [key, Object.fromEntries(Object.keys(env).map(name => [name, windows.registry.get(key, name)]))]));
const stamp = new Date().toISOString().replaceAll(":", "-");
await Bun.write(`${root}/var/checkpoints/runtime-features-before-${stamp}.json`, JSON.stringify(before, null, 2) + "\n");

async function writeGuarded(call: (name: string, args: Record<string, unknown>) => Promise<any>, path: string, content: string) {
  const exists = await Bun.file(path).exists();
  let revision: number | undefined;
  if (exists) {
    const read = await call("read_file", { path, max_tokens: 20000 });
    if (read.isError) throw new Error(JSON.stringify(read));
    const text = read.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") ?? "";
    const match = text.match(/revision:\s*(\d+)/i);
    if (!match) throw new Error("Missing guarded revision");
    revision = Number(match[1]);
  }
  const preview = await call("write_file", { path, content, ...(exists ? { revision } : { create_only: true }), max_tokens: 20000 });
  if (preview.isError) throw new Error(JSON.stringify(preview));
  const text = preview.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") ?? "";
  const match = text.match(/"plan"\s*:\s*(\d+)/i) ?? text.match(/plan(?:\s+id)?\s*[:#=]?\s*(\d+)/i);
  if (!match) throw new Error(`Missing transaction plan: ${text}`);
  const applied = await call("vfs_apply", { plan: Number(match[1]), max_tokens: 1000 });
  if (applied.isError) throw new Error(JSON.stringify(applied));
  console.log(JSON.stringify({ file: path, transactionApplied: true }));
}

await withBunMcp("C:/", async call => {
  await writeGuarded(call, `${root}/runtime-features.json`, JSON.stringify({ version: 1, runtime: Bun.version, revision: Bun.revision, source: "C:/bun/src/bun_core/env_var.rs", enabled, disableFlagsKeptOff: disabled, env, excluded: "Fault injection, test harness switches, synthetic limits and platform-inapplicable compilation flags" }, null, 2) + "\n");
  const servicePath = `${root}/services.json`;
  const config = await Bun.file(servicePath).json();
  for (const service of config.services) service.env = { ...env, ...service.env };
  const webos = config.services.find((s: any) => s.id === "webos");
  webos.command[2] = `${root}/apps/bun-webos/dist/server.js`;
  webos.cwd = `${root}/apps/bun-webos/dist`;
  if (!webos.command.includes("--dist")) webos.command.push("--dist", `${root}/apps/bun-webos/dist`);
  if (!(await Bun.file(webos.command[2]).exists())) throw new Error("WebOS bundle missing");
  await writeGuarded(call, servicePath, JSON.stringify(config, null, 2) + "\n");
  const pluginPath = "C:/Users/omara/.bun/agent-plugin/codex/.mcp.json";
  const plugin = await Bun.file(pluginPath).json();
  plugin.mcpServers.bun.env = { ...plugin.mcpServers.bun.env, ...env };
  await writeGuarded(call, pluginPath, JSON.stringify(plugin, null, 2) + "\n");
});
for (const key of registryKeys) for (const [name, value] of Object.entries(env)) windows.registry.set(key, name, value, "REG_SZ");
const persisted = registryKeys.every(key => Object.entries(env).every(([name, value]) => windows.registry.get(key, name)?.value === value));
if (!persisted) throw new Error("Feature environment registry readback failed");
console.log(JSON.stringify({ runtime: Bun.version, revision: Bun.revision, enabled: enabled.length, disableFlagsKeptOff: disabled.length, registries: registryKeys.length, pluginNativeTools: true }));
