// SPDX-License-Identifier: Apache-2.0
export * from "../../packages/bun-video/labs/dash-lab";
import { main } from "../../packages/bun-video/labs/dash-lab";
if (import.meta.main)
  main().catch(() => {
    console.error(
      "Video lab failed; check private inputs and options. Captured values are omitted.",
    );
    process.exitCode = 1;
  });
