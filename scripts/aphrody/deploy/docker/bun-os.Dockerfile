# SPDX-License-Identifier: Apache-2.0
# Context: a checksum-verified GNU Linux runtime plus a built public WebOS package.
ARG RUNTIME_IMAGE=ghcr.io/aphrody-labs/bun@sha256:8b12917085a44f30c1dbee201c62a206be2b2e38b11c2ed2cffbfafa2b091489
FROM ${RUNTIME_IMAGE}
ARG SOURCE_REVISION
ARG BUN_SHA256
LABEL org.opencontainers.image.source="https://github.com/aphrody-labs/bun" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.licenses="MIT AND LGPL-2.0-or-later AND GPL-3.0-or-later AND Apache-2.0"
USER root
COPY bun /usr/local/bin/bun
RUN test -n "$BUN_SHA256" && echo "$BUN_SHA256  /usr/local/bin/bun" | sha256sum -c - \
    && chmod 0755 /usr/local/bin/bun \
    && bun -e 'if(Bun.version!=="1.4.4"||process.platform!=="linux")throw new Error("GNU Linux Bun1.4.4 required")'
WORKDIR /app
COPY --chown=1000:1000 package/dist ./dist
COPY --chown=1000:1000 package/scripts/serve-container.ts ./scripts/serve-container.ts
COPY licenses ./licenses
USER 1000:1000
ENV NODE_ENV=production WEBOS_PORT=3000 HOME=/tmp/webos/home
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/bun", "/app/scripts/serve-container.ts"]
