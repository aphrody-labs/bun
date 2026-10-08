// Proves the PostCSS worker ran, and on which runtime.
module.exports = () => ({
  postcssPlugin: "mark",
  Once(root) {
    root.append({ selector: "#runtime-mark", nodes: [] });
    root.last.append({ prop: "--postcss-runtime", value: typeof Bun === "undefined" ? "node" : "bun" });
  },
});
module.exports.postcss = true;
