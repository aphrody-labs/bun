// SPDX-License-Identifier: Apache-2.0
export * from "../../packages/bun-video/src/apps/hls-live";
import { main } from "../../packages/bun-video/src/apps/hls-live";
if (import.meta.main)
  main().catch(() => {
    console.error("HLS lab failed; check local files and options. Secret values are omitted.");
    process.exitCode = 1;
  });
