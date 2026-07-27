# 00 — Visão técnica

## Em uma tela

```
                    ┌──────────────────────────┐
   navegador ──────▶│  @kindred/web (Vite/React)│   :5173
                    │  proxy /api ──────────────┼──┐
                    └──────────────────────────┘  │
                                                  ▼
                    ┌──────────────────────────┐
                    │  @kindred/api (NestJS)   │   :3000  /api
                    │  people · locations · health
                    └───────────┬──────────────┘
                                │ @kindred/db (Prisma Client)
                                ▼
                    ┌──────────────────────────┐
                    │  PostgreSQL 16 (Docker)  │   :5432
                    └──────────────────────────┘
```

- **`@kindred/types`** carrega o contrato da API (só tipos) e é consumido pelos dois lados.
- **`@kindred/db`** é o dono do schema Prisma, das migrations e do seed.
- Não há fila, cache, worker nem autenticação — o produto é local e de um usuário só.

## Superfície HTTP

Prefixo global `/api`. Validação global com `ValidationPipe({ whitelist: true, transform: true })` —
campo não declarado no DTO é descartado, não rejeitado.

| Método | Rota | O que faz |
| --- | --- | --- |
| `GET` | `/api/health` | Status da API + `select 1` no banco. |
| `GET` | `/api/people` | Lista com parentesco calculado; paginada se vier `page`/`limit`/`search`/`sortBy`/`sortDirection` (RN-005). |
| `GET` | `/api/people/central` | A pessoa central, ou `null`. |
| `GET` | `/api/people/:id` | Uma pessoa, com pai, mãe, local, uniões e parentesco. |
| `POST` | `/api/people` | Cria (RN-001, RN-003). |
| `PATCH` | `/api/people/:id` | Atualiza campo a campo (só o que vem no corpo). |
| `DELETE` | `/api/people/:id` | Remove (RN-010). |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/unions[/:id]` | CRUD de uniões conjugais (RN-011, RN-014; ADR-008). |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/locations[/:id]` | CRUD de locais. |

A ordem das rotas importa: `/people/central` é declarada **antes** de `/people/:id`, senão "central"
seria lido como id.

## Ambiente de desenvolvimento

Postgres em Docker; API e web em watch no host (`pnpm dev`), ou a API também em container
(`docker compose up -d`) — ver ADR-004 e o README.

## O que não existe (e é proposital)

Autenticação, observabilidade (logs estruturados/traces), rate limit, cache, deploy de produção. O
projeto roda na máquina de quem o usa; cada um desses viria com custo de manutenção sem benefício
hoje.
