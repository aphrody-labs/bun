/**
 * WinUI 3 (Windows App SDK) from JavaScript: XAML windows, controls and events on the JS thread.
 *
 * The installed Windows App Runtime framework is added to the process (Windows 11 dynamic dependencies,
 * or `Microsoft.WindowsAppRuntime.Bootstrap.dll`), its metadata is read at run time and XAML runs in a
 * single-threaded apartment on the JS thread. Window messages are pumped from a timer, so JavaScript
 * keeps running while windows are open and event listeners run on the JS thread.
 *
 * Requires the `@aphrody/bun-windows-winrt` package (the WinRT core, resolved like the `bun:windows`
 * families) and an installed Windows App Runtime (`winget install Microsoft.WindowsAppRuntime.1.8`).
 *
 * @example
 * ```ts
 * import winui from "bun:winui";
 *
 * const app = winui.start();
 * const win = app.createWindow({
 *   title: "Hello",
 *   width: 400,
 *   height: 240,
 *   content: `<StackPanel Padding="24" Spacing="12">
 *     <TextBlock x:Name="label" Text="Hello WinUI"/>
 *     <Button x:Name="ok" Content="OK"/>
 *   </StackPanel>`,
 * });
 * win.find("ok")!.on("Click", () => win.find("label")!.set("Text", "Clicked"));
 * await win.closed;
 * ```
 *
 * @category Windows
 */
declare module "bun:winui" {
  /** The Windows App Runtime framework package loaded into the process. */
  interface WinUIRuntime {
    /** Release channel, such as `"1.8"`. */
    version: string;
    /** Such as `"Microsoft.WindowsAppRuntime.1.8_8wekyb3d8bbwe"`. */
    packageFamilyName: string;
    /** Full name of the resolved package, or `null` when it was loaded by the Bootstrap DLL. */
    packageFullName: string | null;
    /** Install directory of the framework package (its `.winmd` metadata and DLLs). */
    path: string;
    /** How the framework was added to the process. */
    via: "dynamic-dependency" | "bootstrap";
  }

  interface WinUIRuntimeOptions {
    /**
     * Windows App SDK release to load, such as `"1.8"`. Defaults to the newest installed of
     * 1.8, 1.7, 1.6, 1.5 and 1.4 (or the comma-separated list in `BUN_WINUI_VERSION`).
     */
    version?: string;
    /** Path to `Microsoft.WindowsAppRuntime.Bootstrap.dll`, used when dynamic dependencies are unavailable. */
    bootstrapDll?: string;
  }

  interface WinUIStartOptions extends WinUIRuntimeOptions {
    /** Load `XamlControlsResources` (the Fluent styles of the WinUI controls). @default true */
    resources?: boolean;
    /** Application theme. Defaults to the system theme. */
    theme?: "light" | "dark";
    /** Call {@link Application.exit} when the last window closes. @default true */
    exitOnLastWindowClosed?: boolean;
    /** WinRT core to use instead of `@aphrody/bun-windows-winrt` resolved through `bun:windows`. */
    winrt?: unknown;
  }

  interface WindowOptions {
    title?: string;
    /** Width in device-independent pixels. */
    width?: number;
    /** Height in device-independent pixels. */
    height?: number;
    /** Root element: XAML markup or an {@link Element}. */
    content?: string | Element;
    /** Show and activate the window immediately. @default true */
    activate?: boolean;
  }

  /** The logical XAML tree of an element, as returned by {@link Element.tree}. */
  interface TreeNode {
    type: string;
    name?: string;
    children?: TreeNode[];
  }

  /**
   * A XAML object (control, panel, brush, event arguments...). Members are resolved from the WinUI
   * metadata of its runtime class and base classes, so every property, method and event is reachable.
   * Strings, numbers and booleans are boxed and unboxed for `Object` members.
   */
  class Element {
    private constructor();
    /** Full runtime class name, such as `"Microsoft.UI.Xaml.Controls.Button"`. */
    readonly className: string;
    /** Short type name, such as `"Button"`. */
    readonly type: string;
    /** `x:Name`, or `""`. */
    readonly name: string;
    /** Logical children: `Panel.Children`, `Border.Child` or `ContentControl.Content`. */
    readonly children: Element[];
    /** The underlying WinRT object of the core. */
    readonly winrt: unknown;
    /** Whether the element has a property or method named `member`. */
    has(member: string): boolean;
    /** Reads a property, such as `get("Text")`. */
    get(property: string): any;
    /** Writes a property, such as `set("Content", "OK")`. */
    set(property: string, value: unknown): this;
    /** Calls a method, such as `call("Focus", 3)`. */
    call(method: string, ...args: unknown[]): any;
    /**
     * Adds an event listener, such as `on("Click", ...)`. Returns a function that removes it.
     * The listener runs on the JS thread while messages are pumped.
     */
    on(event: string, listener: (sender: Element | null, args: Element | null) => unknown): () => void;
    /** `FrameworkElement.FindName`. */
    find(name: string): Element | null;
    /** Appends a child to `Panel.Children` (XAML markup or an element) and returns it. */
    append(child: Element | string): Element;
    /** The logical tree below this element. */
    tree(): TreeNode;
    /** Invokes the element through its automation peer, as a click does. */
    invoke(): void;
  }

  class Window {
    private constructor();
    readonly winrt: unknown;
    /** Native window handle. */
    readonly hwnd: number;
    /** Resolves when the window has closed. */
    readonly closed: Promise<void>;
    readonly isClosed: boolean;
    title: string;
    content: Element | null;
    /** `FindName` on the content. */
    find(name: string): Element | null;
    /** Resizes the window, in device-independent pixels. */
    resize(width: number, height: number): this;
    activate(): this;
    close(): Promise<void>;
  }

  class Application {
    private constructor();
    readonly runtime: WinUIRuntime;
    /** The WinRT core in use. */
    readonly winrt: any;
    /** WinRT namespaces loaded from the framework metadata, keyed by name (`"Microsoft.UI.Xaml.Controls"`). */
    readonly namespaces: Record<string, any>;
    readonly windows: Set<Window>;
    /** The XAML `Application`. */
    readonly application: Element;
    /** Resolves when {@link exit} has run. */
    readonly exited: Promise<void>;
    readonly closed: boolean;
    /** `XamlReader.Load`. Fragments without `xmlns` get the WinUI namespaces. */
    load(xaml: string): Element;
    /** Creates an element from its XAML type name and sets properties: `create("Button", { Content: "OK" })`. */
    create(type: string, properties?: Record<string, unknown>): Element;
    createWindow(options?: WindowOptions): Window;
    /** Dispatches the pending window messages now (the timer does it every few milliseconds). */
    pump(): void;
    /** Closes every window, removes the listeners and shuts down XAML for this thread. */
    exit(): Promise<void>;
  }

  /** Whether WinUI can run here: Windows with a Windows App Runtime that loads. */
  function isSupported(options?: WinUIRuntimeOptions): boolean;
  /**
   * Loads the Windows App Runtime into the process if needed and describes it. Throws an error with
   * code `ERR_WINUI_RUNTIME_NOT_FOUND` when none is installed.
   */
  function runtime(options?: WinUIRuntimeOptions): WinUIRuntime;
  /** Starts XAML on the JS thread. One application per process; later calls return it. */
  function start(options?: WinUIStartOptions): Application;
  /** The running application, or `null`. */
  const app: Application | null;
}
