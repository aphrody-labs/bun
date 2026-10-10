export { interpolate } from "../remotion/packages/core/src/interpolate";
export { Easing } from "../remotion/packages/core/src/easing";
export {
  generateSpringEaseData,
  SPRING_PRESETS,
} from "../hyperframes/packages/parsers/src/springEase";
export { captureNativeRemotionFrame } from "../remotion/.aphrody/native-frame";
export type { NativeFrameOptions } from "../remotion/.aphrody/native-frame";
export { captureNativeWebViewFrames } from "../hyperframes/packages/engine/src/services/nativeWebViewCapture";
export type {
  NativeWebViewContext,
  NativeFrameCaptureOptions,
  NativeCapturedFrame,
} from "../hyperframes/packages/engine/src/services/nativeWebViewCapture";
export { captureParallelFrames } from "./parallel-capture";
export { validateFramePlan, partitionFrames } from "./frame-plan";
export type { FramePlan } from "./frame-plan";
export { encodeVideo } from "./encode";
export type { EncodeVideoOptions } from "./encode";
export { runBrowserTask } from "./computer";
export type { BrowserTask } from "./computer";

export const loadRemotionCore = () => import("../remotion/packages/core/src/index");
export const loadRemotionRenderer = () => import("../remotion/packages/renderer/src/index");
export const loadHyperframesCore = () => import("../hyperframes/packages/core/src/index");
export const loadHyperframesEngine = () => import("../hyperframes/packages/engine/src/index");
