import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
const project = process.env.BENCH_PROJECT;
const require = createRequire(join(project, "package.json"));
const cssPath = join(project, "style.css");
const css = readFileSync(cssPath, "utf8");
const { compile } = require("@tailwindcss/node");
const { Scanner } = require("@tailwindcss/oxide");
let operation;
if (process.env.BENCH_VARIANT === "bun-plugin") {
  const { TailwindRoot } = await import(new URL("../../../packages/bun-plugin-tailwind/src/core.ts", import.meta.url));
  operation = async () => (await new TailwindRoot(cssPath, project, { optimize: false }).generate(css)).css;
} else {
  operation = async () => {
    const compiler = await compile(css, { base: project, shouldRewriteUrls: true, onDependency() {} });
    const scanner = new Scanner({ sources: compiler.sources });
    return compiler.build(scanner.scan());
  };
}
await operation();
const start = performance.now();
const result = await operation();
if (!result.includes(".flex") || !result.includes(".p-4")) throw new Error("Required utility missing");
console.log(
  "BENCH_RESULT " +
    JSON.stringify({ workMs: performance.now() - start, value: createHash("sha256").update(result).digest("hex") }),
);
