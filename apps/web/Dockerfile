# Web (Vite + React) para produção. Build a partir da RAIZ do monorepo:
#   docker build -f apps/web/Dockerfile .
#
# Não há build-arg de URL da API: o cliente chama `/api` relativo, e quem resolve
# isso é o proxy — o do Vite em dev, o Caddy em produção. É o que permite servir
# web e API na mesma origem sem nada gravado no bundle.
#
# O dev continua rodando no host (ADR-004); esta imagem existe só para publicar.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile=false
# O turbo puxa o `^build` — @kindred/types compila antes do web, que o consome.
RUN pnpm exec turbo run build --filter=@kindred/web

FROM caddy:2-alpine AS runtime
COPY --from=build /repo/apps/web/dist /srv

# `try_files {path} /index.html` é o que faz o React Router funcionar em URL
# digitada direto: sem isso, abrir /people/42 devolve 404 porque não existe
# arquivo com esse nome — só a rota client-side.
RUN printf ':8080 {\n\
    root * /srv\n\
    encode gzip zstd\n\
    try_files {path} /index.html\n\
    file_server\n\
    header /assets/* Cache-Control "public, max-age=31536000, immutable"\n\
    header /index.html Cache-Control "no-cache"\n\
}\n' > /etc/caddy/Caddyfile

EXPOSE 8080
