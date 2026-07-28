import { describe, expect, it } from 'vitest';
import type { Person } from '@kindred/types';
import {
  buildEntries,
  entriesByDay,
  entryTitle,
  nextOccurrences,
  yearsAt,
  type CalendarEntry,
} from './calendar-entries';

const pessoa = (name: string, over: Partial<Person> = {}): Person =>
  ({
    id: name.toLowerCase().replace(/\W/g, ''),
    name,
    relationshipType: 'FAMILY',
    isCentralUser: false,
    ...over,
  }) as Person;

const VIVO = pessoa('Vivo Silva', { birthDate: '1990-07-10' });
const FALECIDO = pessoa('Antônio Souza', {
  birthDate: '1932-01-18',
  deathDate: '2010-03-12',
});
/** RN-006: sabe-se que faleceu, não se sabe quando. */
const SEM_DATA_DE_MORTE = pessoa('Maria Souza', {
  birthDate: '1935-07-04',
  deceased: true,
});

const tipos = (entries: CalendarEntry[]) =>
  entries.map((e) => `${e.name}:${e.kind}`).sort();

describe('buildEntries (RN-020)', () => {
  it('quem está vivo rende só o aniversário', () => {
    expect(tipos(buildEntries([VIVO], true))).toEqual(['Vivo Silva:BIRTHDAY']);
  });

  it('quem faleceu rende as duas datas', () => {
    expect(tipos(buildEntries([FALECIDO], true))).toEqual([
      'Antônio Souza:DEATH',
      'Antônio Souza:MEMORIAL_BIRTHDAY',
    ]);
  });

  it('quem faleceu sem data conhecida entra só pelo nascimento (RN-006)', () => {
    expect(tipos(buildEntries([SEM_DATA_DE_MORTE], true))).toEqual([
      'Maria Souza:MEMORIAL_BIRTHDAY',
    ]);
  });

  it('desligar os falecimentos devolve o calendário ao que era antes', () => {
    const entries = buildEntries([VIVO, FALECIDO, SEM_DATA_DE_MORTE], false);
    expect(tipos(entries)).toEqual(['Vivo Silva:BIRTHDAY']);
  });

  it('quem não tem data nenhuma não entra', () => {
    expect(buildEntries([pessoa('Sem Datas')], true)).toEqual([]);
  });

  it('falecido sem nascimento entra só pelo falecimento', () => {
    const so = pessoa('Só Morte', { deathDate: '2001-03-02' });
    expect(tipos(buildEntries([so], true))).toEqual(['Só Morte:DEATH']);
  });

  it('a chave separa as duas datas da mesma pessoa', () => {
    const chaves = buildEntries([FALECIDO], true).map((e) => e.key);
    expect(new Set(chaves).size).toBe(2);
  });
});

describe('entriesByDay', () => {
  it('agrupa só o mês pedido, ordenando por nome dentro do dia', () => {
    const entries = buildEntries(
      [
        pessoa('Zeca', { birthDate: '1990-07-10' }),
        pessoa('Ana', { birthDate: '1991-07-10' }),
        pessoa('Fora', { birthDate: '1991-08-10' }),
      ],
      true,
    );

    const julho = entriesByDay(entries, 6);
    expect(julho.get(10)!.map((e) => e.name)).toEqual(['Ana', 'Zeca']);
    expect(julho.has(10)).toBe(true);
    expect([...julho.keys()]).toEqual([10]);
  });

  it('as duas datas de um falecido caem em dias diferentes', () => {
    const entries = buildEntries([FALECIDO], true);
    expect(entriesByDay(entries, 0).get(18)![0].kind).toBe('MEMORIAL_BIRTHDAY');
    expect(entriesByDay(entries, 2).get(12)![0].kind).toBe('DEATH');
  });
});

describe('nextOccurrences', () => {
  const hoje = new Date(2026, 6, 27);

  it('conta a partir de hoje e passa para o ano seguinte', () => {
    const entries = buildEntries(
      [
        pessoa('Amanhã', { birthDate: '1990-07-28' }),
        pessoa('Foi Ontem', { birthDate: '1990-07-26' }),
        pessoa('Hoje', { birthDate: '1990-07-27' }),
      ],
      true,
    );

    expect(
      nextOccurrences(entries, ['BIRTHDAY'], hoje, 5).map((e) => [
        e.name,
        e.daysUntil,
      ]),
    ).toEqual([
      ['Hoje', 0],
      ['Amanhã', 1],
      ['Foi Ontem', 364],
    ]);
  });

  it('filtra por tipo — é o que separa as duas listas do rodapé', () => {
    const entries = buildEntries([VIVO, FALECIDO], true);

    expect(
      nextOccurrences(entries, ['DEATH'], hoje, 5).map((e) => e.name),
    ).toEqual(['Antônio Souza']);

    expect(
      nextOccurrences(entries, ['BIRTHDAY', 'MEMORIAL_BIRTHDAY'], hoje, 5).map(
        (e) => e.kind,
      ),
    ).toEqual(['MEMORIAL_BIRTHDAY', 'BIRTHDAY']);
  });

  it('respeita o limite pedido', () => {
    const muitos = Array.from({ length: 9 }, (_, i) =>
      pessoa(`P${i}`, { birthDate: `1990-08-0${i + 1}` }),
    );
    expect(nextOccurrences(buildEntries(muitos, true), ['BIRTHDAY'], hoje, 5))
      .toHaveLength(5);
  });
});

describe('anos e rótulos', () => {
  it('conta os anos na ocorrência, e nada quando a conta não faz sentido', () => {
    const [aniversario] = buildEntries([VIVO], true);
    expect(yearsAt(aniversario, new Date(2026, 6, 10))).toBe(36);
    // Data de origem no futuro: não há idade a mostrar.
    expect(yearsAt(aniversario, new Date(1989, 6, 10))).toBeNull();
  });

  it('cada tipo se explica de um jeito', () => {
    const [aniversario] = buildEntries([VIVO], true);
    expect(entryTitle(aniversario, new Date(2026, 6, 10))).toBe(
      'Vivo Silva — faz 36 anos',
    );

    const doFalecido = buildEntries([FALECIDO], true);
    const nascimento = doFalecido.find((e) => e.kind === 'MEMORIAL_BIRTHDAY')!;
    const morte = doFalecido.find((e) => e.kind === 'DEATH')!;

    expect(entryTitle(nascimento, new Date(2026, 0, 18))).toBe(
      'Antônio Souza — faria 94 anos',
    );
    expect(entryTitle(morte, new Date(2026, 2, 12))).toBe(
      'Antônio Souza — 16 anos de falecimento',
    );
  });
});
