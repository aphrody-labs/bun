# Headless libcosmic (Pop!_OS COSMIC, epoch-1.10.0) environment for
# test/js/bun/ffi/cosmic-window.fixture.ts. Ubuntu 24.04 is the base of Pop!_OS 24.04; there is
# no official Pop!_OS image on Docker Hub, and the fixture builds libcosmic from git anyway, so
# no Pop!_OS apt repository is needed. The cdylib is built into the image at
# /opt/bun-cosmic-window (BUN_COSMIC_WINDOW_LIB) and the window renders with tiny-skia on Xvfb.
#
#   docker build -t aphrody/gui-cosmic -f scripts/aphrody/gui/cosmic.Dockerfile test/js/bun/ffi/cosmic-window
#   docker run --rm -v "$PWD:/bun" -w /bun aphrody/gui-cosmic \
#     xvfb-run -a bun test test/js/bun/ffi/ffi.test.js -t libcosmic

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    CARGO_HOME=/root/.cargo \
    RUSTUP_HOME=/root/.rustup \
    PATH=/root/.bun/bin:/root/.cargo/bin:$PATH \
    BUN_COSMIC_WINDOW_LIB=/opt/bun-cosmic-window/libbun_cosmic_window.so

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential pkg-config cmake git curl ca-certificates unzip \
      libxkbcommon-dev libxkbcommon-x11-0 libwayland-dev libexpat1-dev libfontconfig-dev \
      libfreetype-dev libx11-dev libxcursor1 libxrandr2 libxi6 libx11-xcb1 libxcb1 \
      fontconfig fonts-dejavu-core fonts-open-sans xvfb xauth \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable \
    && curl -fsSL https://bun.sh/install | bash

# Dependencies first (cached layer), then the crate itself.
WORKDIR /src/cosmic-window
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && touch src/lib.rs && cargo build --release --locked
COPY src src
RUN touch src/lib.rs && cargo build --release --locked \
    && mkdir -p /opt/bun-cosmic-window \
    && cp target/release/libbun_cosmic_window.so /opt/bun-cosmic-window/

WORKDIR /bun
CMD ["xvfb-run", "-a", "bun", "test/js/bun/ffi/cosmic-window.fixture.ts", "--title", "café", "--timeout", "50"]
