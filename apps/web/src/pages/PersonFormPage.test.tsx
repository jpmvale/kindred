import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import type { Location, Person, PersonUnion } from '@kindred/types';

vi.mock('../api/people', () => ({
  peopleApi: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('../api/locations', () => ({ locationsApi: { getAll: vi.fn() } }));
vi.mock('../api/unions', () => ({
  unionsApi: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const { peopleApi } = await import('../api/people');
const { locationsApi } = await import('../api/locations');
const { unionsApi } = await import('../api/unions');
const { personFormLoader } = await import('../loaders');
const { default: PersonFormPage } = await import('./PersonFormPage');
const { renderRota } = await import('../test-utils');

const pessoa = (name: string, over: Partial<Person> = {}): Person =>
  ({
    id: name.toLowerCase().replace(/\W/g, ''),
    name,
    relationshipType: 'FAMILY',
    isCentralUser: false,
    ...over,
  }) as Person;

const uniao = (partner: Person, over: Partial<PersonUnion> = {}): PersonUnion =>
  ({
    id: `u-${partner.id}`,
    partnerId: partner.id,
    partner,
    status: 'CURRENT',
    ...over,
  }) as PersonUnion;

const MIGUEL = pessoa('Miguel Souza', { sex: 'MALE', birthDate: '1988-05-30' });
const FERNANDA = pessoa('Fernanda Alves');
const CARLOS = pessoa('Carlos Souza');

function montar(url: string) {
  const rotas = [
    { path: '/people/new', element: <PersonFormPage />, loader: personFormLoader },
    {
      path: '/people/:id/edit',
      element: <PersonFormPage />,
      loader: personFormLoader,
    },
    { path: '/people', element: <p>lista</p> },
  ];
  return renderRota(rotas, url);
}

const editarMiguel = () => montar(`/people/${MIGUEL.id}/edit`);

/** Erro do axios como a API responde as violações de regra (400 com `message`). */
const erroDaApi = (message: string) =>
  Object.assign(new AxiosError(message), {
    response: { data: { message } },
  });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.mocked(peopleApi.getAll).mockResolvedValue([MIGUEL, FERNANDA, CARLOS]);
  vi.mocked(locationsApi.getAll).mockResolvedValue([
    { id: 'l1', name: 'Curitiba' } as Location,
  ]);
  vi.mocked(peopleApi.getOne).mockResolvedValue({
    ...MIGUEL,
    unions: [uniao(FERNANDA)],
  });
});

describe('PersonFormPage — cadastro', () => {
  it('abre vazio e não oferece união antes de salvar', async () => {
    montar('/people/new');

    expect(await screen.findByLabelText('Nome *')).toHaveValue('');
    expect(peopleApi.getOne).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Salve a pessoa primeiro/),
    ).toBeInTheDocument();
  });

  it('manda o que foi preenchido e volta para a lista', async () => {
    const user = userEvent.setup();
    vi.mocked(peopleApi.create).mockResolvedValue(pessoa('Novo'));
    const { router } = montar('/people/new');
    await screen.findByLabelText('Nome *');

    await user.type(screen.getByLabelText('Nome *'), 'Novo Alguém');
    await user.selectOptions(screen.getByLabelText('Tipo de relacionamento *'), 'FRIEND');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(peopleApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Novo Alguém', relationshipType: 'FRIEND' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/people'));
  });
});

describe('PersonFormPage — edição', () => {
  it('preenche o formulário com quem o loader carregou', async () => {
    editarMiguel();

    expect(await screen.findByLabelText('Nome *')).toHaveValue('Miguel Souza');
    expect(screen.getByLabelText('Sexo')).toHaveValue('MALE');
    expect(screen.getByLabelText('Data de nascimento')).toHaveValue('1988-05-30');
  });

  it('a própria pessoa não aparece como pai nem como mãe', async () => {
    editarMiguel();
    await screen.findByLabelText('Nome *');

    const pai = screen.getByLabelText('Pai') as HTMLSelectElement;
    const nomes = [...pai.options].map((o) => o.textContent);
    expect(nomes).not.toContain('Miguel Souza');
    expect(nomes).toContain('Carlos Souza');
  });

  it('quem já tem união não volta na lista de candidatos (RN-011)', async () => {
    editarMiguel();
    await screen.findByLabelText('Nome *');

    const candidatos = screen.getByLabelText('Cônjuge a adicionar') as HTMLSelectElement;
    const nomes = [...candidatos.options].map((o) => o.textContent);
    expect(nomes).not.toContain('Fernanda Alves');
    expect(nomes).toContain('Carlos Souza');
  });

  it('marcar a data de falecimento trava o "Falecido" ligado', async () => {
    const user = userEvent.setup();
    editarMiguel();
    await screen.findByLabelText('Nome *');
    const falecido = screen.getByRole('checkbox', { name: /Falecido/ });
    expect(falecido).not.toBeChecked();

    await user.type(screen.getByLabelText('Data de falecimento'), '2020-01-15');

    expect(falecido).toBeChecked();
    expect(falecido).toBeDisabled();
  });

  it('registrar união recarrega a rota, e não só a seção', async () => {
    const user = userEvent.setup();
    vi.mocked(unionsApi.create).mockResolvedValue(uniao(CARLOS));
    editarMiguel();
    await screen.findByLabelText('Nome *');

    vi.mocked(peopleApi.getOne).mockResolvedValue({
      ...MIGUEL,
      unions: [uniao(FERNANDA), uniao(CARLOS, { status: 'ENDED' })],
    });
    await user.selectOptions(screen.getByLabelText('Cônjuge a adicionar'), CARLOS.id);
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(unionsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ partnerAId: MIGUEL.id, partnerBId: CARLOS.id }),
    );
    expect(
      await screen.findByLabelText('Situação da união com Carlos Souza'),
    ).toBeInTheDocument();
  });

  it('a recusa da API vira mensagem na tela, e o campo volta ao que o servidor diz', async () => {
    const user = userEvent.setup();
    vi.mocked(unionsApi.update).mockRejectedValue(
      erroDaApi('Miguel Souza já tem uma união vigente; encerre-a antes de registrar outra'),
    );
    vi.mocked(peopleApi.getOne).mockResolvedValue({
      ...MIGUEL,
      unions: [uniao(FERNANDA), uniao(CARLOS, { status: 'ENDED' })],
    });
    editarMiguel();
    const situacao = await screen.findByLabelText('Situação da união com Carlos Souza');

    await user.selectOptions(situacao, 'CURRENT');

    expect(await screen.findByText(/já tem uma união vigente/)).toBeInTheDocument();
    expect(situacao).toHaveValue('ENDED');
  });

  it('remover união pede confirmação', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    editarMiguel();
    await screen.findByLabelText('Nome *');

    await user.click(
      screen.getByRole('button', { name: 'Remover a união com Fernanda Alves' }),
    );

    expect(unionsApi.remove).not.toHaveBeenCalled();
  });
});
