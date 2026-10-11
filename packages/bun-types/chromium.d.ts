declare module "bun:chromium" {
  export interface ConnectOptions {
    /** Connection and command timeout in milliseconds. */
    timeout?: number;
    signal?: AbortSignal;
  }

  export interface LaunchOptions extends ConnectOptions {
    /** Chrome or Chromium executable; discovered automatically when omitted. */
    executable?: string;
    /** Dedicated Chrome user data directory. */
    userDataDir?: string;
    /** Launch without visible browser UI. Defaults to false. */
    headless?: boolean;
    /** Enable browser WebGPU support. Defaults to true. */
    webgpu?: boolean;
    /** Initial HTTP(S) URL or about:blank. */
    url?: string;
    /** Paths to unpacked extensions supported by the selected browser. */
    extensions?: string[];
  }

  /** A Chrome DevTools Protocol connection to a browser or target endpoint. */
  export class ChromiumConnection {
    private constructor();
    readonly closed: boolean;
    /** Send a CDP command, optionally addressing a flattened target session. */
    send<T = unknown>(
      method: string,
      params?: Record<string, unknown>,
      sessionId?: string,
    ): Promise<T>;
    /** Probe navigator.gpu in an attached secure target session. */
    gpu(sessionId: string): Promise<{
      available: boolean;
      adapter: boolean;
      fallback: boolean | null;
      info: Record<string, unknown> | null;
    }>;
    /** Subscribe to a CDP event. Returns a function that removes the subscription. */
    on(
      method: string,
      callback: (params: Record<string, unknown>, sessionId?: string) => void,
    ): () => void;
    /** Close this connection. */
    close(): void;
  }

  export interface ChromiumBrowser {
    readonly connection: ChromiumConnection;
    readonly userDataDir: string;
    readonly process: Bun.Subprocess;
    /** Close the connection and terminate the browser launched by Bun. */
    close(): Promise<void>;
  }

  /** Connect to a Chrome remote debugging endpoint. */
  export function connect(endpoint: string, options?: ConnectOptions): Promise<ChromiumConnection>;
  /** Launch Chrome with a dedicated profile and connect to its debugging endpoint. */
  export function launch(options?: LaunchOptions): Promise<ChromiumBrowser>;
  /** Discover an installed Chrome-compatible executable, or return null. */
  export function findExecutable(): string | null;

  /** Pure manifest helpers. These functions do not install browser extensions or PWAs. */
  export namespace manifests {
    function validateExtension(manifest: Record<string, unknown>): Record<string, unknown>;
    function createExtension(options: Record<string, unknown>): Record<string, unknown>;
    function validateTheme(manifest: Record<string, unknown>): Record<string, unknown>;
    function createTheme(options: Record<string, unknown>): Record<string, unknown>;
    function validatePWA(manifest: Record<string, unknown>): Record<string, unknown>;
    function createPWA(options: Record<string, unknown>): Record<string, unknown>;
  }

  export interface Bookmark {
    id: string;
    name: string;
    url: string;
    /** Folder names from the bookmark root to its containing folder. */
    folder: string[];
  }

  export namespace profiles {
    /** Read and flatten an explicitly selected Chrome Bookmarks JSON file. */
    function readBookmarks(file: string): Promise<Bookmark[]>;
  }

  export namespace protocol {
    /** Validate an HTTP(S) navigation URL or about:blank. */
    function validateURL(url: string): string;
  }

  const chromium: {
    ChromiumConnection: typeof ChromiumConnection;
    connect: typeof connect;
    launch: typeof launch;
    findExecutable: typeof findExecutable;
    manifests: typeof manifests;
    profiles: typeof profiles;
    protocol: typeof protocol;
  };
  export default chromium;
}
