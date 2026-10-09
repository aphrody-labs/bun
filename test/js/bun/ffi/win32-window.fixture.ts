// Native Win32 window driven entirely by bun:ffi against System32 DLLs
// (kernel32, user32, gdi32): WNDCLASSEXW registration, a JSCallback WNDPROC
// re-entered synchronously from DispatchMessageW, WM_PAINT via GDI, and a
// GetMessageW loop. Escape, the close box or `--timeout <ms>` end the loop.
//
//   bun win32-window.fixture.ts [--title T] [--width W] [--height H] [--timeout MS]
import { dlopen, FFIType, JSCallback, ptr } from "bun:ffi";

if (process.platform !== "win32") {
  console.error("win32-window: Windows only");
  process.exit(1);
}

const kernel32 = dlopen("kernel32.dll", {
  GetModuleHandleW: { args: [FFIType.ptr], returns: FFIType.ptr },
  GetLastError: { args: [], returns: FFIType.u32 },
});

const user32 = dlopen("user32.dll", {
  RegisterClassExW: { args: [FFIType.ptr], returns: FFIType.u16 },
  UnregisterClassW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.bool },
  CreateWindowExW: {
    args: [
      FFIType.u32, // dwExStyle
      FFIType.ptr, // lpClassName
      FFIType.ptr, // lpWindowName
      FFIType.u32, // dwStyle
      FFIType.i32, // X
      FFIType.i32, // Y
      FFIType.i32, // nWidth
      FFIType.i32, // nHeight
      FFIType.ptr, // hWndParent
      FFIType.ptr, // hMenu
      FFIType.ptr, // hInstance
      FFIType.ptr, // lpParam
    ],
    returns: FFIType.ptr,
  },
  ShowWindow: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.bool },
  UpdateWindow: { args: [FFIType.ptr], returns: FFIType.bool },
  DestroyWindow: { args: [FFIType.ptr], returns: FFIType.bool },
  DefWindowProcW: { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.i64], returns: FFIType.i64 },
  GetMessageW: { args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.u32], returns: FFIType.i32 },
  TranslateMessage: { args: [FFIType.ptr], returns: FFIType.bool },
  DispatchMessageW: { args: [FFIType.ptr], returns: FFIType.i64 },
  PostQuitMessage: { args: [FFIType.i32], returns: FFIType.void },
  LoadCursorW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
  GetClientRect: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.bool },
  BeginPaint: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
  EndPaint: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.bool },
  DrawTextW: { args: [FFIType.ptr, FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  SetTimer: { args: [FFIType.ptr, FFIType.u64, FFIType.u32, FFIType.ptr], returns: FFIType.u64 },
});

const gdi32 = dlopen("gdi32.dll", {
  SetBkMode: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  SetTextColor: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.u32 },
});

const CS_VREDRAW = 0x0001;
const CS_HREDRAW = 0x0002;
const IDC_ARROW = 32512;
const COLOR_WINDOW = 5;
const WS_OVERLAPPEDWINDOW = 0x00cf0000;
const CW_USEDEFAULT = -0x80000000;
const WM_DESTROY = 0x0002;
const WM_PAINT = 0x000f;
const WM_KEYDOWN = 0x0100;
const WM_TIMER = 0x0113;
const VK_ESCAPE = 0x1b;
const SW_SHOW = 5;
const DT_WORDBREAK = 0x0010;
const TRANSPARENT = 1;

function wstr(str: string): Buffer {
  return Buffer.from(str + "\0", "utf16le");
}

let timeoutMs = 0;
let width = 680;
let height = 440;
let title = "Bun Win32 window (bun:ffi)";
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
  }
}

const className = wstr("BunFfiWin32WindowClass");
const titleText = wstr(title);
const bodyText = wstr(
  `Bun ${Bun.version} — bun:ffi only, no npm dependency\n` +
    `user32.dll, kernel32.dll, gdi32.dll\n\n` +
    `Press Escape or close the window to exit.`,
);

const paintStruct = Buffer.alloc(72); // PAINTSTRUCT
const clientRect = Buffer.alloc(16); // RECT

const wndProc = new JSCallback(
  (hwnd, msg: number, wParam: bigint, lParam: bigint): bigint => {
    switch (msg) {
      case WM_PAINT: {
        const hdc = user32.symbols.BeginPaint(hwnd, paintStruct);
        if (hdc) {
          user32.symbols.GetClientRect(hwnd, clientRect);
          gdi32.symbols.SetBkMode(hdc, TRANSPARENT);
          gdi32.symbols.SetTextColor(hdc, 0x00111111);
          clientRect.writeInt32LE(clientRect.readInt32LE(0) + 40, 0);
          clientRect.writeInt32LE(clientRect.readInt32LE(4) + 40, 4);
          clientRect.writeInt32LE(clientRect.readInt32LE(8) - 40, 8);
          clientRect.writeInt32LE(clientRect.readInt32LE(12) - 40, 12);
          user32.symbols.DrawTextW(hdc, bodyText, -1, clientRect, DT_WORDBREAK);
          user32.symbols.EndPaint(hwnd, paintStruct);
        }
        return 0n;
      }
      case WM_KEYDOWN:
        if (wParam === BigInt(VK_ESCAPE)) {
          user32.symbols.DestroyWindow(hwnd);
          return 0n;
        }
        break;
      case WM_TIMER:
        user32.symbols.DestroyWindow(hwnd);
        return 0n;
      case WM_DESTROY:
        user32.symbols.PostQuitMessage(0);
        return 0n;
    }
    return user32.symbols.DefWindowProcW(hwnd, msg, wParam, lParam);
  },
  { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.i64], returns: FFIType.i64 },
);

const hInstance = kernel32.symbols.GetModuleHandleW(null);
const hCursor = user32.symbols.LoadCursorW(null, IDC_ARROW);

// WNDCLASSEXW, 80 bytes on 64-bit Windows.
const wndClass = Buffer.alloc(80);
wndClass.writeUInt32LE(80, 0); // cbSize
wndClass.writeUInt32LE(CS_HREDRAW | CS_VREDRAW, 4); // style
wndClass.writeBigUInt64LE(BigInt(wndProc.ptr!), 8); // lpfnWndProc
wndClass.writeBigUInt64LE(BigInt(hInstance ?? 0), 24); // hInstance
wndClass.writeBigUInt64LE(BigInt(hCursor ?? 0), 40); // hCursor
wndClass.writeBigUInt64LE(BigInt(COLOR_WINDOW + 1), 48); // hbrBackground
wndClass.writeBigUInt64LE(BigInt(ptr(className)), 64); // lpszClassName

if (!user32.symbols.RegisterClassExW(wndClass)) {
  console.error(`RegisterClassExW failed: ${kernel32.symbols.GetLastError()}`);
  process.exit(1);
}

const hwnd = user32.symbols.CreateWindowExW(
  0,
  className,
  titleText,
  WS_OVERLAPPEDWINDOW,
  CW_USEDEFAULT,
  CW_USEDEFAULT,
  width,
  height,
  null,
  null,
  hInstance,
  null,
);
if (!hwnd) {
  console.error(`CreateWindowExW failed: ${kernel32.symbols.GetLastError()}`);
  process.exit(1);
}

user32.symbols.ShowWindow(hwnd, SW_SHOW);
user32.symbols.UpdateWindow(hwnd);
if (timeoutMs > 0) user32.symbols.SetTimer(hwnd, 1n, timeoutMs, null);

console.log(`window created: ${JSON.stringify(title)} ${width}x${height}`);

// MSG, 48 bytes on 64-bit Windows.
const msg = Buffer.alloc(48);
while (user32.symbols.GetMessageW(msg, null, 0, 0) > 0) {
  user32.symbols.TranslateMessage(msg);
  user32.symbols.DispatchMessageW(msg);
}

user32.symbols.UnregisterClassW(className, hInstance);
wndProc.close();
console.log(`window closed: message=0x${msg.readUInt32LE(8).toString(16)} wParam=${msg.readBigUInt64LE(16)}`);
