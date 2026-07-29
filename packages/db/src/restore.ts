/*
 * `db:restore` — devolve ao banco um arquivo gerado pelo `db:backup`.
 *
 *   pnpm db:restore ../kindred-backups/kindred-20260728-0047.json
 *   pnpm db:restore <arquivo> --force   # apaga o que existe antes
 *
 * Exige as migrations já aplicadas (`pnpm db:migrate`): o arquivo tem dados, não
 * schema. Como guarda os ids originais, o grafo de pai/mãe e as uniões voltam
 * idênticos — não é uma cópia parecida, é a mesma base.
 *
 * A ordem de gravação segue as referências: locais, depois pessoas sem pai/mãe
 * apontado, depois a filiação, depois uniões e fotos. Pessoas entram antes de se
 * apontarem umas às outras porque o pai pode estar depois do filho no arquivo.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { BACKUP_FORMAT, createBackup, type BackupScope } from "./backup";
import { loadRootEnv } from "./env";

loadRootEnv();

/**
 * Resolve o caminho contra o diretório de onde o comando foi chamado, não contra
 * `packages/db` — que é onde o `pnpm --filter` acaba executando. Sem isto,
 * `pnpm db:restore ./backup.json` na raiz do repo não acha o arquivo, e o erro
 * aparece justamente na hora em que se está tentando recuperar alguma coisa.
 */
function fromCallerCwd(caminho: string): string {
  if (isAbsolute(caminho)) return caminho;
  return resolve(process.env.INIT_CWD ?? process.cwd(), caminho);
}

export type BackupFile = {
  formato: number;
  geradoEm: string;
  contagem: Record<string, number>;
  dados: {
    Location: Record<string, unknown>[];
    Person: Record<string, unknown>[];
    Union: Record<string, unknown>[];
    PersonPhoto: Record<string, unknown>[];
    /**
     * Ausente num backup de verdade (`db:backup`/`GET /api/backup`) — conta já
     * existe em ambos os lados de um backup real, então `User` nunca precisa
     * viajar. Só o fixture anônimo (`db:anonymize`) embute um dono sintético
     * aqui, porque o destino dele é um banco **vazio**, sem conta nenhuma
     * ainda, e `Person.userId`/`Location.userId` exigem uma linha em `users`
     * para a FK fechar.
     */
    User?: Record<string, unknown>[];
  };
};

const data = (valor: unknown) => (valor ? new Date(valor as string) : null);

/**
 * Confere que um valor já desserializado é um backup válido — usado tanto pelo
 * CLI (depois de ler o arquivo) quanto pela API (o corpo do upload já chega
 * como objeto, sem passar por disco).
 */
export function parseBackupFile(raw: unknown): BackupFile {
  const arquivo = raw as BackupFile;

  if (arquivo?.formato !== BACKUP_FORMAT) {
    throw new Error(
      `formato ${arquivo?.formato} não é o desta versão (${BACKUP_FORMAT}).`,
    );
  }
  if (!arquivo.dados?.Person) {
    throw new Error("arquivo sem a seção de pessoas — não é um backup do kindred.");
  }
  return arquivo;
}

export function readBackupFile(caminho: string): BackupFile {
  return parseBackupFile(
    JSON.parse(readFileSync(fromCallerCwd(caminho), "utf-8")),
  );
}

/**
 * Monta as operações de restauração **sem executá-las** — cada `create`/`update`
 * do Prisma é uma promessa preguiçosa, que só roda dentro do `$transaction` que
 * as recebe. É o mesmo formato batch que `setCentral` já usa em
 * `people.service.ts`: a ordem do array é a ordem de execução, tudo numa
 * transação só, sem precisar do resultado de uma operação para montar a
 * próxima — os ids já vêm prontos do arquivo.
 */
export function buildRestoreOperations(
  prisma: PrismaClient,
  arquivo: BackupFile,
  scope: BackupScope,
): Prisma.PrismaPromise<unknown>[] {
  const { Location, Person, Union, PersonPhoto } = arquivo.dados;
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  // O dono de cada linha recriada é sempre quem está restaurando — nunca o
  // `userId` do arquivo (se houver: arquivos de antes do BL-10 não têm). Isso
  // não é um bug a "corrigir": é o que impede um arquivo de outra conta de
  // vazar para a conta errada, mesmo que alguém tente restaurá-lo aqui. Para
  // `{kind:'all'}` (só o CLI), o próprio arquivo já tem o `userId` de cada
  // linha, então não há o que forçar.
  const ownerId = scope.kind === "user" ? scope.userId : undefined;

  for (const usuario of arquivo.dados.User ?? []) {
    ops.push(
      prisma.user.create({
        data: {
          id: usuario.id as string,
          name: usuario.name as string,
          email: usuario.email as string,
          passwordHash: usuario.passwordHash as string,
          createdAt: data(usuario.createdAt)!,
          updatedAt: data(usuario.updatedAt)!,
        },
      }),
    );
  }

  for (const local of Location) {
    ops.push(
      prisma.location.create({
        data: {
          id: local.id as string,
          name: local.name as string,
          userId: ownerId ?? (local.userId as string),
          createdAt: data(local.createdAt)!,
          updatedAt: data(local.updatedAt)!,
        },
      }),
    );
  }

  // Primeira volta sem filiação: o pai pode vir depois do filho no arquivo.
  for (const pessoa of Person) {
    ops.push(
      prisma.person.create({
        data: {
          id: pessoa.id as string,
          name: pessoa.name as string,
          userId: ownerId ?? (pessoa.userId as string),
          sex: pessoa.sex as never,
          birthDate: data(pessoa.birthDate),
          deathDate: data(pessoa.deathDate),
          deceased: pessoa.deceased as boolean,
          relationshipType: pessoa.relationshipType as never,
          isCentralUser: pessoa.isCentralUser as boolean,
          notes: (pessoa.notes as string | null) ?? null,
          locationId: (pessoa.locationId as string | null) ?? null,
          createdAt: data(pessoa.createdAt)!,
          updatedAt: data(pessoa.updatedAt)!,
        },
      }),
    );
  }

  // Segunda volta: agora todo mundo existe e a filiação pode ser fechada.
  for (const pessoa of Person) {
    if (!pessoa.fatherId && !pessoa.motherId) continue;
    ops.push(
      prisma.person.update({
        where: { id: pessoa.id as string },
        data: {
          fatherId: (pessoa.fatherId as string | null) ?? null,
          motherId: (pessoa.motherId as string | null) ?? null,
          // O `@updatedAt` mexeria no timestamp; devolve o do arquivo.
          updatedAt: data(pessoa.updatedAt)!,
        },
      }),
    );
  }

  for (const uniao of Union) {
    ops.push(
      prisma.union.create({
        data: {
          id: uniao.id as string,
          partnerAId: uniao.partnerAId as string,
          partnerBId: uniao.partnerBId as string,
          status: uniao.status as never,
          startDate: data(uniao.startDate),
          endDate: data(uniao.endDate),
          createdAt: data(uniao.createdAt)!,
          updatedAt: data(uniao.updatedAt)!,
        },
      }),
    );
  }

  for (const foto of PersonPhoto) {
    ops.push(
      prisma.personPhoto.create({
        data: {
          personId: foto.personId as string,
          bytes: Buffer.from(foto.bytes as string, "base64"),
          mimeType: foto.mimeType as string,
          createdAt: data(foto.createdAt)!,
          updatedAt: data(foto.updatedAt)!,
        },
      }),
    );
  }

  return ops;
}

function countsOf(arquivo: BackupFile) {
  return {
    Location: arquivo.dados.Location.length,
    Person: arquivo.dados.Person.length,
    Union: arquivo.dados.Union.length,
    PersonPhoto: arquivo.dados.PersonPhoto.length,
  };
}

/**
 * Restaura num banco vazio, numa única transação — ou tudo entra, ou nada
 * entra. É a forma batch do `$transaction` (a mesma que `setCentral` usa em
 * `people.service.ts`), cujo teto é o do Postgres, não um número escolhido
 * aqui — generoso o bastante para uma base pessoal (centenas de linhas).
 */
export async function restoreInto(prisma: PrismaClient, arquivo: BackupFile) {
  const ops = buildRestoreOperations(prisma, arquivo, { kind: "all" });
  if (ops.length) await prisma.$transaction(ops);
  return countsOf(arquivo);
}

async function main() {
  const caminho = process.argv[2];
  const force = process.argv.includes("--force");

  if (!caminho || caminho.startsWith("--")) {
    console.error("uso: pnpm db:restore <arquivo.json> [--force]");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const arquivo = readBackupFile(caminho);
    const existente = await prisma.person.count();

    if (existente > 0 && !force) {
      console.error(
        `✗ o banco já tem ${existente} pessoa(s). Restaurar por cima misturaria as duas bases — use --force para apagar antes.`,
      );
      process.exit(1);
    }

    if (existente > 0 && force) {
      // Antes de destruir, guardar: é o caso em que o erro custa mais caro.
      const { arquivo: copia } = await createBackup(prisma);
      console.log(`▶ --force: base atual salva em ${copia}`);
      await prisma.union.deleteMany();
      await prisma.person.deleteMany();
      await prisma.location.deleteMany();
    }

    const contagem = await restoreInto(prisma, arquivo);
    const resumo = Object.entries(contagem)
      .map(([modelo, n]) => `${n} ${modelo}`)
      .join(", ");
    console.log(`✓ restaurado de ${caminho} (backup de ${arquivo.geradoEm})`);
    console.log(`  ${resumo}`);
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
