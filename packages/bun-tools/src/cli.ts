#!/usr/bin/env bun
import { startConnectProxy, type ConnectProxyOptions } from "./connect-proxy.ts";
import { startSystemStream, type SystemStreamOptions } from "./system-stream.ts";
import { startTaskService } from "./task-service.ts";

const help = `bun-host <command> --config <file.json>

Commands:
  proxy        Loopback HTTP CONNECT to an explicit SOCKS5 endpoint
  stream       Loopback Windows snapshots and event stream
  ntfs         NTFS baseline metadata into an explicit SQLite database
  ntfs-sync    Apply USN journal pages to the metadata database
  pe           Bounded PE metadata scan and persistence
  aliases      Record NTFS file aliases for an explicit file list
  cache        Publish explicitly selected SQLite metadata tables to Redis
  graph        Index explicit source domains with native Bun graph APIs
  migrate      Copy and normalize a legacy metadata database
  resources    Persist caller-supplied resource metadata

Import @aphrody/bun-tools subpaths for programmatic use.
No service, volume scan or private configuration is loaded by default.
`;

export async function hostCommand(argv: string[]) {
  const [command, flag, configPath, ...extra] = argv;
  if (!command || command === "--help" || command === "help") {
    console.log(help);
    return;
  }
  if (flag !== "--config" || !configPath || extra.length) throw new Error(help);
  const commands = new Set([
    "proxy",
    "stream",
    "ntfs",
    "ntfs-sync",
    "pe",
    "aliases",
    "cache",
    "graph",
    "migrate",
    "resources",
  ]);
  if (!commands.has(command)) throw new Error(`Unknown command: ${command}`);
  const config = await Bun.file(configPath).json();
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("Expected a JSON object");
  if (command === "migrate" && config.intervalMs !== undefined)
    throw new Error("Database migration is a one-time command");
  if (command === "proxy" || command === "stream") {
    const service =
      command === "proxy"
        ? await startConnectProxy(config as ConnectProxyOptions)
        : await startSystemStream(config as SystemStreamOptions);
    console.log(
      JSON.stringify({ command, port: "server" in service ? service.server.port : service.port }),
    );
    let shutdown: Promise<void> | undefined;
    const stop = () => {
      shutdown ??= service.stop().finally(() => {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
      });
      shutdown.catch(() => {
        console.error("Service shutdown failed");
        process.exitCode = 1;
      });
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    return;
  }
  const indexing = await import("./indexing/index.ts");
  const run = async (signal?: AbortSignal): Promise<unknown> => {
    const options = { ...config, signal };
    switch (command) {
      case "ntfs":
        return indexing.indexNtfs(options);
      case "ntfs-sync":
        return indexing.syncNtfs(options);
      case "aliases":
        return indexing.indexFileAliases(options);
      case "cache":
        return indexing.publishMetadataCache(options);
      case "graph":
        return indexing.indexSources(options);
      case "migrate":
        return indexing.migrateIndexDatabase(options);
      case "resources":
        return indexing.persistResources(config.dbPath, config.resources, config.maxResources);
      case "pe": {
        const scan = await indexing.scanPe(options);
        const apiSets = config.apiSetFile
          ? await indexing.parseApiSetFile(config.apiSetFile)
          : undefined;
        return indexing.persistPe({ ...config, scan, apiSets });
      }
    }
  };
  if (config.intervalMs !== undefined) {
    const service = await startTaskService({
      task: run,
      intervalMs: config.intervalMs,
      port: config.healthPort,
    });
    console.log(JSON.stringify({ command, port: service.server.port }));
    const stop = () => {
      void service.stop().finally(() => {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
      });
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    return;
  }
  const result = await run();
  console.log(
    JSON.stringify(
      result,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );
}

if (import.meta.main) {
  try {
    await hostCommand(Bun.argv.slice(2));
  } catch {
    console.error(
      "Host command failed; verify the explicit configuration and runtime capabilities.",
    );
    process.exitCode = 1;
  }
}
