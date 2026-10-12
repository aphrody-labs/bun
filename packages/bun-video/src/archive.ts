export type VideoArchiveFormat = "tar" | "tar.gz" | "zip";
export type VideoCompression = "gzip" | "zstd" | "brotli" | "deflate";

export interface VideoArchiveEntry { readonly [path: string]: string | Uint8Array | ArrayBuffer | Blob; }

/** Package media, manifests and thumbnails with Bun's native archive/compression stack. */
export async function writeVideoArchive(path: string, entries: VideoArchiveEntry, format: VideoArchiveFormat = "tar.gz"): Promise<void> {
  if (format === "zip") return await Bun.Archive.write(path, entries);
  return await Bun.Archive.write(path, entries, { compress: "gzip" });
}

export function compressVideoBytes(data: Uint8Array | ArrayBuffer | string, format: VideoCompression): Promise<Buffer> {
  switch (format) {
    case "gzip": return Promise.resolve(gzipSync(data));
    case "brotli": return Promise.resolve(deflateSync(data, { level: 11 }));
    case "zstd": return Promise.resolve(zstdCompressSync(data));
    case "deflate": return Promise.resolve(deflateSync(data));
  }
}

export function decompressVideoBytes(data: Uint8Array | ArrayBuffer, format: Exclude<VideoCompression, "brotli">): Promise<Buffer> {
  switch (format) {
    case "gzip": return Promise.resolve(gunzipSync(data));
    case "zstd": return Promise.resolve(zstdDecompressSync(data));
    case "deflate": return Promise.resolve(inflateSync(data));
  }
}
import { deflateSync, gunzipSync, gzipSync, inflateSync, zstdCompressSync, zstdDecompressSync } from "node:zlib";
