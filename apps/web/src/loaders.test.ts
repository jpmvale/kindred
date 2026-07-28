import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoaderFunctionArgs } from 'react-router-dom';
import type { Person } from '@kindred/types';

vi.mock('./api/people', () => ({
  peopleApi: {
    getAll: vi.fn(),
    getPage: vi.fn(),
    getCentral: vi.fn(),
    getOne: vi.fn(),
  },
}));

vi.mock('./api/locations', () => ({
  locationsApi: { getAll: vi.fn() },
}));

const { peopleApi } = await import('./api/people');
const { locationsApi } = await import('./api/locations');
const { layoutLoader, peopleListLoader, personFormLoader } = await import(
  './loaders'
);

const pessoa = (over: Partial<Person> = {}) =>
  ({
    id: 'p1',
    name: 'Miguel Souza',
    relationshipType: 'FAMILY',
    isCentralUser: true,
    ...over,
  }) as Person;

/** O router passa um `Request`; só a URL interessa aos loaders. */
const args = (url: string, params: Record<string, string> = {}) =>
  ({ request: new Request(url), params }) as unknown as LoaderFunctionArgs;

beforeEach(() => {
  vi.mocked(peopleApi.getAll).mockResolvedValue([]);
  vi.mocked(locationsApi.getAll).mockResolvedValue([]);
  vi.mocked(peopleApi.getPage).mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
});

describe('layoutLoader', () => {
  it('desvia para o /setup quando não há pessoa central', async () => {
    vi.mocked(peopleApi.getCentral).mockResolvedValue(null);

    const resposta = (await layoutLoader(args('http://x/people'))) as Response;

    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('Location')).toBe('/setup');
  });

  it('deixa passar quando há', async () => {
    vi.mocked(peopleApi.getCentral).mockResolvedValue(pessoa());

    expect(await layoutLoader(args('http://x/people'))).toEqual({
      central: pessoa(),
    });
  });

  it('não desvia quando o destino já é o /backup — é para lá que se vai sem central', async () => {
    vi.mocked(peopleApi.getCentral).mockResolvedValue(null);

    const resultado = await layoutLoader(args('http://x/backup'));

    expect(resultado).toEqual({ central: null });
  });

  it('deixa passar o /backup normalmente quando há pessoa central', async () => {
    vi.mocked(peopleApi.getCentral).mockResolvedValue(pessoa());

    expect(await layoutLoader(args('http://x/backup'))).toEqual({
      central: pessoa(),
    });
  });
});

describe('peopleListLoader', () => {
  it('traduz a URL nos parâmetros da API', async () => {
    await peopleListLoader(
      args('http://x/people?search=jose&sortBy=age&sortDirection=desc&page=2'),
    );

    expect(peopleApi.getPage).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      search: 'jose',
      sortBy: 'age',
      sortDirection: 'desc',
    });
  });

  it('manda busca vazia como ausente, não como string vazia', async () => {
    // `search=` na URL não é uma busca por nada: é não buscar.
    await peopleListLoader(args('http://x/people?search='));

    expect(peopleApi.getPage).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
    );
  });

  it('devolve os parâmetros lidos junto com a resposta', async () => {
    const dados = await peopleListLoader(args('http://x/people?search=maria'));

    expect(dados.query.search).toBe('maria');
    expect(dados.result.total).toBe(0);
  });
});

describe('personFormLoader', () => {
  it('no cadastro, não busca pessoa nenhuma', async () => {
    const dados = await personFormLoader(args('http://x/people/new'));

    expect(peopleApi.getOne).not.toHaveBeenCalled();
    expect(dados.person).toBeNull();
  });

  it('na edição, carrega a pessoa do parâmetro', async () => {
    vi.mocked(peopleApi.getOne).mockResolvedValue(pessoa({ id: 'p9' }));

    const dados = await personFormLoader(
      args('http://x/people/p9/edit', { id: 'p9' }),
    );

    expect(peopleApi.getOne).toHaveBeenCalledWith('p9');
    expect(dados.person?.id).toBe('p9');
  });
});
