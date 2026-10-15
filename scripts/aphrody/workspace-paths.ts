import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Find the source workspace from an explicit path or from checkout ancestors. */
export function findWorkspaceRoot(...starts: string[]): string | undefined {
  const configured = process.env.APHRODY_SOURCE_WORKSPACE?.trim();
  if (configured) {
    const root = resolve(configured);
    if (!existsSync(join(root, "WORKSPACE.md"))) {
      throw new Error(`Source workspace not found at ${root}; expected WORKSPACE.md`);
    }
    return root;
  }

  for (const start of starts) {
    let current = resolve(start);
    while (true) {
      if (existsSync(join(current, "WORKSPACE.md"))) return current;
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return undefined;
}
