declare module "bun:obscura" {
  /** Connect to an existing native Obscura engine's loopback CDP endpoint. */
  export const connect: typeof import("bun:chromium").connect;
  /** Find aphrody-web, honoring BUN_OBSCURA_PATH. */
  export function findExecutable(): string | null;

  export interface LaunchOptions {
    executable?: string;
    /** Startup deadline in milliseconds. Defaults to 10000. */
    timeout?: number;
    signal?: AbortSignal;
    /** Native worker count, from 1 to 64; Windows currently requires 1. Defaults to 1. */
    workers?: number;
  }

  export interface ObscuraBrowser {
    readonly connection: import("bun:chromium").ChromiumConnection;
    readonly process: Bun.Subprocess;
    readonly endpoint: string;
    close(): Promise<void>;
  }

  /**
   * Launch the native Obscura V8 headless engine and await a CDP handshake.
   * The existing owner CLI requires releasing a reserved port before binding,
   * so a competing process can cause startup to fail during that interval.
   */
  export function launch(options?: LaunchOptions): Promise<ObscuraBrowser>;

  const obscura: {
    connect: typeof connect;
    findExecutable: typeof findExecutable;
    launch: typeof launch;
  };
  export default obscura;
}
