export type ExperimentalFeatureFlag = { name: string; defaultEnabled: boolean };

export function experimentalFeatureFlags(source: string): ExperimentalFeatureFlag[] {
  const flags = new Map<string, ExperimentalFeatureFlag>();
  for (let i = 0; i < source.length;) {
    if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i + 2);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < source.length && depth) {
        if (source.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (source.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth) throw new Error("Unterminated Rust comment in feature flag source");
      continue;
    }
    const raw = source[i] === "r" ? /^r(#{0,255})"/.exec(source.slice(i)) : null;
    if (raw) {
      const end = source.indexOf('"' + raw[1], i + raw[0].length);
      if (end < 0) throw new Error("Unterminated Rust raw string in feature flag source");
      i = end + 1 + raw[1]!.length;
      continue;
    }
    if (source[i] === '"') {
      i++;
      let closed = false;
      while (i < source.length) {
        if (source[i] === "\\") i += 2;
        else if (source[i++] === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) throw new Error("Unterminated Rust string in feature flag source");
      continue;
    }
    if (source[i] === "'") {
      const char = /^'(?:\\(?:u\{[0-9a-fA-F]+\}|.)|[^'\\\r\n])'/.exec(source.slice(i));
      if (char) {
        i += char[0].length;
        continue;
      }
    }
    if (source.startsWith("new_feature_flag!", i) && !/[A-Za-z0-9_]/.test(source[i - 1] ?? "")) {
      const declaration =
        /^new_feature_flag!\s*\(\s*pub\s+(BUN_[A-Z0-9_]+)\s*,\s*"([^"]+)"\s*,\s*\{([^}]*)\}\s*\)\s*;/.exec(
          source.slice(i),
        );
      if (declaration) {
        const [, name, key, options] = declaration;
        if (name!.includes("EXPERIMENTAL")) {
          if (name !== key || flags.has(name!)) throw new Error("Ambiguous experimental feature flag declaration");
          const defaults = options!.replace(/\s/g, "").replace(/,$/, "");
          if (!["", "default:false", "default:true", "default:None"].includes(defaults))
            throw new Error("Unsupported experimental feature flag default: " + name);
          flags.set(name!, { name: name!, defaultEnabled: defaults === "default:true" });
        }
        i += declaration[0].length;
        continue;
      }
    }
    i++;
  }
  return [...flags.values()].sort((a, b) => a.name.localeCompare(b.name));
}
