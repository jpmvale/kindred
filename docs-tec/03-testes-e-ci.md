# 03 — Testes e CI

## O que é testado hoje

| Suíte | Onde | Precisa de banco? |
| --- | --- | --- |
| **Unidade da API** (Jest) | `apps/api/src/**/*.spec.ts` | não |
| **Unidade do web** (Vitest) | `apps/web/src/**/*.test.ts` | não |
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

**No front, o que tem teste é o que é puro.** Nenhum componente é montado: o que o Vitest exercita
são os módulos que o componente chama.

- `apps/web/src/pages/tree-layout.test.ts` — o layout da árvore (ADR-009), sem DOM: quem aparece, o
  cônjuge encostado no par, a ex do outro lado, a união desfeita tracejada, o sogro uma geração acima
  e nenhum par de nós mais perto que o espaçamento mínimo. Os dois defeitos que apareceram durante o
  BL-12/BL-13 — a linha da ex atravessando o card da atual e dois cards sobrepostos — viraram teste.
- `apps/web/src/pages/people-list-query.test.ts` — a leitura da URL da lista (ADR-010): os padrões,
  a volta completa e, principalmente, o que fazer com query string torta, já que ela é editável pelo
  usuário.

Tirar o fetch do `useEffect` (BL-11) foi o que tornou isso possível para o resto: com os dados vindo
de loaders, o que dá para testar sem montar componente cresceu. As páginas em si continuam sem teste
(BL-08).

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
