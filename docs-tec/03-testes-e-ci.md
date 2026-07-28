# 03 — Testes e CI

## O que é testado hoje

| Suíte | Onde | Precisa de banco? |
| --- | --- | --- |
| **Unidade da API** (Jest) | `apps/api/src/**/*.spec.ts` | não |
| **Unidade do web** (Vitest) | `apps/web/src/**/*.test.ts` | não |
| **Páginas do web** (Vitest + jsdom + testing-library) | `apps/web/src/**/*.test.tsx` | não |
| **E2E** (Jest + supertest) | `apps/api/test/*.e2e-spec.ts` | **sim** |

```bash
pnpm test                              # unidade, em todos os pacotes (via turbo)
pnpm --filter @kindred/api test:e2e    # e2e: precisa de docker compose up -d postgres + migrations
pnpm typecheck                         # tsc --noEmit / tsc -b em todos os pacotes
pnpm lint
```

O teste que carrega peso é o de `computeKinship` (ADR-007): monta uma árvore de quatro gerações e
confere pai, mãe, avós, irmã, tio, primo, filha e o caso sem caminho. É a lógica que mais se mexe e a
que mais quebra sem avisar. Com a união conjugal (ADR-008) ele ganhou a metade da afinidade: cônjuge
e ex, sogro, cunhado, genro, padrasto — e, principalmente, o corte da afinidade quando a união é
desfeita (RN-013), que é o comportamento fácil de quebrar sem perceber.

O e2e é de fumaça: sobe a app inteira e bate em `/api/health`. Fica fora do `pnpm test` de propósito —
CI e desenvolvedor rodam a unidade sem infra.

## O front

São duas camadas, e a divisão não é por gosto: cada coisa é testada onde ela realmente decide.

**Módulos puros — sem DOM, sem React.**

- `pages/tree-layout.test.ts` — o layout da árvore (ADR-009): quem aparece, o cônjuge encostado no
  par, a ex do outro lado, a união desfeita tracejada, o sogro uma geração acima e nenhum par de nós
  mais perto que o espaçamento mínimo. Os dois defeitos do BL-12/BL-13 — a linha da ex atravessando o
  card da atual e dois cards sobrepostos — viraram teste.
- `pages/people-list-query.test.ts` — a leitura da URL da lista (ADR-010): os padrões, a volta
  completa e o que fazer com query string torta, já que ela é editável pelo usuário.
- `loaders.test.ts` — o desvio para o `/setup` sem pessoa central, e a tradução da URL nos parâmetros
  da API (busca vazia vira ausente, não string vazia).
- `photo.test.ts` — a conta do redimensionamento (ADR-011), o que barra o arquivo antes de decodificar
  e a versão pendurada na URL da foto. O `<canvas>` em si não é testado: o jsdom não desenha, e o que
  ele faz é chamar duas APIs do navegador com números que já vêm conferidos aqui.

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
união sai da lista de cônjuges (RN-011), e a recusa da API vira mensagem com o campo voltando ao que
o servidor diz; `LocationsPage` — o CRUD, com a lista sempre recarregada do servidor;
`CalendarPage` — o mês de hoje, a virada de ano, os falecidos fora (com "hoje" fixado, senão o teste
muda de resultado sozinho); `SetupPage` — o cadastro da pessoa central e o payload sem campo vazio.

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
