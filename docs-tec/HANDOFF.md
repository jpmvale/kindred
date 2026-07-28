# HANDOFF — estado atual

_Atualizado em 28/07/2026._

## Onde o projeto está

O MVP funciona de ponta a ponta: cadastro de pessoas e locais, cálculo de parentesco, lista com
busca/ordenação/paginação, árvore genealógica, calendário de aniversários.

## Onde a última sessão parou

**BL-05 (notas por pessoa) foi fechado** — era o único item que a sessão anterior deixou em aberto.
Com ele, **o backlog não tem mais nenhum item pequeno**: o que resta (BL-06 exportar/importar, BL-07
aniversário de falecimento, BL-09 paginação no banco, BL-10 multiusuário) é escolha de rumo, não
dívida.

`git status` limpo, `pnpm typecheck`, `pnpm lint` e `pnpm test` verdes (**124 testes**: 36 na API e
88 no web), mais os 6 e2e que rodam à parte, com banco.

### Coisas do ambiente que custaram tempo

- **A porta 3000 estava ocupada por outro projeto** (`expense-analyzer`) nesta máquina. A API do
  kindred foi rodada com `PORT=3005 pnpm --filter @kindred/api dev`, e o web com
  `API_URL=http://localhost:3005 pnpm --filter @kindred/web dev` para o proxy do Vite achá-la. Se o
  `docker compose up` reclamar de porta, é isso.
- O `pnpm` tem de ser chamado **direto**, nunca por `corepack` — já está no `CLAUDE.md`, mas foi o
  primeiro tropeço da sessão.

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

- **Portas.** O projeto irmão *coda* também usa 3000 e 5432. Rodar os dois ao mesmo tempo exige
  mudar as portas de um deles (`docker compose stop` no coda foi o que se fez aqui).
- **O grupo de afinidade se desloca como bloco, mas o espaçamento é linha a linha.** Num caso
  extremo (muitos cônjuges com família aberta na mesma geração) o grupo pode sair torto — nunca
  sobreposto, mas desalinhado do cônjuge. Não apareceu com o seed.
- **`isCentralUser` não tem unicidade no banco** — a garantia é só na aplicação (doc 02). O mesmo
  vale para "no máximo uma união vigente por pessoa" (RN-014).
- **O teto das notas está escrito em dois arquivos** (DTO da API e `PersonFormPage`), por causa do
  ADR-005. Mudar um sem o outro faz a tela deixar digitar o que o servidor recusa.

## Próximo passo sugerido

Nada travado e nada pela metade. O backlog só tem itens grandes, que são **escolha de rumo** — vale
decidir com o usuário, não emendar:

1. **BL-07** — aniversário de falecimento no calendário. É o menor dos quatro, e o calendário já
   tem toda a estrutura; falta decidir como distinguir as duas datas na tela.
2. **BL-06** — exportar/importar. JSON resolve backup; GEDCOM abriria a porta para trocar dados com
   outros programas de genealogia, e é bem mais trabalho.
3. **BL-09** — paginação de verdade no banco. Só vale a pena com uma base grande, e cobra caro: a
   busca sem acento precisa de `unaccent` no Postgres, e o grau de parentesco, que é calculado e não
   existe como coluna, não tem como ser filtrado em SQL.
4. **BL-10** — multiusuário com login. Muda o produto de "base pessoal" para serviço.
