// Builds libbun_llama from a pinned llama.cpp checkout: `bun native/build.ts [--src DIR] [--out DIR] [--jobs N] [--portable]`.
// CPU only. -march=native is on by default (GGML_NATIVE); --portable builds for the baseline target.
import { $ } from "bun";
import { cpus } from "node:os";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const LLAMA_TAG = "b11524";
const LLAMA_COMMIT = "86a283532072722c5f3363d37d59a874d09fa99b";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const root = resolve(import.meta.dir, "..");
const buildDir = resolve(option("--out", join(root, "build")));
const src = resolve(option("--src", join(buildDir, "llama.cpp")));
const jobs = option("--jobs", String(Math.max(1, cpus().length - 1)));
const portable = args.includes("--portable");
const fwd = (path: string) => path.replaceAll("\\", "/");

mkdirSync(buildDir, { recursive: true });
if (!existsSync(join(src, "include", "llama.h"))) {
  await $`git clone --depth 1 --branch ${LLAMA_TAG} https://github.com/ggml-org/llama.cpp ${src}`;
}
const head = (await $`git -C ${src} rev-parse HEAD`.text()).trim();
if (head !== LLAMA_COMMIT) throw new Error(`llama.cpp at ${head}, expected ${LLAMA_COMMIT} (${LLAMA_TAG})`);

const cmakeDir = join(buildDir, "cmake");
await Bun.write(
  join(cmakeDir, "CMakeLists.txt"),
  `cmake_minimum_required(VERSION 3.18)
project(bun_llama C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(BUILD_SHARED_LIBS OFF)
set(LLAMA_BUILD_COMMON OFF)
set(LLAMA_BUILD_TESTS OFF)
set(LLAMA_BUILD_EXAMPLES OFF)
set(LLAMA_BUILD_TOOLS OFF)
set(LLAMA_BUILD_SERVER OFF)
set(LLAMA_CURL OFF)
set(GGML_NATIVE ${portable ? "OFF" : "ON"})
set(GGML_OPENMP ON)
add_subdirectory("${fwd(src)}" llama)
add_library(bun_llama SHARED "${fwd(join(root, "native", "bun_llama.cpp"))}")
target_link_libraries(bun_llama PRIVATE llama)
target_include_directories(bun_llama PRIVATE "${fwd(join(src, "include"))}")
`,
);

const compilers = process.platform === "win32" ? ["-DCMAKE_C_COMPILER=clang", "-DCMAKE_CXX_COMPILER=clang++"] : [];
await $`cmake -S ${cmakeDir} -B ${join(buildDir, "out")} -G Ninja -DCMAKE_BUILD_TYPE=Release ${compilers}`;
await $`cmake --build ${join(buildDir, "out")} --target bun_llama -j ${jobs}`;

const file =
  process.platform === "win32"
    ? "bun_llama.dll"
    : process.platform === "darwin"
      ? "libbun_llama.dylib"
      : "libbun_llama.so";
copyFileSync(join(buildDir, "out", file), join(buildDir, file));
console.log(join(buildDir, file));
