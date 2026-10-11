// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import type { SystemSnapshot } from "../server/system-metrics";

export type { SystemSnapshot } from "../server/system-metrics";

export interface SystemState {
  snapshot: SystemSnapshot | null;
  /** Why the last request failed; the UI shows it instead of a value. */
  error: string | null;
}

/** Polls GET /api/webos/system, the measured host state. */
export function useSystemSnapshot(intervalMs = 5000): SystemState {
  const [state, setState] = useState<SystemState>({ snapshot: null, error: null });
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      try {
        const res = await fetch("/api/webos/system", { signal: controller.signal });
        if (!res.ok) throw new Error(`GET /api/webos/system: HTTP ${res.status}`);
        const snapshot = (await res.json()) as SystemSnapshot;
        if (alive) setState({ snapshot, error: null });
      } catch (error) {
        if (alive)
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : String(error),
          }));
      }
    };
    void (async () => {
      try {
        const response = await fetch("/api/webos/capabilities", { signal: controller.signal });
        if (!response.ok) throw new Error(`Agent local indisponible (HTTP ${response.status}).`);
        const capabilities = await response.json();
        if (!alive) return;
        if (capabilities.hostAccess !== true) {
          setState({ snapshot: null, error: "Agent local non connecté." });
          return;
        }
        await load();
        if (alive) timer = setInterval(load, intervalMs);
      } catch (error) {
        if (alive)
          setState({
            snapshot: null,
            error: error instanceof Error ? error.message : String(error),
          });
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [intervalMs]);
  return state;
}

export const UNAVAILABLE = "indisponible";

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return UNAVAILABLE;
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return UNAVAILABLE;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return d > 0 ? `${d}j ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}
