// SPDX-License-Identifier: Apache-2.0
import type { ChromeItem } from "./projection";
export interface ChromeAPI {
  permissions: { request(options: { permissions: string[] }): Promise<boolean> };
  bookmarks: { getRecent(count: number): Promise<ChromeItem[]> };
  history: { search(options: { text: string; startTime: number; maxResults: number }): Promise<ChromeItem[]> };
  tabs: {
    query(options: Record<string, never>): Promise<ChromeItem[]>;
    create(options: { url: string }): Promise<unknown>;
  };
  sessions: { getRecentlyClosed(options: { maxResults: number }): Promise<ChromeItem[]> };
  runtime: {
    sendNativeMessage(host: string, message: unknown): Promise<{ ok: boolean; receipt?: unknown; error?: string }>;
    getManifest(): { version: string };
    onInstalled: { addListener(listener: () => void): void };
  };
  storage: {
    local: {
      set(value: Record<string, unknown>): Promise<void>;
      get(keys: string[]): Promise<Record<string, unknown>>;
    };
  };
}
