// Runtime of the generated Win32 families (packages/bun-windows-<dll>, scripts/aphrody/win32/gen.ts).
// Functions are bound lazily through bun:ffi (LoadLibraryExW + GetProcAddress + CFunction), structs are
// views over a Uint8Array laid out from win32metadata, and COM interfaces are called through their vtables.
//
// Type tokens (see gen.ts): i8..u64 f32 f64 bool void isize usize, hr (HRESULT), p (pointer), w (PWSTR),
// a (PSTR), b (BSTR), *<tok> (typed pointer), s<size>:<Ns.Name> (struct by value), f:<Ns.Name> (callback),
// i:<Ns.Name> (COM interface pointer); fields add c[N] (WCHAR array), ca[N] (CHAR array) and <tok>[N].
// A COM parameter token prefixed with @ is the [retval] out pointer: omit it and the method returns it.
const ffi = require("bun:ffi");
const { CFunction, JSCallback, read, toArrayBuffer, CString } = ffi;
const ptrOf = ffi.ptr;

const kBuf = Symbol("win32.buffer");
const kView = Symbol("win32.view");
const kKeep = Symbol("win32.keep");
const kChildren = Symbol("win32.children");
const kPtr = Symbol("win32.ptr");

type Metadata = {
  manifest?: unknown;
  namespace(name: string): any;
  namespaceOf(type: string): string | undefined;
};

let metadata: Metadata | undefined;

function setMetadata(value: Metadata) {
  if (metadata === undefined && value && typeof value.namespace === "function") metadata = value;
}

function getMetadata(): Metadata {
  if (metadata === undefined) {
    const windows = require("bun:windows");
    setMetadata(windows.family("win32"));
  }
  return metadata!;
}

class Win32Error extends Error {
  code: number;
  constructor(code: number, where: string, kind = "HRESULT") {
    const hex = "0x" + (code >>> 0).toString(16).padStart(8, "0");
    super(`${where} failed: ${kind} ${hex}`);
    this.name = "Win32Error";
    this.code = code;
  }
}

// ---- bootstrap imports ----

let core: any;
function sys() {
  if (core === undefined) {
    const k32 = ffi.dlopen("kernel32.dll", {
      LoadLibraryExW: { args: ["ptr", "ptr", "u32"], returns: "ptr" },
      GetProcAddress: { args: ["ptr", "ptr"], returns: "ptr" },
      GetLastError: { args: [], returns: "u32" },
      lstrlenW: { args: ["ptr"], returns: "i32" },
    }).symbols;
    core = { k32, ole: undefined, aut: undefined, comInit: false };
  }
  return core;
}

function ole() {
  const c = sys();
  if (c.ole === undefined) {
    c.ole = ffi.dlopen("ole32.dll", {
      CoInitializeEx: { args: ["ptr", "u32"], returns: "i32" },
      CoCreateInstance: { args: ["ptr", "ptr", "u32", "ptr", "ptr"], returns: "i32" },
      CoTaskMemFree: { args: ["ptr"], returns: "void" },
    }).symbols;
    c.aut = ffi.dlopen("oleaut32.dll", {
      SysAllocString: { args: ["ptr"], returns: "ptr" },
      SysFreeString: { args: ["ptr"], returns: "void" },
      SysStringLen: { args: ["ptr"], returns: "u32" },
      VariantClear: { args: ["ptr"], returns: "i32" },
    }).symbols;
  }
  return c;
}

let lastErrorValue = 0;

function lastError() {
  return lastErrorValue;
}

const modules = new Map<string, number>();

function loadModule(dll: string) {
  let handle = modules.get(dll);
  if (handle === undefined) {
    const { k32 } = sys();
    const name = wstr(dll);
    // LOAD_LIBRARY_SEARCH_SYSTEM32 first: never pick up a same-named DLL from the working directory.
    handle = k32.LoadLibraryExW(name, null, 0x800) || k32.LoadLibraryExW(name, null, 0) || 0;
    if (!handle) {
      const error = new Error(`${dll} could not be loaded (error ${k32.GetLastError()})`) as Error & { code: string };
      error.code = "ERR_WIN32_DLL_NOT_FOUND";
      throw error;
    }
    modules.set(dll, handle);
  }
  return handle;
}

function procAddress(dll: string, symbol: string) {
  const handle = loadModule(dll);
  const { k32 } = sys();
  const address =
    symbol[0] === "#"
      ? k32.GetProcAddress(handle, Number(symbol.slice(1)))
      : k32.GetProcAddress(handle, Buffer.from(symbol + "\0", "latin1"));
  if (!address) {
    const error = new Error(`${dll}!${symbol} is not exported on this system`) as Error & { code: string };
    error.code = "ERR_WIN32_PROC_NOT_FOUND";
    throw error;
  }
  return address;
}

// ---- strings ----

function wstr(value: string) {
  return Buffer.from(value + "\0", "utf16le");
}

function readWide(address: number | bigint | ArrayBufferView | null, length?: number) {
  if (!address) return null;
  if (ArrayBuffer.isView(address)) {
    const units = new Uint16Array(address.buffer, address.byteOffset, address.byteLength >> 1);
    let n = length ?? units.indexOf(0);
    if (n < 0) n = units.length;
    return Buffer.from(address.buffer, address.byteOffset, n * 2).toString("utf16le");
  }
  const at = Number(address);
  const n = length ?? sys().k32.lstrlenW(at);
  if (n <= 0) return "";
  return Buffer.from(toArrayBuffer(at, 0, n * 2)).toString("utf16le");
}

function readAnsi(address: number | bigint | null) {
  if (!address) return null;
  return new CString(Number(address)).toString();
}

function readBstr(address: number | bigint | null) {
  if (!address) return null;
  return readWide(address, ole().aut.SysStringLen(Number(address)));
}

// ---- GUID ----

const GUID_RE = /^\{?([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\}?$/i;

function guid(value: string) {
  const m = GUID_RE.exec(value);
  if (!m) throw $ERR_INVALID_ARG_VALUE("guid", value, "must be a GUID string");
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setUint32(0, parseInt(m[1], 16), true);
  view.setUint16(4, parseInt(m[2], 16), true);
  view.setUint16(6, parseInt(m[3], 16), true);
  const tail = m[4] + m[5];
  for (let i = 0; i < 8; i++) out[8 + i] = parseInt(tail.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function guidString(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, 16);
  const hex = (n: number, w: number) => n.toString(16).padStart(w, "0");
  let tail = "";
  for (let i = 8; i < 16; i++) tail += hex(bytes[i], 2);
  return `${hex(view.getUint32(0, true), 8)}-${hex(view.getUint16(4, true), 4)}-${hex(view.getUint16(6, true), 4)}-${tail.slice(0, 4)}-${tail.slice(4)}`;
}

// ---- tokens ----

const PRIM_SIZE: Record<string, number> = {
  i8: 1,
  u8: 1,
  bool: 1,
  i16: 2,
  u16: 2,
  i32: 4,
  u32: 4,
  hr: 4,
  f32: 4,
  i64: 8,
  u64: 8,
  f64: 8,
  isize: 8,
  usize: 8,
};

function structToken(tok: string) {
  const colon = tok.indexOf(":");
  return { size: Number(tok.slice(1, colon)), name: tok.slice(colon + 1) };
}

function tokenSize(tok: string): number {
  const prim = PRIM_SIZE[tok];
  if (prim !== undefined) return prim;
  if (tok[0] === "s" && tok[1] >= "0" && tok[1] <= "9") return structToken(tok).size;
  return 8;
}

function ffiType(tok: string): string {
  switch (tok) {
    case "i8":
    case "u8":
    case "i16":
    case "u16":
    case "i32":
    case "u32":
    case "f32":
    case "f64":
    case "bool":
    case "void":
      return tok;
    case "hr":
      return "i32";
    case "i64":
    case "isize":
      return "i64_fast";
    case "u64":
    case "usize":
      return "u64_fast";
  }
  if (tok[0] === "s" && tok[1] >= "0" && tok[1] <= "9") {
    switch (structToken(tok).size) {
      case 1:
        return "u8";
      case 2:
        return "u16";
      case 4:
        return "u32";
      case 8:
        return "u64_fast";
    }
  }
  return "ptr";
}

function isStructToken(tok: string) {
  return tok[0] === "s" && tok[1] >= "0" && tok[1] <= "9";
}

function splitName(full: string) {
  const slash = full.indexOf("/");
  const head = slash < 0 ? full : full.slice(0, slash);
  const dot = head.lastIndexOf(".");
  return { ns: full.slice(0, dot), name: full.slice(dot + 1) };
}

function lookup(kind: "structs" | "callbacks" | "interfaces" | "enums", type: string) {
  const md = getMetadata();
  let ns: string | undefined;
  let name: string;
  if (type.includes(".")) ({ ns, name } = splitName(type));
  else {
    name = type;
    const outer = type.split("/")[0];
    ns = md.namespaceOf(outer);
  }
  const data = ns ? md.namespace(ns) : undefined;
  const entry = data?.[kind]?.[name];
  if (entry === undefined) {
    const error = new Error(`Win32 ${kind.slice(0, -1)} ${type} not found in the metadata`) as Error & {
      code: string;
    };
    error.code = "ERR_WIN32_TYPE_NOT_FOUND";
    throw error;
  }
  return { ns: ns!, name, entry, full: `${ns}.${name}` };
}

// ---- pointers ----

function toPointer(value: any, keep: any[]): number | null {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case "number":
      return value;
    case "bigint":
      return Number(value);
    case "string":
      keep.push((value = wstr(value)));
      return ptrOf(value);
    case "object":
      if (value[kBuf] !== undefined) {
        keep.push(value);
        return ptrOf(value[kBuf]);
      }
      if (value[kPtr] !== undefined) return value[kPtr];
      if (value instanceof JSCallback) return value.ptr;
      if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        if ((value as ArrayBufferView).byteLength === 0) return null;
        keep.push(value);
        return ptrOf(value);
      }
      if (typeof value.ptr === "number") return value.ptr;
  }
  throw $ERR_INVALID_ARG_TYPE("pointer", ["number", "bigint", "TypedArray", "Win32Struct", "ComObject"], value);
}

// ---- structs ----

type FieldInfo = { name: string; tok: string; off: number };
type StructType = {
  full: string;
  size: number;
  align: number;
  union: boolean;
  fields: FieldInfo[];
  byName: Map<string, FieldInfo>;
  proto: any;
};

const structTypes = new Map<string, StructType>();
const SIZE_FIELDS = new Set(["cbSize", "dwSize", "cb", "dwLength", "nLength", "cbStruct", "dwOSVersionInfoSize"]);

function structType(type: string): StructType {
  let st = structTypes.get(type);
  if (st !== undefined) return st;
  if (type === "System.Guid" || type === "GUID")
    return (structTypes.set(type, structType("Foundation.GUID")), structTypes.get(type)!);
  const { full, entry } = lookup("structs", type);
  st = structTypes.get(full);
  if (st === undefined) {
    const fields: FieldInfo[] = entry.f.map(([name, tok, off]: [string, string, number]) => ({ name, tok, off }));
    st = {
      full,
      size: entry.s,
      align: entry.a,
      union: !!entry.u,
      fields,
      byName: new Map(fields.map(f => [f.name, f])),
      proto: undefined,
    };
    structTypes.set(full, st);
    st.proto = buildProto(st);
  }
  structTypes.set(type, st);
  return st;
}

function int64(view: DataView, off: number, signed: boolean) {
  const v = signed ? view.getBigInt64(off, true) : view.getBigUint64(off, true);
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : v;
}

function pointerAt(view: DataView, off: number) {
  const v = Number(view.getBigUint64(off, true));
  return v === 0 ? null : v;
}

function readScalar(view: DataView, off: number, tok: string): any {
  switch (tok) {
    case "i8":
      return view.getInt8(off);
    case "u8":
      return view.getUint8(off);
    case "bool":
      return view.getUint8(off) !== 0;
    case "i16":
      return view.getInt16(off, true);
    case "u16":
      return view.getUint16(off, true);
    case "i32":
    case "hr":
      return view.getInt32(off, true);
    case "u32":
      return view.getUint32(off, true);
    case "f32":
      return view.getFloat32(off, true);
    case "f64":
      return view.getFloat64(off, true);
    case "i64":
    case "isize":
      return int64(view, off, true);
    case "u64":
    case "usize":
      return int64(view, off, false);
    case "w":
      return readWide(pointerAt(view, off));
    case "a":
      return readAnsi(pointerAt(view, off));
    case "b":
      return readBstr(pointerAt(view, off));
  }
  return pointerAt(view, off);
}

function writeScalar(view: DataView, off: number, tok: string, value: any, keep: any[]) {
  switch (tok) {
    case "i8":
      return view.setInt8(off, Number(value));
    case "u8":
      return view.setUint8(off, Number(value));
    case "bool":
      return view.setUint8(off, value ? 1 : 0);
    case "i16":
      return view.setInt16(off, Number(value), true);
    case "u16":
      return view.setUint16(off, Number(value), true);
    case "i32":
    case "hr":
      return view.setInt32(off, Number(value), true);
    case "u32":
      return view.setUint32(off, Number(value), true);
    case "f32":
      return view.setFloat32(off, Number(value), true);
    case "f64":
      return view.setFloat64(off, Number(value), true);
    case "i64":
    case "isize":
      return view.setBigInt64(off, BigInt(value), true);
    case "u64":
    case "usize":
      return view.setBigUint64(off, BigInt(value), true);
    case "a":
      if (typeof value === "string") {
        keep.push((value = Buffer.from(value + "\0", "utf8")));
        value = ptrOf(value);
      }
      break;
    case "b":
      if (typeof value === "string") value = ole().aut.SysAllocString(wstr(value));
      break;
  }
  view.setBigUint64(off, BigInt(toPointer(value, keep) ?? 0), true);
}

function arrayToken(tok: string) {
  const open = tok.lastIndexOf("[");
  if (open < 0 || tok[tok.length - 1] !== "]") return undefined;
  return { elem: tok.slice(0, open), length: Number(tok.slice(open + 1, -1)) };
}

function defineField(proto: any, st: StructType, field: FieldInfo) {
  const { name, tok, off } = field;
  const arr = arrayToken(tok);
  let get: (this: any) => any;
  let set: (this: any, value: any) => void;
  if (arr && (arr.elem === "c" || arr.elem === "ca")) {
    const wide = arr.elem === "c";
    const unit = wide ? 2 : 1;
    get = function () {
      const buf: Uint8Array = this[kBuf];
      const bytes = buf.subarray(off, off + arr.length * unit);
      let end = 0;
      if (wide) while (end < arr.length && (bytes[end * 2] | bytes[end * 2 + 1]) !== 0) end++;
      else while (end < arr.length && bytes[end] !== 0) end++;
      return Buffer.from(bytes.buffer, bytes.byteOffset, end * unit).toString(wide ? "utf16le" : "latin1");
    };
    set = function (value) {
      const buf: Uint8Array = this[kBuf];
      const encoded = Buffer.from(String(value), wide ? "utf16le" : "latin1");
      const max = (arr.length - 1) * unit;
      buf.fill(0, off, off + arr.length * unit);
      buf.set(encoded.subarray(0, Math.min(max, encoded.length - (encoded.length % unit))), off);
    };
  } else if (arr) {
    const size = tokenSize(arr.elem);
    get = function () {
      let cache = this[kChildren];
      const hit = cache?.get(name);
      if (hit !== undefined) return hit;
      let out: any;
      if (isStructToken(arr.elem)) {
        const inner = structType(structToken(arr.elem).name);
        out = [];
        for (let i = 0; i < arr.length; i++) out.push(viewStruct(inner, this[kBuf], off + i * size, this));
      } else {
        const view: DataView = this[kView];
        out = new Proxy([] as any[], {
          get: (_t, key) => {
            if (key === "length") return arr.length;
            if (typeof key === "string" && /^\d+$/.test(key) && Number(key) < arr.length)
              return readScalar(view, off + Number(key) * size, arr.elem);
            if (key === Symbol.iterator)
              return function* () {
                for (let i = 0; i < arr.length; i++) yield readScalar(view, off + i * size, arr.elem);
              };
            return undefined;
          },
          set: (_t, key, value) => {
            if (typeof key !== "string" || !/^\d+$/.test(key) || Number(key) >= arr.length) return false;
            writeScalar(view, off + Number(key) * size, arr.elem, value, this[kKeep]);
            return true;
          },
        });
      }
      if (cache === undefined) this[kChildren] = cache = new Map();
      cache.set(name, out);
      return out;
    };
    set = function (value) {
      const target = this[name];
      let i = 0;
      for (const item of value) {
        if (i >= arr.length) break;
        if (isStructToken(arr.elem)) assign(target[i], item);
        else target[i] = item;
        i++;
      }
    };
  } else if (isStructToken(tok)) {
    get = function () {
      let cache = this[kChildren];
      let child = cache?.get(name);
      if (child === undefined) {
        child = viewStruct(structType(structToken(tok).name), this[kBuf], off, this);
        if (cache === undefined) this[kChildren] = cache = new Map();
        cache.set(name, child);
      }
      return child;
    };
    set = function (value) {
      assign(this[name], value);
    };
  } else {
    get = function () {
      return readScalar(this[kView], off, tok);
    };
    set = function (value) {
      writeScalar(this[kView], off, tok, value, this[kKeep]);
    };
  }
  Object.defineProperty(proto, name, { get, set, enumerable: true, configurable: true });
}

function buildProto(st: StructType) {
  const proto = Object.create(StructBase.prototype);
  for (const field of st.fields) defineField(proto, st, field);
  // Anonymous unions/structs: expose their members on the outer struct too (a.Anonymous.ki -> a.ki).
  for (const field of st.fields) {
    if (!/^Anonymous\d*$/.test(field.name) || !isStructToken(field.tok)) continue;
    const inner = structType(structToken(field.tok).name);
    const names = new Set<string>();
    const collect = (t: StructType) => {
      for (const f of t.fields) {
        if (/^Anonymous\d*$/.test(f.name) && isStructToken(f.tok)) collect(structType(structToken(f.tok).name));
        names.add(f.name);
      }
    };
    collect(inner);
    for (const member of names) {
      if (member in proto || st.byName.has(member)) continue;
      const anon = field.name;
      Object.defineProperty(proto, member, {
        get() {
          return this[anon][member];
        },
        set(value) {
          this[anon][member] = value;
        },
        enumerable: false,
        configurable: true,
      });
    }
  }
  Object.defineProperty(proto, "$type", { value: st.full });
  Object.defineProperty(proto, "$size", { value: st.size });
  return proto;
}

class StructBase {
  get ["$buffer"](): Uint8Array {
    return this[kBuf];
  }
  get ["$ptr"](): number {
    return ptrOf(this[kBuf]);
  }
  toJSON() {
    const out: Record<string, unknown> = {};
    for (const key in this) {
      const value: any = (this as any)[key];
      out[key] =
        value instanceof StructBase
          ? value.toJSON()
          : Array.isArray(value)
            ? value.map(v => (v instanceof StructBase ? v.toJSON() : v))
            : value?.[Symbol.iterator] && typeof value !== "string"
              ? [...value]
              : value;
    }
    return out;
  }
}

function viewStruct(st: StructType, buffer: Uint8Array, offset: number, parent?: any) {
  const instance = Object.create(st.proto);
  const buf = buffer.subarray(offset, offset + st.size);
  instance[kBuf] = buf;
  instance[kView] = new DataView(buf.buffer, buf.byteOffset, st.size);
  instance[kKeep] = parent ? parent[kKeep] : [];
  return instance;
}

function assign(target: any, init: any) {
  if (init === undefined || init === null) return target;
  if (init[kBuf] !== undefined) {
    target[kBuf].set(init[kBuf].subarray(0, target[kBuf].length));
    return target;
  }
  if (ArrayBuffer.isView(init)) {
    target[kBuf].set(new Uint8Array(init.buffer, init.byteOffset, Math.min(init.byteLength, target[kBuf].length)));
    return target;
  }
  for (const key of Object.keys(init)) {
    if (!(key in target)) throw $ERR_INVALID_ARG_VALUE(key, init[key], `is not a field of ${target["$type"]}`);
    target[key] = init[key];
  }
  return target;
}

function struct(type: string, init?: any) {
  const st = structType(type);
  const instance = viewStruct(st, new Uint8Array(Math.max(st.size, 1)), 0);
  const first = st.fields[0];
  if (first && first.off === 0 && first.tok === "u32" && SIZE_FIELDS.has(first.name))
    instance[kView].setUint32(0, st.size, true);
  return assign(instance, init);
}

function structAt(type: string, address: number | bigint) {
  const st = structType(type);
  if (!address) throw $ERR_INVALID_ARG_VALUE("address", address, "must be a non-null pointer");
  return viewStruct(st, new Uint8Array(toArrayBuffer(Number(address), 0, st.size)), 0);
}

function sizeof(type: string) {
  return structType(type).size;
}

// ---- argument conversion ----

function variantFrom(value: any, keep: any[], cleanup: any[]) {
  const v = struct("System.Variant.VARIANT");
  const view: DataView = v[kView];
  switch (typeof value) {
    case "undefined":
      break;
    case "string": {
      view.setUint16(0, 8, true);
      const bstr = ole().aut.SysAllocString(wstr(value));
      view.setBigUint64(8, BigInt(bstr ?? 0), true);
      cleanup.push(() => ole().aut.VariantClear(v[kBuf]));
      break;
    }
    case "boolean":
      view.setUint16(0, 11, true);
      view.setInt16(8, value ? -1 : 0, true);
      break;
    case "number":
      if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
        view.setUint16(0, 3, true);
        view.setInt32(8, value, true);
      } else {
        view.setUint16(0, 5, true);
        view.setFloat64(8, value, true);
      }
      break;
    case "bigint":
      view.setUint16(0, 20, true);
      view.setBigInt64(8, value, true);
      break;
    default:
      if (value === null) view.setUint16(0, 1, true);
      else if (value[kPtr] !== undefined) {
        view.setUint16(0, 13, true);
        view.setBigUint64(8, BigInt(value[kPtr]), true);
      } else return assign(v, value);
  }
  keep.push(v);
  return v;
}

function variantValue(v: any, release = true): any {
  const view: DataView = v[kView];
  const vt = view.getUint16(0, true);
  let out: any;
  switch (vt & 0xfff) {
    case 0:
      out = undefined;
      break;
    case 1:
      out = null;
      break;
    case 2:
      out = view.getInt16(8, true);
      break;
    case 3:
    case 22:
      out = view.getInt32(8, true);
      break;
    case 4:
      out = view.getFloat32(8, true);
      break;
    case 5:
      out = view.getFloat64(8, true);
      break;
    case 7:
      out = new Date(Date.UTC(1899, 11, 30) + view.getFloat64(8, true) * 86400000);
      break;
    case 8:
      out = readBstr(pointerAt(view, 8));
      break;
    case 11:
      out = view.getInt16(8, true) !== 0;
      break;
    case 16:
      out = view.getInt8(8);
      break;
    case 17:
      out = view.getUint8(8);
      break;
    case 18:
      out = view.getUint16(8, true);
      break;
    case 19:
    case 23:
      out = view.getUint32(8, true);
      break;
    case 20:
      out = int64(view, 8, true);
      break;
    case 21:
      out = int64(view, 8, false);
      break;
    case 9:
    case 13: {
      const p = pointerAt(view, 8);
      if (p) {
        comAddRef(p);
        out = wrapCom(p, vt === 9 ? "System.Com.IDispatch" : "System.Com.IUnknown");
      } else out = null;
      break;
    }
    default:
      return v;
  }
  if (release) ole().aut.VariantClear(v[kBuf]);
  return out;
}

function callbackSignature(type: string) {
  const { entry } = lookup("callbacks", type);
  return { args: entry.a.map((t: string) => ffiType(t)), returns: ffiType(entry.r) };
}

function callback(type: string, fn: (...args: any[]) => any, options?: { threadsafe?: boolean }) {
  const cb = new JSCallback(fn, { ...callbackSignature(type), threadsafe: !!options?.threadsafe });
  return cb;
}

function convertArg(tok: string, value: any, keep: any[], cleanup: any[]): any {
  switch (tok) {
    case "i8":
    case "u8":
    case "i16":
    case "u16":
    case "i32":
    case "u32":
    case "hr":
      return typeof value === "boolean" ? +value : value === undefined || value === null ? 0 : Number(value);
    case "f32":
    case "f64":
      return value === undefined ? 0 : Number(value);
    case "bool":
      return !!value;
    case "i64":
    case "u64":
    case "isize":
    case "usize":
      if (value === undefined || value === null) return 0;
      if (typeof value === "boolean") return +value;
      if (typeof value === "object") return toPointer(value, keep) ?? 0;
      return value;
    case "w":
      return toPointer(value, keep);
    case "a":
      if (typeof value === "string") {
        keep.push((value = Buffer.from(value + "\0", "utf8")));
        return ptrOf(value);
      }
      return toPointer(value, keep);
    case "b":
      if (typeof value === "string") {
        const bstr = ole().aut.SysAllocString(wstr(value));
        cleanup.push(() => ole().aut.SysFreeString(bstr));
        return bstr;
      }
      return toPointer(value, keep);
  }
  const c0 = tok[0];
  if (c0 === "f" && tok[1] === ":") {
    if (typeof value === "function") {
      const cb = new JSCallback(value, callbackSignature(tok.slice(2)));
      cleanup.push(() => cb.close());
      return cb.ptr;
    }
    return toPointer(value, keep);
  }
  if (c0 === "i" && tok[1] === ":") return toPointer(value, keep);
  if (c0 === "*") {
    const inner = tok.slice(1);
    if (typeof value === "string" && inner === "s16:Foundation.GUID") {
      keep.push((value = guid(value)));
      return ptrOf(value);
    }
    if (
      value &&
      typeof value === "object" &&
      isStructToken(inner) &&
      value[kBuf] === undefined &&
      !ArrayBuffer.isView(value) &&
      !(value instanceof ArrayBuffer) &&
      value[kPtr] === undefined
    ) {
      value = struct(structToken(inner).name, value);
    }
    return toPointer(value, keep);
  }
  if (isStructToken(tok)) {
    const { size, name } = structToken(tok);
    let s: any;
    if (
      name === "System.Variant.VARIANT" &&
      (value === undefined || value === null || typeof value !== "object" || value[kPtr] !== undefined)
    )
      s = variantFrom(value, keep, cleanup);
    else if (name === "Foundation.GUID" && typeof value === "string") s = assign(struct(name), guid(value));
    else s = value && value[kBuf] !== undefined ? value : struct(name, value);
    const view: DataView = s[kView];
    switch (size) {
      case 1:
        return view.getUint8(0);
      case 2:
        return view.getUint16(0, true);
      case 4:
        return view.getUint32(0, true);
      case 8:
        return view.getBigUint64(0, true);
    }
    // Larger structs are passed by reference to a caller-owned copy (x64 and arm64 calling conventions).
    const copy = new Uint8Array(s[kBuf]);
    keep.push(copy);
    return ptrOf(copy);
  }
  return toPointer(value, keep);
}

function structReturn(tok: string) {
  if (!isStructToken(tok)) return undefined;
  return structToken(tok);
}

function unpackStruct(name: string, raw: any) {
  const s = struct(name);
  const view: DataView = s[kView];
  switch (s["$size"]) {
    case 1:
      view.setUint8(0, Number(raw));
      break;
    case 2:
      view.setUint16(0, Number(raw), true);
      break;
    case 4:
      view.setUint32(0, Number(raw), true);
      break;
    default:
      view.setBigUint64(0, BigInt.asUintN(64, BigInt(raw)), true);
  }
  return s;
}

// ---- families ----

type FunctionEntry = [string, string[], string[], 0 | 1, string?];

function bindFunction(dll: string, name: string, entry: FunctionEntry) {
  const [ret, argToks, , setLastError, symbol] = entry;
  const address = procAddress(dll, symbol ?? name);
  const sret = structReturn(ret);
  // Non-member functions return 1/2/4/8-byte structs in RAX and larger ones through a hidden first pointer.
  const hidden = sret !== undefined && ![1, 2, 4, 8].includes(sret.size);
  const args = argToks.map(ffiType);
  if (hidden) args.unshift("ptr");
  const fn = CFunction({ ptr: address, args, returns: hidden ? "ptr" : ffiType(ret) } as any);
  const count = argToks.length;
  const simple = !hidden && sret === undefined && argToks.every(t => /^(?:[iu](?:8|16|32)|f32|f64|bool|p)$/.test(t));
  const getLastError = setLastError ? sys().k32.GetLastError : undefined;
  let wrapper: (...a: any[]) => any;
  if (simple) {
    wrapper = function (...input: any[]) {
      const keep: any[] = [];
      for (let i = 0; i < count; i++) input[i] = convertArg(argToks[i], input[i], keep, keep);
      const result = fn(...input.slice(0, count));
      if (getLastError) lastErrorValue = getLastError();
      return result;
    };
  } else {
    wrapper = function (...input: any[]) {
      const keep: any[] = [];
      const cleanup: (() => void)[] = [];
      const native: any[] = [];
      let out: any;
      if (hidden) {
        out = struct(sret!.name);
        native.push(ptrOf(out[kBuf]));
      }
      try {
        for (let i = 0; i < count; i++) native.push(convertArg(argToks[i], input[i], keep, cleanup));
        let result = fn(...native);
        if (getLastError) lastErrorValue = getLastError();
        if (hidden) return out;
        if (sret !== undefined) return unpackStruct(sret.name, result);
        return result;
      } finally {
        for (const f of cleanup) f();
      }
    };
  }
  Object.defineProperty(wrapper, "name", { value: name });
  return wrapper;
}

function defineFamily(json: any, md?: Metadata) {
  if (md !== undefined) setMetadata(md);
  const { dll, functions, namespaces } = json;
  const target: any = Object.create(null);
  const define = (key: string, entryName: string) => {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get() {
        const fn = bindFunction(dll, entryName, functions[entryName]);
        Object.defineProperty(target, key, { value: fn, enumerable: true, configurable: true, writable: false });
        return fn;
      },
    });
  };
  for (const name of Object.keys(functions)) define(name, name);
  for (const name of Object.keys(functions)) {
    if (
      name.endsWith("W") &&
      functions[name.slice(0, -1) + "A"] !== undefined &&
      functions[name.slice(0, -1)] === undefined
    )
      define(name.slice(0, -1), name);
  }
  let constants: Record<string, unknown> | undefined;
  const loadConstants = () => {
    if (constants === undefined) {
      constants = Object.create(null);
      for (const ns of namespaces as string[]) {
        const data = getMetadata().namespace(ns);
        if (!data) continue;
        for (const [k, v] of Object.entries(data.consts ?? {})) if (!(k in constants!)) constants![k] = constValue(v);
        for (const e of Object.values(data.enums ?? {}) as any[])
          for (const [k, v] of Object.entries(e.v)) if (!(k in constants!)) constants![k] = constValue(v);
      }
    }
    return constants!;
  };
  Object.defineProperties(target, {
    dll: { value: dll },
    family: { value: json.family },
    namespaces: { value: Object.freeze([...namespaces]) },
    constants: { get: loadConstants },
    struct: { value: struct },
    sizeof: { value: sizeof },
  });
  return target;
}

function constValue(v: unknown) {
  return Array.isArray(v) ? BigInt(v[0] as string) : v;
}

function constant(name: string, ns?: string) {
  const md = getMetadata();
  const spaces = ns ? [ns] : ((md.manifest as any)?.namespaces ?? []);
  for (const space of spaces) {
    const data = md.namespace(space);
    if (!data) continue;
    if (data.consts && name in data.consts) return constValue(data.consts[name]);
    for (const e of Object.values(data.enums ?? {}) as any[]) if (name in e.v) return constValue(e.v[name]);
  }
  return undefined;
}

function namespaceData(name: string) {
  return getMetadata().namespace(name.startsWith("Windows.Win32.") ? name.slice(14) : name);
}

// ---- COM ----

type IfaceInfo = { full: string; iid?: string; methods: any[]; proto: any };
const interfaces = new Map<string, IfaceInfo>();

function interfaceInfo(type: string): IfaceInfo {
  let info = interfaces.get(type);
  if (info !== undefined) return info;
  const { full, entry } = lookup("interfaces", type);
  info = interfaces.get(full);
  if (info === undefined) {
    const base = entry.b ? interfaceInfo(entry.b) : undefined;
    const methods = [...(base?.methods ?? []), ...entry.m];
    info = { full, iid: entry.g, methods, proto: undefined };
    interfaces.set(full, info);
    const proto = Object.create(base ? base.proto : ComObject.prototype);
    for (let slot = base?.methods.length ?? 0; slot < methods.length; slot++) {
      const sig = methods[slot];
      if (Object.hasOwn(proto, sig[0])) continue;
      const method = comMethod(full, slot, sig);
      Object.defineProperty(proto, sig[0], { value: method, configurable: true, writable: true });
    }
    Object.defineProperty(proto, "$interface", { value: full });
    info.proto = proto;
  }
  interfaces.set(type, info);
  return info;
}

const comFunctions = new Map<string, any>();

function comFunction(address: number, args: string[], returns: string) {
  const key = `${address}:${args.join(",")}:${returns}`;
  let fn = comFunctions.get(key);
  if (fn === undefined) {
    fn = CFunction({ ptr: address, args, returns } as any);
    comFunctions.set(key, fn);
  }
  return fn;
}

function comMethod(iface: string, slot: number, sig: any[]) {
  const [name, ret, ...rawArgs] = sig;
  const retvalAt = rawArgs.length && rawArgs[rawArgs.length - 1][0] === "@" ? rawArgs.length - 1 : -1;
  const argToks: string[] = rawArgs.map((t: string) => (t[0] === "@" ? t.slice(1) : t));
  const sret = structReturn(ret);
  // C++ member functions always return structs through a hidden pointer placed after `this`.
  const nativeArgs = ["ptr", ...(sret ? ["ptr"] : []), ...argToks.map(ffiType)];
  const returns = sret ? "ptr" : ffiType(ret);
  const where = `${iface.slice(iface.lastIndexOf(".") + 1)}.${name}`;
  const method = function (this: any, ...input: any[]) {
    const self = this[kPtr];
    if (!self) throw new Error(`${where}: the COM object was released`);
    const vtbl = read.ptr(self, 0);
    const fn = comFunction(read.ptr(vtbl, slot * 8), nativeArgs, returns);
    const keep: any[] = [];
    const cleanup: (() => void)[] = [];
    const native: any[] = [self];
    let out: any;
    if (sret) {
      out = struct(sret.name);
      native.push(ptrOf(out[kBuf]));
    }
    const useRetval = retvalAt >= 0 && input.length <= retvalAt;
    let retBuf: Uint8Array | undefined;
    try {
      for (let i = 0; i < argToks.length; i++) {
        if (i === retvalAt && useRetval) {
          const inner = argToks[i].slice(1);
          retBuf = new Uint8Array(Math.max(8, tokenSize(inner)));
          native.push(ptrOf(retBuf));
        } else native.push(convertArg(argToks[i], input[i], keep, cleanup));
      }
      const result = fn(...native);
      if (sret) return out;
      if (ret === "hr" && result < 0) throw new Win32Error(result, where);
      if (retBuf !== undefined) return retvalValue(argToks[retvalAt].slice(1), retBuf);
      return result;
    } finally {
      for (const f of cleanup) f();
    }
  };
  Object.defineProperty(method, "name", { value: name });
  return method;
}

function retvalValue(tok: string, buf: Uint8Array) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (tok.startsWith("i:")) {
    const p = pointerAt(view, 0);
    return p ? wrapCom(p, tok.slice(2)) : null;
  }
  if (tok === "w") {
    const p = pointerAt(view, 0);
    const s = readWide(p);
    if (p) ole().ole.CoTaskMemFree(p);
    return s;
  }
  if (tok === "b") {
    const p = pointerAt(view, 0);
    const s = readBstr(p);
    if (p) ole().aut.SysFreeString(p);
    return s;
  }
  if (isStructToken(tok)) {
    const { name } = structToken(tok);
    const s = assign(struct(name), buf);
    return name === "System.Variant.VARIANT" ? variantValue(s) : s;
  }
  return readScalar(view, 0, tok);
}

const released = new FinalizationRegistry<number>(p => comRelease(p));

function comAddRef(p: number) {
  const vtbl = read.ptr(p, 0);
  return comFunction(read.ptr(vtbl, 8), ["ptr"], "u32")(p);
}

function comRelease(p: number) {
  const vtbl = read.ptr(p, 0);
  return comFunction(read.ptr(vtbl, 16), ["ptr"], "u32")(p);
}

class ComObject {
  get ["$ptr"](): number {
    return this[kPtr];
  }
  as(type: string) {
    const info = interfaceInfo(type);
    if (!info.iid) throw new Error(`${info.full} has no IID`);
    const out = new BigUint64Array(1);
    const vtbl = read.ptr(this[kPtr], 0);
    const hr = comFunction(read.ptr(vtbl, 0), ["ptr", "ptr", "ptr"], "i32")(this[kPtr], guid(info.iid), out);
    if (hr < 0) throw new Win32Error(hr, `QueryInterface(${info.full})`);
    return wrapCom(Number(out[0]), info.full);
  }
  release() {
    const p = this[kPtr];
    if (!p) return 0;
    this[kPtr] = 0;
    released.unregister(this);
    return comRelease(p);
  }
  [Symbol.dispose]() {
    this.release();
  }
}

// Takes ownership of one reference (the one an out parameter or CoCreateInstance handed back).
function wrapCom(address: number | bigint, type: string) {
  const p = Number(address);
  if (!p) return null;
  const info = interfaceInfo(type);
  const obj = Object.create(info.proto);
  obj[kPtr] = p;
  released.register(obj, p, obj);
  return obj;
}

function comInitialize() {
  const c = ole();
  if (!c.comInit) {
    // MTA; RPC_E_CHANGED_MODE when the thread is already STA (bun:winui) is fine for in-process servers.
    c.ole.CoInitializeEx(null, 0);
    c.comInit = true;
  }
}

function clsidOf(name: string) {
  if (GUID_RE.test(name)) return name;
  const { ns, name: short } = name.includes(".") ? splitName(name) : { ns: undefined, name };
  const md = getMetadata();
  const spaces = ns ? [ns] : ((md.manifest as any)?.namespaces ?? []);
  for (const space of spaces) {
    const id = md.namespace(space)?.clsids?.[short];
    if (id) return id;
  }
  throw $ERR_INVALID_ARG_VALUE("clsid", name, "is not a known coclass or GUID");
}

function comCreate(clsid: string, type: string, context = 0x17) {
  comInitialize();
  const info = interfaceInfo(type);
  if (!info.iid) throw new Error(`${info.full} has no IID`);
  const out = new BigUint64Array(1);
  const hr = ole().ole.CoCreateInstance(guid(clsidOf(clsid)), null, context, guid(info.iid), out);
  if (hr < 0) throw new Win32Error(hr, `CoCreateInstance(${clsid})`);
  return wrapCom(out[0], info.full);
}

function check(hr: number, where = "call") {
  if (hr < 0) throw new Win32Error(hr, where);
  return hr;
}

const comDelegateNative = $newRustFunction("windows/com.rs", "jsComDelegate", 3);
let liveDelegates = 0;
let delegateKeepAlive: any;

// A COM object implementing one callback interface (IUnknown + Invoke at slot 3), callable from any
// thread. `handler(a, b, c, d)` runs on the JS thread with the raw Invoke arguments; those flagged in
// `interfaces` are owned references released after the handler returns. Returns the address of the
// delegate with one reference owned by the caller.
function comDelegate(iid: string | Uint8Array, handler: (...args: number[]) => unknown, interfaces = 0) {
  if (!$isCallable(handler)) throw $ERR_INVALID_ARG_TYPE("handler", "function", handler);
  const iidBytes = typeof iid === "string" ? guid(iid) : iid;
  let cb: any;
  cb = new JSCallback(
    (self: number | null, a: number, b: number, c: number, d: number) => {
      if (!self) {
        // Last Release: no further Invoke can reach this callback.
        const closing = cb;
        cb = undefined;
        if (--liveDelegates === 0 && delegateKeepAlive !== undefined) {
          clearInterval(delegateKeepAlive);
          delegateKeepAlive = undefined;
        }
        setImmediate(() => closing.close());
        return 0;
      }
      const args = [a, b, c, d];
      try {
        handler.$apply(undefined, args);
      } finally {
        for (let i = 0; i < 4; i++) if (interfaces & (1 << i) && args[i]) comRelease(args[i]);
        comRelease(self);
      }
      return 0;
    },
    { args: ["ptr", "u64_fast", "u64_fast", "u64_fast", "u64_fast"], returns: "i32", threadsafe: true },
  );
  const address = comDelegateNative(ptrOf(iidBytes), cb.ptr, interfaces);
  if (liveDelegates++ === 0) delegateKeepAlive = setInterval(() => {}, 0x7fffffff);
  return address as number;
}

const com = Object.freeze({
  initialize: comInitialize,
  delegate: comDelegate,
  create: comCreate,
  wrap: wrapCom,
  addRef: comAddRef,
  release: comRelease,
  iid(type: string) {
    return interfaceInfo(type).iid;
  },
  clsid: clsidOf,
});

export default {
  defineFamily,
  setMetadata,
  get metadata() {
    return getMetadata();
  },
  struct,
  structAt,
  sizeof,
  constant,
  namespace: namespaceData,
  callback,
  com,
  guid,
  guidString,
  wstr,
  readWide,
  readAnsi,
  readBstr,
  variant(value: any) {
    return variantFrom(value, [], []);
  },
  variantValue,
  lastError,
  check,
  Win32Error,
};
