export interface ShowcaseBucketObject {
  size: number;
  httpEtag: string;
  body?: ReadableStream<Uint8Array>;
  range?: { offset: number; length: number };
  writeHttpMetadata(headers: Headers): void;
}

export interface ShowcaseEnvironment {
  SHOWCASE_PREFIX: string;
  SHOWCASE: {
    head(key: string): Promise<ShowcaseBucketObject | null>;
    get(key: string, options?: { onlyIf?: Headers; range?: Headers }): Promise<ShowcaseBucketObject | null>;
  };
}

export function serveShowcase(request: Request, env: ShowcaseEnvironment): Promise<Response>;
declare const worker: { fetch(request: Request, env: ShowcaseEnvironment): Promise<Response> };
export default worker;
