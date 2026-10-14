import { parseSync } from "../../../../packages/bun-oxc/src/parser.ts";

import type { Program } from "../../../../packages/bun-oxc/src/parser.ts";

/**
 * Parse code and return the AST.
 * @param path - Path to file
 * @param code - Source code
 * @returns AST
 * @throws Error if parsing fails
 */
export function parse(path: string, code: string): Program {
  const { program, errors } = parseSync(path, code);
  if (errors.length !== 0) throw new Error(`Failed to parse ${path}: ${errors[0].message}`);
  return program;
}
