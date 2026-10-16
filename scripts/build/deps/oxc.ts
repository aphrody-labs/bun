import type { Dependency } from "../source.ts";
import { OXC_REVISION } from "../../aphrody/vendor-oxc.ts";

export const OXC_SOURCE = {
  kind: "github-archive",
  repo: "aphrody-labs/oxc",
  commit: OXC_REVISION,
} as const;

export const oxc: Dependency = {
  name: "oxc",
  source: () => OXC_SOURCE,
  build: () => ({ kind: "none" }),
  provides: () => ({ libs: [], includes: [] }),
};
