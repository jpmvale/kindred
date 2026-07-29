import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UnionsService } from './unions.service';
import type { PrismaService } from '../prisma/prisma.service';

/*
 * Primeiro teste deste service (BL-10). `Union` não tem `userId` próprio — o
 * dono é sempre as duas `Person` que ela liga, garantido no `create` (que
 * confere posse dos dois lados antes de gravar). Estes testes seguram
 * exatamente essa garantia, e o resto do CRUD escopado via `partnerA.userId`.
 */

type Pessoa = { id: string; name: string; userId: string };
type Uniao = {
  id: string;
  partnerAId: string;
  partnerBId: string;
  status: 'CURRENT' | 'ENDED';
  startDate: Date | null;
  endDate: Date | null;
};

function prismaFake(pessoas: Pessoa[], unioes: Uniao[] = []) {
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const comParceiros = (u: Uniao) => ({
    ...u,
    partnerA: porId.get(u.partnerAId)!,
    partnerB: porId.get(u.partnerBId)!,
  });

  const service = {
    person: {
      count: jest.fn(
        ({ where }: { where: { id: { in: string[] }; userId: string } }) =>
          Promise.resolve(
            pessoas.filter(
              (p) => where.id.in.includes(p.id) && p.userId === where.userId,
            ).length,
          ),
      ),
    },
    union: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: {
            partnerAId_partnerBId: { partnerAId: string; partnerBId: string };
          };
        }) =>
          Promise.resolve(
            unioes.find(
              (u) =>
                u.partnerAId === where.partnerAId_partnerBId.partnerAId &&
                u.partnerBId === where.partnerAId_partnerBId.partnerBId,
            ) ?? null,
          ),
      ),
      create: jest.fn(({ data }: { data: Omit<Uniao, 'id'> }) => {
        const uniao = { id: `u${unioes.length + 1}`, ...data };
        unioes.push(uniao);
        return Promise.resolve(comParceiros(uniao));
      }),
      findMany: jest.fn(
        ({ where }: { where?: { partnerA?: { userId: string } } }) =>
          Promise.resolve(
            unioes
              .map(comParceiros)
              .filter(
                (u) =>
                  !where?.partnerA ||
                  u.partnerA.userId === where.partnerA.userId,
              ),
          ),
      ),
      findFirst: jest.fn(
        (args: {
          where: {
            id?: string | { not: string };
            partnerA?: { userId: string };
            status?: string;
            OR?: {
              partnerAId?: { in: string[] };
              partnerBId?: { in: string[] };
            }[];
          };
        }) => {
          const { where } = args;
          const achada = unioes.find((u) => {
            if (where.id && typeof where.id === 'string' && u.id !== where.id)
              return false;
            if (where.status && u.status !== where.status) return false;
            if (
              where.partnerA &&
              porId.get(u.partnerAId)?.userId !== where.partnerA.userId
            )
              return false;
            if (where.OR) {
              const bate = where.OR.some(
                (cond) =>
                  cond.partnerAId?.in.includes(u.partnerAId) ||
                  cond.partnerBId?.in.includes(u.partnerBId),
              );
              if (!bate) return false;
            }
            return true;
          });
          return Promise.resolve(achada ? comParceiros(achada) : null);
        },
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Partial<Uniao> }) => {
          const uniao = unioes.find((u) => u.id === where.id)!;
          Object.assign(uniao, data);
          return Promise.resolve(comParceiros(uniao));
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(unioes.find((u) => u.id === where.id)),
      ),
    },
  };

  return {
    prisma: service as unknown as PrismaService,
    service,
    pessoas,
    unioes,
  };
}

describe('UnionsService.create — isolamento entre contas (BL-10)', () => {
  it('recusa união entre pessoa própria e pessoa de outra conta', async () => {
    const { prisma } = prismaFake([
      { id: 'ana', name: 'Ana', userId: 'u1' },
      { id: 'bianca', name: 'Bianca', userId: 'u2' },
    ]);

    await expect(
      new UnionsService(prisma).create(
        { partnerAId: 'ana', partnerBId: 'bianca' },
        'u1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recusa auto-união', async () => {
    const { prisma } = prismaFake([{ id: 'ana', name: 'Ana', userId: 'u1' }]);

    await expect(
      new UnionsService(prisma).create(
        { partnerAId: 'ana', partnerBId: 'ana' },
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa duplicar uma união já registrada', async () => {
    const pessoas = [
      { id: 'ana', name: 'Ana', userId: 'u1' },
      { id: 'bruno', name: 'Bruno', userId: 'u1' },
    ];
    const { prisma } = prismaFake(pessoas, [
      {
        id: 'u1',
        partnerAId: 'ana',
        partnerBId: 'bruno',
        status: 'CURRENT',
        startDate: null,
        endDate: null,
      },
    ]);

    await expect(
      new UnionsService(prisma).create(
        { partnerAId: 'ana', partnerBId: 'bruno' },
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa a segunda união vigente da mesma pessoa (RN-014), só dentro da própria conta', async () => {
    const pessoas = [
      { id: 'ana', name: 'Ana', userId: 'u1' },
      { id: 'bruno', name: 'Bruno', userId: 'u1' },
      { id: 'carlos', name: 'Carlos', userId: 'u1' },
    ];
    const { prisma } = prismaFake(pessoas, [
      {
        id: 'u1',
        partnerAId: 'ana',
        partnerBId: 'bruno',
        status: 'CURRENT',
        startDate: null,
        endDate: null,
      },
    ]);

    await expect(
      new UnionsService(prisma).create(
        { partnerAId: 'ana', partnerBId: 'carlos' },
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a resposta não traz o userId de dentro dos parceiros aninhados', async () => {
    const pessoas = [
      { id: 'ana', name: 'Ana', userId: 'u1' },
      { id: 'bruno', name: 'Bruno', userId: 'u1' },
    ];
    const { prisma } = prismaFake(pessoas);

    const uniao = await new UnionsService(prisma).create(
      { partnerAId: 'ana', partnerBId: 'bruno' },
      'u1',
    );

    expect(uniao.partnerA).not.toHaveProperty('userId');
    expect(uniao.partnerB).not.toHaveProperty('userId');
  });
});

describe('UnionsService — CRUD escopado (BL-10)', () => {
  it('findAll só devolve uniões da própria conta', async () => {
    const pessoas = [
      { id: 'ana', name: 'Ana', userId: 'u1' },
      { id: 'bruno', name: 'Bruno', userId: 'u1' },
      { id: 'bianca', name: 'Bianca', userId: 'u2' },
      { id: 'carlos', name: 'Carlos', userId: 'u2' },
    ];
    const { prisma } = prismaFake(pessoas, [
      {
        id: 'u1',
        partnerAId: 'ana',
        partnerBId: 'bruno',
        status: 'CURRENT',
        startDate: null,
        endDate: null,
      },
      {
        id: 'u2',
        partnerAId: 'bianca',
        partnerBId: 'carlos',
        status: 'CURRENT',
        startDate: null,
        endDate: null,
      },
    ]);

    const resultado = await new UnionsService(prisma).findAll('u1');

    expect(resultado.map((u) => u.id)).toEqual(['u1']);
  });

  it('findOne/update/remove de união de outra conta são 404', async () => {
    const pessoas = [
      { id: 'bianca', name: 'Bianca', userId: 'u2' },
      { id: 'carlos', name: 'Carlos', userId: 'u2' },
    ];
    const { prisma, service } = prismaFake(pessoas, [
      {
        id: 'u2',
        partnerAId: 'bianca',
        partnerBId: 'carlos',
        status: 'CURRENT',
        startDate: null,
        endDate: null,
      },
    ]);
    const unionsService = new UnionsService(prisma);

    await expect(unionsService.findOne('u2', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      unionsService.update('u2', { status: 'ENDED' }, 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(unionsService.remove('u2', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(service.union.update).not.toHaveBeenCalled();
    expect(service.union.delete).not.toHaveBeenCalled();
  });
});
