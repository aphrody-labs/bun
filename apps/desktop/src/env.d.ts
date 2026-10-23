// SPDX-License-Identifier: Apache-2.0
// Side-effect stylesheet imports, compiled by @aphrody/bun-plugin-tailwind in build.ts.
declare module "*.css";

// Files imported with `type: "file"`: the module value is the path of the (embedded) file.
declare module "*.ico" {
  const path: string;
  export default path;
}
declare module "*.webmanifest" {
  const path: string;
  export default path;
}
