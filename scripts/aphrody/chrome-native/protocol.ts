// SPDX-License-Identifier: Apache-2.0
export const HOST_NAME = "com.bun.aphrody";
export const MAX_FRAME_BYTES = 1024 * 1024;
export const MAX_EXPORT_BYTES = 512 * 1024;
export const extensionId = /^[a-p]{32}$/;
export type ExportKind = "bookmarks" | "history" | "tabs" | "sessions";
export interface ExportMessage {
  schemaVersion: 1;
  type: "export";
  kind: ExportKind;
  items: Record<string, unknown>[];
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Invalid fields");
}
function text(value: unknown, limit: number, optional = false) {
  if (optional && value === undefined) return;
  if (
    typeof value !== "string" ||
    value.length > limit ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
  )
    throw new Error("Invalid text");
}
function number(value: unknown, optional = false) {
  if (optional && value === undefined) return;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  )
    throw new Error("Invalid number");
}
function url(value: unknown) {
  text(value, 4096);
  const parsed = new URL(value as string);
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error("Invalid URL");
}
function tab(value: unknown) {
  if (!record(value)) throw new Error("Invalid tab");
  keys(value, ["title", "url", "pinned"]);
  text(value.title, 512);
  url(value.url);
  if (typeof value.pinned !== "boolean") throw new Error("Invalid pinned state");
}
export function validateExport(value: unknown): ExportMessage {
  if (!record(value)) throw new Error("Invalid message");
  keys(value, ["schemaVersion", "type", "kind", "items"]);
  if (value.schemaVersion !== 1 || value.type !== "export" || !Array.isArray(value.items))
    throw new Error("Invalid message");
  const limits: Record<string, number> = { bookmarks: 500, history: 200, tabs: 100, sessions: 25 };
  if (
    typeof value.kind !== "string" ||
    !Object.hasOwn(limits, value.kind) ||
    value.items.length > limits[value.kind]!
  )
    throw new Error("Invalid kind or count");
  let sessionTabs = 0;
  for (const item of value.items) {
    if (!record(item)) throw new Error("Invalid item");
    if (value.kind === "bookmarks") {
      keys(item, ["id", "title", "url"]);
      text(item.id, 128);
      text(item.title, 512);
      url(item.url);
    } else if (value.kind === "history") {
      keys(item, ["title", "url", "lastVisitTime", "visitCount"]);
      text(item.title, 512);
      url(item.url);
      number(item.lastVisitTime, true);
      number(item.visitCount, true);
      if (item.visitCount !== undefined && !Number.isSafeInteger(item.visitCount))
        throw new Error("Invalid visit count");
    } else if (value.kind === "tabs") tab(item);
    else {
      keys(item, ["sessionId", "lastModified", "tabs"]);
      text(item.sessionId, 128);
      number(item.lastModified);
      if (!Array.isArray(item.tabs) || item.tabs.length > 100)
        throw new Error("Invalid session tabs");
      sessionTabs += item.tabs.length;
      if (sessionTabs > 100) throw new Error("Session tab count exceeds limit");
      for (const entry of item.tabs) tab(entry);
    }
  }
  return value as unknown as ExportMessage;
}
export function encodeFrame(value: unknown): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  if (!payload.length || payload.length > MAX_FRAME_BYTES)
    throw new Error("Native frame exceeds limit");
  const result = new Uint8Array(4 + payload.length);
  new DataView(result.buffer).setUint32(0, payload.length, true);
  result.set(payload, 4);
  return result;
}
export function decodeExport(payload: Uint8Array): ExportMessage {
  if (!payload.length || payload.length > MAX_EXPORT_BYTES) throw new Error("Export exceeds limit");
  return validateExport(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload)));
}
