export type VideoSource = string | URL | Blob | ArrayBuffer | Uint8Array | Request | Response;

export type ResolvedVideoSource =
  | { kind: "remote"; url: string }
  | { kind: "file"; path: string }
  | { kind: "bytes"; data: Blob | ArrayBuffer | Uint8Array };

/** Normalize every supported source shape without copying byte-backed inputs. */
export function resolveVideoSource(source: VideoSource): ResolvedVideoSource {
  if (source instanceof Blob) return { kind: "bytes", data: source };
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source))
    return { kind: "bytes", data: source as ArrayBuffer | Uint8Array };
  if (source instanceof Request || source instanceof Response) {
    if (!source.body) return { kind: "bytes", data: new Uint8Array() };
    throw new TypeError("ReadableStream sources must be consumed with response.arrayBuffer() before normalization");
  }
  const value = source instanceof URL ? source : new URL(source, "file:///");
  if (value.protocol === "http:" || value.protocol === "https:") return { kind: "remote", url: value.href };
  if (value.protocol === "file:") return { kind: "file", path: decodeURIComponent(value.pathname) };
  if (source instanceof URL) throw new TypeError(`Unsupported video source protocol: ${value.protocol}`);
  return { kind: "file", path: source };
}
