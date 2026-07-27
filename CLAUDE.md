# kindred — guia para o Claude Code

**kindred** registra pessoas e os vínculos entre elas, calcula o grau de parentesco em relação a uma
pessoa central e mostra isso como lista, árvore genealógica e calendário de aniversários. Visão
completa em [`docs/01-visao-do-produto.md`](docs/01-visao-do-produto.md).

## Estrutura da documentação

- [`docs/`](docs/) — **produto** (o *quê* e o *porquê*): visão, modelo de domínio e regras de
  negócio (**RN-\***).
- [`docs-tec/`](docs-tec/) — **técnico** (o *como*): visão técnica, arquitetura com as decisões
  (**ADR-\***), modelo de dados, testes e CI. A spec original do projeto está em
  [`docs-tec/specs/`](docs-tec/specs/).

## Como trabalhar aqui

1. **Gerenciador de pacotes: sempre `pnpm`**, chamado direto — é um monorepo pnpm workspaces.
   **Nunca `npm` nem `yarn`:** um `npm install` gera `package-lock.json`, quebra os symlinks do
   workspace e os scripts `pnpm --filter …`. **Nem `corepack pnpm`:** sob o corepack o pnpm não
   troca de versão sozinho, e com um pnpm mais novo que o `packageManager` do `package.json` todo
   script do turbo morre com "This project is configured to use …". Chamado direto ele se ajusta.
2. **Idioma:** documentação, comentários e conversa em **português (pt-BR)**. A UI também.
3. **Commits:** `tipo: frase` curta em português — `feat`, `fix`, `docs`, `chore`, `refactor`.
4. **Schema:** o Prisma vive só no `@kindred/db`. Mudou o schema → `pnpm db:migrate:dev` (gera a
   migration) e atualize [`docs-tec/02-modelo-de-dados.md`](docs-tec/02-modelo-de-dados.md).
   Nenhum app importa `@prisma/client` direto (ADR-003).
5. **Contrato compartilhado:** `@kindred/types` é **só tipos**, sem valor em runtime (ADR-005) — o
   web importa tudo com `import type`. Rótulos em pt-BR ficam em `apps/web/src/labels.ts`.
6. **Antes de commitar:** `pnpm typecheck && pnpm test`. Mudança de regra de negócio precisa mexer
   nas RNs em [`docs/03-regras-de-negocio.md`](docs/03-regras-de-negocio.md).
7. **Decisão de arquitetura fechada** virou ADR em
   [`docs-tec/01-arquitetura.md`](docs-tec/01-arquitetura.md) — registre em vez de deixar solta no
   código.

## Estado atual

Ver [`docs-tec/HANDOFF.md`](docs-tec/HANDOFF.md).
