import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PaginatedPeopleResponse, Person } from '@kindred/types';

vi.mock('../api/people', () => ({
  peopleApi: { getPage: vi.fn(), remove: vi.fn() },
}));

const { peopleApi } = await import('../api/people');
const { peopleListLoader } = await import('../loaders');
const { default: PeopleListPage } = await import('./PeopleListPage');
const { renderRota, urlAtual, adiada } = await import('../test-utils');

const pessoa = (name: string, over: Partial<Person> = {}): Person =>
  ({
    id: name.toLowerCase().replace(/\W/g, ''),
    name,
    relationshipType: 'FAMILY',
    isCentralUser: false,
    ...over,
  }) as Person;

const pagina = (
  pessoas: Person[],
  over: Partial<PaginatedPeopleResponse> = {},
): PaginatedPeopleResponse => ({
  data: pessoas,
  total: pessoas.length,
  page: 1,
  limit: 10,
  totalPages: 1,
  ...over,
});

function montar(url = '/people') {
  return renderRota(
    [{ path: '/people', element: <PeopleListPage />, loader: peopleListLoader }],
    url,
  );
}

const campoDeBusca = () => screen.getByLabelText('Busca');

beforeEach(() => {
  // `mockResolvedValueOnce` deixa fila; sem o reset, um teste herda o dublê do
  // anterior.
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.mocked(peopleApi.getPage).mockResolvedValue(pagina([pessoa('Maria Souza')]));
  vi.mocked(peopleApi.remove).mockResolvedValue(undefined as never);
});

describe('PeopleListPage', () => {
  it('mostra quem o loader trouxe, com o total', async () => {
    vi.mocked(peopleApi.getPage).mockResolvedValue(
      pagina([pessoa('Maria Souza'), pessoa('José Lima')], { total: 2 }),
    );
    montar();

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('José Lima')).toBeInTheDocument();
    expect(screen.getByText('2 pessoa(s) encontrada(s)')).toBeInTheDocument();
  });

  it('a URL é quem manda: busca e ordenação chegam nos campos', async () => {
    montar('/people?search=maria&sortBy=age&sortDirection=desc');

    await screen.findByText('Maria Souza');
    expect(campoDeBusca()).toHaveValue('maria');
    expect(screen.getByLabelText('Ordenar por')).toHaveValue('age');
    expect(screen.getByLabelText('Direção')).toHaveValue('desc');
  });

  it('digitar leva a busca para a URL depois do debounce', async () => {
    const user = userEvent.setup();
    const { router } = montar();
    await screen.findByText('Maria Souza');

    await user.type(campoDeBusca(), 'maria');

    await waitFor(() => expect(urlAtual(router)).toBe('/people?search=maria'));
    expect(peopleApi.getPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'maria', page: 1 }),
    );
  });

  it('não perde o que foi digitado enquanto a busca anterior volta', async () => {
    // O defeito do BL-11: a resposta do próprio debounce contava como "a URL
    // mudou por fora" e realinhava o campo, apagando as letras novas.
    const user = userEvent.setup();
    const emVoo = adiada<PaginatedPeopleResponse>();
    vi.mocked(peopleApi.getPage).mockResolvedValueOnce(pagina([pessoa('Maria Souza')]));
    montar();
    await screen.findByText('Maria Souza');

    vi.mocked(peopleApi.getPage).mockReturnValueOnce(emVoo.promessa);
    await user.type(campoDeBusca(), 'mari');
    await waitFor(() =>
      expect(peopleApi.getPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'mari' }),
      ),
    );

    // a pessoa continua digitando enquanto a busca de "mari" ainda está no ar
    await user.type(campoDeBusca(), 'a');
    emVoo.resolver(pagina([pessoa('Maria Souza')]));

    await waitFor(() =>
      expect(peopleApi.getPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'maria' }),
      ),
    );
    expect(campoDeBusca()).toHaveValue('maria');
  });

  it('o voltar do navegador realinha o campo de busca', async () => {
    const user = userEvent.setup();
    const { router } = montar('/people?search=maria');
    await screen.findByText('Maria Souza');

    await user.clear(campoDeBusca());
    await waitFor(() => expect(urlAtual(router)).toBe('/people'));

    // o debounce navega com `replace`, então quem tem histórico é a entrada inicial
    expect(campoDeBusca()).toHaveValue('');
  });

  it('mudar a ordenação volta para a primeira página', async () => {
    const user = userEvent.setup();
    const { router } = montar('/people?page=3');
    await screen.findByText('Maria Souza');

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'age');

    await waitFor(() => expect(urlAtual(router)).toBe('/people?sortBy=age'));
  });

  it('a paginação anda pela URL e trava nas pontas', async () => {
    const user = userEvent.setup();
    vi.mocked(peopleApi.getPage).mockResolvedValue(
      pagina([pessoa('Maria Souza')], { total: 23, totalPages: 3 }),
    );
    const { router } = montar();
    await screen.findByText('Maria Souza');

    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Próxima/ }));

    await waitFor(() => expect(urlAtual(router)).toBe('/people?page=2'));
  });

  it('o vazio da busca é diferente do vazio do cadastro', async () => {
    vi.mocked(peopleApi.getPage).mockResolvedValue(pagina([]));

    const { unmount } = montar();
    expect(
      await screen.findByText('Nenhuma pessoa cadastrada ainda.'),
    ).toBeInTheDocument();
    unmount();

    montar('/people?search=zzz');
    expect(
      await screen.findByText('Nenhuma pessoa encontrada para esta busca.'),
    ).toBeInTheDocument();
  });

  it('remover pede confirmação e recarrega a lista', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    montar();
    const card = (await screen.findByText('Maria Souza')).closest('.card')!;

    await user.click(within(card as HTMLElement).getByTitle('Remover'));

    expect(peopleApi.remove).toHaveBeenCalledWith('mariasouza');
    await waitFor(() => expect(peopleApi.getPage).toHaveBeenCalledTimes(2));
  });

  it('desistir da confirmação não remove nada', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    montar();
    const card = (await screen.findByText('Maria Souza')).closest('.card')!;

    await user.click(within(card as HTMLElement).getByTitle('Remover'));

    expect(peopleApi.remove).not.toHaveBeenCalled();
  });
});
