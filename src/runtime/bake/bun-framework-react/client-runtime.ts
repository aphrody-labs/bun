// Imported by `client.tsx` and by the bundler-generated proxies that replace
// "use server" modules in the browser. Calling a server function POSTs its
// encoded arguments to the current route; `server.tsx` replies with the
// result as an RSC payload.
/// <reference lib="dom" />
import { createFromFetch, createServerReference, encodeReply } from "react-server-dom-bun/client.browser";

export const serverFunctionHeader = "Bun-Server-Function";

export async function callServer(id: string, args: unknown[]): Promise<unknown> {
  const response = fetch(location.pathname + location.search, {
    method: "POST",
    headers: {
      Accept: "text/x-component",
      [serverFunctionHeader]: id,
    },
    body: await encodeReply(args),
  });
  return createFromFetch(response, { callServer });
}

export function registerServerReference(id: string, exportName: string) {
  return createServerReference(id + "#" + exportName, callServer);
}
