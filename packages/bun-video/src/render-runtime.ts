/** Unified Bun loader for the absorbed Remotion and HyperFrames code. */
export { AbsoluteFill, Easing, interpolate } from "../packages/remotion/packages/core/src/index";
export const loadRemotionCore = async () => import("../packages/remotion/packages/core/src/index");
export const loadRemotionRenderer = async () => import("../packages/remotion/packages/renderer/src/index");
export const loadHyperframesCore = async () => import("../packages/hyperframes/packages/core/src/index");
export const loadHyperframesEngine = async () => import("../packages/hyperframes/packages/engine/src/index");
export { generateSpringEaseData, SPRING_PRESETS } from "../packages/hyperframes/packages/parsers/src/gsapParser";
