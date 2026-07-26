import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "dotenv";

/**
 * URL do Postgres que o `docker compose up -d postgres` sobe. É o default para
 * quem clonou o repo e ainda não copiou o `.env.example` — o ambiente de dev
 * inteiro funciona sem nenhuma variável definida.
 */
export const DEFAULT_DATABASE_URL =
  "postgresql://kindred:kindred123@localhost:5432/kindred?schema=public";

/**
 * Carrega o `.env` da raiz do monorepo.
 *
 * O CLI do Prisma e os apps rodam de subpastas (`packages/db`, `apps/api`) e só
 * olham o `.env` do próprio cwd — daí a busca explícita pela raiz. Variáveis já
 * presentes no ambiente ganham do arquivo, então o `docker compose` (que injeta
 * `DATABASE_URL` apontando para o host `postgres`) continua manda.
 */
export function loadRootEnv(): void {
  const root = resolve(__dirname, "..", "..", "..");

  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);
    if (existsSync(path)) config({ path });
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
  }
}
