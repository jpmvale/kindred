import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import type { AuthUser } from '@kindred/types';

vi.mock('../api/auth', () => ({
  authApi: { me: vi.fn(), updateMe: vi.fn() },
}));

const { authApi } = await import('../api/auth');
const { accountLoader } = await import('../loaders');
const { default: SettingsPage } = await import('./SettingsPage');
const { renderRota } = await import('../test-utils');

const usuario: AuthUser = { id: 'u1', name: 'Ana Souza', email: 'ana@x.com' };

const montar = () =>
  renderRota(
    [{ path: '/settings', element: <SettingsPage />, loader: accountLoader }],
    '/settings',
  );

const erro = (status: number, message: string) =>
  Object.assign(new AxiosError(message), {
    response: { status, data: { message } },
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authApi.me).mockResolvedValue(usuario);
});

describe('Configurações — conta', () => {
  it('carrega o e-mail atual do loader', async () => {
    montar();
    expect(await screen.findByDisplayValue('ana@x.com')).toBeInTheDocument();
  });

  it('exige senha atual mesmo para só trocar o e-mail', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByDisplayValue('ana@x.com');

    const campoEmail = screen.getByLabelText('E-mail');
    await user.clear(campoEmail);
    await user.type(campoEmail, 'nova@x.com');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    // `required` no HTML barra o submit sem passar pelo handler.
    expect(authApi.updateMe).not.toHaveBeenCalled();
  });

  it('troca o e-mail e mostra mensagem de sucesso', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.updateMe).mockResolvedValue({
      ...usuario,
      email: 'nova@x.com',
    });
    montar();
    await screen.findByDisplayValue('ana@x.com');

    await user.clear(screen.getByLabelText('E-mail'));
    await user.type(screen.getByLabelText('E-mail'), 'nova@x.com');
    await user.type(screen.getByLabelText('Senha atual *'), 'senha1234');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(authApi.updateMe).toHaveBeenCalledWith({
      currentPassword: 'senha1234',
      email: 'nova@x.com',
      newPassword: undefined,
    });
    expect(await screen.findByText('Conta atualizada.')).toBeInTheDocument();
  });

  it('senha nova sem confirmação igual não envia nada', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByDisplayValue('ana@x.com');

    await user.type(screen.getByLabelText('Nova senha'), 'senhanova123');
    await user.type(screen.getByLabelText('Confirmar senha nova'), 'diferente');
    await user.type(screen.getByLabelText('Senha atual *'), 'senha1234');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(authApi.updateMe).not.toHaveBeenCalled();
    expect(
      await screen.findByText('A confirmação não bate com a senha nova.'),
    ).toBeInTheDocument();
  });

  it('senha atual errada mostra mensagem específica', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.updateMe).mockRejectedValue(erro(401, 'Senha atual incorreta'));
    montar();
    await screen.findByDisplayValue('ana@x.com');

    await user.type(screen.getByLabelText('Nova senha'), 'senhanova123');
    await user.type(screen.getByLabelText('Confirmar senha nova'), 'senhanova123');
    await user.type(screen.getByLabelText('Senha atual *'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Senha atual incorreta.')).toBeInTheDocument();
  });

  it('e-mail já usado por outra conta mostra mensagem de conflito', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.updateMe).mockRejectedValue(erro(409, 'conflito'));
    montar();
    await screen.findByDisplayValue('ana@x.com');

    await user.clear(screen.getByLabelText('E-mail'));
    await user.type(screen.getByLabelText('E-mail'), 'ocupado@x.com');
    await user.type(screen.getByLabelText('Senha atual *'), 'senha1234');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(screen.getByText('Este e-mail já tem conta.')).toBeInTheDocument(),
    );
  });
});
