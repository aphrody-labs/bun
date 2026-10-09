import { resolve } from "node:path";
import graph from "../../src/js/bun/graph.ts";

export const registryPath = resolve(import.meta.dir, "../../bun_python.sqlite");
export class BunPython extends graph.BunPython {
  constructor(path = registryPath) {
    super(path);
  }
}
