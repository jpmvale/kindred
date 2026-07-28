/*
 * Os loaders das rotas (ADR-010).
 *
 * O router chama estas funções **antes** de renderizar a página; a página só lê o
 * resultado com `useLoaderData`. É o que tira o `fetch` de dentro do `useEffect`:
 * ninguém mais renderiza vazio, chama a API e volta com `setState`.
 *
 * Ficam todos juntos de propósito — lado a lado dá para ver de relance o que cada
 * tela precisa carregar, e nenhum deles é grande o bastante para pedir arquivo
 * próprio.
 */

import { redirect, type LoaderFunctionArgs } from 'react-router-dom';
import type {
  Location,
  PaginatedPeopleResponse,
  Person,
} from '@kindred/types';
import { peopleApi } from './api/people';
import { locationsApi } from './api/locations';
import {
  PEOPLE_PAGE_SIZE,
  parsePeopleListQuery,
  type PeopleListQuery,
} from './pages/people-list-query';

/**
 * Porta de entrada: sem pessoa central não há parentesco para calcular, então o
 * app inteiro desvia para o cadastro dela (RN-001). O `/setup` fica fora deste
 * layout justamente para não cair no próprio desvio.
 *
 * O `/backup` é a **exceção** dentro do layout: é para lá que se vai depois de
 * perder a base (o cenário que motiva restaurar um backup, para começo de
 * conversa), então ele não pode ficar atrás do mesmo desvio que ele existe
 * para resolver.
 */
export async function layoutLoader({ request }: LoaderFunctionArgs) {
  const indoParaBackup = new URL(request.url).pathname === '/backup';
  const central = await peopleApi.getCentral();
  if (!central && !indoParaBackup) return redirect('/setup');
  return { central };
}

export type PeopleListData = {
  query: PeopleListQuery;
  result: PaginatedPeopleResponse;
};

export async function peopleListLoader({
  request,
}: LoaderFunctionArgs): Promise<PeopleListData> {
  const query = parsePeopleListQuery(new URL(request.url).searchParams);
  const result = await peopleApi.getPage({
    page: query.page,
    limit: PEOPLE_PAGE_SIZE,
    search: query.search || undefined,
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
  });
  return { query, result };
}

export type PersonFormPageData = {
  /** Candidatos a pai, mãe e cônjuge. */
  people: Person[];
  locations: Location[];
  /** Nulo no cadastro; a pessoa carregada na edição. */
  person: Person | null;
};

export async function personFormLoader({ params }: LoaderFunctionArgs) {
  const [people, locations, person] = await Promise.all([
    peopleApi.getAll(),
    locationsApi.getAll(),
    params.id ? peopleApi.getOne(params.id) : Promise.resolve(null),
  ]);
  return { people, locations, person } satisfies PersonFormPageData;
}

export async function locationsLoader(): Promise<Location[]> {
  return locationsApi.getAll();
}

export async function peopleLoader(): Promise<Person[]> {
  return peopleApi.getAll();
}
