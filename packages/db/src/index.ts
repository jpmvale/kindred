/**
 * `@kindred/db` — a fonte da verdade do schema (Prisma) e o acesso ao banco.
 *
 * Quem precisa do banco importa daqui, nunca de `@prisma/client` direto: o
 * client gerado é um detalhe deste pacote (ver `docs-tec/01-arquitetura.md`).
 */
export {
  Prisma,
  PrismaClient,
  RelationshipType,
  Sex,
  UnionStatus,
} from "@prisma/client";
export type { Location, Person, Union, User } from "@prisma/client";
export { DEFAULT_DATABASE_URL, loadRootEnv } from "./env";

/**
 * Backup, restauração e exportação (BL-06, ADR-013/016) — a API expõe pela
 * aplicação o que o CLI (`db:backup`/`db:restore`) já fazia por arquivo.
 */
export {
  backupFilename,
  buildBackupPayload,
  type BackupScope,
} from "./backup";
export {
  buildRestoreOperations,
  parseBackupFile,
  type BackupFile,
} from "./restore";
