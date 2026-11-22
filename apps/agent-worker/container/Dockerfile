# Build context is apps/agent-worker, after `bun run build` wrote dist/.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ripgrep git && rm -rf /var/lib/apt/lists/*
ARG PDEV_VERSION
ARG PDEV_SHA256
RUN curl -fsSL -o /tmp/pdev.tar.gz "https://github.com/paradevai/pdev/releases/download/v${PDEV_VERSION}/pdev-${PDEV_VERSION}-linux-x64.tar.gz" \
 && echo "${PDEV_SHA256}  /tmp/pdev.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/pdev.tar.gz -C /opt && rm /tmp/pdev.tar.gz \
 && /opt/pdev/pdev --version
WORKDIR /app
COPY container/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY dist ./dist
ENV NODE_ENV=production PDEV_BIN=/opt/pdev/pdev AGENT_WORK_ROOT=/tmp/agent-sessions PORT=8080
USER node
CMD ["node", "dist/main.js"]
