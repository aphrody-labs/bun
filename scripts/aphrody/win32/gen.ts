// Generates every Win32 family of bun:windows from win32metadata (Windows.Win32.winmd):
//   bun scripts/aphrody/win32/gen.ts [--winmd <path>] [--check] [family ...]
// One package per DLL, packages/bun-windows-<family> (family.json + index.js + index.d.ts), loaded lazily by
// windows.family(name); types, enums, constants, callbacks and COM interfaces go per namespace into
// packages/bun-windows-win32/ns/<Namespace>.json, read on first use. Manifest: packages/bun-windows-win32/manifest.json.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import winmd, { type TypeSig } from "../../../src/js/internal/winmd.ts";

const { Winmd, Tables: T, guidFromArgs } = winmd;
const repo = join(import.meta.dir, "..", "..", "..");
const packages = join(repo, "packages");
const METADATA_PACKAGE = "Microsoft.Windows.SDK.Win32Metadata";
const METADATA_VERSION = "71.0.30-preview";

const argv = process.argv.slice(2);
const option = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv.splice(i, 2)[1] : undefined;
};
const check = argv.includes("--check");
const wanted = argv.filter(a => !a.startsWith("--"));

export function locateWinmd(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.BUN_WIN32_WINMD,
    "C:/forks/win32metadata/bin/Windows.Win32.winmd",
    join(homedir(), ".nuget/packages", METADATA_PACKAGE.toLowerCase(), METADATA_VERSION, "Windows.Win32.winmd"),
    "C:/forks/windows-rs/crates/libs/default/Windows.Win32.winmd",
  ].filter(Boolean) as string[];
  const found = candidates.find(p => existsSync(p));
  if (!found)
    throw new Error(
      `Windows.Win32.winmd not found; build C:\\forks\\win32metadata or restore ${METADATA_PACKAGE} ${METADATA_VERSION}`,
    );
  return found;
}

const PRIM_SIZE: Record<string, number> = {
  bool: 1,
  i8: 1,
  u8: 1,
  char16: 2,
  i16: 2,
  u16: 2,
  i32: 4,
  u32: 4,
  f32: 4,
  i64: 8,
  u64: 8,
  f64: 8,
  isize: 8,
  usize: 8,
};
const X64 = 2;

type Layout = { size: number; align: number; forced?: number };
// __declspec(align(N)) is not in this metadata; values from win32metadata AlignmentAttribute (x64). Not reduced by #pragma pack.
// Trailing arrays declared [1] in the metadata but [0]/[] in the headers (no FlexibleArray attribute).
const ZERO_LENGTH_TAIL = new Set([
  "ACTIVATION_CONTEXT_COMPATIBILITY_INFORMATION",
  "WMIREGINFOW",
  "WMIREGINFOA",
  "EVENTSFORLOGFILE",
  "MIDL_FORMAT_STRING",
  "IMAGE_POLICY_METADATA",
  "PACKEDEVENTINFO",
]);

const FORCED_ALIGN: Record<string, number> = {
  M128A: 16,
  MEMORY_BASIC_INFORMATION64: 16,
  SLIST_ENTRY: 16,
  SLIST_HEADER: 16,
  MINIDUMP_THREAD_CALLBACK: 16,
  MINIDUMP_THREAD_EX_CALLBACK: 16,
  MINIDUMP_CALLBACK_INPUT: 16,
  WHEA128A: 16,
  WHV_UINT128: 16,
  WHV_X64_SVM_NESTED_STATE: 4096,
  WHV_X64_VMX_NESTED_STATE: 4096,
  GENERAL_LOOKASIDE: 64,
  IRP: 16,
  DEVICE_OBJECT: 16,
  ARM64_NT_CONTEXT: 16,
  ARM64EC_NT_CONTEXT: 16,
  DNS_QUERY_CANCEL: 8,
  DNS_QUERY_RAW_CANCEL: 8,
};
type NsData = {
  structs: Record<string, { s: number; a: number; u?: 1; x?: 1; f: [string, string, number][] }>;
  enums: Record<string, { t: string; v: Record<string, number | string[]> }>;
  consts: Record<string, number | string | string[]>;
  guids: Record<string, string>;
  clsids: Record<string, string>;
  callbacks: Record<string, { r: string; a: string[] }>;
  interfaces: Record<string, { g?: string; b?: string; m: unknown[][] }>;
};

export function generate(path: string) {
  const md = new Winmd(new Uint8Array(readFileSync(path)));
  const short = (ns: string, name: string) => (ns.startsWith("Windows.Win32.") ? ns.slice(14) : ns) + "." + name;

  const supportsX64 = (table: number, row: number): boolean => {
    const arch = md.attributes(table, row).find(a => a.name === "SupportedArchitecture");
    if (arch) return (Number(arch.args[0]) & X64) !== 0;
    const outer = table === T.TypeDef ? md.enclosing(row) : undefined;
    return outer ? supportsX64(T.TypeDef, outer) : true;
  };

  // Full name -> TypeDef row, preferring the x64 variant of architecture-specific types.
  const rows = new Map<string, number>();
  for (let r = 1; r <= md.count(T.TypeDef); r++) {
    const full = md.fullName(T.TypeDef, r);
    if (supportsX64(T.TypeDef, r)) rows.set(full, r);
  }
  const rowOf = (ns: string, name: string) => rows.get(ns ? `${ns}.${name}` : name);

  const typedefCache = new Map<number, TypeSig | null>();
  const typedefOf = (row: number): TypeSig | null => {
    if (typedefCache.has(row)) return typedefCache.get(row)!;
    let result: TypeSig | null = null;
    if (md.attributes(T.TypeDef, row).some(a => a.name === "NativeTypedef")) {
      const [first] = md.range(T.TypeDef, row, 4, T.Field);
      result = md.fieldSig(first);
    }
    typedefCache.set(row, result);
    return result;
  };

  const STRINGS: Record<string, string> = {
    "Windows.Win32.Foundation.PWSTR": "w",
    "Windows.Win32.Foundation.PCWSTR": "w",
    "Windows.Win32.Foundation.PSTR": "a",
    "Windows.Win32.Foundation.PCSTR": "a",
    "Windows.Win32.Foundation.BSTR": "b",
  };

  const layoutCache = new Map<number, Layout>();
  const structs = new Map<number, NsData["structs"][string]>();

  /** Token for a value of this type (argument, return, field). */
  const token = (sig: TypeSig): string => {
    switch (sig.kind) {
      case "prim":
        return sig.name === "char16" ? "u16" : sig.name;
      case "const":
        return token(sig.inner);
      case "string":
      case "object":
      case "fnptr":
      case "array":
        return "p";
      case "ptr":
      case "byref": {
        const inner = sig.inner.kind === "const" ? sig.inner.inner : sig.inner;
        if (inner.kind === "prim" && inner.name === "void") return "p";
        const t = token(inner);
        return t === "p" ? "p" : "*" + t;
      }
      case "named": {
        const full = `${sig.ns}.${sig.name}`;
        if (STRINGS[full]) return STRINGS[full];
        if (full === "Windows.Win32.Foundation.HRESULT") return "hr";
        if (full === "System.Guid") return "s16:Foundation.GUID";
        const row = rowOf(sig.ns, sig.name);
        if (!row) return "p";
        const typedef = typedefOf(row);
        if (typedef) return token(typedef);
        const kind = md.kind(row);
        if (kind === "enum") return md.enumUnderlying({ table: T.TypeDef, row, ns: sig.ns, name: sig.name }) ?? "i32";
        if (kind === "delegate") return `f:${short(sig.ns, sig.name)}`;
        if (kind === "interface") return `i:${short(sig.ns, sig.name)}`;
        if (kind === "struct") {
          const { size } = layout(row);
          return `s${size}:${short(sig.ns, sig.name)}`;
        }
        return "p";
      }
      default:
        return "p";
    }
  };

  const fieldLayout = (sig: TypeSig): Layout => {
    switch (sig.kind) {
      case "prim":
        return { size: PRIM_SIZE[sig.name] ?? 8, align: PRIM_SIZE[sig.name] ?? 8 };
      case "const":
        return fieldLayout(sig.inner);
      case "fixed": {
        const e = fieldLayout(sig.elem);
        return { size: e.size * sig.length, align: e.align, forced: e.forced };
      }
      case "named": {
        if (sig.ns === "System" && sig.name === "Guid") return { size: 16, align: 4 };
        const row = rowOf(sig.ns, sig.name);
        if (!row) return { size: 8, align: 8 };
        const typedef = typedefOf(row);
        if (typedef) return fieldLayout(typedef);
        const kind = md.kind(row);
        if (kind === "enum") {
          const u = md.enumUnderlying({ table: T.TypeDef, row, ns: sig.ns, name: sig.name }) ?? "i32";
          return { size: PRIM_SIZE[u], align: PRIM_SIZE[u] };
        }
        if (kind === "struct") return layout(row);
        return { size: 8, align: 8 };
      }
      default:
        return { size: 8, align: 8 };
    }
  };

  const fieldToken = (sig: TypeSig, outer: string): string => {
    if (sig.kind === "const") return fieldToken(sig.inner, outer);
    if (sig.kind === "fixed") {
      const elem = sig.elem.kind === "const" ? sig.elem.inner : sig.elem;
      if (elem.kind === "prim" && elem.name === "char16") return `c[${sig.length}]`;
      if (elem.kind === "named" && `${elem.ns}.${elem.name}` === "Windows.Win32.Foundation.CHAR")
        return `ca[${sig.length}]`;
      return `${fieldToken(elem, outer)}[${sig.length}]`;
    }
    const t = token(sig);
    return t.startsWith("*") ? "p" : t === "hr" ? "i32" : t;
  };

  function layout(row: number): Layout {
    const cached = layoutCache.get(row);
    if (cached) return cached;
    layoutCache.set(row, { size: 0, align: 1 });
    const explicit = (md.col(T.TypeDef, row, 0) & 0x18) === 0x10;
    const cl = md.classLayout(row);
    const pack = cl?.pack || 0;
    const [first, last] = md.range(T.TypeDef, row, 4, T.Field);
    const fields: [string, string, number][] = [];
    let offset = 0;
    const own = FORCED_ALIGN[md.typeName(T.TypeDef, row).name] ?? 0;
    let align = own || 1;
    let forced = own;
    let size = 0;
    let flex = false;
    for (let f = first; f < last; f++) {
      if (md.col(T.Field, f, 0) & 0x10) continue;
      const sig = md.fieldSig(f);
      const flexible = md.attributes(T.Field, f).some(x => x.name === "FlexibleArray");
      const l = fieldLayout(sig);
      if (flexible) flex = true;
      if (f === last - 1 && sig.kind === "fixed" && ZERO_LENGTH_TAIL.has(md.typeName(T.TypeDef, row).name)) l.size = 0;
      const a = Math.max(pack ? Math.min(pack, l.align) : l.align, l.forced ?? 0);
      align = Math.max(align, a);
      forced = Math.max(forced, l.forced ?? 0);
      let at: number;
      if (explicit) at = md.fieldOffset(f) ?? 0;
      else {
        offset = Math.ceil(offset / a) * a;
        at = offset;
        offset += l.size;
      }
      size = Math.max(size, at + l.size);
      fields.push([md.str(T.Field, f, 1), fieldToken(sig, md.fullName(T.TypeDef, row)), at]);
    }
    size = Math.max(Math.ceil(size / align) * align, cl?.size ?? 0);
    if (size === 0) size = 1;
    const result = { size, align, ...(forced ? { forced } : {}) };
    layoutCache.set(row, result);
    structs.set(row, {
      s: size,
      a: align,
      ...(explicit ? { u: 1 as const } : {}),
      ...(flex ? { x: 1 as const } : {}),
      f: fields,
    });
    return result;
  }

  const nsData = new Map<string, NsData>();
  const bucket = (ns: string) => {
    const key = ns.startsWith("Windows.Win32.") ? ns.slice(14) : ns;
    let data = nsData.get(key);
    if (!data) {
      data = { structs: {}, enums: {}, consts: {}, guids: {}, clsids: {}, callbacks: {}, interfaces: {} };
      nsData.set(key, data);
    }
    return data;
  };
  const constValue = (v: unknown): number | string | string[] =>
    typeof v === "bigint" ? (Number.isSafeInteger(Number(v)) ? Number(v) : [v.toString()]) : (v as number | string);

  const methodTokens = (m: number, com: boolean) => {
    const sig = md.methodSig(m);
    const params = md.params(m);
    const args = sig.params.map(p => token(p));
    const names = sig.params.map((_, i) => params.get(i + 1)?.name || `arg${i}`);
    if (com && args.length) {
      const last = params.get(args.length);
      const lastSig = sig.params[args.length - 1];
      const attrs = last ? md.attributes(T.Param, last.row).map(a => a.name) : [];
      if (
        last &&
        last.flags & 2 &&
        !(last.flags & 16) &&
        (lastSig.kind === "ptr" || lastSig.kind === "byref") &&
        !attrs.includes("NativeArrayInfo") &&
        !attrs.includes("MemorySize")
      )
        args[args.length - 1] = "@" + args[args.length - 1];
    }
    return { ret: token(sig.ret), args, names };
  };

  const families = new Map<string, { dll: string; fns: Record<string, unknown[]>; ns: Set<string> }>();
  const familyName = (dll: string) =>
    dll
      .replace(/\.(dll)$/, "")
      .replace(/[._]/g, "-")
      .replace(/^(\d)/, "x$1");

  for (const [full, row] of rows) {
    const ns = md.str(T.TypeDef, row, 2) || md.typeName(T.TypeDef, row).ns;
    if (!ns.startsWith("Windows.Win32.")) continue;
    const name = md.typeName(T.TypeDef, row).name;
    const kind = md.kind(row);
    const data = bucket(ns);
    if (name === "Apis") {
      const [ff, fl] = md.range(T.TypeDef, row, 4, T.Field);
      for (let f = ff; f < fl; f++) {
        const fname = md.str(T.Field, f, 1);
        const value = md.constant(T.Field, f);
        if (value !== undefined) {
          data.consts[fname] = constValue(value);
          continue;
        }
        const guid = md.attributes(T.Field, f).find(a => a.name === "Guid");
        if (guid) data.guids[fname] = guidFromArgs(guid.args);
      }
      const [mf, ml] = md.range(T.TypeDef, row, 5, T.MethodDef);
      for (let m = mf; m < ml; m++) {
        const impl = md.implMap(m);
        // FORCEINLINE helpers (InterlockedIncrement, ...) are header-only and have no export.
        if (!impl || impl.dll === "forceinline" || !supportsX64(T.MethodDef, m)) continue;
        const fam = familyName(impl.dll);
        let family = families.get(fam);
        if (!family) families.set(fam, (family = { dll: impl.dll, fns: {}, ns: new Set() }));
        const method = md.str(T.MethodDef, m, 3);
        const { ret, args, names } = methodTokens(m, false);
        const entry: unknown[] = [ret, args, names, impl.flags & 0x40 ? 1 : 0];
        if (impl.entry && impl.entry !== method) entry.push(impl.entry);
        family.fns[method] = entry;
        family.ns.add(ns.slice(14));
      }
      continue;
    }
    if (full.includes("`")) continue;
    if (kind === "enum") {
      const values: Record<string, number | string[]> = {};
      const [ff, fl] = md.range(T.TypeDef, row, 4, T.Field);
      for (let f = ff; f < fl; f++) {
        const v = md.constant(T.Field, f);
        if (v !== undefined) values[md.str(T.Field, f, 1)] = constValue(v) as number | string[];
      }
      data.enums[name] = { t: md.enumUnderlying({ table: T.TypeDef, row, ns, name }) ?? "i32", v: values };
    } else if (kind === "struct") {
      if (typedefOf(row)) continue;
      const guid = md.attributes(T.TypeDef, row).find(a => a.name === "Guid");
      const [ff, fl] = md.range(T.TypeDef, row, 4, T.Field);
      if (guid && ff === fl) {
        data.clsids[name] = guidFromArgs(guid.args);
        continue;
      }
      layout(row);
      data.structs[name] = structs.get(row)!;
    } else if (kind === "delegate") {
      const [mf, ml] = md.range(T.TypeDef, row, 5, T.MethodDef);
      for (let m = mf; m < ml; m++) {
        if (md.str(T.MethodDef, m, 3) !== "Invoke") continue;
        const { ret, args } = methodTokens(m, false);
        data.callbacks[name] = { r: ret, a: args };
      }
    } else if (kind === "interface") {
      const guid = md.attributes(T.TypeDef, row).find(a => a.name === "Guid");
      const impls = md.interfaceImpls(row);
      let base: string | undefined;
      if (impls.length) {
        const b = md.typeDefOrRef(md.col(T.InterfaceImpl, impls[0], 1));
        if (b.kind === "named") base = short(b.ns, b.name);
      }
      const methods: unknown[][] = [];
      const [mf, ml] = md.range(T.TypeDef, row, 5, T.MethodDef);
      for (let m = mf; m < ml; m++) {
        const { ret, args } = methodTokens(m, true);
        methods.push([md.str(T.MethodDef, m, 3), ret, ...args]);
      }
      data.interfaces[name] = {
        ...(guid ? { g: guidFromArgs(guid.args) } : {}),
        ...(base ? { b: base } : {}),
        m: methods,
      };
    }
  }
  bucket("Windows.Win32.Foundation").structs.GUID = {
    s: 16,
    a: 4,
    f: [
      ["Data1", "u32", 0],
      ["Data2", "u16", 4],
      ["Data3", "u16", 6],
      ["Data4", "u8[8]", 8],
    ],
  };
  // Nested anonymous unions/structs are emitted as "Outer/Inner" in their outer's namespace.
  for (const [row, s] of structs) {
    const { ns, name } = md.typeName(T.TypeDef, row);
    if (name.includes("/") && ns.startsWith("Windows.Win32.")) bucket(ns).structs[name] = s;
  }
  return { nsData, families };
}

const TS: Record<string, [arg: string, ret: string]> = {
  void: ["undefined", "void"],
  bool: ["boolean", "boolean"],
  i8: ["number", "number"],
  u8: ["number", "number"],
  i16: ["number", "number"],
  u16: ["number", "number"],
  i32: ["number", "number"],
  u32: ["number", "number"],
  f32: ["number", "number"],
  f64: ["number", "number"],
  i64: ["number | bigint", "bigint"],
  u64: ["number | bigint", "bigint"],
  isize: ["number | bigint", "number | bigint"],
  usize: ["number | bigint", "number | bigint"],
  hr: ["number", "number"],
  p: ["Win32Pointer", "number | null"],
  w: ["string | Win32Pointer", "number | null"],
  a: ["string | Win32Pointer", "number | null"],
  b: ["string | Win32Pointer", "number | null"],
};
const tsType = (tok: string, ret: boolean): string => {
  const known = TS[tok];
  if (known) return known[ret ? 1 : 0];
  if (tok.startsWith("s")) return ret ? "Win32Struct" : "Win32StructInit";
  if (tok.startsWith("f:")) return ret ? "number | null" : "Win32Callback";
  return ret ? "number | null" : "Win32Pointer";
};
const IDENT = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set(
  "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await".split(
    " ",
  ),
);

// npm (and crates.io) require strict semver: a "-preview" suffix is a valid prerelease
// identifier, but a fourth ".0" component (what this used to append) is not — `npm publish`
// rejects it outright ("New versions must be valid semver"). Keep the metadata version as-is.
const PACKAGE_VERSION = METADATA_VERSION;

const sharedPackage = {
  name: "@aphrody/bun-windows-win32",
  version: PACKAGE_VERSION,
  description: `Win32 metadata (structs, enums, constants, callbacks, COM interfaces) shared by the bun:windows families, generated from ${METADATA_PACKAGE} ${METADATA_VERSION}`,
  license: "MIT",
  main: "index.js",
  files: ["index.js", "manifest.json", "types.json", "ns", "LICENSE-Microsoft.txt"],
};

const SHARED_INDEX = `// Generated by scripts/aphrody/win32/gen.ts. Do not edit.
// Namespace data is read on first use; windows.win32 resolves types through it.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const cache = new Map();
let types;
module.exports = {
  manifest: require("./manifest.json"),
  namespace(name) {
    let data = cache.get(name);
    if (data === undefined) {
      try {
        data = JSON.parse(readFileSync(join(__dirname, "ns", name + ".json"), "utf8"));
      } catch {
        data = null;
      }
      cache.set(name, data);
    }
    return data;
  },
  namespaceOf(type) {
    types ??= JSON.parse(readFileSync(join(__dirname, "types.json"), "utf8"));
    return types[type];
  },
};
`;

export function familyFiles(name: string, family: { dll: string; fns: Record<string, unknown[]>; ns: Set<string> }) {
  const data = {
    family: name,
    dll: family.dll,
    metadata: `${METADATA_PACKAGE} ${METADATA_VERSION}`,
    namespaces: [...family.ns].sort(),
    functions: Object.fromEntries(Object.entries(family.fns).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
  const lines: string[] = [];
  const names = new Set(Object.keys(data.functions));
  for (const [fn, [ret, args, params]] of Object.entries(data.functions) as [string, [string, string[], string[]]][]) {
    if (!IDENT.test(fn)) continue;
    const ps = args.map((tok, i) => {
      let p = params[i] && IDENT.test(params[i]) && !RESERVED.has(params[i]) ? params[i] : `arg${i}`;
      return `${p}: ${tsType(tok, false)}`;
    });
    const sig = `(${ps.join(", ")}): ${tsType(ret, true)};`;
    lines.push(`  /** ${family.dll}!${fn} */\n  ${fn}${sig}`);
    const plain = fn.replace(/W$/, "");
    if (fn.endsWith("W") && !names.has(plain) && names.has(plain + "A") && IDENT.test(plain))
      lines.push(`  /** ${family.dll}!${fn} */\n  ${plain}${sig}`);
  }
  const dts = `// Generated by scripts/aphrody/win32/gen.ts from ${METADATA_PACKAGE} ${METADATA_VERSION}. Do not edit.
import type { Win32Callback, Win32Family, Win32Pointer, Win32Struct, Win32StructInit } from "bun:windows";

interface Functions {
${lines.join("\n")}
}

declare const family: Win32Family & Functions;
export = family;
`;
  const pkg = {
    name: `@aphrody/bun-windows-${name}`,
    version: PACKAGE_VERSION,
    description: `bun:windows Win32 family for ${family.dll}, generated from ${METADATA_PACKAGE} ${METADATA_VERSION}`,
    license: "MIT",
    main: "index.js",
    types: "index.d.ts",
    files: ["index.js", "index.d.ts", "family.json"],
    dependencies: { "@aphrody/bun-windows-win32": PACKAGE_VERSION },
  };
  const index = `// Generated by scripts/aphrody/win32/gen.ts. Do not edit.
let metadata;
try {
  metadata = require("@aphrody/bun-windows-win32");
} catch {
  metadata = require("../bun-windows-win32/index.js");
}
module.exports = require("bun:windows").win32.defineFamily(require("./family.json"), metadata);
`;
  return {
    "package.json": JSON.stringify(pkg, null, 2) + "\n",
    "index.js": index,
    "index.d.ts": dts,
    "family.json": JSON.stringify(data) + "\n",
  };
}

if (import.meta.main) {
  const path = locateWinmd(option("--winmd"));
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const t0 = performance.now();
  const { nsData, families } = generate(path);
  const out = new Map<string, string>();
  const shared = join(packages, "bun-windows-win32");
  const manifest = {
    generator: "scripts/aphrody/win32/gen.ts",
    metadata: { package: METADATA_PACKAGE, version: METADATA_VERSION, sha256 },
    namespaces: [...nsData.keys()].sort(),
    families: Object.fromEntries(
      [...families]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, f]) => [name, { dll: f.dll, functions: Object.keys(f.fns).length }]),
    ),
  };
  for (const [ns, data] of nsData) {
    const compact = Object.fromEntries(Object.entries(data).filter(([, v]) => Object.keys(v).length));
    out.set(join(shared, "ns", `${ns}.json`), JSON.stringify(compact) + "\n");
  }
  // Type name -> namespace, for unqualified lookups (windows.win32.struct("RECT")).
  const index: Record<string, string> = {};
  for (const [ns, data] of nsData)
    for (const kind of ["structs", "enums", "callbacks", "interfaces"] as const)
      for (const name of Object.keys(data[kind])) if (!name.includes("/")) index[name] ??= ns;
  out.set(join(shared, "types.json"), JSON.stringify(index) + "\n");
  out.set(join(shared, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  out.set(join(shared, "package.json"), JSON.stringify(sharedPackage, null, 2) + "\n");
  out.set(join(shared, "index.js"), SHARED_INDEX);
  for (const [name, family] of families) {
    if (wanted.length && !wanted.includes(name)) continue;
    for (const [file, text] of Object.entries(familyFiles(name, family)))
      out.set(join(packages, `bun-windows-${name}`, file), text);
  }
  if (check) {
    const drift = [...out].filter(([file, text]) => !existsSync(file) || readFileSync(file, "utf8") !== text);
    console.log(`${out.size} generated files, ${drift.length} out of date`);
    for (const [file] of drift.slice(0, 20)) console.log("  " + file);
    process.exit(drift.length ? 1 : 0);
  }
  if (!wanted.length) {
    // Families that win32metadata no longer lists (or the old merged dxgi-d3d11) are removed.
    for (const dir of readdirSync(packages)) {
      const m = /^bun-windows-(.+)$/.exec(dir);
      if (!m) continue;
      const json = join(packages, dir, "family.json");
      const legacy =
        existsSync(join(packages, dir, "index.ts")) && existsSync(join(packages, dir, "LICENSE-Microsoft.txt"));
      if ((existsSync(json) || legacy) && !families.has(m[1])) rmSync(join(packages, dir), { recursive: true });
      else if (legacy)
        for (const f of ["index.ts", "index.test.ts", "README.md", "LICENSE-Microsoft.txt"])
          rmSync(join(packages, dir, f), { force: true });
    }
    rmSync(join(shared, "ns"), { recursive: true, force: true });
  }
  for (const [file, text] of out) {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, text);
  }
  const functions = [...families.values()].reduce((n, f) => n + Object.keys(f.fns).length, 0);
  console.log(
    `${path}\n${families.size} families, ${functions} functions, ${nsData.size} namespaces, ${out.size} files in ${Math.round(performance.now() - t0)} ms`,
  );
}
