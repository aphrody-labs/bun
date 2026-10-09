// Windows Runtime core for the bun:windows WinRT families (@aphrody/bun-windows-winrt-<namespace>).
// Activation goes through combase RoGetActivationFactory; methods are called through the COM vtable with bun:ffi.
const { dlopen, CFunction, read, ptr, toArrayBuffer } = require("bun:ffi");

const combase = dlopen("combase.dll", {
  RoInitialize: { args: ["u32"], returns: "i32" },
  RoGetActivationFactory: { args: ["ptr", "ptr", "ptr"], returns: "i32" },
  WindowsCreateString: { args: ["ptr", "u32", "ptr"], returns: "i32" },
  WindowsDeleteString: { args: ["ptr"], returns: "i32" },
  WindowsGetStringRawBuffer: { args: ["ptr", "ptr"], returns: "ptr" },
}).symbols;

const RPC_E_CHANGED_MODE = 0x80010106 | 0;
let initialized = false;
function init() {
  if (initialized) return;
  const hr = combase.RoInitialize(1);
  if (hr < 0 && hr !== RPC_E_CHANGED_MODE) throw hresultError(hr, "RoInitialize");
  initialized = true;
}

function hresultError(hr, what) {
  const error = new Error(`${what} failed: HRESULT 0x${(hr >>> 0).toString(16).padStart(8, "0")}`);
  error.code = "ERR_WINRT_HRESULT";
  error.hresult = hr >>> 0;
  return error;
}

function check(hr, what) {
  if (hr < 0) throw hresultError(hr, what);
}

function guid(text) {
  const hex = text.replace(/[{}-]/g, "");
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, parseInt(hex.slice(0, 8), 16), true);
  view.setUint16(4, parseInt(hex.slice(8, 12), 16), true);
  view.setUint16(6, parseInt(hex.slice(12, 16), 16), true);
  for (let i = 0; i < 8; i++) bytes[8 + i] = parseInt(hex.slice(16 + i * 2, 18 + i * 2), 16);
  return bytes;
}

function createHString(value) {
  const text = String(value);
  if (text.length === 0) return 0;
  const utf16 = new Uint16Array(text.length);
  for (let i = 0; i < text.length; i++) utf16[i] = text.charCodeAt(i);
  const out = new BigUint64Array(1);
  check(combase.WindowsCreateString(ptr(utf16), text.length, ptr(out)), "WindowsCreateString");
  return Number(out[0]);
}

function readHString(handle, release) {
  if (!handle) return "";
  const length = new Uint32Array(1);
  const raw = combase.WindowsGetStringRawBuffer(handle, ptr(length));
  const text = length[0] && raw ? new TextDecoder("utf-16le").decode(toArrayBuffer(raw, 0, length[0] * 2)) : "";
  if (release) combase.WindowsDeleteString(handle);
  return text;
}

const FFI = {
  bool: "bool",
  char16: "u16",
  i8: "i8",
  u8: "u8",
  i16: "i16",
  u16: "u16",
  i32: "i32",
  u32: "u32",
  i64: "i64",
  u64: "u64",
  f32: "f32",
  f64: "f64",
  isize: "i64",
  usize: "u64",
};

const callCache = new Map();
function vfunc(object, slot, args) {
  const vtable = read.ptr(object, 0);
  const fn = read.ptr(vtable, slot * 8);
  const key = `${fn}:${args.join(",")}`;
  let call = callCache.get(key);
  if (!call) {
    call = CFunction({ ptr: fn, args: ["ptr", ...args], returns: "i32" });
    callCache.set(key, call);
  }
  return call;
}

const registry = { interfaces: new Map(), classes: new Map(), enums: new Map() };
const release = new FinalizationRegistry(object => vfunc(object, 2, [])(object));

function readOut(view, kind, type) {
  switch (kind) {
    case "hstring":
      return readHString(Number(view.getBigUint64(0, true)), true);
    case "iface":
    case "class":
    case "object": {
      const object = Number(view.getBigUint64(0, true));
      return object ? wrap(object, kind === "class" ? registry.classes.get(type)?.defaultInterface : type, type) : null;
    }
    case "prim":
      switch (type) {
        case "bool":
          return view.getUint8(0) !== 0;
        case "i8":
          return view.getInt8(0);
        case "u8":
          return view.getUint8(0);
        case "i16":
          return view.getInt16(0, true);
        case "u16":
        case "char16":
          return view.getUint16(0, true);
        case "i32":
          return view.getInt32(0, true);
        case "u32":
          return view.getUint32(0, true);
        case "i64":
        case "isize":
          return view.getBigInt64(0, true);
        case "u64":
        case "usize":
          return view.getBigUint64(0, true);
        case "f32":
          return view.getFloat32(0, true);
        case "f64":
          return view.getFloat64(0, true);
      }
  }
  throw new TypeError(`unsupported WinRT out kind ${kind}:${type}`);
}

function toPointer(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && typeof value.ptr === "number") return value.ptr;
  throw new TypeError("expected a WinRT object");
}

function invoke(object, method, values) {
  const [name, slot, params, ret] = method;
  if (method[4]) throw new Error(`WinRT method ${name} uses an ABI shape bun:ffi cannot express yet (${method[4]})`);
  const ffiArgs = [];
  const callArgs = [object];
  const outs = [];
  const strings = [];
  let input = 0;
  for (const [direction, kind, type] of params) {
    if (direction === "out") {
      const buffer = new BigUint64Array(1);
      outs.push([new DataView(buffer.buffer), kind, type]);
      ffiArgs.push("ptr");
      callArgs.push(ptr(buffer));
      continue;
    }
    const value = values[input++];
    if (kind === "hstring") {
      const handle = createHString(value);
      strings.push(handle);
      ffiArgs.push("ptr");
      callArgs.push(handle);
    } else if (kind === "prim") {
      ffiArgs.push(FFI[type]);
      callArgs.push(value);
    } else {
      ffiArgs.push("ptr");
      callArgs.push(toPointer(value));
    }
  }
  let retView;
  if (ret) {
    const buffer = new BigUint64Array(1);
    retView = new DataView(buffer.buffer);
    ffiArgs.push("ptr");
    callArgs.push(ptr(buffer));
  }
  try {
    check(vfunc(object, slot, ffiArgs)(...callArgs), name);
  } finally {
    for (const handle of strings) if (handle) combase.WindowsDeleteString(handle);
  }
  const results = outs.map(([view, kind, type]) => readOut(view, kind, type));
  if (ret) {
    const value = readOut(retView, ret[0], ret[1]);
    return results.length ? [value, ...results] : value;
  }
  return results.length === 0 ? undefined : results.length === 1 ? results[0] : results;
}

function queryInterface(object, iid) {
  const out = new BigUint64Array(1);
  check(vfunc(object, 0, ["ptr", "ptr"])(object, ptr(guid(iid)), ptr(out)), "QueryInterface");
  return Number(out[0]);
}

class WinRTObject {
  constructor(object, interfaceName, className) {
    this.ptr = object;
    this.interfaceName = interfaceName;
    this.className = className;
    release.register(this, object);
  }
  as(interfaceName) {
    const desc = registry.interfaces.get(interfaceName);
    if (!desc) throw new Error(`WinRT interface ${interfaceName} is not loaded; require its namespace family first`);
    return wrap(queryInterface(this.ptr, desc.iid), interfaceName, this.className);
  }
  get runtimeClassName() {
    const out = new BigUint64Array(1);
    check(vfunc(this.ptr, 4, ["ptr"])(this.ptr, ptr(out)), "GetRuntimeClassName");
    return readHString(Number(out[0]), true);
  }
}

function bindMethods(target, object, desc) {
  for (const method of desc.methods) {
    const name = method[0];
    const fn = (...values) => invoke(object(), method, values);
    if (!(name in target)) Object.defineProperty(target, name, { value: fn, enumerable: true });
    if (name.startsWith("get_") && method[2].filter(p => p[0] === "in").length === 0) {
      const property = name.slice(4);
      if (!(property in target)) Object.defineProperty(target, property, { get: fn, enumerable: true });
    }
  }
}

function wrap(object, interfaceName, className) {
  const wrapper = new WinRTObject(object, interfaceName, className);
  const desc = interfaceName && registry.interfaces.get(interfaceName);
  if (desc) bindMethods(wrapper, () => wrapper.ptr, desc);
  return wrapper;
}

function activationFactory(className, iid) {
  init();
  const name = createHString(className);
  const out = new BigUint64Array(1);
  try {
    check(combase.RoGetActivationFactory(name, ptr(guid(iid)), ptr(out)), `RoGetActivationFactory(${className})`);
  } finally {
    combase.WindowsDeleteString(name);
  }
  return Number(out[0]);
}

const IACTIVATIONFACTORY = "00000035-0000-0000-c000-000000000046";

function runtimeClass(name, desc) {
  const cls = { className: name };
  const factories = new Map();
  const factory = interfaceName => {
    let object = factories.get(interfaceName);
    if (!object) {
      object = activationFactory(name, registry.interfaces.get(interfaceName).iid);
      factories.set(interfaceName, object);
    }
    return object;
  };
  for (const interfaceName of [...desc.statics, ...desc.factories]) {
    const idesc = registry.interfaces.get(interfaceName);
    if (idesc) bindMethods(cls, () => factory(interfaceName), idesc);
  }
  if (desc.activatable) {
    cls.activate = () => {
      const object = activationFactory(name, IACTIVATIONFACTORY);
      const out = new BigUint64Array(1);
      check(vfunc(object, 6, ["ptr"])(object, ptr(out)), `${name}.ActivateInstance`);
      const instance = wrap(Number(out[0]), undefined, name);
      return desc.defaultInterface ? instance.as(desc.defaultInterface) : instance;
    };
  }
  return Object.freeze(cls);
}

function defineNamespace(data) {
  for (const [name, desc] of Object.entries(data.interfaces)) registry.interfaces.set(name, desc);
  for (const [name, desc] of Object.entries(data.classes)) registry.classes.set(name, desc);
  for (const [name, values] of Object.entries(data.enums)) registry.enums.set(name, values);
  const exports = { namespace: data.namespace };
  for (const [full, values] of Object.entries(data.enums))
    exports[full.slice(data.namespace.length + 1)] = Object.freeze(values);
  for (const [full, desc] of Object.entries(data.classes)) {
    let cached;
    Object.defineProperty(exports, full.slice(data.namespace.length + 1), {
      get: () => (cached ??= runtimeClass(full, desc)),
      enumerable: true,
    });
  }
  exports.interfaces = Object.freeze(Object.fromEntries(Object.entries(data.interfaces).map(([k, v]) => [k, v.iid])));
  return exports;
}

module.exports = { defineNamespace, activationFactory, createHString, readHString, guid, wrap, registry, init };
