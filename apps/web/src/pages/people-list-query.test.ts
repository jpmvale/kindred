import { describe, expect, it } from 'vitest';
import {
  parsePeopleListQuery,
  serializePeopleListQuery,
} from './people-list-query';

const parse = (search: string) =>
  parsePeopleListQuery(new URLSearchParams(search));

describe('parsePeopleListQuery', () => {
  it('sem query string, devolve o padrão', () => {
    expect(parse('')).toEqual({
      page: 1,
      search: '',
      sortBy: 'name',
      sortDirection: 'asc',
    });
  });

  it('lê os quatro parâmetros', () => {
    expect(parse('page=3&search=maria&sortBy=age&sortDirection=desc')).toEqual({
      page: 3,
      search: 'maria',
      sortBy: 'age',
      sortDirection: 'desc',
    });
  });

  it('tira o espaço em volta da busca', () => {
    expect(parse('search=%20maria%20').search).toBe('maria');
  });

  it('ignora página que não é inteiro positivo', () => {
    // A URL é editável: o que vier torto vira a primeira página, não erro 400.
    expect(parse('page=0').page).toBe(1);
    expect(parse('page=-2').page).toBe(1);
    expect(parse('page=1.5').page).toBe(1);
    expect(parse('page=abc').page).toBe(1);
  });

  it('ignora ordenação inventada', () => {
    expect(parse('sortBy=altura').sortBy).toBe('name');
    expect(parse('sortDirection=cima').sortDirection).toBe('asc');
  });
});

describe('serializePeopleListQuery', () => {
  it('omite tudo que é padrão', () => {
    expect(serializePeopleListQuery({}).toString()).toBe('');
    expect(
      serializePeopleListQuery({
        page: 1,
        search: '',
        sortBy: 'name',
        sortDirection: 'asc',
      }).toString(),
    ).toBe('');
  });

  it('escreve só o que difere do padrão', () => {
    expect(serializePeopleListQuery({ page: 2 }).toString()).toBe('page=2');
    expect(serializePeopleListQuery({ sortBy: 'age' }).toString()).toBe(
      'sortBy=age',
    );
  });

  it('faz a volta completa', () => {
    const query = {
      page: 4,
      search: 'josé',
      sortBy: 'birthDate' as const,
      sortDirection: 'desc' as const,
    };
    expect(parsePeopleListQuery(serializePeopleListQuery(query))).toEqual(query);
  });
});
