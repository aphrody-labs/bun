# Native Alpine build and test environment for the fork: the primary Linux
# target (musl). Everything comes from apk except what Bun pins more tightly:
# LLVM 23 (scripts/build/ci-images/spec.ts `pins.llvm`, edge/main, tagged so
# musl and libstdc++ stay the release's), the nightly in rust-toolchain.toml
# (rustup, musl host), and bun itself. Used by `scripts/aphrody/tmux.ts run
# --linux|--alpine` and .github/workflows/aphrody-linux-build.yml.
#
#   docker build -t aphrody/build-alpine:3.24 \
#     --build-arg RUST_CHANNEL=$(sed -n 's/^channel = "\(.*\)"/\1/p' rust-toolchain.toml) \
#     -f scripts/aphrody/alpine.Dockerfile scripts/aphrody

ARG ALPINE_VERSION=3.24
FROM alpine:${ALPINE_VERSION}

ARG LLVM_MAJOR=23
ARG RUST_CHANNEL=nightly-2026-09-15
ARG BUN_VERSION=1.4.2

ENV LANG=C.UTF-8 \
    CARGO_HOME=/root/.cargo \
    RUSTUP_HOME=/root/.rustup \
    PATH=/root/.bun/bin:/root/.cargo/bin:/usr/lib/llvm${LLVM_MAJOR}/bin:$PATH

RUN echo "@edge https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \
    && apk add --no-cache \
      bash coreutils findutils grep sed gawk diffutils patch tar xz zstd unzip rsync file \
      git curl ca-certificates jq ripgrep fd procps tmux gdb strace \
      build-base linux-headers musl-dev libgcc libstdc++ libstdc++-dev libatomic \
      cmake samurai mold ccache pkgconf autoconf automake libtool make \
      perl python3 go nasm ruby nodejs \
      llvm${LLVM_MAJOR}@edge clang${LLVM_MAJOR}@edge lld${LLVM_MAJOR}@edge \
      compiler-rt@edge llvm${LLVM_MAJOR}-linker-tools@edge \
    && clang-${LLVM_MAJOR} --version | head -1 && ld.lld --version

RUN curl -fsSL "https://static.rust-lang.org/rustup/dist/$(uname -m)-unknown-linux-musl/rustup-init" -o /tmp/rustup-init \
    && chmod +x /tmp/rustup-init \
    && /tmp/rustup-init -y --no-modify-path --profile minimal --default-toolchain "$RUST_CHANNEL" \
         --component rust-src \
    && rm /tmp/rustup-init \
    && rustup toolchain install stable --profile minimal \
    && rustc -vV

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && bun --version

WORKDIR /work
