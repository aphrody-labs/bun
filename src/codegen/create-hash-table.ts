// Static hash table generator for the `@begin Name ... @end` blocks of JSC LUT sources.
// TypeScript port of JavaScriptCore's create_hash_table (Harri Porten, David Faure, Nikolas Zimmermann,
// Apple Inc., LGPL-2.1-or-later); its output is byte-identical, so the build no longer needs perl.
import { readFileSync } from "fs";
import { writeIfNotChanged } from "./helpers.ts";

const platform = process.env.TARGET_PLATFORM ?? process.platform;

const MASK64 = (1n << 64n) - 1n;
const MASK32 = (1n << 32n) - 1n;
const SECRET = [3257665815644502181n, 10067880064238660809n, 5418857496715711651n] as const;

function mul128(a: bigint, b: bigint): [lo: bigint, hi: bigint] {
  const product = a * b;
  return [product & MASK64, (product >> 64n) & MASK64];
}

function mix(a: bigint, b: bigint): bigint {
  const [lo, hi] = mul128(a, b);
  return lo ^ hi;
}

/** WTF's rapidhash over the key's bytes, masked to 24 bits and never 0 (StringImpl flag bits). */
export function rapidhash(bytes: Uint8Array): number {
  const len = BigInt(bytes.length);
  const byte = (i: number) => BigInt(bytes[i] ?? 0);
  const read32 = (i: number) => byte(i) | (byte(i + 1) << 8n) | (byte(i + 2) << 16n) | (byte(i + 3) << 24n);
  const read64 = (i: number) => read32(i) | (read32(i + 4) << 32n);

  let seed = mix(SECRET[0], SECRET[1]) ^ len;
  let a: bigint;
  let b: bigint;
  const n = bytes.length;
  if (n <= 16) {
    if (n >= 4) {
      const delta = n >= 8 ? 4 : 0;
      a = (read32(0) << 32n) | read32(n - 4);
      b = (read32(delta) << 32n) | read32(n - 4 - delta);
    } else if (n > 0) {
      a = (byte(0) << 56n) | (byte(n >> 1) << 32n) | byte(n - 1);
      b = 0n;
    } else {
      a = b = 0n;
    }
  } else {
    let i = n;
    let off = 0;
    if (i > 48) {
      let see1 = seed;
      let see2 = seed;
      do {
        seed = mix(read64(off) ^ SECRET[0], read64(off + 8) ^ seed);
        see1 = mix(read64(off + 16) ^ SECRET[1], read64(off + 24) ^ see1);
        see2 = mix(read64(off + 32) ^ SECRET[2], read64(off + 40) ^ see2);
        off += 48;
        i -= 48;
      } while (i >= 48);
      seed ^= see1 ^ see2;
    }
    if (i > 16) {
      seed = mix(read64(off) ^ SECRET[2], read64(off + 8) ^ seed ^ SECRET[1]);
      if (i > 32) seed = mix(read64(off + 16) ^ SECRET[2], read64(off + 24) ^ seed);
    }
    a = read64(off + i - 16);
    b = read64(off + i - 8);
  }
  a ^= SECRET[1];
  b ^= seed;
  [a, b] = mul128(a, b);
  let hash = Number(mix(a ^ SECRET[0] ^ len, b ^ SECRET[1]) & MASK32) & 0xffffff;
  if (hash === 0) hash = 0x80000000 >>> 8;
  return hash;
}

type Value =
  | { type: "Function"; fn: string; params: string; intrinsic: string }
  | { type: "Property"; get: string; put: string }
  | { type: "CellProperty" | "ClassStructure"; property: string }
  | { type: "PropertyCallback"; cback: string }
  | { type: "ConstantInteger"; value: string }
  | { type: "Lexer"; value: string };

const ucfirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const jscUcfirst = (s: string) => (s.includes("js") ? s.replace("js", "JS") : ucfirst(s));

/** What create_hash_table prints for `input` (it was invoked as `create_hash_table -`). */
export function generateHashTables(input: string): string {
  const encoder = new TextEncoder();
  let out = "";
  let banner = false;
  let inside = false;
  let name = "";
  let hasSetter = "false"; // never reset between tables, like the original
  let includeBuiltin = false;
  let keys: string[] = [];
  let attrs: string[] = [];
  let values: Value[] = [];

  const emit = () => {
    if (!banner) {
      banner = true;
      out += "// Automatically generated from - using create_hash_table. DO NOT EDIT!\n";
    }
    const nameEntries = `${name}Values`.replaceAll(":", "_");
    const nameIndex = `${name}Index`.replaceAll(":", "_");
    out += "\n";
    if (includeBuiltin) out += '#include "JSCBuiltins.h"\n';
    out += '#include "Lookup.h"\n\nnamespace JSC {\n\n';

    let compactSize = 1;
    while (2 * keys.length > compactSize) compactSize <<= 1;
    const compactHashSizeMask = compactSize - 1;
    const modulus = compactSize;
    const table: number[] = [];
    const links: number[] = [];
    keys.forEach((key, i) => {
      let depth = 0;
      let h = rapidhash(encoder.encode(key)) % modulus;
      while (table[h] !== undefined) {
        if (compactSize > 1000) throw new Error("The hash size is far too big. This should not be reached.");
        if (depth > 100) throw new Error("The depth is far too big. This should not be reached.");
        if (links[h] !== undefined) {
          h = links[h];
          depth++;
        } else {
          links[h] = compactSize;
          h = compactSize;
          compactSize++;
        }
      }
      table[h] = i;
    });

    out += `static constinit const struct CompactHashIndex ${nameIndex}[${compactSize}] = {\n`;
    for (let i = 0; i < compactSize; i++) out += `    { ${table[i] ?? -1}, ${links[i] ?? -1} },\n`;
    out += "};\n\n";
    out += `static constinit const struct HashTableValue ${nameEntries}[${keys.length}] = {\n`;
    keys.forEach((key, i) => {
      const value = values[i]!;
      let typeTag = "";
      let first = "";
      let second = "";
      let hasSecond = true;
      let intrinsic = "NoIntrinsic";
      switch (value.type) {
        case "Function":
          typeTag = "NativeFunction";
          first = value.fn;
          second = value.params;
          intrinsic = value.intrinsic;
          break;
        case "Property":
          typeTag = "GetterSetter";
          first = value.get;
          second = value.put;
          break;
        case "Lexer":
          typeTag = "Lexer";
          first = value.value;
          hasSecond = false;
          break;
        case "CellProperty":
        case "ClassStructure": {
          typeTag = value.type === "CellProperty" ? "LazyCellProperty" : "LazyClassStructure";
          const m = /^([a-zA-Z0-9_]+)::(.*)$/.exec(value.property);
          if (!m) throw new Error(`invalid ${value.type} ${value.property}`);
          first = `OBJECT_OFFSETOF(${m[1]}, ${m[2]})`;
          hasSecond = false;
          break;
        }
        case "PropertyCallback":
          typeTag = "LazyProperty";
          first = value.cback;
          hasSecond = false;
          break;
        case "ConstantInteger":
          typeTag = "Constant";
          first = value.value;
          hasSecond = false;
          break;
      }
      const attributes = `static_cast<unsigned>(PropertyAttribute::${attrs[i]!.replaceAll("|", "|PropertyAttribute::")})`;
      if (value.type === "Function" && first === "JSBuiltin") {
        const tableHead = name.replace(/Table$/, "");
        out += `   { "${key}"_s, ((${attributes}) & ~PropertyAttribute::Function) | PropertyAttribute::Builtin, ${intrinsic}, { HashTableValue::BuiltinGeneratorType, ${tableHead}${ucfirst(key)}CodeGenerator, ${second} } },\n`;
      } else {
        out += `   { "${key}"_s, ${attributes}, ${intrinsic}, { HashTableValue::${typeTag}Type, ${first}${hasSecond ? ", " + second : ""} } },\n`;
      }
    });
    out += "};\n\n";
    out += `static constinit const struct HashTable ${name} =\n`;
    out += `    { ${keys.length}, ${compactHashSizeMask}, ${hasSetter}, nullptr, ${nameEntries}, ${nameIndex} };\n\n`;
    out += "} // namespace JSC\n";
  };

  for (const rawLine of input.split("\n")) {
    const line = rawLine.replace(/^\s+/, "");
    if (line === "" || line.startsWith("#")) continue;
    let m: RegExpExecArray | null;
    if (!inside && line.startsWith("@begin")) {
      if ((m = /^@begin\s*([:_\w]+)\s*\d*\s*$/.exec(line))) {
        inside = true;
        name = m[1]!;
      } else {
        console.warn(`WARNING: @begin without table name, skipping ${line}`);
      }
    } else if (inside && /^@end\s*$/.test(line)) {
      emit();
      keys = [];
      attrs = [];
      values = [];
      includeBuiltin = false;
      inside = false;
    } else if (inside && (m = /^(\S+)\s*(\S+)\s*([\w|]*)\s*(\w*)\s*(\w*)\s*$/.exec(line))) {
      const [, key, val, att, param, intrinsic] = m as unknown as [string, string, string, string, string, string];
      keys.push(key);
      attrs.push(att.length > 0 ? att : "None");
      if (val === "JSBuiltin") includeBuiltin = true;
      if (att.includes("Function")) {
        values.push({ type: "Function", fn: val, params: param, intrinsic: intrinsic || "NoIntrinsic" });
      } else if (att.includes("CellProperty")) {
        values.push({ type: "CellProperty", property: val });
      } else if (att.includes("ClassStructure")) {
        values.push({ type: "ClassStructure", property: val });
      } else if (att.includes("PropertyCallback")) {
        values.push({ type: "PropertyCallback", cback: val });
      } else if (att.includes("ConstantInteger")) {
        values.push({ type: "ConstantInteger", value: val });
      } else if (att.length > 0) {
        hasSetter = "true";
        values.push({ type: "Property", get: val, put: att.includes("ReadOnly") ? "0" : "set" + jscUcfirst(val) });
      } else {
        values.push({ type: "Lexer", value: val });
      }
    } else if (inside) {
      throw new Error(`invalid data {${rawLine}}`);
    }
  }
  if (inside) throw new Error("missing closing @end");
  return out;
}

/** The LUT text of `input_text` with the `#if OS(...)` blocks of other platforms removed. */
export function preprocessLut(input_text: string): string {
  const to_preprocess = [...input_text.matchAll(/@begin\s+.+?@end/gs)].map(m => m[0]).join("\n");
  const os = platform === "win32" ? "WINDOWS" : platform.toUpperCase();
  const other_oses = ["WINDOWS", "DARWIN", "LINUX"].filter(x => x !== os);
  const to_remove = new RegExp(`#if\\s+(!OS\\(${os}\\)|OS\\((${other_oses.join("|")})\\))\\n.*?#endif`, "gs");
  return to_preprocess.replace(to_remove, "");
}

/** The `.lut.h` text for the LUT source text `input_text`. */
export function hashTableHeader(input_text: string): string {
  let str = generateHashTables(preprocessLut(input_text));
  str = str.replaceAll(/^\/\/.*$/gm, "");
  str = str.replaceAll(/^#include.*$/gm, "");
  str = str.replaceAll(`namespace JSC {`, "");
  str = str.replaceAll(`} // namespace JSC`, "");
  str = str.replaceAll(/NativeFunctionType,\s([a-zA-Z0-99_]+)/gm, "NativeFunctionType, &$1");
  str = str.replaceAll("&Generated::", "Generated::");
  return "#pragma once" + "\n" + "// File generated via `create-hash-table.ts`\n" + str.trim() + "\n";
}

/** Writes to `output` the JSC hash tables for the `@begin ... @end` blocks in `input`. */
export function createHashTable(input: string, output: string): void {
  console.log("Generating " + output + " from " + input);
  writeIfNotChanged(output, hashTableHeader(readFileSync(input, "utf8")));
}

if (import.meta.main) {
  createHashTable(process.argv[2], process.argv[3]);
}
