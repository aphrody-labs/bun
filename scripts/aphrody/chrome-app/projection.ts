// SPDX-License-Identifier: Apache-2.0
export type ExportKind = "bookmarks" | "history" | "tabs" | "sessions";
export interface ChromeItem {
  id?: string;
  title?: string;
  url?: string;
  pinned?: boolean;
  lastVisitTime?: number;
  visitCount?: number;
  sessionId?: string;
  lastModified?: number;
  tab?: ChromeItem;
  window?: { tabs?: ChromeItem[]; sessionId?: string };
}
function tab(item: ChromeItem) {
  if (typeof item.url !== "string" || item.url.length > 4096) return null;
  let url: URL;
  try {
    url = new URL(item.url);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  return { title: String(item.title ?? "").slice(0, 512), url: url.href, pinned: item.pinned === true };
}
export function projectExport(kind: ExportKind, source: ChromeItem[]) {
  const limits = { bookmarks: 500, history: 200, tabs: 100, sessions: 25 };
  if (!Array.isArray(source)) throw new Error("Invalid Chrome export source");
  let remainingTabs = 100;
  const items: Record<string, unknown>[] = [];
  for (const item of source.slice(0, limits[kind])) {
    if (kind === "sessions") {
      const tabs = (item.tab ? [item.tab] : (item.window?.tabs ?? []))
        .slice(0, remainingTabs)
        .map(tab)
        .filter(entry => entry !== null);
      remainingTabs -= tabs.length;
      const sessionId = item.tab?.sessionId ?? item.window?.sessionId;
      if (!tabs.length || typeof sessionId !== "string" || sessionId.length > 128) continue;
      items.push({ sessionId, lastModified: Number.isFinite(item.lastModified) ? item.lastModified : 0, tabs });
      continue;
    }
    const projected = tab(item);
    if (!projected) continue;
    const page = { title: projected.title, url: projected.url };
    if (kind === "tabs") items.push(projected);
    else if (kind === "bookmarks") items.push({ ...page, id: String(item.id ?? "").slice(0, 128) });
    else
      items.push({
        ...page,
        lastVisitTime: Number.isFinite(item.lastVisitTime) ? item.lastVisitTime : 0,
        visitCount: Number.isSafeInteger(item.visitCount) && item.visitCount! >= 0 ? item.visitCount : 0,
      });
  }
  const message = { schemaVersion: 1, type: "export", kind, items };
  if (new TextEncoder().encode(JSON.stringify(message)).length > 512 * 1024)
    throw new Error("Private export exceeds512KiB; reduce source selection");
  return message;
}
