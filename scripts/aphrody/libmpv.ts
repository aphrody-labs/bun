import { resolve } from "node:path";
import { runMediaSDKCommand } from "../../packages/bun-video/src/sdk";
import { runMediaSDKFactory } from "./media-sdk-factory";

if (!(await runMediaSDKFactory("mpv")) && !(await runMediaSDKCommand("mpv", resolve(import.meta.dir, "../.."))))
  throw new Error("usage: bun run libmpv plan|build|sdk-plan|sdk-build-native|sdk-build-linux|sdk-normalize");
