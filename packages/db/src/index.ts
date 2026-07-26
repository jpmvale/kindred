/**
 * `@kindred/db` — a fonte da verdade do schema (Prisma) e o acesso ao banco.
 *
 * Quem precisa do banco importa daqui, nunca de `@prisma/client` direto: o
 * client gerado é um detalhe deste pacote (ver `docs-tec/01-arquitetura.md`).
 */
export { Prisma, PrismaClient, RelationshipType, Sex } from "@prisma/client";
export type { Location, Person } from "@prisma/client";
export { DEFAULT_DATABASE_URL, loadRootEnv } from "./env";
