import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

// Campos públicos só — `userId` é dono de linha, não algo que o web precisa
// ver (BL-10). Um `select` explícito, e não um helper de desestruturação: o
// modelo é pequeno o bastante para isto ser mais simples que o inverso.
const SELECT = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateLocationDto, userId: string) {
    return this.prisma.location.create({
      data: { ...dto, userId },
      select: SELECT,
    });
  }

  findAll(userId: string) {
    return this.prisma.location.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      select: SELECT,
    });
  }

  async findOne(id: string, userId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, userId },
      select: SELECT,
    });
    if (!location) throw new NotFoundException(`Local "${id}" não encontrado`);
    return location;
  }

  async update(id: string, dto: UpdateLocationDto, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.location.update({
      where: { id },
      data: dto,
      select: SELECT,
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.location.delete({ where: { id }, select: SELECT });
  }
}
