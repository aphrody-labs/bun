// SPDX-License-Identifier: Apache-2.0
import { useSyncExternalStore } from "react";

/** A localStorage-backed external store: same value across tabs, safe when storage is unavailable. */
function jsonStore<T>(key: string, fallback: T, valid: (value: unknown) => value is T) {
  let snapshot = fallback;
  let raw: string | null | undefined;
  const listeners = new Set<() => void>();
  const read = (): T => {
    let current: string | null;
    try {
      current = localStorage.getItem(key);
    } catch {
      return snapshot;
    }
    if (current === raw) return snapshot;
    raw = current;
    try {
      const parsed: unknown = current === null ? fallback : JSON.parse(current);
      snapshot = valid(parsed) ? parsed : fallback;
    } catch {
      snapshot = fallback;
    }
    return snapshot;
  };
  const emit = () => {
    for (const listener of listeners) listener();
  };
  if (typeof window !== "undefined")
    window.addEventListener("storage", event => {
      if (event.key === key) emit();
    });
  return {
    get: read,
    set(next: T) {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private mode: the value lives for this session only.
      }
      raw = undefined;
      snapshot = next;
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const isNumbers = (value: unknown): value is Record<string, number> =>
  !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(item => typeof item === "number" && Number.isFinite(item));

const NONE: string[] = [];
const NO_NUMBERS: Record<string, number> = {};
const saved = jsonStore<string[]>("aphrody:video:saved:v1", NONE, isStrings);
const progress = jsonStore<Record<string, number>>("aphrody:video:progress:v1", NO_NUMBERS, isNumbers);
const prefs = jsonStore<Record<string, number>>("aphrody:video:prefs:v1", NO_NUMBERS, isNumbers);

export const useSaved = () => useSyncExternalStore(saved.subscribe, saved.get, () => NONE);
export const useProgress = () => useSyncExternalStore(progress.subscribe, progress.get, () => NO_NUMBERS);
export const usePrefs = () => useSyncExternalStore(prefs.subscribe, prefs.get, () => NO_NUMBERS);

export function toggleSaved(id: string): void {
  const current = saved.get();
  saved.set(current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
}
export function rememberProgress(id: string, position: number): void {
  progress.set({ ...progress.get(), [id]: Math.max(0, Math.round(position * 10) / 10) });
}
export function setPref(key: string, value: number): void {
  prefs.set({ ...prefs.get(), [key]: value });
}
export const readProgress = (id: string): number => progress.get()[id] ?? 0;
