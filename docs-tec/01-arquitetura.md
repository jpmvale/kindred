# 01 — Arquitetura e decisões (ADRs)

## Layout do repositório

```
kindred/
├── package.json            scripts do monorepo (turbo)
├── pnpm-workspace.yaml     workspaces + allowBuilds (scripts de install autorizados)
├── turbo.json              grafo de tarefas (build, dev, typecheck, lint, test)
├── tsconfig.base.json      base dos pacotes (CJS, strict, composite)
├── docker-compose.yml      postgres + migrate + api
├── Dockerfile              imagem única do backend
├── apps/
│   ├── api/                @kindred/api — NestJS
│   └── web/                @kindred/web — React + Vite
├── packages/
│   ├── db/                 @kindred/db — Prisma (schema, migrations, seed, client)
│   └── types/              @kindred/types — contrato da API, só tipos
├── docs/                   produto
└── docs-tec/               técnico (este diretório)
```

---

## ADR-001 — Monorepo pnpm + Turborepo

**Contexto.** O projeto nasceu como dois diretórios independentes (`kindred-api`, `kindred-web`),
cada um com seu próprio repositório git de um commit e seu `package-lock.json`. Um `docker-compose.yml`
solto na pasta acima amarrava os dois. Não havia como versionar uma mudança que atravessa API e front
(o caso comum aqui: um campo novo em Pessoa).

**Decisão.** Um repositório, pnpm workspaces + Turborepo, `apps/*` para o que roda e `packages/*` para
o que é compartilhado — o mesmo formato do projeto irmão *coda*.

**Consequências.** Um commit descreve a mudança inteira. `pnpm dev` sobe tudo. O Turborepo garante a
ordem (`dependsOn: ["^build"]`): quem depende de `@kindred/db`/`@kindred/types` só compila depois
deles. Preço: é obrigatório usar pnpm — `npm install` aqui quebra os symlinks do workspace.

---

## ADR-002 — Uma configuração, na raiz

**Contexto.** O `.env` vivia dentro da API. Com pacotes que também precisam de `DATABASE_URL` (CLI do
Prisma, seed), duplicar arquivo de env por pacote é receita de divergência.

**Decisão.** Um `.env` na raiz. O `@kindred/db` expõe `loadRootEnv()`, que carrega
`.env.local`/`.env` da raiz e, se nada definir `DATABASE_URL`, aplica o default de dev. Variável já
presente no ambiente **ganha** do arquivo — é assim que o `docker compose` injeta o host `postgres`.

**Consequências.** `pnpm db:migrate`, `pnpm db:seed` e a API funcionam num clone limpo sem nenhum
arquivo de env. A API chama `loadRootEnv()` como primeira instrução do `bootstrap()`, antes de o Nest
instanciar o `PrismaClient` (que lê `DATABASE_URL` na construção).

---

## ADR-003 — Prisma isolado no `@kindred/db`

**Decisão.** Só o `@kindred/db` declara `prisma`/`@prisma/client`. Ele reexporta `PrismaClient`,
`Prisma`, os enums (`Sex`, `RelationshipType`, `UnionStatus`) e os tipos de modelo. `apps/api` importa
**de `@kindred/db`** — nunca de `@prisma/client`.

**Consequências.** O `prisma generate` roda num lugar só (é o `build` do pacote, então o Turborepo o
executa antes de compilar a API, inclusive no Docker e no CI). Os DTOs validam com os enums do
schema (`@IsEnum(RelationshipType)`), o que elimina a lista duplicada que existia antes no DTO: schema
e validação não podem mais divergir.

---

## ADR-004 — Dev: banco em Docker, front sempre no host

**Contexto.** O compose anterior subia API e web em container com bind-mount de `/app` e
`node_modules` anônimo, mais `CHOKIDAR_USEPOLLING`. Num monorepo pnpm isso não sobrevive: as
dependências são symlinks para o store, que um volume anônimo por container não reproduz.

**Decisão.** O compose sobe **Postgres**, um serviço **`migrate`** (roda as migrations e sai) e a
**API** a partir do `dist` buildado. O **web nunca vai para o compose** — roda no host com HMR. O
fluxo padrão do dia a dia é `docker compose up -d postgres` + `pnpm dev`.

**Consequências.** Hot reload confiável no front, e o container da API é o mesmo artefato que rodaria
em produção. Mexeu no backend e quer ver no container: `docker compose build api`.

---

## ADR-005 — `@kindred/types` sem runtime

**Contexto.** Os tipos do front (`Person`, `Location`) precisavam ser compartilhados com a API. Mas um
pacote do workspace com **valor** em runtime, compilado para CJS, é justamente o que o Vite não
pré-empacota (dependência "linkada") — dá erro de import ESM/CJS em dev.

**Decisão.** O `@kindred/types` exporta **apenas tipos**; o web importa tudo com `import type`, que o
bundler apaga. Os rótulos em pt-BR (`SEX_LABELS`, `RELATIONSHIP_LABELS`), que *são* valores, ficaram em
`apps/web/src/labels.ts` — apresentação, não contrato.

**Consequências.** Zero configuração de `optimizeDeps`/`commonjsOptions` no Vite. Onde a API precisa
validar em runtime, ela declara a lista e o TypeScript confere contra o tipo compartilhado com
`satisfies` (ver `find-people-query.dto.ts`).

---

## ADR-006 — Migrations com baseline

**Contexto.** O histórico de migrations tinha **só** `add_deceased_boolean`: o schema vinha sendo
aplicado com `prisma db push` dentro do container, então um banco novo nunca poderia ser construído a
partir das migrations.

**Decisão.** Baseline: uma migration `0_init` gerada do schema atual (`prisma migrate diff`), que
cria tudo. A migration órfã anterior foi descartada — o que ela adicionava (`deceased`) já está no
baseline.

**Consequências.** `pnpm db:migrate` (`prisma migrate deploy`) constrói um banco do zero, o que é o
que o serviço `migrate` do compose e o `db:reset` fazem. Daqui para frente, mudança de schema é
`pnpm db:migrate:dev` — `db push` fica banido.

---

## ADR-007 — Parentesco calculado na aplicação

**Contexto.** O grau de parentesco depende do caminho entre duas pessoas no grafo de pai/mãe. Fazer
isso em SQL exige CTE recursiva; guardar o rótulo em coluna exige recalcular tudo a cada edição.

**Decisão.** Calcular na API, em memória (`people/kinship.util.ts`): busca em largura a partir da
pessoa central contando **subidas** e **descidas**, com limite de 8 passos, e traduzir o par
(subidas, descidas) por tabela, flexionando pelo sexo.

**Consequências.** Simples de ler, testar (`kinship.util.spec.ts`) e evoluir em pt-BR — e nada fica
desatualizado, porque nada é persistido. Em troca, `GET /api/people` carrega todas as pessoas para
calcular. Para uma base pessoal (centenas de pessoas) é irrelevante; ver BL-09.

---

## ADR-008 — União conjugal é entidade, não um campo

**Contexto.** Cônjuge era um valor do enum `RelationshipType` (`WIFE`): um rótulo social, sem vínculo
nenhum no banco. A esposa aparecia como "Parente distante", a árvore não tinha como desenhar casais e
não havia caminho até sogro ou cunhado. O desenho óbvio — um `spouseId` apontando para outra pessoa —
**não resolve o caso que motivou a mudança**: separação. Um campo só comporta um valor e não tem onde
guardar que a união acabou, então não sabe dizer se alguém é cônjuge ou ex.

**Decisão.** Uma tabela `unions` ligando duas pessoas, com `status` (`CURRENT`/`ENDED`), `startDate` e
`endDate` — a mesma forma que o GEDCOM usa para família. O valor `WIFE` saiu do `RelationshipType`
(a migration converte quem estava assim para `FAMILY` e cria a união com a pessoa central), para não
haver duas fontes dizendo a mesma coisa e podendo divergir.

A união é simétrica, mas a tabela precisa de dois lados. A invariante é gravar sempre o **menor id em
`partnerAId`** (RN-011): assim (A,B) e (B,A) caem na mesma linha e o índice único do par funciona. A
conversão para a visão "as uniões desta pessoa, e quem é o par" acontece na borda da API
(`withUnions`, em `people.service.ts`), então quem consome nunca vê `partnerA`/`partnerB`.

**Consequências.** O cálculo de parentesco passou a ter dois grafos sobrepostos: o de sangue, que é
percorrido em largura como antes, e o de uniões, que entra depois só para nomear a afinidade — sogro,
cunhado, genro, padrasto, enteado. Afinidade **só atravessa união vigente** (RN-013): terminada a
união, a pessoa vira "Ex-esposa" e os parentes dela deixam de ser parentes, que é o comportamento que
se espera de uma separação. Preço: uniões são recurso próprio (`/api/unions`), fora do formulário de
pessoa. Desenhar os casais na árvore veio depois, no ADR-009.

---

## ADR-009 — O layout da árvore fora do componente, e o casal como bloco

**Contexto.** O `TreePage` tinha 928 linhas misturando o algoritmo de layout (quem aparece, onde cada
nó fica) com o render do React Flow — e nenhum teste, porque testar exigia montar o componente. Era o
arquivo mais delicado do projeto, e desenhar casais mexia justamente no algoritmo.

**Decisão.** O layout saiu para [`apps/web/src/pages/tree-layout.ts`](../apps/web/src/pages/tree-layout.ts),
um módulo puro: entra a lista de pessoas e o que está expandido, saem nós e arestas. Não importa nada
de runtime do React nem do reactflow (só tipos), então roda no Vitest sem DOM — é o primeiro teste de
front do projeto (`tree-layout.test.ts`, BL-08).

Sobre o casal em si, duas escolhas:

- **O cônjuge é encostado no par depois do dagre.** O dagre organiza gerações, e união não é geração:
  colocar o cônjuge no grafo o empurraria para um rank próprio. Ele é posicionado à mão, na altura do
  par. Havendo duas uniões, os lados **alternam** — a vigente para fora, a ex para o outro lado, com
  o par no meio: empilhadas do mesmo lado, a linha da ex passaria por trás do card da atual e a
  árvore diria que quem é casado são as duas.
- **O espaçamento de cada geração trata o casal como um bloco só.** O passe que garante distância
  mínima entre nós do mesmo rank passou a mover o casal junto, senão ele enfia um irmão ou um primo
  entre marido e mulher.

**Consequências.** Quem só está na árvore por causa da união é **folha**: aparece ao lado do par, mas
sem os botões de expandir — abrir a linha dele traria a família inteira do sogro para uma árvore que
é de sangue (BL-13). Quem tem união *e* laço de sangue (o cônjuge que também é pai de alguém visível,
ou o primo com quem se casou) mantém o rank próprio e mesmo assim é aproximado do par.
