# Image de déploiement : Ubuntu 26.04, Bun upstream canary et outils de déploiement.
# Pour revenir à une release historique du fork, définir les trois arguments BUN_REPO, BUN_RELEASE et BUN_SUMS.
# Un seul point d'entrée, trois rôles :
#   build  file de déploiement (queue.ts), build des apps puis transfert et activation sur l'hôte de prod par ssh
#   prod   exécute $APP_BIN de la release courante, ou `bun $APP_SCRIPT`, sinon la sonde probe.ts
#   health état du conteneur (HEALTHCHECK) ; tout autre argument est passé tel quel à bun
#
#   docker build -t ghcr.io/aphrody-labs/bun:1.4.4 -f docker/Dockerfile .   (contexte : scripts/aphrody/deploy)
ARG UBUNTU_TAG=26.04

FROM ubuntu:${UBUNTU_TAG} AS bun
ARG BUN_REPO=oven-sh/bun
ARG BUN_RELEASE=canary
ARG BUN_SUMS=SHASUMS256.txt
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    base="https://github.com/${BUN_REPO}/releases/download/${BUN_RELEASE}"; \
    curl -fsSLO "${base}/bun-linux-x64.zip"; curl -fsSL "${base}/${BUN_SUMS}" -o sums.txt; \
    tr -d '\r' < sums.txt | grep -E '  \*?bun-linux-x64.zip$' | sha256sum -c -; \
    unzip -q bun-linux-x64.zip; \
    install -D -m 0755 bun-linux-x64/bun /out/bun

FROM ubuntu:${UBUNTU_TAG}
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata git openssh-client gh rsync curl \
    && rm -rf /var/lib/apt/lists/* \
    && (id ubuntu >/dev/null 2>&1 && userdel -r ubuntu || true) \
    && groupadd -g 1000 agent && useradd -m -u 1000 -g agent -s /bin/bash agent \
    && mkdir -p /app /var/lib/aphrody-deploy /opt/aphrody-deploy && chown -R agent:agent /app /var/lib/aphrody-deploy
COPY --from=bun /out/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx && bun --version
COPY *.ts apps.example.json /opt/aphrody-deploy/
COPY docker/entrypoint.ts /opt/aphrody-deploy/entrypoint.ts
ENV LANG=C.UTF-8 HOME=/home/agent APP_ROOT=/app
USER agent
WORKDIR /app
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["bun", "/opt/aphrody-deploy/entrypoint.ts", "health"]
ENTRYPOINT ["bun", "/opt/aphrody-deploy/entrypoint.ts"]
CMD ["prod"]
