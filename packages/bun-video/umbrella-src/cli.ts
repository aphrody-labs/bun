#!/usr/bin/env bun
export {};
const [command, ...args] = Bun.argv.slice(2);
switch (command) {
  case "site":
    await import("../labs/video-data-site").then(module => module.videoDataSiteMain(args));
    break;
  case "workers":
    await import("../labs/video-workers").then(module => module.videoWorkersMain(args));
    break;
  case "--video-worker": {
    const { runVideoWorkerEntry } = await import("../src/video-worker-entry");
    if (args.length !== 2) throw new Error("Worker requires private request and result paths");
    process.exitCode = await runVideoWorkerEntry(args[0]!, args[1]!);
    break;
  }
  case "ytdlp": {
    const { runYtDlpCli } = await import("../src/ytdlp");
    const result = await runYtDlpCli(args);
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
    break;
  }
  case "remotion": {
    process.argv = [process.argv[0]!, process.argv[1]!, ...args];
    const { default: dotenv } =
      await import("../packages/remotion/.aphrody/build-deps/node_modules/dotenv/lib/main.js");
    dotenv.config({ quiet: true });
    const { cli } = await import("../packages/remotion/packages/cli/src/index");
    await cli();
    break;
  }
  case "hyperframes": {
    process.argv = [process.argv[0]!, process.argv[1]!, ...args];
    process.env.BUN_VIDEO_HYPERFRAMES_CLI_PREFIX = "hyperframes";
    const { mediaAssets } = await import("bun-video:media-runtime");
    process.env.HYPERFRAMES_FFMPEG_PATH ??= mediaAssets.ffmpegExecutable;
    process.env.HYPERFRAMES_FFPROBE_PATH ??= mediaAssets.ffprobeExecutable;
    await import("../packages/hyperframes/packages/cli/src/cli");
    break;
  }
  case "capabilities":
    console.log(JSON.stringify(await import("../src/capabilities").then(mod => mod.capabilities()), null, 2));
    break;
  case "encode": {
    if (args.length !== 2) throw new Error("Usage: bun-video encode <frame-plan.json> <absolute-output.mkv>");
    const { mediaAssets } = await import("bun-video:media-runtime");
    const plan = await Bun.file(args[0]!).json();
    const { encodeVideo } = await import("../src/encode");
    console.log(JSON.stringify(await encodeVideo(plan, { ...mediaAssets, output: args[1]! })));
    break;
  }
  case "media-probe": {
    const { mediaAssets } = await import("bun-video:media-runtime");
    const child = Bun.spawn([mediaAssets.nativeExecutable, "probe"], {
      env: { ...process.env, BUN_VIDEO_FFMPEG: mediaAssets.ffmpegExecutable },
      stdout: "inherit",
      stderr: "inherit",
    });
    process.exitCode = await child.exited;
    break;
  }
  case "mcp":
    await import("../src/mcp").then(mod => mod.serveMcp());
    break;
  case undefined:
  case "help":
  case "--help":
  case "-h":
    console.log(
      "bun-video site [--port N]\nbun-video workers <command> [args]\nbun-video ytdlp [args]\nbun-video remotion <command> [args]\nbun-video hyperframes <command> [args]\nbun-video capabilities\nbun-video media-probe\nbun-video encode <frame-plan.json> <absolute-output.mkv>\nbun-video mcp\n\nBoth upstream CLIs share one compiled Bun executable. Native capture requires a qualified browser provider; capabilities reports provider availability.",
    );
    break;
  default:
    console.error(`Unknown bun-video command: ${command}`);
    process.exitCode = 2;
}
