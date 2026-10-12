export { interpolate } from "../packages/remotion/packages/core/src/interpolate";
export { Easing } from "../packages/remotion/packages/core/src/easing";
export { generateSpringEaseData, SPRING_PRESETS } from "../packages/hyperframes/packages/parsers/src/springEase";
export { captureNativeRemotionFrame } from "../packages/remotion/.aphrody/native-frame";
export type { NativeFrameOptions } from "../packages/remotion/.aphrody/native-frame";
export { captureNativeWebViewFrames } from "../packages/hyperframes/packages/engine/src/services/nativeWebViewCapture";
export type {
  NativeWebViewContext,
  NativeFrameCaptureOptions,
  NativeCapturedFrame,
} from "../packages/hyperframes/packages/engine/src/services/nativeWebViewCapture";
export { captureParallelFrames } from "./parallel-capture";
export { validateFramePlan, partitionFrames } from "./frame-plan";
export type { FramePlan } from "./frame-plan";
export { encodeVideo } from "./encode";
export type { EncodeVideoOptions } from "./encode";
export { runBrowserTask } from "./computer";
export type { BrowserTask } from "./computer";

export const loadRemotionCore = () => import("../packages/remotion/packages/core/src/index");
export const loadRemotionRenderer = () => import("../packages/remotion/packages/renderer/src/index");
export const loadHyperframesCore = () => import("../packages/hyperframes/packages/core/src/index");
export const loadHyperframesEngine = () => import("../packages/hyperframes/packages/engine/src/index");
