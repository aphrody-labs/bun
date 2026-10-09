// Native Qt 6 Widgets window driven from bun:ffi. Qt has no C ABI, so
// qt-window.shim.cpp wraps QApplication + a QLabel window + QTimer in one
// extern "C" function; native-toolkits.ts compiles it with the system C++
// compiler and pkg-config (cached) and loads it with dlopen. The "window
// created" line comes from a JSCallback that the shim calls synchronously
// before QApplication::exec(). Escape, the close button or `--timeout <ms>`
// end the event loop.
//
//   bun qt-window.fixture.ts [--title T] [--width W] [--height H] [--timeout MS] [--shim PATH]
//
// Linux without a display: QT_QPA_PLATFORM=offscreen, or run under xvfb-run.
import { FFIType, JSCallback } from "bun:ffi";
import { loadQtShim } from "./native-toolkits.ts";

let timeoutMs = 0;
let width = 680;
let height = 440;
let title = "Bun Qt window (bun:ffi)";
let shim = process.env.BUN_QT_WINDOW_SHIM ?? "";
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
    case "--shim":
      shim = argv[++i];
      break;
  }
}

const qt = loadQtShim("qt", shim);
const cstr = (s: string) => Buffer.from(s + "\0", "utf8");
const titleText = cstr(title);
const bodyText = cstr(
  `Bun ${Bun.version} — bun:ffi + Qt ${qt.qtVersion} Widgets (extern "C" shim)\n\n` +
    `Press Escape or close the window to exit.`,
);

const onCreated = new JSCallback(
  (w: number, h: number) => {
    console.log(`window created: ${JSON.stringify(title)} ${w}x${h}`);
  },
  { args: [FFIType.i32, FFIType.i32], returns: FFIType.void },
);

const closedBy = new Int32Array(1);
const status = qt.run(titleText, bodyText, width, height, timeoutMs, onCreated.ptr, closedBy);
onCreated.close();
console.log(`window closed: by=${["close-button", "timeout", "escape"][closedBy[0]]} status=${status}`);
process.exit(status);
