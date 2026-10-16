#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
import { createCrunchyrollApi, crunchyrollClientFactory } from "./crunchyroll-api";
import { parseCrunchyrollWatchUrl } from "./crunchyroll";

export const CRUNCHYROLL_CLI_HELP = `Usage: bun-video-crunchyroll help|watch <official URL>|serve [--hostname <host>] [--port <0..65535>]
serve defaults to 127.0.0.1:3000 and public health/watch parsing only.
Private metadata requires BUN_VIDEO_CRUNCHYROLL_API_TOKEN and a configured upstream access token.
No cookie/profile import, DRM processing or browser playback is performed by this API.
`;

export function parseCrunchyrollCli(args: string[]) {
  const command = args[0] ?? "help";
  if (["help", "--help", "-h"].includes(command)) return { command: "help" as const };
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

if (import.meta.main) {
  try {
    const options = parseCrunchyrollCli(Bun.argv.slice(2));
    if (options.command === "help") console.log(CRUNCHYROLL_CLI_HELP);
    else if (options.command === "watch") console.log(JSON.stringify(options.watch));
    else {
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
