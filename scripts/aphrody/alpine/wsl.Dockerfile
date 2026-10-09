# Aphrody Alpine for WSL2 (lot A4): the runtime image (Alpine 3.24 + the fork's musl Bun,
# scripts/aphrody/alpine/runtime.Dockerfile) plus the WSL configuration (wsl/overlay:
# /etc/wsl.conf, /etc/wsl-distribution.conf, OOBE and boot scripts, WSLg profile), the
# packages of wsl/packages.txt and, with GUI=1, wsl/packages-gui.txt (Mesa d3d12/dozen,
# Wayland). Packages come from Alpine 3.24 plus the signed aphrody-labs/aports repository
# (aphrody/mesa with the D3D12 drivers). A trailing ? marks a package skipped when absent.
# Built and exported to a .wsl by scripts/aphrody/alpine/wsl.ts, which assembles the build
# context (this file, wsl/, the icon).
#
#   bun scripts/aphrody/alpine/wsl.ts --base ghcr.io/aphrody-labs/alpine:3.24-runtime

ARG BASE=ghcr.io/aphrody-labs/alpine:3.24-runtime
FROM ${BASE}
USER root
ARG GUI=1
ARG APHRODY_APORTS_REF=15e5fcd2686d113b0ebc0f356bcb974e1e612d58

ADD https://raw.githubusercontent.com/aphrody-labs/aports/${APHRODY_APORTS_REF}/aphrody/keys/aphrody-labs.rsa.pub /etc/apk/keys/aphrody-labs.rsa.pub
COPY wsl/packages*.txt /tmp/wsl/
RUN set -eu; \
    repo="https://github.com/aphrody-labs/aports/releases/download/aphrody-3.24-$(apk --print-arch)/APKINDEX.tar.gz"; \
    grep -qF "$repo" /etc/apk/repositories || echo "$repo" >> /etc/apk/repositories; \
    chmod 0644 /etc/apk/keys/aphrody-labs.rsa.pub; \
    lists=/tmp/wsl/packages.txt; \
    [ "$GUI" = 1 ] && lists="$lists /tmp/wsl/packages-gui.txt"; \
    pkgs=$(cat $lists | sed 's/#.*//'); \
    apk update -q || echo "apk update: unreachable repository (aphrody-3.24-$(apk --print-arch) unpublished?)"; \
    apk add --no-cache $(echo "$pkgs" | grep -v '?$'); \
    for p in $(echo "$pkgs" | grep '?$' | tr -d '?'); do \
      if apk search -q -x "$p" | grep -q .; then apk add --no-cache "$p"; else echo "absent: $p"; fi; \
    done; \
    rm -rf /tmp/wsl

COPY wsl/overlay/ /
COPY aphrody.ico /usr/share/aphrody/wsl/aphrody.ico

# The runtime image's uid 1000 "agent" is a container convention; on WSL the OOBE creates the
# user (uid 1000, oobe.defaultUid). bunsh is the bun binary under that name
# (src/runtime/cli/bunsh.rs); /etc/shells lists it for adduser -s and chsh.
RUN set -eu; \
    if getent passwd agent >/dev/null; then deluser --remove-home agent; fi; \
    delgroup agent 2>/dev/null || true; \
    bun=$(command -v bun); \
    ln -sf "$bun" /bin/bunsh; \
    grep -qx /bin/bunsh /etc/shells || echo /bin/bunsh >> /etc/shells; \
    arch=$(apk --print-arch); \
    path=/etc/ld-musl-$arch.path; \
    [ -f "$path" ] || printf '/lib\n/usr/local/lib\n/usr/lib\n' > "$path"; \
    grep -qx /usr/lib/wsl/lib "$path" || echo /usr/lib/wsl/lib >> "$path"; \
    chmod 0755 /usr/libexec/aphrody/*.sh; \
    chmod 0644 /etc/wsl.conf /etc/wsl-distribution.conf; \
    sed -i 's#^\(root:\)[^:]*:#\1*:#' /etc/shadow; \
    bun --version

WORKDIR /
CMD ["/bin/sh"]
