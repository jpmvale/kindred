import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Location } from '@kindred/types';

vi.mock('../api/locations', () => ({
  locationsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const { locationsApi } = await import('../api/locations');
const { locationsLoader } = await import('../loaders');
const { default: LocationsPage } = await import('./LocationsPage');
const { renderRota } = await import('../test-utils');

const local = (name: string): Location => ({ id: name.toLowerCase(), name }) as Location;

const montar = () =>
  renderRota(
    [{ path: '/locations', element: <LocationsPage />, loader: locationsLoader }],
    '/locations',
  );

const cartao = (nome: string) =>
  screen.getByText(nome).closest('.card') as HTMLElement;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.mocked(locationsApi.getAll).mockResolvedValue([local('Curitiba'), local('Recife')]);
});

describe('LocationsPage', () => {
  it('lista o que o loader trouxe', async () => {
    montar();

    expect(await screen.findByText('Curitiba')).toBeInTheDocument();
    expect(screen.getByText('Recife')).toBeInTheDocument();
  });

  it('adicionar recarrega a lista do servidor, em vez de remendar a local', async () => {
    // A ordenação é do servidor; inserir na mão local acabaria fora de ordem.
    const user = userEvent.setup();
    vi.mocked(locationsApi.create).mockResolvedValue(local('Bauru'));
    montar();
    await screen.findByText('Curitiba');

    vi.mocked(locationsApi.getAll).mockResolvedValue([
      local('Bauru'),
      local('Curitiba'),
      local('Recife'),
    ]);
    await user.type(screen.getByLabelText('Novo local'), 'Bauru');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(locationsApi.create).toHaveBeenCalledWith({ name: 'Bauru' });
    expect(await screen.findByText('Bauru')).toBeInTheDocument();
    const nomes = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(nomes).toEqual(['Bauru', 'Curitiba', 'Recife']);
  });

  it('não adiciona local com nome em branco', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText('Curitiba');

    await user.type(screen.getByLabelText('Novo local'), '   ');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(locationsApi.create).not.toHaveBeenCalled();
  });

  it('editar troca o nome pelo campo e salva', async () => {
    const user = userEvent.setup();
    vi.mocked(locationsApi.update).mockResolvedValue(local('Curitiba, PR'));
    montar();
    await screen.findByText('Curitiba');

    await user.click(within(cartao('Curitiba')).getByTitle('Editar'));
    const campo = screen.getByDisplayValue('Curitiba');
    await user.clear(campo);
    await user.type(campo, 'Curitiba, PR');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(locationsApi.update).toHaveBeenCalledWith('curitiba', {
      name: 'Curitiba, PR',
    });
  });

  it('Escape desiste da edição sem salvar', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText('Curitiba');

    await user.click(within(cartao('Curitiba')).getByTitle('Editar'));
    await user.type(screen.getByDisplayValue('Curitiba'), 'xxx{Escape}');

    expect(locationsApi.update).not.toHaveBeenCalled();
    expect(await screen.findByText('Curitiba')).toBeInTheDocument();
  });

  it('remover pede confirmação', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    montar();
    await screen.findByText('Curitiba');

    await user.click(within(cartao('Curitiba')).getByTitle('Remover'));
    expect(locationsApi.remove).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(locationsApi.remove).mockResolvedValue(undefined as never);
    await user.click(within(cartao('Curitiba')).getByTitle('Remover'));

    expect(locationsApi.remove).toHaveBeenCalledWith('curitiba');
    await waitFor(() => expect(locationsApi.getAll).toHaveBeenCalledTimes(2));
  });
});
