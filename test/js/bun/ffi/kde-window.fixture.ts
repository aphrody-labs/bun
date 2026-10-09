// KDE window driven from bun:ffi: a Kirigami (KDE Frameworks 6)
// ApplicationWindow loaded by QQmlApplicationEngine. qt-window.shim.cpp,
// built with -DBUN_QT_KIRIGAMI by native-toolkits.ts, exposes it as
// `bun_kirigami_window_run`; the "window created" line comes from a JSCallback
// the shim calls synchronously before QApplication::exec(). Escape (a QML
// Shortcut), the close button or `--timeout <ms>` end the event loop.
//
//   bun kde-window.fixture.ts [--title T] [--width W] [--height H] [--timeout MS] [--shim PATH]
//
// Needs Qt 6 Quick and the org.kde.kirigami QML module (Linux: `kirigami`
// package; Windows: MSYS2 `mingw-w64-ucrt-x86_64-kirigami`). Linux without a
// display: QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software, or xvfb-run.
import { FFIType, JSCallback } from "bun:ffi";
import { loadQtShim } from "./native-toolkits.ts";

let timeoutMs = 0;
let width = 680;
let height = 440;
let title = "Bun KDE Kirigami window (bun:ffi)";
let shim = process.env.BUN_KDE_WINDOW_SHIM ?? "";
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

const kde = loadQtShim("kirigami", shim);
const cstr = (s: string) => Buffer.from(s + "\0", "utf8");
const titleText = cstr(title);
const bodyText = cstr(
  `Bun ${Bun.version} — bun:ffi + Kirigami on Qt ${kde.qtVersion} (extern "C" shim)\n\n` +
    `Press Escape or close the window to exit.`,
);

const onCreated = new JSCallback(
  (w: number, h: number) => {
    console.log(`window created: ${JSON.stringify(title)} ${w}x${h}`);
  },
  { args: [FFIType.i32, FFIType.i32], returns: FFIType.void },
);

const closedBy = new Int32Array(1);
const status = kde.run(titleText, bodyText, width, height, timeoutMs, onCreated.ptr, closedBy);
onCreated.close();
if (status < 0) {
  console.error("kde-window: the Kirigami QML scene failed to load");
  process.exit(2);
}
console.log(`window closed: by=${["close-button", "timeout", "escape"][closedBy[0]]} status=${status}`);
process.exit(status);
