import { AbsoluteFill } from "remotion";
import { Video } from "@remotion/media";
import type { StudioAsset } from "./studio";

export interface StudioRemotionProps {
  readonly asset: StudioAsset;
  readonly startFrom?: number;
  readonly endAt?: number;
  readonly volume?: number;
  readonly playbackRate?: number;
  readonly objectFit?: "contain" | "cover" | "fill";
}

/** Render one studio asset inside a Remotion composition with Bun's native pipeline. */
export function StudioRemotionComposition({
  asset,
  startFrom = 0,
  endAt,
  volume = 1,
  playbackRate = 1,
  objectFit = "contain",
}: StudioRemotionProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Video
        src={asset.src}
        trimBefore={startFrom}
        trimAfter={endAt}
        volume={volume}
        playbackRate={playbackRate}
        style={{ width: "100%", height: "100%", objectFit }}
      />
    </AbsoluteFill>
  );
}
