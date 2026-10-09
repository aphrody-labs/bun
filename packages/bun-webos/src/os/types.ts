// SPDX-License-Identifier: Apache-2.0
export type AppId =
  | "bunsh"
  | "kernel-monitor"
  | "files"
  | "processes"
  | "bun-repl"
  | "apk-manager"
  | "diagnostics"
  | "ffi"
  | "bun-apis"
  | "benchmarks"
  | "m3-fusion"
  | "arcade";

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowState {
  id: AppId;
  title: string;
  icon: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  position: WindowPosition;
  size: WindowSize;
}
