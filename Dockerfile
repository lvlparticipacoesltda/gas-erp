# API Gas ERP — imagem para Fly.io (região GRU, perto do Neon sa-east-1)
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

FROM base AS prepare
COPY . .
# turbo é devDependency da raiz — precisa de install antes do prune
RUN pnpm install --frozen-lockfile
RUN pnpm turbo prune @gas-erp/api --docker

FROM base AS build
COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=prepare /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile
COPY --from=prepare /app/out/full/ .
COPY --from=prepare /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=prepare /app/scripts/release-migrate.sh /app/scripts/fly-release.sh ./scripts/
RUN chmod +x scripts/release-migrate.sh scripts/fly-release.sh
RUN pnpm db:generate && pnpm turbo build --filter=@gas-erp/api

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=build /app /app
EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
