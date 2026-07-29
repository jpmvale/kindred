import { NotFoundException } from '@nestjs/common';
import { LocationsService } from './locations.service';
import type { PrismaService } from '../prisma/prisma.service';

/*
 * Primeiro teste deste service (BL-10): ele existia sem nenhum, e `findAll`
 * vazava todos os locais de todas as contas — este arquivo prova a correção.
 */

type Local = { id: string; name: string; userId: string };

function local(id: string, extras: Partial<Local> = {}): Local {
  return { id, name: id, userId: 'u1', ...extras };
}

function prismaFake(locais: Local[]) {
  const service = {
    location: {
      create: jest.fn(({ data }: { data: Local }) => Promise.resolve(data)),
      findMany: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          locais
            .filter((l) => l.userId === where.userId)
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      ),
      findFirst: jest.fn(
        ({ where }: { where: { id: string; userId: string } }) =>
          Promise.resolve(
            locais.find(
              (l) => l.id === where.id && l.userId === where.userId,
            ) ?? null,
          ),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Partial<Local> }) => {
          const alvo = locais.find((l) => l.id === where.id)!;
          return Promise.resolve({ ...alvo, ...data });
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(locais.find((l) => l.id === where.id)),
      ),
    },
  };
  return { prisma: service as unknown as PrismaService, service };
}

describe('LocationsService — isolamento entre contas (BL-10)', () => {
  it('findAll da conta A não lista locais da conta B', async () => {
    const { prisma } = prismaFake([
      local('curitiba', { name: 'Curitiba', userId: 'u1' }),
      local('sp', { name: 'São Paulo', userId: 'u2' }),
    ]);

    const resultado = await new LocationsService(prisma).findAll('u1');

    expect(resultado.map((l) => l.name)).toEqual(['Curitiba']);
  });

  it('findOne de local de outra conta é 404', async () => {
    const { prisma } = prismaFake([local('sp', { userId: 'u2' })]);

    await expect(
      new LocationsService(prisma).findOne('sp', 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update/remove de local de outra conta são recusados antes de tocar o Prisma', async () => {
    const { prisma, service } = prismaFake([local('sp', { userId: 'u2' })]);
    const locationsService = new LocationsService(prisma);

    await expect(
      locationsService.update('sp', { name: 'Nova' }, 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(locationsService.remove('sp', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(service.location.update).not.toHaveBeenCalled();
    expect(service.location.delete).not.toHaveBeenCalled();
  });

  it('create grava o dono junto', async () => {
    const { prisma, service } = prismaFake([]);

    await new LocationsService(prisma).create({ name: 'Curitiba' }, 'u1');

    const chamada = service.location.create.mock.calls[0][0] as {
      data: { name: string; userId: string };
    };
    expect(chamada.data).toEqual({ name: 'Curitiba', userId: 'u1' });
  });
});
