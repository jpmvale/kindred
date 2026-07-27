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

**No front, só a árvore tem teste.** O layout saiu do componente para um módulo puro (ADR-009), e é
ele que `apps/web/src/pages/tree-layout.test.ts` exercita no Vitest, sem DOM: quem aparece, o cônjuge
encostado no par, a ex do outro lado, a união desfeita tracejada, o sogro uma geração acima e nenhum
par de nós mais perto que o espaçamento mínimo. Os dois defeitos que apareceram durante o BL-12/BL-13
— a linha da ex atravessando o card da atual e dois cards sobrepostos — viraram teste. O resto das
páginas continua sem teste nenhum (BL-08).

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
