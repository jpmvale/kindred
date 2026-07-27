# kindred

**kindred** é uma aplicação pessoal para registrar **pessoas** e os **vínculos** entre elas — a
família, quem é amigo, quem é só conhecido. A partir de uma **pessoa central** (você), o kindred
calcula sozinho o **grau de parentesco** de todo mundo ("Avó", "Tio", "Primo em 2º grau"), desenha a
**árvore genealógica** navegável e reúne os **aniversários** num calendário.

Monorepo TypeScript (ADR-001): API NestJS + Prisma/PostgreSQL e front React/Vite, com o schema e o
contrato da API isolados em pacotes compartilhados.

Documentação: [`docs/`](docs/) (produto — visão, domínio, regras de negócio) e
[`docs-tec/`](docs-tec/) (técnico — arquitetura, modelo de dados, testes, ADRs). Para retomar de onde
a última sessão parou, ver [`docs-tec/HANDOFF.md`](docs-tec/HANDOFF.md).

---

## Funcionalidades

| Área | O que faz |
| --- | --- |
| **Setup** | Na primeira execução a app pede a **pessoa central** — a referência de todo o cálculo de parentesco. |
| **Pessoas** | Cadastro, edição e remoção: nome, sexo, nascimento, falecimento, foto (URL), tipo de relacionamento (família, amigo, conhecido, outro), pai, mãe e local. |
| **Uniões** | Vínculo conjugal entre duas pessoas, com situação (vigente ou desfeita) e datas de início e fim — no formulário da pessoa (RN-011, ADR-008). |
| **Listagem** | Busca por nome, parentesco ou tipo de relacionamento; ordenação por nome, nascimento ou idade; paginação; pessoas falecidas vão para o fim da lista. |
| **Parentesco** | Grau calculado na API em relação à pessoa central, com gênero ("Avô"/"Avó") e até 8 passos de distância (RN-004); por afinidade, um salto pela união vigente — sogro, cunhado, genro (RN-013). |
| **Árvore** | Árvore genealógica interativa (React Flow + dagre): ancestrais, descendentes, irmãos e ramos de primos, expandindo nó por nó; casais lado a lado, com a união vigente em linha cheia e a desfeita tracejada; a linha do cônjuge (sogros, cunhados) abre pelo mesmo botão (ADR-009). |
| **Calendário** | Aniversários do mês e os próximos, em pt-BR. |
| **Locais** | CRUD de locais (cidades) associáveis às pessoas. |

---

## Como rodar localmente

**Requisitos:** Node ≥ 22, pnpm 11 (via `corepack`), Docker.

```bash
# 1. Dependências (todo o monorepo)
corepack pnpm install

# 2. Banco de dados
docker compose up -d postgres

# 3. Schema + dados de exemplo
pnpm db:migrate                 # aplica as migrations
pnpm db:seed                    # família fictícia de 18 pessoas e 4 locais

# 4. API e web em watch (Turborepo sobe os dois)
pnpm dev
```

- **Web:** http://localhost:5173
- **API:** http://localhost:3000/api — health em http://localhost:3000/api/health
- **Variáveis de ambiente:** opcionais. Copie [`.env.example`](.env.example) para `.env` se quiser
  mudar `DATABASE_URL` ou `PORT`; sem `.env`, os defaults de dev (o Postgres do compose na 5432 e a
  API na 3000) já funcionam.

O front chama sempre `/api/...` e o dev server do Vite repassa para a API (`vite.config.ts`) — não há
URL de API embutida no bundle.

> **Rodando a API em container** (em vez de `pnpm dev`): `docker compose up -d` sobe Postgres,
> aplica as migrations (serviço `migrate`, que roda e sai) e sobe a API. O web continua no host:
> `pnpm --filter @kindred/web dev`. Mudou o backend, `docker compose build api && docker compose up -d`.

**Banco de dados (Prisma):**

```bash
pnpm db:migrate                 # prisma migrate deploy
pnpm db:migrate:dev             # cria uma migration nova a partir do schema
pnpm db:seed                    # seed; --force apaga o que existe antes
pnpm db:studio                  # Prisma Studio
pnpm --filter @kindred/db db:reset   # dropa, remigra e reaplica o seed
```

**Testes e verificações:**

```bash
pnpm test                       # testes de unidade (Jest, sem banco)
pnpm typecheck                  # tsc em todos os pacotes
pnpm lint
pnpm --filter @kindred/api test:e2e   # e2e — precisa do Postgres de pé
```

---

## Estrutura

```
packages/
  types/   @kindred/types   contrato da API (só tipos, ADR-005)
  db/      @kindred/db      schema Prisma + migrations + seed + client — doc 02
apps/
  api/     @kindred/api     NestJS: people, locations, health
  web/     @kindred/web     React + Vite: lista, formulário, árvore, calendário, locais
```

| Camada | Tecnologia |
| --- | --- |
| **Backend** | NestJS 11, class-validator + class-transformer, RxJS |
| **Banco / ORM** | PostgreSQL 16 + [Prisma](https://www.prisma.io) 5 |
| **Front** | React 19, Vite, React Router, axios, [React Flow](https://reactflow.dev) + [dagre](https://github.com/dagrejs/dagre) (árvore), CSS puro |
| **Monorepo** | [pnpm workspaces](https://pnpm.io) + [Turborepo](https://turbo.build) |
| **Testes / CI** | Jest (unidade + e2e), GitHub Actions |
