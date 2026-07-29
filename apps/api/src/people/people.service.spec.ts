import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PeopleService } from './people.service';
import type { PrismaService } from '../prisma/prisma.service';

/*
 * A listagem paginada varre a base enxuta e só busca pai, mãe, local, uniões e
 * foto das linhas que a página mostra (ADR-014). São duas consultas onde antes
 * havia uma, e é isso que estes testes seguram:
 *
 *   - a varredura não pode voltar a arrastar os includes da base inteira;
 *   - a segunda consulta usa `where: { id: { in } }`, que **não promete ordem** —
 *     se a ordenação não for refeita, a página sai embaralhada sem ninguém notar.
 *
 * A chamada **sem paginação** (árvore, calendário, candidatos de um formulário)
 * passou pelo mesmo enxugamento (BL-14, ADR-017): continua trazendo a base
 * inteira, mas sem pai/mãe/local aninhados nem o parceiro por extenso — só o que
 * esses três consumidores de fato leem.
 *
 * Desde o BL-10, toda consulta é escopada por `userId` — os testes de isolamento
 * (mais abaixo) seguram que uma conta nunca enxerga nem referencia a de outra.
 */

const DONO = 'u1';
const OUTRO_DONO = 'u2';

type Pessoa = {
  id: string;
  name: string;
  sex: string | null;
  birthDate: Date | null;
  deathDate: Date | null;
  deceased: boolean;
  relationshipType: string;
  isCentralUser: boolean;
  fatherId: string | null;
  motherId: string | null;
  userId: string;
};

function pessoa(id: string, extras: Partial<Pessoa> = {}): Pessoa {
  return {
    id,
    name: id,
    sex: null,
    birthDate: null,
    deathDate: null,
    deceased: false,
    relationshipType: 'FAMILY',
    isCentralUser: false,
    fatherId: null,
    motherId: null,
    userId: DONO,
    ...extras,
  };
}

/** Uma família curta: a central, o pai dela e dois irmãos. */
const BASE: Pessoa[] = [
  pessoa('ana', { name: 'Ana', sex: 'FEMALE', fatherId: 'carlos' }),
  pessoa('bruno', { name: 'Bruno', sex: 'MALE', fatherId: 'carlos' }),
  pessoa('carlos', { name: 'Carlos', sex: 'MALE' }),
  pessoa('duda', {
    name: 'Duda',
    sex: 'FEMALE',
    fatherId: 'carlos',
    isCentralUser: true,
  }),
];

/**
 * Prisma de mentira. Guarda os argumentos recebidos para os testes conferirem o
 * **formato** das consultas, não só o resultado — e filtra por `userId` de
 * verdade, para os testes de isolamento serem comportamentais, não só de forma.
 */
function prismaFake(pessoas = BASE) {
  const chamadas: { select?: unknown; include?: unknown; where?: unknown }[] =
    [];

  const porDono = (
    lista: Pessoa[],
    where: Record<string, unknown> | undefined,
  ) => {
    const userId = where?.userId as string | undefined;
    return userId ? lista.filter((p) => p.userId === userId) : lista;
  };

  const service = {
    person: {
      findMany: jest.fn((args: Record<string, unknown>) => {
        chamadas.push(args);

        // Três formatos de consulta: a `select` enxuta da varredura (sem nada de
        // união), a `include` completa da página (com o parceiro por extenso) e
        // a `select` da lista sem paginação (união, mas só `partnerId`) — a
        // própria chamada diz qual é, então o dublê responde conforme pedido.
        const select = args.select as
          { unionsAsA?: unknown; photo?: unknown } | undefined;
        const comIncludes = (p: Pessoa) => {
          if (args.include)
            return { ...p, unionsAsA: [], unionsAsB: [], photo: null };
          if (select?.unionsAsA)
            return { ...p, unionsAsA: [], unionsAsB: [], photo: null };
          return { ...p };
        };

        const where = args.where as
          { id?: { in?: string[] }; userId?: string } | undefined;
        const ids = where?.id?.in;
        if (!ids) {
          return Promise.resolve(
            porDono([...pessoas], where)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(comIncludes),
          );
        }

        // De propósito na ordem **inversa** da pedida: é o que o Postgres tem o
        // direito de fazer, e o que quebraria a página se ninguém reordenasse.
        const linhas = porDono(
          pessoas.filter((p) => ids.includes(p.id)),
          where,
        )
          .map(comIncludes)
          .reverse();
        return Promise.resolve(linhas);
      }),
      findFirst: jest.fn((args: Record<string, unknown>) => {
        const where = args.where as
          { id?: string; userId?: string; isCentralUser?: boolean } | undefined;
        const achada = pessoas.find(
          (p) =>
            (where?.id === undefined || p.id === where.id) &&
            (where?.userId === undefined || p.userId === where.userId) &&
            (where?.isCentralUser === undefined ||
              p.isCentralUser === where.isCentralUser),
        );
        if (!achada) return Promise.resolve(null);
        // Mesmo tratamento de `include` que o `findMany` já dá: sem isto,
        // `findOne` (que usa `findFirst` com `include: INCLUDE`) quebraria por
        // faltar `unionsAsA`/`unionsAsB`/`photo` no resultado.
        if (args.include) {
          return Promise.resolve({
            ...achada,
            unionsAsA: [],
            unionsAsB: [],
            photo: null,
          });
        }
        return Promise.resolve(achada);
      }),
      count: jest.fn((args: Record<string, unknown>) => {
        const where = args.where as
          { id?: { in?: string[] }; userId?: string } | undefined;
        const ids = where?.id?.in;
        const contadas = pessoas.filter(
          (p) =>
            (!ids || ids.includes(p.id)) &&
            (where?.userId === undefined || p.userId === where.userId),
        );
        return Promise.resolve(contadas.length);
      }),
    },
    union: { findMany: jest.fn(() => Promise.resolve([])) },
    location: {
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  return { prisma: service as unknown as PrismaService, chamadas, service };
}

type Pagina = {
  data: { name: string; kinshipDegree: string | null }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/**
 * `findAll` responde em dois formatos — lista crua sem paginação, envelope com
 * `data`/`total` com ela. Estreitar aqui deixa os testes lendo `resposta.data`
 * sem `any` solto, e falha alto se o formato mudar sem querer.
 */
async function paginado(
  service: PeopleService,
  query: Parameters<PeopleService['findAll']>[1],
  userId = DONO,
): Promise<Pagina> {
  const resposta = await service.findAll(userId, query);
  if (Array.isArray(resposta)) {
    throw new Error('esperava resposta paginada, veio a lista inteira');
  }
  return resposta;
}

describe('PeopleService.findAll', () => {
  it('varre a base sem os includes quando a chamada é paginada', async () => {
    const { prisma, chamadas } = prismaFake();

    await paginado(new PeopleService(prisma), { page: 1, limit: 2 });

    const varredura = chamadas[0];
    expect(varredura.select).toBeDefined();
    expect(varredura.include).toBeUndefined();
    // O que a varredura precisa: parentesco, busca e ordenação. Nada além.
    expect(Object.keys(varredura.select as object).sort()).toEqual([
      'birthDate',
      'deathDate',
      'deceased',
      'fatherId',
      'id',
      'isCentralUser',
      'motherId',
      'name',
      'relationshipType',
      'sex',
    ]);
  });

  it('busca os includes só das linhas da página', async () => {
    const { prisma, chamadas } = prismaFake();

    await paginado(new PeopleService(prisma), { page: 1, limit: 2 });

    const paginada = chamadas[1];
    expect(paginada.include).toBeDefined();
    expect((paginada.where as { id: { in: string[] } }).id.in).toHaveLength(2);
  });

  it('devolve a página na ordem pedida, mesmo o banco entregando embaralhado', async () => {
    const { prisma } = prismaFake();

    const resposta = await paginado(new PeopleService(prisma), {
      page: 1,
      limit: 3,
    });

    expect(resposta.data.map((p) => p.name)).toEqual([
      'Ana',
      'Bruno',
      'Carlos',
    ]);
  });

  it('mantém o parentesco calculado na varredura ao juntar com os includes', async () => {
    const { prisma } = prismaFake();

    const resposta = await paginado(new PeopleService(prisma), {
      page: 1,
      limit: 4,
    });
    const porNome = Object.fromEntries(
      resposta.data.map((p) => [p.name, p.kinshipDegree]),
    );

    expect(porNome).toEqual({
      Ana: 'Irmã',
      Bruno: 'Irmão',
      Carlos: 'Pai',
      Duda: 'Você',
    });
  });

  it('sem paginação, traz a base inteira enxuta — é a árvore, o calendário ou os candidatos pedindo', async () => {
    const { prisma, chamadas } = prismaFake();

    const resposta = await new PeopleService(prisma).findAll(DONO);

    expect(Array.isArray(resposta)).toBe(true);
    expect(chamadas).toHaveLength(1);
    // BL-14: nem esta chamada arrasta include nenhum — é `select`, como a
    // varredura da página, só que mais generoso (notas, foto, uniões).
    expect(chamadas[0].include).toBeUndefined();
    expect(chamadas[0].select).toBeDefined();
  });

  it('a lista sem paginação não pede pai, mãe nem local aninhados, e a união vem sem o parceiro (BL-14)', async () => {
    const { prisma, chamadas } = prismaFake();

    await new PeopleService(prisma).findAll(DONO);

    const select = chamadas[0].select as Record<string, unknown>;
    expect(select.father).toBeUndefined();
    expect(select.mother).toBeUndefined();
    expect(select.location).toBeUndefined();
    // As uniões são pedidas, mas só o id do parceiro — não o objeto inteiro.
    const unionSelect = (
      select.unionsAsA as { select: Record<string, unknown> }
    ).select;
    expect(unionSelect.partnerBId).toBe(true);
    expect(unionSelect.partnerB).toBeUndefined();
  });

  it('normaliza a união sem o parceiro por extenso, ao contrário de `withUnions` (BL-14)', async () => {
    const { prisma, service } = prismaFake();
    // A resposta que o Postgres dá para `LIST_SELECT`: só `partnerBId`, sem o
    // objeto `partnerB` que a consulta com `include` traria.
    service.person.findMany.mockImplementationOnce(() =>
      Promise.resolve([
        {
          ...pessoa('ana', { name: 'Ana' }),
          unionsAsA: [
            {
              id: 'u1',
              status: 'CURRENT',
              startDate: null,
              endDate: null,
              partnerBId: 'bruno',
            },
          ],
          unionsAsB: [],
          photo: null,
        },
      ]),
    );

    const resposta = await new PeopleService(prisma).findAll(DONO);
    if (!Array.isArray(resposta)) throw new Error('esperava a lista inteira');

    const ana = resposta[0] as unknown as {
      unions: { partnerId: string; partner?: unknown }[];
    };
    expect(ana.unions).toEqual([
      {
        id: 'u1',
        status: 'CURRENT',
        startDate: null,
        endDate: null,
        partnerId: 'bruno',
      },
    ]);
    expect(ana.unions[0]).not.toHaveProperty('partner');
  });

  it('não quebra a página se alguém for apagado entre as duas consultas', async () => {
    const { prisma, service } = prismaFake();
    // Segunda consulta devolve uma pessoa a menos que a varredura viu.
    service.person.findMany
      .mockImplementationOnce(() =>
        Promise.resolve([...BASE].sort((a, b) => a.name.localeCompare(b.name))),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          [BASE[0]].map((p) => ({
            ...p,
            unionsAsA: [],
            unionsAsB: [],
            photo: null,
          })),
        ),
      );

    const resposta = await paginado(new PeopleService(prisma), {
      page: 1,
      limit: 3,
    });

    expect(resposta.data.map((p) => p.name)).toEqual(['Ana']);
    // O total continua sendo o que a varredura contou: a página encolheu, a base não.
    expect(resposta.total).toBe(4);
  });
});

describe('PeopleService — isolamento entre contas (BL-10)', () => {
  it('findAll: a conta B não vê a pessoa cadastrada pela conta A', async () => {
    const pessoas = [
      pessoa('ana', { name: 'Ana', userId: DONO }),
      pessoa('bianca', { name: 'Bianca', userId: OUTRO_DONO }),
    ];
    const { prisma } = prismaFake(pessoas);

    const resposta = await new PeopleService(prisma).findAll(DONO);
    if (!Array.isArray(resposta)) throw new Error('esperava a lista inteira');

    expect(resposta.map((p) => p.name)).toEqual(['Ana']);
  });

  it('findOne: pessoa de outra conta responde 404, não outro tipo de erro', async () => {
    const pessoas = [pessoa('bianca', { name: 'Bianca', userId: OUTRO_DONO })];
    const { prisma } = prismaFake(pessoas);

    await expect(
      new PeopleService(prisma).findOne('bianca', DONO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create: recusa fatherId apontando para pessoa de outra conta', async () => {
    const pessoas = [pessoa('carlos', { name: 'Carlos', userId: OUTRO_DONO })];
    const { prisma } = prismaFake(pessoas);

    await expect(
      new PeopleService(prisma).create(
        {
          name: 'Filho',
          relationshipType: 'FAMILY',
          fatherId: 'carlos',
        } as never,
        DONO,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setCentral: o updateMany não apaga o isCentralUser de pessoa de outra conta', async () => {
    const pessoas = [
      pessoa('ana', { name: 'Ana', userId: DONO, isCentralUser: false }),
      pessoa('bianca', {
        name: 'Bianca',
        userId: OUTRO_DONO,
        isCentralUser: true,
      }),
    ];
    const { prisma, service } = prismaFake(pessoas);
    const updateMany = jest.fn(() => Promise.resolve({ count: 0 }));
    const update = jest.fn(() => Promise.resolve(pessoas[0]));
    (service.person as unknown as Record<string, unknown>).updateMany =
      updateMany;
    (service.person as unknown as Record<string, unknown>).update = update;

    await new PeopleService(prisma).setCentral('ana', DONO);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isCentralUser: true, userId: DONO },
      }),
    );
  });
});
