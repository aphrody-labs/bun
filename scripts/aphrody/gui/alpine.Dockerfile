# Headless GUI layer for the bun:ffi window fixtures in test/js/bun/ffi
# ({win32,gtk,qt,kde,cosmic}-window.fixture.ts) on Alpine 3.24 (musl), on top of
# the fork's Alpine runtime image (aphrody/bun-alpine, scripts/aphrody/alpine/runtime.Dockerfile).
# GTK 4, Qt 6 and KDE Frameworks 6 Kirigami come from Alpine; the libcosmic cdylib
# (test/js/bun/ffi/cosmic-window) is built with Alpine's Rust into /opt/bun-cosmic-window;
# Wine runs win32-window.fixture.ts with a Windows bun.exe mounted at /opt/bun-windows/bun.exe.
#
#   docker build -t aphrody/gui-alpine:3.24 -f scripts/aphrody/gui/alpine.Dockerfile test/js/bun/ffi/cosmic-window
#   docker run --rm --init -v "$PWD:/bun" -v /path/to/bun-windows:/opt/bun-windows:ro aphrody/gui-alpine:3.24 \
#     xvfb-run -a bun test test/js/bun/ffi/ffi.test.js -t "native toolkit windows|Win32 window"
# --init: as PID 1, xvfb-run never receives Xvfb's ready signal and hangs.

ARG BASE=aphrody/bun-alpine:latest
FROM ${BASE}

ENV BUN_COSMIC_WINDOW_LIB=/opt/bun-cosmic-window/libbun_cosmic_window.so \
    BUN_WINDOWS_EXE=/opt/bun-windows/bun.exe \
    WINEDEBUG=-all \
    WINEPREFIX=/root/.wine \
    GSK_RENDERER=cairo \
    QT_QUICK_BACKEND=software \
    NO_AT_BRIDGE=1 \
    GTK_A11Y=none

RUN apk add --no-cache \
      gtk4.0 \
      qt6-qtbase-dev qt6-qtdeclarative-dev kirigami \
      g++ pkgconf cmake git rust cargo \
      libxkbcommon-dev wayland-dev expat-dev fontconfig-dev freetype-dev \
      xvfb-run xauth mesa-dri-gallium font-dejavu \
      wine

WORKDIR /src/cosmic-window
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && touch src/lib.rs && cargo build --release --locked
COPY src src
RUN touch src/lib.rs && cargo build --release --locked \
    && mkdir -p /opt/bun-cosmic-window \
    && cp target/release/libbun_cosmic_window.so /opt/bun-cosmic-window/ \
    && rm -rf /src/cosmic-window/target

RUN wineboot --init >/dev/null 2>&1 || true

WORKDIR /bun
CMD ["xvfb-run", "-a", "bun", "test", "test/js/bun/ffi/ffi.test.js", "-t", "native toolkit windows|Win32 window"]
