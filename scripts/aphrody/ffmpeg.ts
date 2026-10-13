import { resolve } from "node:path";
import { runMediaSDKCommand } from "../../packages/bun-video/src/sdk";
import { runMediaSDKFactory } from "./media-sdk-factory";

if (!(await runMediaSDKFactory("ffmpeg")) && !(await runMediaSDKCommand("ffmpeg", resolve(import.meta.dir, "../.."))))
  throw new Error(
    "usage: bun run ffmpeg plan|configure|build|sdk-plan|sdk-build-native|sdk-build-linux|sdk-build-avio|sdk-normalize",
  );
