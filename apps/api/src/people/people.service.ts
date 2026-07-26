import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { computeKinship } from './kinship.util';
import { FindPeopleQueryDto } from './dto/find-people-query.dto';

const INCLUDE = { father: true, mother: true, location: true } as const;
const RELATIONSHIP_LABELS: Record<string, string> = {
  FAMILY: 'Família',
  WIFE: 'Esposa',
  FRIEND: 'Amigo',
  ACQUAINTANCE: 'Conhecido',
  OTHER: 'Outro',
};

function normalizeNullableUuid(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePersonDto) {
    if (dto.isCentralUser) {
      const existing = await this.prisma.person.findFirst({
        where: { isCentralUser: true },
      });
      if (existing)
        throw new BadRequestException(
          'Já existe uma pessoa central cadastrada',
        );
    }

    return this.prisma.person.create({
      data: {
        name: dto.name,
        sex: dto.sex ?? null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        deathDate: dto.deathDate ? new Date(dto.deathDate) : null,
        deceased: dto.deathDate ? true : (dto.deceased ?? false),
        profilePhoto: dto.profilePhoto ?? null,
        relationshipType: dto.relationshipType,
        isCentralUser: dto.isCentralUser ?? false,
        fatherId: normalizeNullableUuid(dto.fatherId),
        motherId: normalizeNullableUuid(dto.motherId),
        locationId: normalizeNullableUuid(dto.locationId),
      },
      include: INCLUDE,
    });
  }

  async findAll(query?: FindPeopleQueryDto) {
    const people = await this.prisma.person.findMany({
      orderBy: { name: 'asc' },
      include: INCLUDE,
    });

    const central = people.find((p) => p.isCentralUser);

    const enriched = people.map((p) => ({
      ...p,
      kinshipDegree: p.isCentralUser
        ? 'Você'
        : central
          ? computeKinship(p.id, central.id, people)
          : null,
    }));

    const hasPaginationRequest = Boolean(
      query?.page ||
      query?.limit ||
      query?.search?.trim() ||
      query?.sortBy ||
      query?.sortDirection,
    );
    if (!hasPaginationRequest) return enriched;

    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;
    const search = query?.search?.trim().toLocaleLowerCase('pt-BR');
    const sortBy = query?.sortBy ?? 'name';
    const sortDirection = query?.sortDirection ?? 'asc';
    const direction = sortDirection === 'asc' ? 1 : -1;

    const filtered = search
      ? enriched.filter((person) => {
          const name = person.name.toLocaleLowerCase('pt-BR');
          const kinship = (person.kinshipDegree ?? '').toLocaleLowerCase(
            'pt-BR',
          );
          const relationship = (
            RELATIONSHIP_LABELS[person.relationshipType] ?? ''
          ).toLocaleLowerCase('pt-BR');
          return (
            name.includes(search) ||
            kinship.includes(search) ||
            relationship.includes(search)
          );
        })
      : enriched;

    const sorted = [...filtered].sort((a, b) => {
      const aDead = a.deceased || Boolean(a.deathDate);
      const bDead = b.deceased || Boolean(b.deathDate);
      if (aDead !== bDead) return aDead ? 1 : -1;

      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'pt-BR') * direction;
      }

      if (sortBy === 'birthDate') {
        const aHasBirthDate = Boolean(a.birthDate);
        const bHasBirthDate = Boolean(b.birthDate);
        if (aHasBirthDate !== bHasBirthDate) return aHasBirthDate ? -1 : 1;

        const aTime = a.birthDate ? new Date(a.birthDate).getTime() : 0;
        const bTime = b.birthDate ? new Date(b.birthDate).getTime() : 0;
        if (aTime !== bTime) return (aTime - bTime) * direction;
        return a.name.localeCompare(b.name, 'pt-BR');
      }

      const aHasBirthDate = Boolean(a.birthDate);
      const bHasBirthDate = Boolean(b.birthDate);
      if (aHasBirthDate !== bHasBirthDate) return aHasBirthDate ? -1 : 1;

      const now = Date.now();
      const aAgeMs = now - new Date(a.birthDate!).getTime();
      const bAgeMs = now - new Date(b.birthDate!).getTime();
      if (aAgeMs !== bAgeMs) return (aAgeMs - bAgeMs) * direction;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    const total = sorted.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / limit);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const data = sorted.slice(start, start + limit);

    return {
      data,
      total,
      page: safePage,
      limit,
      totalPages,
    };
  }

  async findCentral() {
    return this.prisma.person.findFirst({ where: { isCentralUser: true } });
  }

  async findOne(id: string) {
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!person) throw new NotFoundException(`Pessoa "${id}" não encontrada`);

    if (person.isCentralUser) return { ...person, kinshipDegree: 'Você' };

    const [central, all] = await Promise.all([
      this.prisma.person.findFirst({ where: { isCentralUser: true } }),
      this.prisma.person.findMany({
        select: { id: true, fatherId: true, motherId: true },
      }),
    ]);

    return {
      ...person,
      kinshipDegree: central ? computeKinship(id, central.id, all) : null,
    };
  }

  async update(id: string, dto: UpdatePersonDto) {
    await this.findOne(id);
    const resolvedDeceased =
      dto.deathDate !== undefined ? Boolean(dto.deathDate) : dto.deceased;

    return this.prisma.person.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sex !== undefined && { sex: dto.sex ?? null }),
        ...(dto.birthDate !== undefined && {
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        }),
        ...(dto.deathDate !== undefined && {
          deathDate: dto.deathDate ? new Date(dto.deathDate) : null,
        }),
        ...(resolvedDeceased !== undefined && { deceased: resolvedDeceased }),
        ...(dto.profilePhoto !== undefined && {
          profilePhoto: dto.profilePhoto ?? null,
        }),
        ...(dto.relationshipType !== undefined && {
          relationshipType: dto.relationshipType,
        }),
        ...(dto.fatherId !== undefined && {
          fatherId: normalizeNullableUuid(dto.fatherId),
        }),
        ...(dto.motherId !== undefined && {
          motherId: normalizeNullableUuid(dto.motherId),
        }),
        ...(dto.locationId !== undefined && {
          locationId: normalizeNullableUuid(dto.locationId),
        }),
      },
      include: INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.person.delete({ where: { id } });
  }
}
