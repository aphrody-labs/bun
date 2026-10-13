/** NGINX's native executable is optional. Bun owns its process; NGINX owns HTTP/configuration. */
declare module "bun:nginx" {
  export interface NginxOperationOptions {
    /** Deadline in milliseconds, integer 1–30000. Defaults to the controller's timeout. */
    timeoutMs?: number;
    signal?: AbortSignal;
  }
  export interface NginxProviderOptions extends NginxOperationOptions {
    /** Installed executable or name on PATH. Defaults to `nginx`. No implicit download. */
    binary?: string;
    /** Explicit launcher arguments before NGINX flags, at most 16. */
    binaryArguments?: readonly string[];
    /** Maximum bytes for each diagnostic stream, integer 1–1048576; default 262144. */
    maxOutputBytes?: number;
  }
  export interface NginxOptions extends NginxProviderOptions {
    /** Existing private directory; one controller can own a prefix at a time. */
    prefix: string;
    /** Existing configuration that resolves inside prefix. Omit daemon/pid directives. */
    configFile: string;
  }
  export interface NginxCapabilities {
    /** Build flags reported by -V; protocol behavior is a separate qualification. */
    http: boolean;
    httpTLS: boolean;
    http2: boolean;
    http3: boolean;
    stream: boolean;
    mail: boolean;
    udp: boolean;
    threads: boolean;
    dynamicModuleCompatibility: boolean;
    windowsBeta: boolean;
    /** Windows upstream workers limitation; null on Unix. */
    effectiveWorkersMaximum: 1 | null;
  }
  export interface NginxAvailable {
    available: true;
    binary: string;
    version: string;
    configureArguments: string;
    /** Host OS and architecture, not an inferred executable architecture. */
    platform: string;
    arch: string;
    capabilities: NginxCapabilities;
    qualification: "native executable -V only; protocol behavior requires separate gates";
  }
  export interface NginxUnavailable {
    available: false;
    code: "ERR_NGINX_PROVIDER_UNAVAILABLE";
    message: string;
    binary: string;
    platform: string;
    arch: string;
  }
  export type NginxInfo = NginxAvailable | NginxUnavailable;
  export interface NginxStatus {
    running: boolean;
    pid: number | null;
    prefix: string;
    configFile: string;
    pidFile: string;
    closed: boolean;
    lastExitCode: number | null;
  }
  export interface NginxValidation {
    valid: true;
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }
  export interface NginxClosed {
    closed: true;
    /** Deadline caused termination of the owned child tree instead of a graceful quit. */
    forced: boolean;
  }
  export class Nginx implements AsyncDisposable {
    private constructor();
    static create(options: NginxOptions): Promise<Nginx>;
    static probe(options?: NginxProviderOptions): Promise<NginxInfo>;
    probe(options?: NginxOperationOptions): Promise<NginxInfo>;
    validate(options?: NginxOperationOptions): Promise<NginxValidation>;
    start(options?: NginxOperationOptions): Promise<NginxStatus>;
    reload(options?: NginxOperationOptions): Promise<NginxStatus>;
    quit(options?: NginxOperationOptions): Promise<NginxStatus>;
    status(options?: NginxOperationOptions): Promise<NginxStatus>;
    close(options?: NginxOperationOptions): Promise<NginxClosed>;
    [Symbol.asyncDispose](): Promise<void>;
  }
  export const create: typeof Nginx.create;
  export const probe: typeof Nginx.probe;
  export default Nginx;
}

/** Literal spelling supported by the same canonical module. */
declare module "bun:Nginixx" {
  export * from "bun:nginx";
  export { default } from "bun:nginx";
}
