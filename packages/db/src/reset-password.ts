/*
 * `db:reset-password` — redefine a senha de uma conta sem passar pela
 * aplicação (BL-17). Existe porque não há infraestrutura de e-mail no
 * projeto: a conta real usa `dono@kindred.local`, um domínio que não tem
 * caixa de entrada nenhuma por trás, então o fluxo clássico de "recuperar
 * senha por e-mail" não se sustentaria. Quem tem acesso ao servidor (onde já
 * confia em quem roda migration e restaura backup) também consegue redefinir
 * a senha — é o mesmo nível de acesso que hoje faria isso com um `UPDATE`
 * escrito na mão, só que sem risco de errar o hash.
 *
 *   pnpm db:reset-password <email> [senha-nova]
 *
 * Sem a senha no segundo argumento, uma é gerada e impressa uma vez só — como
 * o `db:backfill-owner`. Redefinir a senha derruba **todas** as sessões da
 * conta: diferente da troca pela própria tela (BL-16, RN-025), aqui não há
 * "sessão de quem pediu" para preservar — é sempre alguém de fora da conta,
 * agindo pelo servidor.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { loadRootEnv } from "./env";

loadRootEnv();

const BCRYPT_COST = 12;

type PrismaParaReset = {
  user: {
    findUnique: (args: {
      where: { email: string };
    }) => Promise<{ id: string } | null>;
    update: (args: {
      where: { id: string };
      data: { passwordHash: string };
    }) => Promise<unknown>;
  };
  session: {
    deleteMany: (args: {
      where: { userId: string };
    }) => Promise<{ count: number }>;
  };
};

export async function resetPassword(
  prisma: PrismaParaReset,
  email: string,
  passwordHash: string,
): Promise<{ userId: string; sessoesEncerradas: number }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Nenhuma conta com o e-mail ${email}`);

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  const { count } = await prisma.session.deleteMany({
    where: { userId: user.id },
  });

  return { userId: user.id, sessoesEncerradas: count };
}

async function main() {
  const email = process.argv[2];
  const senhaInformada = process.argv[3];

  if (!email || email.startsWith("--")) {
    console.error("uso: pnpm db:reset-password <email> [senha-nova]");
    process.exit(1);
  }

  const senhaGerada = randomBytes(9).toString("base64url");
  const senha = senhaInformada ?? senhaGerada;

  const prisma = new PrismaClient();
  try {
    const { sessoesEncerradas } = await resetPassword(
      prisma,
      email,
      await bcrypt.hash(senha, BCRYPT_COST),
    );
    console.log(
      `✓ senha redefinida para ${email} (${sessoesEncerradas} sessão(ões) encerrada(s))`,
    );
    if (!senhaInformada) {
      console.log(`  senha gerada (guarde agora, não é mostrada de novo): ${senha}`);
    }
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
