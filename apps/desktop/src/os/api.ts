// SPDX-License-Identifier: Apache-2.0
/** Calls to the WebOS server; an HTTP error becomes an Error carrying the server's message. */

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    ...(json === undefined
      ? {}
      : { method: rest.method ?? "POST", body: JSON.stringify(json), headers: { "Content-Type": "application/json" } }),
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!res.ok)
    throw new Error(
      typeof body === "object" && body?.error ? body.error : `${path}: HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  return body as T;
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  engine: string;
}
