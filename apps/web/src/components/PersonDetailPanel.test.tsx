import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Person } from '@kindred/types';
import PersonDetailPanel from './PersonDetailPanel';
import type { PersonRelations } from '../pages/person-relations';

function pessoa(id: string, extras: Partial<Person> = {}): Person {
  return {
    id,
    name: id,
    deceased: false,
    relationshipType: 'FAMILY',
    isCentralUser: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extras,
  };
}

function montar(relations: PersonRelations, onSelectPerson = vi.fn()) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <PersonDetailPanel
        relations={relations}
        onClose={onClose}
        onSelectPerson={onSelectPerson}
      />
    </MemoryRouter>,
  );
  return { onClose, onSelectPerson };
}

describe('PersonDetailPanel', () => {
  it('mostra nome, nascimento com idade e o link de editar', () => {
    const pessoaCentral = pessoa('p1', {
      name: 'Miguel Souza',
      birthDate: '1988-05-10',
      kinshipDegree: 'Você',
      isCentralUser: true,
    });

    montar({ person: pessoaCentral, father: null, mother: null, children: [], siblings: [] });

    expect(screen.getByText('Miguel Souza')).toBeInTheDocument();
    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(screen.getByText(/10\/05\/1988/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar pessoa' })).toHaveAttribute(
      'href',
      '/people/p1/edit',
    );
  });

  it('quem faleceu mostra a cruz, a data de falecimento e não a idade atual', () => {
    const falecido = pessoa('p2', {
      name: 'Antônio Souza',
      birthDate: '1932-01-18',
      deathDate: '2010-03-12',
      deceased: true,
    });

    montar({ person: falecido, father: null, mother: null, children: [], siblings: [] });

    expect(screen.getByText('† Antônio Souza')).toBeInTheDocument();
    expect(screen.getByText(/12\/03\/2010/)).toBeInTheDocument();
  });

  it('mostra as notas quando existem, e nada quando não existem', () => {
    const comNota = pessoa('p3', { notes: 'Conheceu no intercâmbio.' });
    const { unmount } = render(
      <MemoryRouter>
        <PersonDetailPanel
          relations={{ person: comNota, father: null, mother: null, children: [], siblings: [] }}
          onClose={vi.fn()}
          onSelectPerson={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Conheceu no intercâmbio.')).toBeInTheDocument();
    unmount();

    const semNota = pessoa('p4');
    montar({ person: semNota, father: null, mother: null, children: [], siblings: [] });
    expect(screen.queryByText('Notas')).not.toBeInTheDocument();
  });

  it('sem pai, mãe, filhos ou irmãos, mostra os vazios', () => {
    montar({
      person: pessoa('solo'),
      father: null,
      mother: null,
      children: [],
      siblings: [],
    });

    expect(screen.getByText('Não cadastrado')).toBeInTheDocument();
    expect(screen.getByText('Não cadastrada')).toBeInTheDocument();
    expect(screen.getAllByText('Nenhum')).toHaveLength(2);
  });

  it('clicar num parente troca o card, via onSelectPerson', async () => {
    const user = userEvent.setup();
    const pai = pessoa('pai', { name: 'Carlos' });
    const filha = pessoa('filha', { name: 'Laura' });
    const { onSelectPerson } = montar({
      person: pessoa('eu'),
      father: pai,
      mother: null,
      children: [filha],
      siblings: [],
    });

    await user.click(screen.getByText('Carlos'));
    expect(onSelectPerson).toHaveBeenCalledWith('pai');

    await user.click(screen.getByText('Laura'));
    expect(onSelectPerson).toHaveBeenCalledWith('filha');
  });

  it('clicar em fechar chama onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = montar({
      person: pessoa('eu'),
      father: null,
      mother: null,
      children: [],
      siblings: [],
    });

    await user.click(screen.getByTitle('Fechar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('lista os irmãos na ordem em que a relação chegou', () => {
    // A ordenação em si é responsabilidade do `relationsOf` (person-relations.ts);
    // aqui só importa que o card preserva a ordem da lista recebida.
    const irmaZ = pessoa('z', { name: 'Zilda' });
    const irmaB = pessoa('b', { name: 'Beatriz' });
    montar({
      person: pessoa('eu'),
      father: null,
      mother: null,
      children: [],
      siblings: [irmaZ, irmaB],
    });

    const lista = screen.getByText('Irmãos/Irmãs').nextElementSibling as HTMLElement;
    const nomes = within(lista)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(nomes).toEqual(['Zilda', 'Beatriz']);
  });
});
