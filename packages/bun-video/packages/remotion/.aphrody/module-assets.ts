import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { BunPlugin } from "bun";
import { transformSync as esbuildTransformSync } from "./build-deps/node_modules/esbuild/lib/main.js";

const root = resolve(import.meta.dir, "..");

/** Isolated transpilation cannot infer a type-only re-export from another file. */
export function rewriteIsolatedTypeExports(text: string, sourceFile: string): string {
  return text.replace(
    /export\s*\{([^}]+)\}\s*from\s*(['"])(\.[^'"]+)\2/g,
    (statement, names: string, quote: string, specifier: string) => {
      const stem = resolve(dirname(sourceFile), specifier.replace(/\.(?:js|mjs|cjs)$/, ""));
      const target = [
        stem + ".ts",
        stem + ".tsx",
        stem + ".mts",
        stem + ".cts",
        stem + "/index.ts",
        stem + "/index.tsx",
        stem + "/index.mts",
        stem + "/index.cts",
      ].find(existsSync);
      if (!target) return statement;
      const declaredTypes = new Set(
        [
          ...readFileSync(target, "utf8").matchAll(
            /export\s+(?:declare\s+)?(?:type|interface)\s+(\w+)/g,
          ),
        ].map((match) => match[1]),
      );
      const targetText = readFileSync(target, "utf8");
      for (const match of targetText.matchAll(/export\s+type\s*\{([^}]+)\}/g)) {
        for (const name of match[1]!.split(",")) {
          const exported = name
            .trim()
            .split(/\s+as\s+/)
            .pop();
          if (exported) declaredTypes.add(exported);
        }
      }
      for (const match of targetText.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const name of match[1]!.split(",")) {
          if (!name.trim().startsWith("type ")) continue;
          const exported = name
            .trim()
            .replace(/^type\s+/, "")
            .split(/\s+as\s+/)
            .pop();
          if (exported) declaredTypes.add(exported);
        }
      }
      const exports = names
        .split(",")
        .map((name: string) => {
          const clean = name.trim();
          if (!clean || clean.startsWith("type ")) return name;
          const original = clean.split(/\s+as\s+/)[0]!;
          return declaredTypes.has(original) ? name.replace(original, "type " + original) : name;
        })
        .join(",");
      return `export {${exports}} from ${quote}${specifier}${quote}`;
    },
  );
}

/** Materialize real module files because the native Rspack resolver cannot read Bun's virtual filesystem. */
export async function remotionModuleAssetsPlugin(): Promise<BunPlugin> {
  const stage = resolve(root, "../../../tmp/bun-video-build/remotion-module-assets");
  mkdirSync(join(stage, "node_modules"), { recursive: true });
  const files: { source: string; destination: string }[] = [];
  function addTree(source: string, destination: string, transpile = false) {
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name === "node_modules" || entry.name === ".git")
        continue;
      if (transpile && /^(test|tests|__tests__|visual-test|fixtures)$/.test(entry.name)) continue;
      const from = join(source, entry.name),
        to = join(destination, entry.name);
      if (entry.isDirectory()) addTree(from, to, transpile);
      else if (entry.isFile()) {
        if (transpile && entry.name.endsWith(".d.ts")) continue;
        const output = transpile ? to.replace(/\.(tsx?|jsx)$/, ".js") : to;
        mkdirSync(resolve(output, ".."), { recursive: true });
        if (transpile && /\.(tsx?|jsx)$/.test(entry.name)) {
          const loader = entry.name.endsWith(".tsx")
            ? "tsx"
            : entry.name.endsWith(".jsx")
              ? "jsx"
              : "ts";
          const sourceText = rewriteIsolatedTypeExports(readFileSync(from, "utf8"), from);
          let transformed = new Bun.Transpiler({
            loader,
            target: "browser",
            tsconfig: { compilerOptions: { jsx: "react" } },
          }).transformSync(sourceText);
          if (transformed.includes('"bun:wrap"')) {
            transformed = esbuildTransformSync(sourceText, {
              loader,
              target: "es2022",
              format: "esm",
              jsx: "transform",
              sourcefile: from,
            }).code;
          }
          writeFileSync(
            output,
            transformed.replace(
              /((?:from\s*|import\s*\(\s*|import\s*)["'])(\.{1,2}\/[^"']+)(["'])/g,
              (match, prefix, specifier, suffix) => {
                if (/\.(tsx?|jsx)$/i.test(specifier))
                  return prefix + specifier.replace(/\.(tsx?|jsx)$/, ".js") + suffix;
                const stem = resolve(dirname(from), specifier);
                if (
                  [".ts", ".tsx", ".js", ".jsx"].some((extension) => existsSync(stem + extension))
                )
                  return prefix + specifier + ".js" + suffix;
                if (
                  ["index.ts", "index.tsx", "index.js", "index.jsx"].some((name) =>
                    existsSync(join(stem, name)),
                  )
                )
                  return prefix + specifier + "/index.js" + suffix;
                return match;
              },
            ),
          );
        } else copyFileSync(from, output);
      }
    }
  }
  const registry = join(root, ".aphrody/build-deps/node_modules");
  addTree(registry, join(stage, "node_modules"));
  const manifests = new Map<string, string>();
  for (const entry of readdirSync(join(root, "packages"), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const source = join(root, "packages", entry.name),
      manifestPath = join(source, "package.json");
    if (!existsSync(manifestPath) || !existsSync(join(source, "src"))) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!manifest.name) continue;
    const destination = join(stage, "node_modules", manifest.name);
    mkdirSync(destination, { recursive: true });
    addTree(join(source, "src"), join(destination, "src"), true);
    if (manifest.name === "@remotion/bundler") {
      const loader = join(destination, "src/esbuild-loader/index.js");
      writeFileSync(
        loader,
        readFileSync(loader, "utf8").replace(
          'from "esbuild"',
          'from "../../../../esbuild/lib/main.js"',
        ),
      );
    }
    if (manifest.name === "@remotion/timeline-utils") {
      const workerFactory = join(destination, "src/audio-waveform/make-audio-waveform-worker.js");
      writeFileSync(
        workerFactory,
        readFileSync(workerFactory, "utf8").replaceAll(
          "./audio-waveform-worker.mjs",
          "../audio-waveform-worker.js",
        ),
      );
    }
    if (["remotion", "@remotion/studio", "@remotion/timeline-utils"].includes(manifest.name)) {
      const esm = join(destination, manifest.name === "remotion" ? "esm" : "src/esm");
      addTree(join(source, "src"), esm, true);
      for (const name of readdirSync(esm)) {
        if (name.endsWith(".js"))
          copyFileSync(join(esm, name), join(esm, name.replace(/\.js$/, ".mjs")));
      }
    }
    const rewrite = (value: unknown): unknown => {
      if (typeof value === "string")
        return value
          .replace(/^(\.\/)?dist\/(?:cjs\/|esm\/)?/, "./src/")
          .replace(/\.(?:mjs|tsx?|jsx)$/, ".js");
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
      return value;
    };
    manifest.main = rewrite(manifest.main ?? "./dist/index.js");
    if (manifest.main === "dist") manifest.main = "./src/index.js";
    manifest.module = rewrite(manifest.module ?? manifest.main);
    manifest.exports = rewrite(manifest.exports);
    manifest.type = "module";
    writeFileSync(join(destination, "package.json"), JSON.stringify(manifest));
    for (const name of readdirSync(source)) {
      const from = join(source, name);
      if (/\.(?:js|mjs|cjs|json|css|ico)$/.test(name) && name !== "package.json") {
        copyFileSync(from, join(destination, name));
      }
    }
    if (existsSync(join(root, "LICENSE.md")))
      copyFileSync(join(root, "LICENSE.md"), join(destination, "LICENSE.md"));
    manifests.set(manifest.name, destination);
  }
  function inventory(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inventory(path);
      else if (entry.isFile())
        files.push({
          source: path,
          destination: path.slice(stage.length + 1).replaceAll("\\", "/"),
        });
    }
  }
  inventory(stage);
  const imports = files
    .map(
      (file, index) =>
        `import file${index} from ${JSON.stringify(file.source)} with {type:"file"};`,
    )
    .join("\n");
  const entries = files
    .map((file, index) => `[${JSON.stringify(file.destination)}, file${index}]`)
    .join(",\n");
  const contents = `${imports}
import Module, {builtinModules} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
const entries = [${entries}];
const workspaceNames = new Set(${JSON.stringify([...manifests.keys()])});
const originalRoot = ${JSON.stringify(root.replaceAll("\\", "/"))};
let directory;
function extract() {
  if (directory) return directory;
  const candidate = mkdtempSync(join(tmpdir(), 'bun-video-remotion-modules-'));
  directory = candidate;
  try {
    for (const [name, embedded] of entries) {
      const path = join(candidate, name);
      mkdirSync(dirname(path), {recursive:true});
      writeFileSync(path, readFileSync(embedded));
    }
  } catch(error) {directory = undefined; rmSync(candidate, {recursive:true}); throw error;}
  process.once('exit', () => { try {rmSync(candidate, {recursive:true});} catch(error) {if(error.code !== 'EPERM' && error.code !== 'EBUSY') throw error;} });
  return candidate;
}
const original = Module._resolveFilename;
let resolving = false;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (resolving) return original.call(this, request, parent, isMain, options);
  if (request.startsWith('node:') || builtinModules.includes(request)) return original.call(this, request, parent, isMain, options);
  const name = request.startsWith('@') ? request.split('/').slice(0,2).join('/') : request.split('/')[0];
  const filename = (parent?.filename ?? '').replaceAll('\\\\', '/');
  if (workspaceNames.has(name) || filename.startsWith(originalRoot)) {
    const materialized = extract();
    let parentPath = join(materialized, 'node_modules', '@remotion', 'bundler', 'src', 'index.js');
    const registryOffset = filename.indexOf('/.aphrody/build-deps/node_modules/');
    if (registryOffset >= 0) parentPath = join(materialized, 'node_modules', filename.slice(registryOffset + '/.aphrody/build-deps/node_modules/'.length));
    if (request.startsWith('./setup-') || request.startsWith('./fast-refresh/') || request.startsWith('./esbuild-loader/') || request === '../react-shim.js') parentPath = join(materialized, 'node_modules', '@remotion', 'bundler', 'src', 'index.js');
    for (const [packageName, source] of ${JSON.stringify(
      [...manifests.entries()].map(([name]) => [
        name,
        `${root.replaceAll("\\", "/")}/packages/${readdirSync(join(root, "packages")).find(
          (directory) => {
            const p = join(root, "packages", directory, "package.json");
            return existsSync(p) && JSON.parse(readFileSync(p, "utf8")).name === name;
          },
        )}/src/`,
      ]),
    )}) {
      if (filename.startsWith(source)) parentPath = join(materialized, 'node_modules', packageName, 'src', filename.slice(source.length).replace(/\\.(tsx?|jsx)$/, '.js'));
    }
    resolving = true;
    try {
      const packageManifest = join(materialized, 'node_modules', name, 'package.json');
      if (!request.startsWith('.') && !request.startsWith('/') && existsSync(packageManifest)) {
        const manifest = JSON.parse(readFileSync(packageManifest, 'utf8'));
        const subpath = request.slice(name.length);
        let target = subpath ? manifest.exports?.['.' + subpath] ?? '.' + subpath : manifest.exports?.['.'] ?? manifest.main ?? './index.js';
        if (target && typeof target === 'object') target = target.import ?? target.module ?? target.require ?? target.default;
        if (typeof target === 'string') {
          const candidate = join(materialized, 'node_modules', name, target);
          const found = [candidate, candidate + '.js', candidate + '.json', join(candidate, 'index.js')].find(existsSync);
          if (found) return found;
        }
      }
      return Bun.resolveSync(request, dirname(parentPath));
    }
    finally { resolving = false; }
  }
  return original.call(this, request, parent, isMain, options);
};
globalThis[Symbol.for('bun-video.remotion.resolve')] = (request, filename) => Module._resolveFilename(request, {filename}, false);
`;
  return {
    name: "remotion-physical-module-assets",
    setup(build) {
      build.onResolve({ filter: /^bun-video-remotion-module-assets$/ }, () => ({
        path: "assets",
        namespace: "remotion-physical-modules",
      }));
      build.onLoad({ filter: /.*/, namespace: "remotion-physical-modules" }, () => ({
        contents,
        loader: "js",
      }));
      build.onLoad({ filter: /[\\/]packages[\\/]cli[\\/]src[\\/]index\.ts$/ }, async ({ path }) => {
        if (!path.startsWith(root)) return;
        return {
          contents: 'import "bun-video-remotion-module-assets";\n' + (await Bun.file(path).text()),
          loader: "ts",
        };
      });
      build.onLoad({ filter: /[\\/]packages[\\/]bundler[\\/].*\.[jt]sx?$/ }, async ({ path }) => {
        if (!path.startsWith(root)) return;
        const source = await Bun.file(path).text();
        if (!source.includes("require.resolve")) return;
        return {
          contents:
            'import "bun-video-remotion-module-assets";\n' +
            `const __physicalRequireResolve = (request) => globalThis[Symbol.for('bun-video.remotion.resolve')](request, ${JSON.stringify(path)});\n` +
            source.replaceAll("require.resolve", "__physicalRequireResolve"),
          loader: path.endsWith(".tsx") ? "tsx" : path.endsWith(".ts") ? "ts" : "js",
        };
      });
    },
  };
}
