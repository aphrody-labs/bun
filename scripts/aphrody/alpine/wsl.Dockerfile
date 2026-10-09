# Aphrody Alpine for WSL2 (lot A4): the runtime image (Alpine 3.24 + the fork's musl Bun,
# scripts/aphrody/alpine/runtime.Dockerfile) plus the WSL configuration (wsl/overlay:
# /etc/wsl.conf, /etc/wsl-distribution.conf, OOBE and boot scripts, WSLg profile), the
# packages of wsl/packages.txt and, when present, wsl/packages-gui.txt (Mesa d3d12/dozen,
# Wayland). Built and exported to a .wsl by scripts/aphrody/alpine/wsl.ts, which assembles
# the build context (this file, wsl/, the icon).
#
#   bun scripts/aphrody/alpine/wsl.ts --base ghcr.io/aphrody-labs/alpine:3.24-runtime

ARG BASE=ghcr.io/aphrody-labs/alpine:3.24-runtime
FROM ${BASE}
USER root

COPY wsl/packages*.txt /tmp/wsl/
RUN set -eu; \
    pkgs=$(cat /tmp/wsl/packages*.txt | sed 's/#.*//' | tr -s ' \n' ' '); \
    apk add --no-cache $pkgs; \
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
