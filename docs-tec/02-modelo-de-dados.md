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
| `relationshipType` | enum `RelationshipType` | não | `FAMILY`, `FRIEND`, `ACQUAINTANCE`, `OTHER` — cônjuge **não** está aqui, virou `unions` (ADR-008) |
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

## `unions`

União conjugal entre duas pessoas (ADR-008). É entidade, e não um campo `spouseId`, porque tem dados
próprios e porque uma pessoa pode ter tido mais de uma ao longo da vida — sem isso não dá para
distinguir cônjuge de ex.

| Coluna | Tipo | Nulo? | Nota |
| --- | --- | --- | --- |
| `id` | uuid | não | PK |
| `partnerAId` | uuid | não | FK → `people.id`, `onDelete: Cascade`. Sempre o **menor** dos dois ids (RN-011) |
| `partnerBId` | uuid | não | FK → `people.id`, `onDelete: Cascade` |
| `status` | enum `UnionStatus` | não | `CURRENT` (vigente) ou `ENDED` (desfeita); default `CURRENT` |
| `startDate` | timestamp | sim | |
| `endDate` | timestamp | sim | |

Índice **único** em (`partnerAId`, `partnerBId`) — com a ordem normalizada, ele impede duas linhas
para o mesmo casal. Índice comum em `partnerBId`, porque a busca "as uniões desta pessoa" olha os dois
lados.

Duas auto-relações nomeadas (`PartnerA`, `PartnerB`) dão os lados inversos `unionsAsA` e `unionsAsB`.
Ao contrário de pai/mãe, aqui a relação é **obrigatória**, então apagar uma pessoa apaga as uniões
dela (`Cascade`) — uma união sem um dos lados não significa nada.

**Não há constraint de "no máximo uma união vigente por pessoa"** (RN-014): como `isCentralUser`, a
regra vive no serviço. Um índice único parcial daria a garantia no banco, mas o Prisma não o modela.

## `person_photos`

A foto de perfil (ADR-011). Tabela à parte, e não uma coluna em `people`, porque o Prisma traz todas
as colunas escalares em `findMany` — a lista, a árvore e o calendário carregam todo mundo de uma vez,
e arrastariam junto todas as imagens.

| Coluna | Tipo | Nulo? | Nota |
| --- | --- | --- | --- |
| `personId` | uuid | não | PK **e** FK → `people.id`, `onDelete: Cascade`. Ser a PK é o que garante uma foto por pessoa (RN-017) |
| `bytes` | bytea | não | a imagem já reduzida; o web encolhe para 512px antes de subir |
| `mimeType` | text | não | `image/jpeg`, `image/png` ou `image/webp`, conferido contra a assinatura do arquivo |

O `updatedAt` desta tabela é o que a API expõe como `photoUpdatedAt` na pessoa: diz se existe foto e
serve de versão na URL da imagem, para o navegador não servir a antiga do cache.

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

O histórico começa em `0_init`, o baseline gerado do schema (ADR-006). A segunda,
`20260727120000_uniao_conjugal`, cria as uniões e tira o `WIFE` do enum — nela a ordem importa: a
tabela nova e o backfill (quem era `WIFE` vira `FAMILY` **e** ganha uma união vigente com a pessoa
central) rodam **antes** do `ALTER TYPE`, senão a informação se perderia.

A terceira, `20260728001800_foto_de_perfil`, cria `person_photos` e **derruba** `people.profilePhoto`.
Não há backfill: uma URL não vira imagem sem baixá-la, e a coluna estava vazia. A migration traz no
cabeçalho o `SELECT` para salvar as URLs antes, caso algum banco tenha alguma.

## Seed

[`packages/db/src/seed.ts`](../packages/db/src/seed.ts) cria 4 locais, 23 pessoas fictícias em quatro
gerações e 7 uniões — avós, pais, um tio, a pessoa central (Miguel Souza), irmãos, um primo, esposa,
sogros, um cunhado de cada lado, filhos, amigos e conhecidos, com dois falecidos e datas de
nascimento espalhadas pelo ano. Entre as uniões há uma **desfeita** (a ex-esposa da pessoa central),
para que "Ex-esposa" e o corte da afinidade (RN-013) apareçam sem ninguém precisar montar o caso à
mão. É o suficiente para árvore, calendário, busca e ordenação mostrarem algo real de primeira.

```bash
pnpm db:seed             # exige banco vazio
pnpm db:seed --force     # apaga pessoas, uniões e locais antes
```
