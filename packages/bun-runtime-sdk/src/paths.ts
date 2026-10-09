// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function runtimeHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.BUV_RUNTIME_HOME || env.YOLO_RUNTIME_HOME;
  if (explicit) return resolve(explicit);
  const home = env.BUV_HOME || env.YOLO_HOME;
  return join(home ? resolve(home) : join(homedir(), ".buv"), "runtime");
}
