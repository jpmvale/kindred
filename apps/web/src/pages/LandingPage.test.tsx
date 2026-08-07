import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthUser } from '@kindred/types';

vi.mock('../api/auth', () => ({ authApi: { me: vi.fn() } }));

const { authApi } = await import('../api/auth');
const { default: LandingPage } = await import('./LandingPage');
const { landingLoader } = await import('../loaders');
const { renderRota, urlAtual } = await import('../test-utils');

const montar = () =>
  renderRota(
    [
      { path: '/', element: <LandingPage />, loader: landingLoader },
      { path: '/login', element: <p>entrar</p> },
      { path: '/register', element: <p>criar conta</p> },
      { path: '/people', element: <p>lista</p> },
    ],
    '/',
  );

beforeEach(() => {
  vi.resetAllMocks();
});

describe('LandingPage', () => {
  /** Sem sessão, `GET /auth/me` responde 401 — é a resposta normal do visitante. */
  const semSessao = () => vi.mocked(authApi.me).mockRejectedValue(new Error('401'));

  it('apresenta o app para quem chega sem sessão', async () => {
    semSessao();

    montar();

    expect(
      await screen.findByRole('heading', { name: /árvore genealógica/i }),
    ).toBeInTheDocument();
  });

  /*
   * A razão de a rota existir: antes, quem abria o endereço caía no login sem
   * uma palavra sobre o que o kindred é. Se este teste passar a falhar porque a
   * raiz voltou a redirecionar, é a regressão que interessa.
   */
  it('não manda o visitante para o login', async () => {
    semSessao();

    const { router } = montar();

    await waitFor(() => expect(urlAtual(router)).toBe('/'));
  });

  it('quem já tem sessão vai direto para dentro do app', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ id: 'u1' } as AuthUser);

    const { router } = montar();

    await waitFor(() => expect(urlAtual(router)).toBe('/people'));
  });

  it('leva ao cadastro e ao login pelos dois caminhos', async () => {
    semSessao();
    const user = userEvent.setup();
    const { router } = montar();
    await screen.findByRole('heading', { name: /árvore genealógica/i });

    // Há um "Criar conta" no topo e outro na chamada principal; os dois valem.
    await user.click(screen.getAllByRole('link', { name: 'Criar conta' })[0]);
    await waitFor(() => expect(urlAtual(router)).toBe('/register'));
  });

  it('diz que cada conta tem a própria árvore', async () => {
    semSessao();

    montar();

    expect(await screen.findByText(/isolada das demais/i)).toBeInTheDocument();
  });
});
