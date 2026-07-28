import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Person } from '@kindred/types';

vi.mock('../api/people', () => ({ peopleApi: { getAll: vi.fn() } }));

const { peopleApi } = await import('../api/people');
const { peopleLoader } = await import('../loaders');
const { default: CalendarPage } = await import('./CalendarPage');
const { renderRota } = await import('../test-utils');

const pessoa = (name: string, birthDate: string, over: Partial<Person> = {}): Person =>
  ({
    id: name.toLowerCase().replace(/\W/g, ''),
    name,
    birthDate,
    relationshipType: 'FAMILY',
    isCentralUser: false,
    ...over,
  }) as Person;

const montar = () =>
  renderRota(
    [{ path: '/calendar', element: <CalendarPage />, loader: peopleLoader }],
    '/calendar',
  );

const mes = () => screen.getByRole('heading', { level: 2 }).textContent;
const proximos = () =>
  screen
    .queryAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent));

beforeEach(() => {
  // Um calendário sem "hoje" fixo é um teste que muda de resultado sozinho.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 27));
  vi.mocked(peopleApi.getAll).mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe('CalendarPage', () => {
  it('abre no mês de hoje', async () => {
    montar();
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(
      'Julho de 2026',
    );
  });

  it('põe o aniversariante no dia dele', async () => {
    vi.mocked(peopleApi.getAll).mockResolvedValue([
      pessoa('Bruno Carvalho', '1987-07-19'),
      pessoa('Beatriz Souza', '1991-08-21'),
    ]);
    montar();

    const chip = await screen.findByTitle('Bruno Carvalho');
    const dia = chip.closest('.calendar-day')!;
    expect(within(dia as HTMLElement).getByText('19')).toBeInTheDocument();
    // agosto é outro mês: não aparece nesta grade
    expect(screen.queryByTitle('Beatriz Souza')).not.toBeInTheDocument();
  });

  it('navega os meses, inclusive virando o ano', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole('heading', { level: 2 });

    await user.click(screen.getByLabelText('Mês anterior'));
    expect(mes()).toBe('Junho de 2026');

    for (let i = 0; i < 7; i++) {
      await user.click(screen.getByLabelText('Próximo mês'));
    }
    expect(mes()).toBe('Janeiro de 2027');
  });

  it('quem morreu sai do calendário e da lista', async () => {
    vi.mocked(peopleApi.getAll).mockResolvedValue([
      pessoa('Vivo Silva', '1990-07-10'),
      pessoa('Morto Silva', '1930-07-11', { deceased: true }),
      pessoa('Falecido Souza', '1930-07-12', { deathDate: '2001-03-02' }),
    ]);
    montar();

    expect(await screen.findByTitle('Vivo Silva')).toBeInTheDocument();
    expect(screen.queryByTitle('Morto Silva')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Falecido Souza')).not.toBeInTheDocument();
    expect(proximos().map((c) => c[0])).toEqual(['Vivo Silva']);
  });

  it('os próximos cinco contam a partir de hoje e passam para o ano seguinte', async () => {
    vi.mocked(peopleApi.getAll).mockResolvedValue([
      pessoa('Ano Que Vem', '1990-01-05'), // já passou em 2026 → conta 2027
      pessoa('Amanhã', '1990-07-28'),
      pessoa('Foi Ontem', '1990-07-26'), // também rola para 2027
      pessoa('Em Agosto', '1990-08-14'),
    ]);
    montar();
    await screen.findByRole('heading', { level: 2 });

    expect(proximos()).toEqual([
      ['Amanhã', '28/07/2026', '1'],
      ['Em Agosto', '14/08/2026', '18'],
      ['Ano Que Vem', '05/01/2027', '162'],
      ['Foi Ontem', '26/07/2027', '364'],
    ]);
  });

  it('sem ninguém, avisa em vez de mostrar tabela vazia', async () => {
    montar();
    expect(
      await screen.findByText('Nenhum aniversário cadastrado para pessoas vivas.'),
    ).toBeInTheDocument();
  });
});
