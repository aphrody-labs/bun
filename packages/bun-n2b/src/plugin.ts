// n2bPlugin(): Bun plugin for `Bun.plugin()` (runtime) and `Bun.build()`.
//
// - mode "report" (default): scans the project once in setup, prints each
//   loaded file's findings and a summary at the end of the build.
// - mode "fix" / "aggressive": rewrites each loaded source file with the n2b
//   codemods before Bun parses it. Files on disk are never written.

import type { BunPlugin, Loader } from "bun";
import { resolve, sep } from "node:path";
import { native } from "./native";
import type { Finding, N2BReport } from "./types";

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";

const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

export interface N2BPluginOptions {
  /** Project root for "report" mode. Defaults to the working directory. */
  root?: string;
  /** "report" (default) only logs findings; "fix" and "aggressive" rewrite loaded sources. */
  mode?: "report" | "fix" | "aggressive";
  /** "warn" (default) logs findings; "error" fails the build at the end when findings remain. */
  onFindings?: "warn" | "error";
  /** Suppress per-file logs. The summary is still printed. */
  quiet?: boolean;
  /** Extra ignore globs for the "report" scan. */
  ignore?: string[];
  /** Scan worker threads for "report" mode (1 to 6). */
  jobs?: number;
  /** Precomputed report (reused across watched builds); skips the scan. */
  report?: N2BReport;
  /** Files the plugin handles. Defaults to JS/TS sources outside node_modules. */
  filter?: RegExp;
}

function loaderOf(path: string): Loader {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".jsx")) return "jsx";
  if (/\.[cm]?ts$/.test(path)) return "ts";
  return "js";
}

function inNodeModules(path: string): boolean {
  return path.includes(`${sep}node_modules${sep}`) || path.includes("/node_modules/");
}

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function print(rel: string, findings: Finding[]) {
  for (const f of findings) {
    const loc = `${DIM}${rel}:${f.line}:${f.col}${RESET}`;
    const repl = f.replacement ? ` ${DIM}→${RESET} ${GREEN}${trunc(f.replacement, 60)}${RESET}` : "";
    console.warn(`${YELLOW}[n2b]${RESET} ${loc} ${CYAN}${f.rule_id}${RESET} ${f.message}${repl}`);
  }
}

export function n2bPlugin(opts: N2BPluginOptions = {}): BunPlugin {
  const mode = opts.mode ?? "report";
  if (!["report", "fix", "aggressive"].includes(mode)) {
    throw new TypeError(`n2b plugin mode must be report, fix or aggressive, got ${JSON.stringify(mode)}`);
  }
  const onFindings = opts.onFindings ?? "warn";
  const quiet = opts.quiet ?? false;
  const filter = opts.filter ?? SOURCE;

  return {
    name: "n2b",
    setup(build) {
      const root = resolve(opts.root ?? process.cwd());
      const rel = (path: string) => (path.startsWith(root + sep) ? path.slice(root.length + 1) : path);
      let total = 0;
      let files = 0;

      if (mode === "report") {
        const report =
          opts.report ??
          native().scan(root, {
            mode: "check",
            dryRun: true,
            ...(opts.ignore === undefined ? {} : { ignore: opts.ignore }),
            ...(opts.jobs === undefined ? {} : { jobs: opts.jobs }),
          });
        const byPath = new Map<string, Finding[]>();
        for (const file of report.files) {
          if (file.findings.length === 0) continue;
          files++;
          total += file.findings.length;
          byPath.set(resolve(root, file.path), file.findings);
        }
        build.onLoad({ filter }, ({ path }) => {
          const findings = byPath.get(resolve(path));
          if (!quiet && findings) print(rel(path), findings);
          return undefined;
        });
      } else {
        build.onLoad({ filter }, async ({ path }) => {
          if (inNodeModules(path)) return undefined;
          const source = await Bun.file(path).text();
          const result = native().transform(path, source, mode);
          if (result.findings.length) {
            files++;
            total += result.findings.length;
            if (!quiet) print(rel(path), result.findings);
          }
          return { contents: result.code, loader: loaderOf(path) };
        });
      }

      build.onEnd?.(() => {
        if (total === 0) {
          if (!quiet) console.log(`${GREEN}[n2b]${RESET} no Node→Bun issues detected`);
          return;
        }
        const mark = onFindings === "error" ? `${RED}✗${RESET}` : `${YELLOW}!${RESET}`;
        console.warn(`\n${mark} ${BOLD}[n2b]${RESET} ${total} finding(s) across ${files} file(s)`);
        if (onFindings === "error") {
          throw new Error(`[n2b] ${total} finding(s); fix them or set onFindings: "warn"`);
        }
      });
    },
  };
}
