import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Person } from '@kindred/types';

vi.mock('../api/people', () => ({ peopleApi: { create: vi.fn() } }));

const { peopleApi } = await import('../api/people');
const { default: SetupPage } = await import('./SetupPage');
const { renderRota } = await import('../test-utils');

const montar = () =>
  renderRota(
    [
      { path: '/setup', element: <SetupPage /> },
      { path: '/people', element: <p>lista</p> },
    ],
    '/setup',
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(peopleApi.create).mockResolvedValue({ id: 'eu' } as Person);
});

describe('SetupPage', () => {
  it('cadastra a pessoa central e segue para a lista', async () => {
    const user = userEvent.setup();
    const { router } = montar();

    await user.type(screen.getByLabelText('Nome *'), 'Miguel Souza');
    await user.selectOptions(screen.getByLabelText('Sexo'), 'MALE');
    await user.click(screen.getByRole('button', { name: 'Começar' }));

    expect(peopleApi.create).toHaveBeenCalledWith({
      name: 'Miguel Souza',
      sex: 'MALE',
      relationshipType: 'FAMILY',
      isCentralUser: true,
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/people'));
  });

  it('não manda campo em branco como string vazia', async () => {
    // Data e foto em branco ficam **de fora** do payload; "" não é uma data.
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText('Nome *'), 'Sem Nada');
    await user.click(screen.getByRole('button', { name: 'Começar' }));

    const payload = vi.mocked(peopleApi.create).mock.calls[0][0];
    expect(payload).not.toHaveProperty('birthDate');
    expect(payload).not.toHaveProperty('profilePhoto');
    expect(payload.sex).toBeNull();
  });

  it('o nome é obrigatório: sem ele o formulário não envia', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('button', { name: 'Começar' }));

    expect(peopleApi.create).not.toHaveBeenCalled();
  });
});
