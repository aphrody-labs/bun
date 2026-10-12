// Types for the package-compatible modules built into Bun. Implementations and
// upstream licence attribution are retained in src/js/thirdparty and internal/dotenv.ts.
declare module "dotenv" {
  export interface DotenvOptions {
    path?: string | URL | Array<string | URL>;
    encoding?: BufferEncoding;
    debug?: boolean | string;
    quiet?: boolean | string;
    override?: boolean | string;
    processEnv?: Record<string, string | undefined>;
    DOTENV_KEY?: string;
  }
  export interface DotenvConfigOutput {
    parsed: Record<string, string>;
    error?: Error;
  }
  export function parse(source: string | Buffer): Record<string, string>;
  export function populate(
    processEnv: Record<string, string | undefined>,
    parsed: Record<string, string>,
    options?: DotenvOptions,
  ): Record<string, string>;
  export function config(options?: DotenvOptions): DotenvConfigOutput;
  export function configDotenv(options?: DotenvOptions): DotenvConfigOutput;
  /** Bun's built-in implementation throws DECRYPTION_FAILED for vault decryption. */
  export function decrypt(encrypted: string, key: string): never;
  const dotenv: {
    config: typeof config;
    configDotenv: typeof configDotenv;
    decrypt: typeof decrypt;
    parse: typeof parse;
    populate: typeof populate;
  };
  export default dotenv;
}

declare module "dotenv/config" {
  const result: import("dotenv").DotenvConfigOutput;
  export = result;
}

declare module "erlpack" {
  export function pack(value: unknown): Buffer;
  export function unpack(data: ArrayBufferLike | ArrayBufferView): unknown;
  const erlpack: { pack: typeof pack; unpack: typeof unpack };
  export default erlpack;
}

declare module "tiny-invariant" {
  function invariant(condition: unknown, message?: string | (() => string)): asserts condition;
  export default invariant;
}

declare module "picocolors" {
  export type Formatter = (input: unknown) => string;
  export interface Colors {
    isColorSupported: boolean;
    reset: Formatter;
    bold: Formatter;
    dim: Formatter;
    italic: Formatter;
    underline: Formatter;
    inverse: Formatter;
    hidden: Formatter;
    strikethrough: Formatter;
    black: Formatter;
    red: Formatter;
    green: Formatter;
    yellow: Formatter;
    blue: Formatter;
    magenta: Formatter;
    cyan: Formatter;
    white: Formatter;
    gray: Formatter;
    bgBlack: Formatter;
    bgRed: Formatter;
    bgGreen: Formatter;
    bgYellow: Formatter;
    bgBlue: Formatter;
    bgMagenta: Formatter;
    bgCyan: Formatter;
    bgWhite: Formatter;
    blackBright: Formatter;
    redBright: Formatter;
    greenBright: Formatter;
    yellowBright: Formatter;
    blueBright: Formatter;
    magentaBright: Formatter;
    cyanBright: Formatter;
    whiteBright: Formatter;
    bgBlackBright: Formatter;
    bgRedBright: Formatter;
    bgGreenBright: Formatter;
    bgYellowBright: Formatter;
    bgBlueBright: Formatter;
    bgMagentaBright: Formatter;
    bgCyanBright: Formatter;
    bgWhiteBright: Formatter;
  }
  export function createColors(enabled?: boolean): Colors;
  export const isColorSupported: boolean;
  export const reset: Formatter, bold: Formatter, dim: Formatter, italic: Formatter;
  export const underline: Formatter, inverse: Formatter, hidden: Formatter, strikethrough: Formatter;
  export const black: Formatter, red: Formatter, green: Formatter, yellow: Formatter;
  export const blue: Formatter, magenta: Formatter, cyan: Formatter, white: Formatter, gray: Formatter;
  export const bgBlack: Formatter, bgRed: Formatter, bgGreen: Formatter, bgYellow: Formatter;
  export const bgBlue: Formatter, bgMagenta: Formatter, bgCyan: Formatter, bgWhite: Formatter;
  export const blackBright: Formatter, redBright: Formatter, greenBright: Formatter, yellowBright: Formatter;
  export const blueBright: Formatter, magentaBright: Formatter, cyanBright: Formatter, whiteBright: Formatter;
  export const bgBlackBright: Formatter, bgRedBright: Formatter, bgGreenBright: Formatter, bgYellowBright: Formatter;
  export const bgBlueBright: Formatter, bgMagentaBright: Formatter, bgCyanBright: Formatter, bgWhiteBright: Formatter;
  const picocolors: Colors & { createColors: typeof createColors };
  export default picocolors;
}

declare module "zlib-sync" {
  export interface InflateOptions {
    chunkSize?: number;
    windowBits?: number;
    to?: "string";
  }
  export class Inflate {
    constructor(options?: InflateOptions | null);
    readonly chunkSize: number;
    readonly windowBits: number;
    readonly err: number;
    readonly msg: string | null;
    readonly result: Buffer | string | null;
    push(buffer: ArrayBufferView, flush?: number | boolean): void;
  }
  export const ZLIB_VERSION: string;
  export const Z_NULL: 0;
  export const Z_NO_FLUSH: number, Z_PARTIAL_FLUSH: number, Z_SYNC_FLUSH: number, Z_FULL_FLUSH: number;
  export const Z_FINISH: number, Z_BLOCK: number, Z_TREES: number, Z_OK: number, Z_STREAM_END: number;
  export const Z_NEED_DICT: number, Z_ERRNO: number, Z_STREAM_ERROR: number, Z_DATA_ERROR: number;
  export const Z_MEM_ERROR: number, Z_BUF_ERROR: number, Z_VERSION_ERROR: number;
  export const Z_NO_COMPRESSION: number, Z_BEST_SPEED: number, Z_BEST_COMPRESSION: number;
  export const Z_DEFAULT_COMPRESSION: number, Z_FILTERED: number, Z_HUFFMAN_ONLY: number;
  export const Z_RLE: number, Z_FIXED: number, Z_DEFAULT_STRATEGY: number;
  export const Z_BINARY: number, Z_TEXT: number, Z_ASCII: number, Z_UNKNOWN: number, Z_DEFLATED: number;
  const zlibSync: {
    Inflate: typeof Inflate;
    ZLIB_VERSION: typeof ZLIB_VERSION;
    Z_NULL: typeof Z_NULL;
  } & {
    [
      K in
        | "Z_NO_FLUSH"
        | "Z_PARTIAL_FLUSH"
        | "Z_SYNC_FLUSH"
        | "Z_FULL_FLUSH"
        | "Z_FINISH"
        | "Z_BLOCK"
        | "Z_TREES"
        | "Z_OK"
        | "Z_STREAM_END"
        | "Z_NEED_DICT"
        | "Z_ERRNO"
        | "Z_STREAM_ERROR"
        | "Z_DATA_ERROR"
        | "Z_MEM_ERROR"
        | "Z_BUF_ERROR"
        | "Z_VERSION_ERROR"
        | "Z_NO_COMPRESSION"
        | "Z_BEST_SPEED"
        | "Z_BEST_COMPRESSION"
        | "Z_DEFAULT_COMPRESSION"
        | "Z_FILTERED"
        | "Z_HUFFMAN_ONLY"
        | "Z_RLE"
        | "Z_FIXED"
        | "Z_DEFAULT_STRATEGY"
        | "Z_BINARY"
        | "Z_TEXT"
        | "Z_ASCII"
        | "Z_UNKNOWN"
        | "Z_DEFLATED"
    ]: number;
  };
  export default zlibSync;
}
