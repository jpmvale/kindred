-- Notas por pessoa (BL-05, RN-019): texto livre sobre a pessoa — de onde veio a
-- amizade, histórias, o que for.
--
-- Coluna em `people`, e não tabela à parte como a foto (ADR-011), porque o texto é
-- limitado a 2000 caracteres no DTO: cabe na listagem sem pesar. Aditiva e anulável,
-- então não há backfill — quem já está cadastrado fica sem nota.

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "notes" TEXT;
