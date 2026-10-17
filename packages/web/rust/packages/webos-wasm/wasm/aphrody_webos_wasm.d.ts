/* tslint:disable */
/* eslint-disable */
/**
 * The `ReadableStreamType` enum.
 *
 * *This API requires the following crate features to be activated: `ReadableStreamType`*
 */

export type ReadableStreamType = "bytes";

export class IntoUnderlyingByteSource {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cancel(): void;
    pull(controller: ReadableByteStreamController): Promise<any>;
    start(controller: ReadableByteStreamController): void;
    readonly autoAllocateChunkSize: number;
    readonly type: ReadableStreamType;
}

export class IntoUnderlyingSink {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    abort(reason: any): Promise<any>;
    close(): Promise<any>;
    write(chunk: any): Promise<any>;
}

export class IntoUnderlyingSource {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cancel(): void;
    pull(controller: ReadableStreamDefaultController): Promise<any>;
}

/**
 * Raw local shell engine for a dedicated OPFS worker. The main thread owns VT state.
 */
export class WebLocalEngine {
    free(): void;
    [Symbol.dispose](): void;
    exited(): boolean;
    /**
     * Return an image only after a mutating shell command.
     * Empty bytes mean no persistence work is needed.
     *
     * # Errors
     * Returns an error if the image exceeds its size limit.
     */
    image_if_dirty(): Uint8Array;
    /**
     * Feed input bytes without parsing VT state in this worker.
     */
    input(bytes: Uint8Array): Uint8Array;
    /**
     * Acknowledge a successful OPFS flush.
     */
    mark_persisted(): void;
    /**
     * Restore a persisted filesystem image and start a local shell.
     *
     * # Errors
     * Returns an error if the image is invalid or the terminal dimensions are zero.
     */
    constructor(image: Uint8Array, cols: number, rows: number);
    /**
     * Resize the session.
     *
     * # Errors
     * Returns an error for zero dimensions or an exited shell.
     */
    resize(cols: number, rows: number): void;
    /**
     * Initial greeting and prompt; called once by the worker.
     */
    take_greeting(): Uint8Array;
}

/**
 * OPFS-persisted filesystem shared by every WebOS app.
 */
export class WebOsFs {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Apply a Codex-style `*** Begin Patch` document; relative paths resolve
     * against `cwd`. Returns `{"added","modified","deleted"}`.
     *
     * # Errors
     * Throws on a malformed patch or a hunk that does not match.
     */
    applyPatch(patch: string, cwd: string): string;
    /**
     * New APFS1 image when something changed, empty otherwise.
     *
     * # Errors
     * Throws when the image would exceed the OPFS slot size.
     */
    imageIfDirty(): Uint8Array;
    /**
     * `[{"name","kind":"file"|"dir","size"}]` sorted by name.
     *
     * # Errors
     * Throws when the path is missing or not a directory.
     */
    list(path: string): string;
    /**
     * Acknowledge that the last image reached OPFS.
     */
    markPersisted(): void;
    /**
     * `mkdir -p`.
     *
     * # Errors
     * Throws when a component is a file.
     */
    mkdir(path: string): void;
    /**
     * Restore from an APFS1 image; an empty image starts a new filesystem.
     *
     * # Errors
     * Throws on a truncated, corrupt or oversized image.
     */
    constructor(image: Uint8Array);
    /**
     * BM25 search over the text files of the home directory, chunked by `aphrody-rag-core`:
     * `{"results":[{path,start_line,end_line,score,content}]}`.
     */
    ragSearch(query: string, limit: number): string;
    /**
     * `{"documents","chunks"}` of the searchable home directory.
     */
    ragStats(): string;
    /**
     * Whole file contents.
     *
     * # Errors
     * Throws when the file is missing or a directory.
     */
    read(path: string): Uint8Array;
    /**
     * `rm -r`.
     *
     * # Errors
     * Throws when the path does not resolve.
     */
    remove(path: string): void;
    /**
     * Move a node.
     *
     * # Errors
     * Same rules as [`Vfs::rename`].
     */
    rename(from: string, to: string): void;
    /**
     * Answer one explorer wire request (`{"Query"|"Action": ...}`) from this filesystem;
     * `now` is an RFC 3339 timestamp, as the VFS stores none. Always returns the wire
     * envelope: `{"json": ...}`, `{"error": "..."}` or `"Pong"`.
     */
    rpc(request: string, now: string): string;
    /**
     * Start a terminal whose shell works on this very filesystem, so files written by
     * the explorer and by shell commands are the same files and share one OPFS image.
     *
     * # Errors
     * Throws when the dimensions are zero.
     */
    shell(cols: number, rows: number): WebOsShell;
    /**
     * `{"kind","size"}`.
     *
     * # Errors
     * Throws when the path does not resolve.
     */
    stat(path: string): string;
    /**
     * Printable strings of a file as a JSON array.
     *
     * # Errors
     * Throws when the file is unreadable.
     */
    strings(path: string, min_len: number, limit: number): string;
    /**
     * `aphrody re triage` report (format, sections, hashes, strings) as JSON.
     *
     * # Errors
     * Throws when the file is unreadable or its headers are inconsistent.
     */
    triage(path: string): string;
    /**
     * Create or truncate a file, creating missing parent directories.
     *
     * # Errors
     * Throws on an invalid path or when a quota is exceeded.
     */
    write(path: string, data: Uint8Array): void;
}

/**
 * Local shell and VT screen over the shared WebOS filesystem.
 */
export class WebOsShell {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Whether `exit` was run.
     */
    exited(): boolean;
    /**
     * Feed typed bytes; returns the shell output bytes (already applied to the screen).
     */
    input(bytes: Uint8Array): Uint8Array;
    /**
     * Resize the screen.
     */
    resize(cols: number, rows: number): void;
    /**
     * `{columns, rows, lines, cursor:{row,col,visible}}` for the renderer.
     */
    snapshotJson(): string;
}

/**
 * Backend-less shell: the local line shell wired to a [`WebTerminal`].
 */
export class WebShell {
    free(): void;
    [Symbol.dispose](): void;
    exited(): boolean;
    /**
     * Feeds typed bytes; returns the rendered output bytes (also applied to the terminal).
     */
    input(bytes: Uint8Array): Uint8Array;
    constructor(cols: number, rows: number);
    resize(cols: number, rows: number): void;
    /**
     * Fast in-memory screen text scraping.
     */
    scrape_text(): string;
    snapshot_json(): string;
}

/**
 * VT parser and grid, fed with bytes from any transport.
 */
export class WebTerminal {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Applies output bytes from the shell.
     */
    ingest(bytes: Uint8Array): void;
    /**
     * Visible rows as plain text.
     */
    lines(): string[];
    constructor(cols: number, rows: number);
    resize(cols: number, rows: number): void;
    /**
     * Fast in-memory screen text scraping for AI perception and automated tests.
     */
    scrape_text(): string;
    /**
     * `{columns, rows, lines, cursor:{row,col,visible}}` for a renderer.
     */
    snapshot_json(): string;
    /**
     * VT replies (CPR/DSR) the host must send back to the shell.
     */
    take_replies(): string[];
}

/**
 * JSON text frame carrying input bytes.
 */
export function data_frame(bytes: Uint8Array): string;

/**
 * Local language detection of `aphrody-google` (scripts and stop words, no network):
 * `{"language","confidence","isReliable"}`.
 */
export function detectLanguage(text: string): string;

/**
 * Run the shared VFS conformance suite in a browser WASM instance.
 */
export function opfs_vfs_conformance(): void;

/**
 * JSON text frame asking a remote PTY to resize.
 */
export function resize_frame(cols: number, rows: number): string;

/**
 * Unified diff of two texts, for the Files app's compare view.
 */
export function unifiedDiff(old: string, _new: string): string;

/**
 * Crate version, shown in the WebOS About panel.
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_intounderlyingbytesource_free: (a: number, b: number) => void;
    readonly __wbg_intounderlyingsink_free: (a: number, b: number) => void;
    readonly __wbg_intounderlyingsource_free: (a: number, b: number) => void;
    readonly __wbg_weblocalengine_free: (a: number, b: number) => void;
    readonly __wbg_webosfs_free: (a: number, b: number) => void;
    readonly __wbg_webosshell_free: (a: number, b: number) => void;
    readonly __wbg_webshell_free: (a: number, b: number) => void;
    readonly __wbg_webterminal_free: (a: number, b: number) => void;
    readonly data_frame: (a: number, b: number) => [number, number];
    readonly detectLanguage: (a: number, b: number) => [number, number, number, number];
    readonly intounderlyingbytesource_autoAllocateChunkSize: (a: number) => number;
    readonly intounderlyingbytesource_cancel: (a: number) => void;
    readonly intounderlyingbytesource_pull: (a: number, b: any) => any;
    readonly intounderlyingbytesource_start: (a: number, b: any) => void;
    readonly intounderlyingbytesource_type: (a: number) => number;
    readonly intounderlyingsink_abort: (a: number, b: any) => any;
    readonly intounderlyingsink_close: (a: number) => any;
    readonly intounderlyingsink_write: (a: number, b: any) => any;
    readonly intounderlyingsource_cancel: (a: number) => void;
    readonly intounderlyingsource_pull: (a: number, b: any) => any;
    readonly opfs_vfs_conformance: () => void;
    readonly resize_frame: (a: number, b: number) => [number, number];
    readonly unifiedDiff: (a: number, b: number, c: number, d: number) => [number, number];
    readonly version: () => [number, number];
    readonly weblocalengine_exited: (a: number) => number;
    readonly weblocalengine_image_if_dirty: (a: number) => [number, number, number, number];
    readonly weblocalengine_input: (a: number, b: number, c: number) => [number, number];
    readonly weblocalengine_mark_persisted: (a: number) => void;
    readonly weblocalengine_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly weblocalengine_resize: (a: number, b: number, c: number) => [number, number];
    readonly weblocalengine_take_greeting: (a: number) => [number, number];
    readonly webosfs_applyPatch: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly webosfs_imageIfDirty: (a: number) => [number, number, number, number];
    readonly webosfs_list: (a: number, b: number, c: number) => [number, number, number, number];
    readonly webosfs_markPersisted: (a: number) => void;
    readonly webosfs_mkdir: (a: number, b: number, c: number) => [number, number];
    readonly webosfs_new: (a: number, b: number) => [number, number, number];
    readonly webosfs_ragSearch: (a: number, b: number, c: number, d: number) => [number, number];
    readonly webosfs_ragStats: (a: number) => [number, number];
    readonly webosfs_read: (a: number, b: number, c: number) => [number, number, number, number];
    readonly webosfs_remove: (a: number, b: number, c: number) => [number, number];
    readonly webosfs_rename: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly webosfs_rpc: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly webosfs_shell: (a: number, b: number, c: number) => [number, number, number];
    readonly webosfs_stat: (a: number, b: number, c: number) => [number, number, number, number];
    readonly webosfs_strings: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly webosfs_triage: (a: number, b: number, c: number) => [number, number, number, number];
    readonly webosfs_write: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly webosshell_exited: (a: number) => number;
    readonly webosshell_input: (a: number, b: number, c: number) => [number, number];
    readonly webosshell_resize: (a: number, b: number, c: number) => void;
    readonly webosshell_snapshotJson: (a: number) => [number, number];
    readonly webshell_exited: (a: number) => number;
    readonly webshell_input: (a: number, b: number, c: number) => [number, number];
    readonly webshell_new: (a: number, b: number) => number;
    readonly webshell_resize: (a: number, b: number, c: number) => void;
    readonly webshell_scrape_text: (a: number) => [number, number];
    readonly webshell_snapshot_json: (a: number) => [number, number];
    readonly webterminal_ingest: (a: number, b: number, c: number) => void;
    readonly webterminal_lines: (a: number) => [number, number];
    readonly webterminal_new: (a: number, b: number) => number;
    readonly webterminal_resize: (a: number, b: number, c: number) => void;
    readonly webterminal_scrape_text: (a: number) => [number, number];
    readonly webterminal_snapshot_json: (a: number) => [number, number];
    readonly webterminal_take_replies: (a: number) => [number, number];
    readonly wasm_bindgen_6358078ed3171846___convert__closures_____invoke___js_sys_ae419564b40dfb04___Function_fn_wasm_bindgen_6358078ed3171846___JsValue_____wasm_bindgen_6358078ed3171846___sys__Undefined___js_sys_ae419564b40dfb04___Function_fn_wasm_bindgen_6358078ed3171846___JsValue_____wasm_bindgen_6358078ed3171846___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_6358078ed3171846___convert__closures_____invoke___wasm_bindgen_6358078ed3171846___JsValue__core_879b8a6401fb5fbf___result__Result_____wasm_bindgen_6358078ed3171846___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
