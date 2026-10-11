// SPDX-License-Identifier: Apache-2.0
export * from "@aphrody/bun-runtime-sdk/video/hls";
import { attachHlsPlayback, type HlsPlaybackOptions } from "@aphrody/bun-runtime-sdk/video/hls";
import type Hls from "hls.js";
import type { HlsConfig } from "hls.js";

export function getHlsBrowserAssetPath(): string {
  return Bun.resolveSync("hls.js", import.meta.dir).replace(/[\\/][^\\/]+$/, "/hls.min.js");
}

export async function attachVideoHlsPlayback(
  video: HTMLVideoElement,
  options: HlsPlaybackOptions<Partial<HlsConfig>, Hls>,
) {
  const view = video.ownerDocument?.defaultView;
  if (!view || !(video instanceof view.HTMLVideoElement))
    throw new Error("HLS playback requires a browser video element.");
  const { default: Decoder } = await import("hls.js");
  return attachHlsPlayback(video, Decoder, {
    ...options,
    config: { enableWorker: false, ...options.config },
  });
}
