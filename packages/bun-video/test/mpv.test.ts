import { describe, expect, test } from "bun:test";
import { MpvClient, mpvABI, mpvLibraryPath } from "../src/mpv";

describe.skipIf(!process.env.BUN_VIDEO_MEDIA_DIR)("native libmpv", () => {
  test("loads the client, render and custom-stream APIs from the same artifact", () => {
    using player = MpvClient.open({
      libraryPath: mpvLibraryPath(process.env.BUN_VIDEO_MEDIA_DIR),
      options: { vo: "null", ao: "null", "idle": "yes", "config": "no" },
    });
    for (const name of Object.keys(mpvABI)) {
      expect(typeof (player.symbols as Record<string, unknown>)[name]).toBe("function");
    }
    expect(player.pointer).toBeGreaterThan(0);
    expect(player.getProperty("idle-active")).toBe("yes");
    player.close();
    expect(() => player.pointer).toThrow("mpv client is closed");
    expect(() => player.symbols).toThrow("mpv client is closed");
  });
});
