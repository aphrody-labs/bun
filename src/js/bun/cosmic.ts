// Hardcoded module "bun:cosmic"
//
// The COSMIC desktop (Pop!_OS, System76) from Bun. Text shaping, layout and rasterization use
// cosmic-text and the application index uses freedesktop-desktop-entry, both linked into Bun
// (src/cosmic, host functions in src/runtime/cosmic). cosmic-config is a directory of RON files,
// read and written here with the same layout and atomic writes as the Rust crate. libcosmic
// windows and desktop notifications run in the `bun-cosmic` helper process (packages/bun-cosmic):
// a libcosmic event loop owns its process's main thread, so it never runs on Bun's JS thread.
// Nothing here runs until the module is imported; the font database is scanned on first use.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const isWindows = process.platform === "win32";
// Text, config and windows work on Linux and Windows; the .desktop application index is Linux only.
const isSupported = process.platform === "linux" || isWindows;

const textLayoutNative = $newRustFunction("cosmic/text.rs", "jsTextLayout", 11);
const textRenderNative = $newRustFunction("cosmic/text.rs", "jsTextRender", 14);
const loadFontNative = $newRustFunction("cosmic/text.rs", "jsLoadFont", 1);
const fontsNative = $newRustFunction("cosmic/text.rs", "jsFonts", 0);
const desktopEntriesNative = $newRustFunction("cosmic/apps.rs", "jsDesktopEntries", 2);

function unsupportedError() {
  const error = new Error("this bun:cosmic feature is not available on this platform");
  error.code = "ERR_BUN_COSMIC_UNSUPPORTED";
  return error;
}

function validateOptions(name, value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object") throw $ERR_INVALID_ARG_TYPE(name, "object", value);
  return value;
}

function positive(name, value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !(value > 0) || !Number.isFinite(value)) {
    throw $ERR_OUT_OF_RANGE(name, "a finite number greater than 0", value);
  }
  return value;
}

function oneOf(name, value, list, fallback) {
  if (value === undefined) return fallback;
  const index = list.indexOf(value);
  if (index < 0) throw $ERR_INVALID_ARG_VALUE(name, value, `must be one of ${list.join(", ")}`);
  return index;
}

// ---------------------------------------------------------------------------------------------
// Text (cosmic-text)

const WRAPS = ["none", "glyph", "word", "wordOrGlyph"];
const ALIGNS = ["natural", "left", "right", "center", "justified", "end"];

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` or a `0xRRGGBBAA` number, as an unsigned 0xRRGGBBAA. */
function parseColor(name, value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw $ERR_OUT_OF_RANGE(name, "an integer from 0 to 0xffffffff", value);
    }
    return value;
  }
  if (typeof value === "string" && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
    let hex = value.slice(1);
    if (hex.length <= 4) {
      let long = "";
      for (const c of hex) long += c + c;
      hex = long;
    }
    if (hex.length === 6) hex += "ff";
    return parseInt(hex, 16) >>> 0;
  }
  throw $ERR_INVALID_ARG_VALUE(
    name,
    value,
    "must be a #rgb, #rgba, #rrggbb or #rrggbbaa string or a 0xRRGGBBAA number",
  );
}

function textArgs(text, options) {
  if (typeof text !== "string") throw $ERR_INVALID_ARG_TYPE("text", "string", text);
  options = validateOptions("options", options);
  const fontSize = positive("options.fontSize", options.fontSize, 14);
  const lineHeight = positive("options.lineHeight", options.lineHeight, fontSize * 1.2);
  const family = options.family ?? "sans-serif";
  if (typeof family !== "string") throw $ERR_INVALID_ARG_TYPE("options.family", "string", family);
  const weight = options.weight ?? 400;
  if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
    throw $ERR_OUT_OF_RANGE("options.weight", "an integer from 1 to 1000", weight);
  }
  const italic = options.italic ?? false;
  if (typeof italic !== "boolean") throw $ERR_INVALID_ARG_TYPE("options.italic", "boolean", italic);
  return [
    text,
    fontSize,
    lineHeight,
    positive("options.width", options.width, undefined),
    positive("options.height", options.height, undefined),
    family,
    weight,
    italic,
    oneOf("options.wrap", options.wrap, WRAPS, 2),
    oneOf("options.align", options.align, ALIGNS, 0),
    parseColor("options.color", options.color, 0x000000ff),
  ];
}

function layout(text, options) {
  return JSON.parse(textLayoutNative(...textArgs(text, options)));
}

function render(text, options) {
  const args = textArgs(text, options);
  const imageWidth = positive("options.imageWidth", options?.imageWidth, undefined);
  const imageHeight = positive("options.imageHeight", options?.imageHeight, undefined);
  const background = parseColor("options.background", options?.background, 0);
  return textRenderNative(...args, imageWidth, imageHeight, background);
}

function loadFont(source) {
  let bytes = source;
  if (typeof source === "string") bytes = fs.readFileSync(source);
  else if (!(source instanceof ArrayBuffer) && !ArrayBuffer.isView(source)) {
    throw $ERR_INVALID_ARG_TYPE("source", ["string", "ArrayBuffer", "TypedArray", "DataView"], source);
  }
  return JSON.parse(loadFontNative(bytes));
}

function fonts() {
  return JSON.parse(fontsNative());
}

const text = Object.freeze({ layout, render, loadFont, fonts });

// ---------------------------------------------------------------------------------------------
// Applications (freedesktop .desktop entries)

function xdgDataDirs() {
  const env = process.env;
  const home = env.XDG_DATA_HOME || path.join(env.HOME || os.homedir(), ".local", "share");
  const system = (env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":").filter(Boolean);
  return [home, ...system];
}

/** `fr_FR.UTF-8@euro` and LANGUAGE lists to `["fr_FR@euro", "fr_FR", "fr"]`-style candidates. */
function defaultLocales() {
  const env = process.env;
  const raw = [env.LC_ALL, env.LC_MESSAGES, env.LANG, ...(env.LANGUAGE || "").split(":")];
  const out = [];
  for (const value of raw) {
    if (!value || value === "C" || value === "POSIX" || value.startsWith("C.")) continue;
    const locale = value.replace(/\.[^@]*/, "");
    if (!out.includes(locale)) out.push(locale);
  }
  return out;
}

function stringList(name, value, fallback) {
  if (value === undefined) return fallback();
  if (!Array.isArray(value)) throw $ERR_INVALID_ARG_TYPE(name, "Array", value);
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") throw $ERR_INVALID_ARG_TYPE(`${name}[${i}]`, "string", value[i]);
    if (value[i].includes("\0")) throw $ERR_INVALID_ARG_VALUE(`${name}[${i}]`, value[i], "must not contain NUL");
  }
  return value;
}

function listApps(options) {
  options = validateOptions("options", options);
  const dirs = stringList("options.dirs", options.dirs, () => xdgDataDirs().map(dir => path.join(dir, "applications")));
  const locales = stringList("options.locales", options.locales, defaultLocales);
  return JSON.parse(desktopEntriesNative(dirs.join("\0"), locales.join("\0")));
}

/** Desktop Entry spec "Possible value types": `\s`, `\n`, `\t`, `\r`, `\\` in string values. */
function unescapeValue(value) {
  return value.replace(/\\([sntr\\])/g, (_, c) => ({ s: " ", n: "\n", t: "\t", r: "\r", "\\": "\\" })[c]);
}

function execError(exec, message) {
  const error = new Error(`Invalid Exec value ${JSON.stringify(exec)}: ${message}`);
  error.code = "ERR_BUN_COSMIC_INVALID_EXEC";
  return error;
}

/**
 * Splits an Exec value into argv and expands its field codes (Desktop Entry spec, "The Exec key").
 * Arguments are separated by spaces; a double-quoted argument keeps its spaces and takes `\"`,
 * `` \` ``, `\$` and `\\` as escapes. Field codes in quoted arguments stay literal.
 */
function expandExecRaw(exec, context) {
  const raw = unescapeValue(exec);
  const argv = [];
  let i = 0;
  while (i < raw.length) {
    while (raw[i] === " " || raw[i] === "\t") i++;
    if (i >= raw.length) break;
    if (raw[i] === '"') {
      let arg = "";
      i++;
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === "\\" && '"`$\\'.includes(raw[i + 1] ?? "")) i++;
        arg += raw[i++];
      }
      if (i >= raw.length) throw execError(exec, "unterminated quote");
      i++;
      argv.push(arg);
      continue;
    }
    let word = "";
    while (i < raw.length && raw[i] !== " " && raw[i] !== "\t") word += raw[i++];
    // A list code standing alone becomes one argument per file or URL.
    if (word === "%F" || word === "%U") {
      for (const item of word === "%F" ? context.files : context.urls) argv.push(item);
      continue;
    }
    if (word === "%i") {
      const { icon } = context;
      if (icon) argv.push("--icon", icon);
      continue;
    }
    let out = "";
    let dropped = false;
    for (let j = 0; j < word.length; j++) {
      if (word[j] !== "%") {
        out += word[j];
        continue;
      }
      const code = word[++j];
      switch (code) {
        case "%":
          out += "%";
          break;
        case "f":
        case "F":
          if (context.files.length === 0) dropped = true;
          else out += context.files[0];
          break;
        case "u":
        case "U":
          if (context.urls.length === 0) dropped = true;
          else out += context.urls[0];
          break;
        case "c":
          out += context.name ?? "";
          break;
        case "k":
          out += context.path ?? "";
          break;
        case "d":
        case "D":
        case "n":
        case "N":
        case "v":
        case "m":
          dropped = true;
          break;
        default:
          throw execError(exec, `unknown field code %${code ?? ""}`);
      }
    }
    // `%f` with no file, or a deprecated code, removes an argument it leaves empty.
    if (!(dropped && out === "")) argv.push(out);
  }
  if (argv.length === 0) throw execError(exec, "no program");
  return argv;
}

function launchApp(entry, options) {
  if (typeof entry === "string") {
    const id = entry;
    entry = listApps().find(e => e.id === id);
    if (!entry) throw $ERR_INVALID_ARG_VALUE("entry", id, "is not an installed application id");
  } else if (entry === null || typeof entry !== "object") {
    throw $ERR_INVALID_ARG_TYPE("entry", ["string", "object"], entry);
  }
  options = validateOptions("options", options);
  const files = stringList("options.files", options.files, () => []);
  const urls = stringList("options.urls", options.urls, () => []);
  let exec = entry.exec;
  const actionId = options.action;
  if (actionId !== undefined) {
    const action = (entry.actions ?? []).find(a => a.id === actionId);
    if (!action) throw $ERR_INVALID_ARG_VALUE("options.action", actionId, "is not an action of this entry");
    exec = action.exec;
  }
  if (typeof exec !== "string" || exec === "") {
    throw $ERR_INVALID_ARG_VALUE("entry", entry.id, "has no Exec value");
  }
  const argv = expandExecRaw(exec, { files, urls, name: entry.name, icon: entry.icon, path: entry.path });
  const terminal = entry.terminal ? stringList("options.terminal", options.terminal, () => []) : [];
  return Bun.spawn({
    cmd: [...terminal, ...argv],
    cwd: options.cwd ?? entry.workingDirectory ?? undefined,
    env: options.env ?? process.env,
    stdin: options.stdin ?? "ignore",
    stdout: options.stdout ?? "inherit",
    stderr: options.stderr ?? "inherit",
  });
}

function expandExec(exec, context) {
  if (typeof exec !== "string") throw $ERR_INVALID_ARG_TYPE("exec", "string", exec);
  context = validateOptions("context", context);
  return expandExecRaw(exec, {
    files: stringList("context.files", context.files, () => []),
    urls: stringList("context.urls", context.urls, () => []),
    name: optionString("context.name", context.name),
    icon: optionString("context.icon", context.icon),
    path: optionString("context.path", context.path),
  });
}

const apps = Object.freeze({ list: listApps, launch: launchApp, expandExec });

// ---------------------------------------------------------------------------------------------
// RON, the format of cosmic-config values

class Some {
  constructor(value) {
    this.value = value;
  }
}

/** A tuple `(a, b)`; `()` is the unit value. */
class Tuple {
  constructor(values) {
    this.values = values;
  }
}

/** An enum variant or named struct: `Dark`, `Rgba(1.0, 0.5)`, `Fixed(width: 2)`. */
class Enum {
  constructor(name, values, fields) {
    this.name = name;
    if (values !== undefined) this.values = values;
    if (fields !== undefined) this.fields = fields;
  }
}

function ronError(source, index, message) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      column = 1;
    } else column++;
  }
  const error = new SyntaxError(`RON ${line}:${column}: ${message}`);
  error.code = "ERR_BUN_COSMIC_RON";
  return error;
}

const IDENT_START = /[A-Za-z_]/;
const IDENT = /[A-Za-z0-9_]/;

function parseRon(source) {
  if (typeof source !== "string") throw $ERR_INVALID_ARG_TYPE("source", "string", source);
  let i = 0;
  const n = source.length;

  function skip() {
    for (;;) {
      while (i < n && /\s/.test(source[i])) i++;
      if (source.startsWith("//", i)) {
        while (i < n && source[i] !== "\n") i++;
      } else if (source.startsWith("/*", i)) {
        let depth = 0;
        do {
          if (source.startsWith("/*", i)) {
            depth++;
            i += 2;
          } else if (source.startsWith("*/", i)) {
            depth--;
            i += 2;
          } else if (i >= n) throw ronError(source, i, "unterminated block comment");
          else i++;
        } while (depth > 0);
      } else return;
    }
  }

  function expect(c) {
    skip();
    if (source[i] !== c) throw ronError(source, i, `expected '${c}'`);
    i++;
  }

  function ident() {
    const start = i;
    if (source.startsWith("r#", i)) i += 2;
    if (!IDENT_START.test(source[i] ?? "")) throw ronError(source, i, "expected an identifier");
    while (i < n && IDENT.test(source[i])) i++;
    return source.slice(start, i).replace(/^r#/, "");
  }

  function escape() {
    const c = source[i++];
    switch (c) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "0":
        return "\0";
      case "\\":
      case '"':
      case "'":
        return c;
      case "x": {
        const hex = source.slice(i, i + 2);
        i += 2;
        return String.fromCharCode(parseInt(hex, 16));
      }
      case "u": {
        if (source[i] !== "{") throw ronError(source, i, "expected '{' after \\u");
        const end = source.indexOf("}", i);
        if (end < 0) throw ronError(source, i, "unterminated \\u{...}");
        const code = parseInt(source.slice(i + 1, end), 16);
        i = end + 1;
        return String.fromCodePoint(code);
      }
      default:
        throw ronError(source, i - 1, `unknown escape \\${c}`);
    }
  }

  function quoted(quote) {
    i++;
    let out = "";
    while (i < n && source[i] !== quote) {
      if (source[i] === "\\") {
        i++;
        out += escape();
      } else out += source[i++];
    }
    if (i >= n) throw ronError(source, i, "unterminated string");
    i++;
    return out;
  }

  function rawString() {
    i++;
    let hashes = 0;
    while (source[i] === "#") {
      hashes++;
      i++;
    }
    if (source[i] !== '"') throw ronError(source, i, "expected '\"' in raw string");
    const close = '"' + "#".repeat(hashes);
    const end = source.indexOf(close, i + 1);
    if (end < 0) throw ronError(source, i, "unterminated raw string");
    const out = source.slice(i + 1, end);
    i = end + close.length;
    return out;
  }

  function number() {
    const start = i;
    const match =
      /^[+-]?(?:0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|inf|NaN|(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?(?:[eE][+-]?[0-9_]+)?)/.exec(
        source.slice(i),
      );
    const literal = match?.[0] ?? "";
    if (!/[0-9]|inf|NaN/.test(literal)) throw ronError(source, start, "expected a value");
    i += literal.length;
    // Integer type suffixes (`1u8`, `-2i64`) carry no value.
    const suffix = /^[iuf](?:8|16|32|64|128|size)/.exec(source.slice(i));
    if (suffix) i += suffix[0].length;
    const clean = literal.replaceAll("_", "");
    const negative = clean.startsWith("-");
    const body = clean.replace(/^[+-]/, "");
    if (body === "inf") return negative ? -Infinity : Infinity;
    if (body === "NaN") return NaN;
    if (/^0[xob]/.test(body)) {
      const big = BigInt(body);
      const value = negative ? -big : big;
      return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(value)
        : value;
    }
    if (/^[0-9]+$/.test(body)) {
      const value = Number(clean);
      return Number.isSafeInteger(value) ? value : BigInt(clean);
    }
    return Number(clean);
  }

  function seq(close) {
    const items = [];
    for (;;) {
      skip();
      if (source[i] === close) {
        i++;
        return items;
      }
      items.push(value());
      skip();
      if (source[i] === ",") i++;
      else if (source[i] !== close) throw ronError(source, i, `expected ',' or '${close}'`);
    }
  }

  /** After `(`: a struct body when it starts with `ident:`, else tuple members. */
  function parenBody() {
    skip();
    const save = i;
    if (IDENT_START.test(source[i] ?? "") || source.startsWith("r#", i)) {
      ident();
      skip();
      const isStruct = source[i] === ":" && source[i + 1] !== ":";
      i = save;
      if (isStruct) {
        const fields = {};
        for (;;) {
          skip();
          if (source[i] === ")") {
            i++;
            return { fields };
          }
          const key = ident();
          expect(":");
          fields[key] = value();
          skip();
          if (source[i] === ",") i++;
          else if (source[i] !== ")") throw ronError(source, i, "expected ',' or ')'");
        }
      }
    }
    return { values: seq(")") };
  }

  function value() {
    skip();
    const c = source[i];
    if (c === undefined) throw ronError(source, i, "unexpected end of input");
    if (c === '"') return quoted('"');
    if (c === "'") return quoted("'");
    if (c === "r" && (source[i + 1] === '"' || (source[i + 1] === "#" && /["#]/.test(source[i + 2] ?? "")))) {
      return rawString();
    }
    if (c === "b" && source[i + 1] === '"') {
      i++;
      return new TextEncoder().encode(quoted('"'));
    }
    if (c === "[") {
      i++;
      return seq("]");
    }
    if (c === "{") {
      i++;
      const map = new Map();
      for (;;) {
        skip();
        if (source[i] === "}") {
          i++;
          return map;
        }
        const key = value();
        expect(":");
        map.set(key, value());
        skip();
        if (source[i] === ",") i++;
        else if (source[i] !== "}") throw ronError(source, i, "expected ',' or '}'");
      }
    }
    if (c === "(") {
      i++;
      const body = parenBody();
      return body.fields ?? new Tuple(body.values);
    }
    if (/[0-9+\-.]/.test(c) || source.startsWith("inf", i) || source.startsWith("NaN", i)) return number();
    if (IDENT_START.test(c)) {
      const name = ident();
      if (name === "true") return true;
      if (name === "false") return false;
      if (name === "None") return null;
      skip();
      if (name === "Some" && source[i] === "(") {
        i++;
        const inner = value();
        skip();
        if (source[i] === ",") i++;
        expect(")");
        return new Some(inner);
      }
      if (source[i] === "(") {
        i++;
        const body = parenBody();
        return new Enum(name, body.values, body.fields);
      }
      return new Enum(name);
    }
    throw ronError(source, i, `unexpected '${c}'`);
  }

  // `#![enable(implicit_some)]` and other extension attributes.
  for (;;) {
    skip();
    if (!source.startsWith("#!", i)) break;
    const end = source.indexOf("]", i);
    if (end < 0) throw ronError(source, i, "unterminated attribute");
    i = end + 1;
  }
  const result = value();
  skip();
  if (i < n) throw ronError(source, i, "trailing characters");
  return result;
}

function ronString(value) {
  let out = '"';
  for (const c of value) {
    switch (c) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      case "\0":
        out += "\\0";
        break;
      default: {
        const code = c.codePointAt(0);
        out += code < 0x20 || code === 0x7f ? `\\u{${code.toString(16)}}` : c;
      }
    }
  }
  return out + '"';
}

function ronNumber(value) {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "inf";
  if (value === -Infinity) return "-inf";
  return String(value);
}

/** Pretty RON in the layout of `ron::ser::to_string_pretty(value, PrettyConfig::new())`. */
function stringifyRon(value) {
  const seen = new Set();

  function block(open, close, entries, indent) {
    if (entries.length === 0) return open + close;
    const inner = indent + "    ";
    return `${open}\n${entries.map(entry => inner + entry(inner) + ",\n").join("")}${indent}${close}`;
  }

  function fieldsOf(fields, indent) {
    return block(
      "(",
      ")",
      Object.keys(fields)
        .filter(key => fields[key] !== undefined)
        .map(key => inner => `${key}: ${write(fields[key], inner)}`),
      indent,
    );
  }

  function inline(values, indent) {
    return `(${values.map(v => write(v, indent)).join(", ")})`;
  }

  function write(value, indent) {
    if (value === null || value === undefined) return "None";
    switch (typeof value) {
      case "boolean":
        return value ? "true" : "false";
      case "number":
        return ronNumber(value);
      case "bigint":
        return String(value);
      case "string":
        return ronString(value);
      case "object":
        break;
      default:
        throw $ERR_INVALID_ARG_TYPE("value", "a RON-representable value", value);
    }
    if (seen.has(value)) throw $ERR_INVALID_ARG_VALUE("value", value, "is circular");
    seen.add(value);
    try {
      if (value instanceof Some) return `Some(${write(value.value, indent)})`;
      if (value instanceof Tuple) return inline(value.values, indent);
      if (value instanceof Enum) {
        const { name, fields, values } = value;
        if (fields !== undefined) return name + fieldsOf(fields, indent);
        if (values !== undefined) return name + inline(values, indent);
        return name;
      }
      if (value instanceof Uint8Array) return ronString(new TextDecoder().decode(value)).replace(/^"/, 'b"');
      if (Array.isArray(value))
        return block(
          "[",
          "]",
          value.map(v => inner => write(v, inner)),
          indent,
        );
      if (value instanceof Map) {
        return block(
          "{",
          "}",
          [...value].map(
            ([k, v]) =>
              inner =>
                `${write(k, inner)}: ${write(v, inner)}`,
          ),
          indent,
        );
      }
      return fieldsOf(value, indent);
    } finally {
      seen.delete(value);
    }
  }

  return write(value, "");
}

const ron = Object.freeze({
  parse: parseRon,
  stringify: stringifyRon,
  Some,
  Tuple,
  Enum,
  some: value => new Some(value),
  tuple: (...values) => new Tuple(values),
  variant: (name, payload) => {
    if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw $ERR_INVALID_ARG_VALUE("name", name, "must be an identifier");
    }
    if (payload === undefined) return new Enum(name);
    if (Array.isArray(payload)) return new Enum(name, payload);
    return new Enum(name, undefined, validateOptions("payload", payload));
  },
});

// ---------------------------------------------------------------------------------------------
// cosmic-config: $XDG_CONFIG_HOME/cosmic/<name>/v<version>/<key>, one RON value per file, system
// defaults under $XDG_DATA_HOME:$XDG_DATA_DIRS/cosmic/<name>/v<version>/<key>, state under
// $XDG_STATE_HOME. Writes go through a `.atomicwrite*` file and a rename, like the atomicwrites
// crate cosmic-config uses, so readers and watchers never see half a file.

const ATOMIC_PREFIX = ".atomicwrite";

function validateComponent(kind, value) {
  if (typeof value !== "string") throw $ERR_INVALID_ARG_TYPE(kind, "string", value);
  if (value === "" || value === "." || value === ".." || /[/\\\0]/.test(value)) {
    throw $ERR_INVALID_ARG_VALUE(kind, value, "must be a single path component");
  }
  return value;
}

function readValue(file) {
  let source;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return undefined;
    throw error;
  }
  return parseRon(source);
}

function listDir(dir, into) {
  let names;
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return;
    throw error;
  }
  for (const entry of names) {
    const { name } = entry;
    if (entry.isFile() && !name.startsWith(ATOMIC_PREFIX)) into.add(name);
  }
}

let atomicCounter = 0;

class Config {
  #userDir;
  #previousDir;
  #defaultDirs;

  constructor(name, version, state) {
    const env = process.env;
    const home = env.HOME || os.homedir();
    // cosmic-config follows dirs::config_dir() / dirs::state_dir(): %APPDATA% and %LOCALAPPDATA% on Windows.
    const base = isWindows
      ? state
        ? env.XDG_STATE_HOME || env.LOCALAPPDATA || path.join(home, "AppData", "Local")
        : env.XDG_CONFIG_HOME || env.APPDATA || path.join(home, "AppData", "Roaming")
      : state
        ? env.XDG_STATE_HOME || path.join(home, ".local", "state")
        : env.XDG_CONFIG_HOME || path.join(home, ".config");
    const relative = path.join("cosmic", name, `v${version}`);
    this.name = name;
    this.version = version;
    this.#userDir = path.join(base, relative);
    this.#previousDir = version > 1 ? path.join(base, "cosmic", name, `v${version - 1}`) : undefined;
    // XDG variables win on Windows too, as for the config and state bases above.
    const defaults = isWindows
      ? [
          env.XDG_DATA_HOME,
          ...(env.XDG_DATA_DIRS || "").split(path.delimiter),
          env.ProgramData || "C:\\ProgramData",
        ].filter(Boolean)
      : xdgDataDirs();
    this.#defaultDirs = state ? [] : defaults.map(dir => path.join(dir, relative));
  }

  get path() {
    return this.#userDir;
  }

  getLocal(key) {
    validateComponent("key", key);
    const value = readValue(path.join(this.#userDir, key));
    if (value !== undefined || this.#previousDir === undefined) return value;
    return readValue(path.join(this.#previousDir, key));
  }

  getDefault(key) {
    validateComponent("key", key);
    for (const dir of this.#defaultDirs) {
      const value = readValue(path.join(dir, key));
      if (value !== undefined) return value;
    }
    return undefined;
  }

  get(key) {
    const value = this.getLocal(key);
    return value !== undefined ? value : this.getDefault(key);
  }

  set(key, value) {
    validateComponent("key", key);
    const text = stringifyRon(value);
    fs.mkdirSync(this.#userDir, { recursive: true });
    const target = path.join(this.#userDir, key);
    const temp = path.join(this.#userDir, `${ATOMIC_PREFIX}.${key}.${process.pid}.${atomicCounter++}`);
    try {
      fs.writeFileSync(temp, text);
      fs.renameSync(temp, target);
    } catch (error) {
      try {
        fs.unlinkSync(temp);
      } catch {}
      throw error;
    }
  }

  delete(key) {
    validateComponent("key", key);
    try {
      fs.unlinkSync(path.join(this.#userDir, key));
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  }

  keys() {
    const keys = new Set();
    listDir(this.#userDir, keys);
    for (const dir of this.#defaultDirs) listDir(dir, keys);
    return [...keys].sort();
  }

  /** Calls `listener(key)` whenever a key of this config changes on disk; returns the watcher. */
  watch(listener) {
    if (typeof listener !== "function") throw $ERR_INVALID_ARG_TYPE("listener", "function", listener);
    fs.mkdirSync(this.#userDir, { recursive: true });
    const watcher = fs.watch(this.#userDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const key = path.basename(String(filename));
      if (key.startsWith(ATOMIC_PREFIX)) return;
      listener(key);
    });
    return watcher;
  }
}

function openConfig(name, version = 1, options) {
  validateComponent("name", name);
  if (!Number.isInteger(version) || version < 0) {
    throw $ERR_OUT_OF_RANGE("version", "a non-negative integer", version);
  }
  options = validateOptions("options", options);
  const state = options.state ?? false;
  if (typeof state !== "boolean") throw $ERR_INVALID_ARG_TYPE("options.state", "boolean", state);
  return new Config(name, version, state);
}

const config = Object.freeze({ open: openConfig });

// ---------------------------------------------------------------------------------------------
// libcosmic windows and notifications through the `bun-cosmic` helper

function helperPath() {
  const env = process.env.BUN_COSMIC_HELPER;
  if (env) return env;
  const onPath = Bun.which("bun-cosmic");
  if (onPath) return onPath;
  const beside = path.join(path.dirname(process.execPath), isWindows ? "bun-cosmic.exe" : "bun-cosmic");
  if (fs.existsSync(beside)) return beside;
  const error = new Error(
    "bun-cosmic helper not found: build packages/bun-cosmic, then put it on PATH, next to bun, or in BUN_COSMIC_HELPER",
  );
  error.code = "ERR_BUN_COSMIC_HELPER_NOT_FOUND";
  throw error;
}

function helperError(message) {
  const error = new Error(`bun-cosmic: ${message}`);
  error.code = "ERR_BUN_COSMIC_HELPER";
  return error;
}

async function* events(stream) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield JSON.parse(buffer);
}

function spawnHelper(args) {
  return Bun.spawn({
    cmd: [helperPath(), ...args],
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
}

function optionString(name, value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw $ERR_INVALID_ARG_TYPE(name, "string", value);
  return value;
}

function openWindow(options) {
  if (!isSupported) throw unsupportedError();
  options = validateOptions("options", options);
  const title = optionString("options.title", options.title) ?? "Bun";
  const body = optionString("options.body", options.body) ?? "";
  const buttons = stringList("options.buttons", options.buttons, () => ["OK"]);
  const args = ["window", `--title=${title}`, `--body=${body}`];
  for (const label of buttons) args.push(`--button=${label}`);
  const width = positive("options.width", options.width, undefined);
  const height = positive("options.height", options.height, undefined);
  if (width !== undefined) args.push(`--width=${width}`);
  if (height !== undefined) args.push(`--height=${height}`);

  const proc = spawnHelper(args);
  const ready = Promise.withResolvers();
  const closed = Promise.withResolvers();
  // Unobserved rejections of `ready` must not crash the process when only `closed` is awaited.
  ready.promise.catch(() => {});
  (async () => {
    let result = null;
    let failure;
    for await (const event of events(proc.stdout)) {
      if (event.event === "ready") ready.resolve();
      else if (event.event === "button") result = { button: event.index, label: event.label };
      else if (event.event === "error") failure = helperError(event.message);
    }
    const exitCode = await proc.exited;
    if (!failure && exitCode !== 0 && result === null && proc.signalCode == null) {
      failure = helperError(`exited with code ${exitCode}`);
    }
    if (failure) {
      ready.reject(failure);
      closed.reject(failure);
    } else {
      ready.resolve();
      closed.resolve(result);
    }
  })().catch(error => {
    ready.reject(error);
    closed.reject(error);
  });

  return {
    pid: proc.pid,
    ready: ready.promise,
    closed: closed.promise,
    close() {
      proc.kill();
    },
  };
}

const URGENCIES = ["low", "normal", "critical"];

async function notify(options) {
  if (!isSupported) throw unsupportedError();
  options = validateOptions("options", options);
  const summary = optionString("options.summary", options.summary);
  if (summary === undefined) throw $ERR_INVALID_ARG_TYPE("options.summary", "string", summary);
  const args = ["notify", `--summary=${summary}`];
  for (const [name, flag] of [
    ["body", "body"],
    ["icon", "icon"],
    ["appName", "app-name"],
  ]) {
    const value = optionString(`options.${name}`, options[name]);
    if (value !== undefined) args.push(`--${flag}=${value}`);
  }
  const { timeout, urgency } = options;
  if (timeout !== undefined) {
    if (!Number.isInteger(timeout) || timeout < -1 || timeout > 2147483647) {
      throw $ERR_OUT_OF_RANGE("options.timeout", "an integer from -1 to 2147483647", timeout);
    }
    args.push(`--timeout=${timeout}`);
  }
  if (urgency !== undefined) {
    oneOf("options.urgency", urgency, URGENCIES, 1);
    args.push(`--urgency=${urgency}`);
  }
  const actions = validateOptions("options.actions", options.actions);
  for (const id of Object.keys(actions)) {
    const label = actions[id];
    if (typeof label !== "string") throw $ERR_INVALID_ARG_TYPE(`options.actions.${id}`, "string", label);
    if (id.includes("=")) throw $ERR_INVALID_ARG_VALUE("options.actions", id, "action ids must not contain '='");
    args.push(`--action=${id}=${label}`);
  }
  if (options.wait) args.push("--wait");

  if (isWindows) {
    // Toasts go through bun:windows (WinRT ToastNotificationManager); actions and wait are not wired yet.
    require("./windows").notify(summary, optionString("options.body", options.body));
    return { id: undefined, action: null };
  }

  const proc = spawnHelper(args);
  let id;
  let action = null;
  let failure;
  for await (const event of events(proc.stdout)) {
    if (event.event === "shown") id = event.id;
    else if (event.event === "action") action = event.action;
    else if (event.event === "error") failure = helperError(event.message);
  }
  const exitCode = await proc.exited;
  if (failure) throw failure;
  if (exitCode !== 0) throw helperError(`exited with code ${exitCode}`);
  return { id, action };
}

export default {
  isSupported,
  text,
  apps,
  config,
  ron,
  openWindow,
  notify,
};
