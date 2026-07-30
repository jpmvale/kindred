import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

vi.mock('../api/backup', () => ({
  backupApi: {
    export: vi.fn(),
    restore: vi.fn(),
  },
}));

const { backupApi } = await import('../api/backup');
const { default: SettingsPage } = await import('./SettingsPage');
const { renderRota } = await import('../test-utils');

/** A seção de conta divide a tela com a de backup, e ela precisa do usuário. */
const usuário = { id: 'u1', name: 'Ana Souza', email: 'ana@x.com' };

/** Espera a rota resolver o loader antes de devolver: sem isso o corpo ainda está vazio. */
async function montar() {
  const resultado = renderRota(
    [{ path: '/settings', element: <SettingsPage />, loader: () => usuário }],
    '/settings',
  );
  await screen.findByRole('heading', { name: 'Backup' });
  return resultado;
}

/** Erro de axios com status e mensagem, do jeito que a API kindred devolve. */
function erroApi(status: number, message: string) {
  const erro = new Error(message) as Error & {
    isAxiosError: true;
    response: { status: number; data: { message: string } };
  };
  erro.isAxiosError = true;
  erro.response = { status, data: { message } };
  return erro;
}

const backupValido = (person = 1) => ({
  formato: 1,
  geradoEm: '2026-01-01T00:00:00.000Z',
  contagem: { Location: 2, Person: person, Union: 0, PersonPhoto: 0 },
  dados: {
    Location: [],
    Person: Array(person).fill({}),
    Union: [],
    PersonPhoto: [],
  },
});

const arquivoValido = (person = 1) =>
  new File([JSON.stringify(backupValido(person))], 'backup.json', {
    type: 'application/json',
  });

const campoArquivo = () => screen.getByLabelText('Arquivo de backup');

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.spyOn(axios, 'isAxiosError').mockImplementation(
    (e): e is never => Boolean((e as { isAxiosError?: boolean })?.isAxiosError),
  );
  // Substitui `window.location` por um dublê: sem isso, o jsdom loga erro de
  // navegação real quando o redirecionamento pós-restauração dispara.
  // @ts-expect-error -- dublê de teste, não precisa da interface inteira.
  delete window.location;
  // @ts-expect-error -- idem.
  window.location = { href: '' };
});

describe('Configurações — exportar backup', () => {
  it('baixa o backup e dispara o download', async () => {
    const user = userEvent.setup();
    const blob = new Blob(['{}'], { type: 'application/json' });
    vi.mocked(backupApi.export).mockResolvedValue({
      blob,
      filename: 'kindred-20260101-1200.json',
    });
    const clique = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    await montar();

    await user.click(screen.getByRole('button', { name: 'Baixar backup' }));

    expect(backupApi.export).toHaveBeenCalled();
    expect(clique).toHaveBeenCalledTimes(1);
  });

  it('mostra erro se o download falhar', async () => {
    const user = userEvent.setup();
    vi.mocked(backupApi.export).mockRejectedValue(new Error('rede caiu'));
    await montar();

    await user.click(screen.getByRole('button', { name: 'Baixar backup' }));

    expect(
      await screen.findByText('Não foi possível baixar o backup.'),
    ).toBeInTheDocument();
  });
});

describe('Configurações — importar backup', () => {
  it('lê o arquivo e mostra o resumo antes de restaurar', async () => {
    const user = userEvent.setup();
    await montar();

    await user.upload(campoArquivo(), arquivoValido(5));

    expect(await screen.findByText(/5 pessoa\(s\)/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Restaurar' }),
    ).toBeInTheDocument();
  });

  it('recusa arquivo que não é JSON', async () => {
    const user = userEvent.setup();
    await montar();

    const ruim = new File(['isto não é json'], 'ruim.json', {
      type: 'application/json',
    });
    await user.upload(campoArquivo(), ruim);

    expect(
      await screen.findByText('Não deu para ler esse arquivo como JSON.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Restaurar' }),
    ).not.toBeInTheDocument();
  });

  it('recusa arquivo que não tem cara de backup do kindred', async () => {
    const user = userEvent.setup();
    await montar();

    const estranho = new File([JSON.stringify({ nada: 'a ver' })], 'estranho.json', {
      type: 'application/json',
    });
    await user.upload(campoArquivo(), estranho);

    expect(
      await screen.findByText(
        'Esse arquivo não parece ser um backup do kindred.',
      ),
    ).toBeInTheDocument();
  });

  it('restaura direto quando o banco está vazio', async () => {
    const user = userEvent.setup();
    vi.mocked(backupApi.restore).mockResolvedValue({
      Location: 2,
      Person: 5,
      Union: 0,
      PersonPhoto: 0,
    });
    await montar();

    await user.upload(campoArquivo(), arquivoValido(5));
    await user.click(await screen.findByRole('button', { name: 'Restaurar' }));

    expect(backupApi.restore).toHaveBeenCalledWith(backupValido(5), false);
    expect(await screen.findByText(/Restaurado:/)).toBeInTheDocument();
  });

  it('banco ocupado: pede confirmação antes de apagar, sem restaurar sozinho', async () => {
    const user = userEvent.setup();
    vi.mocked(backupApi.restore).mockRejectedValueOnce(
      erroApi(409, 'O banco já tem 143 pessoa(s).'),
    );
    await montar();

    await user.upload(campoArquivo(), arquivoValido(5));
    await user.click(await screen.findByRole('button', { name: 'Restaurar' }));

    expect(
      await screen.findByText('O banco já tem 143 pessoa(s).'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apagar e restaurar' }),
    ).toBeInTheDocument();
    expect(backupApi.restore).toHaveBeenCalledWith(backupValido(5), false);
    expect(backupApi.restore).not.toHaveBeenCalledWith(backupValido(5), true);
  });

  it('cancelar a confirmação desiste sem chamar a API de novo', async () => {
    const user = userEvent.setup();
    vi.mocked(backupApi.restore).mockRejectedValueOnce(
      erroApi(409, 'O banco já tem 143 pessoa(s).'),
    );
    await montar();

    await user.upload(campoArquivo(), arquivoValido(5));
    await user.click(await screen.findByRole('button', { name: 'Restaurar' }));
    await screen.findByRole('button', { name: 'Apagar e restaurar' });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(
      screen.queryByRole('button', { name: 'Apagar e restaurar' }),
    ).not.toBeInTheDocument();
    expect(backupApi.restore).toHaveBeenCalledTimes(1);
  });

  it('confirmar a sobreposição restaura com force', async () => {
    const user = userEvent.setup();
    vi.mocked(backupApi.restore)
      .mockRejectedValueOnce(erroApi(409, 'O banco já tem 143 pessoa(s).'))
      .mockResolvedValueOnce({ Location: 2, Person: 5, Union: 0, PersonPhoto: 0 });
    await montar();

    await user.upload(campoArquivo(), arquivoValido(5));
    await user.click(await screen.findByRole('button', { name: 'Restaurar' }));
    await user.click(
      await screen.findByRole('button', { name: 'Apagar e restaurar' }),
    );

    expect(backupApi.restore).toHaveBeenLastCalledWith(backupValido(5), true);
    expect(await screen.findByText(/Restaurado:/)).toBeInTheDocument();
  });
});
