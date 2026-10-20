import { expect, test } from "bun:test";
import { mkdir, readdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import { deflateSync } from "node:zlib";
import { mp4 } from "../../test/js/bun/video/fixture";
import {
  probePublicMedia,
  qualifyShenronCorpus,
  readShenronCdnInventory,
  readShenronEpisodePage,
  writePrivateCorpusReport,
  type CorpusAsset,
} from "./shenron-video-corpus";

const sha = (bytes: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
function png() {
  const chunk = (name: string, bytes: Uint8Array) => {
    const body = Buffer.concat([Buffer.from(name), bytes]),
      size = Buffer.alloc(4),
      crc = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    crc.writeUInt32BE(Bun.hash.crc32(body));
    return Buffer.concat([size, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(new Uint8Array([0, 255, 0, 0, 255, 0, 0, 255, 255]))),
    chunk("IEND", new Uint8Array()),
  ]);
}
function mediaResponse(request: Request, bytes: Uint8Array, type: string, wrongRange = false) {
  const range = /^bytes=0-(\d+)$/.exec(request.headers.get("range") ?? "");
  const end = range ? Math.min(Number(range[1]), bytes.length - 1) : bytes.length - 1;
  return new Response(request.method === "HEAD" ? null : new Uint8Array(bytes.subarray(0, end + 1)), {
    status: range ? 206 : 200,
    headers: {
      "content-type": type,
      "content-length": String(end + 1),
      "accept-ranges": "bytes",
      ...(range ? { "content-range": `bytes 0-${wrongRange ? end + 1 : end}/${bytes.length}` } : {}),
    },
  });
}

test("HTTP corpus qualification checks range bytes and mirror parity without promoting publication or decoding a prefix", async () => {
  const bytes = Buffer.concat([mp4(), Buffer.alloc(1024)]);
  const requests: string[] = [];
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      requests.push(`${request.method} ${request.headers.get("range") ?? ""}`);
      return mediaResponse(request, bytes, "video/mp4");
    },
  });
  const input: CorpusAsset = {
    id: "fixture-media",
    publicationQualified: false,
    urls: [
      {
        role: "source",
        url: new URL("/source.mp4", server.url).href,
        mime: "video/mp4",
        bytes: bytes.length,
        sha256: sha(bytes),
      },
      {
        role: "cdn",
        url: new URL("/cdn.mp4", server.url).href,
        mime: "video/mp4",
        bytes: bytes.length,
        sha256: sha(bytes),
      },
    ],
  };
  using directory = tempDir("corpus-prefix", {});
  const report = await qualifyShenronCorpus({
    assets: [input],
    allowedOrigins: [server.url.origin],
    rangeBytes: 32,
    workDirectory: String(directory),
  });
  expect(report.completeCorpusQualified).toBe(false);
  expect(report.remoteMediaFilesWritten).toBe(false);
  expect(report.remoteWholeVideoObjectsRead).toBe(0);
  expect(report.networkBodyBytes).toBe(64);
  expect(report.assets[0]!.publicationQualified).toBe(false);
  expect(report.assets[0]!.originParity).toMatchObject({
    status: "passed",
    evidence: { comparison: "prefix-and-declared-size-only" },
  });
  expect(report.assets[0]!.urls[0]).toMatchObject({
    status: "passed",
    digestQualification: "prefix-only",
    expectedDigestVerified: false,
    decoded: false,
  });
  expect(requests).toEqual(["HEAD ", "GET bytes=0-31", "HEAD ", "GET bytes=0-31"]);
});

test("HTTP corpus qualification detects MIME, Content-Range, complete-body digest and mirror content failures", async () => {
  const image = png();
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/mime") return mediaResponse(request, image, "text/html");
      if (path === "/range") return mediaResponse(request, image, "image/png", true);
      return mediaResponse(request, image, "image/png");
    },
  });
  const base = { role: "cdn" as const, mime: "image/png", bytes: image.length };
  await expect(
    probePublicMedia({ ...base, url: new URL("/mime", server.url).href }, [server.url.origin]),
  ).rejects.toThrow("metadata-mismatch");
  await expect(
    probePublicMedia({ ...base, url: new URL("/range", server.url).href }, [server.url.origin]),
  ).rejects.toThrow("range-response");
  await expect(
    probePublicMedia({ ...base, url: new URL("/image", server.url).href, sha256: "0".repeat(64) }, [server.url.origin]),
  ).rejects.toThrow("digest-mismatch");
  const good = await probePublicMedia({ ...base, url: new URL("/image", server.url).href, sha256: sha(image) }, [
    server.url.origin,
  ]);
  expect(good).toMatchObject({ format: "png", expectedDigestVerified: true, digestQualification: "full-body" });
});

test("range totals qualify a CDN that omits Content-Length on HEAD", async () => {
  const bytes = mp4();
  const requests = new Map<object, string>();
  const server = Bun.listen({
    port: 0,
    hostname: "127.0.0.1",
    socket: {
      data(socket, data) {
        const request = (requests.get(socket) ?? "") + Buffer.from(data).toString();
        if (request.length > 8192) {
          socket.end();
          return;
        }
        requests.set(socket, request);
        if (!request.includes("\r\n\r\n")) return;
        const headers = "Content-Type: video/mp4\r\nAccept-Ranges: bytes\r\nConnection: close\r\n";
        if (request.startsWith("HEAD ")) socket.end(`HTTP/1.1 200 OK\r\n${headers}\r\n`);
        else {
          const prefix = bytes.subarray(0, 32);
          socket.end(
            Buffer.concat([
              Buffer.from(
                `HTTP/1.1 206 Partial Content\r\n${headers}Content-Range: bytes 0-31/${bytes.length}\r\nContent-Length: 32\r\n\r\n`,
              ),
              prefix,
            ]),
          );
        }
      },
      close(socket) {
        requests.delete(socket);
      },
    },
  });
  try {
    const sourceOrigin = `http://127.0.0.1:${server.port}`;
    const input = { role: "cdn" as const, url: new URL("/asset", sourceOrigin).href, mime: "video/mp4" };
    const fromRange = await probePublicMedia(input, [sourceOrigin], undefined, 32);
    expect(fromRange.bytes).toBe(bytes.length);
    expect(fromRange.checkedBytes).toBe(32);
    expect(fromRange.headContentLengthProvided).toBe(false);
    expect(fromRange.rangeQualified).toBe(true);
    expect(fromRange.digestQualification).toBe("prefix-only");
    await expect(
      probePublicMedia({ ...input, bytes: bytes.length + 1 }, [sourceOrigin], undefined, 32),
    ).rejects.toThrow("range-response-mismatch");
  } finally {
    server.stop(true);
  }
});

test("a corpus deadline cancels a stalled response and keeps remaining assets visible", async () => {
  const response = Promise.withResolvers<Response>();
  let requests = 0;
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      requests++;
      return response.promise;
    },
  });
  using directory = tempDir("shenron-corpus-deadline", {});
  const store = String(directory);
  try {
    const report = await qualifyShenronCorpus({
      allowedOrigins: [server.url.origin],
      workDirectory: store,
      deadlineMs: 1000,
      assets: [1, 2].map(id => ({
        id: `video-${id}`,
        urls: [{ role: "http", url: new URL(`/video-${id}.mp4`, server.url).href, mime: "video/mp4" }],
      })),
    });
    expect(requests).toBe(1);
    expect(report.requestedAssets).toBe(2);
    expect(report.checkedAssets).toBe(1);
    expect(report.remainingAssets).toBe(1);
    expect(report.checks.failed).toBe(1);
    expect(report.networkBodyBytes).toBe(0);
    expect(report.completeCorpusQualified).toBe(false);
  } finally {
    response.resolve(new Response(null, { status: 503 }));
  }
});

test("public corpus URLs reject credentials, signed queries, redirects and unapproved origins", async () => {
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      return Response.redirect("https://outside.invalid/private", 302);
    },
  });
  const base = { role: "source" as const, mime: "video/mp4" };
  await expect(
    probePublicMedia({ ...base, url: new URL("/redirect", server.url).href }, [server.url.origin]),
  ).rejects.toThrow();
  await expect(
    probePublicMedia({ ...base, url: new URL("/asset?token=fixture-secret", server.url).href }, [server.url.origin]),
  ).rejects.toThrow("non-public-url");
  await expect(
    probePublicMedia({ ...base, url: "https://fixture-user:fixture-secret@example.invalid/movie.mp4" }, [
      "https://example.invalid",
    ]),
  ).rejects.toThrow("non-public-url");
  await expect(
    probePublicMedia({ ...base, url: new URL("/asset", server.url).href }, ["https://allowed.invalid"]),
  ).rejects.toThrow("origin-not-allowed");
});

test("CDN inventory resumes immutable pages and refuses a changed revision or page digest", async () => {
  const revision = "a".repeat(64),
    bodies = [
      JSON.stringify({
        revision,
        path: null,
        page: 0,
        totalPages: 2,
        entries: [
          { path: "/first.png", mime: "image/png", size: 10, sha256: "1".repeat(64) },
          { path: "/second.mp4", mime: "video/mp4", size: 100, sha256: "2".repeat(64) },
        ],
      }),
      JSON.stringify({
        revision,
        path: null,
        page: 1,
        totalPages: 2,
        entries: [
          { path: "/script.js", mime: "text/javascript", size: 10, sha256: "3".repeat(64) },
          { path: "/third.gif", mime: "image/gif", size: 10, sha256: "4".repeat(64) },
        ],
      }),
    ];
  const paths = bodies.map((_, index) => `/catalog/assets/revisions/${revision}/files/page-${index}.json`);
  const index = {
    schema: "shenron-public-cdn/v1",
    revision,
    inventorySha256: "b".repeat(64),
    totalFiles: 4,
    pageSize: 2,
    files: { pages: bodies.map((body, index) => ({ url: paths[index], count: 2, sha256: sha(body) })) },
  };
  let corrupt = false;
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const path = new URL(request.url).pathname;
      return Response.json(
        path.endsWith("index.json") ? index : JSON.parse(corrupt ? bodies[1]! : bodies[paths.indexOf(path)]!),
      );
    },
  });
  const first = await readShenronCdnInventory({ cdnOrigin: server.url.origin, maxAssets: 1 });
  expect(first.assets).toHaveLength(1);
  expect(first.nextCursor).toEqual({ revision, page: 0, entry: 1 });
  expect(first.inventoryComplete).toBe(false);
  const second = await readShenronCdnInventory({
    cdnOrigin: server.url.origin,
    maxAssets: 1,
    cursor: first.nextCursor!,
  });
  expect(second.assets).toHaveLength(1);
  expect(second.nextCursor).toEqual({ revision, page: 1, entry: 0 });
  const third = await readShenronCdnInventory({
    cdnOrigin: server.url.origin,
    maxAssets: 1,
    cursor: second.nextCursor!,
  });
  expect(third.assets).toHaveLength(1);
  expect(third.nextCursor).toBeNull();
  expect(third.completeCorpusQualified).toBe(false);
  const videos = await readShenronCdnInventory({
    cdnOrigin: server.url.origin,
    maxAssets: 1,
    mediaKinds: ["video", "playlist"],
    visitAllEntries: true,
  });
  expect(videos.assets).toHaveLength(1);
  expect(videos.assets[0]!.urls![0]!.url).toEndWith("/second.mp4");
  expect(videos.entriesVisited).toBe(4);
  expect(videos.matchingMediaEntries).toBe(1);
  expect(videos.inventoryComplete).toBe(true);
  expect(videos.completeCorpusQualified).toBe(false);
  const boundedSelection = await readShenronCdnInventory({
    cdnOrigin: server.url.origin,
    maxAssets: 1,
    visitAllEntries: true,
  });
  expect(boundedSelection.assets).toHaveLength(1);
  expect(boundedSelection.matchingMediaEntries).toBe(3);
  expect(boundedSelection.selectedAssetsTruncated).toBe(true);
  expect(boundedSelection.nextCursor).toBeNull();
  await expect(
    readShenronCdnInventory({ cdnOrigin: server.url.origin, cursor: { revision: "c".repeat(64), page: 0, entry: 0 } }),
  ).rejects.toThrow("revision-changed");
  corrupt = true;
  await expect(readShenronCdnInventory({ cdnOrigin: server.url.origin })).rejects.toThrow("digest-mismatch");
});

test("episode metadata uses canonical native transports and omits stored providers", async () => {
  let heads = 0,
    gets = 0,
    signed = false;
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const url = new URL(request.url);
      expect(url.pathname).toBe("/api/episodes");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(url.searchParams.get("offset")).toBe("0");
      if (request.method === "HEAD") {
        heads++;
        return new Response(null, { headers: { "content-type": "application/json" } });
      }
      gets++;
      return Response.json({
        total: 10,
        count: 2,
        limit: 2,
        offset: 0,
        episodes: [
          {
            id: 1,
            nativeSource: { src: `/api/episodes/1/video${signed ? "?token=fixture-secret" : ""}`, type: "video/mp4" },
          },
          { id: 2, nativeSource: null, players: [{ src: "https://provider.invalid/?token=fixture-secret" }] },
        ],
      });
    },
  });
  const page = await readShenronEpisodePage({ siteOrigin: server.url.origin, limit: 2 });
  expect(page.assets).toEqual([
    {
      id: "episode-1",
      urls: [{ role: "http", url: new URL("/api/episodes/1/video", server.url).href, mime: "video/mp4" }],
    },
  ]);
  expect(page.unavailableSources).toBe(1);
  expect(page.unavailableEpisodeIds).toEqual(["2"]);
  expect(page.nextOffset).toBe(2);
  expect(page.consistency).toBe("mutable-offset-page");
  expect(page.completeCorpusQualified).toBe(false);
  expect(JSON.stringify(page)).not.toContain("fixture-secret");
  expect({ heads, gets }).toEqual({ heads: 1, gets: 1 });
  signed = true;
  await expect(readShenronEpisodePage({ siteOrigin: server.url.origin, limit: 2 })).rejects.toThrow("non-public-url");
});

test("episode series selection binds the requested catalogue page and retains missing native sources", async () => {
  const requests: string[] = [];
  let wrongSeries = false;
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const url = new URL(request.url);
      requests.push(`${request.method} ${url.pathname}${url.search}`);
      if (request.method === "HEAD") return new Response(null, { headers: { "content-type": "application/json" } });
      return Response.json({
        total: 2,
        count: 2,
        limit: 2,
        offset: 0,
        episodes: [
          {
            id: 875,
            series: wrongSeries ? "DBS" : "DBS_BEERUS",
            nativeSource: { src: "/api/episodes/875/video", type: "video/mp4" },
          },
          {
            id: 876,
            series: "DBS_BEERUS",
            nativeSource: null,
            players: [{ embedUrl: "https://provider.invalid/?token=fixture-secret" }],
          },
        ],
      });
    },
  });
  const options = { siteOrigin: server.url.origin, series: "DBS_BEERUS", limit: 2 };
  const page = await readShenronEpisodePage(options);
  expect(requests).toEqual([
    "HEAD /api/episodes?limit=2&offset=0&series=DBS_BEERUS",
    "GET /api/episodes?limit=2&offset=0&series=DBS_BEERUS",
  ]);
  expect(page).toMatchObject({
    series: "DBS_BEERUS",
    declaredTotalEpisodes: 2,
    episodesVisited: 2,
    unavailableSources: 1,
    unavailableEpisodeIds: ["876"],
    nextOffset: null,
    completeCorpusQualified: false,
  });
  expect(page.assets).toEqual([
    {
      id: "episode-875",
      urls: [{ role: "http", url: new URL("/api/episodes/875/video", server.url).href, mime: "video/mp4" }],
    },
  ]);
  expect(JSON.stringify(page)).not.toContain("fixture-secret");
  wrongSeries = true;
  await expect(readShenronEpisodePage(options)).rejects.toThrow("episode-series-mismatch");
});

test("invalid episode series are rejected before requesting catalogue metadata", async () => {
  let requests = 0;
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      requests++;
      return Response.json({});
    },
  });
  for (const series of ["", "dbs_beerus", "DBS&limit=200", "DBS/BEERUS", "A".repeat(33)])
    await expect(readShenronEpisodePage({ siteOrigin: server.url.origin, series })).rejects.toThrow(
      "invalid-episode-series",
    );
  expect(requests).toBe(0);
});

test("private reports refuse an existing file and an escaping directory link before creating descendants", async () => {
  using directory = tempDir("shenron-report-boundaries", {});
  const root = String(directory);
  const store = join(root, "reports"),
    protectedSource = join(root, "protected-source");
  try {
    await mkdir(store);
    await mkdir(protectedSource);
    const path = join(store, "one.json");
    await writePrivateCorpusReport(path, { completeCorpusQualified: false }, store);
    const original = await Bun.file(path).text();
    await expect(writePrivateCorpusReport(path, { completeCorpusQualified: true }, store)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await Bun.file(path).text()).toBe(original);
    await symlink(protectedSource, join(store, "escaped"), process.platform === "win32" ? "junction" : "dir");
    await expect(writePrivateCorpusReport(join(store, "escaped/new/report.json"), {}, store)).rejects.toThrow(
      "private-report-parent-escaped",
    );
    expect(await readdir(protectedSource)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.skipIf(typeof Bun.Image !== "function")(
  "local source image is transformed in an isolated worker, digest-bound and left intact",
  async () => {
    using directory = tempDir("corpus-local-image", {});
    const source = join(String(directory), "sources"),
      work = join(String(directory), "reports");
    await mkdir(source);
    const image = png(),
      path = join(source, "source.png");
    await Bun.write(path, image);
    const report = await qualifyShenronCorpus({
      assets: [{ id: "source-image", localPath: path, localSha256: sha(image), publicationQualified: false }],
      allowedOrigins: [],
      allowedLocalRoots: [source],
      workDirectory: work,
    });
    expect(report.assets[0]!.source).toMatchObject({
      status: "passed",
      expectedDigestVerified: true,
      native: { image: { status: "passed", evidence: { width: 64, height: 36, format: "png" } } },
    });
    expect(await Bun.file(path).bytes()).toEqual(image);
    expect(await readdir(work)).toEqual([]);
    expect(JSON.stringify(report)).not.toContain(path);
    expect(report.completeCorpusQualified).toBe(false);
  },
);

test("source and report boundaries refuse protected writes and never disclose unauthorized local paths", async () => {
  using directory = tempDir("corpus-boundaries", {});
  const source = join(String(directory), "sources"),
    work = join(String(directory), "reports");
  await mkdir(source);
  const outside = join(String(directory), "outside.mp4");
  await Bun.write(outside, mp4());
  await expect(
    qualifyShenronCorpus({
      assets: [],
      allowedOrigins: [],
      allowedLocalRoots: [source],
      workDirectory: join(source, "unsafe"),
    }),
  ).rejects.toThrow("overlaps");
  const report = await qualifyShenronCorpus({
    assets: [{ id: "unauthorized-source", localPath: outside }],
    allowedOrigins: [],
    allowedLocalRoots: [source],
    workDirectory: work,
  });
  expect(report.assets[0]!.source).toMatchObject({ status: "failed", code: "local-source-not-authorized" });
  expect(JSON.stringify(report)).not.toContain(outside);
  expect(await Bun.file(outside).bytes()).toEqual(mp4());
  expect(await readdir(work)).toEqual([]);
  await rm(outside);
});
