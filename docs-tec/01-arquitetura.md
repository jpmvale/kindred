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

Depois veio a família do cônjuge (sogro, cunhado, avó do cônjuge), e ela obrigou a uma terceira
escolha: **o grupo de afinidade anda junto**. O dagre não sabe que uma união liga duas pessoas, então
o cônjuge sem filhos na árvore fica solto e o dagre o joga para o topo, levando o sogro junto — o
sogro apareceria acima dos próprios avós da pessoa central. Tentar resolver dentro do dagre não dá:
uma aresta de mesmo rank (`minlen: 0`) **quebra o layout** (o algoritmo pressupõe que toda aresta
desce pelo menos um nível). Então o dagre arruma a família do cônjuge entre si — sogro em cima,
cunhado ao lado —, e o `placeCouples` desloca esse conjunto inteiro, em x e em y, pelo mesmo tanto
que deslocou o cônjuge. O desenho interno chega intacto na altura certa.

**Consequências.** O cônjuge deixou de ser folha: tem os mesmos botões de todo mundo, e a linha dele
só entra quando é pedida — a árvore continua sendo de sangue por padrão. Quem tem união *e* laço de
sangue (o cônjuge que também é pai de alguém visível, ou o primo com quem se casou) mantém o rank
próprio e mesmo assim é aproximado do par. O limite conhecido: o grupo de afinidade se desloca como
bloco, mas o passe de espaçamento continua trabalhando linha a linha — num caso extremo o grupo pode
sair torto, embora nunca sobreposto.

---

## ADR-010 — Os dados vêm de loaders de rota, não de `useEffect`

**Contexto.** Toda página buscava os próprios dados dentro de um `useEffect`: renderizava vazia,
chamava a API, voltava com `setState`. Isso custava três coisas. A primeira é a cascata de renders
que o próprio React desaconselha — e que o lint apontava, com duas regras rebaixadas a *aviso* para
o CI não travar (BL-11). A segunda é que a lista de pessoas guardava busca, ordenação e página em
estado do componente, então recarregar a tela perdia tudo e não havia link para uma busca. A
terceira é que essa forma não tem como ser testada sem montar o componente inteiro.

A alternativa comum é uma biblioteca de dados (TanStack Query e afins). O `react-router-dom` v7 já
estava no projeto e resolve o mesmo problema sem dependência nova.

**Decisão.** O router virou *data router* (`createBrowserRouter`), e cada rota tem um **loader** —
todos juntos em [`src/loaders.ts`](../apps/web/src/loaders.ts). O loader roda **antes** de a página
renderizar; a página só lê o resultado com `useLoaderData`. Depois de uma escrita, quem recarrega é
`useRevalidator()`, não um `setState` local.

Três consequências de desenho vieram junto:

- **A lista de pessoas mora na URL.** Busca, ordenação e página são query params, lidos por um módulo
  puro ([`people-list-query.ts`](../apps/web/src/pages/people-list-query.ts)) que valida o que vier
  torto — a URL é editável e não dá para confiar nela. O que é padrão não vai para a query string,
  então a lista em repouso continua sendo `/people`.
- **O `/setup` virou porta de entrada de verdade.** O desvio de quem ainda não tem pessoa central era
  um efeito no `App`; agora é o loader do layout. O `/setup` fica fora desse layout para não cair no
  próprio desvio.
- **A árvore calcula o desenho durante o render.** `computeLayout` é função pura (ADR-009), então o
  resultado é um `useMemo`, e "a árvore saiu vazia" passou a ser coisa derivada. O efeito que sobrou
  ali só empurra nós e arestas para dentro do reactflow — sincronizar sistema de fora é justamente
  para o que serve um efeito.

**Consequências.** As duas regras de lint voltaram a ser **erro** (na verdade saíram do arquivo: o
padrão do plugin já é erro), sem nenhuma exceção no código. O formulário de pessoa é o único lugar
que ainda copia dado do servidor para estado local, e por um motivo: ele se descola do servidor no
instante em que alguém digita.

O campo de busca tem uma sutileza que custou um defeito no caminho. Ele corre à frente da URL até o
debounce alcançar, e precisa se realinhar quando a URL muda **por fora** (voltar do navegador, link
colado). Comparar o campo com a URL não basta: a resposta do próprio debounce conta como mudança e
apaga o que a pessoa digitou enquanto a busca anterior ia e voltava. Por isso a página guarda o
último termo **enviado** e só se realinha quando a URL discorda dele.

Preço: navegar agora espera o loader terminar antes de trocar de tela — nada pisca vazio, mas um
clique numa API lenta parece travado até a página virar. Hoje a API é local e responde em
milissegundos; se um dia não for, o caminho é `useNavigation()` para uma barra de progresso.

---

## ADR-011 — A foto de perfil mora no Postgres, e o navegador é quem reduz

**Contexto.** A foto era uma **URL** para uma imagem hospedada em outro lugar: o kindred não
guardava imagem nenhuma, só o endereço. Isso empurra o problema para fora — a foto some quando o
site de origem sai do ar — e não é o que "upload de foto" quer dizer (BL-02).

Guardar arquivo abre duas perguntas, e elas se respondem juntas: **onde** os bytes ficam e **quem**
reduz a imagem.

**Decisão 1 — os bytes ficam no banco, numa tabela à parte.** O caminho convencional seria uma pasta
montada como volume. O que decidiu contra foi o backup: hoje o único jeito de tirar os dados do
kindred é o `pg_dump` (é o que o BL-06 quer resolver). Com as fotos em disco, o dump deixaria de ser
backup completo **sem ninguém avisar** — e um backup que parece completo e não é vale menos que
nenhum. No banco, a foto entra no dump, some junto com a pessoa pela cascata (não há arquivo órfão) e
o `docker-compose` fica como está, sem volume novo.

A tabela é separada (`person_photos`) e não uma coluna em `people` por um motivo prático: o Prisma
traz todas as colunas escalares em `findMany`, e a lista, a árvore e o calendário carregam **todo
mundo** de uma vez. Uma coluna `Bytes` em `people` faria cada uma dessas telas arrastar todas as
fotos do banco. Assim, o `include` pega só o `updatedAt`, e os bytes só saem pela rota da foto.

A pessoa carrega então um `photoUpdatedAt` — não um booleano. Ele responde duas coisas de uma vez:
se existe foto, e qual versão é. A URL de uma foto não muda quando a foto muda, então esse carimbo
vai na query (`?v=…`) e é o que faz o navegador buscar a nova em vez de mostrar a antiga.

**Decisão 2 — quem reduz a imagem é o navegador.** A foto que sai de um celular tem alguns megabytes
e vira um avatar de 40 pixels. Reduzir no servidor exigiria uma dependência nativa de processamento
de imagem (`sharp` e parentes) para resolver um problema que o `<canvas>` já resolve do outro lado —
e ainda subiria o arquivo inteiro pela rede. O web encolhe para 512px no maior lado, achata em JPEG
e manda. Na prática: um PNG de 1,8 MB e 1600×1200 chegou ao banco com **5,5 KB**.

**Decisão 3 — o upload vai em base64 dentro do JSON.** O caminho usual seria `multipart/form-data`.
Custaria um segundo jeito de ler corpo de requisição na API, com validação fora do `class-validator`
que todo o resto usa. Como a imagem já chega pequena, ela cabe num campo de JSON como qualquer outro
DTO — ao preço de um terço a mais de bytes **na subida** (o download é binário puro). O limite do
corpo JSON subiu para 3 MB no `main.ts` por causa disso.

**Consequências.** O `Content-Type` que a API devolve é o que o cliente declarou no upload, então a
declaração é conferida contra a assinatura do arquivo (`photo.util.ts`): não se guarda um arquivo
dizendo ser outra coisa. SVG fica fora da lista de propósito — é documento com script, não imagem.

A foto é recurso próprio, como as uniões (ADR-008): na edição ela sobe na hora, fora do submit. No
cadastro não existe id para pendurá-la, então ela espera em memória e sobe logo depois do POST — é a
única costura entre os dois.

Preço assumido: o `pg_dump` engorda junto com o álbum, e os bytes passam pelo Node em vez de por um
servidor de arquivos. Para uma base pessoal de centenas de pessoas isso é irrelevante; se um dia
virar milhares, o caminho é mover a tabela para armazenamento de objetos — e aí o backup precisa de
uma resposta nova, que é a mesma conversa do BL-06.
