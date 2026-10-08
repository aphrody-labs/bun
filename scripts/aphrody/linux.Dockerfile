# Linux build and test environment for the fork and Aphrody: Ubuntu 26.04 LTS,
# the same OS and glibc (2.43) as the vps and dbfr hosts, so binaries built here
# run natively on both. Used by `scripts/aphrody/tmux.ts run --linux`.
#
#   docker build -t aphrody/build-linux:26.04 -f scripts/aphrody/linux.Dockerfile scripts/aphrody

FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    CARGO_HOME=/root/.cargo \
    RUSTUP_HOME=/root/.rustup \
    PATH=/root/.bun/bin:/root/.cargo/bin:/usr/lib/llvm-22/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libc6-dev libc6-dbg glibc-tools musl musl-dev musl-tools \
      clang-22 lld-22 llvm-22 llvm-22-dev libclang-22-dev clang-tools-22 \
      mold cmake ninja-build pkg-config ccache \
      git curl ca-certificates unzip xz-utils zstd file jq ripgrep fd-find \
      python3 python3-pip nasm perl ruby libssl-dev zlib1g-dev \
      tmux procps gdb strace \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable \
    && cargo install --locked sccache 2>/dev/null || true

# Bun: the fork's release binary when available, the upstream installer otherwise.
ARG BUN_INSTALL_URL=https://bun.sh/install
RUN curl -fsSL "$BUN_INSTALL_URL" | bash && bun --version

WORKDIR /work
