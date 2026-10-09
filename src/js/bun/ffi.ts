const FFIType = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  "11": 11,
  "12": 12,
  "13": 13,
  "14": 14,
  "15": 15,
  "16": 16,
  "17": 17,
  bool: 11,
  c_int: 5,
  c_uint: 6,
  char: 0,
  "char*": 12,
  double: 9,
  f32: 10,
  f64: 9,
  float: 10,
  i16: 3,
  i32: 5,
  i64: 7,
  i8: 1,
  int: 5,
  int16_t: 3,
  int32_t: 5,
  int64_t: 7,
  int8_t: 1,
  isize: 7,
  u16: 4,
  u32: 6,
  u64: 8,
  u8: 2,
  uint16_t: 4,
  uint32_t: 6,
  uint64_t: 8,
  uint8_t: 2,
  usize: 8,
  size_t: 8,
  "void*": 12,
  ptr: 12,
  pointer: 12,
  void: 13,
  cstring: 14,
  i64_fast: 15,
  u64_fast: 16,
  function: 17,
  callback: 17,
  fn: 17,
  napi_env: 18,
  napi_value: 19,
  buffer: 20,
  buffer_length: 21,
  buffer_bytelength: 21,
};

const suffix = process.platform === "win32" ? "dll" : process.platform === "darwin" ? "dylib" : "so";

var ffi = globalThis.Bun.FFI;
const ptr = (arg1, arg2) => (typeof arg2 === "undefined" ? ffi.ptr(arg1) : ffi.ptr(arg1, arg2));
const toBuffer = ffi.toBuffer;
const toArrayBuffer = ffi.toArrayBuffer;
const nativeViewSource = ffi.viewSource;

const nativeLinkSymbols = ffi.linkSymbols;
const nativeDLOpen = ffi.dlopen;
const nativeCallback = ffi.callback;
const closeCallback = ffi.closeCallback;
const nativeCFunction = ffi.cfunction;
delete ffi.callback;
delete ffi.closeCallback;
delete ffi.cfunction;

class JSCallback {
  declare readonly ptr: number | null;

  constructor(cb, options) {
    const cell = nativeCallback(options, cb);
    if (Error.isError(cell)) throw cell;
    Object.setPrototypeOf(cell, (new.target ?? JSCallback).prototype);
    return cell;
  }

  [Symbol.toPrimitive]() {
    const { ptr } = this;
    return typeof ptr === "number" ? ptr : 0;
  }

  close() {
    if (!(this instanceof JSCallback)) {
      throw new TypeError("JSCallback.prototype.close called on an incompatible receiver");
    }
    closeCallback(this);
  }

  [Symbol.dispose]() {
    this.close();
  }
}

const CString = ffi.CString;

function toCString(v) {
  return v ? new CString(v) : null;
}

function FFIBuilder(params, functionToCall, name) {
  // variadic arguments can be expensive
  // most FFI functions are going to be < 5 arguments
  // so we just inline it
  var wrap;
  switch (params.length) {
    case 0:
      wrap = () => toCString(functionToCall());
      break;
    case 1:
      wrap = arg1 => toCString(functionToCall(arg1));
      break;
    case 2:
      wrap = (arg1, arg2) => toCString(functionToCall(arg1, arg2));
      break;
    case 3:
      wrap = (arg1, arg2, arg3) => toCString(functionToCall(arg1, arg2, arg3));
      break;
    case 4:
      wrap = (arg1, arg2, arg3, arg4) => toCString(functionToCall(arg1, arg2, arg3, arg4));
      break;
    case 5:
      wrap = (arg1, arg2, arg3, arg4, arg5) => toCString(functionToCall(arg1, arg2, arg3, arg4, arg5));
      break;
    case 6:
      wrap = (arg1, arg2, arg3, arg4, arg5, arg6) => toCString(functionToCall(arg1, arg2, arg3, arg4, arg5, arg6));
      break;
    case 7:
      wrap = (arg1, arg2, arg3, arg4, arg5, arg6, arg7) =>
        toCString(functionToCall(arg1, arg2, arg3, arg4, arg5, arg6, arg7));
      break;
    case 8:
      wrap = (arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) =>
        toCString(functionToCall(arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8));
      break;
    case 9:
      wrap = (arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) =>
        toCString(functionToCall(arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9));
      break;
    default: {
      wrap = (...args) => toCString(functionToCall(...args));
      break;
    }
  }
  Object.defineProperty(wrap, "name", {
    value: name,
  });
  wrap.native = functionToCall;
  wrap.ptr = functionToCall.ptr;
  return wrap;
}

const native = {
  dlopen: nativeDLOpen,
  callback: () => {
    throw new Error("Deprecated. Use new JSCallback(options, fn) instead");
  },
};

const ccFn = $newRustFunction("ffi.rs", "Bun__FFI__cc", 1);

function normalizePath(path: string | URL | Bun.BunFile | undefined) {
  if (typeof path === "string" && path?.startsWith?.("file:")) {
    // import.meta.url returns a file: URL
    // https://github.com/oven-sh/bun/issues/10304
    path = Bun.fileURLToPath(path);
  } else if (typeof path === "object" && path) {
    if (path instanceof URL) {
      // This is mostly for import.meta.resolve()
      // https://github.com/oven-sh/bun/issues/10304
      path = Bun.fileURLToPath(path as URL);
    } else if ($inheritsBlob(path)) {
      // must be a Bun.file() blob
      // https://discord.com/channels/876711213126520882/1230114905898614794/1230114905898614794
      path = path.name;
    }
  }

  return path;
}

// Structs/unions by value, `long double` and variadic prototypes cannot be
// called by the engine's FFI trampolines. Those symbols are opened as plain
// addresses and called through a TinyCC shim (`cc({ code })`) compiled with
// the exact C prototype; aggregates cross the JS boundary as byte buffers.

const C_SCALAR_TYPES = {
  0: "signed char",
  1: "signed char",
  2: "unsigned char",
  3: "short",
  4: "unsigned short",
  5: "int",
  6: "unsigned int",
  7: "long long",
  8: "unsigned long long",
  9: "double",
  10: "float",
  11: "_Bool",
  12: "void*",
  13: "void",
  14: "char*",
  15: "long long",
  16: "unsigned long long",
  17: "void*",
  20: "void*",
};

const C_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isLongDouble(type) {
  return type === "long double" || type === "f80";
}

function isAggregate(type) {
  return $isObject(type) && (type.struct !== undefined || type.union !== undefined);
}

function needsShim(desc) {
  if (!$isObject(desc)) return false;
  if (desc.fixedArgs !== undefined) return true;
  const ret = desc.returns;
  if (isAggregate(ret) || isLongDouble(ret)) return true;
  const args = desc.args;
  if (!$isJSArray(args)) return false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (isAggregate(arg) || isLongDouble(arg) || ($isObject(arg) && arg.array !== undefined)) return true;
  }
  return false;
}

function scalarCType(type, where) {
  if (isLongDouble(type)) return "long double";
  const id = typeof type === "number" ? type : FFIType[type];
  const c = id === undefined ? undefined : C_SCALAR_TYPES[id];
  if (c === undefined || (where === "field" && c === "void")) {
    throw new TypeError(`Unsupported FFI type in ${where}: ${String(type)}`);
  }
  return c;
}

class ShimBuilder {
  declarations: string[] = [];
  layoutFns: string[] = [];
  aggregates = new Map();

  aggregate(type) {
    const cached = this.aggregates.get(type);
    if (cached) return cached.name;
    const isUnion = type.union !== undefined;
    const fields = isUnion ? type.union : type.struct;
    if (!$isObject(fields)) throw new TypeError("FFI struct/union fields must be an object of { name: type }");
    const fieldNames = Object.keys(fields);
    if (fieldNames.length === 0) throw new TypeError("FFI struct/union must have at least one field");
    const lines: string[] = [];
    for (const field of fieldNames) {
      if (!C_IDENTIFIER.test(field)) throw new TypeError(`Invalid FFI struct field name: ${field}`);
      lines.push(`  ${this.fieldDecl(fields[field], field)};`);
    }
    // Nested aggregates are registered while visiting the fields, so the name is taken afterwards.
    const name = `bun_ffi_t${this.aggregates.size}`;
    this.declarations.push(`typedef ${isUnion ? "union" : "struct"} {\n${lines.join("\n")}\n} ${name};`);
    const offsets = fieldNames.map((f, i) => `  out[${i + 2}] = (unsigned long long)&((${name}*)0)->${f};`);
    this.layoutFns.push(
      `void ${name}_layout(unsigned long long* out) {\n  out[0] = sizeof(${name});\n  out[1] = _Alignof(${name});\n${offsets.join("\n")}\n}`,
    );
    this.aggregates.set(type, { name, fields: fieldNames });
    return name;
  }

  fieldDecl(type, field) {
    if ($isObject(type) && type.array !== undefined) {
      const length = type.length;
      if (typeof length !== "number" || !(length > 0) || Math.trunc(length) !== length) {
        throw new TypeError("FFI array fields need a positive integer length");
      }
      return `${this.cType(type.array, "field")} ${field}[${length}]`;
    }
    return `${this.cType(type, "field")} ${field}`;
  }

  cType(type, where) {
    if (isAggregate(type)) return this.aggregate(type);
    if ($isObject(type) && type.array !== undefined) {
      throw new TypeError(`FFI arrays are only supported as struct fields (${where})`);
    }
    return scalarCType(type, where);
  }
}

function bindShimSymbols(options, nativeResult) {
  const builder = new ShimBuilder();
  const code: string[] = [];
  const shimSymbols = {};
  const plans = {};

  for (const name in options) {
    const desc = options[name];
    if (!needsShim(desc)) continue;
    if (!C_IDENTIFIER.test(name)) throw new TypeError(`Invalid FFI symbol name: ${name}`);
    const args = desc.args ?? [];
    const ret = desc.returns ?? "void";
    const fixed = desc.fixedArgs;
    if (
      fixed !== undefined &&
      (typeof fixed !== "number" || fixed < 0 || fixed > args.length || Math.trunc(fixed) !== fixed)
    ) {
      throw new TypeError(`fixedArgs for ${name} must be an integer between 0 and args.length`);
    }

    const retC = builder.cType(ret, "return type");
    const retAggregate = isAggregate(ret);
    const params: string[] = [];
    const protoParams: string[] = [];
    const callArgs: string[] = [];
    const shimArgs: unknown[] = [];
    const argAggregates: (string | null)[] = [];
    if (retAggregate) {
      params.push("void* bun_ret");
      shimArgs.push("ptr");
    }
    for (let i = 0; i < args.length; i++) {
      const type = args[i];
      const c = builder.cType(type, `argument ${i}`);
      if (c === "void") throw new TypeError(`void is not a valid FFI argument type (${name})`);
      if (isAggregate(type)) {
        params.push(`${c}* a${i}`);
        callArgs.push(`*a${i}`);
        shimArgs.push("ptr");
        argAggregates.push(c);
      } else if (isLongDouble(type)) {
        params.push(`double a${i}`);
        callArgs.push(`(long double)a${i}`);
        shimArgs.push("f64");
        argAggregates.push(null);
      } else {
        params.push(`${c} a${i}`);
        callArgs.push(`a${i}`);
        shimArgs.push(type);
        argAggregates.push(null);
      }
      if (fixed === undefined || i < fixed) protoParams.push(c);
    }
    if (fixed !== undefined) protoParams.push("...");
    if (protoParams.length === 0) protoParams.push("void");

    const target = nativeResult.symbols[name].ptr;
    const address = (typeof target === "bigint" ? target : BigInt(Math.trunc(target))).toString(16);
    const call = `((${retC} (*)(${protoParams.join(", ")}))(void*)0x${address}ULL)(${callArgs.join(", ")})`;
    let body;
    let shimRetC;
    let shimReturns;
    if (retAggregate) {
      body = `*(${retC}*)bun_ret = ${call};`;
      shimRetC = "void";
      shimReturns = "void";
    } else if (retC === "void") {
      body = `${call};`;
      shimRetC = "void";
      shimReturns = "void";
    } else if (isLongDouble(ret)) {
      body = `return (double)${call};`;
      shimRetC = "double";
      shimReturns = "f64";
    } else {
      body = `return ${call};`;
      shimRetC = retC;
      shimReturns = ret;
    }
    code.push(`${shimRetC} bun_shim_${name}(${params.length ? params.join(", ") : "void"}) {\n  ${body}\n}`);
    shimSymbols[`bun_shim_${name}`] = { args: shimArgs, returns: shimReturns };
    plans[name] = { argAggregates, ret: retAggregate ? retC : null };
  }

  for (const { name } of builder.aggregates.values()) {
    shimSymbols[`${name}_layout`] = { args: ["ptr"], returns: "void" };
  }

  const source = [...builder.declarations, ...builder.layoutFns, ...code].join("\n\n") + "\n";
  const shim = cc({ code: source, symbols: shimSymbols });

  const layouts = new Map();
  for (const { name, fields } of builder.aggregates.values()) {
    const out = new BigUint64Array(fields.length + 2);
    shim.symbols[`${name}_layout`](out);
    const offsets = {};
    for (let i = 0; i < fields.length; i++) offsets[fields[i]] = Number(out[i + 2]);
    layouts.set(name, { size: Number(out[0]), align: Number(out[1]), offsets });
  }

  for (const name in plans) {
    const plan = plans[name];
    const fn = shim.symbols[`bun_shim_${name}`];
    const argLayouts = plan.argAggregates.map(n => (n === null ? null : layouts.get(n)));
    const retLayout = plan.ret === null ? null : layouts.get(plan.ret);
    const checkArgs = args => {
      for (let i = 0; i < argLayouts.length; i++) {
        const layout = argLayouts[i];
        if (layout === null) continue;
        const value = args[i];
        if (!ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer)) {
          throw new TypeError(
            `${name}: argument ${i} must be a TypedArray, DataView or ArrayBuffer holding the struct`,
          );
        }
        if (value.byteLength < layout.size) {
          throw new RangeError(`${name}: argument ${i} needs ${layout.size} bytes, got ${value.byteLength}`);
        }
      }
    };
    let wrapped;
    if (retLayout !== null) {
      wrapped = function (...args) {
        checkArgs(args);
        const out = new Uint8Array(retLayout.size);
        fn(out, ...args);
        return out;
      };
    } else {
      wrapped = function (...args) {
        checkArgs(args);
        return fn(...args);
      };
    }
    Object.defineProperty(wrapped, "name", { value: name });
    wrapped.native = fn;
    wrapped.ptr = nativeResult.symbols[name].ptr;
    wrapped.layouts = { args: argLayouts, returns: retLayout };
    nativeResult.symbols[name] = wrapped;
  }

  const closeNative = nativeResult.close;
  nativeResult.close = function () {
    shim.close();
    return closeNative();
  };
}

function dlopen(path, options, loadOptions?) {
  path = normalizePath(path);

  let nativeOptions = options;
  let hasShims = false;
  if ($isObject(options)) {
    for (const name in options) {
      if (needsShim(options[name])) {
        if (!hasShims) nativeOptions = { ...options };
        hasShims = true;
        nativeOptions[name] = { args: [], returns: "void" };
      }
    }
  }

  // `{ global: true }` opens with RTLD_NOW | RTLD_GLOBAL (one shared libpython for Bun and PyO3 extensions).
  const result = nativeDLOpen(path, nativeOptions, !!(loadOptions && loadOptions.global));
  if (Error.isError(result)) throw result;

  // Bind it because it's a breaking change to not do so
  // Previously, it didn't need to be bound
  result.close = result.close.bind(result);

  if (hasShims) {
    try {
      bindShimSymbols(options, result);
    } catch (e) {
      result.close();
      throw e;
    }
  }

  return result;
}

function cc(options) {
  if (!$isObject(options)) {
    throw new Error("Expected options to be an object");
  }

  let path = options?.source;
  if (!path) {
    if (typeof options?.code !== "string") {
      throw new Error("Expected source to be a string to a file path, or code to be a string of C source");
    }
    path = "<inline>";
  } else {
    if ($isJSArray(path)) {
      for (let i = 0; i < path.length; i++) {
        path[i] = normalizePath(path[i]);
      }
    } else {
      path = normalizePath(path);
    }
    options.source = path;
  }

  const result = ccFn(options);
  if (Error.isError(result)) throw result;

  for (let key in result.symbols) {
    var symbol = result.symbols[key];
    const desc = options.symbols?.[key];
    if (FFIType[desc?.returns as string] === FFIType.cstring) {
      result.symbols[key] = FFIBuilder(
        desc.args ?? [],
        symbol,
        // in stacktraces:
        // instead of
        //    "/usr/lib/sqlite3.so"
        // we want
        //    "sqlite3_get_version() - sqlit3.so"
        typeof path === "string" && path.includes("/") ? `${key} (${path.split("/").pop()})` : `${key} (${path})`,
      );
    } else {
      // consistentcy
      result.symbols[key].native = result.symbols[key];
    }
  }

  // Bind it because it's a breaking change to not do so
  // Previously, it didn't need to be bound
  result.close = result.close.bind(result);

  return result;
}

function viewSource(symbols, isCallback?) {
  const result = nativeViewSource(symbols, isCallback);
  if (Error.isError(result)) throw result;
  return result;
}

function linkSymbols(options) {
  const result = nativeLinkSymbols(options);
  if (Error.isError(result)) throw result;
  return result;
}

var cFunctionI = 0;
function closeJSCFFICFunction() {}
function CFunction(options) {
  const identifier = `CFunction${cFunctionI++}`;

  const fn = nativeCFunction(options, identifier);
  if (Error.isError(fn)) throw fn;
  fn.close = closeJSCFFICFunction;
  return fn;
}

const read = ffi.read;

export default {
  CFunction,
  CString,
  FFIType,
  JSCallback,
  dlopen,
  linkSymbols,
  native,
  ptr,
  read,
  suffix,
  toArrayBuffer,
  toBuffer,
  viewSource,
  cc,
};
