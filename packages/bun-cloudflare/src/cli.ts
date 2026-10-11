#!/usr/bin/env bun
// bun-cloudflare packages | doctor | whoami | exec <bin> [...args] | <wrangler args>
import { createClient, hasCredentials, verifyToken } from "./api.ts";
import { catalog, installedVersion } from "./catalog.ts";
import { exec, resolveBin } from "./wrangler.ts";

const usage = `Usage: bun-cloudflare <command>

  packages              Official Cloudflare packages bundled here, with installed versions
  doctor                Check that every package resolves and every bin exists
  whoami                Verify CLOUDFLARE_API_TOKEN against the REST API
  exec <bin> [args]     Run a bundled bin (wrangler, workerd, create-cloudflare, opennextjs-cloudflare, vinext)
  <anything else>       Passed to wrangler (bun-cloudflare deploy, bun-cloudflare dev, ...)`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case "-h":
    case "--help":
      console.log(usage);
      return 0;
    case "packages":
      for (const entry of catalog)
        console.log(
          `${entry.category.padEnd(10)} ${entry.name.padEnd(36)} ${installedVersion(entry.name) ?? "missing"}`,
        );
      return 0;
    case "doctor": {
      let failures = 0;
      for (const entry of catalog) {
        if (!installedVersion(entry.name)) {
          console.error(`missing package: ${entry.name}`);
          failures++;
        }
        for (const bin of entry.bins ?? []) {
          try {
            if (!(await Bun.file(resolveBin(bin)).exists())) throw new Error("not found");
          } catch (error) {
            console.error(`missing bin ${bin} (${entry.name}): ${(error as Error).message}`);
            failures++;
          }
        }
      }
      console.log(failures ? `${failures} problem(s)` : `${catalog.length} packages OK`);
      return failures ? 1 : 0;
    }
    case "whoami": {
      if (!hasCredentials()) {
        console.error("CLOUDFLARE_API_TOKEN is not set");
        return 1;
      }
      const result = await verifyToken(createClient());
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "exec": {
      const [bin, ...args] = rest;
      if (!bin) {
        console.error(usage);
        return 1;
      }
      return await exec(bin, args).exited;
    }
    default:
      return await exec("wrangler", argv).exited;
  }
}

process.exitCode = await main(process.argv.slice(2));
