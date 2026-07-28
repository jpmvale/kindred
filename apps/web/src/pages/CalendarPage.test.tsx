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

/** As linhas de uma das tabelas do rodapé, achada pelo título. */
const linhasDe = (titulo: string | RegExp) => {
  const card = screen.getByRole('heading', { name: titulo }).closest('div')!;
  const tabela = within(card as HTMLElement).queryByRole('table');
  if (!tabela) return [];
  return within(tabela)
    .getAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent));
};

const proximos = () => linhasDe(/Próximos 5 aniversários/);
const falecimentos = () => linhasDe(/Próximas 5 datas de falecimento/);

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

    const chip = await screen.findByTitle('Bruno Carvalho — faz 39 anos');
    const dia = chip.closest('.calendar-day')!;
    expect(within(dia as HTMLElement).getByText('19')).toBeInTheDocument();
    // Agosto é outro mês: a Beatriz não entra nesta grade — mas continua no
    // rodapé, então a busca precisa ser dentro da grade, não na página toda.
    const grade = document.querySelector('.calendar-grid') as HTMLElement;
    expect(within(grade).queryByTitle(/Beatriz Souza/)).not.toBeInTheDocument();
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
      await screen.findByText('Nenhum aniversário cadastrado.'),
    ).toBeInTheDocument();
  });
});

describe('CalendarPage — falecimentos (BL-07, RN-020)', () => {
  const MORTOS = [
    pessoa('Vivo Silva', '1990-07-10'),
    // Faleceu em julho, nasceu em julho: as duas datas caem no mês aberto.
    pessoa('Antônio Souza', '1932-07-18', { deathDate: '2010-07-12' }),
    // RN-006: sabe-se que faleceu, não se sabe quando.
    pessoa('Maria Souza', '1935-07-04', { deceased: true }),
  ];

  it('quem faleceu aparece com as duas datas, cada uma com sua marca', async () => {
    vi.mocked(peopleApi.getAll).mockResolvedValue(MORTOS);
    montar();
    await screen.findByRole('heading', { level: 2 });

    const nascimento = screen.getByTitle('Antônio Souza — faria 94 anos');
    const falecimento = screen.getByTitle('Antônio Souza — 16 anos de falecimento');

    expect(nascimento).toHaveClass('is-memorial');
    expect(falecimento).toHaveClass('is-death');
    // e cada uma no seu dia
    expect(within(nascimento.closest('.calendar-day') as HTMLElement).getByText('18')).toBeInTheDocument();
    expect(within(falecimento.closest('.calendar-day') as HTMLElement).getByText('12')).toBeInTheDocument();
  });

  it('quem faleceu sem data conhecida entra só pelo nascimento', async () => {
    vi.mocked(peopleApi.getAll).mockResolvedValue(MORTOS);
    montar();
    await screen.findByRole('heading', { level: 2 });

    expect(screen.getByTitle('Maria Souza — faria 91 anos')).toHaveClass('is-memorial');
    expect(falecimentos().map((c) => c[0])).toEqual(['Antônio Souza']);
  });

  it('o aniversário de quem está vivo continua distinto dos outros dois', async () => {
    vi.mocked(peopleApi.getAll).mockResolvedValue(MORTOS);
    montar();
    await screen.findByRole('heading', { level: 2 });

    const vivo = screen.getByTitle('Vivo Silva — faz 36 anos');
    expect(vivo).toHaveClass('is-birthday');
    expect(vivo).not.toHaveClass('is-memorial');
  });

  it('as duas listas do rodapé não se misturam', async () => {
    vi.mocked(peopleApi.getAll).mockResolvedValue(MORTOS);
    montar();
    await screen.findByRole('heading', { level: 2 });

    // Aniversários: o vivo e os dois falecidos, por data. Quem já se foi leva a
    // vela junto, senão a linha não se distingue da de quem está vivo.
    expect(proximos().map((c) => c[0])).toEqual([
      '🕯️ Maria Souza',
      'Vivo Silva',
      '🕯️ Antônio Souza',
    ]);
    // Falecimentos: só quem tem data de morte.
    expect(falecimentos()).toEqual([['Antônio Souza', '12/07/2027', '350']]);
  });

  it('desmarcar "Mostrar falecimentos" devolve o calendário ao que era', async () => {
    const user = userEvent.setup();
    vi.mocked(peopleApi.getAll).mockResolvedValue(MORTOS);
    montar();
    await screen.findByRole('heading', { level: 2 });

    await user.click(screen.getByRole('checkbox', { name: /Mostrar falecimentos/ }));

    expect(screen.queryByTitle(/Antônio Souza/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Maria Souza/)).not.toBeInTheDocument();
    expect(screen.getByTitle('Vivo Silva — faz 36 anos')).toBeInTheDocument();
    expect(proximos().map((c) => c[0])).toEqual(['Vivo Silva']);
    // a segunda tabela some junto
    expect(
      screen.queryByRole('heading', { name: /Próximas 5 datas de falecimento/ }),
    ).not.toBeInTheDocument();
  });

  it('a legenda explica as três marcas, e some com o filtro', async () => {
    const user = userEvent.setup();
    vi.mocked(peopleApi.getAll).mockResolvedValue(MORTOS);
    montar();
    await screen.findByRole('heading', { level: 2 });

    expect(screen.getByText('Aniversário (falecido)')).toBeInTheDocument();
    expect(screen.getByText('Falecimento')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Mostrar falecimentos/ }));
    expect(screen.queryByText('Aniversário (falecido)')).not.toBeInTheDocument();
  });
});
