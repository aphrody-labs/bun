/**
 * Native Tauri 3 IPC & Webview Types for Bun Runtime
 * Enables bi-directional integration: Bun is aware of Tauri IPC primitives,
 * and Tauri applications can run with zero-overhead Bun Web APIs.
 */

declare module "bun" {
  /**
   * Tauri 3 Native IPC Bridge & Webview Integration
   */
  namespace tauri {
    /**
     * IPC Command Handler function signature
     */
    type CommandHandler<TArgs = unknown, TResult = unknown> = (args: TArgs) => Promise<TResult> | TResult;

    /**
     * IPC Request message payload exchanged between frontend & backend
     */
    interface IpcMessage<TPayload = unknown> {
      readonly cmd: string;
      readonly callback: number;
      readonly error: number;
      readonly payload: TPayload;
    }

    /**
     * Window & webview bounds in physical coordinates
     */
    interface PhysicalBounds {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }

    /**
     * Hardware & Wayland display configuration detected by Tauri 3 backend
     */
    interface DisplayBackendConfig {
      readonly isWayland: boolean;
      readonly waylandDisplay?: string | undefined;
      readonly dmaBufRendererDisabled: boolean;
      readonly explicitSyncDisabled: boolean;
    }

    /**
     * Probe current Tauri / Wayland runtime flags
     */
    function getDisplayConfig(): DisplayBackendConfig;
  }
}
