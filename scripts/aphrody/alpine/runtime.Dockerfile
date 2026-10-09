# Aphrody Alpine runtime: Alpine 3.24 minirootfs (sha256-pinned, as in
# scripts/aphrody/aphrody-alpine.Dockerfile) plus the fork's musl Bun and
# nothing else (ca-certificates, tzdata, libstdc++/libgcc for Bun). It is the
# base of application images (FROM ghcr.io/aphrody-labs/alpine:3.24-runtime);
# workloads run as the unprivileged user agent (uid/gid 1000).
#
# Bun comes from the fork's GitHub release (bun-linux-<arch>-musl.zip, sha256
# from its SHA256SUMS.txt) because aphrody-labs/aports publishes no bun apk
# yet; switch to `apk add bun` from that repository once it does.
#
#   docker build -t ghcr.io/aphrody-labs/alpine:3.24-runtime -f scripts/aphrody/alpine/runtime.Dockerfile scripts/aphrody/alpine
#
# BUN_X64_VARIANT=-baseline selects the x64 build without AVX2.

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

FROM alpine:3.24 AS bun
ARG TARGETARCH
ARG BUN_RELEASE=aphrody-v1.4.3-aphrody.2
ARG BUN_X64_VARIANT=""
RUN set -eu; \
    case "$TARGETARCH$BUN_X64_VARIANT" in \
      amd64) asset=bun-linux-x64-musl sum=06a20b260026aa87bfcc68a41c7d8fc90f5ff89f9b0ca0058abdfdf0a3a9aceb ;; \
      amd64-baseline) asset=bun-linux-x64-musl-baseline sum=b04540328710f00011b1603d8beb913c9aed801c3167ed129bd2ad3bb6abf7f8 ;; \
      arm64*) asset=bun-linux-aarch64-musl sum=83bd1287a15bc51280a5bc99405fa278f44e30ba36538d461992c55c03685170 ;; \
      *) echo "unsupported arch $TARGETARCH$BUN_X64_VARIANT" >&2; exit 1 ;; \
    esac; \
    wget -q "https://github.com/aphrody-labs/bun/releases/download/${BUN_RELEASE}/${asset}.zip"; \
    echo "${sum}  ${asset}.zip" | sha256sum -c -; \
    unzip -q "${asset}.zip"; \
    install -D -m 0755 "${asset}/bun" /out/bun

FROM scratch
COPY --from=rootfs /rootfs/ /
COPY --from=bun /out/bun /usr/local/bin/bun

ENV LANG=C.UTF-8 \
    PATH=/home/agent/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apk add --no-cache ca-certificates tzdata libstdc++ libgcc \
    && ln -s bun /usr/local/bin/bunx \
    && addgroup -g 1000 agent \
    && adduser -D -u 1000 -G agent -s /bin/sh agent \
    && bun --version

USER agent
WORKDIR /home/agent
CMD ["bun"]
