// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { analyzeHar, validateCapturedManifest, validateHar } from "./hls-lab-har";

test("DASH qualification keeps playback metadata and removes secrets", () => {
  const secret = "credential-secret-marker";
  const body = `<MPD mediaPresentationDuration="PT1397.69S"><ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" cenc:default_KID="${secret}"><cenc:pssh>${secret}</cenc:pssh></ContentProtection><Representation id="${secret}" width="1920" height="1080" codecs="avc1.640028"><BaseURL>https://cdn.test/video?token=${secret}</BaseURL></Representation></MPD>`;
  const summary = analyzeHar({
    log: {
      entries: [
        {
          request: {
            url: `https://cdn.test/manifest.mpd?token=${secret}`,
            headers: [{ name: "Authorization", value: secret }],
          },
          response: { status: 200, content: { mimeType: "application/dash+xml", text: body } },
        },
      ],
    },
  });
  expect(summary.dashManifestCount).toBe(1);
  expect(summary.manifests[0]!.manifest).toEqual({
    kind: "dash",
    duration: "PT1397.69S",
    contentProtectionSystems: ["Widevine"],
    representations: [{ width: 1920, height: 1080, bandwidth: undefined, codecs: "avc1.640028" }],
  });
  expect(JSON.stringify(summary)).not.toContain(secret);
  expect(summary.qualification.playbackValidated).toBe(false);
});

test("base64 JSON bodies are parsed without recording contents", () => {
  const summary = analyzeHar({
    log: {
      entries: [
        {
          request: { url: "https://www.crunchyroll.com/api" },
          response: {
            status: 200,
            content: {
              mimeType: "application/json; charset=utf-8",
              encoding: "base64",
              text: Buffer.from('{"token":"secret"}').toString("base64"),
            },
          },
        },
      ],
    },
  });
  expect(summary.jsonResponses).toBe(1);
  expect(summary.crunchyrollJsonResponses).toBe(1);
  expect(JSON.stringify(summary)).not.toContain("secret");
});

test("HLS variants and segments are counted without recording URLs", () => {
  expect(
    validateCapturedManifest(
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttps://cdn.test/secret\n#EXTINF:2,\nsecret.ts\n",
      "application/vnd.apple.mpegurl",
    ),
  ).toEqual({ kind: "hls", variantCount: 1, segmentCount: 1, encrypted: false });
});

test("malformed captures and incomplete manifests fail without dumping data", () => {
  expect(() => validateHar({ log: { entries: [{}] } })).toThrow("Invalid HAR entry structure.");
  expect(() => validateCapturedManifest("<MPD><secret>value", "application/dash+xml")).toThrow(
    "Captured DASH manifest is incomplete.",
  );
});
