/*
 * Ferramentas dos testes de página (BL-08).
 *
 * As páginas leem os dados de `useLoaderData` (ADR-010), então montar uma delas
 * é montar uma **rota**: um router de memória com o loader de verdade e a API
 * dublada. O caminho que o teste exercita é o mesmo do navegador — URL, loader,
 * página —, só que sem rede.
 */

import type { ReactElement } from 'react';
import {
  createMemoryRouter,
  RouterProvider,
  type LoaderFunction,
} from 'react-router-dom';
import { render } from '@testing-library/react';

export type RotaDeTeste = {
  path: string;
  element: ReactElement;
  loader?: LoaderFunction;
};

export function renderRota(rotas: RotaDeTeste[], urlInicial: string) {
  const router = createMemoryRouter(rotas, { initialEntries: [urlInicial] });
  return { ...render(<RouterProvider router={router} />), router };
}

/** A URL atual do router de memória, do jeito que apareceria na barra. */
export function urlAtual(router: ReturnType<typeof renderRota>['router']) {
  const { pathname, search } = router.state.location;
  return `${pathname}${search}`;
}

/**
 * Uma promessa que o teste resolve na hora que quiser — é como se segura uma
 * resposta da API no ar para observar o que a tela faz enquanto espera.
 */
export function adiada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}
