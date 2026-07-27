-- União conjugal como entidade própria (ADR-008) e saída do RelationshipType.WIFE.
--
-- A ordem aqui importa: a tabela `unions` precisa existir e o backfill precisa rodar
-- ANTES de o valor WIFE sair do enum, senão as linhas que ainda estão como WIFE
-- perdem a informação (ou o ALTER TYPE falha).

-- CreateEnum
CREATE TYPE "UnionStatus" AS ENUM ('CURRENT', 'ENDED');

-- CreateTable
CREATE TABLE "unions" (
    "id" TEXT NOT NULL,
    "partnerAId" TEXT NOT NULL,
    "partnerBId" TEXT NOT NULL,
    "status" "UnionStatus" NOT NULL DEFAULT 'CURRENT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unions_partnerBId_idx" ON "unions"("partnerBId");

-- CreateIndex
CREATE UNIQUE INDEX "unions_partnerAId_partnerBId_key" ON "unions"("partnerAId", "partnerBId");

-- AddForeignKey
ALTER TABLE "unions" ADD CONSTRAINT "unions_partnerAId_fkey" FOREIGN KEY ("partnerAId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unions" ADD CONSTRAINT "unions_partnerBId_fkey" FOREIGN KEY ("partnerBId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: quem estava marcado como WIFE vira uma união vigente com a pessoa central.
-- O par é gravado em ordem normalizada (menor id em partnerAId), que é a invariante
-- que o serviço mantém para que (A,B) e (B,A) sejam a mesma união (RN-011).
-- Se não houver pessoa central, o SELECT não devolve linhas e ninguém ganha união —
-- as pessoas apenas passam a FAMILY logo abaixo.
INSERT INTO "unions" ("id", "partnerAId", "partnerBId", "status", "updatedAt")
SELECT
    gen_random_uuid()::text,
    LEAST(wife."id", central."id"),
    GREATEST(wife."id", central."id"),
    'CURRENT',
    CURRENT_TIMESTAMP
FROM "people" AS wife
CROSS JOIN (
    SELECT "id" FROM "people" WHERE "isCentralUser" = true LIMIT 1
) AS central
WHERE wife."relationshipType" = 'WIFE'
  AND wife."id" <> central."id";

UPDATE "people" SET "relationshipType" = 'FAMILY' WHERE "relationshipType" = 'WIFE';

-- AlterEnum
BEGIN;
CREATE TYPE "RelationshipType_new" AS ENUM ('FAMILY', 'FRIEND', 'ACQUAINTANCE', 'OTHER');
ALTER TABLE "people" ALTER COLUMN "relationshipType" TYPE "RelationshipType_new" USING ("relationshipType"::text::"RelationshipType_new");
ALTER TYPE "RelationshipType" RENAME TO "RelationshipType_old";
ALTER TYPE "RelationshipType_new" RENAME TO "RelationshipType";
DROP TYPE "RelationshipType_old";
COMMIT;
