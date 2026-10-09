import { dlopen, FFIType, ptr, suffix, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";

const ABI_VERSION = 1;

const SYMBOLS = {
  bun_llama_abi_version: { args: [], returns: FFIType.u32 },
  bun_llama_last_error: { args: [], returns: FFIType.cstring },
  bun_llama_backend_init: { args: [], returns: FFIType.void },
  bun_llama_system_info: { args: [], returns: FFIType.cstring },
  bun_llama_model_load: { args: [FFIType.cstring, FFIType.i32, FFIType.i32], returns: FFIType.ptr },
  bun_llama_model_free: { args: [FFIType.ptr], returns: FFIType.void },
  bun_llama_n_vocab: { args: [FFIType.ptr], returns: FFIType.i32 },
  bun_llama_n_ctx_train: { args: [FFIType.ptr], returns: FFIType.i32 },
  bun_llama_is_eog: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  bun_llama_tokenize: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.i32, FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },
  bun_llama_token_to_piece: {
    args: [FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },
  bun_llama_detokenize: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.i32, FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },
  bun_llama_context_new: { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32], returns: FFIType.ptr },
  bun_llama_context_free: { args: [FFIType.ptr], returns: FFIType.void },
  bun_llama_context_n_ctx: { args: [FFIType.ptr], returns: FFIType.u32 },
  bun_llama_context_reset: { args: [FFIType.ptr], returns: FFIType.void },
  bun_llama_decode: { args: [FFIType.ptr, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  bun_llama_sampler_new: { args: [FFIType.f32, FFIType.i32, FFIType.f32, FFIType.u32], returns: FFIType.ptr },
  bun_llama_sampler_free: { args: [FFIType.ptr], returns: FFIType.void },
  bun_llama_next: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
} as const;

type Symbols = ReturnType<typeof dlopen<typeof SYMBOLS>>["symbols"];

export class LlamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlamaError";
  }
}

export interface SamplingOptions {
  /** Softmax temperature. `0` (the default) selects greedy decoding. */
  temperature?: number;
  /** Keep the `topK` most likely tokens. `0` disables the stage. */
  topK?: number;
  /** Nucleus sampling threshold. `1` disables the stage. */
  topP?: number;
  /** Seed of the random sampler. Defaults to a fixed value so runs are reproducible. */
  seed?: number;
}

export interface GenerateOptions extends SamplingOptions {
  /** Maximum number of generated tokens. Defaults to 128. */
  maxTokens?: number;
  /** Stops generation. Checked between tokens. */
  signal?: AbortSignal;
  /** Parse special tokens such as `<s>` in the prompt as tokens instead of text. */
  parseSpecial?: boolean;
}

export interface ContextOptions {
  /** Context window in tokens. `0` uses the training context of the model. */
  contextSize?: number;
  /** Maximum tokens per decode call. `0` keeps the llama.cpp default. */
  batchSize?: number;
  /** CPU threads. Defaults to the number of available cores. */
  threads?: number;
}

export interface LoadOptions {
  /** Path of the `libbun_llama` shared library. Defaults to `BUN_LLAMA_LIBRARY`, then `build/` next to this package. */
  library?: string;
  /** Layers offloaded to a GPU backend. The CPU-only build ignores it. Defaults to 0. */
  gpuLayers?: number;
  /** Memory-map the model file. Defaults to true. */
  mmap?: boolean;
}

let loaded: { path: string; symbols: Symbols } | undefined;

function libraryPath(explicit?: string): string {
  const candidate =
    explicit ||
    process.env.BUN_LLAMA_LIBRARY ||
    join(import.meta.dir, "..", "build", `${process.platform === "win32" ? "" : "lib"}bun_llama.${suffix}`);
  const path = resolve(candidate);
  if (!existsSync(path)) {
    throw new LlamaError(
      `libbun_llama not found at ${path}; build it with 'bun packages/bun-llama/native/build.ts' or set BUN_LLAMA_LIBRARY`,
    );
  }
  return path;
}

function symbols(explicit?: string): Symbols {
  const path = libraryPath(explicit);
  if (loaded) {
    if (loaded.path !== path) throw new LlamaError(`libbun_llama already loaded from ${loaded.path}`);
    return loaded.symbols;
  }
  const { symbols } = dlopen(path, SYMBOLS);
  if (symbols.bun_llama_abi_version() !== ABI_VERSION) {
    throw new LlamaError(`libbun_llama at ${path} has ABI ${symbols.bun_llama_abi_version()}, expected ${ABI_VERSION}`);
  }
  symbols.bun_llama_backend_init();
  loaded = { path, symbols };
  return symbols;
}

const encoder = new TextEncoder();

/** A GGUF model. Free it with `close()` or `using`. */
export class LlamaModel implements Disposable {
  readonly #s: Symbols;
  #handle: Pointer | null;

  private constructor(s: Symbols, handle: Pointer) {
    this.#s = s;
    this.#handle = handle;
  }

  static load(path: string, options: LoadOptions = {}): LlamaModel {
    const s = symbols(options.library);
    const handle = s.bun_llama_model_load(
      Buffer.from(`${resolve(path)}\0`),
      options.gpuLayers ?? 0,
      options.mmap === false ? 0 : 1,
    );
    if (!handle) throw new LlamaError(`cannot load ${path}: ${s.bun_llama_last_error() || "unknown error"}`);
    return new LlamaModel(s, handle);
  }

  /** CPU features and backends compiled into the library. */
  static systemInfo(options: Pick<LoadOptions, "library"> = {}): string {
    return String(symbols(options.library).bun_llama_system_info());
  }

  get handle(): Pointer {
    if (!this.#handle) throw new LlamaError("model is closed");
    return this.#handle;
  }

  get vocabSize(): number {
    return this.#s.bun_llama_n_vocab(this.handle);
  }

  get trainContext(): number {
    return this.#s.bun_llama_n_ctx_train(this.handle);
  }

  isEndOfGeneration(token: number): boolean {
    return this.#s.bun_llama_is_eog(this.handle, token) !== 0;
  }

  tokenize(text: string, options: { addSpecial?: boolean; parseSpecial?: boolean } = {}): Int32Array {
    const bytes = encoder.encode(text);
    const add = options.addSpecial === false ? 0 : 1;
    const parse = options.parseSpecial ? 1 : 0;
    let out = new Int32Array(Math.max(8, bytes.length + 2));
    let count = this.#s.bun_llama_tokenize(this.handle, ptr(bytes), bytes.length, ptr(out), out.length, add, parse);
    if (count < 0) {
      out = new Int32Array(-count);
      count = this.#s.bun_llama_tokenize(this.handle, ptr(bytes), bytes.length, ptr(out), out.length, add, parse);
    }
    if (count < 0) throw new LlamaError("tokenization failed");
    return out.slice(0, count);
  }

  /** The raw bytes of one token. Multi-byte characters can span several tokens. */
  pieceBytes(token: number, special = false): Uint8Array {
    let buf = new Uint8Array(32);
    let n = this.#s.bun_llama_token_to_piece(this.handle, token, ptr(buf), buf.length, special ? 1 : 0);
    if (n < 0) {
      buf = new Uint8Array(-n);
      n = this.#s.bun_llama_token_to_piece(this.handle, token, ptr(buf), buf.length, special ? 1 : 0);
    }
    return buf.subarray(0, Math.max(0, n));
  }

  detokenize(tokens: ArrayLike<number>, options: { removeSpecial?: boolean; unparseSpecial?: boolean } = {}): string {
    const input = Int32Array.from(tokens);
    if (input.length === 0) return "";
    const remove = options.removeSpecial === false ? 0 : 1;
    const unparse = options.unparseSpecial ? 1 : 0;
    let buf = new Uint8Array(Math.max(16, input.length * 8));
    let n = this.#s.bun_llama_detokenize(this.handle, ptr(input), input.length, ptr(buf), buf.length, remove, unparse);
    if (n < 0) {
      buf = new Uint8Array(-n);
      n = this.#s.bun_llama_detokenize(this.handle, ptr(input), input.length, ptr(buf), buf.length, remove, unparse);
    }
    if (n < 0) throw new LlamaError("detokenization failed");
    return new TextDecoder().decode(buf.subarray(0, n));
  }

  createContext(options: ContextOptions = {}): LlamaContext {
    const handle = this.#s.bun_llama_context_new(
      this.handle,
      options.contextSize ?? 0,
      options.batchSize ?? 0,
      options.threads ?? availableParallelism(),
    );
    if (!handle) throw new LlamaError(`cannot create context: ${this.#s.bun_llama_last_error() || "unknown error"}`);
    return new LlamaContext(this.#s, this, handle);
  }

  close(): void {
    if (!this.#handle) return;
    this.#s.bun_llama_model_free(this.#handle);
    this.#handle = null;
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

/** An inference context with its own KV cache. Generation calls on one context must not overlap. */
export class LlamaContext implements Disposable {
  readonly #s: Symbols;
  readonly model: LlamaModel;
  #handle: Pointer | null;

  constructor(s: Symbols, model: LlamaModel, handle: Pointer) {
    this.#s = s;
    this.model = model;
    this.#handle = handle;
  }

  get size(): number {
    return this.#s.bun_llama_context_n_ctx(this.#live());
  }

  #live(): Pointer {
    if (!this.#handle) throw new LlamaError("context is closed");
    return this.#handle;
  }

  /** Forgets everything decoded so far. */
  reset(): void {
    this.#s.bun_llama_context_reset(this.#live());
  }

  /** Streams the completion of `prompt` as text chunks. The context starts from an empty state. */
  async *generate(prompt: string, options: GenerateOptions = {}): AsyncGenerator<string, void, void> {
    for await (const token of this.generateTokens(
      this.model.tokenize(prompt, { parseSpecial: options.parseSpecial }),
      options,
    )) {
      yield token.text;
    }
  }

  /** Streams token ids with their decoded text. Partial UTF-8 sequences are held back until complete. */
  async *generateTokens(
    prompt: ArrayLike<number>,
    options: GenerateOptions = {},
  ): AsyncGenerator<{ token: number; text: string }, void, void> {
    const ctx = this.#live();
    const maxTokens = options.maxTokens ?? 128;
    const input = Int32Array.from(prompt);
    if (input.length === 0) throw new LlamaError("empty prompt");
    if (input.length + maxTokens > this.size) {
      throw new LlamaError(
        `prompt of ${input.length} tokens plus ${maxTokens} new tokens exceeds the context of ${this.size}`,
      );
    }
    this.reset();
    const sampler = this.#s.bun_llama_sampler_new(
      options.temperature ?? 0,
      options.topK ?? 40,
      options.topP ?? 1,
      options.seed ?? 0x5eed,
    );
    if (!sampler) throw new LlamaError("cannot create sampler");
    const decoder = new TextDecoder();
    try {
      if (this.#s.bun_llama_decode(ctx, ptr(input), input.length) !== 0) {
        throw new LlamaError(String(this.#s.bun_llama_last_error()));
      }
      for (let i = 0; i < maxTokens; i++) {
        options.signal?.throwIfAborted();
        const token = this.#s.bun_llama_next(ctx, sampler);
        if (token < 0) throw new LlamaError(String(this.#s.bun_llama_last_error()));
        if (this.model.isEndOfGeneration(token)) return;
        yield { token, text: decoder.decode(this.model.pieceBytes(token), { stream: true }) };
        await Promise.resolve();
      }
    } finally {
      this.#s.bun_llama_sampler_free(sampler);
    }
  }

  /** Runs a completion to the end and returns the full text. */
  async complete(prompt: string, options: GenerateOptions = {}): Promise<string> {
    let text = "";
    for await (const chunk of this.generate(prompt, options)) text += chunk;
    return text;
  }

  close(): void {
    if (!this.#handle) return;
    this.#s.bun_llama_context_free(this.#handle);
    this.#handle = null;
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

