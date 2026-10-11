// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { attachHlsPlayback } from "../src/video/hls";

const video = { ownerDocument: { URL: "https://site.test/watch", baseURI: "https://site.test/watch" } };
const config = { workerPath: "/assets/vendor/hls/hls.worker.js?v=1.7.3", backBufferLength: 30 };
class HlsFixture {
  static supported = true;
  static instances: HlsFixture[] = [];
  static isSupported() {
    return this.supported;
  }
  readonly calls: string[] = [];
  attached = false;
  listener?: () => void;
  failAttach = false;
  failLoad = false;
  failDestroy = false;
  constructor(readonly config?: { workerPath?: string | null; enableWorker?: boolean; backBufferLength?: number }) {
    HlsFixture.instances.push(this);
  }
  attachMedia(media: typeof video) {
    expect(media).toBe(video);
    this.calls.push("attach");
    this.attached = true;
    this.listener?.();
    if (this.failAttach) throw new Error("attach failed");
  }
  loadSource(src: string) {
    this.calls.push(src);
    if (this.failLoad) throw new Error("load failed");
  }
  destroy() {
    this.calls.push("destroy");
    if (this.failDestroy) throw new Error("destroy failed");
  }
}

test("event registration precedes attach/load, config and URL are preserved, cleanup is idempotent", () => {
  let listenerObserved = false;
  const playback = attachHlsPlayback(video, HlsFixture, {
    src: "https://media.test/master.m3u8?token=public-fixture",
    config,
    beforeStart(instance) {
      instance.listener = () => {
        listenerObserved = true;
      };
      expect(instance.calls).toEqual([]);
    },
  });
  expect(listenerObserved).toBe(true);
  expect(playback.instance.config).toEqual({
    ...config,
    workerPath: "https://site.test/assets/vendor/hls/hls.worker.js?v=1.7.3",
  });
  expect(playback.instance.calls).toEqual(["attach", "https://media.test/master.m3u8?token=public-fixture"]);
  playback.destroy();
  playback.destroy();
  expect(playback.instance.calls.filter(call => call === "destroy")).toHaveLength(1);
});

for (const workerPath of [
  "https://other.test/worker.js",
  "//other.test/worker.js",
  "data:text/javascript,0",
  "https://credential@site.test/worker.js",
]) {
  test("untrusted worker URL is rejected before constructing the decoder", () => {
    const before = HlsFixture.instances.length;
    expect(() => attachHlsPlayback(video, HlsFixture, { src: "/master.m3u8", config: { workerPath } })).toThrow();
    expect(HlsFixture.instances).toHaveLength(before);
  });
}

test("workers require a known page origin and explicit path; disabled workers need neither", () => {
  expect(() => attachHlsPlayback(video, HlsFixture, { src: "/master.m3u8" })).toThrow("workerPath");
  expect(() => attachHlsPlayback({}, HlsFixture, { src: "https://media.test/master.m3u8", config })).toThrow(
    "page URL",
  );
  const playback = attachHlsPlayback(video, HlsFixture, { src: "/master.m3u8", config: { enableWorker: false } });
  expect(playback.instance.calls[1]).toBe("https://site.test/master.m3u8");
  playback.destroy();
});

test("unsupported browser and invalid source create no decoder", () => {
  const before = HlsFixture.instances.length;
  HlsFixture.supported = false;
  try {
    expect(() => attachHlsPlayback(video, HlsFixture, { src: "/master.m3u8", config })).toThrow("not supported");
  } finally {
    HlsFixture.supported = true;
  }
  for (const src of ["", "data:text/plain,manifest", "https://user:pass@media.test/master.m3u8"])
    expect(() => attachHlsPlayback(video, HlsFixture, { src, config })).toThrow();
  expect(HlsFixture.instances).toHaveLength(before);
});

for (const failure of ["callback", "attach", "load", "load-and-destroy"] as const) {
  test("startup failure destroys only its owned instance and preserves the original error", () => {
    expect(() =>
      attachHlsPlayback(video, HlsFixture, {
        src: "/master.m3u8",
        config,
        beforeStart(instance) {
          instance.failAttach = failure === "attach";
          instance.failLoad = failure.startsWith("load");
          instance.failDestroy = failure === "load-and-destroy";
          if (failure === "callback") throw new Error("callback failed");
        },
      }),
    ).toThrow(failure.startsWith("load") ? "load failed" : `${failure} failed`);
    expect(HlsFixture.instances.at(-1)!.calls.filter(call => call === "destroy")).toHaveLength(1);
  });
}

test("asynchronous listener registration cannot race startup", () => {
  expect(() =>
    attachHlsPlayback(video, HlsFixture, { src: "/master.m3u8", config, beforeStart: async () => {} }),
  ).toThrow("synchronously");
  expect(HlsFixture.instances.at(-1)!.calls).toEqual(["destroy"]);
});

test("a foreign document base cannot authorize or redirect the worker", () => {
  const original = video.ownerDocument.baseURI;
  video.ownerDocument.baseURI = "https://other.test/subdirectory/";
  try {
    expect(() =>
      attachHlsPlayback(video, HlsFixture, {
        src: "master.m3u8",
        config: { workerPath: "https://other.test/worker.js" },
      }),
    ).toThrow("page origin");
    const playback = attachHlsPlayback(video, HlsFixture, { src: "master.m3u8", config });
    expect(playback.instance.config?.workerPath).toBe("https://site.test/assets/vendor/hls/hls.worker.js?v=1.7.3");
    expect(playback.instance.calls[1]).toBe("https://other.test/subdirectory/master.m3u8");
    playback.destroy();
  } finally {
    video.ownerDocument.baseURI = original;
  }
});
