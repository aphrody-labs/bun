# Aphrody Alpine: Alpine 3.24 minirootfs plus the signed apk repository of
# aphrody-labs/aports (aphrody/*: bun, bun-shell, bun-apk, aphrody, n2b,
# llvm23, rust-nightly, ...). It is the fork's primary Linux build and test
# environment (scripts/aphrody/tmux.ts --linux|--alpine, .actrc alpine-3.24,
# .github/workflows/aphrody-linux-build.yml) and is published as
# ghcr.io/aphrody-labs/alpine plus a rootfs tarball
# (.github/workflows/aphrody-alpine-image.yml). root's login shell is bunsh;
# /bin/sh stays busybox ash (PLAN-ALPINE-BUN.md, section U). sudo is sudo-rs
# (scripts/aphrody/alpine/u3.Dockerfile.fragment): BUILD_USER is in group
# aphrody, NOPASSWD, so `sudo`, `Bun.spawn({ elevate: true })` and
# `bunsh --root` work without a prompt.
#
#   docker build -t ghcr.io/aphrody-labs/alpine:3.24 -f scripts/aphrody/aphrody-alpine.Dockerfile scripts/aphrody
#
# OPTIONAL_PACKAGES adds packages from the same repositories, e.g.
#   aphrody-libc-dev       /usr/lib/libaphrody_libc.a, for `bun run build --aphrody-libc=/usr/lib/libaphrody_libc.a`
#   aphrody-libc-preload   LD_PRELOAD of the aphrody-libc overlay for login shells

ARG ALPINE_RELEASE=3.24.2

FROM alpine:3.24 AS rootfs
ARG ALPINE_RELEASE
ARG TARGETARCH
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) arch=x86_64 sum=c5ca053cfe1d85c5b96dff8b9bc57045f7f184a30ffb6b65776409ca90388677 ;; \
      arm64) arch=aarch64 sum=9bf70a7f18ea44094cbb5f70c58f9af129c8214745743db0e68e5502cc2ce773 ;; \
      *) echo "unsupported arch $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    tarball="alpine-minirootfs-${ALPINE_RELEASE}-${arch}.tar.gz"; \
    wget -q "https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/${arch}/${tarball}"; \
    echo "${sum}  ${tarball}" | sha256sum -c -; \
    mkdir /rootfs && tar -xzf "$tarball" -C /rootfs

FROM scratch
COPY --from=rootfs /rootfs/ /

ARG APHRODY_APORTS_REF=15e5fcd2686d113b0ebc0f356bcb974e1e612d58
ARG OPTIONAL_PACKAGES=""
ARG BUILD_USER=builder
ADD https://raw.githubusercontent.com/aphrody-labs/aports/${APHRODY_APORTS_REF}/aphrody/keys/aphrody-labs.rsa.pub /etc/apk/keys/aphrody-labs.rsa.pub

ENV LANG=C.UTF-8 \
    BUN_INSTALL_CACHE_DIR=/var/cache/bun/install \
    BUN_INSTALL_GLOBAL_DIR=/usr/local/lib/bun/global \
    BUN_INSTALL_BIN=/usr/local/bin \
    BUN_TOOLCHAIN_RUST=/usr/lib/rust-nightly \
    PATH=/usr/lib/rust-nightly/bin:/usr/lib/llvm23/bin:/usr/lib/bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN echo 'https://github.com/aphrody-labs/aports/releases/download/aphrody-3.24-${APK_ARCH}/APKINDEX.tar.gz' >> /etc/apk/repositories \
    && apk add --no-cache \
      bun bun-shell bun-apk aphrody n2b aphrody-bun-build-deps \
      sudo-rs sudo-rs-su aphrody-sudoers aphrody-sysctl \
      bash coreutils findutils grep sed gawk diffutils patch tar xz zstd unzip rsync file \
      git curl ca-certificates jq ripgrep fd procps tmux gdb strace nodejs \
      $OPTIONAL_PACKAGES \
    && sed -i 's#^root:\(.*\):/bin/sh$#root:\1:/bin/bunsh#' /etc/passwd \
    && grep -qx /bin/bunsh /etc/shells \
    && grep -q '^root:.*:/bin/bunsh$' /etc/passwd \
    && test "$(readlink -f /bin/sh)" = /bin/busybox \
    && bun --version && bunsh -c 'exit 0' && aphrody --version && n2b --version \
    && clang-23 --version | head -1 && ld.lld --version && rustc -vV \
    && ! command -v doas >/dev/null \
    && adduser -D -G aphrody -s /bin/sh "$BUILD_USER"

USER ${BUILD_USER}
RUN sudo -n true && test "$(sudo -n id -u)" = 0 && test "$(bunsh --root -c 'id -u')" = 0
USER root

WORKDIR /work
