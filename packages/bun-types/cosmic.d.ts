/**
 * The COSMIC desktop (Pop!_OS) from Bun: text shaping and rendering with cosmic-text, the
 * freedesktop application index, cosmic-config settings in RON, libcosmic windows and desktop
 * notifications.
 *
 * Text and applications are native and synchronous. Windows and notifications run in the
 * `bun-cosmic` helper process (found through `BUN_COSMIC_HELPER`, `PATH` or next to `bun`), so
 * the JavaScript thread never blocks on the GUI. On other platforms {@link isSupported} is
 * `false` and the native calls throw an error with code `ERR_BUN_COSMIC_UNSUPPORTED`;
 * {@link config} and {@link ron} work everywhere.
 *
 * @example
 * ```ts
 * import { text, config } from "bun:cosmic";
 *
 * const { width, height, data } = text.render("Hello", { fontSize: 24, color: "#ffffff" });
 * const comp = config.open("com.system76.CosmicComp", 1);
 * console.log(comp.get("autotile"));
 * ```
 *
 * @category Linux
 */
declare module "bun:cosmic" {
  /** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, or a `0xRRGGBBAA` number. */
  type Color = string | number;

  interface TextOptions {
    /** Font size in pixels. @default 14 */
    fontSize?: number;
    /** Line height in pixels. @default fontSize * 1.2 */
    lineHeight?: number;
    /** Wrapping width in pixels; unbounded when omitted. */
    width?: number;
    /** Height in pixels past which lines are not laid out. */
    height?: number;
    /** A family name, or `"sans-serif"`, `"serif"`, `"monospace"`, `"cursive"`, `"fantasy"`. @default "sans-serif" */
    family?: string;
    /** @default 400 */
    weight?: number;
    /** @default false */
    italic?: boolean;
    /** @default "word" */
    wrap?: "none" | "glyph" | "word" | "wordOrGlyph";
    /** @default "natural" */
    align?: "natural" | "left" | "right" | "center" | "justified" | "end";
    /** @default "#000000ff" */
    color?: Color;
  }

  interface RenderOptions extends TextOptions {
    /** Image width; the laid out width when omitted. */
    imageWidth?: number;
    /** Image height; the laid out height when omitted. */
    imageHeight?: number;
    /** @default transparent */
    background?: Color;
  }

  interface LayoutGlyph {
    /** UTF-8 byte range of the glyph's cluster in its line. */
    start: number;
    end: number;
    x: number;
    y: number;
    width: number;
    fontSize: number;
    /** Glyph id in its font. */
    glyph: number;
    /** Family of the font the glyph came from, after fallback. */
    font: string | null;
  }

  interface LayoutLine {
    /** Index of the source line (paragraph). */
    line: number;
    rtl: boolean;
    top: number;
    baseline: number;
    height: number;
    width: number;
    glyphs: LayoutGlyph[];
  }

  interface TextLayout {
    width: number;
    height: number;
    lines: LayoutLine[];
  }

  interface TextImage {
    width: number;
    height: number;
    /** Straight (not premultiplied) RGBA8, `width * 4` bytes per row. */
    data: Uint8Array;
  }

  interface FontFace {
    family: string | null;
    postscriptName: string;
    weight: number;
    style: "normal" | "italic" | "oblique";
    monospaced: boolean;
  }

  namespace text {
    /** Shapes and lays out `text`. */
    function layout(text: string, options?: TextOptions): TextLayout;
    /** Rasterizes `text` into an RGBA image. */
    function render(text: string, options?: RenderOptions): TextImage;
    /** Adds a TrueType/OpenType font or collection; returns the families it added. */
    function loadFont(source: string | ArrayBuffer | ArrayBufferView): string[];
    /** Every face of the font database (system fonts and loaded ones). */
    function fonts(): FontFace[];
  }

  interface DesktopAction {
    id: string;
    name: string | null;
    exec: string | null;
  }

  interface DesktopEntry {
    /** The application id: the file name without `.desktop`. */
    id: string;
    path: string;
    type: string | null;
    name: string | null;
    genericName: string | null;
    comment: string | null;
    icon: string | null;
    exec: string | null;
    tryExec: string | null;
    workingDirectory: string | null;
    terminal: boolean;
    noDisplay: boolean;
    hidden: boolean;
    dbusActivatable: boolean;
    startupWMClass: string | null;
    categories: string[] | null;
    keywords: string[] | null;
    mimeTypes: string[] | null;
    onlyShowIn: string[] | null;
    notShowIn: string[] | null;
    actions: DesktopAction[];
  }

  namespace apps {
    /**
     * Reads the `.desktop` files of `dirs` (default: `applications` under `$XDG_DATA_HOME` and
     * `$XDG_DATA_DIRS`). An id found in several directories keeps its first entry. Names are
     * localized for `locales` (default: from `LC_ALL`, `LC_MESSAGES`, `LANG`, `LANGUAGE`).
     */
    function list(options?: { dirs?: string[]; locales?: string[] }): DesktopEntry[];

    interface ExecContext {
      /** Replaces `%f` (first file) and `%F` (one argument per file). */
      files?: string[];
      /** Replaces `%u` (first URL) and `%U` (one argument per URL). */
      urls?: string[];
      /** Replaces `%c`. */
      name?: string;
      /** `%i` becomes `--icon <icon>`, or nothing without an icon. */
      icon?: string;
      /** Replaces `%k`. */
      path?: string;
    }

    /**
     * Splits an `Exec` value into argv as the Desktop Entry spec describes: spaces separate
     * arguments, double quotes group them, and field codes expand from `context`. A `%f`, `%u`,
     * `%F` or `%U` without files or URLs removes its argument. Deprecated codes are dropped.
     * Throws `ERR_BUN_COSMIC_INVALID_EXEC` on an unknown code or an unterminated quote.
     */
    function expandExec(exec: string, context?: ExecContext): string[];

    interface LaunchOptions {
      files?: string[];
      urls?: string[];
      /** Runs the `Exec` of this desktop action instead of the entry's. */
      action?: string;
      /** Prefix for entries with `Terminal=true`, such as `["cosmic-term", "-e"]`. */
      terminal?: string[];
      /** @default the entry's `Path`, else the current directory */
      cwd?: string;
      env?: Record<string, string | undefined>;
      /** @default "ignore" */
      stdin?: "ignore" | "inherit" | "pipe";
      /** @default "inherit" */
      stdout?: "ignore" | "inherit" | "pipe";
      /** @default "inherit" */
      stderr?: "ignore" | "inherit" | "pipe";
    }

    /**
     * Starts an application from its entry (or its id, looked up with {@link list}) with
     * `Bun.spawn`, without a shell. Call `unref()` on the result so Bun can exit before it.
     */
    function launch(entry: DesktopEntry | string, options?: LaunchOptions): Bun.Subprocess;
  }

  /** A RON value as JavaScript: `None` is `null`, maps are `Map`s, anonymous structs are plain objects. */
  type RonValue =
    | null
    | boolean
    | number
    | bigint
    | string
    | Uint8Array
    | RonValue[]
    | Map<RonValue, RonValue>
    | ron.Some
    | ron.Tuple
    | ron.Enum
    | { [field: string]: RonValue };

  namespace ron {
    /** `Some(value)`. */
    class Some {
      constructor(value: RonValue);
      value: RonValue;
    }
    /** `(a, b)`; `()` is the unit value. */
    class Tuple {
      constructor(values: RonValue[]);
      values: RonValue[];
    }
    /** An enum variant or named struct: `Dark`, `Rgba(1.0, 0.5)`, `Fixed(width: 2)`. */
    class Enum {
      constructor(name: string, values?: RonValue[], fields?: { [field: string]: RonValue });
      name: string;
      values?: RonValue[];
      fields?: { [field: string]: RonValue };
    }
    function parse(source: string): RonValue;
    /** Pretty RON, as cosmic-config writes it. */
    function stringify(value: RonValue): string;
    function some(value: RonValue): Some;
    function tuple(...values: RonValue[]): Tuple;
    function variant(name: string, payload?: RonValue[] | { [field: string]: RonValue }): Enum;
  }

  interface Config {
    readonly name: string;
    readonly version: number;
    /** The user directory: `$XDG_CONFIG_HOME/cosmic/<name>/v<version>`. */
    readonly path: string;
    /** The user value, else the system default; `undefined` when neither exists. */
    get(key: string): RonValue | undefined;
    /** The user value (falling back to version - 1, like cosmic-config). */
    getLocal(key: string): RonValue | undefined;
    /** The system default from `$XDG_DATA_HOME` and `$XDG_DATA_DIRS`. */
    getDefault(key: string): RonValue | undefined;
    /** Writes the user value atomically. */
    set(key: string, value: RonValue): void;
    /** Removes the user value; returns whether it existed. */
    delete(key: string): boolean;
    /** User and default keys, sorted. */
    keys(): string[];
    /** Calls `listener` with the key whenever a user value changes on disk. */
    watch(listener: (key: string) => void): import("node:fs").FSWatcher;
  }

  namespace config {
    /**
     * Opens the cosmic-config of `name` (such as `"com.system76.CosmicComp"`) at `version`.
     * `state: true` uses `$XDG_STATE_HOME` instead of `$XDG_CONFIG_HOME`.
     */
    function open(name: string, version?: number, options?: { state?: boolean }): Config;
  }

  interface WindowOptions {
    /** @default "Bun" */
    title?: string;
    body?: string;
    /** The first one is the suggested action. @default ["OK"] */
    buttons?: string[];
    /** @default 480 */
    width?: number;
    /** @default 240 */
    height?: number;
  }

  interface CosmicWindow {
    pid: number;
    /** Resolves once the window is created. */
    ready: Promise<void>;
    /** The button that closed the window, or `null` when it was closed another way. */
    closed: Promise<{ button: number; label: string } | null>;
    close(): void;
  }

  /** Opens a libcosmic window in the `bun-cosmic` helper process. Linux only. */
  function openWindow(options?: WindowOptions): CosmicWindow;

  interface NotifyOptions {
    summary: string;
    body?: string;
    icon?: string;
    /** @default "Bun" */
    appName?: string;
    /** Milliseconds; `-1` uses the server default, `0` never expires. */
    timeout?: number;
    urgency?: "low" | "normal" | "critical";
    /** Action id to label. The promise waits for one of them or for the notification to close. */
    actions?: Record<string, string>;
    /** Wait for the notification to close even without actions. */
    wait?: boolean;
  }

  /** Sends a desktop notification over D-Bus (org.freedesktop.Notifications). Linux only. */
  function notify(options: NotifyOptions): Promise<{ id: number; action: string | null }>;

  const isSupported: boolean;

  const _default: {
    isSupported: typeof isSupported;
    text: typeof text;
    apps: typeof apps;
    config: typeof config;
    ron: typeof ron;
    openWindow: typeof openWindow;
    notify: typeof notify;
  };
  export default _default;
  export {
    isSupported,
    text,
    apps,
    config,
    ron,
    openWindow,
    notify,
    Color,
    TextOptions,
    RenderOptions,
    TextLayout,
    LayoutLine,
    LayoutGlyph,
    TextImage,
    FontFace,
    DesktopEntry,
    DesktopAction,
    RonValue,
    Config,
    WindowOptions,
    CosmicWindow,
    NotifyOptions,
  };
}
