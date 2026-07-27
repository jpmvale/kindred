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

## Sessão de 27/07 — casais na árvore (BL-12)

A outra metade: a árvore passou a desenhar as uniões. O layout saiu do `TreePage` para
[`tree-layout.ts`](../apps/web/src/pages/tree-layout.ts) — módulo puro, sem React nem reactflow em
runtime — e virou o **primeiro teste de front do projeto** (`tree-layout.test.ts`, 10 casos no
Vitest). O porquê das duas escolhas de layout está no **ADR-009**:

- o cônjuge é encostado no par **depois** do dagre (união não é geração);
- havendo duas uniões, os lados alternam — a vigente para fora, a ex para o outro lado, com o par no
  meio. Empilhadas, a linha da ex passava por trás do card da atual;
- o passe de espaçamento de cada geração trata o casal como **um bloco**, senão enfia um irmão entre
  marido e mulher.

Há um filtro **Com cônjuges** ao lado do "Com irmãos", e a legenda ganhou união vigente (linha cheia)
e desfeita (tracejada).

## Sessão de 27/07 — a linha do cônjuge (BL-13)

O cônjuge deixou de ser folha: ganhou os mesmos botões de todo mundo, e o "+" abre sogro e sogra, o
"↔" traz os cunhados. A família dele **só entra quando é pedida** — a árvore continua de sangue por
padrão.

O problema real era o rank. O dagre não sabe que uma união liga duas pessoas, então o cônjuge sem
filhos na árvore fica solto e vai para o topo, levando o sogro junto — ele apareceria acima dos
próprios avós da pessoa central. Resolver dentro do dagre não dá: `minlen: 0` (aresta de mesmo rank)
**quebra o layout**, verificado à parte antes de escolher o caminho. A saída foi deixar o dagre
arrumar a família do cônjuge entre si e deslocar esse **grupo inteiro**, em x e em y, junto com o
cônjuge (ADR-009).

## Sessão de 27/07 — busca sem acento (BL-03)

A busca já ignorava caixa; agora ignora acento também, nos dois sentidos (RN-016). A normalização
virou [`search.util.ts`](../apps/api/src/people/search.util.ts) — `NFD` para separar a letra do
acento e `\p{Diacritic}` para apagar só a marca — e o `people.service` passa **os dois lados** pela
mesma função: o termo digitado e cada um dos três campos casados (nome, grau, rótulo social).

Normalizar só o termo não bastaria: um "Jose" cadastrado sem acento ficaria invisível para quem
digita "José". Como o filtro é em memória (BL-09), a mudança não tocou o banco — quando a busca for
para o SQL, ela cobra `unaccent` junto.

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

## Sessão de 27/07 — sem parentesco para quem não é família (RN-015)

O "Parente distante" que sobrava na lista era o fallback do `computeKinship` para quem não tem
caminho nenhum. Faz sentido para família (*é* parente, só não se sabe como); para amigo e conhecido
era ruído. Agora o fallback é só para `FAMILY`; os outros vêm com `kinshipDegree: null` e a tela
mostra só o rótulo social — a UI já tratava o nulo, a mudança é da API.

**Ter caminho vale mais que o rótulo social:** o primo cadastrado como amigo continua "Primo", e a
Tereza do seed, que é `OTHER`, continua "Ex-esposa" pela união. A regra só decide o que fazer quando
não há resposta.

## O que foi verificado rodando

Na sessão de 27/07:

- BL-03 com a API no ar, contra o seed: "antonio" e "Antônio" acham o mesmo Antônio Souza; "jose",
  "sonia", "lucia" e "sergio" acham José Lima, Sônia Alves, Lúcia Prado e Sérgio Menezes; "familia"
  traz as 10 pessoas com o rótulo "Família"; "avo" traz os 4 avós, "Avô" e "Avó" juntos.
- BL-13 na tela, contra o seed: o "+" da Fernanda traz Heitor e Sônia **exatamente uma linha acima**
  (148px, a distância entre gerações) e do lado dela, não sobre o Miguel; o "↔" traz o Marcos
  (Cunhado) na mesma linha. Com tudo aberto: 19 nós em 4 gerações, **nenhuma colisão** e as 7 linhas
  de união medindo 14px — o vão de um casal encostado.
- RN-015 contra o seed, com a API no ar: os três amigos/conhecidos e a `OTHER` sem união vêm com
  `kinshipDegree` nulo, todo o resto mantém o grau, e a lista na tela mostra "Amigo(a) · Masculino ·
  19/07/1987" sem parentesco nenhum. A busca continua achando por rótulo social ("amigo" → 2) e por
  grau ("primo" → 1).

- `pnpm typecheck`, `pnpm lint` e `pnpm test` (**46 testes**: 23 de parentesco, 16 do layout da
  árvore, 6 da normalização da busca, 1 de health) — verdes.
- Árvore no navegador contra o seed, colapsada e com tudo aberto: **nenhum par mais perto que o
  espaçamento mínimo** (era o defeito que apareceu no meio do caminho — dois cards sobrepostos) e as
  linhas de união todas no vão de um casal encostado. Desligar "Com cônjuges" tira os nós e as
  linhas; o hover realça as duas uniões do Miguel, a vigente e a desfeita.
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
- **O grupo de afinidade se desloca como bloco, mas o espaçamento é linha a linha.** Num caso
  extremo (muitos cônjuges com família aberta na mesma geração) o grupo pode sair torto — nunca
  sobreposto, mas desalinhado do cônjuge. Não apareceu com o seed.
- **Duas regras do `react-hooks` estão como aviso** no ESLint do web (BL-11), por causa do fetch em
  `useEffect` nas páginas. O CI passa, mas a dívida existe.
- **`isCentralUser` não tem unicidade no banco** — a garantia é só na aplicação (doc 02).

## Próximo passo sugerido

Nada travado, e as três frentes do cônjuge estão fechadas. Em ordem de incômodo:

1. **BL-03** — busca sem acento ("jose" achar "José"). Pequeno e aparece toda hora.
2. **BL-11** — tirar o fetch do `useEffect`, que é a dívida que o ESLint ainda aponta.
3. **BL-08** — os testes que faltam no front (lista, formulário, calendário). A árvore já tem os
   seus, e o caminho está aberto: `pnpm --filter @kindred/web test` roda no Vitest.
