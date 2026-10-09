// Imported by bundler-generated code in the server graph. Client references
// come from "use client" boundaries; server references wrap every export of a
// "use server" module so `server.tsx` can find and call them by id.
import {
  registerClientReference,
  registerServerReference as registerReactServerReference,
} from "react-server-dom-bun/server.node.unbundled.js";

export { registerClientReference };

/** Must match `serverFunctionHeader` in `client-runtime.ts`. */
export const serverFunctionHeader = "Bun-Server-Function";

const serverFunctions = new Map<string, Function>();

export function registerServerReference<T>(value: T, id: string, exportName: string): T {
  if (typeof value !== "function") {
    throw new TypeError(
      `Export "${exportName}" of "use server" module "${id}" must be an async function, got ${value === null ? "null" : typeof value}`,
    );
  }
  serverFunctions.set(id + "#" + exportName, value);
  return registerReactServerReference(value, id, exportName);
}

export function getServerFunction(actionId: string): Function | undefined {
  return serverFunctions.get(actionId);
}
