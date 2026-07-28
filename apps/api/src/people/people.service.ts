import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Person, UnionStatus } from '@kindred/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { computeKinship } from './kinship.util';
import { normalizeForSearch } from './search.util';
import { MAX_PHOTO_BYTES, matchesMimeType } from './photo.util';
import { UploadPhotoDto } from './dto/upload-photo.dto';
import { FindPeopleQueryDto } from './dto/find-people-query.dto';

const INCLUDE = {
  father: true,
  mother: true,
  location: true,
  unionsAsA: { include: { partnerB: true } },
  unionsAsB: { include: { partnerA: true } },
  // Só a data: os bytes moram na mesma tabela e não têm o que fazer numa listagem
  // de pessoas (ADR-011).
  photo: { select: { updatedAt: true } },
} as const;

const RELATIONSHIP_LABELS: Record<string, string> = {
  FAMILY: 'Família',
  FRIEND: 'Amigo',
  ACQUAINTANCE: 'Conhecido',
  OTHER: 'Outro',
};

function normalizeNullableUuid(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

type UnionFields = {
  id: string;
  status: UnionStatus;
  startDate: Date | null;
  endDate: Date | null;
};

type PersonWithUnionSides = {
  unionsAsA: (UnionFields & { partnerBId: string; partnerB: Person })[];
  unionsAsB: (UnionFields & { partnerAId: string; partnerA: Person })[];
  photo?: { updatedAt: Date } | null;
};

/**
 * A tabela guarda a união com dois lados (`partnerA`/`partnerB`) porque é assim que
 * o Postgres a representa, mas quem consome quer uma lista só: "as uniões desta
 * pessoa, e quem é o par em cada uma". A conversão acontece aqui, na borda.
 *
 * A foto passa pelo mesmo lugar: vira só a data em que foi enviada — que diz se
 * existe foto e serve de desempate de cache no navegador (ADR-011).
 */
function withUnions<T extends PersonWithUnionSides>({
  unionsAsA,
  unionsAsB,
  photo,
  ...person
}: T) {
  return {
    ...person,
    photoUpdatedAt: photo?.updatedAt ?? null,
    unions: [
      ...unionsAsA.map(({ partnerBId, partnerB, ...union }) => ({
        ...union,
        partnerId: partnerBId,
        partner: partnerB,
      })),
      ...unionsAsB.map(({ partnerAId, partnerA, ...union }) => ({
        ...union,
        partnerId: partnerAId,
        partner: partnerA,
      })),
    ],
  };
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

    const created = await this.prisma.person.create({
      data: {
        name: dto.name,
        sex: dto.sex ?? null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        deathDate: dto.deathDate ? new Date(dto.deathDate) : null,
        deceased: dto.deathDate ? true : (dto.deceased ?? false),
        relationshipType: dto.relationshipType,
        isCentralUser: dto.isCentralUser ?? false,
        notes: dto.notes ?? null,
        fatherId: normalizeNullableUuid(dto.fatherId),
        motherId: normalizeNullableUuid(dto.motherId),
        locationId: normalizeNullableUuid(dto.locationId),
      },
      include: INCLUDE,
    });

    return withUnions(created);
  }

  async findAll(query?: FindPeopleQueryDto) {
    const [people, unions] = await Promise.all([
      this.prisma.person.findMany({
        orderBy: { name: 'asc' },
        include: INCLUDE,
      }),
      this.prisma.union.findMany({
        select: { partnerAId: true, partnerBId: true, status: true },
      }),
    ]);

    const central = people.find((p) => p.isCentralUser);

    const enriched = people.map((p) => ({
      ...withUnions(p),
      kinshipDegree: p.isCentralUser
        ? 'Você'
        : central
          ? computeKinship(p.id, central.id, people, unions)
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
    const rawSearch = query?.search?.trim();
    const search = rawSearch ? normalizeForSearch(rawSearch) : undefined;
    const sortBy = query?.sortBy ?? 'name';
    const sortDirection = query?.sortDirection ?? 'asc';
    const direction = sortDirection === 'asc' ? 1 : -1;

    const filtered = search
      ? enriched.filter((person) => {
          const name = normalizeForSearch(person.name);
          const kinship = normalizeForSearch(person.kinshipDegree ?? '');
          const relationship = normalizeForSearch(
            RELATIONSHIP_LABELS[person.relationshipType] ?? '',
          );
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

    if (person.isCentralUser)
      return { ...withUnions(person), kinshipDegree: 'Você' };

    const [central, all, unions] = await Promise.all([
      this.prisma.person.findFirst({ where: { isCentralUser: true } }),
      this.prisma.person.findMany({
        select: { id: true, fatherId: true, motherId: true, sex: true },
      }),
      this.prisma.union.findMany({
        select: { partnerAId: true, partnerBId: true, status: true },
      }),
    ]);

    return {
      ...withUnions(person),
      kinshipDegree: central
        ? computeKinship(id, central.id, all, unions)
        : null,
    };
  }

  async update(id: string, dto: UpdatePersonDto) {
    await this.findOne(id);
    const resolvedDeceased =
      dto.deathDate !== undefined ? Boolean(dto.deathDate) : dto.deceased;

    const updated = await this.prisma.person.update({
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
        ...(dto.relationshipType !== undefined && {
          relationshipType: dto.relationshipType,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
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

    return withUnions(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    // A foto vai junto pela cascata do banco (ADR-011): não sobra órfão.
    return this.prisma.person.delete({ where: { id } });
  }

  /**
   * Passa o posto de pessoa central para outra pessoa (RN-018).
   *
   * Não é criar uma segunda — é **transferir**: o antigo central vira uma pessoa
   * comum no mesmo movimento. Por isso as duas escritas vão na mesma transação,
   * e nesta ordem: tirar de quem tem antes de dar a quem vai receber. Um instante
   * com dois centrais quebraria o cálculo de parentesco, que procura um só.
   */
  async setCentral(id: string) {
    const alvo = await this.prisma.person.findUnique({
      where: { id },
      select: { isCentralUser: true },
    });
    if (!alvo) throw new NotFoundException(`Pessoa "${id}" não encontrada`);
    if (alvo.isCentralUser) return this.findOne(id);

    await this.prisma.$transaction([
      this.prisma.person.updateMany({
        where: { isCentralUser: true },
        data: { isCentralUser: false },
      }),
      this.prisma.person.update({
        where: { id },
        data: { isCentralUser: true },
      }),
    ]);

    return this.findOne(id);
  }

  // ─── Foto de perfil (ADR-011, RN-017) ──────────────────────────────────────

  async savePhoto(id: string, dto: UploadPhotoDto) {
    await this.ensureExists(id);

    const bytes = Buffer.from(dto.data, 'base64');
    if (bytes.length === 0)
      throw new BadRequestException('A imagem enviada está vazia');
    if (bytes.length > MAX_PHOTO_BYTES)
      throw new BadRequestException(
        `A imagem passa de ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB`,
      );
    if (!matchesMimeType(bytes, dto.mimeType))
      throw new BadRequestException(
        'O conteúdo do arquivo não corresponde ao tipo declarado',
      );

    const saved = await this.prisma.personPhoto.upsert({
      where: { personId: id },
      create: { personId: id, bytes, mimeType: dto.mimeType },
      update: { bytes, mimeType: dto.mimeType },
      select: { updatedAt: true },
    });

    return { photoUpdatedAt: saved.updatedAt };
  }

  /** Os bytes em si. Só a rota da foto chama isto. */
  async findPhoto(id: string) {
    const photo = await this.prisma.personPhoto.findUnique({
      where: { personId: id },
    });
    if (!photo) throw new NotFoundException(`Pessoa "${id}" não tem foto`);
    return photo;
  }

  async removePhoto(id: string) {
    await this.ensureExists(id);
    const deleted = await this.prisma.personPhoto.deleteMany({
      where: { personId: id },
    });
    if (deleted.count === 0)
      throw new NotFoundException(`Pessoa "${id}" não tem foto`);
    return { photoUpdatedAt: null };
  }

  /** Existe? — sem arrastar parentesco nem uniões, que a foto não usa. */
  private async ensureExists(id: string) {
    const person = await this.prisma.person.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!person) throw new NotFoundException(`Pessoa "${id}" não encontrada`);
  }
}
