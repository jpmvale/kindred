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
calcular: o grau de uma pessoa depende do grafo inteiro, então não há como escapar disso sem parar de
calcular. **Quantas vezes** esse grafo é percorrido, porém, importa muito — ver ADR-012.

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

---

## ADR-012 — Uma travessia do grafo, não uma por pessoa

**Contexto.** O BL-09 nasceu no backlog culpando a consulta: "a API carrega todas as pessoas e filtra
em memória". Medindo com **5023 pessoas**, a culpa estava no lugar errado:

| O que | Antes |
| --- | --- |
| `computeKinship` para todos | **2280 ms** |
| `findMany` com todos os includes | 167 ms (7,52 MB) |

A consulta era 7% do custo. O `computeKinship` chamava `buildGraph(allPeople)` **a cada pessoa** —
5023 reconstruções do grafo inteiro — e depois fazia uma busca em largura por pessoa, quando **uma
única busca a partir da pessoa central já visita todo mundo**. Havia ainda um segundo custo
quadrático escondido: a fila da busca andava com `queue.shift()`, que é O(n) em array de JavaScript.

**Decisão.** `createKinshipResolver(centralId, people, unions)` prepara uma vez o que não depende do
alvo — o grafo, a travessia a partir do centro e a de cada cônjuge vigente dele — e devolve uma
função que responde o grau de qualquer pessoa por consulta a mapa. O `computeKinship` de uma pessoa
só continua existindo, como atalho por cima do resolver, para `findOne` e para os testes.

**Consequências.** 2280 ms viraram **1 ms** (1708×) sobre a mesma base, com resposta idêntica nas
5023 pessoas — há teste que compara o resolver com o cálculo pessoa a pessoa para todo mundo, e outro
que garante que responder não volta a ler o grafo. O `GET /api/people` de 5023 pessoas passou a
responder em ~190 ms.

Nada de comportamento mudou: buscar por "primo" e ordenar por idade seguem funcionando, porque o grau
continua sendo calculado para a base inteira — o que mudou é quantas vezes o grafo é percorrido.

**O que este ADR não resolve.** Os ~170 ms que sobram são o `findMany` com os includes, que ainda traz
todas as pessoas com pai, mãe, local, uniões e foto. O caminho conhecido é varrer uma consulta enxuta
e buscar os includes só das linhas da página (medido: 21 ms + 2 ms), mas isso ficou como item próprio
do backlog — a decisão desta rodada foi atacar só o custo quadrático, que era 93% do problema.

---

## ADR-013 — Backup em JSON pelo Prisma, e o fixture público é anônimo

**Contexto.** A base de desenvolvimento deixou de ser descartável: passou a ter a família de quem usa
o kindred, com fotos e notas. Isso levanta dois problemas de uma vez, e eles pedem respostas
diferentes. O primeiro é **perder o dado** — o banco mora num volume do Docker, e volume some
(`docker compose down -v`, uma limpeza de disco, uma máquina nova). O segundo é **expor o dado** — o
repositório é público, então nada de família pode entrar nele.

A saída óbvia — "salvar minha base no seed" — falha nos dois papéis. O seed é fixture: vive no repo
(público) e é reescrito quando o schema muda, então não serve de backup. E dado real não serve de
fixture, porque expõe pessoas e envelhece.

**Decisão.** Separar as duas coisas, com três comandos:

| Comando | O que faz | Onde grava |
| --- | --- | --- |
| `pnpm db:backup` | copia a base inteira | **fora do repositório** (`../kindred-backups`, ou `KINDRED_BACKUP_DIR`) |
| `pnpm db:restore <arquivo>` | devolve a base | no banco apontado por `DATABASE_URL` |
| `pnpm db:anonymize` | copia a **forma** da base | `packages/db/fixtures/anonimizado.json`, versionado |

O backup é **JSON pelo Prisma**, não `pg_dump`. O `pg_dump` mora no container do Postgres, então
depende do Docker estar de pé — e é justamente o Docker que se quer sobreviver. O JSON também é
legível, restaura em qualquer Postgres com as migrations aplicadas, e é o formato que o BL-06
(exportar/importar pela aplicação) vai reaproveitar. O arquivo guarda os **ids originais**: restaurar
devolve o mesmo grafo de pai/mãe, não uma cópia parecida.

O fixture anônimo sai no **mesmo formato do backup**, então carregá-lo é o `db:restore` — não há um
segundo caminho de importação para manter. Ele preserva o que dá valor a um fixture (o grafo de
pai/mãe, as uniões, sexo, quem faleceu, quem é a pessoa central) e descarta o que identifica: nomes
viram fictícios, notas e fotos saem, cidades viram fictícias, datas andam de 1 a 10 dias — nunca
zero, senão uma data em cada vinte passaria intacta ao lado de um nome falso.

**Consequências.** O `db:backup` **se recusa a gravar um arquivo incompleto**: ele lê o
`Prisma.dmmf` e cobra que todo campo escalar de cada modelo esteja no arquivo, então um campo novo no
schema que ninguém lembrou de exportar derruba o backup na hora, em vez de sumir em silêncio e só
aparecer na restauração — quando o original já não existe. É a única parte do pacote `@kindred/db`
com teste próprio, e é por isso.

Duas travas contra o acidente: o `db:restore --force` **faz um backup antes** de apagar o que está
lá, e o `.gitignore` barra `kindred-*.json` na raiz, para um backup escrito por engano dentro do repo
não virar commit num repositório público.

**O que este ADR não resolve.** Rodar o backup continua sendo um ato manual — não há agendamento. E
o fixture anônimo preserva a topologia da família, que para quem já conhece a família não é
informação nova, mas também não é anonimato absoluto: ele protege contra quem lê o repositório, não
contra quem já sabe.

---

## ADR-014 — A listagem varre a base enxuta e busca os detalhes só da página

**Contexto.** Depois do ADR-012 o parentesco deixou de ser quadrático, mas o `GET /api/people`
continuava carregando **todas** as pessoas com pai, mãe, local, uniões e foto — para devolver dez.
Medido numa base de 5000 pessoas, qualquer página custava ~202 ms, e a resposta da lista inteira,
7,5 MB. O custo não dependia da página pedida: a de número 250 custava o mesmo que a primeira.

Levar o filtro para o SQL resolveria de vez, mas cobra caro e muda comportamento: a busca casa o
**grau de parentesco**, que é calculado e não existe como coluna (ADR-007), e a acento-insensibilidade
da RN-016 exigiria `unaccent` no Postgres. Some as duas coisas e a busca deixa de achar "primo".

**Decisão.** Separar o que a varredura precisa do que a página mostra:

1. uma consulta **enxuta** (`LEAN_SELECT`) traz a base inteira com só o necessário para calcular
   parentesco, buscar e ordenar — sem nenhum join;
2. o filtro, a ordenação e o corte da página acontecem sobre essas linhas estreitas;
3. uma segunda consulta busca `include` completo **só dos ids da página**, e o resultado é remontado
   na ordem que a ordenação decidiu.

A chamada **sem paginação** continua como era: quem a faz é a árvore ou o calendário, e os dois
querem a base inteira com uniões e foto. Não há o que enxugar ali sem mudar o contrato.

**Consequências.** Na mesma base de 5000 pessoas, medido antes e depois com resposta conferida
**byte a byte idêntica**:

| requisição | antes | depois |
| --- | --- | --- |
| página 1 | 202 ms | 39 ms |
| página 250 | 202 ms | 36 ms |
| busca por nome | 206 ms | 31 ms |
| ordenar por idade | 201 ms | 35 ms |
| lista inteira (árvore) | 250 ms | 252 ms — de propósito |

O que sobra é a varredura em si, que é o piso desta arquitetura: enquanto o grau de parentesco for
calculado e a busca casar por ele, alguma leitura da base inteira tem de acontecer a cada consulta.

**A armadilha que isto introduz:** `where: { id: { in: [...] } }` **não promete ordem**. A ordenação
foi decidida sobre as linhas enxutas, então a segunda consulta tem de ser remontada contra ela —
esquecer isso devolve a página embaralhada sem erro nenhum. Há teste que entrega as linhas na ordem
inversa de propósito. Se alguém for apagado entre as duas consultas, a linha some da página em vez de
virar um buraco, e o `total` continua sendo o que a varredura contou.

---

## ADR-015 — Tema por token de cor, resolvido antes da pintura

**Contexto.** O app nasceu com as cores escritas onde eram usadas: 80 hex no `index.css` e mais 86
espalhados por `style={{}}` nos componentes. Um tema escuro em cima disso significaria duplicar cada
decisão de cor em dois lugares — e a segunda cópia começa a envelhecer no dia seguinte.

A referência é o projeto irmão **coda**, que já resolve isto. A **mecânica** dele foi adotada inteira;
a **paleta** não: o kindred continua cinza claro com sotaque índigo no tema claro, e o escuro nasce
dessa mesma família de cores. Foi decidido com o usuário.

**Decisão.**

1. Toda cor vira **custom property** em `:root` (`apps/web/src/index.css`), com nome semântico
   (`--surface`, `--muted`, `--danger-soft`) e não de matiz. O tema escuro é um segundo bloco,
   `:root[data-theme='dark']`, que redefine os mesmos nomes — nenhuma regra é escrita duas vezes.
2. A preferência é **claro / escuro / sistema**, guardada no `localStorage`. O valor **aplicado** é
   sempre `light` ou `dark`: "sistema" é resolvido em JS (`apps/web/src/theme.ts`) pelo
   `prefers-color-scheme` e escrito em `data-theme` no `<html>`. **O CSS não tem media query de
   paleta** — se tivesse, "escolhi claro num SO escuro" precisaria vencer a media query, e a briga de
   especificidade voltaria a cada regra nova.
3. Um **script inline no `index.html`** aplica o tema antes da pintura. É a única cópia da chave e da
   regra fora do `theme.ts`, e existe porque sem ela a tela pisca clara até o bundle carregar.
4. `color-scheme` acompanha o tema, então o que é desenhado pelo navegador — seletor de data,
   checkbox, barra de rolagem — vem escuro sem uma linha de CSS.

**Consequências.**

- O que é do reactflow precisou de dois caminhos diferentes, e a diferença tem motivo: as arestas
  recebem `style` **inline**, e estilo inline resolve `var(...)` normalmente, então `EDGE_COLORS`
  (`tree-layout.ts`) virou `var(--tree-edge-*)` sem o layout saber que tema existe. Já o pontilhado
  do fundo é o `color` do `<Background/>`, que o reactflow põe como **atributo de apresentação** no
  SVG — e atributo não entende `var(...)`. Esse ficou no CSS
  (`.react-flow__background-pattern { fill: ... }`), que vence o atributo.
- Os campos de formulário passaram a ser estilizados **no app inteiro**, não só dentro de
  `.form-group`: os controles de união vivem soltos num `fieldset` e ficavam com a aparência crua do
  navegador ao lado dos outros. O `<textarea>` das notas nunca teve estilo nenhum — a regra antiga
  cobria só `input` e `select`.
- A seta do `<select>` é desenhada por nós (`appearance: none` + `--select-arrow`): a nativa não muda
  de cor com o tema.
- **O `.card` ganhou borda.** No claro é quase invisível; no escuro é o que separa o cartão do fundo,
  porque sombra sobre fundo escuro não separa nada. É a única mudança visível no tema claro.

**A armadilha:** cor nova escrita direto no componente funciona — e só quebra no outro tema, que
ninguém abre no mesmo minuto. Não há lint que pegue isso; o que pega é
`grep -rE '#[0-9a-fA-F]{6}' apps/web/src --include='*.tsx'` não devolver nada. A única exceção legítima
hoje é o `photo.ts`, que pinta de branco o fundo do JPEG ao achatar um PNG transparente — isso é
conteúdo gravado no banco, não cor de tela, e não deve seguir tema nenhum.

---

## ADR-016 — Exportar/importar reusa o backup, e a restauração é sempre transação

**Contexto.** O BL-06 pedia exportar/importar pela aplicação. A tentação era construir um segundo
formato — um "export" da API, separado do "backup" do CLI — mas isso duplicaria a lógica de coletar
cada modelo e abriria espaço para as duas formas divergirem sem ninguém perceber.

**Decisão.** `GET /api/backup` e `POST /api/backup/restore` **são** o `db:backup`/`db:restore`, só
que sem passar por disco: `buildBackupPayload` monta o mesmo objeto que o CLI escreve em arquivo, e
`buildRestoreOperations` monta a mesma lista de operações que o CLI executa — ambos exportados de
`@kindred/db` (ADR-013) e reusados dos dois lados. Baixar pelo navegador e rodar `pnpm db:backup`
produzem o mesmo arquivo; um serve para restaurar o outro.

A diferença que a API precisava e o CLI não: **restaurar é sempre uma transação** (RN-021). O CLI
original apagava e recriava com `await` sequencial, sem transação — aceitável quando quem aperta
`--force` é a mesma pessoa que escreveu o arquivo, minutos antes. Pela web, o arquivo pode ter vindo
de qualquer lugar, então uma união apontando para um id que não existe (por exemplo) não pode deixar
o banco pela metade. A saída foi trocar o laço de `await` por um **array de `PrismaPromise`**
(`buildRestoreOperations`) que vai inteiro para `$transaction([...])` — a mesma forma batch que
`setCentral` já usa em `people.service.ts`, sem precisar do tipo `Prisma.TransactionClient` nem de
callback interativo, porque nenhuma operação depende do resultado de outra: os ids já vêm prontos do
arquivo.

**Verificado rodando:** um arquivo com uma união referenciando gente inexistente, mandado com
`force=true` contra uma base com 141 pessoas, devolve 500 — e a base **continua com as 141 pessoas
originais**, não vazia nem pela metade. É o teste que a versão sequencial do CLI não tinha como
passar.

**Consequências.** `parseBackupFile` (a mesma validação do CLI) é quem decide se o corpo da
requisição é um backup de verdade; o controller não usa DTO validado (`@Body() body: Record<string,
unknown>`), porque o `ValidationPipe` global (`whitelist: true`) pularia a validação de qualquer jeito
— o TypeScript apaga `Record<string, unknown>` para `Object` em tempo de execução, e é isso que o
`ValidationPipe` exclui de propósito. O limite do corpo JSON subiu de 3 MB (o suficiente só para uma
foto) para 10 MB, porque agora o corpo pode ser a base inteira; o app não tem autenticação, então
esse número não é uma linha de defesa, só uma folga para uma base pessoal razoável.

**O que só existe do lado do produto, não do CLI:** o `/backup` precisa ser alcançável **mesmo sem
pessoa central** — é a tela que resolve exatamente o cenário de "perdi minha base". O
`layoutLoader` (ADR-010), que desvia todo mundo para `/setup` quando não há central, ganhou uma
exceção de uma linha para esse caminho; sem ela, restaurar um backup ficaria atrás do próprio muro
que existe para forçar o cadastro do zero.

---

## ADR-017 — A lista sem paginação também enxugou, sem virar rota nova

**Contexto.** O ADR-014 tinha deixado uma isenção explícita: "a chamada sem paginação continua como
era... não há o que enxugar ali sem mudar o contrato". Era verdade na hora — mas ninguém tinha
conferido, consumidor por consumidor, o que a árvore, o calendário e os candidatos de um formulário
liam de fato da resposta. Feita essa conferência (BL-14), a resposta virou "há sim, e não muda nada
que alguém use": os três leem `fatherId`/`motherId` (escalares) e resolvem pai, mãe e irmãos na
própria lista que já têm — nenhum lê os objetos aninhados `father`, `mother` ou `location` que o
`include` do Prisma vinha trazendo para cada uma das ~150 pessoas. O mesmo vale para união: os três
leem `partnerId` para achar o cônjuge na lista; só quem edita **uma** pessoa específica
(`PersonFormPage`, via `GET /people/:id`) precisa do nome do parceiro, para mostrar na tela de uniões.

**Decisão.** A chamada sem paginação trocou `include: INCLUDE` (pai, mãe, local e o parceiro de cada
união, todos por extenso) por um `select` mais magro (`LIST_SELECT`): os mesmos campos escalares da
varredura enxuta do ADR-014, mais notas, foto e uniões — mas as uniões vêm com `select` também, só
`partnerBId`/`partnerAId`, sem o objeto do parceiro. Uma segunda função de normalização,
`withUnionRefs`, faz a mesma troca de lado do par que `withUnions` (RN-011), sem montar `partner`.

**Por que não uma rota nova.** Cortar campo por campo dentro do mesmo `GET /api/people` — em vez de,
por exemplo, um `GET /api/people/tree` dedicado — mantém um único lugar onde "o que a árvore precisa"
é decidido, e os três consumidores (árvore, calendário, candidatos) continuam chamando o mesmo
`peopleApi.getAll()`; nenhum loader mudou. O preço é o inverso do ADR-014: ali a rota **paginada**
ganhou uma segunda consulta para não perder o que a tela mostra; aqui a rota **sem paginação**
perdeu campo sem ninguém pedir de volta, porque a conferência mostrou que ninguém os lia.

**O contrato mudou, e por isso o tipo mudou com ele.** `PersonUnion.partner` virou opcional
(`partner?: Person`) em vez de obrigatório — mentir que ele sempre vem seria pior que marcar a
ausência. O único lugar que lê `union.partner.name` é o `PersonFormPage`, e ele só recebe uniões de
`GET /people/:id` (nunca da lista sem paginação), então um cast local e comentado resolve — não um
`!` solto, que apagaria o aviso do compilador se algum dia esse componente passasse a ler uniões de
outro lugar.

**Verificado rodando**, contra a base real (143 pessoas, sem nenhuma união): a resposta sem paginação
caiu de 56,7 KB carregando pai/mãe/local vazios de cada pessoa para o mesmo tanto sem eles — o ganho
cresce com o quanto cada pessoa tem preenchido, não com a contagem de linhas. Criada uma união
temporária entre duas pessoas de teste para conferir os dois formatos lado a lado: a lista sem
paginação devolveu `{id, status, startDate, endDate, partnerId}`; o `GET /people/:id` da mesma pessoa
devolveu o parceiro por extenso, como antes. Árvore, calendário e o card de detalhe (que lê
`fatherId`/`motherId` da lista inteira, não de quem está desenhado) seguiram funcionando sem
mudança nenhuma de código — a prova de que o corte não tirou nada que alguém usasse.

---

## ADR-018 — Multiusuário: conta isola árvore inteira, sessão por cookie httpOnly

**Contexto.** O BL-10 mudava o produto de "base pessoal" para "serviço" — a pergunta que o handoff
anterior tinha deixado em aberto para alinhar antes de escrever qualquer linha era: cada conta tem a
própria árvore, isolada, ou é uma família convidando parentes para a mesma base compartilhada? A
resposta muda o schema inteiro, não só a tela de login. Decisão: **isolada**. Convite para editar a
mesma árvore fica para outra hora — o kindred continua sendo "a base de uma pessoa", só que agora com
senha, e várias pessoas podem ter a própria.

**Decisão — dono de linha.** `Person` e `Location` ganharam `userId` obrigatório, com
`onDelete: Cascade` a partir de `User`: apagar a conta apaga a árvore inteira, sem órfão. `Union` não
tem `userId` próprio — as duas pontas (`partnerA`/`partnerB`) já são `Person` da mesma conta (garantido
na escrita, nunca na leitura), então toda consulta de união filtra por `partnerA: { userId }`.

**Decisão — sessão por cookie, não JWT.** Um token opaco (32 bytes aleatórios, base64url) vai num
cookie `httpOnly` + `sameSite: lax`; o banco guarda só o **hash SHA-256** do token, nunca o valor cru
— um dump ou backup do banco não dá sessão de graça a quem o ler, só quem tiver o cookie original
consegue logar como alguém. Sem renovação deslizante: 30 dias fixos a partir do login. `secure` só em
produção (`NODE_ENV`), porque em dev a API fala com o web por HTTP simples atrás do proxy do Vite —
`Secure` bloquearia o cookie de sair daí.

**Decisão — guard global, `@Public()` é a exceção.** `SessionGuard` está registrado como `APP_GUARD`:
um controller novo nasce **protegido por padrão**. As exceções (`/auth/register`, `/auth/login`,
`/auth/logout`, `/health`) usam `@Public()` explicitamente — inverter isso (todo controller decorado
na mão com `@UseGuards`) é o desenho onde esquecer de proteger uma rota nova é o caminho fácil, e este
ADR escolhe o oposto: esquecer o `@Public()` deixa a rota **protegida demais**, nunca aberta demais.

**Decisão — 404, nunca 403, para dado de outra conta.** Toda busca por id (`findOne`, `setCentral`,
`findPhoto`, uma união) filtra por `{ id, userId }` na mesma consulta, e devolve `NotFoundException`
tanto para "não existe" quanto para "existe, mas é de outra conta" — a mesma resposta não denuncia
qual dos dois é. `fatherId`/`motherId`/`locationId`/`partnerId` recebidos num corpo de requisição
passam por `assertPersonIdsOwnedBy`/`assertLocationOwnedBy` antes de qualquer escrita: sem isso, o
Postgres aceitaria de bom grado o UUID de alguém de outra conta como pai, e o `include` da resposta
devolveria essa pessoa inteira.

**A migração dos dados existentes foi em três passos, nesta ordem — e a ordem é a decisão:**

1. `20260728203000_usuarios_e_donos` — cria `users`/`sessions` e `userId` **nullable** em
   `people`/`locations`. Nullable de propósito: aplicar isto não pode falhar por causa de linhas que
   já existem.
2. `pnpm db:backfill-owner` (script, não migration) — cria (ou reaproveita) uma conta "dono
   original" e atribui a ela toda `Person`/`Location` órfã. Idempotente: numa base já migrada, não
   faz nada. As credenciais vêm de env (`LEGACY_OWNER_EMAIL`/`LEGACY_OWNER_PASSWORD`), com um e-mail
   default de dev e senha **gerada aleatoriamente e impressa uma vez só** quando nenhuma das duas é
   passada — pensado para rodar interativamente, onde alguém copia a senha na hora.
3. `20260728204500_dono_obrigatorio` — só agora `userId` vira `NOT NULL`. Se o passo 2 não tiver
   rodado (ou tiver deixado alguma linha órfã), o próprio Postgres recusa a migration — é a rede de
   segurança que faz "esqueceu o backfill" virar erro na hora, não corrupção silenciosa.

**Consequência que mordeu nesta sessão, e é o motivo de este ADR existir por escrito agora.** O
backfill rodou de forma não-interativa contra o banco de desenvolvimento — a senha gerada foi
impressa no terminal de um processo que encerrou antes de a sessão ser fechada com cuidado, e por
pouco ficou irrecuperável (só foi achada de volta vasculhando o transcript bruto da conversa). A
lição: **um passo que só imprime o segredo uma vez precisa de um operador olhando na hora**, ou de
`LEGACY_OWNER_PASSWORD` setado com um valor escolhido de propósito — nunca rodar no escuro. Ainda não
existe tela de trocar e-mail ou senha; é o próximo buraco a fechar, principalmente para quem herdou
uma conta "dono original" e não escolheu nem uma coisa nem outra.

**O que este ADR não resolve.** Convite/compartilhamento de árvore entre contas (a alternativa que
foi descartada na decisão de isolamento) continua fora — se algum dia fizer sentido, é modelo de
permissão novo, não um `userId` a mais. Recuperação de senha (esqueci minha senha) também não existe;
hoje, perder a senha é perder o acesso, sem caminho de volta pela própria aplicação.
