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
 */

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
 * **formato** das consultas, não só o resultado.
 */
function prismaFake(pessoas = BASE) {
  const chamadas: { select?: unknown; include?: unknown; where?: unknown }[] =
    [];

  const service = {
    person: {
      findMany: jest.fn((args: Record<string, unknown>) => {
        chamadas.push(args);

        // A consulta com `include` traz os dois lados da união e a foto; a
        // enxuta (`select`) não. O dublê responde conforme o que foi pedido.
        const comIncludes = (p: Pessoa) =>
          args.include
            ? { ...p, unionsAsA: [], unionsAsB: [], photo: null }
            : { ...p };

        const ids = (args.where as { id?: { in?: string[] } })?.id?.in;
        if (!ids) {
          return Promise.resolve(
            [...pessoas]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(comIncludes),
          );
        }

        // De propósito na ordem **inversa** da pedida: é o que o Postgres tem o
        // direito de fazer, e o que quebraria a página se ninguém reordenasse.
        const linhas = pessoas
          .filter((p) => ids.includes(p.id))
          .map(comIncludes)
          .reverse();
        return Promise.resolve(linhas);
      }),
    },
    union: { findMany: jest.fn(() => Promise.resolve([])) },
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
  query: Parameters<PeopleService['findAll']>[0],
): Promise<Pagina> {
  const resposta = await service.findAll(query);
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

  it('sem paginação, traz a base inteira com os includes — é a árvore pedindo', async () => {
    const { prisma, chamadas } = prismaFake();

    const resposta = await new PeopleService(prisma).findAll();

    expect(Array.isArray(resposta)).toBe(true);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].include).toBeDefined();
    expect(chamadas[0].select).toBeUndefined();
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
