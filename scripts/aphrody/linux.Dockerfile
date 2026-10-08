# Linux build and test environment for the fork and Aphrody: Ubuntu 26.04 LTS,
# the same OS and glibc (2.43) as the vps and dbfr hosts, so binaries built here
# run natively on both. The fork's primary Linux target is Alpine
# (alpine.Dockerfile); this image is the glibc one. Used by
# `scripts/aphrody/tmux.ts run --ubuntu` and .github/workflows/aphrody-linux-build.yml.
#
#   docker build -t aphrody/build-linux:26.04 \
#     --build-arg RUST_CHANNEL=$(sed -n 's/^channel = "\(.*\)"/\1/p' rust-toolchain.toml) \
#     -f scripts/aphrody/linux.Dockerfile scripts/aphrody

FROM ubuntu:26.04

# Bun's build pins LLVM 23 (scripts/build/ci-images/spec.ts `pins.llvm`); Ubuntu
# ships 22, which stays installed for Aphrody's own builds.
ARG LLVM_MAJOR=23
ARG RUST_CHANNEL=nightly-2026-09-15
ARG BUN_VERSION=1.4.2

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    CARGO_HOME=/root/.cargo \
    RUSTUP_HOME=/root/.rustup \
    PATH=/root/.bun/bin:/root/.cargo/bin:/usr/lib/llvm-22/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libc6-dev libc6-dbg glibc-tools musl musl-dev musl-tools \
      clang-22 lld-22 llvm-22 llvm-22-dev libclang-22-dev clang-tools-22 \
      mold cmake ninja-build pkg-config ccache \
      git curl ca-certificates gnupg unzip xz-utils zstd file jq ripgrep fd-find rsync \
      python3 python3-pip nasm perl ruby golang-go nodejs libssl-dev zlib1g-dev \
      tmux procps gdb strace \
    && rm -rf /var/lib/apt/lists/*

# apt.llvm.org signs with a SHA-1 key, which apt's sqv verifier stopped
# accepting on 2026-02-01 (llvm/llvm-project#153385): same exception as the CI
# images (spec.ts `llvm`).
RUN sequoia=/usr/share/apt/default-sequoia.config \
    && if [ -f "$sequoia" ]; then mkdir -p /etc/crypto-policies/back-ends \
         && sed 's/sha1.second_preimage_resistance = 2026-02-01/sha1.second_preimage_resistance = 2028-02-01/' \
              "$sequoia" > /etc/crypto-policies/back-ends/apt-sequoia.config; fi \
    && curl -fsSL https://apt.llvm.org/llvm-snapshot.gpg.key | gpg --dearmor -o /usr/share/keyrings/apt.llvm.org.gpg \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/keyrings/apt.llvm.org.gpg] https://apt.llvm.org/$VERSION_CODENAME/ llvm-toolchain-$VERSION_CODENAME-$LLVM_MAJOR main" \
         > /etc/apt/sources.list.d/llvm.list \
    && apt-get update && apt-get install -y --no-install-recommends \
         clang-$LLVM_MAJOR lld-$LLVM_MAJOR llvm-$LLVM_MAJOR llvm-$LLVM_MAJOR-tools libclang-rt-$LLVM_MAJOR-dev \
    && rm -rf /var/lib/apt/lists/* \
    && clang-$LLVM_MAJOR --version | head -1

RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable \
    && rustup toolchain install "$RUST_CHANNEL" --profile minimal --component rust-src \
    && (cargo install --locked sccache 2>/dev/null || true)

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && bun --version

WORKDIR /work
