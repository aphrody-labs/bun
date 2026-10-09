#!/usr/bin/env bun
import { main } from "../src/cli.ts";

main(process.argv.slice(2)).catch(error => {
  console.error(`bun-agent-plugin: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
