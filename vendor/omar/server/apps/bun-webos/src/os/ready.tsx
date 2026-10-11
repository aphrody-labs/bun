// SPDX-License-Identifier: Apache-2.0
/**
 * `data-webos-ready` on a window once its app finished its first load (e2e and Bun.WebView fixtures
 * wait for it). An app calls `useWindowReady()(true)` when its first data is shown, or on error.
 */
import { createContext, useContext, useEffect } from "react";

export const WindowReadyContext = createContext<(ready: boolean) => void>(() => {});

export function useWindowReady(): (ready: boolean) => void {
  return useContext(WindowReadyContext);
}

/** For apps with nothing to load: ready on mount. */
export function useReadyOnMount(): void {
  const setReady = useWindowReady();
  useEffect(() => setReady(true), [setReady]);
}
