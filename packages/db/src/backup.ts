/*
 * `db:backup` — copia o banco inteiro para um arquivo JSON fora do repositório.
 *
 *   pnpm db:backup                  # grava em ../kindred-backups
 *   KINDRED_BACKUP_DIR=/outro pnpm db:backup
 *
 * Por que JSON e não `pg_dump`: o `pg_dump` mora no container do Postgres, então
 * depende do Docker de pé — e é justamente o Docker que se quer sobreviver. O
 * JSON sai pelo Prisma, é legível, e restaura em qualquer Postgres com as
 * migrations aplicadas (ADR-013).
 *
 * O arquivo guarda os **ids originais**: restaurar devolve o mesmo grafo de
 * pai/mãe e as mesmas uniões, não uma cópia parecida.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { loadRootEnv } from "./env";

loadRootEnv();

/** Versão do formato: o restore recusa o que não souber ler. */
export const BACKUP_FORMAT = 1;

/** Modelos que compõem um backup completo, na ordem em que precisam ser gravados. */
const MODELS = ["Location", "Person", "Union", "PersonPhoto"] as const;

export function backupDir(): string {
  if (process.env.KINDRED_BACKUP_DIR) return process.env.KINDRED_BACKUP_DIR;
  // Irmão do repositório, nunca dentro: um `git clean -xfd` não leva junto.
  return resolve(__dirname, "..", "..", "..", "..", "kindred-backups");
}

function timestamp(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}` +
    `-${p(agora.getHours())}${p(agora.getMinutes())}`
  );
}

/**
 * Confere que o backup carrega **todo** campo escalar de cada modelo, cobrando do
 * schema em vez da memória de quem mexeu. Um campo novo no `schema.prisma` que
 * ninguém lembrou de exportar derruba o backup aqui — barulhento e na hora — em
 * vez de sumir em silêncio e só aparecer na restauração, quando já é tarde.
 */
export function assertCoverage(dados: Record<string, unknown[]>): void {
  const faltando: string[] = [];

  for (const modelo of MODELS) {
    const meta = Prisma.dmmf.datamodel.models.find((m) => m.name === modelo);
    if (!meta) throw new Error(`modelo "${modelo}" não existe no schema`);

    const escalares = meta.fields
      .filter((f) => f.kind === "scalar" || f.kind === "enum")
      .map((f) => f.name);

    const linhas = dados[modelo] ?? [];
    // Sem linha nenhuma não há o que conferir — um banco vazio é backup válido.
    if (!linhas.length) continue;

    const presentes = new Set(Object.keys(linhas[0] as object));
    for (const campo of escalares) {
      if (!presentes.has(campo)) faltando.push(`${modelo}.${campo}`);
    }
  }

  if (faltando.length) {
    throw new Error(
      `o backup não cobre ${faltando.length} campo(s) do schema: ${faltando.join(", ")}.\n` +
        `Inclua-os em backup.ts (e no restore.ts) antes de gerar um arquivo incompleto.`,
    );
  }
}

export async function collect(prisma: PrismaClient) {
  const [locations, people, unions, photos] = await Promise.all([
    prisma.location.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.person.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.union.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.personPhoto.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return {
    Location: locations,
    Person: people,
    Union: unions,
    // Bytes não cabem em JSON: viram base64, e o restore desfaz.
    PersonPhoto: photos.map((foto) => ({
      ...foto,
      bytes: Buffer.from(foto.bytes).toString("base64"),
    })),
  };
}

export async function createBackup(prisma: PrismaClient, destino?: string) {
  const dados = await collect(prisma);
  assertCoverage(dados as unknown as Record<string, unknown[]>);

  const conteudo = {
    formato: BACKUP_FORMAT,
    geradoEm: new Date().toISOString(),
    contagem: Object.fromEntries(
      Object.entries(dados).map(([modelo, linhas]) => [modelo, linhas.length]),
    ),
    dados,
  };

  const dir = destino ?? backupDir();
  mkdirSync(dir, { recursive: true });
  const arquivo = join(dir, `kindred-${timestamp()}.json`);
  writeFileSync(arquivo, JSON.stringify(conteudo, null, 2), "utf-8");

  return { arquivo, contagem: conteudo.contagem };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const { arquivo, contagem } = await createBackup(prisma);
    const resumo = Object.entries(contagem)
      .map(([modelo, n]) => `${n} ${modelo}`)
      .join(", ");
    console.log(`✓ backup gravado em ${arquivo}`);
    console.log(`  ${resumo}`);
    console.log(`  restaurar: pnpm db:restore "${arquivo}"`);
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
