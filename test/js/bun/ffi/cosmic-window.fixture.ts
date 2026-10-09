// Native COSMIC (Pop!_OS) window driven from bun:ffi: cosmic-window/ is a Rust
// cdylib that runs a libcosmic (iced + winit) application on the calling thread
// and exports it as `bun_cosmic_window_run`. The "window created" line comes
// from a JSCallback the cdylib calls on this thread from the application's
// init; the close button or `--timeout <ms>` end the event loop.
//
//   cargo build --release --manifest-path cosmic-window/Cargo.toml
//   bun cosmic-window.fixture.ts [--title T] [--width W] [--height H] [--timeout MS] [--lib PATH]
//
// Library lookup: --lib, $BUN_COSMIC_WINDOW_LIB, then cosmic-window/target/release.
// Linux needs DISPLAY or WAYLAND_DISPLAY (xvfb-run works; rendering is tiny-skia).
import { dlopen, FFIType, JSCallback, suffix } from "bun:ffi";
import { existsSync } from "node:fs";
import { join } from "node:path";

let timeoutMs = 0;
let width = 680;
let height = 440;
let title = "Bun COSMIC window (bun:ffi)";
let lib = process.env.BUN_COSMIC_WINDOW_LIB ?? "";
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
    case "--lib":
      lib = argv[++i];
      break;
  }
}

lib ||= join(
  import.meta.dir,
  "cosmic-window",
  "target",
  "release",
  `${process.platform === "win32" ? "" : "lib"}bun_cosmic_window.${suffix}`,
);
if (!existsSync(lib)) {
  console.error(`cosmic-window: ${lib} not found (cargo build --release --manifest-path cosmic-window/Cargo.toml)`);
  process.exit(2);
}
if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error("cosmic-window: no display (set DISPLAY or WAYLAND_DISPLAY, e.g. run under xvfb-run)");
  process.exit(2);
}

const { symbols } = dlopen(lib, {
  bun_cosmic_window_run: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
});

const onCreated = new JSCallback(
  (w: number, h: number) => {
    console.log(`window created: ${JSON.stringify(title)} ${w}x${h}`);
  },
  { args: [FFIType.u32, FFIType.u32], returns: FFIType.void },
);

const closedBy = new Int32Array(1);
const status = symbols.bun_cosmic_window_run(
  Buffer.from(title + "\0", "utf8"),
  width,
  height,
  timeoutMs,
  onCreated.ptr,
  closedBy,
);
onCreated.close();
console.log(`window closed: by=${["close-button", "timeout"][closedBy[0]]} status=${status}`);
process.exit(status);
