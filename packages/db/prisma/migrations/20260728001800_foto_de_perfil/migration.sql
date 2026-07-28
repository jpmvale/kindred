-- Foto de perfil deixa de ser URL e passa a ser arquivo guardado no banco (ADR-011).
--
-- A coluna `profilePhoto` guardava um endereço externo e sai inteira. Não há
-- backfill porque não há o que converter: uma URL não vira imagem sem baixá-la,
-- e a coluna estava vazia em todas as linhas. Se um banco tiver URLs guardadas,
-- rode antes o SELECT abaixo e salve o resultado — depois deste ALTER TABLE elas
-- não existem mais:
--
--   SELECT id, name, "profilePhoto" FROM people WHERE "profilePhoto" IS NOT NULL;

-- AlterTable
ALTER TABLE "people" DROP COLUMN "profilePhoto";

-- CreateTable
CREATE TABLE "person_photos" (
    "personId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_photos_pkey" PRIMARY KEY ("personId")
);

-- AddForeignKey
ALTER TABLE "person_photos" ADD CONSTRAINT "person_photos_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
