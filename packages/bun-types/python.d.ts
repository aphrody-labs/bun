declare module "bun:python" {
  export const PyStatus: {
    readonly Ok: 0;
    readonly Arg: -1;
    readonly Load: -2;
    readonly State: -3;
    readonly Python: -4;
    readonly Panic: -5;
    readonly Unsupported: -6;
  };
  export class PythonError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
  }
  export function pythonHostLibraryPath(env?: NodeJS.ProcessEnv): string;
  export function buvLibpython(env?: NodeJS.ProcessEnv): string | null;
  export { buvLibpython as vuLibpython };
  export function libpythonIn(directory: string): string | null;
  export class Python implements Disposable {
    readonly started: boolean;
    private constructor();
    static open(options?: { libraryPath?: string; libpython?: string | null }): Python;
    static async(options?: { libraryPath?: string; libpython?: string | null }): Promise<PythonAsync>;
    version(): string;
    run(code: string): void;
    exec(source: string | TemplateStringsArray): void;
    eval(expression: string): string;
    evalJSON<T = unknown>(expression: string): T;
    call(module: string, fn: string, arg?: string): string;
    close(): void;
    [Symbol.dispose](): void;
  }
  export class PythonAsync implements AsyncDisposable {
    private constructor();
    static open(options?: { libraryPath?: string; libpython?: string | null }): Promise<PythonAsync>;
    version(): Promise<string>;
    run(code: string): Promise<void>;
    exec(source: string | TemplateStringsArray): Promise<void>;
    eval(expression: string): Promise<string>;
    evalJSON<T = unknown>(expression: string): Promise<T>;
    call(module: string, fn: string, arg?: string): Promise<string>;
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
  }
}
declare module "buv:python" {
  export * from "bun:python";
}
declare module "pyjs:python" {
  export * from "bun:python";
}
