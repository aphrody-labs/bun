/**
 * curl/curl — libcurl and the curl tool behind `Bun.Curl` and `bun curl`
 * (`curlNative`, off by default).
 *
 * The source is the plain upstream archive at CURL_COMMIT, fetched to
 * vendor/curl like every other dep. It is built by its own cmake through the
 * project in src/runtime/curl/sdk, which wraps upstream's CMakeLists.txt
 * (named by CURL_UPSTREAM_DIR) into the BunCurlTool and libcurl_static
 * archives. Pinned to the curl-8_23_0 release commit; to bump curl, change CURL_COMMIT.
 */
import { resolve } from "node:path";
import type { Dependency } from "../source.ts";
import { depBuildDir, depSourceDir } from "../source.ts";

export const CURL_COMMIT = "3163ec065643ba20709f190111f42c3e1fe95273";

export const curl: Dependency = {
  name: "curl",
  enabled: cfg => cfg.curlNative,
  source: () => ({ kind: "github-archive", repo: "curl/curl", commit: CURL_COMMIT }),
  buildDeps: ["boringssl", "zlib", "brotli", "zstd"],
  build: cfg => ({
    kind: "nested-cmake",
    sourceSubdir: resolve(cfg.cwd, "src/runtime/curl/sdk"),
    targets: ["BunCurlTool", "libcurl_static"],
    pic: true,
    args: {
      CURL_UPSTREAM_DIR: depSourceDir(cfg, "curl"),
      CURL_USE_SCHANNEL: cfg.windows ? "ON" : "OFF",
      CURL_USE_OPENSSL: cfg.windows ? "OFF" : "ON",
      CURL_USE_LIBPSL: "OFF",
      CURL_ZLIB: "ON",
      CURL_BROTLI: "ON",
      CURL_ZSTD: "ON",
      CURL_USE_PKGCONFIG: "OFF",
      CURL_USE_CMAKECONFIG: "OFF",
      ZLIB_INCLUDE_DIR: resolve(cfg.cwd, "src/zlib_rs/include"),
      ZLIB_LIBRARY: resolve(depBuildDir(cfg, "zlib"), `${cfg.libPrefix}zlib${cfg.libSuffix}`),
      BROTLI_INCLUDE_DIR: resolve(depSourceDir(cfg, "brotli"), "c/include"),
      BROTLIDEC_LIBRARY: resolve(depBuildDir(cfg, "brotli"), `${cfg.libPrefix}brotli${cfg.libSuffix}`),
      BROTLICOMMON_LIBRARY: resolve(depBuildDir(cfg, "brotli"), `${cfg.libPrefix}brotli${cfg.libSuffix}`),
      ZSTD_INCLUDE_DIR: resolve(depSourceDir(cfg, "zstd"), "lib"),
      ZSTD_LIBRARY: resolve(depBuildDir(cfg, "zstd"), `${cfg.libPrefix}zstd${cfg.libSuffix}`),
      CURL_USE_LIBSSH2: "OFF",
      CURL_USE_LIBSSH: "OFF",
      CURL_USE_GSSAPI: "OFF",
      CURL_USE_MBEDTLS: "OFF",
      CURL_USE_WOLFSSL: "OFF",
      CURL_USE_GNUTLS: "OFF",
      CURL_USE_RUSTLS: "OFF",
      USE_LIBIDN2: "OFF",
      USE_APPLE_IDN: "OFF",
      USE_APPLE_SECTRUST: "OFF",
      USE_WIN32_IDN: cfg.windows ? "ON" : "OFF",
      USE_WIN32_LDAP: cfg.windows ? "ON" : "OFF",
      CURL_DISABLE_LDAP: cfg.windows ? "OFF" : "ON",
      CURL_DISABLE_LDAPS: cfg.windows ? "OFF" : "ON",
      CURL_USE_GSASL: "OFF",
      USE_NGHTTP2: "OFF",
      USE_NGTCP2: "OFF",
      USE_QUICHE: "OFF",
      ...(cfg.windows
        ? {}
        : {
            OPENSSL_INCLUDE_DIR: resolve(depSourceDir(cfg, "boringssl"), "include"),
            OPENSSL_SSL_LIBRARY: resolve(depBuildDir(cfg, "boringssl"), `${cfg.libPrefix}boringssl${cfg.libSuffix}`),
            OPENSSL_CRYPTO_LIBRARY: resolve(depBuildDir(cfg, "boringssl"), `${cfg.libPrefix}boringssl${cfg.libSuffix}`),
          }),
    },
  }),
  provides: cfg => ({
    libs: [`${cfg.libPrefix}BunCurlTool${cfg.libSuffix}`, `${cfg.libPrefix}curl${cfg.libSuffix}`],
    includes: ["include"],
  }),
};
