import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

/** O card recebe a família pronta; o que falta vira vazio. */
function relações(over: Partial<PersonRelations> & { person: Person }): PersonRelations {
  return {
    father: null,
    mother: null,
    partners: [],
    children: [],
    siblings: [],
    ...over,
  };
}

function montar(
  relations: PersonRelations,
  { onSelectPerson = vi.fn(), drawnIds }: { onSelectPerson?: () => void; drawnIds?: Set<string> } = {},
) {
  const onClose = vi.fn();
  const resultado = render(
    <MemoryRouter>
      <PersonDetailPanel
        relations={relations}
        onClose={onClose}
        onSelectPerson={onSelectPerson}
        drawnIds={drawnIds}
      />
    </MemoryRouter>,
  );
  return { onClose, onSelectPerson, ...resultado };
}

/** O grupo inteiro pelo título — as linhas são irmãs dele dentro da mesma seção. */
function grupo(título: string) {
  return screen.getByRole('heading', { name: new RegExp(título) }).parentElement as HTMLElement;
}

describe('PersonDetailPanel', () => {
  it('mostra nome, nascimento com idade e o link de editar', () => {
    const pessoaCentral = pessoa('p1', {
      name: 'Miguel Souza',
      birthDate: '1988-05-10',
      kinshipDegree: 'Você',
      isCentralUser: true,
    });

    montar(relações({ person: pessoaCentral }));

    expect(screen.getByRole('heading', { name: 'Miguel Souza' })).toBeInTheDocument();
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

    montar(relações({ person: falecido }));

    expect(screen.getByRole('heading', { name: '† Antônio Souza' })).toBeInTheDocument();
    expect(screen.getByText(/12\/03\/2010/)).toBeInTheDocument();
  });

  it('mostra as notas quando existem, e nada quando não existem', () => {
    const { unmount } = montar(
      relações({ person: pessoa('p3', { notes: 'Conheceu no intercâmbio.' }) }),
    );
    expect(screen.getByText('Conheceu no intercâmbio.')).toBeInTheDocument();
    unmount();

    montar(relações({ person: pessoa('p4') }));
    expect(screen.queryByText('Notas')).not.toBeInTheDocument();
  });

  it('sem família nenhuma, cada grupo diz o próprio vazio', () => {
    montar(relações({ person: pessoa('solo') }));

    // Pais, cônjuges, filhos e irmãos.
    expect(screen.getAllByText('Nenhum cadastrado')).toHaveLength(4);
  });

  it('clicar num parente troca o card, via onSelectPerson', async () => {
    const user = userEvent.setup();
    const { onSelectPerson } = montar(
      relações({
        person: pessoa('eu'),
        father: pessoa('pai', { name: 'Carlos' }),
        children: [pessoa('filha', { name: 'Laura' })],
      }),
    );

    await user.click(screen.getByText('Carlos'));
    expect(onSelectPerson).toHaveBeenCalledWith('pai');

    await user.click(screen.getByText('Laura'));
    expect(onSelectPerson).toHaveBeenCalledWith('filha');
  });

  it('mostra os cônjuges, com a união desfeita marcada', () => {
    montar(
      relações({
        person: pessoa('eu'),
        partners: [
          { person: pessoa('atual', { name: 'Fernanda' }), status: 'CURRENT' },
          { person: pessoa('ex', { name: 'Ana' }), status: 'ENDED' },
        ],
      }),
    );

    const cônjuges = grupo('Cônjuges');
    expect(cônjuges).toHaveTextContent('Fernanda');
    expect(cônjuges).toHaveTextContent('Ana');
    expect(cônjuges).toHaveTextContent('desfeita');
  });

  it('marca quem não está desenhado na árvore, em vez de prometer um movimento que não acontece', () => {
    const desenhado = pessoa('dentro', { name: 'Laura' });
    const fora = pessoa('fora', { name: 'Zilda' });
    montar(relações({ person: pessoa('eu'), children: [desenhado, fora] }), {
      drawnIds: new Set(['dentro']),
    });

    expect(screen.getByTitle('Centralizar Laura na árvore')).toBeInTheDocument();
    expect(screen.getByTitle('Zilda não está desenhado na árvore')).toBeInTheDocument();
  });

  it('clicar em fechar chama onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = montar(relações({ person: pessoa('eu') }));

    await user.click(screen.getByTitle('Fechar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('lista os irmãos na ordem em que a relação chegou', () => {
    // A ordenação em si é responsabilidade do `relationsOf` (person-relations.ts);
    // aqui só importa que o card preserva a ordem da lista recebida.
    montar(
      relações({
        person: pessoa('eu'),
        siblings: [pessoa('z', { name: 'Zilda' }), pessoa('b', { name: 'Beatriz' })],
      }),
    );

    const nomes = [...grupo('Irmãos').querySelectorAll('.pd-relative-name')].map(
      (n) => n.textContent,
    );
    expect(nomes).toEqual(['Zilda', 'Beatriz']);
  });
});
