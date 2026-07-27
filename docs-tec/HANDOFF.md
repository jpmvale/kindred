# HANDOFF — estado atual

_Atualizado em 27/07/2026._

## Onde o projeto está

O MVP funciona de ponta a ponta: cadastro de pessoas e locais, cálculo de parentesco, lista com
busca/ordenação/paginação, árvore genealógica, calendário de aniversários.

## Sessão de 27/07 — união conjugal (BL-01)

Cônjuge deixou de ser rótulo e virou vínculo. O valor `WIFE` saiu do `RelationshipType` e entrou a
tabela `unions` (`partnerA`/`partnerB`, `status`, `startDate`, `endDate`) — o porquê está no
**ADR-008**, e o resumo é que um `spouseId` não teria onde guardar que a união acabou.

| Camada | O que entrou |
| --- | --- |
| `packages/db` | modelo `Union` + enum `UnionStatus`; migration `20260727120000_uniao_conjugal` (backfill do `WIFE` → `FAMILY` + união com a pessoa central, **antes** de remover o valor do enum); seed com três uniões, uma delas desfeita |
| `packages/types` | `union.ts` — `UnionDto`, `UnionStatus`, payloads de criação/atualização |
| `apps/api` | módulo `unions/` (CRUD + validações RN-011/RN-014); `people.service` carrega as uniões e as passa ao cálculo |
| `apps/api` | `kinship.util.ts` reescrito: BFS de sangue separada da rotulagem, com um salto de afinidade por cima (RN-012/RN-013) |
| `apps/web` | `api/unions.ts` e a seção **Uniões** no `PersonFormPage` (recurso próprio, age na hora — não espera o submit da pessoa) |

Afinidade **só atravessa união vigente**: ao marcar a união como desfeita, a esposa vira "Ex-esposa"
e o sogro volta a ser "Parente distante". Foi verificado rodando, ponta a ponta.

O que ficou de fora do BL-01: **a árvore não desenha casais** — virou BL-12, porque mexe no
`TreePage` (928 linhas, sem testes) e valia fechar o vínculo antes.

## Sessão de 26/07 — monorepo

O que estava em dois diretórios soltos (`kindred-api`, `kindred-web`), com um repositório git de um
commit em cada, virou um monorepo pnpm + Turborepo (ADR-001). O que mudou de estrutura:

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

Na sessão de 27/07 (união conjugal):

- `pnpm typecheck`, `pnpm lint` e `pnpm test` (**22 testes**, 21 deles de parentesco) — verdes.
- A migration foi testada num **banco descartável** antes de tocar o de dev: `0_init` + linhas com
  `WIFE` + a migration nova, conferindo que a pessoa virou `FAMILY`, que a união nasceu vigente com o
  par normalizado e que o enum ficou com 4 valores. Também o caminho sem pessoa central.
- API em `:3001` contra o seed: as quatro validações de união respondem certo (mesma pessoa, par
  repetido em qualquer ordem, segunda união vigente) e o ciclo separar → "Ex-esposa" → sogro volta a
  "Parente distante" acontece de fato.
- Web em `:5174`: o select de relacionamento já não tem "Esposa", a seção **Uniões** lista e adiciona,
  a lista de candidatos exclui quem já tem união, e o erro de segunda união vigente chega na tela.

Na sessão de 26/07 (monorepo):

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
- **"Parente distante" para amigos e conhecidos.** O cônjuge e a família dele já têm rótulo (RN-012,
  RN-013), mas quem entrou como `FRIEND`/`ACQUAINTANCE` continua caindo no fallback, porque não há
  caminho de sangue nem de união. A UI ficaria melhor não mostrando parentesco nesses casos — é
  conversa de produto, ainda em aberto.
- **A árvore ignora as uniões.** O `TreePage` só percorre pai/mãe; casais não aparecem lado a lado
  (BL-12).
- **Duas regras do `react-hooks` estão como aviso** no ESLint do web (BL-11), por causa do fetch em
  `useEffect` nas páginas. O CI passa, mas a dívida existe.
- **`isCentralUser` não tem unicidade no banco** — a garantia é só na aplicação (doc 02).

## Próximo passo sugerido

**BL-12 — desenhar casais na árvore.** É a metade que ficou de fora do BL-01: o dado já está lá
(`GET /api/people` devolve `unions` em cada pessoa), falta o `TreePage` colocar o cônjuge ao lado em
vez de só empilhar gerações. Vale escrever os primeiros testes do front junto (BL-08), porque o
arquivo tem 928 linhas e nenhum hoje.

Alternativa menor: esconder o parentesco de quem é `FRIEND`/`ACQUAINTANCE`, para tirar o "Parente
distante" que ainda sobra na lista.
