import { BunPlugin } from "bun";
import { readFileSync } from "fs";
import { load } from "js-yaml";

function YamlPlugin(): BunPlugin {
  return {
    name: "@aphrody/bun-plugin-yaml",
    setup(builder) {
      builder.onLoad({ filter: /\.(yaml|yml)$/ }, args => {
        const text = readFileSync(args.path, "utf8");
        const data = load(text);
        // Default export like Bun's built-in YAML loader; top-level mapping keys are also named exports.
        const named = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
        return {
          exports: { ...named, default: data },
          loader: "object",
        };
      });
    },
  };
}

export default YamlPlugin;
