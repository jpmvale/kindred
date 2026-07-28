import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  buildBackupPayload,
  buildRestoreOperations,
  parseBackupFile,
  Prisma,
  type BackupFile,
} from '@kindred/db';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  export() {
    return buildBackupPayload(this.prisma);
  }

  /**
   * Restaura o que veio no arquivo. Sem `force`, recusa se já houver dados —
   * misturar duas bases pelo id não faz sentido nenhum. Com `force`, apaga e
   * restaura na **mesma transação** (RN-021): ou o banco fica com a base nova
   * inteira, ou continua exatamente como estava — nunca pela metade.
   */
  async restore(raw: unknown, force: boolean) {
    const arquivo = this.parse(raw);
    const existing = await this.prisma.person.count();

    if (existing > 0 && !force) {
      throw new ConflictException(
        `O banco já tem ${existing} pessoa(s). Restaurar por cima misturaria as duas bases — confirme para apagar antes.`,
      );
    }

    const ops: Prisma.PrismaPromise<unknown>[] =
      existing > 0
        ? [
            this.prisma.union.deleteMany(),
            this.prisma.person.deleteMany(),
            this.prisma.location.deleteMany(),
            ...buildRestoreOperations(this.prisma, arquivo),
          ]
        : buildRestoreOperations(this.prisma, arquivo);

    if (ops.length) await this.prisma.$transaction(ops);

    return {
      Location: arquivo.dados.Location.length,
      Person: arquivo.dados.Person.length,
      Union: arquivo.dados.Union.length,
      PersonPhoto: arquivo.dados.PersonPhoto.length,
    };
  }

  private parse(raw: unknown): BackupFile {
    try {
      return parseBackupFile(raw);
    } catch (erro) {
      throw new BadRequestException(
        erro instanceof Error ? erro.message : 'Arquivo de backup inválido',
      );
    }
  }
}
