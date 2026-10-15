#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
import { createCrunchyrollApi, crunchyrollClientFactory } from "./crunchyroll-api";
import { parseCrunchyrollWatchUrl } from "./crunchyroll";
import {
  importCrunchyrollWatchlist,
  registerObservedCrunchyrollWatchlist,
  type CrunchyrollWatchlistEntry,
} from "./crunchyroll-watchlist";
import { openConfiguredVideoCatalog } from "./video-neon-runtime";

export const CRUNCHYROLL_CLI_HELP = `Usage: bun-video crunchyroll help|watch <official URL>|serve [--hostname <host>] [--port <0..65535>]
       bun-video crunchyroll watchlist metadata|import <observed.json> [--catalog <path>] [--timeout <1..300000 ms>]
metadata registers supplied official series/watch references locally, including films, without authentication.
import expands supplied series via the existing configured client; watch references remain pending.
observed.json is an array of {"url":"official URL","title":"optional observed title"}, at most 4 MiB.
serve defaults to 127.0.0.1:3000 and public health/watch parsing only.
Private metadata requires BUN_VIDEO_CRUNCHYROLL_API_TOKEN and a configured upstream access token.
No cookie/profile import, DRM processing or browser playback is performed by this API.
`;

export function parseCrunchyrollCli(args: string[]) {
  const command = args[0] ?? "help";
  if (["help", "--help", "-h"].includes(command)) return { command: "help" as const };
  if (command === "watchlist") {
    const operation = args[1],
      inputPath = args[2];
    if ((operation !== "metadata" && operation !== "import") || !inputPath || inputPath.startsWith("--"))
      throw new TypeError("watchlist requires metadata|import and an observed JSON path");
    let catalogPath: string | undefined,
      timeoutMs = 300000;
    const seen = new Set<string>();
    for (let index = 3; index < args.length; index++) {
      const flag = args[index]!,
        value = args[++index];
      if (!value || seen.has(flag)) throw new TypeError("Watchlist option requires one value");
      seen.add(flag);
      if (flag === "--catalog") catalogPath = value;
      else if (flag === "--timeout") {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 300000)
          throw new RangeError("timeout must be 1..300000 milliseconds");
        timeoutMs = Number(value);
      } else throw new TypeError("Unknown watchlist option");
    }
    return { command: "watchlist" as const, operation, inputPath, catalogPath, timeoutMs };
  }
  if (command === "watch") {
    if (args.length !== 2) throw new TypeError("watch requires one official Crunchyroll URL");
    const result = parseCrunchyrollWatchUrl(args[1]!);
    const url = new URL(result.url);
    url.search = "";
    url.hash = "";
    return { command: "watch" as const, watch: { ...result, url: url.href } };
  }
  if (command !== "serve") throw new TypeError("Unknown Crunchyroll command");
  let hostname = "127.0.0.1",
    port = 3000;
  for (let index = 1; index < args.length; index++) {
    const flag = args[index],
      value = args[++index];
    if (!value) throw new TypeError("CLI option requires a value");
    if (flag === "--hostname") {
      if (!/^[a-zA-Z0-9.:[\]-]+$/.test(value)) throw new TypeError("Invalid listen hostname");
      hostname = value;
    } else if (flag === "--port") {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 65535)
        throw new RangeError("port must be 0..65535");
      port = Number(value);
    } else throw new TypeError("Unknown serve option");
  }
  return { command: "serve" as const, hostname, port };
}

export async function crunchyrollCliMain(args = Bun.argv.slice(2)) {
  try {
    const options = parseCrunchyrollCli(args);
    if (options.command === "help") console.log(CRUNCHYROLL_CLI_HELP);
    else if (options.command === "watch") console.log(JSON.stringify(options.watch));
    else if (options.command === "watchlist") {
      const file = Bun.file(options.inputPath);
      if (file.size > 4 * 1024 * 1024) throw new RangeError("Observed references exceed 4 MiB");
      const bytes = await file.bytes();
      if (bytes.length > 4 * 1024 * 1024) throw new RangeError("Observed references exceed 4 MiB");
      const entries: CrunchyrollWatchlistEntry[] = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      await using catalog = await openConfiguredVideoCatalog({ sqlitePath: options.catalogPath });
      if (options.operation === "metadata")
        console.log(JSON.stringify(await registerObservedCrunchyrollWatchlist(catalog, entries)));
      else {
        const accessToken = process.env.BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN;
        if (!accessToken) throw new TypeError("Import requires an explicitly configured upstream access token");
        const result = await importCrunchyrollWatchlist(catalog, entries, {
          timeoutMs: options.timeoutMs,
          clientFactory: crunchyrollClientFactory({
            accessToken,
            accountId: process.env.BUN_VIDEO_CRUNCHYROLL_ACCOUNT_ID,
            locale: process.env.BUN_VIDEO_CRUNCHYROLL_LOCALE,
            timeoutMs: Math.min(options.timeoutMs, 30000),
          }),
        });
        console.log(JSON.stringify(result));
      }
    } else {
      const apiToken = process.env.BUN_VIDEO_CRUNCHYROLL_API_TOKEN;
      const accessToken = process.env.BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN;
      const handler = createCrunchyrollApi({
        apiToken,
        clientFactory: accessToken
          ? crunchyrollClientFactory({
              accessToken,
              accountId: process.env.BUN_VIDEO_CRUNCHYROLL_ACCOUNT_ID,
              locale: process.env.BUN_VIDEO_CRUNCHYROLL_LOCALE,
            })
          : undefined,
      });
      const server = Bun.serve({ hostname: options.hostname, port: options.port, fetch: handler });
      console.log(`Crunchyroll metadata API listening on ${server.url.origin}`);
      const stop = () => server.stop(true);
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    }
  } catch {
    console.error("Crunchyroll CLI failed; check command options and explicit configuration");
    process.exitCode = 1;
  }
}

if (import.meta.main) await crunchyrollCliMain();

/** Unified `bun-video` subcommand entry. */
export const run: (args: string[]) => Promise<void> = crunchyrollCliMain;
