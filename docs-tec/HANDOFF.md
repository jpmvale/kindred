# HANDOFF — estado atual

_Atualizado em 26/07/2026._

## Onde o projeto está

O MVP funciona de ponta a ponta: cadastro de pessoas e locais, cálculo de parentesco, lista com
busca/ordenação/paginação, árvore genealógica, calendário de aniversários.

Nesta sessão o projeto foi **reorganizado no formato do coda** — o que estava em dois diretórios
soltos (`kindred-api`, `kindred-web`), com um repositório git de um commit em cada, virou um monorepo
pnpm + Turborepo (ADR-001). O que mudou de estrutura:

| Antes | Agora |
| --- | --- |
| `kindred-api/`, `kindred-web/` (npm, dois repos git) | `apps/api`, `apps/web` (pnpm workspaces, um repo) |
| `kindred-api/prisma/` | `packages/db` (`@kindred/db`) — schema, migrations, seed, client |
| tipos duplicados no front | `packages/types` (`@kindred/types`) — contrato da API, só tipos (ADR-005) |
| `.env` dentro da API | `.env` na raiz, carregado por `loadRootEnv()` (ADR-002) |
| `docker-compose` com api+web em container e bind-mount | compose com postgres + migrate + api; web no host (ADR-004) |
| READMEs boilerplate do Nest e do Vite | um README na raiz + `docs/` e `docs-tec/` |
| sem CI | `.github/workflows/ci.yml` (build, typecheck, lint, testes) |
| sem seed | `pnpm db:seed` — 4 locais e 18 pessoas em quatro gerações |
| migrations sem baseline (o schema vinha de `db push`) | migration `0_init` gerada do schema (ADR-006) |

Também nesta sessão: `GET /api/health` substituiu o controller "Hello World"; os DTOs passaram a
validar com os enums do schema Prisma em vez de listas próprias; testes de unidade de verdade
(`computeKinship`, health) no lugar do teste de exemplo; e um erro de tipos que já existia no
`TreePage` (mudanças não commitadas) foi corrigido.

## O que foi verificado rodando

- `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (7 testes) — verdes.
- `docker compose up -d postgres` + `pnpm db:migrate` (aplica `0_init` num banco novo) + `pnpm db:seed`.
- `pnpm dev`: API em `:3000/api` e web em `:5173`, com `/api/health` OK, parentesco correto para as
  18 pessoas do seed (Pai, Mãe, Avô, Avó, Irmã, Irmão, Tio, Primo, Filha, Filho, Você) e
  busca/paginação/ordenação funcionando através do proxy do Vite.
- `docker compose up -d --build`: imagem do backend, `migrate` aplicando as migrations e a API
  respondendo em container (healthcheck verde).
- O repositório foi publicado em [github.com/jpmvale/kindred](https://github.com/jpmvale/kindred) e o
  CI passou no primeiro push.

## Pontos de atenção

- **Portas.** O projeto irmão *coda* também usa 3000 e 5432. Rodar os dois ao mesmo tempo exige
  mudar as portas de um deles (`docker compose stop` no coda foi o que se fez aqui).
- **"Parente distante" para quem não é da família.** Amigos, conhecidos e a esposa aparecem assim na
  lista, porque o cálculo só conhece vínculo de sangue. A UI ficaria melhor não mostrando parentesco
  quando `relationshipType` não é `FAMILY` — é conversa de produto, ver BL-01.
- **Duas regras do `react-hooks` estão como aviso** no ESLint do web (BL-11), por causa do fetch em
  `useEffect` nas páginas. O CI passa, mas a dívida existe.
- **`isCentralUser` não tem unicidade no banco** — a garantia é só na aplicação (doc 02).

## Próximo passo sugerido

Escolher entre: (a) cônjuge como vínculo de verdade (BL-01, destrava casais na árvore e o parentesco
por afinidade), ou (b) esconder o parentesco de quem não é família — o incômodo mais visível hoje na
tela de pessoas.
