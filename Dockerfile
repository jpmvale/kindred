# Imagem única do backend do monorepo: os serviços `api` e `migrate` do compose
# escolhem o entrypoint. O web não usa esta imagem (roda no host, ADR-004).
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Os engines do Prisma linkam contra o OpenSSL do sistema; o node:slim não o traz.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile=false
# O turbo puxa as dependências (^build): @kindred/types e @kindred/db — que,
# no seu build, roda o `prisma generate`.
RUN pnpm exec turbo run build --filter=@kindred/api

FROM base AS runtime
COPY --from=build /repo /repo
CMD ["node", "apps/api/dist/main.js"]
