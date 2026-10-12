import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const transpilers = {
  ts: new Bun.Transpiler({ loader: "ts", target: "bun", tsconfig: { compilerOptions: { jsx: "react" } } }),
  tsx: new Bun.Transpiler({ loader: "tsx", target: "bun", tsconfig: { compilerOptions: { jsx: "react" } } }),
};
let checked = 0;
let failed = 0;
for await (const entry of new Bun.Glob("packages/{remotion,hyperframes}/packages/*/src/**/*.{ts,tsx}").scan({
  cwd: root,
  onlyFiles: true,
})) {
  if (entry.endsWith(".d.ts")) continue;
  checked++;
  try {
    transpilers[entry.endsWith(".tsx") ? "tsx" : "ts"].transformSync(await Bun.file(resolve(root, entry)).text());
  } catch (error) {
    failed++;
    const issues = error instanceof AggregateError ? error.errors : [error];
    for (const issue of issues) {
      console.error(
        JSON.stringify({
          file: entry,
          message: issue?.message ?? String(issue),
          line: issue?.position?.line,
          column: issue?.position?.column,
        }),
      );
    }
  }
}
console.log(JSON.stringify({ checked, failed }));
if (failed) process.exitCode = 1;
