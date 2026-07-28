import { describe, expect, it } from 'vitest';
import type { Person } from '@kindred/types';
import { relationsOf } from './person-relations';

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

describe('relationsOf', () => {
  it('devolve null para quem não está na lista', () => {
    expect(relationsOf('fantasma', [pessoa('a')])).toBeNull();
  });

  it('traz pai, mãe, filhos e irmãos, ordenados por nome', () => {
    const pai = pessoa('pai', { name: 'Zeca' });
    const mae = pessoa('mae', { name: 'Ana' });
    const eu = pessoa('eu', { name: 'Eu', fatherId: 'pai', motherId: 'mae' });
    const irmaZ = pessoa('irmaZ', { name: 'Zilda', fatherId: 'pai', motherId: 'mae' });
    const irmaB = pessoa('irmaB', { name: 'Bia', fatherId: 'pai', motherId: 'mae' });
    const filho = pessoa('filho', { name: 'Filho', fatherId: 'eu' });

    const r = relationsOf('eu', [pai, mae, eu, irmaZ, irmaB, filho]);

    expect(r?.father?.id).toBe('pai');
    expect(r?.mother?.id).toBe('mae');
    expect(r?.children.map((p) => p.id)).toEqual(['filho']);
    expect(r?.siblings.map((p) => p.name)).toEqual(['Bia', 'Zilda']);
  });

  it('meio-irmão entra por bater só um dos lados', () => {
    const pai = pessoa('pai');
    const eu = pessoa('eu', { fatherId: 'pai', motherId: 'mae1' });
    const meioIrmao = pessoa('meio', { fatherId: 'pai', motherId: 'mae2' });
    const semRelacao = pessoa('estranho');

    const r = relationsOf('eu', [pai, eu, meioIrmao, semRelacao]);

    expect(r?.siblings.map((p) => p.id)).toEqual(['meio']);
  });

  it('sem pai nem mãe cadastrados, não inventa irmão', () => {
    const solo = pessoa('solo');
    const outroSolo = pessoa('outro-solo');

    const r = relationsOf('solo', [solo, outroSolo]);

    expect(r?.father).toBeNull();
    expect(r?.mother).toBeNull();
    expect(r?.siblings).toEqual([]);
  });

  it('pai ou mãe fora da lista carregada vira null, não quebra', () => {
    const eu = pessoa('eu', { fatherId: 'nao-carregado' });

    const r = relationsOf('eu', [eu]);

    expect(r?.father).toBeNull();
  });
});
