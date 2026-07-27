import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UnionStatus } from '@kindred/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnionDto } from './dto/create-union.dto';
import { UpdateUnionDto } from './dto/update-union.dto';

const INCLUDE = { partnerA: true, partnerB: true } as const;

/**
 * A união é simétrica, mas a tabela tem dois lados. Gravar sempre o menor id em
 * `partnerAId` faz (A,B) e (B,A) caírem na mesma linha, e é o que dá sentido ao
 * índice único do par (RN-011).
 */
function normalizePair(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

@Injectable()
export class UnionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUnionDto) {
    const [partnerAId, partnerBId] = normalizePair(
      dto.partnerAId,
      dto.partnerBId,
    );

    if (partnerAId === partnerBId)
      throw new BadRequestException('Uma pessoa não pode se unir a si mesma');

    const people = await this.prisma.person.findMany({
      where: { id: { in: [partnerAId, partnerBId] } },
      select: { id: true },
    });
    if (people.length !== 2)
      throw new NotFoundException('Uma das pessoas da união não existe');

    const duplicate = await this.prisma.union.findUnique({
      where: { partnerAId_partnerBId: { partnerAId, partnerBId } },
    });
    if (duplicate)
      throw new BadRequestException('Essas duas pessoas já têm uma união');

    const status = dto.status ?? UnionStatus.CURRENT;
    if (status === UnionStatus.CURRENT) {
      await this.assertNoCurrentUnion([partnerAId, partnerBId]);
    }

    return this.prisma.union.create({
      data: {
        partnerAId,
        partnerBId,
        status,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
      include: INCLUDE,
    });
  }

  findAll() {
    return this.prisma.union.findMany({ include: INCLUDE });
  }

  async findOne(id: string) {
    const union = await this.prisma.union.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!union) throw new NotFoundException(`União "${id}" não encontrada`);
    return union;
  }

  async update(id: string, dto: UpdateUnionDto) {
    const union = await this.findOne(id);

    if (dto.status === UnionStatus.CURRENT && union.status !== dto.status) {
      await this.assertNoCurrentUnion(
        [union.partnerAId, union.partnerBId],
        union.id,
      );
    }

    return this.prisma.union.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.startDate !== undefined && {
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        }),
        ...(dto.endDate !== undefined && {
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        }),
      },
      include: INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.union.delete({ where: { id } });
  }

  /** RN-014: no máximo uma união vigente por pessoa. */
  private async assertNoCurrentUnion(personIds: string[], exceptId?: string) {
    const current = await this.prisma.union.findFirst({
      where: {
        status: UnionStatus.CURRENT,
        ...(exceptId && { id: { not: exceptId } }),
        OR: [
          { partnerAId: { in: personIds } },
          { partnerBId: { in: personIds } },
        ],
      },
      include: INCLUDE,
    });

    if (!current) return;

    const alreadyTaken = personIds.includes(current.partnerAId)
      ? current.partnerA
      : current.partnerB;
    throw new BadRequestException(
      `${alreadyTaken.name} já tem uma união vigente; encerre-a antes de registrar outra`,
    );
  }
}
