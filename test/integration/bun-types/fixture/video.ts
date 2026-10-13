import { expectType } from "./utilities";

const constructor: Bun.Video.ConstructorOptions = { maxPixels: 1024, autoOrient: true };
const video = new Bun.Video(new Uint8Array(), constructor);
const frames: Bun.Video.FramesOptions = { start: 0, end: 1, step: 0.5, maxFrames: 2 };
const audio: Bun.Video.AudioOptions = { start: 0, duration: 1, stream: 0, sampleRate: 16000 };
const gif: Bun.Video.GifOptions = { start: 0, duration: 1, fps: 12, width: 320 };

expectType(video.frames(frames)).is<Promise<Bun.Video.Frame[]>>();
expectType(video.frames({})).is<Promise<Bun.Video.Frame[]>>();
expectType(video.audio(audio)).is<Promise<Uint8Array>>();
expectType(video.audio({})).is<Promise<Uint8Array>>();
expectType(video.gif(gif)).is<Promise<Uint8Array>>();
expectType(video.gif({})).is<Promise<Uint8Array>>();
expectType(video.metadata()).is<Promise<Bun.Video.Metadata>>();
expectType(video.frame(0).resize(32, 24).webp()).is<Bun.Video>();
expectType(video.rgba()).is<Promise<Bun.Image.RGBA>>();

declare const metadata: Bun.Video.Metadata;
expectType(metadata.audioStreams).is<Bun.Video.AudioStreamMetadata[]>();
declare const frame: Bun.Video.Frame;
expectType(frame.time).is<number>();
expectType(frame.bytes).is<Uint8Array>();

// @ts-expect-error Duration is a numeric time, never a formatted string.
video.audio({ duration: "1s" });
// @ts-expect-error Geometry options retain the existing Image contract.
video.extract({ left: 0, top: 0, width: "32", height: 24 });
// @ts-expect-error Batches expose owned PNG bytes, never an encoded file path.
const _invalidFrame: Bun.Video.Frame = { time: 0, bytes: "frame.png" };
