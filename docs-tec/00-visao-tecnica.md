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
- Não há fila, cache nem worker. Autenticação existe (BL-10, ADR-018) — cada conta vê só a própria
  árvore —, mas é sessão por cookie simples, sem OAuth, 2FA nem recuperação de senha.

## Superfície HTTP

Prefixo global `/api`. Validação global com `ValidationPipe({ whitelist: true, transform: true })` —
campo não declarado no DTO é descartado, não rejeitado. Toda rota exige sessão (cookie
`kindred_session`) por padrão; as marcadas **pública** abaixo são a exceção explícita (`@Public()`,
ADR-018) — sem sessão, qualquer outra rota devolve `401`.

| Método | Rota | O que faz |
| --- | --- | --- |
| `GET` | `/api/health` | Status da API + `select 1` no banco. **Pública.** |
| `POST` | `/api/auth/register` | Cria a conta e já loga (seta o cookie). **Pública.** |
| `POST` | `/api/auth/login` | Autentica e seta o cookie. **Pública.** |
| `POST` | `/api/auth/logout` | Apaga a sessão e o cookie. **Pública** (idempotente, funciona sem cookie). |
| `GET` | `/api/auth/me` | A conta logada, ou `401`. |
| `PATCH` | `/api/auth/me` | Troca e-mail e/ou senha (RN-025); exige `currentPassword`. |
| `GET` | `/api/people` | Lista com parentesco calculado, **da conta logada**; paginada se vier `page`/`limit`/`search`/`sortBy`/`sortDirection` (RN-005). |
| `GET` | `/api/people/central` | A pessoa central da conta, ou `null`. |
| `GET` | `/api/people/:id` | Uma pessoa da conta, com pai, mãe, local, uniões e parentesco. |
| `POST` | `/api/people` | Cria (RN-001, RN-003). |
| `PATCH` | `/api/people/:id` | Atualiza campo a campo (só o que vem no corpo). |
| `DELETE` | `/api/people/:id` | Remove (RN-010). |
| `GET`/`PUT`/`DELETE` | `/api/people/:id/photo` | Foto de perfil (ADR-011). |
| `PUT` | `/api/people/central` | Transfere o posto de pessoa central (RN-018). |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/unions[/:id]` | CRUD de uniões conjugais, da conta logada (RN-011, RN-014; ADR-008). |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/locations[/:id]` | CRUD de locais, da conta logada. |
| `GET` | `/api/backup` | Baixa o backup da conta logada, em JSON (ADR-013, BL-06). |
| `POST` | `/api/backup/restore` | Restaura o backup **na conta logada**; `?force=true` apaga o que já existe antes (RN-021). |

**As datas do contrato são parciais** (RN-027, ADR-028): `birthDate` e `deathDate` viajam como texto
no ISO encurtado — `1988-05-30`, `1988-05`, `1988`, `--05-30` ou `--05` —, e não como carimbo de
tempo. O DTO valida o formato; o banco guarda a mesma string.

A ordem das rotas importa: `/people/central` é declarada **antes** de `/people/:id`, senão "central"
seria lido como id.

## Ambiente de desenvolvimento

Postgres em Docker; API e web em watch no host (`pnpm dev`), ou a API também em container
(`docker compose up -d`) — ver ADR-004 e o README.

## O que não existe (e é proposital)

Observabilidade (logs estruturados/traces), rate limit, cache, deploy de produção, recuperação de
senha, troca de e-mail/senha pela própria conta. O projeto roda na máquina de quem o usa; cada um
desses viria com custo de manutenção sem benefício hoje — a autenticação (BL-10) é a exceção que
deixou de fazer sentido continuar sem, no momento em que "uma pessoa" virou "várias pessoas, cada
uma com sua base".
