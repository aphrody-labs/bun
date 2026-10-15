/** Unified Bun loader for the absorbed Remotion and HyperFrames code. */
export { AbsoluteFill, Easing, interpolate } from "../remotion/core/src/index";
export const loadRemotionCore = async () => import("../remotion/core/src/index");
export const loadRemotionRenderer = async () => import("../remotion/renderer/src/index");
export const loadHyperframesCore = async () => import("../hyperframes/core/src/index");
export const loadHyperframesEngine = async () => import("../hyperframes/engine/src/index");
export { generateSpringEaseData, SPRING_PRESETS } from "../hyperframes/parsers/src/gsapParser";
