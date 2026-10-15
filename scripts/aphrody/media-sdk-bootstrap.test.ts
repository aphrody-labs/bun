import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";
import {
  nativeMediaSourceArchivePin,
  qualifyNativeBootstrapCandidate,
  nativeBootstrapProbe,
} from "./release-native-worker";

test("native source provisioning rejects unowned URLs and missing content pins before download", () => {
  const pin = {
    BUN_MEDIA_SOURCE_ARCHIVE_URL: "https://bun-lib.aphrody.app/media/sources/pinned.tar.gz",
    BUN_MEDIA_SOURCE_ARCHIVE_SHA256: "a".repeat(64),
    BUN_MEDIA_SOURCE_ARCHIVE_BYTES: "1024",
  };
  expect(nativeMediaSourceArchivePin(pin)).toEqual({
    url: pin.BUN_MEDIA_SOURCE_ARCHIVE_URL,
    sha256: "a".repeat(64),
    bytes: 1024,
  });
  for (const changes of [
    { BUN_MEDIA_SOURCE_ARCHIVE_URL: "https://evil.example/source.tar.gz" },
    { BUN_MEDIA_SOURCE_ARCHIVE_URL: pin.BUN_MEDIA_SOURCE_ARCHIVE_URL + "?token=private" },
    { BUN_MEDIA_SOURCE_ARCHIVE_URL: "https://user:password@bun-lib.aphrody.app/media/sources/a" },
    { BUN_MEDIA_SOURCE_ARCHIVE_SHA256: "" },
    { BUN_MEDIA_SOURCE_ARCHIVE_BYTES: "536870913" },
  ])
    expect(() => nativeMediaSourceArchivePin({ ...pin, ...changes })).toThrow("source archive");
});

test("candidate qualification binds actual capability subprocess readback to binary bytes and source ABI", async () => {
  using directory = tempDir("native-bootstrap-candidate", { "candidate.exe": "fixture binary" });
  const root = String(directory),
    runtime = join(root, "candidate.exe"),
    source = "a".repeat(40);
  const input = { runtime, sha256: await hashSDKFile(runtime), source, target: "windows-x64", root, diagnostics: root };
  let calls = 0;
  const run = async (argv: string[]) => {
    calls++;
    expect(argv).toEqual([runtime, "--no-env-file", "-e", nativeBootstrapProbe]);
    return {
      stdout: JSON.stringify({ zip: true, ffi: true, revision: source, platform: "win32", arch: "x64" }),
      stderr: "",
    };
  };
  expect((await qualifyNativeBootstrapCandidate(input, run)).nativeReleaseQualified).toBe(false);
  expect(calls).toBe(1);
  for (const changed of [
    { zip: false },
    { ffi: false },
    { revision: "b".repeat(40) },
    { platform: "linux" },
    { arch: "arm64" },
  ])
    await expect(
      qualifyNativeBootstrapCandidate(input, async () => ({
        stdout: JSON.stringify({ zip: true, ffi: true, revision: source, platform: "win32", arch: "x64", ...changed }),
        stderr: "",
      })),
    ).rejects.toThrow("capability readback");
  await Bun.write(runtime, "mutated binary");
  await expect(qualifyNativeBootstrapCandidate(input, run)).rejects.toThrow("immutable pin");
  expect(calls).toBe(1);
});
