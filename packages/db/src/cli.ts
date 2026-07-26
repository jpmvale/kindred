/*
 * Roda o CLI do Prisma com o `.env` da raiz carregado e o schema deste pacote.
 *
 *   pnpm --filter @kindred/db db:generate      # prisma generate
 *   pnpm --filter @kindred/db db:migrate       # prisma migrate deploy
 *   pnpm --filter @kindred/db db:migrate:dev   # prisma migrate dev
 *
 * Sem este wrapper cada comando precisaria de `DATABASE_URL` no ambiente do
 * shell: o CLI do Prisma lê o `.env` do cwd (`packages/db`), não o da raiz.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { loadRootEnv } from "./env";

loadRootEnv();

const schema = join(__dirname, "..", "prisma", "schema.prisma");
const args = [...process.argv.slice(2), "--schema", schema];

const result = spawnSync("prisma", args, {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
