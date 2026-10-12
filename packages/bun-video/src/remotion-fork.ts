import { createRequire } from "node:module";

const requireFork = createRequire(import.meta.url);
const core = requireFork("../remotion/packages/core/src/index") as {
  AbsoluteFill: any;
  Easing: any;
  interpolate: any;
};

/** Public Remotion primitives loaded from the vendored fork. */
export const AbsoluteFill = core.AbsoluteFill;
export const Easing = core.Easing;
export const interpolate = core.interpolate;

export const loadRemotionCore = async () => requireFork("../remotion/packages/core/src/index");
export const loadRemotionRenderer = async () => requireFork("../remotion/packages/renderer/src/index");
