# The image every Dev's box runs: the runner on :7700 and the `dev` command on PATH.
# The bundle is built on the host first: `bun run image:build` in packages/chats-runner.

FROM node:22-bookworm-slim AS node
RUN apt-get update && apt-get install -y --no-install-recommends binutils && strip --strip-all /usr/local/bin/node

FROM debian:bookworm-slim
# bash for the agent's shell tool, ripgrep for its search tool, git, curl and certificates for common work.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git ripgrep \
 && rm -rf /var/lib/apt/lists/* /var/cache/debconf/*-old /var/log/apt /var/log/dpkg.log
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /opt/dev
COPY dist/ ./
RUN printf '#!/bin/sh\nexec node "${DEV_CLI:-/opt/dev/cli.js}" "$@"\n' > /usr/local/bin/dev && chmod +x /usr/local/bin/dev \
 && useradd --create-home --uid 1001 dev \
 && mkdir /agent && chown dev:dev /agent
USER dev
WORKDIR /agent
# The Dev's storage is mounted here: its sessions and notes live in it.
VOLUME /agent
EXPOSE 7700
ENTRYPOINT ["node", "/opt/dev/boot.js"]
