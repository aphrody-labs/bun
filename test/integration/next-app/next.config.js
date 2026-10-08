/** @type {import('next').NextConfig} */
module.exports = {
  outputFileTracingRoot: __dirname,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: { root: __dirname },
  generateBuildId: async () => "bun-app",
};
