import { applyReplacements, function_replacements } from "./replacements";

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createStopRegex(allow_comma: boolean, moduleImports = false) {
  return new RegExp(
    "((?:[(,=;:{]|return|\\=\\>)\\s*)\\/[^\\/\\*]|\\/\\*|\\/\\/|['\"}`\\)" +
      (allow_comma ? "," : "") +
      "]|(?<!\\$)\\brequire\\(|(" +
      function_replacements.map(x => escapeRegex(x) + "\\(").join("|") +
      ")" +
      (moduleImports ? "|\\bimport\\b|\\bexport(?=\\s*{\\s*}\\s*;)" : ""),
  );
}

const stop_regex_comma = createStopRegex(true);
const stop_regex_no_comma = createStopRegex(false);
const stop_regex_module_comma = createStopRegex(true, true);
const stop_regex_module_no_comma = createStopRegex(false, true);

/**
 * Slices a string until it hits a }, but keeping in mind JS comments,
 * regex, template literals, comments, and matching {
 *
 * Used to extract function bodies without parsing the code.
 *
 * If you pass replace=true, it will run replacements on the code
 */
export function sliceSourceCode(
  contents: string,
  replace: boolean,
  replaceRequire?: (specifier: string) => string,
  endOnComma = false,
  moduleImports?: string[],
): { result: string; rest: string } {
  let bracketCount = 0;
  let i = 0;
  let result = "";
  while (contents.length) {
    const stop = moduleImports
      ? endOnComma && bracketCount <= 1
        ? stop_regex_module_comma
        : stop_regex_module_no_comma
      : endOnComma && bracketCount <= 1
        ? stop_regex_comma
        : stop_regex_no_comma;
    const match = contents.match(stop);
    i = match?.index ?? contents.length;
    if (match?.[2]) {
      i += match[2].length - 1;
    }
    bracketCount += [...contents.slice(0, i).matchAll(/[({]/g)].length;
    const chunk = replace ? applyReplacements(contents, i) : [contents.slice(0, i), contents.slice(i)];
    result += chunk[0];
    contents = chunk[1] as string;
    if (chunk[2]) {
      continue;
    }
    if (match?.[1]) {
      if (match[1].startsWith("(") || match[1].startsWith(",")) {
        bracketCount++;
      }
      const { result: result2, rest } = sliceRegularExpressionSourceCode(contents.slice(match?.[1].length + 1));
      result += contents.slice(0, match?.[1].length + 1) + result2;
      contents = rest;
      continue;
    }
    if (!contents.length) break;
    if (contents.startsWith("/*")) {
      i = contents.slice(2).indexOf("*/") + 2;
    } else if (contents.startsWith("//")) {
      i = contents.slice(2).indexOf("\n") + 2;
    } else if (contents.startsWith("'")) {
      i = getEndOfBasicString(contents.slice(1), "'") + 2;
    } else if (contents.startsWith('"')) {
      i = getEndOfBasicString(contents.slice(1), '"') + 2;
    } else if (contents.startsWith("`")) {
      const { result: result2, rest } = sliceTemplateLiteralSourceCode(contents.slice(1), replace, replaceRequire);
      result += "`" + result2;
      contents = rest;
      i = 0;
      continue;
    } else if (contents.startsWith("}")) {
      bracketCount--;
      if (bracketCount <= 0) {
        result += "}";
        contents = contents.slice(1);
        break;
      }
      i = 1;
    } else if (contents.startsWith(")")) {
      bracketCount--;
      if (bracketCount <= 0) {
        result += ")";
        contents = contents.slice(1);
        break;
      }
      i = 1;
    } else if (endOnComma && contents.startsWith(",")) {
      if (bracketCount <= 1) {
        contents = contents.slice(1);
        // if the next non-whitespace character is ), we will treat it like a )
        let match = contents.match(/^\s*\)/);
        if (match) {
          contents = contents.slice(match[0].length);
          result += ")";
        } else {
          result += ",";
        }
        break;
      }
      i = 1;
    } else if (moduleImports && contents.startsWith("import")) {
      const end = bracketCount === 1 ? getEndOfImportStatement(contents) : undefined;
      if (end !== undefined) {
        moduleImports.push(contents.slice(0, end));
        contents = contents.slice(end);
        continue;
      }
      i = "import".length;
    } else if (moduleImports && contents.startsWith("export")) {
      const emptyExport = bracketCount === 1 && /^export\s*{\s*}\s*;/.exec(contents);
      if (emptyExport) {
        contents = contents.slice(emptyExport[0].length);
        continue;
      }
      i = "export".length;
    } else if (contents.startsWith("require(")) {
      if (replaceRequire) {
        const staticSpecifier = contents.match(/\brequire\(["']([^"']+)["']\)/);
        if (staticSpecifier) {
          const specifier = staticSpecifier[1];
          result += replaceRequire(specifier);
          contents = contents.slice(staticSpecifier[0].length);
          continue;
        } else {
          throw new Error("Require with dynamic specifier not supported here.");
        }
      } else {
        throw new Error("Require is not supported here.");
      }
    } else {
      console.error(contents.slice(0, 100));
      throw new Error("TODO");
    }
    result += contents.slice(0, i);
    contents = contents.slice(i);
  }

  return { result, rest: contents };
}

function sliceTemplateLiteralSourceCode(
  contents: string,
  replace: boolean,
  replaceRequire?: (specifier: string) => string,
) {
  let i = 0;
  let result = "";
  while (contents.length) {
    const match = contents.match(/`|\${|\\/);
    if (!match) throw new Error("Template literal did not end");
    i = match.index!;
    result += contents.slice(0, i);
    contents = contents.slice(i);
    if (!contents.length) break;
    if (contents.startsWith("\\")) {
      result += contents.slice(0, 2);
      contents = contents.slice(2);
      continue;
    } else if (contents.startsWith("`")) {
      result += "`";
      contents = contents.slice(1);
      break;
    } else if (contents.startsWith("$")) {
      const { result: result2, rest } = sliceSourceCode(contents.slice(1), replace, replaceRequire);
      result += "$" + result2;
      contents = rest;
      continue;
    } else {
      throw new Error("TODO");
    }
  }

  return { result, rest: contents };
}

function skipTrivia(source: string, start: number): number {
  let i = start;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) throw new Error("Import comment did not end");
      i = end + 2;
    } else if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i + 2);
      i = end < 0 ? source.length : end + 1;
    } else {
      break;
    }
  }
  return i;
}

function getEndOfImportStatement(source: string): number | undefined {
  let i = skipTrivia(source, "import".length);
  if (source[i] === "(" || source[i] === ".") return;
  let braces = 0;
  let module = false;
  while (i < source.length) {
    i = skipTrivia(source, i);
    const character = source[i];
    if (character === "'" || character === '"') {
      const end = i + getEndOfBasicString(source.slice(i + 1), character) + 2;
      if (module || (braces === 0 && i === skipTrivia(source, "import".length))) {
        let trailing = skipTrivia(source, end);
        const attributes = /^(?:with|assert)\b/.exec(source.slice(trailing));
        if (attributes) {
          trailing = skipTrivia(source, trailing + attributes[0].length);
          if (source[trailing] !== "{") return;
          let depth = 1;
          trailing++;
          while (depth > 0 && trailing < source.length) {
            trailing = skipTrivia(source, trailing);
            const next = source[trailing];
            if (next === "'" || next === '"') {
              trailing += getEndOfBasicString(source.slice(trailing + 1), next) + 2;
            } else {
              if (next === "{") depth++;
              else if (next === "}") depth--;
              trailing++;
            }
          }
          if (depth !== 0) throw new Error("Import attributes did not end");
          const semicolon = skipTrivia(source, trailing);
          return source[semicolon] === ";" ? semicolon + 1 : trailing;
        }
        return source[trailing] === ";" ? trailing + 1 : end;
      }
      i = end;
    } else if (character === "{") {
      braces++;
      i++;
    } else if (character === "}") {
      if (--braces < 0) return;
      i++;
    } else if (character === ";" || character === "(" || character === "=" || character === undefined) {
      return;
    } else if (
      braces === 0 &&
      source.startsWith("from", i) &&
      !/[\w$]/.test(source[i - 1] ?? "") &&
      !/[\w$]/.test(source[i + 4] ?? "")
    ) {
      const next = skipTrivia(source, i + 4);
      if (source[next] === "'" || source[next] === '"') module = true;
      i = next;
    } else {
      i++;
    }
  }
}

function sliceRegularExpressionSourceCode(contents: string) {
  let i = 0;
  let result = "";
  while (contents.length) {
    i = contents.match(/\/(?!\/|\*)|\\|\[/)!.index!;
    result += contents.slice(0, i);
    contents = contents.slice(i);
    if (!contents.length) break;
    if (contents.startsWith("/")) {
      result += "/";
      contents = contents.slice(1);
      break;
    } else if (contents.startsWith("\\")) {
      result += "\\";
      contents = contents.slice(1);
      if (!contents.length) break;
      result += contents[0];
      contents = contents.slice(1);
      continue;
    } else if (contents.startsWith("[")) {
      let end = contents.match(/(?<!\\)]/)!.index!;
      result += contents.slice(0, end + 1);
      contents = contents.slice(end + 1);
      continue;
    } else {
      throw new Error("TODO");
    }
  }

  return { result, rest: contents };
}

function getEndOfBasicString(str: string, quote: "'" | '"') {
  let i = 0;
  while (i < str.length) {
    if (str[i] === "\\") {
      i++;
    } else if (str[i] === quote) {
      return i;
    }
    i++;
  }
  throw new Error("String did not end");
}
