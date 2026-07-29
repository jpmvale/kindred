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

  export(userId: string) {
    return buildBackupPayload(this.prisma, { kind: 'user', userId });
  }

  /**
   * Restaura o que veio no arquivo, **só na conta de quem pediu** (BL-10). Sem
   * `force`, recusa se já houver dados dessa conta — misturar duas árvores pelo
   * id não faz sentido nenhum. Com `force`, apaga e restaura na **mesma
   * transação** (RN-021): ou a conta fica com a árvore nova inteira, ou
   * continua exatamente como estava — nunca pela metade, e nunca tocando os
   * dados de outra conta.
   */
  async restore(raw: unknown, force: boolean, userId: string) {
    const arquivo = this.parse(raw);
    const existing = await this.prisma.person.count({ where: { userId } });

    if (existing > 0 && !force) {
      throw new ConflictException(
        `Sua conta já tem ${existing} pessoa(s). Restaurar por cima misturaria as duas árvores — confirme para apagar antes.`,
      );
    }

    const scope = { kind: 'user' as const, userId };
    const ops: Prisma.PrismaPromise<unknown>[] =
      existing > 0
        ? [
            this.prisma.union.deleteMany({ where: { partnerA: { userId } } }),
            this.prisma.person.deleteMany({ where: { userId } }),
            this.prisma.location.deleteMany({ where: { userId } }),
            ...buildRestoreOperations(this.prisma, arquivo, scope),
          ]
        : buildRestoreOperations(this.prisma, arquivo, scope);

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
