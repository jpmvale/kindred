import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import type { AuthUser } from '@kindred/types';

vi.mock('../api/auth', () => ({ authApi: { register: vi.fn() } }));

const { authApi } = await import('../api/auth');
const { default: RegisterPage } = await import('./RegisterPage');
const { renderRota } = await import('../test-utils');

const montar = () =>
  renderRota(
    [
      { path: '/register', element: <RegisterPage /> },
      { path: '/login', element: <p>login</p> },
      { path: '/setup', element: <p>setup</p> },
    ],
    '/register',
  );

const erro409 = (message: string) =>
  Object.assign(new AxiosError(message), {
    response: { status: 409, data: { message } },
  });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RegisterPage', () => {
  it('cadastro certo navega para /setup — a conta ainda não tem pessoa central', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.register).mockResolvedValue({ id: 'u1' } as AuthUser);
    const { router } = montar();

    await user.type(screen.getByLabelText('Nome *'), 'Ana Souza');
    await user.type(screen.getByLabelText('E-mail *'), 'ana@x.com');
    await user.type(screen.getByLabelText('Senha *'), 'senha12345');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(authApi.register).toHaveBeenCalledWith({
      name: 'Ana Souza',
      email: 'ana@x.com',
      password: 'senha12345',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup'));
  });

  it('e-mail duplicado mostra mensagem específica, sem navegar', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.register).mockRejectedValue(erro409('conflito'));
    const { router } = montar();

    await user.type(screen.getByLabelText('Nome *'), 'Ana Souza');
    await user.type(screen.getByLabelText('E-mail *'), 'ana@x.com');
    await user.type(screen.getByLabelText('Senha *'), 'senha12345');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByText(/já tem conta — tente entrar/),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/register');
  });

  it('tem link para entrar', () => {
    montar();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
