/* @ts-self-types="./aphrody_webos_wasm.d.ts" */

export class IntoUnderlyingByteSource {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingByteSourceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingbytesource_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get autoAllocateChunkSize() {
        const ret = wasm.intounderlyingbytesource_autoAllocateChunkSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    cancel() {
        const ptr = this.__destroy_into_raw();
        wasm.intounderlyingbytesource_cancel(ptr);
    }
    /**
     * @param {ReadableByteStreamController} controller
     * @returns {Promise<any>}
     */
    pull(controller) {
        const ret = wasm.intounderlyingbytesource_pull(this.__wbg_ptr, controller);
        return ret;
    }
    /**
     * @param {ReadableByteStreamController} controller
     */
    start(controller) {
        wasm.intounderlyingbytesource_start(this.__wbg_ptr, controller);
    }
    /**
     * @returns {ReadableStreamType}
     */
    get type() {
        const ret = wasm.intounderlyingbytesource_type(this.__wbg_ptr);
        return __wbindgen_enum_ReadableStreamType[ret];
    }
}
if (Symbol.dispose) IntoUnderlyingByteSource.prototype[Symbol.dispose] = IntoUnderlyingByteSource.prototype.free;

export class IntoUnderlyingSink {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingSinkFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsink_free(ptr, 0);
    }
    /**
     * @param {any} reason
     * @returns {Promise<any>}
     */
    abort(reason) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.intounderlyingsink_abort(ptr, reason);
        return ret;
    }
    /**
     * @returns {Promise<any>}
     */
    close() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.intounderlyingsink_close(ptr);
        return ret;
    }
    /**
     * @param {any} chunk
     * @returns {Promise<any>}
     */
    write(chunk) {
        const ret = wasm.intounderlyingsink_write(this.__wbg_ptr, chunk);
        return ret;
    }
}
if (Symbol.dispose) IntoUnderlyingSink.prototype[Symbol.dispose] = IntoUnderlyingSink.prototype.free;

export class IntoUnderlyingSource {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingSourceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsource_free(ptr, 0);
    }
    cancel() {
        const ptr = this.__destroy_into_raw();
        wasm.intounderlyingsource_cancel(ptr);
    }
    /**
     * @param {ReadableStreamDefaultController} controller
     * @returns {Promise<any>}
     */
    pull(controller) {
        const ret = wasm.intounderlyingsource_pull(this.__wbg_ptr, controller);
        return ret;
    }
}
if (Symbol.dispose) IntoUnderlyingSource.prototype[Symbol.dispose] = IntoUnderlyingSource.prototype.free;

/**
 * Raw local shell engine for a dedicated OPFS worker. The main thread owns VT state.
 */
export class WebLocalEngine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebLocalEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_weblocalengine_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    exited() {
        const ret = wasm.weblocalengine_exited(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Return an image only after a mutating shell command.
     * Empty bytes mean no persistence work is needed.
     *
     * # Errors
     * Returns an error if the image exceeds its size limit.
     * @returns {Uint8Array}
     */
    image_if_dirty() {
        const ret = wasm.weblocalengine_image_if_dirty(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Feed input bytes without parsing VT state in this worker.
     * @param {Uint8Array} bytes
     * @returns {Uint8Array}
     */
    input(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.weblocalengine_input(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Acknowledge a successful OPFS flush.
     */
    mark_persisted() {
        wasm.weblocalengine_mark_persisted(this.__wbg_ptr);
    }
    /**
     * Restore a persisted filesystem image and start a local shell.
     *
     * # Errors
     * Returns an error if the image is invalid or the terminal dimensions are zero.
     * @param {Uint8Array} image
     * @param {number} cols
     * @param {number} rows
     */
    constructor(image, cols, rows) {
        const ptr0 = passArray8ToWasm0(image, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.weblocalengine_new(ptr0, len0, cols, rows);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WebLocalEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Resize the session.
     *
     * # Errors
     * Returns an error for zero dimensions or an exited shell.
     * @param {number} cols
     * @param {number} rows
     */
    resize(cols, rows) {
        const ret = wasm.weblocalengine_resize(this.__wbg_ptr, cols, rows);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Initial greeting and prompt; called once by the worker.
     * @returns {Uint8Array}
     */
    take_greeting() {
        const ret = wasm.weblocalengine_take_greeting(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) WebLocalEngine.prototype[Symbol.dispose] = WebLocalEngine.prototype.free;

/**
 * OPFS-persisted filesystem shared by every WebOS app.
 */
export class WebOsFs {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebOsFsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webosfs_free(ptr, 0);
    }
    /**
     * Apply a Codex-style `*** Begin Patch` document; relative paths resolve
     * against `cwd`. Returns `{"added","modified","deleted"}`.
     *
     * # Errors
     * Throws on a malformed patch or a hunk that does not match.
     * @param {string} patch
     * @param {string} cwd
     * @returns {string}
     */
    applyPatch(patch, cwd) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(patch, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(cwd, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.webosfs_applyPatch(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * New APFS1 image when something changed, empty otherwise.
     *
     * # Errors
     * Throws when the image would exceed the OPFS slot size.
     * @returns {Uint8Array}
     */
    imageIfDirty() {
        const ret = wasm.webosfs_imageIfDirty(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * `[{"name","kind":"file"|"dir","size"}]` sorted by name.
     *
     * # Errors
     * Throws when the path is missing or not a directory.
     * @param {string} path
     * @returns {string}
     */
    list(path) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.webosfs_list(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Acknowledge that the last image reached OPFS.
     */
    markPersisted() {
        wasm.webosfs_markPersisted(this.__wbg_ptr);
    }
    /**
     * `mkdir -p`.
     *
     * # Errors
     * Throws when a component is a file.
     * @param {string} path
     */
    mkdir(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webosfs_mkdir(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Restore from an APFS1 image; an empty image starts a new filesystem.
     *
     * # Errors
     * Throws on a truncated, corrupt or oversized image.
     * @param {Uint8Array} image
     */
    constructor(image) {
        const ptr0 = passArray8ToWasm0(image, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webosfs_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WebOsFsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * BM25 search over the text files of the home directory, chunked by `aphrody-rag-core`:
     * `{"results":[{path,start_line,end_line,score,content}]}`.
     * @param {string} query
     * @param {number} limit
     * @returns {string}
     */
    ragSearch(query, limit) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(query, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.webosfs_ragSearch(this.__wbg_ptr, ptr0, len0, limit);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * `{"documents","chunks"}` of the searchable home directory.
     * @returns {string}
     */
    ragStats() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webosfs_ragStats(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Whole file contents.
     *
     * # Errors
     * Throws when the file is missing or a directory.
     * @param {string} path
     * @returns {Uint8Array}
     */
    read(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webosfs_read(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * `rm -r`.
     *
     * # Errors
     * Throws when the path does not resolve.
     * @param {string} path
     */
    remove(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webosfs_remove(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Move a node.
     *
     * # Errors
     * Same rules as [`Vfs::rename`].
     * @param {string} from
     * @param {string} to
     */
    rename(from, to) {
        const ptr0 = passStringToWasm0(from, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(to, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.webosfs_rename(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Answer one explorer wire request (`{"Query"|"Action": ...}`) from this filesystem;
     * `now` is an RFC 3339 timestamp, as the VFS stores none. Always returns the wire
     * envelope: `{"json": ...}`, `{"error": "..."}` or `"Pong"`.
     * @param {string} request
     * @param {string} now
     * @returns {string}
     */
    rpc(request, now) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(request, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(now, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.webosfs_rpc(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Start a terminal whose shell works on this very filesystem, so files written by
     * the explorer and by shell commands are the same files and share one OPFS image.
     *
     * # Errors
     * Throws when the dimensions are zero.
     * @param {number} cols
     * @param {number} rows
     * @returns {WebOsShell}
     */
    shell(cols, rows) {
        const ret = wasm.webosfs_shell(this.__wbg_ptr, cols, rows);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WebOsShell.__wrap(ret[0]);
    }
    /**
     * `{"kind","size"}`.
     *
     * # Errors
     * Throws when the path does not resolve.
     * @param {string} path
     * @returns {string}
     */
    stat(path) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.webosfs_stat(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Printable strings of a file as a JSON array.
     *
     * # Errors
     * Throws when the file is unreadable.
     * @param {string} path
     * @param {number} min_len
     * @param {number} limit
     * @returns {string}
     */
    strings(path, min_len, limit) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.webosfs_strings(this.__wbg_ptr, ptr0, len0, min_len, limit);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * `aphrody re triage` report (format, sections, hashes, strings) as JSON.
     *
     * # Errors
     * Throws when the file is unreadable or its headers are inconsistent.
     * @param {string} path
     * @returns {string}
     */
    triage(path) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.webosfs_triage(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Create or truncate a file, creating missing parent directories.
     *
     * # Errors
     * Throws on an invalid path or when a quota is exceeded.
     * @param {string} path
     * @param {Uint8Array} data
     */
    write(path, data) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.webosfs_write(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WebOsFs.prototype[Symbol.dispose] = WebOsFs.prototype.free;

/**
 * Local shell and VT screen over the shared WebOS filesystem.
 */
export class WebOsShell {
    static __wrap(ptr) {
        const obj = Object.create(WebOsShell.prototype);
        obj.__wbg_ptr = ptr;
        WebOsShellFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebOsShellFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webosshell_free(ptr, 0);
    }
    /**
     * Whether `exit` was run.
     * @returns {boolean}
     */
    exited() {
        const ret = wasm.webosshell_exited(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Feed typed bytes; returns the shell output bytes (already applied to the screen).
     * @param {Uint8Array} bytes
     * @returns {Uint8Array}
     */
    input(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webosshell_input(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Resize the screen.
     * @param {number} cols
     * @param {number} rows
     */
    resize(cols, rows) {
        wasm.webosshell_resize(this.__wbg_ptr, cols, rows);
    }
    /**
     * `{columns, rows, lines, cursor:{row,col,visible}}` for the renderer.
     * @returns {string}
     */
    snapshotJson() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webosshell_snapshotJson(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WebOsShell.prototype[Symbol.dispose] = WebOsShell.prototype.free;

/**
 * Backend-less shell: the local line shell wired to a [`WebTerminal`].
 */
export class WebShell {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebShellFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webshell_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    exited() {
        const ret = wasm.webshell_exited(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Feeds typed bytes; returns the rendered output bytes (also applied to the terminal).
     * @param {Uint8Array} bytes
     * @returns {Uint8Array}
     */
    input(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webshell_input(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * @param {number} cols
     * @param {number} rows
     */
    constructor(cols, rows) {
        const ret = wasm.webshell_new(cols, rows);
        this.__wbg_ptr = ret;
        WebShellFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} cols
     * @param {number} rows
     */
    resize(cols, rows) {
        wasm.webshell_resize(this.__wbg_ptr, cols, rows);
    }
    /**
     * Fast in-memory screen text scraping.
     * @returns {string}
     */
    scrape_text() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webshell_scrape_text(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    snapshot_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webshell_snapshot_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WebShell.prototype[Symbol.dispose] = WebShell.prototype.free;

/**
 * VT parser and grid, fed with bytes from any transport.
 */
export class WebTerminal {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebTerminalFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webterminal_free(ptr, 0);
    }
    /**
     * Applies output bytes from the shell.
     * @param {Uint8Array} bytes
     */
    ingest(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.webterminal_ingest(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Visible rows as plain text.
     * @returns {string[]}
     */
    lines() {
        const ret = wasm.webterminal_lines(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {number} cols
     * @param {number} rows
     */
    constructor(cols, rows) {
        const ret = wasm.webterminal_new(cols, rows);
        this.__wbg_ptr = ret;
        WebTerminalFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} cols
     * @param {number} rows
     */
    resize(cols, rows) {
        wasm.webterminal_resize(this.__wbg_ptr, cols, rows);
    }
    /**
     * Fast in-memory screen text scraping for AI perception and automated tests.
     * @returns {string}
     */
    scrape_text() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webterminal_scrape_text(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * `{columns, rows, lines, cursor:{row,col,visible}}` for a renderer.
     * @returns {string}
     */
    snapshot_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webterminal_snapshot_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * VT replies (CPR/DSR) the host must send back to the shell.
     * @returns {string[]}
     */
    take_replies() {
        const ret = wasm.webterminal_take_replies(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) WebTerminal.prototype[Symbol.dispose] = WebTerminal.prototype.free;

/**
 * JSON text frame carrying input bytes.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function data_frame(bytes) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.data_frame(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Local language detection of `aphrody-google` (scripts and stop words, no network):
 * `{"language","confidence","isReliable"}`.
 * @param {string} text
 * @returns {string}
 */
export function detectLanguage(text) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.detectLanguage(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Run the shared VFS conformance suite in a browser WASM instance.
 */
export function opfs_vfs_conformance() {
    wasm.opfs_vfs_conformance();
}

/**
 * JSON text frame asking a remote PTY to resize.
 * @param {number} cols
 * @param {number} rows
 * @returns {string}
 */
export function resize_frame(cols, rows) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.resize_frame(cols, rows);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Unified diff of two texts, for the Files app's compare view.
 * @param {string} old
 * @param {string} _new
 * @returns {string}
 */
export function unifiedDiff(old, _new) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(old, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(_new, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.unifiedDiff(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Crate version, shown in the WebOS About panel.
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_dcc1a90847f04c41: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_buffer_56ec2905a66f58b9: function(arg0) {
            const ret = arg0.buffer;
            return ret;
        },
        __wbg_byobRequest_54f7ce41d584549a: function(arg0) {
            const ret = arg0.byobRequest;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_byteLength_9f985b8373f1f3fe: function(arg0) {
            const ret = arg0.byteLength;
            return ret;
        },
        __wbg_byteOffset_0bd5a6a03553639c: function(arg0) {
            const ret = arg0.byteOffset;
            return ret;
        },
        __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_close_185286988f30f252: function() { return handleError(function (arg0) {
            arg0.close();
        }, arguments); },
        __wbg_close_748f26698dabe269: function() { return handleError(function (arg0) {
            arg0.close();
        }, arguments); },
        __wbg_enqueue_4a01c128f9a0de16: function() { return handleError(function (arg0, arg1) {
            arg0.enqueue(arg1);
        }, arguments); },
        __wbg_length_7f3c00c40364105e: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_new_343a093a3c2ffb4e: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_b01cb72a8af741a3: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_6358078ed3171846___convert__closures_____invoke___js_sys_ae419564b40dfb04___Function_fn_wasm_bindgen_6358078ed3171846___JsValue_____wasm_bindgen_6358078ed3171846___sys__Undefined___js_sys_ae419564b40dfb04___Function_fn_wasm_bindgen_6358078ed3171846___JsValue_____wasm_bindgen_6358078ed3171846___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_byte_offset_and_length_2f5d7fc2a828b74d: function(arg0, arg1, arg2) {
            const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_now_e7c6795a7f81e10f: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_performance_3fcf6e32a7e1ed0a: function(arg0) {
            const ret = arg0.performance;
            return ret;
        },
        __wbg_queueMicrotask_9833f9a49df95a49: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_a72f977e97f23c5f: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_resolve_0076e10020304ede: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_respond_c102fabcc79e5ef0: function() { return handleError(function (arg0, arg1) {
            arg0.respond(arg1 >>> 0);
        }, arguments); },
        __wbg_set_575d3ddb70fe831d: function(arg0, arg1, arg2) {
            arg0.set(getArrayU8FromWasm0(arg1, arg2));
        },
        __wbg_static_accessor_GLOBAL_266715b9d96ba635: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_0b583911f537483a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_d7f903d1508cbdc4: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_then_e71170d78fcf8954: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_view_9c570f33e8d6ab96: function(arg0) {
            const ret = arg0.view;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 1359, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_6358078ed3171846___convert__closures_____invoke___wasm_bindgen_6358078ed3171846___JsValue__core_879b8a6401fb5fbf___result__Result_____wasm_bindgen_6358078ed3171846___JsError___true_);
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./aphrody_webos_wasm_bg.js": import0,
    };
}

function wasm_bindgen_6358078ed3171846___convert__closures_____invoke___wasm_bindgen_6358078ed3171846___JsValue__core_879b8a6401fb5fbf___result__Result_____wasm_bindgen_6358078ed3171846___JsError___true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_6358078ed3171846___convert__closures_____invoke___wasm_bindgen_6358078ed3171846___JsValue__core_879b8a6401fb5fbf___result__Result_____wasm_bindgen_6358078ed3171846___JsError___true_(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_6358078ed3171846___convert__closures_____invoke___js_sys_ae419564b40dfb04___Function_fn_wasm_bindgen_6358078ed3171846___JsValue_____wasm_bindgen_6358078ed3171846___sys__Undefined___js_sys_ae419564b40dfb04___Function_fn_wasm_bindgen_6358078ed3171846___JsValue_____wasm_bindgen_6358078ed3171846___sys__Undefined_______true_(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen_6358078ed3171846___convert__closures_____invoke___js_sys_ae419564b40dfb04___Function_fn_wasm_bindgen_6358078ed3171846___JsValue_____wasm_bindgen_6358078ed3171846___sys__Undefined___js_sys_ae419564b40dfb04___Function_fn_wasm_bindgen_6358078ed3171846___JsValue_____wasm_bindgen_6358078ed3171846___sys__Undefined_______true_(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_ReadableStreamType = ["bytes"];
const IntoUnderlyingByteSourceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingbytesource_free(ptr, 1));
const IntoUnderlyingSinkFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingsink_free(ptr, 1));
const IntoUnderlyingSourceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingsource_free(ptr, 1));
const WebLocalEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_weblocalengine_free(ptr, 1));
const WebOsFsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webosfs_free(ptr, 1));
const WebOsShellFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webosshell_free(ptr, 1));
const WebShellFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webshell_free(ptr, 1));
const WebTerminalFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webterminal_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('aphrody_webos_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
