#!/usr/bin/env bun
"use strict";
const { dirname } = require("node:path");

const USAGE = `usage: next-bun <command> [arguments]

  dev | build | start | ...   run the app's \`next <command>\` on Bun, Turbopack workers included
  patch [projectDir]          patch the installed next for withBun() (Bun.build as the bundler)
  check [projectDir]          exit 0 when the installed next is patched
  codemod <ids|group|all> <dir> [--apply] [--json] | codemod --list
                              Next 14/15 -> 16 and Tailwind 3 -> 4 codemods (report unless --apply)
  pages-hints <dir> [--json]  Pages Router -> App Router plan, nothing rewritten`;

function nextDir(projectDir) {
  return dirname(require.resolve("next/package.json", { paths: [projectDir] }));
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === undefined || command === "-h" || command === "--help" || command === "help") {
    (command === undefined ? console.error : console.log)(USAGE);
    return command === undefined ? 2 : 0;
  }
  if (command === "patch" || command === "check") {
    const { applyPatch, checkPatch } = require("../lib/patch.js");
    const dir = nextDir(rest[0] ?? process.cwd());
    if (command === "patch") {
      const { version, changed } = applyPatch(dir);
      console.log(`next@${version}: ${changed.length ? `patched ${changed.length} file(s)` : "already patched"}`);
      return 0;
    }
    const { version, supported, patched } = checkPatch(dir);
    console.log(`next@${version}: ${patched ? "patched" : "not patched"}${supported ? "" : " (unsupported version)"}`);
    return patched ? 0 : 1;
  }
  if (command === "codemod" || command === "pages-hints") {
    const { runCodemodCli } = await import("../codemods/cli.ts");
    return await runCodemodCli(argv, { program: "next-bun" });
  }
  return await require("../lib/run.js").runNext(argv);
}

main(process.argv.slice(2)).then(
  code => process.exit(code),
  error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
