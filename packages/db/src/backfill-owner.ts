/*
 * `db:backfill-owner` — dá dono a quem foi cadastrado antes de existir conta
 * (BL-10). Passo único, entre a migration que cria `userId` **nullable** em
 * `people`/`locations` e a que o torna obrigatório: sem esta linha ter rodado,
 * a migration seguinte é recusada pelo próprio Postgres (`NOT NULL` não aceita
 * `NULL` que sobrou).
 *
 *   pnpm db:backfill-owner
 *
 * Idempotente: se não sobrar nenhuma `Person`/`Location` órfã (`userId IS
 * NULL`), não faz nada — rodar duas vezes, ou numa base já migrada, não tem
 * efeito. As credenciais do usuário "dono" vêm de env, com um default de dev
 * (impresso no fim, para quem rodou poder logar e ver a base antiga).
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { loadRootEnv } from "./env";

loadRootEnv();

const BCRYPT_COST = 12;

/**
 * `userId` já é obrigatório no `schema.prisma` (a migration final já rodou
 * neste checkout), então o Prisma Client gerado não aceita mais `{userId:
 * null}` num `where` tipado — o próprio TypeScript já não modela o estado
 * transitório que este script existe para corrigir. Por isso a detecção e a
 * atribuição usam SQL cru: é o único jeito de perguntar "sobrou alguma linha
 * NULL?" depois que o tipo gerado passou a dizer que isso não pode acontecer.
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    const [{ count: orfaosPessoas }] = await prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM people WHERE "userId" IS NULL`;
    const [{ count: orfaosLocais }] = await prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM locations WHERE "userId" IS NULL`;

    if (orfaosPessoas === 0n && orfaosLocais === 0n) {
      console.log("✓ nada para atribuir — toda Person/Location já tem dono");
      return;
    }

    const email = process.env.LEGACY_OWNER_EMAIL ?? "dono@kindred.local";
    const senhaGerada = randomBytes(9).toString("base64url");
    const senha = process.env.LEGACY_OWNER_PASSWORD ?? senhaGerada;

    let dono = await prisma.user.findUnique({ where: { email } });
    if (!dono) {
      dono = await prisma.user.create({
        data: {
          name: "Dono original",
          email,
          passwordHash: await bcrypt.hash(senha, BCRYPT_COST),
        },
      });
      console.log(`✓ criado o usuário dono (${email})`);
    } else {
      console.log(`✓ reaproveitando o usuário dono já existente (${email})`);
    }

    const pessoas = await prisma.$executeRaw`
      UPDATE people SET "userId" = ${dono.id} WHERE "userId" IS NULL
    `;
    const locais = await prisma.$executeRaw`
      UPDATE locations SET "userId" = ${dono.id} WHERE "userId" IS NULL
    `;

    console.log(`✓ atribuídas ${pessoas} pessoa(s) e ${locais} local(is) a ${email}`);
    if (!process.env.LEGACY_OWNER_PASSWORD) {
      console.log(`  senha gerada (guarde agora, não é mostrada de novo): ${senha}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
