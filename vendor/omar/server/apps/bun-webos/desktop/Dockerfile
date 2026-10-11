# Chromium layer for the bun-webos desktop exe on top of the GUI images
# (scripts/aphrody/gui/{ubuntu,alpine}.Dockerfile: Xvfb, mesa, fonts).
# Alpine ships chromium; Ubuntu 26.04's chromium is a snap, so Google Chrome's .deb is used.
#
# The GUI images may run as a non-root user (apk/apt need root); RUN_USER restores one for the smoke.
#
#   docker build -t aphrody/webos-desktop:alpine --build-arg BASE=aphrody/gui-alpine:3.24 packages/bun-webos/desktop
#   docker build -t aphrody/webos-desktop:ubuntu --build-arg BASE=aphrody/gui-ubuntu:26.04 packages/bun-webos/desktop
#   docker run --rm -v "$PWD/packages/bun-webos/desktop/dist:/dist:ro" aphrody/webos-desktop:alpine \
#     xvfb-run -a /dist/bun-webos-linux-x64-musl --smoke
ARG BASE=aphrody/gui-alpine:3.24
FROM ${BASE}
ARG RUN_USER=root
USER root
RUN if command -v apk >/dev/null; then \
      apk add --no-cache chromium nss font-noto font-dejavu xvfb-run xauth mesa-dri-gallium; \
    else \
      apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xvfb xauth \
      && curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
      && apt-get install -y --no-install-recommends /tmp/chrome.deb \
      && rm -rf /tmp/chrome.deb /var/lib/apt/lists/*; \
    fi
USER ${RUN_USER}
ENV BUN_WEBOS_DESKTOP=1
CMD ["sh", "-c", "xvfb-run -a /dist/$(ls /dist | grep -v '\.exe$' | grep -v '\.map$' | head -n1) --smoke"]
