/** @type {import('next').NextConfig} */
const config = {
  outputFileTracingRoot: __dirname,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: { root: __dirname },
  generateBuildId: async () => "bun-app",
};

// Bun's bundler (@aphrody/next-bun) is opt-in so the same fixture also builds with Turbopack and webpack.
module.exports = process.env.NEXT_BUN_BUNDLER ? require("@aphrody/next-bun").withBun(config) : config;
