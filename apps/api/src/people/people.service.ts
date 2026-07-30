import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Person, UnionStatus } from '@kindred/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import {
  computeKinship,
  createKinshipResolver,
  type PersonNode,
} from './kinship.util';
import { normalizeForSearch } from './search.util';
import { MAX_PHOTO_BYTES, matchesMimeType } from './photo.util';
import { UploadPhotoDto } from './dto/upload-photo.dto';
import { FindPeopleQueryDto } from './dto/find-people-query.dto';
import { partialDateSortKey } from './partial-date';

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

/**
 * O mínimo para calcular parentesco (ADR-007/012), buscar e ordenar — sem pai,
 * mãe, local, uniões nem foto. É o que a listagem paginada varre para a base
 * inteira: os includes só são buscados para as poucas linhas que a página mostra
 * (ADR-014).
 */
const LEAN_SELECT = {
  id: true,
  name: true,
  sex: true,
  birthDate: true,
  deathDate: true,
  deceased: true,
  relationshipType: true,
  isCentralUser: true,
  fatherId: true,
  motherId: true,
} as const;

/**
 * O que a árvore, o calendário e os candidatos a pai/mãe/cônjuge realmente usam
 * da chamada **sem paginação** (BL-14): tudo da varredura enxuta, mais notas,
 * foto e uniões — mas sem os objetos aninhados de pai, mãe, local nem parceiro,
 * que nenhum dos três lê (eles olham `fatherId`/`motherId`/`partnerId` e resolvem
 * na própria lista que já têm). Ver ADR-017.
 */
const LIST_SELECT = {
  ...LEAN_SELECT,
  notes: true,
  photo: { select: { updatedAt: true } },
  unionsAsA: {
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      partnerBId: true,
    },
  },
  unionsAsB: {
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      partnerAId: true,
    },
  },
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
  userId?: string;
};

/**
 * A tabela guarda a união com dois lados (`partnerA`/`partnerB`) porque é assim que
 * o Postgres a representa, mas quem consome quer uma lista só: "as uniões desta
 * pessoa, e quem é o par em cada uma". A conversão acontece aqui, na borda.
 *
 * A foto passa pelo mesmo lugar: vira só a data em que foi enviada — que diz se
 * existe foto e serve de desempate de cache no navegador (ADR-011). `userId`
 * também sai aqui — é dono de linha, não algo que o web precisa ver (BL-10).
 */
function withUnions<T extends PersonWithUnionSides>({
  unionsAsA,
  unionsAsB,
  photo,
  userId: _userId,
  ...person
}: T) {
  return {
    ...person,
    photoUpdatedAt: photo?.updatedAt ?? null,
    unions: [
      ...unionsAsA.map(({ partnerBId, partnerB, ...union }) => {
        const { userId: _partnerUserId, ...partner } = partnerB;
        return { ...union, partnerId: partnerBId, partner };
      }),
      ...unionsAsB.map(({ partnerAId, partnerA, ...union }) => {
        const { userId: _partnerUserId, ...partner } = partnerA;
        return { ...union, partnerId: partnerAId, partner };
      }),
    ],
  };
}

type PersonWithUnionRefSides = {
  unionsAsA: (UnionFields & { partnerBId: string })[];
  unionsAsB: (UnionFields & { partnerAId: string })[];
  photo?: { updatedAt: Date } | null;
  userId?: string;
};

/**
 * Mesma normalização de lado do par que `withUnions` (RN-011), mas sem buscar o
 * parceiro por extenso — só `partnerId`. É o que alimenta a chamada sem
 * paginação (`LIST_SELECT`): quem edita uma pessoa específica precisa do nome do
 * parceiro na tela de uniões e passa por `withUnions`; quem só desenha a árvore,
 * o calendário ou os candidatos de um formulário já tem esse nome na própria
 * lista, pelo `partnerId` (ADR-017).
 */
function withUnionRefs<T extends PersonWithUnionRefSides>({
  unionsAsA,
  unionsAsB,
  photo,
  userId: _userId,
  ...person
}: T) {
  return {
    ...person,
    photoUpdatedAt: photo?.updatedAt ?? null,
    unions: [
      ...unionsAsA.map(({ partnerBId, ...union }) => ({
        ...union,
        partnerId: partnerBId,
      })),
      ...unionsAsB.map(({ partnerAId, ...union }) => ({
        ...union,
        partnerId: partnerAId,
      })),
    ],
  };
}

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePersonDto, userId: string) {
    if (dto.isCentralUser) {
      const existing = await this.prisma.person.findFirst({
        where: { isCentralUser: true, userId },
      });
      if (existing)
        throw new BadRequestException(
          'Já existe uma pessoa central cadastrada',
        );
    }

    const fatherId = normalizeNullableUuid(dto.fatherId);
    const motherId = normalizeNullableUuid(dto.motherId);
    const locationId = normalizeNullableUuid(dto.locationId);
    await this.assertPersonIdsOwnedBy(userId, [fatherId, motherId]);
    await this.assertLocationOwnedBy(userId, locationId);

    const created = await this.prisma.person.create({
      data: {
        name: dto.name,
        sex: dto.sex ?? null,
        birthDate: dto.birthDate || null,
        deathDate: dto.deathDate || null,
        deceased: dto.deathDate ? true : (dto.deceased ?? false),
        relationshipType: dto.relationshipType,
        isCentralUser: dto.isCentralUser ?? false,
        notes: dto.notes ?? null,
        userId,
        fatherId,
        motherId,
        locationId,
      },
      include: INCLUDE,
    });

    return withUnions(created);
  }

  async findAll(userId: string, query?: FindPeopleQueryDto) {
    const hasPaginationRequest = Boolean(
      query?.page ||
      query?.limit ||
      query?.search?.trim() ||
      query?.sortBy ||
      query?.sortDirection,
    );

    // Sem paginação, quem chama é a árvore, o calendário ou os candidatos de um
    // formulário — os três querem a base inteira (da conta autenticada), mas
    // nenhum lê pai/mãe/local aninhados nem o parceiro por extenso (BL-14,
    // ADR-017).
    if (!hasPaginationRequest) {
      const [people, unions] = await Promise.all([
        this.prisma.person.findMany({
          where: { userId },
          orderBy: { name: 'asc' },
          select: LIST_SELECT,
        }),
        this.prisma.union.findMany({
          where: { partnerA: { userId } },
          select: { partnerAId: true, partnerBId: true, status: true },
        }),
      ]);

      const kinshipOf = this.kinshipResolverFor(people, unions);
      return people.map((p) => ({
        ...withUnionRefs(p),
        kinshipDegree: kinshipOf(p.id),
      }));
    }

    // Paginado: varre a base **enxuta** da conta (ADR-014). Parentesco precisa
    // do grafo inteiro e a busca casa o grau calculado, então não há como
    // filtrar no SQL — mas dá para não arrastar pai, mãe, local, uniões e foto
    // de todo mundo.
    const [people, unions] = await Promise.all([
      this.prisma.person.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
        select: LEAN_SELECT,
      }),
      this.prisma.union.findMany({
        where: { partnerA: { userId } },
        select: { partnerAId: true, partnerBId: true, status: true },
      }),
    ]);

    const kinshipOf = this.kinshipResolverFor(people, unions);
    const enriched = people.map((p) => ({
      ...p,
      kinshipDegree: kinshipOf(p.id),
    }));

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

        // Chave textual, não `Date`: a data pode ser parcial (RN-027), e
        // `1988` tem de ficar entre `1987-12` e `1988-05` — o que a comparação
        // de string com os campos preenchidos com zero já dá de graça.
        const aKey = partialDateSortKey(a.birthDate);
        const bKey = partialDateSortKey(b.birthDate);
        if (aKey !== bKey) return aKey.localeCompare(bKey) * direction;
        return a.name.localeCompare(b.name, 'pt-BR');
      }

      const aHasBirthDate = Boolean(a.birthDate);
      const bHasBirthDate = Boolean(b.birthDate);
      if (aHasBirthDate !== bHasBirthDate) return aHasBirthDate ? -1 : 1;

      // Mais velho é quem nasceu antes: a mesma chave da ordenação por data,
      // invertida. Sem `Date`, pelo mesmo motivo de lá.
      const aKey = partialDateSortKey(a.birthDate);
      const bKey = partialDateSortKey(b.birthDate);
      if (aKey !== bKey) return bKey.localeCompare(aKey) * direction;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    const total = sorted.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / limit);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const pageRows = sorted.slice(start, start + limit);

    // Só agora os includes, e só para as linhas que a página mostra.
    const data = await this.withIncludes(pageRows, userId);

    return {
      data,
      total,
      page: safePage,
      limit,
      totalPages,
    };
  }

  /**
   * O grafo é percorrido **uma vez** para a lista toda, não uma vez por pessoa
   * (ADR-012). Sem pessoa central não há de onde medir parentesco, e todo mundo
   * responde `null`.
   */
  private kinshipResolverFor(
    people: (PersonNode & { isCentralUser: boolean })[],
    unions: { partnerAId: string; partnerBId: string; status: UnionStatus }[],
  ): (id: string) => string | null {
    const central = people.find((p) => p.isCentralUser);
    if (!central) return () => null;

    return createKinshipResolver(central.id, people, unions);
  }

  /**
   * Busca pai, mãe, local, uniões e foto das pessoas de uma página e devolve na
   * **mesma ordem** que entrou — o `where: { id: { in } }` não promete ordem, e a
   * ordenação já foi decidida sobre a lista enxuta. `userId` aqui é defesa
   * extra: os ids já vieram de uma varredura escopada, mas custa nada reforçar.
   */
  private async withIncludes<
    T extends { id: string; kinshipDegree: string | null },
  >(rows: T[], userId: string) {
    if (!rows.length) return [];

    const full = await this.prisma.person.findMany({
      where: { id: { in: rows.map((r) => r.id) }, userId },
      include: INCLUDE,
    });

    const byId = new Map(full.map((p) => [p.id, p]));
    return rows.flatMap((row) => {
      const person = byId.get(row.id);
      // Sumiu entre as duas consultas (apagada no meio): sai da página em vez de
      // virar um buraco na lista.
      if (!person) return [];
      return [{ ...withUnions(person), kinshipDegree: row.kinshipDegree }];
    });
  }

  async findCentral(userId: string) {
    return this.prisma.person.findFirst({
      where: { isCentralUser: true, userId },
    });
  }

  async findOne(id: string, userId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id, userId },
      include: INCLUDE,
    });
    // 404 tanto para "não existe" quanto para "é de outra conta" — a mesma
    // resposta não denuncia qual dos dois é (BL-10).
    if (!person) throw new NotFoundException(`Pessoa "${id}" não encontrada`);

    if (person.isCentralUser)
      return { ...withUnions(person), kinshipDegree: 'Você' };

    const [central, all, unions] = await Promise.all([
      this.prisma.person.findFirst({ where: { isCentralUser: true, userId } }),
      this.prisma.person.findMany({
        where: { userId },
        select: { id: true, fatherId: true, motherId: true, sex: true },
      }),
      this.prisma.union.findMany({
        where: { partnerA: { userId } },
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

  async update(id: string, dto: UpdatePersonDto, userId: string) {
    await this.findOne(id, userId);
    const resolvedDeceased =
      dto.deathDate !== undefined ? Boolean(dto.deathDate) : dto.deceased;

    const fatherId =
      dto.fatherId !== undefined
        ? normalizeNullableUuid(dto.fatherId)
        : undefined;
    const motherId =
      dto.motherId !== undefined
        ? normalizeNullableUuid(dto.motherId)
        : undefined;
    const locationId =
      dto.locationId !== undefined
        ? normalizeNullableUuid(dto.locationId)
        : undefined;
    await this.assertPersonIdsOwnedBy(userId, [fatherId, motherId]);
    await this.assertLocationOwnedBy(userId, locationId);

    const updated = await this.prisma.person.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sex !== undefined && { sex: dto.sex ?? null }),
        ...(dto.birthDate !== undefined && {
          birthDate: dto.birthDate || null,
        }),
        ...(dto.deathDate !== undefined && {
          deathDate: dto.deathDate || null,
        }),
        ...(resolvedDeceased !== undefined && { deceased: resolvedDeceased }),
        ...(dto.relationshipType !== undefined && {
          relationshipType: dto.relationshipType,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
        ...(fatherId !== undefined && { fatherId }),
        ...(motherId !== undefined && { motherId }),
        ...(locationId !== undefined && { locationId }),
      },
      include: INCLUDE,
    });

    return withUnions(updated);
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
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
  async setCentral(id: string, userId: string) {
    const alvo = await this.prisma.person.findFirst({
      where: { id, userId },
      select: { isCentralUser: true },
    });
    if (!alvo) throw new NotFoundException(`Pessoa "${id}" não encontrada`);
    if (alvo.isCentralUser) return this.findOne(id, userId);

    await this.prisma.$transaction([
      // Escopado à conta — sem o `userId` aqui, isto apagaria o `isCentralUser`
      // de todas as outras contas do banco, não só a de quem está pedindo.
      this.prisma.person.updateMany({
        where: { isCentralUser: true, userId },
        data: { isCentralUser: false },
      }),
      this.prisma.person.update({
        where: { id },
        data: { isCentralUser: true },
      }),
    ]);

    return this.findOne(id, userId);
  }

  // ─── Foto de perfil (ADR-011, RN-017) ──────────────────────────────────────

  async savePhoto(id: string, dto: UploadPhotoDto, userId: string) {
    await this.ensureOwnedBy(userId, id);

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
  async findPhoto(id: string, userId: string) {
    const photo = await this.prisma.personPhoto.findFirst({
      where: { personId: id, person: { userId } },
    });
    if (!photo) throw new NotFoundException(`Pessoa "${id}" não tem foto`);
    return photo;
  }

  async removePhoto(id: string, userId: string) {
    await this.ensureOwnedBy(userId, id);
    const deleted = await this.prisma.personPhoto.deleteMany({
      where: { personId: id },
    });
    if (deleted.count === 0)
      throw new NotFoundException(`Pessoa "${id}" não tem foto`);
    return { photoUpdatedAt: null };
  }

  /** Existe **e é desta conta**? — sem arrastar parentesco nem uniões. */
  private async ensureOwnedBy(userId: string, id: string) {
    const person = await this.prisma.person.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException(`Pessoa "${id}" não encontrada`);
  }

  /**
   * `fatherId`/`motherId` (ou qualquer outro id de pessoa vindo de um DTO)
   * precisam pertencer à mesma conta — sem isso, o Postgres aceitaria de bom
   * grado o UUID de alguém de outra conta, e a resposta devolveria essa pessoa
   * inteira via `include` (BL-10).
   */
  private async assertPersonIdsOwnedBy(
    userId: string,
    ids: (string | null | undefined)[],
  ) {
    const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (!unique.length) return;
    const count = await this.prisma.person.count({
      where: { id: { in: unique }, userId },
    });
    if (count !== unique.length)
      throw new BadRequestException(
        'Pai, mãe ou pessoa informada não existe nesta conta',
      );
  }

  private async assertLocationOwnedBy(
    userId: string,
    locationId?: string | null,
  ) {
    if (!locationId) return;
    const found = await this.prisma.location.findFirst({
      where: { id: locationId, userId },
      select: { id: true },
    });
    if (!found)
      throw new BadRequestException('Local informado não existe nesta conta');
  }
}
