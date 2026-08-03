import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoaderFunctionArgs } from 'react-router-dom';
import type { AuthUser, Person } from '@kindred/types';

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

vi.mock('./api/auth', () => ({
  authApi: { me: vi.fn() },
}));

const { peopleApi } = await import('./api/people');
const { locationsApi } = await import('./api/locations');
const { authApi } = await import('./api/auth');
const {
  guestOnlyLoader,
  layoutLoader,
  peopleListLoader,
  personFormLoader,
  setupLoader,
} = await import('./loaders');

const pessoa = (over: Partial<Person> = {}) =>
  ({
    id: 'p1',
    name: 'Miguel Souza',
    relationshipType: 'FAMILY',
    isCentralUser: true,
    ...over,
  }) as Person;

const usuario = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  name: 'Miguel Souza',
  email: 'miguel@teste.local',
  ...over,
});

/** `authApi.me()` dá 401 sem sessão — o dublê rejeita, como o axios faria. */
const semSessao = () => Promise.reject(new Error('401'));

/** O router passa um `Request`; só a URL interessa aos loaders. */
const args = (url: string, params: Record<string, string> = {}) =>
  ({ request: new Request(url), params }) as unknown as LoaderFunctionArgs;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(peopleApi.getAll).mockResolvedValue([]);
  vi.mocked(locationsApi.getAll).mockResolvedValue([]);
  vi.mocked(peopleApi.getPage).mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  // Logado por padrão — os testes de "sem sessão" sobrescrevem isto.
  vi.mocked(authApi.me).mockResolvedValue(usuario());
});

describe('layoutLoader', () => {
  it('desvia para o /login quando não há sessão — antes mesmo de checar pessoa central', async () => {
    vi.mocked(authApi.me).mockImplementation(semSessao);

    const resposta = (await layoutLoader(args('http://x/people'))) as Response;

    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('Location')).toBe('/login');
    // Nem chegou a perguntar sobre pessoa central.
    expect(peopleApi.getCentral).not.toHaveBeenCalled();
  });

  it('com sessão, desvia para o /setup quando não há pessoa central', async () => {
    vi.mocked(peopleApi.getCentral).mockResolvedValue(null);

    const resposta = (await layoutLoader(args('http://x/people'))) as Response;

    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('Location')).toBe('/setup');
  });

  it('deixa passar quando há sessão e pessoa central', async () => {
    vi.mocked(peopleApi.getCentral).mockResolvedValue(pessoa());

    expect(await layoutLoader(args('http://x/people'))).toEqual({
      user: usuario(),
      central: pessoa(),
    });
  });

  it('não desvia para /setup quando o destino já é o /backup — é para lá que se vai sem central', async () => {
    vi.mocked(peopleApi.getCentral).mockResolvedValue(null);

    const resultado = await layoutLoader(args('http://x/backup'));

    expect(resultado).toEqual({ user: usuario(), central: null });
  });

  it('as Configurações também dispensam pessoa central — é de lá que se restaura hoje', async () => {
    // O /backup virou seção de /settings (ADR-027). Sem a exceção valer para o
    // endereço novo, quem perdeu a base era mandado ao /setup e não chegava na
    // restauração — justamente o que a exceção existe para permitir.
    vi.mocked(peopleApi.getCentral).mockResolvedValue(null);

    const resultado = await layoutLoader(args('http://x/settings'));

    expect(resultado).toEqual({ user: usuario(), central: null });
    expect(peopleApi.getCentral).not.toHaveBeenCalled();
  });

  it('o /backup continua exigindo sessão, mesmo sendo a exceção de pessoa central', async () => {
    vi.mocked(authApi.me).mockImplementation(semSessao);

    const resposta = (await layoutLoader(args('http://x/backup'))) as Response;

    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('Location')).toBe('/login');
  });

  it('no /backup, nem chega a perguntar sobre pessoa central — a checagem é pulada, não só o desvio', async () => {
    await layoutLoader(args('http://x/backup'));

    expect(peopleApi.getCentral).not.toHaveBeenCalled();
  });
});

describe('setupLoader', () => {
  it('sem sessão, desvia para /login', async () => {
    vi.mocked(authApi.me).mockImplementation(semSessao);

    const resposta = (await setupLoader()) as Response;

    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('Location')).toBe('/login');
  });

  it('com sessão, deixa passar', async () => {
    expect(await setupLoader()).toBeNull();
  });
});

describe('guestOnlyLoader', () => {
  it('sem sessão, deixa ver a tela de login/registro', async () => {
    vi.mocked(authApi.me).mockImplementation(semSessao);

    expect(await guestOnlyLoader()).toBeNull();
  });

  it('já logado, manda direto para /people em vez de mostrar o formulário de novo', async () => {
    const resposta = (await guestOnlyLoader()) as Response;

    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('Location')).toBe('/people');
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
