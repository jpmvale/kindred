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
  AuthUser,
  Location,
  PaginatedPeopleResponse,
  Person,
} from '@kindred/types';
import { peopleApi } from './api/people';
import { locationsApi } from './api/locations';
import { authApi } from './api/auth';
import {
  PEOPLE_PAGE_SIZE,
  parsePeopleListQuery,
  type PeopleListQuery,
} from './pages/people-list-query';

/** `GET /auth/me` dá 401 sem sessão — isso não é exceção, é a resposta normal
 * de "ninguém logado", então vira `null` em vez de propagar o erro. */
async function currentUser(): Promise<AuthUser | null> {
  try {
    return await authApi.me();
  } catch {
    return null;
  }
}

/**
 * Porta de entrada: sem sessão, não há de quem ser a árvore — desvia para
 * `/login` antes mesmo de perguntar sobre pessoa central (BL-10). Só depois
 * de logado é que a checagem de sempre entra: sem pessoa central não há
 * parentesco para calcular, então o app desvia para o cadastro dela (RN-001).
 * O `/setup` fica fora deste layout justamente para não cair no próprio desvio.
 *
 * As **Configurações** são a exceção dentro do layout: é para lá que se vai
 * depois de perder a base (o cenário que motiva restaurar um backup, para começo
 * de conversa) — precisa de sessão como qualquer outra tela, mas não precisa de
 * pessoa central, que é justamente o que a restauração existe para repor.
 *
 * `/backup` continua na lista porque ainda é endereço válido: ele redireciona
 * para `/settings` (ADR-027), e sem a exceção nos dois o desvio para o `/setup`
 * pegaria a pessoa no meio do caminho — o loader roda antes de o redirecionamento
 * acontecer.
 */
const SEM_PESSOA_CENTRAL = ['/settings', '/backup'];

export async function layoutLoader({ request }: LoaderFunctionArgs) {
  const indoParaBackup = SEM_PESSOA_CENTRAL.includes(new URL(request.url).pathname);

  const user = await currentUser();
  if (!user) return redirect('/login');

  const central = indoParaBackup ? null : await peopleApi.getCentral();
  if (!central && !indoParaBackup) return redirect('/setup');
  return { user, central };
}

/** `/setup` fica fora do layout (ver acima), então precisa da própria checagem
 * de sessão — sem ela, o formulário apareceria para quem nem está logado. */
export async function setupLoader() {
  const user = await currentUser();
  if (!user) return redirect('/login');
  return null;
}

/** `/login` e `/register` são para quem **não** está logado — chegar neles já
 * autenticado (aba antiga, voltar do navegador) manda direto para a árvore. */
export async function guestOnlyLoader() {
  const user = await currentUser();
  return user ? redirect('/people') : null;
}

/**
 * A raiz decide pelo visitante: apresentação para quem chega de fora, app para
 * quem já entrou.
 *
 * Antes `/` era um `<Navigate to="/people">` dentro do layout, e o layout exige
 * sessão — então todo visitante era despejado no login sem uma palavra sobre o
 * que o kindred é. Agora a rota fica fora do layout e é o loader que separa os
 * dois casos.
 *
 * O destino de quem tem sessão é `/people`, e não `/setup`: quem sabe se falta a
 * pessoa central é o `layoutLoader`, e mandar para lá é deixá-lo decidir como
 * decide para qualquer outra tela. Duplicar a checagem aqui criaria uma segunda
 * cópia da regra para divergir.
 */
export async function landingLoader() {
  const user = await currentUser();
  return user ? redirect('/people') : null;
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

/** `/account` já é uma rota protegida pelo `layoutLoader` — este loader só
 * pega o e-mail atual para pré-preencher o formulário (BL-16). */
export async function accountLoader(): Promise<AuthUser> {
  return authApi.me();
}

export async function peopleLoader(): Promise<Person[]> {
  return peopleApi.getAll();
}
