/*
 * Corta o 1º de janeiro que nunca existiu (ADR-028).
 *
 * Enquanto a data era `DateTime`, quem sabia só o ano de nascimento era
 * cadastrado como **1º de janeiro daquele ano** — o campo não aceitava outra
 * coisa. Agora que a data é parcial (RN-027), esses registros passam a dizer só o
 * ano, que é o que se sabe de verdade.
 *
 *   pnpm db:trim-january-first                       # lista o que faria, sem gravar
 *   pnpm db:trim-january-first --apply               # grava
 *   pnpm db:trim-january-first --keep "Fulano de Tal" --apply
 *
 * **Quem nasceu mesmo em 1º de janeiro fica de fora pelo `--keep`** (repetível, e
 * comparado por nome exato). Distinguir a data real da inventada é decisão de
 * quem conhece a família — o script não adivinha, e por isso não grava nada sem
 * `--apply`.
 */
import { PrismaClient } from "@prisma/client";
import { loadRootEnv } from "./env";

loadRootEnv();

const prisma = new PrismaClient();

/** `1988-01-01` → `1988`; qualquer outra coisa fica como está. */
export function trimJanuaryFirst(value: string | null): string | null {
  if (!value) return value;
  const match = /^(\d{4})-01-01$/.exec(value.trim());
  return match ? match[1] : value;
}

function parseArgs(argv: string[]) {
  const keep: string[] = [];
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") apply = true;
    if (argv[i] === "--keep" && argv[i + 1]) keep.push(argv[++i]);
  }
  return { apply, keep };
}

async function main() {
  const { apply, keep } = parseArgs(process.argv.slice(2));

  const candidatos = await prisma.person.findMany({
    where: { birthDate: { endsWith: "-01-01" } },
    select: { id: true, name: true, birthDate: true },
    orderBy: { name: "asc" },
  });

  const mantidos = candidatos.filter((p) => keep.includes(p.name));
  const alvos = candidatos.filter((p) => !keep.includes(p.name));

  console.log(
    `${candidatos.length} pessoa(s) com nascimento em 1º de janeiro; ${alvos.length} vira(m) só o ano.`,
  );
  for (const pessoa of mantidos) {
    console.log(`  mantido  ${pessoa.name}: ${pessoa.birthDate}`);
  }
  for (const pessoa of alvos) {
    console.log(`  ${apply ? "gravado " : "seria   "} ${pessoa.name}: ${pessoa.birthDate} → ${trimJanuaryFirst(pessoa.birthDate)}`);
  }

  if (!apply) {
    console.log("\nNada gravado. Repita com --apply para valer.");
    return;
  }

  for (const pessoa of alvos) {
    await prisma.person.update({
      where: { id: pessoa.id },
      data: { birthDate: trimJanuaryFirst(pessoa.birthDate) },
    });
  }
  console.log(`\n✓ ${alvos.length} data(s) encurtada(s) para o ano.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
