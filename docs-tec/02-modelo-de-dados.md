# 02 — Modelo de dados

Fonte da verdade: [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma).
PostgreSQL 16, Prisma 5. Ids são `uuid` gerados pela aplicação; `createdAt`/`updatedAt` em toda tabela.

## `people`

| Coluna | Tipo | Nulo? | Nota |
| --- | --- | --- | --- |
| `id` | uuid | não | PK |
| `name` | text | não | |
| `sex` | enum `Sex` | sim | `MALE`, `FEMALE` |
| `birthDate` | timestamp | sim | |
| `deathDate` | timestamp | sim | |
| `deceased` | boolean | não | default `false`; derivado de `deathDate` quando ela existe (RN-006) |
| `profilePhoto` | text | sim | URL |
| `relationshipType` | enum `RelationshipType` | não | `FAMILY`, `WIFE`, `FRIEND`, `ACQUAINTANCE`, `OTHER` |
| `isCentralUser` | boolean | não | default `false`; no máximo um `true` (RN-001, garantido na aplicação) |
| `fatherId` | uuid | sim | FK → `people.id` |
| `motherId` | uuid | sim | FK → `people.id` |
| `locationId` | uuid | sim | FK → `locations.id` |

Duas auto-relações nomeadas (`Father`, `Mother`) dão os lados inversos `childrenAsFather` e
`childrenAsMother`. Como são relações **opcionais**, a ação padrão do Prisma ao apagar o pai é
`SetNull`: os filhos sobrevivem sem o vínculo (RN-010).

**Não há constraint de unicidade em `isCentralUser`.** A regra é validada no serviço. Um índice único
parcial (`where isCentralUser`) seria mais forte, mas o Prisma não o modela nativamente — ficaria como
SQL solto na migration. Está no radar, não no schema.

## `locations`

| Coluna | Tipo | Nulo? |
| --- | --- | --- |
| `id` | uuid | não |
| `name` | text | não |

Sem unicidade em `name` — nada impede hoje "Curitiba" e "Curitiba, PR" coexistirem.

## Migrations

```bash
pnpm db:migrate:dev            # cria a migration a partir do schema editado
pnpm db:migrate                # aplica (migrate deploy) — é o que o compose roda
pnpm --filter @kindred/db db:reset   # dropa, remigra e reaplica o seed
```

O histórico começa em `0_init`, o baseline gerado do schema (ADR-006).

## Seed

[`packages/db/src/seed.ts`](../packages/db/src/seed.ts) cria 4 locais e 18 pessoas fictícias em
quatro gerações — avós, pais, um tio, a pessoa central (Miguel Souza), irmãos, um primo, esposa,
filhos, amigos e conhecidos, com dois falecidos e datas de nascimento espalhadas pelo ano. É o
suficiente para árvore, calendário, busca e ordenação mostrarem algo real de primeira.

```bash
pnpm db:seed             # exige banco vazio
pnpm db:seed --force     # apaga pessoas e locais antes
```
