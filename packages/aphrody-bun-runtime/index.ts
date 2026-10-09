/**
 * Singleton holding a runtime configuration object and a map of FFI library descriptors.
 * TypeScript only: it loads no library and calls no native code beyond `Bun.gc`.
 */

export interface AphrodyRuntimeConfig {
  readonly hermeticMode: boolean;
  readonly telemetryEnabled: boolean;
  readonly maxMemoryLimitMb: number;
  readonly agentWorkspace: string;
}

export interface FFIBridgeDescriptor {
  readonly libraryPath: string;
  readonly symbols: readonly string[];
  readonly loaded: boolean;
}

export class AphrodyBunRuntimeKernel {
  private static instance: AphrodyBunRuntimeKernel | null = null;
  private readonly config: AphrodyRuntimeConfig;
  private readonly activeBridges: Map<string, FFIBridgeDescriptor> = new Map();

  private constructor(customConfig?: Partial<AphrodyRuntimeConfig>) {
    this.config = {
      hermeticMode: true,
      telemetryEnabled: false,
      maxMemoryLimitMb: 4096,
      agentWorkspace: "/home/aphro/.gemini",
      ...customConfig,
    };
  }

  public static getInstance(config?: Partial<AphrodyRuntimeConfig>): AphrodyBunRuntimeKernel {
    if (!AphrodyBunRuntimeKernel.instance) {
      AphrodyBunRuntimeKernel.instance = new AphrodyBunRuntimeKernel(config);
    }
    return AphrodyBunRuntimeKernel.instance;
  }

  public getConfig(): AphrodyRuntimeConfig {
    return { ...this.config };
  }

  /**
   * Registers a native FFI module descriptor (e.g. for Aphrody Rust engine or Obscura CDP).
   */
  public registerFFIBridge(name: string, descriptor: FFIBridgeDescriptor): void {
    this.activeBridges.set(name, descriptor);
  }

  /**
   * Retrieves an active FFI bridge descriptor.
   */
  public getFFIBridge(name: string): FFIBridgeDescriptor | undefined {
    return this.activeBridges.get(name);
  }

  /**
   * Optimize GC profile for high-throughput cognitive loops.
   */
  public triggerOptimizedGC(): void {
    if (typeof Bun !== "undefined" && typeof Bun.gc === "function") {
      Bun.gc(true);
    }
  }

  /**
   * Returns system diagnostics for the Bun fork runtime.
   */
  public getDiagnostics(): Record<string, unknown> {
    return {
      runtime: "Aphrody Bun Fork",
      version: typeof Bun !== "undefined" ? Bun.version : "dev",
      revision: typeof Bun !== "undefined" ? Bun.revision : "fork-aphrody",
      registeredBridges: Array.from(this.activeBridges.keys()),
      config: this.config,
    };
  }
}

export const aphrodyRuntime = AphrodyBunRuntimeKernel.getInstance();
