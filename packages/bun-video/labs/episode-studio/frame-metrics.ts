import type { FrameAnalysis, FrameRgba } from "../../src/frame-analysis";

/** Compact projection of the canonical compute result. */
export type FrameMetrics = Pick<
  FrameAnalysis,
  | "dominantColor"
  | "samples"
  | "meanLuminance"
  | "luminanceVariance"
  | "laplacianVariance"
  | "edgeEnergy"
  | "detailScore"
  | "lowDetail"
  | "elapsedMs"
  | "computation"
  | "adapter"
>;

export type FrameAnalyzer = (frame: FrameRgba, signal: AbortSignal) => Promise<FrameMetrics>;
