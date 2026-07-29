import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import type { AuthUser } from '@kindred/types';

vi.mock('../api/auth', () => ({ authApi: { login: vi.fn() } }));

const { authApi } = await import('../api/auth');
const { default: LoginPage } = await import('./LoginPage');
const { renderRota } = await import('../test-utils');

const montar = () =>
  renderRota(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <p>registro</p> },
      { path: '/people', element: <p>lista</p> },
    ],
    '/login',
  );

/** A API responde 401 com `message` — o mesmo formato para e-mail e senha errados. */
const erro401 = (message: string) =>
  Object.assign(new AxiosError(message), {
    response: { status: 401, data: { message } },
  });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('LoginPage', () => {
  it('login certo navega para /people', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({ id: 'u1' } as AuthUser);
    const { router } = montar();

    await user.type(screen.getByLabelText('E-mail *'), 'ana@x.com');
    await user.type(screen.getByLabelText('Senha *'), 'senha12345');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(authApi.login).toHaveBeenCalledWith({
      email: 'ana@x.com',
      password: 'senha12345',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/people'));
  });

  it('credenciais erradas mostram mensagem, sem navegar', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockRejectedValue(erro401('E-mail ou senha inválidos'));
    const { router } = montar();

    await user.type(screen.getByLabelText('E-mail *'), 'ana@x.com');
    await user.type(screen.getByLabelText('Senha *'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('tem link para criar conta', async () => {
    montar();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});
