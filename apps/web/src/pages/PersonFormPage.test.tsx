import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import type { Location, Person, PersonUnion } from '@kindred/types';

vi.mock('../api/people', () => ({
  peopleApi: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    savePhoto: vi.fn(),
    removePhoto: vi.fn(),
    setCentral: vi.fn(),
  },
}));
// O redimensionamento usa canvas e `createImageBitmap`, que o jsdom não tem; o
// que ele faz é testado à parte, na conta pura (`photo.test.ts`).
vi.mock('../photo', async (original) => ({
  ...(await original<typeof import('../photo')>()),
  fileToPhotoUpload: vi.fn(),
}));
vi.mock('../api/locations', () => ({ locationsApi: { getAll: vi.fn() } }));
vi.mock('../api/unions', () => ({
  unionsApi: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const { peopleApi } = await import('../api/people');
const { locationsApi } = await import('../api/locations');
const { unionsApi } = await import('../api/unions');
const { fileToPhotoUpload } = await import('../photo');
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

/**
 * Os campos de pessoa e local são comboboxes digitáveis (ADR-024), não `select`:
 * abrir é focar o campo, e as opções são `role="option"`.
 */
async function abrirEListar(user: ReturnType<typeof userEvent.setup>, campo: string) {
  await user.click(screen.getByLabelText(campo));
  return opções().map((o) => o.textContent);
}

/**
 * Só as opções do popover aberto: os `select` nativos que sobraram na tela
 * (sexo, tipo de relacionamento) também têm `role="option"` dentro.
 */
function opções() {
  return within(screen.getByRole('listbox')).getAllByRole('option');
}

async function escolher(
  user: ReturnType<typeof userEvent.setup>,
  campo: string,
  nome: string,
) {
  await user.click(screen.getByLabelText(campo));
  await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: new RegExp(nome) }));
}

const MIGUEL = pessoa('Miguel Souza', { sex: 'MALE', birthDate: '1988-05-30' });
const FERNANDA = pessoa('Fernanda Alves');
const CARLOS = pessoa('Carlos Souza');
/** Para os filtros do campo de pai/mãe (RN-016): sexo declarado e datas. */
const JOSÉ = pessoa('José Ramires', { sex: 'MALE', birthDate: '1955-02-10' });
const MARIA = pessoa('Maria Ramires', { sex: 'FEMALE', birthDate: '1958-09-04' });
const BEBÊ = pessoa('Théo Souza', { sex: 'MALE', birthDate: '2020-01-01' });

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

  it('a foto escolhida antes de salvar espera a pessoa existir', async () => {
    // No cadastro não há id para pendurar a imagem: ela sobe logo depois do POST.
    const user = userEvent.setup();
    const upload = { data: 'QUJD', mimeType: 'image/jpeg' as const };
    vi.mocked(fileToPhotoUpload).mockResolvedValue(upload);
    vi.mocked(peopleApi.create).mockResolvedValue(pessoa('Novo Alguém'));
    vi.mocked(peopleApi.savePhoto).mockResolvedValue({
      photoUpdatedAt: '2026-07-28T00:00:00.000Z',
    });
    montar('/people/new');
    await screen.findByLabelText('Nome *');

    await user.upload(
      screen.getByLabelText('Foto de perfil'),
      new File(['x'], 'eu.jpg', { type: 'image/jpeg' }),
    );
    expect(peopleApi.savePhoto).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Nome *'), 'Novo Alguém');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(peopleApi.savePhoto).toHaveBeenCalledWith('novoalgum', upload);
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
    const user = userEvent.setup();
    editarMiguel();
    await screen.findByLabelText('Nome *');

    const nomes = await abrirEListar(user, 'Pai');
    expect(nomes).not.toContain('Miguel Souza');
    expect(nomes).toContain('Carlos Souza');
  });

  it('quem já tem união não volta na lista de candidatos (RN-011)', async () => {
    const user = userEvent.setup();
    editarMiguel();
    await screen.findByLabelText('Nome *');

    const nomes = await abrirEListar(user, 'Cônjuge a adicionar');
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
    await escolher(user, 'Cônjuge a adicionar', 'Carlos Souza');
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

  it('escolher a foto sobe na hora e recarrega a rota', async () => {
    const user = userEvent.setup();
    const upload = { data: 'QUJD', mimeType: 'image/jpeg' as const };
    vi.mocked(fileToPhotoUpload).mockResolvedValue(upload);
    vi.mocked(peopleApi.savePhoto).mockResolvedValue({
      photoUpdatedAt: '2026-07-28T00:00:00.000Z',
    });
    editarMiguel();
    await screen.findByLabelText('Nome *');

    await user.upload(
      screen.getByLabelText('Foto de perfil'),
      new File(['x'], 'eu.jpg', { type: 'image/jpeg' }),
    );

    expect(peopleApi.savePhoto).toHaveBeenCalledWith(MIGUEL.id, upload);
    await waitFor(() => expect(peopleApi.getOne).toHaveBeenCalledTimes(2));
  });

  it('imagem recusada vira mensagem, sem chamar a API', async () => {
    const user = userEvent.setup();
    vi.mocked(fileToPhotoUpload).mockRejectedValue(
      new Error('A imagem passa de 2 MB.'),
    );
    editarMiguel();
    await screen.findByLabelText('Nome *');

    await user.upload(
      screen.getByLabelText('Foto de perfil'),
      new File(['x'], 'enorme.jpg', { type: 'image/jpeg' }),
    );

    expect(await screen.findByText('A imagem passa de 2 MB.')).toBeInTheDocument();
    expect(peopleApi.savePhoto).not.toHaveBeenCalled();
  });

  it('quem tem foto pode removê-la; quem não tem não vê o botão', async () => {
    const user = userEvent.setup();
    vi.mocked(peopleApi.removePhoto).mockResolvedValue(undefined as never);
    vi.mocked(peopleApi.getOne).mockResolvedValue({
      ...MIGUEL,
      photoUpdatedAt: '2026-07-28T00:00:00.000Z',
      unions: [],
    });
    const { unmount } = editarMiguel();
    await screen.findByLabelText('Nome *');

    await user.click(screen.getByRole('button', { name: 'Remover foto' }));
    expect(peopleApi.removePhoto).toHaveBeenCalledWith(MIGUEL.id);
    unmount();

    vi.mocked(peopleApi.getOne).mockResolvedValue({ ...MIGUEL, unions: [] });
    editarMiguel();
    await screen.findByLabelText('Nome *');
    expect(
      screen.queryByRole('button', { name: 'Remover foto' }),
    ).not.toBeInTheDocument();
  });

  it('dá para passar o posto de pessoa central', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(peopleApi.setCentral).mockResolvedValue({
      ...MIGUEL,
      isCentralUser: true,
    });
    editarMiguel();
    await screen.findByLabelText('Nome *');

    await user.click(screen.getByRole('button', { name: 'Tornar pessoa central' }));

    expect(peopleApi.setCentral).toHaveBeenCalledWith(MIGUEL.id);
    await waitFor(() => expect(peopleApi.getOne).toHaveBeenCalledTimes(2));
  });

  it('desistir da confirmação não troca a pessoa central', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    editarMiguel();
    await screen.findByLabelText('Nome *');

    await user.click(screen.getByRole('button', { name: 'Tornar pessoa central' }));

    expect(peopleApi.setCentral).not.toHaveBeenCalled();
  });

  it('quem já é a pessoa central não tem o que trocar', async () => {
    vi.mocked(peopleApi.getOne).mockResolvedValue({
      ...MIGUEL,
      isCentralUser: true,
      unions: [],
    });
    editarMiguel();
    await screen.findByLabelText('Nome *');

    expect(
      screen.queryByRole('button', { name: 'Tornar pessoa central' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Pessoa central')).toBeInTheDocument();
  });

  it('no cadastro não há posto para passar', async () => {
    montar('/people/new');
    await screen.findByLabelText('Nome *');

    expect(
      screen.queryByRole('button', { name: 'Tornar pessoa central' }),
    ).not.toBeInTheDocument();
  });

  it('carrega a nota existente e manda a alterada (RN-019)', async () => {
    const user = userEvent.setup();
    vi.mocked(peopleApi.getOne).mockResolvedValue({
      ...MIGUEL,
      notes: 'Amizade do intercâmbio em 2009.',
      unions: [],
    });
    vi.mocked(peopleApi.update).mockResolvedValue(MIGUEL);
    editarMiguel();
    await screen.findByLabelText('Nome *');

    const notas = screen.getByLabelText('Notas');
    expect(notas).toHaveValue('Amizade do intercâmbio em 2009.');

    await user.clear(notas);
    await user.type(notas, 'Dividimos apartamento em Coimbra.');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(peopleApi.update).toHaveBeenCalledWith(
      MIGUEL.id,
      expect.objectContaining({ notes: 'Dividimos apartamento em Coimbra.' }),
    );
  });

  it('apagar a nota manda nulo, e não texto em branco', async () => {
    const user = userEvent.setup();
    vi.mocked(peopleApi.getOne).mockResolvedValue({
      ...MIGUEL,
      notes: 'Alguma coisa.',
      unions: [],
    });
    vi.mocked(peopleApi.update).mockResolvedValue(MIGUEL);
    editarMiguel();
    await screen.findByLabelText('Nome *');

    await user.clear(screen.getByLabelText('Notas'));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(peopleApi.update).toHaveBeenCalledWith(
      MIGUEL.id,
      expect.objectContaining({ notes: null }),
    );
  });

  it('o campo de notas para no teto de caracteres', async () => {
    const user = userEvent.setup();
    editarMiguel();
    await screen.findByLabelText('Nome *');

    const notas = screen.getByLabelText('Notas') as HTMLTextAreaElement;
    expect(notas.maxLength).toBe(2000);

    await user.type(notas, 'x'.repeat(10));
    expect(screen.getByText('10 de 2000 caracteres.')).toBeInTheDocument();
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

describe('PersonFormPage — campos digitáveis e filtros de filiação (ADR-024, RN-016)', () => {
  beforeEach(() => {
    vi.mocked(peopleApi.getAll).mockResolvedValue([MIGUEL, FERNANDA, CARLOS, JOSÉ, MARIA, BEBÊ]);
  });

  it('digitar filtra a lista, ignorando acento e caixa', async () => {
    const user = userEvent.setup();
    montar('/people/new');
    await screen.findByLabelText('Nome *');

    await user.type(screen.getByLabelText('Pai'), 'jose');

    const nomes = opções().map((o) => o.textContent);
    expect(nomes).toHaveLength(1);
    expect(nomes[0]).toMatch(/José Ramires/);
  });

  it('o campo de pai não oferece mulheres, e o de mãe não oferece homens', async () => {
    const user = userEvent.setup();
    montar('/people/new');
    await screen.findByLabelText('Nome *');

    const pais = await abrirEListar(user, 'Pai');
    expect(pais.some((n) => n?.includes('Maria Ramires'))).toBe(false);
    expect(pais.some((n) => n?.includes('José Ramires'))).toBe(true);
    // Quem não tem sexo cadastrado continua nas duas listas: metade da base é assim.
    expect(pais.some((n) => n?.includes('Carlos Souza'))).toBe(true);

    await user.keyboard('{Escape}');
    const mães = await abrirEListar(user, 'Mãe');
    expect(mães.some((n) => n?.includes('José Ramires'))).toBe(false);
    expect(mães.some((n) => n?.includes('Maria Ramires'))).toBe(true);
  });

  it('com a data de nascimento preenchida, esconde quem não teria idade — e deixa ver assim mesmo', async () => {
    const user = userEvent.setup();
    montar('/people/new');
    await screen.findByLabelText('Nome *');

    await user.type(screen.getByLabelText('Data de nascimento'), '1988-05-30');

    const pais = await abrirEListar(user, 'Pai');
    expect(pais.some((n) => n?.includes('Théo Souza'))).toBe(false);
    expect(pais.some((n) => n?.includes('José Ramires'))).toBe(true);

    // A saída de emergência: o filtro é conveniência, não trava.
    await user.click(screen.getByRole('button', { name: /Mostrar todos/ }));
    expect(opções().some((o) => o.textContent?.includes('Théo Souza'))).toBe(true);
  });

  it('escolher no combobox manda o id no salvamento', async () => {
    const user = userEvent.setup();
    vi.mocked(peopleApi.create).mockResolvedValue(pessoa('Novo'));
    montar('/people/new');
    await screen.findByLabelText('Nome *');

    await user.type(screen.getByLabelText('Nome *'), 'Novo Alguém');
    await escolher(user, 'Pai', 'José Ramires');
    await escolher(user, 'Mãe', 'Maria Ramires');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(peopleApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ fatherId: JOSÉ.id, motherId: MARIA.id }),
    );
  });
});

describe('PersonFormPage — filhos de quem está sendo editado', () => {
  const FILHA = pessoa('Laura Souza', { fatherId: MIGUEL.id, birthDate: '2015-03-02' });
  const FILHO = pessoa('Théo Souza', { motherId: MIGUEL.id, birthDate: '2012-08-19' });

  beforeEach(() => {
    vi.mocked(peopleApi.getAll).mockResolvedValue([MIGUEL, FERNANDA, CARLOS, FILHA, FILHO]);
  });

  it('lista os filhos, do mais velho para o mais novo, com link para cada um', async () => {
    editarMiguel();
    await screen.findByLabelText('Nome *');

    const filhos = screen.getAllByRole('link', { name: /Souza/ });
    expect(filhos.map((l) => l.textContent)).toEqual(['Théo Souza', 'Laura Souza']);
    expect(filhos[0]).toHaveAttribute('href', `/people/${FILHO.id}/edit`);
  });

  it('quem não tem filho vê o vazio explicado', async () => {
    vi.mocked(peopleApi.getAll).mockResolvedValue([MIGUEL, FERNANDA, CARLOS]);
    editarMiguel();
    await screen.findByLabelText('Nome *');

    expect(screen.getByText(/Ninguém cadastrado como filho/)).toBeInTheDocument();
  });

  it('no cadastro novo a seção nem aparece: sem pessoa salva não há filho possível', async () => {
    montar('/people/new');
    await screen.findByLabelText('Nome *');

    expect(screen.queryByText(/Ninguém cadastrado como filho/)).not.toBeInTheDocument();
  });
});
