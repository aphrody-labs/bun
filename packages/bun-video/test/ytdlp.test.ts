import { describe, expect, test } from "bun:test";
import {
  listYtDlpExtractors,
  normalizeYtDlpOptions,
  parseYtDlpOptions,
  runYtDlp,
  runYtDlpCli,
  ytDlpRuntimeInfo,
} from "../src/ytdlp";

describe("yt-dlp Bun Python bridge", () => {
  test("normalizes aliases without dropping upstream options", () => {
    expect(
      normalizeYtDlpOptions({
        output: "private/video.%(ext)s",
        noWarnings: true,
        skipDownload: true,
        httpHeaders: { Origin: "https://www.crunchyroll.com" },
        custom_upstream_flag: 42,
      }),
    ).toEqual({
      outtmpl: "private/video.%(ext)s",
      no_warnings: true,
      skip_download: true,
      http_headers: { Origin: "https://www.crunchyroll.com" },
      custom_upstream_flag: 42,
    });
    expect(
      normalizeYtDlpOptions({ noWarnings: true, no_warnings: false, output: "alias", outtmpl: "canonical" }),
    ).toEqual({ no_warnings: false, outtmpl: "canonical" });
  });
  test("rejects credential URLs and cancellation before touching Python", async () => {
    await expect(runYtDlp({ url: "https://user:password@www.crunchyroll.com/watch/test" })).rejects.toThrow(
      "without credentials",
    );
    await expect(
      runYtDlp({ url: "https://www.crunchyroll.com/watch/test", signal: AbortSignal.abort(new Error("cancelled")) }),
    ).rejects.toThrow("cancelled");
    await expect(runYtDlpCli(["--format\0"])).rejects.toThrow("NUL");
  });
  test("native session reports reality and exposes the full installed extractor registry", async () => {
    const info = await ytDlpRuntimeInfo();
    expect(info.bunRevision).toBe(Bun.revision);
    if (Bun.env.BUN_PYTHON_HOST_LIBRARY || Bun.env.BUV_PYTHON_HOST_LIBRARY) expect(info.available).toBe(true);
    if (!info.available) {
      expect(info.error).toBeTruthy();
      return;
    }
    expect(info.pythonVersion).toMatch(/3\./);
    expect(info.ytDlpVersion).toMatch(/^\d{4}\./);
    const extractors = await listYtDlpExtractors();
    expect(extractors.length).toBeGreaterThan(1000);
    expect(extractors.some(row => row.name === "generic")).toBe(true);
    const parsed = await parseYtDlpOptions([
      "--skip-download",
      "--format",
      "best",
      "https://www.crunchyroll.com/watch/test",
    ]);
    expect(parsed.urls).toEqual(["https://www.crunchyroll.com/watch/test"]);
    expect(parsed.options.skip_download).toBe(true);
    const cli = await runYtDlpCli(["--version"]);
    expect(cli.exitCode).toBe(0);
    expect(cli.stdout.trim()).toBe(info.ytDlpVersion);
  });
});
