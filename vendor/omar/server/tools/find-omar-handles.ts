import { dlopen, ptr } from "bun:ffi";
import windows from "bun:windows";
const k = dlopen("kernel32.dll", {
  OpenProcess: { args: ["u32", "i32", "u32"], returns: "ptr" },
  GetCurrentProcess: { args: [], returns: "ptr" },
  DuplicateHandle: { args: ["ptr", "ptr", "ptr", "ptr", "u32", "i32", "u32"], returns: "i32" },
  CloseHandle: { args: ["ptr"], returns: "i32" },
  GetFileType: { args: ["ptr"], returns: "u32" },
  GetFinalPathNameByHandleW: { args: ["ptr", "ptr", "u32", "u32"], returns: "u32" },
});
const n = dlopen("ntdll.dll", { NtQuerySystemInformation: { args: ["u32", "ptr", "u32", "ptr"], returns: "i32" } });
const required = new Uint32Array(1);
let buffer = new Uint8Array(1 << 20);
for (let i = 0; i < 10; i++) {
  const result = n.symbols.NtQuerySystemInformation(64, ptr(buffer), buffer.byteLength, ptr(required));
  if (result === 0) break;
  if (result !== -1073741820) throw new Error(`NtQuerySystemInformation ${result}`);
  buffer = new Uint8Array(Math.max(buffer.byteLength * 2, required[0] + 65536));
  if (i === 9) throw new Error("Handle snapshot exceeded bounded retries");
}
const data = new DataView(buffer.buffer);
const count = Number(data.getBigUint64(0, true));
const processes = new Map(windows.processes.list().map(p => [p.pid, p.name]));
const own = k.symbols.OpenProcess(0x40 | 0x1000, 0, process.pid);
const opened = new Map<number, number>();
const nameBuffer = new Uint16Array(32768);
const resultHandle = new BigUint64Array(1);
const matches: {pid:number;name?:string;path:string}[] = [];
try {
  for (let i = 0; i < count; i++) {
    const offset = 16 + i * 40;
    const pid = Number(data.getBigUint64(offset + 8, true));
    const handle = Number(data.getBigUint64(offset + 16, true));
    if (!pid || pid === 4 || pid === process.pid) continue;
    let source = opened.get(pid);
    if (source === undefined) { source = k.symbols.OpenProcess(0x40 | 0x1000, 0, pid); opened.set(pid, source); }
    if (!source) continue;
    if (!k.symbols.DuplicateHandle(source, handle, own, ptr(resultHandle), 0, 0, 2)) continue;
    const duplicate = Number(resultHandle[0]);
    try {
      if (k.symbols.GetFileType(duplicate) !== 1) continue;
      const length = k.symbols.GetFinalPathNameByHandleW(duplicate, ptr(nameBuffer), nameBuffer.length, 0);
      if (!length || length >= nameBuffer.length) continue;
      const name = Buffer.from(nameBuffer.buffer, 0, length * 2).toString("utf16le");
      if (name.toLowerCase().replaceAll(String.fromCharCode(92), "/").includes((Bun.argv[2] ?? "C:/SSH/omar/server").toLowerCase())) matches.push({ pid, name: processes.get(pid), path: name });
    } finally { k.symbols.CloseHandle(duplicate); }
  }
} finally { for (const handle of opened.values()) if (handle) k.symbols.CloseHandle(handle); if (own) k.symbols.CloseHandle(own); k.close(); n.close(); }
console.log(JSON.stringify({ handlesExamined: count, matches }, null, 2));
