import { expect, test } from "bun:test";
import { cookieHeader, normalizeCookieExport, rewritePlaylist } from "./hls-lab-core";

const cookie = {
  name: "session",
  value: "synthetic",
  domain: ".example.com",
  path: "/watch",
  secure: true,
  httpOnly: true,
  session: true,
  sameSite: null,
};

test("browser exports preserve unspecified SameSite and session expiry", () => {
  const result = normalizeCookieExport([cookie]);
  expect(result.bun[0]?.sameSite).toBeUndefined();
  expect(result.chromium[0]?.sameSite).toBeUndefined();
  expect(result.bun[0]?.expires).toBeUndefined();
  expect(new Bun.Cookie(result.bun[0]!).httpOnly).toBe(true);
});

test("cookies remain isolated across domains, paths, schemes and expiry", () => {
  const result = normalizeCookieExport([cookie]);
  expect(cookieHeader(result.chromium, new URL("https://www.example.com/watch/episode"))).toBe(
    "session=synthetic",
  );
  for (const url of [
    "https://notexample.com/watch",
    "https://example.com.attacker.test/watch",
    "https://example.com/watching",
    "http://example.com/watch",
  ]) {
    expect(cookieHeader(result.chromium, new URL(url))).toBe("");
  }
  const expired = normalizeCookieExport([{ ...cookie, session: false, expirationDate: 1 }]);
  expect(cookieHeader(expired.chromium, new URL("https://example.com/watch"), 2)).toBe("");
});

test("host-only cookies do not become domain cookies", () => {
  const result = normalizeCookieExport([{ ...cookie, domain: "www.example.com", hostOnly: true }]);
  expect(result.bun[0]?.domain).toBeUndefined();
  expect(result.chromium[0]?.url).toBe("https://www.example.com/watch");
  expect(cookieHeader(result.chromium, new URL("https://sub.www.example.com/watch"))).toBe("");
});

test("invalid exports cannot inject headers or collapse partition semantics", () => {
  expect(() =>
    normalizeCookieExport([{ ...cookie, value: "value\r\nInjected: header" }]),
  ).toThrow();
  expect(() => normalizeCookieExport([{ ...cookie, partitioned: true }])).toThrow();
});

test("HLS maps, variants and media retain base URL resolution", () => {
  const urls: string[] = [];
  rewritePlaylist(
    '#EXTM3U\n#EXT-X-MAP:URI="../init.mp4"\n#EXT-X-STREAM-INF:BANDWIDTH=100\nvariant.m3u8?token=synthetic\n#EXTINF:2,\npart.m4s\n',
    new URL("https://example.com/vod/master.m3u8"),
    (url) => {
      urls.push(url);
      return `/media/${urls.length}`;
    },
  );
  expect(urls).toEqual([
    "https://example.com/init.mp4",
    "https://example.com/vod/variant.m3u8?token=synthetic",
    "https://example.com/vod/part.m4s",
  ]);
});
