/*
 * A busca, a ordenação e a página da lista de pessoas moram na URL (ADR-010).
 *
 * Quem lê a URL é o loader da rota, que roda antes da página renderizar — por isso
 * este módulo é puro: recebe `URLSearchParams`, devolve os parâmetros já validados.
 * O que vier torto (página zero, ordenação inventada) cai no padrão em vez de virar
 * requisição inválida: a URL é editável pelo usuário e não dá para confiar nela.
 */

import type { PeopleSortField, SortDirection } from '@kindred/types';

export type PeopleListQuery = {
  page: number;
  search: string;
  sortBy: PeopleSortField;
  sortDirection: SortDirection;
};

/** Quantas pessoas por página. Fixo — a UI não oferece a escolha. */
export const PEOPLE_PAGE_SIZE = 10;

const SORT_FIELDS: PeopleSortField[] = ['name', 'birthDate', 'age'];
const SORT_DIRECTIONS: SortDirection[] = ['asc', 'desc'];

export const DEFAULT_PEOPLE_LIST_QUERY: PeopleListQuery = {
  page: 1,
  search: '',
  sortBy: 'name',
  sortDirection: 'asc',
};

export function parsePeopleListQuery(params: URLSearchParams): PeopleListQuery {
  const page = Number(params.get('page'));

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    search: params.get('search')?.trim() ?? '',
    sortBy: pick(params.get('sortBy'), SORT_FIELDS, 'name'),
    sortDirection: pick(params.get('sortDirection'), SORT_DIRECTIONS, 'asc'),
  };
}

/**
 * O caminho de volta: dos parâmetros para a URL. Só o que difere do padrão vai
 * para a query string — assim a lista em repouso é `/people`, e não
 * `/people?page=1&search=&sortBy=name&sortDirection=asc`.
 */
export function serializePeopleListQuery(
  query: Partial<PeopleListQuery>,
): URLSearchParams {
  const full = { ...DEFAULT_PEOPLE_LIST_QUERY, ...query };
  const params = new URLSearchParams();

  if (full.search) params.set('search', full.search);
  if (full.sortBy !== 'name') params.set('sortBy', full.sortBy);
  if (full.sortDirection !== 'asc') {
    params.set('sortDirection', full.sortDirection);
  }
  if (full.page > 1) params.set('page', String(full.page));

  return params;
}

function pick<T extends string>(
  value: string | null,
  allowed: T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
