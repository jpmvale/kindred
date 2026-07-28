/*
 * Teste de fumaça da árvore.
 *
 * O que a árvore desenha — quem aparece, onde cada nó fica, o casal encostado —
 * é testado no módulo puro (`tree-layout.test.ts`), sem DOM e sem reactflow.
 * Aqui só se verifica que a página monta em cima do loader, mostra os controles
 * e chega aos nós: no jsdom o reactflow não mede nada, então medir posição por
 * aqui seria medir o dublê.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Person } from '@kindred/types';

vi.mock('../api/people', () => ({ peopleApi: { getAll: vi.fn() } }));

const { peopleApi } = await import('../api/people');
const { peopleLoader } = await import('../loaders');
const { default: TreePage } = await import('./TreePage');
const { renderRota } = await import('../test-utils');

const pessoa = (name: string, over: Partial<Person> = {}): Person =>
  ({
    id: name.toLowerCase().replace(/\W/g, ''),
    name,
    relationshipType: 'FAMILY',
    isCentralUser: false,
    ...over,
  }) as Person;

const montar = () =>
  renderRota([{ path: '/tree', element: <TreePage />, loader: peopleLoader }], '/tree');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(peopleApi.getAll).mockResolvedValue([
    pessoa('Miguel Souza', { isCentralUser: true }),
    pessoa('Laura Souza', { fatherId: 'miguelsouza' }),
  ]);
});

describe('TreePage', () => {
  it('desenha a partir do que o loader trouxe', async () => {
    montar();

    expect(await screen.findByText('Miguel Souza')).toBeInTheDocument();
    expect(screen.getByText('Laura Souza')).toBeInTheDocument();
  });

  it('sem ninguém cadastrado, avisa em vez de mostrar tela em branco', async () => {
    vi.mocked(peopleApi.getAll).mockResolvedValue([]);
    montar();

    expect(await screen.findByText('Nenhuma pessoa cadastrada')).toBeInTheDocument();
  });

  it('desligar "Com cônjuges" tira o cônjuge do desenho', async () => {
    const user = userEvent.setup();
    const miguel = pessoa('Miguel Souza', { isCentralUser: true });
    vi.mocked(peopleApi.getAll).mockResolvedValue([
      {
        ...miguel,
        unions: [
          {
            id: 'u1',
            partnerId: 'fernandaalves',
            partner: pessoa('Fernanda Alves'),
            status: 'CURRENT',
          },
        ],
      } as Person,
      pessoa('Fernanda Alves'),
    ]);
    montar();
    expect(await screen.findByText('Fernanda Alves')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Com cônjuges'));

    expect(screen.queryByText('Fernanda Alves')).not.toBeInTheDocument();
    expect(screen.getByText('Miguel Souza')).toBeInTheDocument();
  });
});
