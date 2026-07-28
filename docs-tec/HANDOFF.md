# HANDOFF — estado atual

_Atualizado em 28/07/2026._

## Onde o projeto está

O MVP funciona de ponta a ponta: cadastro de pessoas e locais, cálculo de parentesco, lista com
busca/ordenação/paginação, árvore genealógica, calendário de aniversários.

**Marco de retomada — 28/07/2026, fim da janela.** Working tree limpo, nada pela metade. Conferido:
`pnpm typecheck`, `pnpm lint` (sem um aviso sequer) e `pnpm test` — **158 testes**, 46 na API, 107 no
web e 5 no `@kindred/db`. Os 6 e2e rodam à parte e precisam de banco. Para retomar, basta subir o
Postgres (`docker compose up -d postgres`) e escolher um item da seção **Próximo passo sugerido**, no
fim deste arquivo.

> ⚠️ **O banco de dev tem dados reais.** Deixou de ser o seed de 23 pessoas fictícias: são ~140
> pessoas da família de quem usa o kindred, com fotos e notas. Antes de qualquer coisa destrutiva
> (`db:seed --force`, `db:reset`, `docker compose down -v`), rode **`pnpm db:backup`**. Precisa de
> dados de teste? Use um banco descartável (`createdb` + `DATABASE_URL=...`) ou o fixture anônimo —
> ver a sessão de backup abaixo.

## Onde a última sessão parou

Fecharam o **BL-09** (a listagem parou de arrastar a base inteira, ADR-014) e entrou o **backup**
com o fixture anônimo (ADR-013) — que foi o que tirou do caminho o risco de perder a base real.
Antes disso, na mesma data, tinham fechado BL-05 (notas) e BL-07 (falecimento no calendário).

`pnpm typecheck`, `pnpm lint` e `pnpm test` verdes (**158 testes**: 46 na API, 107 no web e 5 no
`@kindred/db`), mais os 6 e2e que rodam à parte, com banco.

### Coisas do ambiente que custaram tempo

- **A porta 3000 vive ocupada por outro projeto** nesta máquina (já foi o `coda`, já foi o
  `expense-analyzer`), e a 5173 também. A API do kindred foi rodada com
  `PORT=3005 pnpm --filter @kindred/api dev`, e o web com
  `API_URL=http://localhost:3005 pnpm --filter @kindred/web dev` para o proxy do Vite achá-la (o
  `--port` do Vite resolve o outro lado). Se o `docker compose up` reclamar de porta, é isso.
- **Encerrar os servidores por caminho do projeto, nunca por processo.** Um `pkill -f vite` numa
  destas sessões derrubou junto o dev server do projeto irmão que estava na 5173. O certo é
  `pkill -f "kindred/apps/web"` e `pkill -f "kindred/apps/api"`.
- O `pnpm` tem de ser chamado **direto**, nunca por `corepack` — já está no `CLAUDE.md`, mas foi o
  primeiro tropeço da sessão.

## Sessão de 28/07 — a listagem parou de arrastar a base inteira (BL-09, fechado)

A metade que faltava do BL-09. O `GET /api/people` carregava **todas** as pessoas com pai, mãe,
local, uniões e foto para devolver dez — e a página 250 custava o mesmo que a primeira, porque o
custo não dependia da página.

Agora são duas consultas (ADR-014): uma **enxuta** varre a base com só o que o parentesco, a busca e
a ordenação precisam (sem nenhum join), e a segunda busca os `include` **só dos ids da página**.

| requisição | antes | depois |
| --- | --- | --- |
| página 1 | 202 ms | **39 ms** |
| página 250 | 202 ms | **36 ms** |
| busca por nome | 206 ms | **31 ms** |
| ordenar por idade | 201 ms | **35 ms** |
| lista inteira (árvore) | 250 ms | 252 ms — de propósito |

Medido numa base de bench de **5000 pessoas**, criada e derrubada na hora — a base real não foi
tocada. As cinco respostas foram capturadas antes e depois e conferidas **byte a byte**: idênticas.

**A armadilha que a mudança introduz**, e que tem teste: `where: { id: { in } }` não promete ordem. A
ordenação é decidida sobre as linhas enxutas, então a segunda consulta precisa ser remontada contra
ela — esquecer devolve a página embaralhada, sem erro nenhum. O teste entrega as linhas na ordem
inversa de propósito. É o primeiro teste do `people.service` (6 casos, com um Prisma dublê).

O que sobrou — a árvore e o calendário ainda recebem 7,5 MB — virou **BL-14**: mexe no contrato da
API, então não cabia emendar aqui.

## Sessão de 28/07 — backup, restauração e fixture anônimo (ADR-013)

O pedido chegou como "salve meus dados atuais no seed, mas não quero minha família num repo público".
São **dois problemas com respostas diferentes**, e juntá-los num só lugar falha nos dois: o seed vive
no repositório (público) e é reescrito quando o schema muda, então não serve de backup; e dado real
não serve de fixture, porque expõe pessoas e envelhece. O medo declarado era concreto: **perder o
volume do Docker** e ir junto o progresso da árvore.

| Comando | O que faz | Onde grava |
| --- | --- | --- |
| `pnpm db:backup` | copia a base inteira | `../kindred-backups` (fora do repo; `KINDRED_BACKUP_DIR` muda) |
| `pnpm db:restore <arquivo>` | devolve a base | no banco do `DATABASE_URL` |
| `pnpm db:anonymize` | copia só a **forma** | `packages/db/fixtures/anonimizado.json`, versionado |

Backup é **JSON pelo Prisma**, não `pg_dump` — o `pg_dump` mora no container, e é o container que se
quer sobreviver. Guarda os ids originais, então restaurar devolve o mesmo grafo, não algo parecido.

**Três travas, e cada uma existe por um motivo:**

1. O backup **se recusa a gravar incompleto**: lê o `Prisma.dmmf` e cobra todo campo escalar de cada
   modelo. Campo novo no schema que ninguém exportou derruba o backup na hora — em vez de sumir em
   silêncio e aparecer só na restauração, quando o original já não existe. É o único teste do
   `@kindred/db` (5 casos).
2. `db:restore --force` **faz backup antes** de apagar.
3. O `.gitignore` barra `kindred-*.json` na raiz, com exceção de `packages/db/fixtures/` — testado
   com um arquivo real solto no repo.

**O que ficou provado rodando, não presumido:** backup da base real → restore num banco descartável →
backup de novo → **JSON byte a byte idêntico**, incluindo ids, carimbos, filiação e os bytes das
fotos. A base real não foi tocada em momento nenhum.

O fixture anônimo saiu **no mesmo formato do backup**, então carregar é o `db:restore` — não há um
segundo caminho de importação para manter. Auditoria do arquivo contra a base real: nenhum nome,
nenhuma nota, nenhuma foto, nenhuma cidade e nenhum id em comum, e nenhuma data de nascimento
intacta; a estrutura bate em tudo (141 pessoas, 71 com pai, 79 com mãe, 42 falecidas, 1 central).

**Dois defeitos meus, achados na conferência:** o jitter das datas ia de −10 a +10 e portanto era
**zero** para uma pessoa em cada 21 — data de nascimento exata passaria intacta ao lado de um nome
falso; agora o deslocamento nunca é zero. E o `db:restore` com caminho **relativo** não achava o
arquivo, porque o `pnpm --filter` executa em `packages/db`; passou a resolver contra o `INIT_CWD`, que
é de onde o comando foi chamado — o tipo de detalhe que só apareceria na hora de recuperar algo.

## Sessão de 28/07 — o parentesco deixou de ser quadrático (BL-09, parcial)

O BL-09 estava escrito culpando a consulta. **Medindo antes de mexer, a culpa estava no lugar
errado** — com 5023 pessoas, o `computeKinship` para a lista toda levava **2280 ms** e o `findMany`
com todos os includes, 167 ms. A consulta era 7% do custo.

O motivo: `computeKinship` chamava `buildGraph(allPeople)` **a cada pessoa** e fazia uma busca em
largura por pessoa, quando uma única busca a partir da pessoa central já visita todo mundo. Havia um
segundo custo quadrático escondido — a fila da busca andava com `queue.shift()`, O(n) em array.

Entrou o `createKinshipResolver` (ADR-012): prepara o grafo e as travessias uma vez, devolve uma
função que responde por consulta a mapa. **2280 ms viraram 1 ms** (1708×), com resposta idêntica nas
5023 pessoas. O `GET /api/people` dessa base responde em ~190 ms.

**Isto foi decidido com o usuário: só o custo quadrático nesta rodada.** A consulta pesada (os ~170 ms
que sobram) continua no backlog, com o caminho já medido — consulta enxuta 21 ms + página com
includes 2 ms.

Dois testes guardam a otimização: um compara o resolver com o cálculo pessoa a pessoa para **todas**
as pessoas do cenário, e outro conta as leituras do grafo para garantir que responder não volta a
percorrê-lo. Cronômetro em teste seria instável; contar leitura, não.

## Sessão de 28/07 — falecimento no calendário (BL-07)

O calendário só olhava nascimento, e filtrava quem morreu **inteiramente** — nem a data de nascimento
deles aparecia. Agora são **três** datas distintas (RN-020): aniversário de vivo (🎂 índigo),
aniversário de quem já se foi (🎂 lilás dessaturado) e falecimento (🕯️ cinza quente). Uma legenda
embaixo da grade diz qual é qual.

Três decisões foram tomadas com o usuário antes de escrever:

| Decisão | Escolha |
| --- | --- |
| o que mostrar de quem faleceu | **as duas datas** — o "hoje ele faria X anos" é o tipo de lembrança que justifica o produto |
| o rodapé | **duas listas** — próximos aniversários e próximas datas de falecimento, porque respondem a perguntas diferentes |
| filtro | **sim, ligado por padrão** — desligar devolve o calendário ao que ele era |

A conta saiu da página para [`calendar-entries.ts`](../apps/web/src/pages/calendar-entries.ts) —
módulo puro, mesmo caminho que o `tree-layout.ts` seguiu no BL-12 — e ganhou **18 casos** sem precisar
de jsdom. A página ficou só com o desenho.

**O que morde aqui:** quem tem `deceased: true` mas nenhuma data de falecimento (RN-006) entra só
pelo nascimento; e quem tem data de morte mas não de nascimento entra só pelo falecimento. As duas
pontas têm teste, porque é o tipo de caso que um `if` mal escrito engole em silêncio.

**Um teste antigo mudou de lado, de propósito:** `quem morreu sai do calendário e da lista` descrevia
exatamente o comportamento que o BL-07 veio derrubar, e foi substituído. Outro precisou passar a
procurar **dentro da grade** — o `title` agora existe também nas células do rodapé, e a busca na
página inteira achava as duas.

## Sessão de 28/07 — notas por pessoa (BL-05)

Cada pessoa ganhou um campo de **texto livre** — de onde veio a amizade, histórias — cobrindo o
`friendshipOrigin` que a spec original pedia e nunca chegou ao schema.

Três decisões foram tomadas com o usuário antes de escrever código, e são o que explica a forma:

| Decisão | Escolha | Por quê |
| --- | --- | --- |
| campo ou entidade | **campo `notes` em `people`** | uma nota por pessoa basta para uma base pessoal; notas datadas virariam um diário e mudariam a tela |
| busca casa a nota? | **não** | resultado que casa por um trecho de texto longo não se explica sozinho; a RN-016 segue com nome, grau e rótulo social |
| viaja na listagem? | **sim, com teto de 2000** | é o teto que torna isso seguro — sem ele, cai no problema que tirou a foto de lá (ADR-011) |

| Camada | O que entrou |
| --- | --- |
| `packages/db` | `notes String?` em `Person`; migration `20260728120000_notas_por_pessoa` (aditiva, sem backfill); três notas no seed |
| `packages/types` | `notes` na `Person` e na `PersonFormData` |
| `apps/api` | `NOTES_MAX_LENGTH` + `@MaxLength` no `CreatePersonDto`; `notes` no `create` e no `update` |
| `apps/web` | `<textarea>` com contador de caracteres no `PersonFormPage`, e três casos de teste |

**O teto de 2000 mora em dois lugares de propósito**, e não no `@kindred/types`: aquele pacote é só
tipos, sem valor em runtime (ADR-005). A API valida; o web tem a própria cópia só para avisar antes.
Mexeu num, mexa no outro.

**Detalhe que se repete do resto do formulário:** campo em branco vira `null`, não `""` (RN-009) — o
`Transform` do DTO e o `trim()` do submit fazem isso dos dois lados, então "apagar a nota" e "não
mandar nota" acabam no mesmo lugar.

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

## Sessão de 27/07 — dados por loader de rota (BL-11)

O front deixou de buscar dados em `useEffect`. O router virou *data router*
(`createBrowserRouter`), cada rota ganhou um loader em [`loaders.ts`](../apps/web/src/loaders.ts), e
a página só lê o resultado com `useLoaderData`. Depois de uma escrita, quem recarrega é
`useRevalidator()`. O porquê e os três desdobramentos estão no **ADR-010**.

| Arquivo | O que mudou |
| --- | --- |
| `main.tsx`, `routes.tsx` | `RouterProvider` + `createBrowserRouter`; o `/setup` fora do layout |
| `App.tsx` | virou só a moldura (`AppLayout` com `<Outlet/>`); o desvio para o `/setup` é o loader do layout |
| `PeopleListPage` | busca, ordenação e página passaram a morar na **URL**; `people-list-query.ts` lê e valida |
| `PersonFormPage` | só o formulário continua em estado local; as uniões vêm do loader |
| `TreePage` | o desenho virou `useMemo` (o `computeLayout` é puro), e "árvore vazia" virou coisa derivada |
| `CalendarPage` | o mês navegado deixou de ser um `Date` em estado e virou par de números |
| `eslint.config.js` | as duas regras rebaixadas a aviso **saíram**: o padrão do plugin é erro, e não há exceção no código |

Também saiu `@types/react-router-dom` (v5), que sobrava desde o começo — o v7 traz os próprios tipos.

**O defeito que apareceu no caminho:** o campo de busca corre à frente da URL até o debounce
alcançar, e precisa se realinhar quando a URL muda por fora. Comparar o campo com a URL não basta —
a resposta do próprio debounce conta como mudança e apaga o que foi digitado enquanto a busca ia e
voltava. A página guarda o último termo **enviado** e só se realinha quando a URL discorda dele.

## Sessão de 27/07 — testes das páginas (BL-08)

O front saiu de 2 arquivos de teste para 9, e de 16 casos para 68. Entraram `jsdom`,
`@testing-library/react` e `user-event`; o Vitest passou a ter `environment: 'jsdom'` e um
`test-setup.ts` (limpeza entre testes e um `ResizeObserver` de mentira, que o reactflow pede).

Montar uma página é montar uma **rota**: `createMemoryRouter` com o loader de verdade e o módulo de
API trocado por `vi.mock`. Isso só é possível porque os dados vêm de loaders (ADR-010) — antes, a
página buscava sozinha e não havia costura por onde entrar. O detalhe está em
[`03-testes-e-ci.md`](03-testes-e-ci.md).

**Dois achados, e nenhum deles era sobre teste:**

1. **O defeito do BL-11 não estava corrigido.** A correção da sessão comparava o campo de busca com a
   URL a cada render; entre mandar a busca e o loader responder, a URL ainda mostra o termo velho, e
   essa comparação apagava o que tinha sido digitado nesse intervalo. Foi o teste de regressão — que
   segura a resposta da API no ar de propósito — que mostrou. Agora a página detecta a **mudança** de
   URL contra o render anterior, e só realinha o campo quando o termo novo não é o que ela mesma
   pediu.
2. **Os rótulos não estavam ligados aos campos.** Nenhum `<label>` tinha `htmlFor`, e os selects das
   uniões não tinham nome nenhum — clicar no rótulo não focava o campo e um leitor de tela não sabia
   dizer o que era cada um. Procurar elemento pelo rótulo no teste é o que fez isso aparecer.

## Sessão de 27/07 — foto de perfil de verdade (BL-02)

A foto era uma URL para uma imagem hospedada em outro lugar. Agora é arquivo, e o arquivo fica no
Postgres — o porquê (backup, tabela à parte, base64 no JSON) está no **ADR-011**.

| Camada | O que entrou |
| --- | --- |
| `packages/db` | modelo `PersonPhoto` (`bytes`, `mimeType`, PK = `personId`, cascata); migration `20260728001800_foto_de_perfil`, que derruba `people.profilePhoto` |
| `packages/types` | `photoUpdatedAt` na `Person`; `PhotoUploadData` e `PhotoMimeType` |
| `apps/api` | `GET/PUT/DELETE /api/people/:id/photo`; `photo.util.ts` confere a assinatura do arquivo contra o tipo declarado; limite do corpo JSON em 3 MB |
| `apps/web` | `photo.ts` — reduz no `<canvas>` para 512px, achata em JPEG, e monta a URL versionada; seletor de arquivo com prévia no formulário e no `/setup` |

**O número que justifica reduzir no navegador:** um PNG de 1,8 MB e 1600×1200, escolhido na tela,
chegou ao banco com **5,5 KB**.

Duas coisas para saber ao mexer aqui:

- A **pessoa nunca carrega os bytes**. O `include` do Prisma pega só o `updatedAt` da foto, que vira
  `photoUpdatedAt`. Se algum dia a foto voltar a ser coluna de `people`, a lista, a árvore e o
  calendário passam a baixar o álbum inteiro.
- A URL da foto não muda quando a foto muda, então ela leva o `photoUpdatedAt` na query. Tirar isso
  faz o navegador mostrar a foto antiga depois de trocar.

## Sessão de 27/07 — trocar a pessoa central (BL-04)

Dava para cadastrar a pessoa central e nunca mais mudar de ideia: a RN-001 barra a segunda, e não
havia operação de transferência. Agora há `PUT /api/people/central`, e um botão na tela de edição de
quem ainda não é.

É **transferência, não criação**: as duas escritas vão na mesma transação e nesta ordem — tirar de
quem tem, depois dar a quem recebe. Um instante com dois centrais quebraria o cálculo de parentesco,
que procura um só. O `PATCH` de pessoa continua ignorando `isCentralUser` de propósito (RN-018).

O efeito é o produto inteiro girando: passando o posto do Miguel para a Fernanda, ele vira "Marido",
o pai dela vira "Pai", o pai dele vira "Sogro" e a irmã dele vira "Cunhada" — verificado rodando.

**De quebra, o e2e voltou a funcionar.** Ele montava o `AppModule` direto, sem chamar `loadRootEnv()`,
então o Prisma subia sem `DATABASE_URL` e **nenhum** e2e passava — inclusive o de health, que estava
assim havia tempo. Agora o `jest-e2e.json` tem um `setupFiles` que carrega o `.env` da raiz.

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

Na sessão de 28/07 (BL-09 e ADR-013):

- **Bancada de 5000 pessoas**, num banco `kindred_bench` criado e derrubado na hora. As cinco
  requisições (página 1, página 250, busca, ordenação por idade, lista inteira) foram capturadas
  antes e depois da mudança e comparadas: **JSON idêntico**, e o tempo caiu de ~202 ms para ~35 ms
  nas paginadas. A base real não foi tocada.
- Depois, contra a **base real** (143 pessoas, com a API na `:3005`): a listagem devolve nome dos
  pais, local, foto e grau; na tela, `?search=santos&sortBy=age&sortDirection=desc` mostra "Tia-avó",
  "Avó" e "Tio-avô" com os pais embaixo de cada nome.
- Backup: base real → restore em banco descartável → backup de novo → **JSON byte a byte idêntico**.
  Fixture anônimo auditado contra a base real: nenhum nome, nota, foto, cidade ou id em comum, e
  nenhuma data de nascimento intacta, com a estrutura batendo em tudo.

Na sessão de 28/07 (BL-07), web em `:5173` contra o seed, que tem dois falecidos (Antônio, nascido
em 18/01 e falecido em 12/03; Maria, nascida em 04/07 e falecida em 02/11):

- Julho de 2026: a Maria aparece no dia 4 com a marca de falecida (`is-memorial`, "faria 91 anos"),
  ao lado do Bruno vivo no dia 19 (`is-birthday`, "faz 39 anos") — duas marcas visualmente distintas
  no mesmo mês.
- Novembro de 2026: a Maria reaparece no dia 2, agora como falecimento (`is-death`, "8 anos de
  falecimento"), com a Fernanda viva no mesmo mês.
- As duas tabelas do rodapé não se misturam: aniversários traz 5 vivos, falecimentos traz Maria
  (02/11, 98 dias) e Antônio (12/03/2027, 228 dias).
- Desmarcar **Mostrar falecimentos** deixa só `is-birthday` na grade, some com a segunda tabela e
  com a legenda — o calendário volta a ser o de antes.

Na sessão de 28/07 (BL-05), com a API em `:3005` contra o seed:

- As três notas do seed chegam na listagem, e o JSON das 23 pessoas ficou em **33,8 KB** — o texto
  praticamente não pesou, que era a aposta do teto.
- As cinco bordas do campo respondem certo: 2001 caracteres é recusado com `400`, 2000 salva, `""` e
  `null` limpam a nota, e um `PATCH` **sem** o campo não apaga a nota de quem tem.
- A busca **não** casa as notas: "intercambio", "Diamantina", "Coimbra" e "ferroviario" devolvem 0,
  enquanto "antonio" (1), "familia" (18), "primo" (1) e "amigo" (2) seguem como antes.
- Na tela (web em `:5174`): o rótulo "Notas" está ligado ao campo, o contador acompanha, o texto do
  seed aparece ao abrir, e editar e salvar chega no banco.

Na sessão de 27/07:

- BL-04 na tela e pela API: passar o posto para a Fernanda faz o Miguel virar "Marido", o Heitor
  "Pai", o Carlos "Sogro" e a Beatriz "Cunhada"; passar para o Carlos faz o Miguel virar "Filho" e a
  Fernanda "Nora". Sempre **um** central. O botão some de quem já é, e aparece o selo. Os 6 testes
  e2e passam contra o Postgres de dev e devolvem o banco como estava — 23 pessoas, Miguel central.
- BL-02 ponta a ponta, com a API no ar: um PNG de 111 KB subido pela API volta **byte a byte igual**,
  com `Content-Type: image/png` e `ETag`; a listagem das 23 pessoas ocupa 35 KB de JSON **sem
  nenhum byte de imagem**. As recusas respondem certo — arquivo que mente sobre o tipo, tipo fora da
  lista, pessoa inexistente, pessoa sem foto. Na tela: um PNG de 1,8 MB e 1600×1200 escolhido no
  formulário virou 512×384 e 5,5 KB no banco, apareceu na lista e no nó da árvore, e o "Remover foto"
  apagou a linha. Apagar uma pessoa com foto leva a foto junto pela cascata. O seed ficou intacto
  (23 pessoas, nenhuma foto).
- Depois do BL-08, com a API no ar de novo: a busca emendada (`mari` → `maria` antes de a primeira
  voltar) mantém o que foi digitado **e** a URL chega em `?search=maria`; o calendário desenha julho
  de 2026 com o aniversário do dia 19; o rótulo "Busca" está de fato ligado ao campo.
- BL-11 na tela, contra o seed: `/people?search=sonia&sortBy=age&sortDirection=desc` reconstrói
  campo, os dois selects e o resultado; `?page=0&sortBy=altura&sortDirection=cima` cai no padrão em
  vez de erro; o voltar do navegador realinha o campo de busca; digitar mais **durante** a ida da
  busca anterior não perde o que foi digitado (era o defeito). Calendário navega os meses e lista os
  5 próximos aniversários; a árvore abre em 5 nós e vai a 19 em 4 gerações a 148px, como antes;
  criar/remover local e remover pessoa recarregam a lista pelo `useRevalidator`; a segunda união
  vigente ainda barra na tela com a mensagem da RN-014, e o select volta ao que o servidor diz.
  Nenhum erro no console; o seed ficou intacto (23 pessoas, 4 locais).
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

- `pnpm typecheck`, `pnpm lint` e `pnpm test` (**121 testes**: 36 na API e 85 no web, entre módulos
  puros, loaders e páginas) — verdes, mais 6 de e2e que rodam à parte, com banco. O lint passa **sem
  aviso nenhum**.
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

- **Portas.** Outros projetos desta máquina usam 3000, 5173 e 5432. Rodar dois ao mesmo tempo exige
  mudar as portas de um deles — ver "Coisas do ambiente que custaram tempo", acima.
- **O grupo de afinidade se desloca como bloco, mas o espaçamento é linha a linha.** Num caso
  extremo (muitos cônjuges com família aberta na mesma geração) o grupo pode sair torto — nunca
  sobreposto, mas desalinhado do cônjuge. Não apareceu com o seed.
- **`isCentralUser` não tem unicidade no banco** — a garantia é só na aplicação (doc 02). O mesmo
  vale para "no máximo uma união vigente por pessoa" (RN-014).
- **O teto das notas está escrito em dois arquivos** (DTO da API e `PersonFormPage`), por causa do
  ADR-005. Mudar um sem o outro faz a tela deixar digitar o que o servidor recusa.
- **Mexeu no schema? O backup também precisa saber.** Um campo escalar novo tem de entrar no
  `backup.ts` **e** no `restore.ts` — o `pnpm db:backup` falha dizendo qual falta, mas quem só roda
  migration e testa a tela não descobre até precisar restaurar (ADR-013).
- **O backup é manual.** Não há agendamento: é um comando que alguém roda. Enquanto for assim, vale
  rodar `pnpm db:backup` antes de fechar a sessão em que se cadastrou gente.

## Próximo passo sugerido

Nada travado e nada pela metade. O backlog só tem itens grandes, que são **escolha de rumo** — vale
decidir com o usuário, não emendar:

1. **BL-06 — exportar/importar**, e ele ficou **bem mais barato**: o formato JSON e as duas metades
   (coletar e restaurar) já existem no `@kindred/db` (ADR-013). Falta expor pela aplicação — um botão
   que baixa o arquivo e outro que sobe. GEDCOM continua sendo outra conversa, bem maior.
2. **BL-14** — enxugar a resposta da árvore e do calendário, que ainda recebem a base inteira com
   pai, mãe e local aninhados (7,5 MB com 5000 pessoas). Diferente do BL-09, isto **mexe no contrato
   da API**: precisa decidir o que cada tela realmente consome antes de cortar.
3. **BL-10** — multiusuário com login. Muda o produto de "base pessoal" para serviço.

**Uma lição que se repetiu duas vezes:** medir antes de mexer. Na primeira metade do BL-09 o backlog
culpava a consulta, e o gargalo era o cálculo — 14× maior do que o apontado. Na segunda, o ganho real
só apareceu porque havia uma base de 5000 pessoas para medir: na base de 143, a diferença entre 202 ms
e 35 ms não aparece.
