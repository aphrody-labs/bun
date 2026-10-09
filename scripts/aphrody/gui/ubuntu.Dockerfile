# Headless GUI layer for the bun:ffi window fixtures in test/js/bun/ffi
# ({win32,gtk,qt,kde,cosmic}-window.fixture.ts) on Ubuntu 26.04 (glibc), on top of
# the fork's Linux build image (scripts/aphrody/linux.Dockerfile). GTK 4, Qt 6 and
# KDE Frameworks 6 Kirigami come from Ubuntu; the libcosmic cdylib
# (test/js/bun/ffi/cosmic-window) is built into /opt/bun-cosmic-window; Wine runs
# win32-window.fixture.ts with a Windows bun.exe mounted at /opt/bun-windows/bun.exe.
#
#   docker build -t aphrody/gui-ubuntu:26.04 -f scripts/aphrody/gui/ubuntu.Dockerfile test/js/bun/ffi/cosmic-window
#   docker run --rm -v "$PWD:/bun" -v /path/to/bun-windows:/opt/bun-windows:ro aphrody/gui-ubuntu:26.04 \
#     xvfb-run -a bun test test/js/bun/ffi/ffi.test.js -t "native toolkit windows|Win32 window"

ARG BASE=aphrody/build-linux:26.04
FROM ${BASE}

ENV DEBIAN_FRONTEND=noninteractive \
    BUN_COSMIC_WINDOW_LIB=/opt/bun-cosmic-window/libbun_cosmic_window.so \
    BUN_WINDOWS_EXE=/opt/bun-windows/bun.exe \
    WINEDEBUG=-all \
    WINEPREFIX=/root/.wine \
    GSK_RENDERER=cairo \
    QT_QUICK_BACKEND=software \
    NO_AT_BRIDGE=1 \
    GTK_A11Y=none

RUN apt-get update && apt-get install -y --no-install-recommends \
      libgtk-4-1 \
      qt6-base-dev qt6-declarative-dev qml6-module-org-kde-kirigami \
      qml6-module-qtquick-controls qml6-module-qtquick-templates qml6-module-qtquick-layouts \
      qml6-module-qtquick-window qml6-module-qtqml-workerscript \
      libxkbcommon-dev libxkbcommon-x11-0 libwayland-dev libexpat1-dev libfontconfig-dev libfreetype-dev \
      xvfb xauth fonts-dejavu-core fonts-open-sans mesa-utils libgl1-mesa-dri \
      wine wine64 \
    && rm -rf /var/lib/apt/lists/*

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
