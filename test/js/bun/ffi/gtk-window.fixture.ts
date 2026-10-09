// Native GTK 4 window driven entirely by bun:ffi against the GTK/GLib C API:
// gtk_application_new, an "activate" handler connected with g_signal_connect_data
// (a JSCallback re-entered synchronously from g_application_run), a GtkLabel
// child, a GtkEventControllerKey for Escape, and g_timeout_add for --timeout.
// Escape, the close button or `--timeout <ms>` end g_application_run.
//
//   bun gtk-window.fixture.ts [--title T] [--width W] [--height H] [--timeout MS] [--lib-dir DIR]
//
// Libraries: libgtk-4.so.1 (Linux), libgtk-4.1.dylib (Homebrew), libgtk-4-1.dll
// (Windows: PATH, --lib-dir, then windowsToolkitBinDir() in native-toolkits.ts).
// GTK needs a display: on Linux, DISPLAY or WAYLAND_DISPLAY must be set (xvfb-run works).
import { dlopen, FFIType, JSCallback } from "bun:ffi";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { gtk4Libraries as names, gtk4SearchDirs, hasDisplay } from "./native-toolkits.ts";

const { ptr: p, i32, u32, u64, void: none } = FFIType;

let timeoutMs = 0;
let width = 680;
let height = 440;
let title = "Bun GTK 4 window (bun:ffi)";
let libDir = "";
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const value = argv[i + 1];
  if (value === undefined) break;
  switch (argv[i]) {
    case "--timeout":
      timeoutMs = Number.parseInt(argv[++i], 10);
      break;
    case "--width":
      width = Number.parseInt(argv[++i], 10);
      break;
    case "--height":
      height = Number.parseInt(argv[++i], 10);
      break;
    case "--title":
      title = argv[++i];
      break;
    case "--lib-dir":
      libDir = argv[++i];
      break;
  }
}

// The directory GTK loads from is reused for GLib, GObject and GIO so two GLib
// copies are never mixed.
const searchDirs = gtk4SearchDirs(libDir);
let chosenDir: string | undefined;

function open<T extends Record<string, { args: readonly FFIType[]; returns: FFIType }>>(name: string, symbols: T) {
  const errors: string[] = [];
  for (const dir of chosenDir === undefined ? searchDirs : [chosenDir]) {
    const path = dir ? join(dir, name) : name;
    if (dir && !existsSync(path)) continue;
    try {
      const lib = dlopen(path, symbols);
      chosenDir ??= dir;
      return lib;
    } catch (e) {
      errors.push(`${path}: ${(e as Error).message}`);
    }
  }
  console.error(`gtk-window: cannot load ${name} (install GTK 4)\n  ${errors.join("\n  ")}`);
  process.exit(2);
}

if (!hasDisplay) {
  console.error("gtk-window: no display (set DISPLAY or WAYLAND_DISPLAY, e.g. run under xvfb-run)");
  process.exit(2);
}

const { symbols: gtk } = open(names.gtk, {
  gtk_get_major_version: { args: [], returns: u32 },
  gtk_get_minor_version: { args: [], returns: u32 },
  gtk_get_micro_version: { args: [], returns: u32 },
  gtk_application_new: { args: [p, u32], returns: p },
  gtk_application_window_new: { args: [p], returns: p },
  gtk_window_set_title: { args: [p, p], returns: none },
  gtk_window_set_default_size: { args: [p, i32, i32], returns: none },
  gtk_window_set_child: { args: [p, p], returns: none },
  gtk_window_present: { args: [p], returns: none },
  gtk_window_close: { args: [p], returns: none },
  gtk_label_new: { args: [p], returns: p },
  gtk_label_set_wrap: { args: [p, i32], returns: none },
  gtk_widget_set_margin_start: { args: [p, i32], returns: none },
  gtk_widget_set_margin_end: { args: [p, i32], returns: none },
  gtk_widget_set_margin_top: { args: [p, i32], returns: none },
  gtk_widget_set_margin_bottom: { args: [p, i32], returns: none },
  gtk_widget_add_controller: { args: [p, p], returns: none },
  gtk_event_controller_key_new: { args: [], returns: p },
});
const { symbols: gobject } = open(names.gobject, {
  g_signal_connect_data: { args: [p, p, p, p, p, u32], returns: u64 },
  g_object_unref: { args: [p], returns: none },
});
const { symbols: glib } = open(names.glib, {
  g_timeout_add: { args: [u32, p, p], returns: u32 },
});
const { symbols: gio } = open(names.gio, {
  g_application_run: { args: [p, i32, p], returns: i32 },
});

const G_APPLICATION_NON_UNIQUE = 1 << 5;
const GDK_KEY_Escape = 0xff1b;

const cstr = (s: string) => Buffer.from(s + "\0", "utf8");
const appId = cstr("sh.bun.FfiGtkWindow");
const titleText = cstr(title);
const bodyText = cstr(
  `Bun ${Bun.version} — bun:ffi only, no npm dependency\n` +
    `GTK ${gtk.gtk_get_major_version()}.${gtk.gtk_get_minor_version()}.${gtk.gtk_get_micro_version()}\n\n` +
    `Press Escape or close the window to exit.`,
);
const activateSignal = cstr("activate");
const keyPressedSignal = cstr("key-pressed");

let window: ReturnType<typeof gtk.gtk_application_window_new> = null;
let closedBy = "close-button";

const onTimeout = new JSCallback(
  () => {
    closedBy = "timeout";
    if (window) gtk.gtk_window_close(window);
    return 0; // G_SOURCE_REMOVE
  },
  { args: [p], returns: i32 },
);

const onKeyPressed = new JSCallback(
  (_controller, keyval: number) => {
    if (keyval !== GDK_KEY_Escape || !window) return 0;
    closedBy = "escape";
    gtk.gtk_window_close(window);
    return 1;
  },
  { args: [p, u32, u32, u32, p], returns: i32 },
);

const onActivate = new JSCallback(
  app => {
    window = gtk.gtk_application_window_new(app);
    gtk.gtk_window_set_title(window, titleText);
    gtk.gtk_window_set_default_size(window, width, height);
    const label = gtk.gtk_label_new(bodyText);
    gtk.gtk_label_set_wrap(label, 1);
    gtk.gtk_widget_set_margin_start(label, 40);
    gtk.gtk_widget_set_margin_end(label, 40);
    gtk.gtk_widget_set_margin_top(label, 40);
    gtk.gtk_widget_set_margin_bottom(label, 40);
    gtk.gtk_window_set_child(window, label);
    const keys = gtk.gtk_event_controller_key_new();
    gobject.g_signal_connect_data(keys, keyPressedSignal, onKeyPressed.ptr, null, null, 0);
    gtk.gtk_widget_add_controller(window, keys);
    gtk.gtk_window_present(window);
    if (timeoutMs > 0) glib.g_timeout_add(timeoutMs, onTimeout.ptr, null);
    console.log(`window created: ${JSON.stringify(title)} ${width}x${height}`);
  },
  { args: [p, p], returns: none },
);

const app = gtk.gtk_application_new(appId, G_APPLICATION_NON_UNIQUE);
if (!app) {
  console.error("gtk_application_new failed");
  process.exit(1);
}
gobject.g_signal_connect_data(app, activateSignal, onActivate.ptr, null, null, 0);
const status = gio.g_application_run(app, 0, null);
gobject.g_object_unref(app);
onActivate.close();
onKeyPressed.close();
onTimeout.close();
console.log(`window closed: by=${closedBy} status=${status}`);
process.exit(status);
