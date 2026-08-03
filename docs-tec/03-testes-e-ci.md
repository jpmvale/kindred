# 03 — Testes e CI

## O que é testado hoje

| Suíte | Onde | Precisa de banco? |
| --- | --- | --- |
| **Unidade da API** (Jest) | `apps/api/src/**/*.spec.ts` | não |
| **Unidade do web** (Vitest) | `apps/web/src/**/*.test.ts` | não |
| **Páginas do web** (Vitest + jsdom + testing-library) | `apps/web/src/**/*.test.tsx` | não |
| **Cobertura do backup** (Vitest) | `packages/db/src/backup.test.ts` | não |
| **Scripts do banco** (Vitest) | `packages/db/src/*.test.ts` — hoje backup, redefinição de senha e o corte do 1º de janeiro (ADR-028) | não |
| **E2E** (Jest + supertest) | `apps/api/test/*.e2e-spec.ts` | **sim** |

```bash
pnpm test                              # unidade, em todos os pacotes (via turbo)
pnpm --filter @kindred/api test:e2e    # e2e: precisa de docker compose up -d postgres + migrations
pnpm typecheck                         # tsc --noEmit / tsc -b em todos os pacotes
pnpm lint
```

**O `people.service` tem teste desde o ADR-014**, e o alvo é uma armadilha específica: a listagem
paginada virou duas consultas, e a segunda usa `where: { id: { in } }`, que **não promete ordem**. O
Prisma dublê entrega as linhas na ordem inversa de propósito — se a remontagem sumir, a página sai
embaralhada sem erro nenhum. Os mesmos testes seguram o formato das duas consultas (a varredura não
pode voltar a pedir `include`) e o caso de alguém ser apagado entre uma e outra.

**O `@kindred/db` tem teste por um motivo só:** a `assertCoverage` do `db:backup`, que cobra do
`schema.prisma` que todo campo escalar esteja no arquivo (ADR-013). É a proteção contra um backup sair
furado, e um backup furado só se revela na restauração, quando o dado original já não existe. O teste
inclui o caso em que a pessoa exportada perde campos — é o formato do vazamento silencioso que se quer
impedir.

**`backup.service.spec.ts` protege o controle de fluxo da restauração** (ADR-016, RN-021), não o
formato do arquivo — isso já é do `@kindred/db`. Um Prisma dublê grava a ordem em que cada método foi
chamado, e os testes conferem: sem `force` e banco ocupado, nada é tocado; com `force`, apagar vem
antes de recriar, tudo num `$transaction` só. A garantia mais forte — que um arquivo malformado no
meio da restauração deixa o banco exatamente como estava — não dá para provar com um dublê (ele não
sabe fazer rollback de verdade); essa foi provada rodando contra um Postgres de teste: uma união
apontando para gente inexistente derruba a transação inteira, e as pessoas que já estavam lá
continuam intactas.

O teste que carrega peso é o de `computeKinship` (ADR-007): monta uma árvore de quatro gerações e
confere pai, mãe, avós, irmã, tio, primo, filha e o caso sem caminho. É a lógica que mais se mexe e a
que mais quebra sem avisar. Com a união conjugal (ADR-008) ele ganhou a metade da afinidade: cônjuge
e ex, sogro, cunhado, genro, padrasto — e, principalmente, o corte da afinidade quando a união é
desfeita (RN-013), que é o comportamento fácil de quebrar sem perceber.

**O e2e é onde vive o que precisa de banco.** Além da fumaça (`/api/health`), ele cobre a troca da
pessoa central (RN-018): a operação mexe em duas linhas ao mesmo tempo e a regra "existe no máximo
uma" não tem constraint no Postgres — quem garante é o serviço, e isso não se verifica com dublê. O
teste cria as próprias pessoas, e no `afterAll` devolve o posto a quem tinha e apaga o que criou, de
modo que rodar contra o banco de dev não deixa rastro.

Fica fora do `pnpm test` de propósito: CI e desenvolvedor rodam a unidade sem infra.

```bash
docker compose up -d postgres && pnpm db:migrate
pnpm --filter @kindred/api test:e2e
```

## O front

São duas camadas, e a divisão não é por gosto: cada coisa é testada onde ela realmente decide.

**Módulos puros — sem DOM, sem React.**

- `pages/tree-layout.test.ts` — o layout da árvore (ADR-009, e depois ADR-020 a ADR-023): quem
  aparece, o cônjuge encostado no par, a ex do outro lado, a união desfeita tracejada, o sogro uma
  geração acima e nenhum par de nós mais perto que o espaçamento mínimo. Os dois defeitos do
  BL-12/BL-13 — a linha da ex atravessando o card da atual e dois cards sobrepostos — viraram teste,
  e com o empacotamento por família entraram o casal centrado sobre os filhos, cada tio sobre a
  própria prole, três gerações de filho único em coluna e a garantia de que **nenhuma caixa de
  família se sobrepõe a outra**. `viewportTarget` (ADR-025) é testado aqui pelo mesmo motivo de estar
  aqui: no jsdom o reactflow não mede nada, e verificar centralização pela página mediria o dublê.
- `date.test.ts` — as datas parciais (RN-027, ADR-028): as cinco formas do formato canônico, o que
  **não** é data, o dia sem mês sendo descartado, a leitura em português sem inventar o que falta, a
  idade aproximada de quem só tem o ano e a ordenação que põe `1988` entre `1987-12` e `1988-05`.
- `pages/parent-candidates.test.ts` — quem entra na lista de pai e de mãe (RN-026): sexo, limites de
  idade, o filho póstumo (o pai pode ter morrido antes do nascimento; a mãe, não) e o já escolhido,
  que nunca some da lista mesmo contrariando o filtro.
- `pages/person-relations.test.ts` — a família que o card mostra: meio-irmão por um lado só, pai fora
  da lista carregada virando nulo em vez de quebrar, e o cônjuge resolvido na lista (a API não manda
  o parceiro por extenso sem paginação, BL-14).
- `pages/calendar-entries.test.ts` — as três datas do calendário (RN-020) e, com as datas parciais,
  quem entra: dia e mês bastam (com ou sem ano); só o ano não, porque não há quadrado a marcar.
- `pages/people-list-query.test.ts` — a leitura da URL da lista (ADR-010): os padrões, a volta
  completa e o que fazer com query string torta, já que ela é editável pelo usuário.
- `loaders.test.ts` — o desvio para o `/setup` sem pessoa central, e a tradução da URL nos parâmetros
  da API (busca vazia vira ausente, não string vazia).
- `photo.test.ts` — a conta do redimensionamento (ADR-011), o que barra o arquivo antes de decodificar
  e a versão pendurada na URL da foto. O `<canvas>` em si não é testado: o jsdom não desenha, e o que
  ele faz é chamar duas APIs do navegador com números que já vêm conferidos aqui.
- `theme.test.ts` — a resolução do tema (ADR-015): lixo no `localStorage` não vira tema, "sistema"
  segue o SO **e só ele**, o que chega ao `<html>` é sempre `light`/`dark`, e storage indisponível
  (modo privado) não impede a troca na sessão.

**Componente — `components/ThemeToggle.test.tsx`.** Fora do padrão de rota, porque o seletor não
depende de loader nenhum. O que ele afirma: a opção guardada vem marcada, escolher troca o `<html>` e
persiste, em "sistema" o SO trocando de tema troca a tela, e **escolha explícita não acompanha o SO**.

O dublê do `prefers-color-scheme` precisa remover de verdade no `removeEventListener` — é isso que
separa "o componente ignorou o aviso" de "o componente cancelou a inscrição". Um dublê que aceita e
não remove reprova código correto, que foi exatamente o que aconteceu ao escrever este teste.

**Componente — `components/PartialDateInput.test.tsx`.** O campo de data parcial (ADR-028) é testado
à parte porque o que ele promete é comportamento de teclado, e isso não aparece no módulo puro:
digitar `30051988` seguido preenche as três caixas (elas avançam sozinhas), só o ano vale como data,
dia e mês sem ano viram `--05-30`, e **o dia digitado antes do mês fica na tela** — some seria pior
que esperar o mês, mesmo o valor ainda não existindo.

**Componente — `components/PersonDetailPanel.test.tsx`.** O card da árvore (ADR-026), que também não
depende de loader: nome, datas, notas, os grupos de família com o cônjuge e a união desfeita marcada,
o clique num parente chamando `onSelectPerson`, e quem **não está desenhado** na árvore aparecendo
marcado — o card mostra a família inteira, mas para essa gente não há centralização a prometer.

**Páginas — a rota inteira, com a API dublada.** Como os dados vêm de loaders (ADR-010), montar uma
página é montar uma **rota**: um `createMemoryRouter` com o loader de verdade e o módulo de API
substituído por `vi.mock`. O caminho exercitado é o mesmo do navegador — URL, loader, página, clique
—, só que sem rede. As ferramentas estão em [`test-utils.tsx`](../apps/web/src/test-utils.tsx).

Os testes procuram os elementos **pelo rótulo**, como um leitor de tela faria (`getByLabelText`,
`getByRole`). Isso obrigou a associar rótulo e campo (`htmlFor`/`id`) e a dar nome acessível aos
selects das uniões — que não tinham, e é defeito de acessibilidade, não detalhe de teste.

O que cada arquivo cobre, em uma linha: `PeopleListPage` — a URL manda nos campos, o debounce leva a
busca para a URL, a paginação trava nas pontas, remover pede confirmação, **e o campo não perde o que
foi digitado enquanto a busca anterior volta** (o defeito do BL-11, que agora tem teste);
`PersonFormPage` — o formulário nasce do loader, a própria pessoa não é candidata a pai, quem já tem
união sai da lista de cônjuges (RN-011), a recusa da API vira mensagem com o campo voltando ao que
o servidor diz, os campos de gente são comboboxes digitáveis que filtram ignorando acento (ADR-024),
o filtro de pai/mãe esconde quem não se encaixa **e oferece ver assim mesmo** (RN-026), e a edição
lista os filhos de quem está sendo editado; `LocationsPage` — o CRUD, com a lista sempre recarregada do servidor;
`CalendarPage` — o mês de hoje, a virada de ano, os falecidos fora (com "hoje" fixado, senão o teste
muda de resultado sozinho); `SetupPage` — o cadastro da pessoa central e o payload sem campo vazio;
`SettingsPage.account.test.tsx` e `SettingsPage.backup.test.tsx` — as duas seções de Configurações
(ADR-027), que antes eram duas telas: trocar e-mail e senha exigindo a senha atual, e exportar e
restaurar com a confirmação antes de apagar.

**A árvore é a exceção.** `TreePage.test.tsx` é só fumaça — monta, mostra os nós, o filtro de
cônjuges tira o cônjuge. No jsdom o reactflow não mede nada, então medir posição por ali seria medir
o dublê; a posição de verdade é testada no módulo puro.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — em push na `main` e em todo PR, com
cancelamento de execuções antigas do mesmo ref:

```
pnpm install --frozen-lockfile
pnpm turbo run build       # inclui o prisma generate (build do @kindred/db)
pnpm turbo run typecheck
pnpm turbo run lint
pnpm turbo run test
```

`DATABASE_URL` é definida no job mesmo sem banco: o `prisma generate` exige que a variável do
`datasource` seja resolvível, ainda que não conecte. Não há serviço de Postgres no CI porque nada do
que roda lá toca o banco — quando o e2e entrar no CI, entra junto um `services: postgres`.
