import { describe, expect, it } from 'vitest';
import type { Person } from '@kindred/types';
import { PARENT_MAX_AGE, PARENT_MIN_AGE, parentCandidates } from './parent-candidates';

function pessoa(id: string, extras: Partial<Person> = {}): Person {
  return {
    id,
    name: id,
    deceased: false,
    relationshipType: 'FAMILY',
    isCentralUser: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extras,
  };
}

const NASCIMENTO_DO_FILHO = '1990-06-15';

describe('parentCandidates — sexo', () => {
  const pessoas = [
    pessoa('homem', { sex: 'MALE' }),
    pessoa('mulher', { sex: 'FEMALE' }),
    pessoa('sem-sexo'),
  ];

  it('tira as mulheres da lista de pai, e os homens da de mãe', () => {
    expect(parentCandidates(pessoas, { role: 'father' }).options.map((p) => p.id)).toEqual([
      'homem',
      'sem-sexo',
    ]);
    expect(parentCandidates(pessoas, { role: 'mother' }).options.map((p) => p.id)).toEqual([
      'mulher',
      'sem-sexo',
    ]);
  });

  it('conta quantos escondeu, para a tela poder oferecer a lista inteira', () => {
    expect(parentCandidates(pessoas, { role: 'father' }).hidden).toBe(1);
  });

  it('nunca oferece a própria pessoa como pai dela mesma', () => {
    const { options } = parentCandidates(pessoas, { role: 'father', excludeId: 'homem' });
    expect(options.map((p) => p.id)).toEqual(['sem-sexo']);
  });
});

describe('parentCandidates — datas', () => {
  it('esconde quem seria novo ou velho demais na data de nascimento do filho', () => {
    const pessoas = [
      pessoa('no-limite-jovem', { birthDate: anosAntes(PARENT_MIN_AGE + 1) }),
      pessoa('criança', { birthDate: anosAntes(PARENT_MIN_AGE - 1) }),
      pessoa('no-limite-velho', { birthDate: anosAntes(PARENT_MAX_AGE - 1) }),
      pessoa('velho-demais', { birthDate: anosAntes(PARENT_MAX_AGE + 1) }),
      pessoa('sem-data'),
    ];

    const { options, hidden } = parentCandidates(pessoas, {
      role: 'father',
      childBirthDate: NASCIMENTO_DO_FILHO,
    });

    expect(options.map((p) => p.id)).toEqual(['no-limite-jovem', 'no-limite-velho', 'sem-data']);
    expect(hidden).toBe(2);
  });

  it('esconde quem já tinha morrido — mas o pai pode ter morrido durante a gravidez', () => {
    const pessoas = [
      pessoa('mãe-viva', { birthDate: anosAntes(30), deathDate: '2020-01-01' }),
      pessoa('morreu-antes', { birthDate: anosAntes(30), deathDate: '1980-01-01' }),
      pessoa('morreu-na-gravidez', { birthDate: anosAntes(30), deathDate: '1990-02-01' }),
    ];

    const pais = parentCandidates(pessoas, { role: 'father', childBirthDate: NASCIMENTO_DO_FILHO });
    expect(pais.options.map((p) => p.id)).toEqual(['mãe-viva', 'morreu-na-gravidez']);

    const mães = parentCandidates(pessoas, { role: 'mother', childBirthDate: NASCIMENTO_DO_FILHO });
    expect(mães.options.map((p) => p.id)).toEqual(['mãe-viva']);
  });

  it('sem data de nascimento do filho, não filtra por data nenhuma', () => {
    const pessoas = [pessoa('bebê', { birthDate: '2025-01-01' }), pessoa('antigo', { deathDate: '1900-01-01' })];
    expect(parentCandidates(pessoas, { role: 'father' }).options).toHaveLength(2);
  });

  it('mantém quem já está escolhido, mesmo contrariando o filtro', () => {
    const pessoas = [pessoa('escolhida', { sex: 'FEMALE', deathDate: '1900-01-01' })];
    const { options, hidden } = parentCandidates(pessoas, {
      role: 'father',
      childBirthDate: NASCIMENTO_DO_FILHO,
      keepId: 'escolhida',
    });

    // Sem essa regra, abrir o cadastro de alguém já preenchido esvaziaria o campo.
    expect(options.map((p) => p.id)).toEqual(['escolhida']);
    expect(hidden).toBe(0);
  });
});

/** Uma data `anos` antes do nascimento do filho do cenário. */
function anosAntes(anos: number): string {
  const base = new Date(`${NASCIMENTO_DO_FILHO}T00:00:00.000Z`);
  base.setUTCFullYear(base.getUTCFullYear() - anos);
  return base.toISOString().slice(0, 10);
}
