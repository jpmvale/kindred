import { BadRequestException, ConflictException } from '@nestjs/common';
import { BackupService } from './backup.service';
import type { PrismaService } from '../prisma/prisma.service';

/*
 * O que importa proteger aqui não é o formato do JSON (isso é o
 * `backup.test.ts` do @kindred/db) — é o **controle de fluxo** da
 * restauração: recusar sem `force` quando já há dados, apagar e recriar na
 * mesma transação com `force`, e nunca tocar o banco quando o arquivo é
 * inválido.
 */

function pessoa(id: string) {
  return {
    id,
    name: id,
    sex: null,
    birthDate: null,
    deathDate: null,
    deceased: false,
    relationshipType: 'FAMILY',
    isCentralUser: false,
    notes: null,
    fatherId: null,
    motherId: null,
    locationId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const BACKUP_VALIDO = {
  formato: 1,
  geradoEm: '2026-01-01T00:00:00.000Z',
  contagem: { Location: 0, Person: 1, Union: 0, PersonPhoto: 0 },
  dados: {
    Location: [],
    Person: [pessoa('p1')],
    Union: [],
    PersonPhoto: [],
  },
};

/**
 * Prisma de mentira: cada método de escrita devolve uma promessa já resolvida
 * (não uma "PrismaPromise" preguiçosa de verdade), e o `$transaction` dublê só
 * espera todas — o suficiente para checar **quem foi chamado com o quê**, que
 * é o que estes testes verificam.
 */
function prismaFake(existentes = 0) {
  const chamadas: string[] = [];
  const registra = (nome: string) => {
    chamadas.push(nome);
    return Promise.resolve({});
  };

  const service = {
    person: {
      count: jest.fn(() => Promise.resolve(existentes)),
      create: jest.fn(() => registra('person.create')),
      update: jest.fn(() => registra('person.update')),
      deleteMany: jest.fn(() => registra('person.deleteMany')),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    location: {
      create: jest.fn(() => registra('location.create')),
      deleteMany: jest.fn(() => registra('location.deleteMany')),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    union: {
      create: jest.fn(() => registra('union.create')),
      deleteMany: jest.fn(() => registra('union.deleteMany')),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    personPhoto: {
      create: jest.fn(() => registra('personPhoto.create')),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  return { prisma: service as unknown as PrismaService, chamadas, service };
}

const DONO = 'u1';

describe('BackupService.restore', () => {
  it('recusa sem tocar o banco quando o arquivo não é um backup válido', async () => {
    const { prisma, service } = prismaFake(0);

    await expect(
      new BackupService(prisma).restore({ nada: 'a ver' }, false, DONO),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(service.person.count).not.toHaveBeenCalled();
    expect(service.$transaction).not.toHaveBeenCalled();
  });

  it('recusa sem force quando o banco já tem gente, e não mexe em nada', async () => {
    const { prisma, service } = prismaFake(5);

    await expect(
      new BackupService(prisma).restore(BACKUP_VALIDO, false, DONO),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(service.$transaction).not.toHaveBeenCalled();
    expect(service.person.deleteMany).not.toHaveBeenCalled();
  });

  it('banco vazio: restaura sem apagar nada antes', async () => {
    const { prisma, chamadas } = prismaFake(0);

    const contagem = await new BackupService(prisma).restore(
      BACKUP_VALIDO,
      false,
      DONO,
    );

    expect(chamadas).toEqual(['person.create']);
    expect(contagem).toEqual({
      Location: 0,
      Person: 1,
      Union: 0,
      PersonPhoto: 0,
    });
  });

  it('com force e banco ocupado, apaga e recria na mesma transação', async () => {
    const { prisma, chamadas, service } = prismaFake(5);

    await new BackupService(prisma).restore(BACKUP_VALIDO, true, DONO);

    // A ordem importa: união antes de pessoa antes de local (chaves
    // estrangeiras), e tudo isso antes de recriar — é um array só, uma
    // transação só.
    expect(chamadas).toEqual([
      'union.deleteMany',
      'person.deleteMany',
      'location.deleteMany',
      'person.create',
    ]);
    expect(service.$transaction).toHaveBeenCalledTimes(1);
  });

  it('a contagem e os deletes são escopados à conta, não ao banco inteiro (BL-10)', async () => {
    const { prisma, service } = prismaFake(5);

    await new BackupService(prisma).restore(BACKUP_VALIDO, true, DONO);

    expect(service.person.count).toHaveBeenCalledWith({
      where: { userId: DONO },
    });
    expect(service.person.deleteMany).toHaveBeenCalledWith({
      where: { userId: DONO },
    });
    expect(service.location.deleteMany).toHaveBeenCalledWith({
      where: { userId: DONO },
    });
    expect(service.union.deleteMany).toHaveBeenCalledWith({
      where: { partnerA: { userId: DONO } },
    });
  });
});

describe('BackupService.export', () => {
  it('devolve o mesmo formato que o restore aceita de volta', async () => {
    const { prisma } = prismaFake(0);

    const payload = await new BackupService(prisma).export(DONO);

    expect(payload.formato).toBe(1);
    expect(payload.dados).toHaveProperty('Person');
    expect(payload.dados).toHaveProperty('Union');
    expect(payload.dados).toHaveProperty('Location');
    expect(payload.dados).toHaveProperty('PersonPhoto');
  });

  it('varre a base filtrando por userId, não o banco inteiro', async () => {
    const { prisma, service } = prismaFake(0);

    await new BackupService(prisma).export(DONO);

    expect(service.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: DONO } }),
    );
    expect(service.location.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: DONO } }),
    );
    expect(service.union.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { partnerA: { userId: DONO } } }),
    );
  });
});
