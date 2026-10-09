import { BunPython, registryPath } from "bun:graph";
import { indexCodebase } from "bun:graph-index";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    db: { type: "string", default: registryPath },
    profile: { type: "string", default: "bun" },
    domains: { type: "string", multiple: true },
    concurrency: { type: "string", default: "2" },
    "artifact-directory": { type: "string" },
  },
  strict: true,
});
if (!values.root) throw new Error("Source indexing requires --root <checkout>");
if (values.profile !== "bun") throw new Error("Bun source indexing uses profile bun");
using registry = new BunPython(resolve(values.db));
const result = await indexCodebase(registry, resolve(values.root), {
  profile: "bun",
  concurrency: Number(values.concurrency),
  ...(values.domains ? { domains: values.domains } : {}),
  ...(values["artifact-directory"] ? { artifactDirectory: resolve(values["artifact-directory"]) } : {}),
});
console.log(JSON.stringify(result));
