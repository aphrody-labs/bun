/** @type {import('next').NextConfig} */
const config = {
  outputFileTracingRoot: __dirname,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  generateBuildId: async () => "bun-pages",
};

// The Bun bundler is opt-in so the same fixture also builds with `--webpack`.
module.exports = process.env.NEXT_BUN_BUNDLER ? require("@aphrody/next-bun").withBun(config) : config;
