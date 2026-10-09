# Headless GTK 4 + Qt 6 + KDE Frameworks 6 (Kirigami) environment for the bun:ffi
# window fixtures in test/js/bun/ffi ({gtk,qt,kde}-window.fixture.ts). Arch Linux
# ships the current GNOME (GTK 4.24), Qt (6.12) and KF6 (6.30) releases a few days
# after upstream. Windows run under Xvfb; the repository is mounted at /bun.
#
#   docker build -t aphrody/gui-linux -f scripts/aphrody/gui/linux.Dockerfile scripts/aphrody/gui
#   docker run --rm -v "$PWD:/bun" aphrody/gui-linux \
#     xvfb-run -a bun test test/js/bun/ffi/ffi.test.js -t "GTK 4|Qt 6|Kirigami"

FROM archlinux:latest

ENV LANG=C.UTF-8 \
    PATH=/root/.bun/bin:$PATH \
    GSK_RENDERER=cairo \
    QT_QUICK_BACKEND=software \
    NO_AT_BRIDGE=1 \
    GTK_A11Y=none

RUN pacman -Syu --noconfirm --needed \
      gtk4 qt6-base qt6-declarative kirigami \
      gcc pkgconf unzip curl ca-certificates \
      xorg-server-xvfb xorg-xauth ttf-dejavu mesa \
    && pacman -Scc --noconfirm

RUN curl -fsSL https://bun.sh/install | bash

WORKDIR /bun
CMD ["sh", "-c", "for t in gtk qt kde; do xvfb-run -a bun test/js/bun/ffi/$t-window.fixture.ts --title café --timeout 50 || exit 1; done"]
