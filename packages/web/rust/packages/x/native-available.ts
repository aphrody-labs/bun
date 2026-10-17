// SPDX-License-Identifier: Apache-2.0
import { resolveNativeLibraryPath } from "@aphrody/bun/src/library";

/** True when the aphrody-ffi cdylib can be resolved; tests that call into Rust skip otherwise. */
export const nativeAvailable = (() => {
  try {
    return resolveNativeLibraryPath() !== undefined;
  } catch {
    return false;
  }
})();
