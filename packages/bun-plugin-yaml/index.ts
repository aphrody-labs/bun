import type { BunPlugin } from "bun";

function YamlPlugin(): BunPlugin {
  return {
    name: "@aphrody/bun-plugin-yaml",
    setup(builder) {
      builder.onLoad({ filter: /\.(yaml|yml)$/ }, async args => {
        const data = Bun.YAML.parse(await Bun.file(args.path).text());
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
