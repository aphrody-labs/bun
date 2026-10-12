/** Unified Bun loader for the absorbed Remotion and HyperFrames code. */
const load = require;

const remotion = load("../packages/remotion/packages/core/src/index") as {
  AbsoluteFill: any;
  Easing: any;
  interpolate: any;
};

export const AbsoluteFill = remotion.AbsoluteFill;
export const Easing = remotion.Easing;
export const interpolate = remotion.interpolate;
export const loadRemotionCore = async () => load("../packages/remotion/packages/core/src/index");
export const loadRemotionRenderer = async () => load("../packages/remotion/packages/renderer/src/index");
export const loadHyperframesCore = async () => load("../packages/hyperframes/packages/core/src/index");
export const loadHyperframesEngine = async () => load("../packages/hyperframes/packages/engine/src/index");
export const { generateSpringEaseData, SPRING_PRESETS } = load(
  "../packages/hyperframes/packages/parsers/src/gsapParser",
);
