# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:/app/node_modules/.bin:/usr/local/bin:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
ENV CI=1
ENV npm_config_fetch_retries=5
ENV npm_config_fetch_timeout=600000
ENV npm_config_audit=false
ENV npm_config_fund=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && npm install -g @openai/codex@0.135.0 --no-audit --no-fund --ignore-scripts --loglevel=warn \
  && npm install -g @anthropic-ai/claude-code@2.1.159 --no-audit --no-fund --foreground-scripts --loglevel=warn

WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV SCREENHELP_BRIDGE_PORT=8787
ENV SCREENHELP_CLAUDE_BIN=claude
ENV SCREENHELP_CODEX_BIN=codex

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/bridge ./bridge
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /home/screenhelp/.claude /home/screenhelp/.codex \
  && useradd --create-home --home-dir /home/screenhelp --shell /bin/bash screenhelp \
  && chown -R screenhelp:screenhelp /app /home/screenhelp

USER screenhelp
EXPOSE 3000

CMD ["pnpm", "start:container"]
