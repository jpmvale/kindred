import { Link } from 'react-router-dom';
import type { Person } from '@kindred/types';
import { photoUrl } from '../photo';
import { formatDateOnly, getAgeInYears } from '../date';
import { RELATIONSHIP_LABELS, SEX_LABELS } from '../labels';
import type { PersonRelations } from '../pages/person-relations';

interface Props {
  relations: PersonRelations;
  onClose: () => void;
  /** Clicar num parente troca o card para a família dele, sem sair da árvore. */
  onSelectPerson: (id: string) => void;
}

/** Nome clicável de um parente — troca o card, não navega para lugar nenhum. */
function RelativeButton({
  person,
  onSelect,
}: {
  person: Person;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="person-detail-relative"
      onClick={() => onSelect(person.id)}
    >
      {person.name}
    </button>
  );
}

function RelativeList({
  people,
  onSelect,
  empty,
}: {
  people: Person[];
  onSelect: (id: string) => void;
  empty: string;
}) {
  if (!people.length) return <span className="person-detail-empty">{empty}</span>;
  return (
    <div className="person-detail-relative-list">
      {people.map((p) => (
        <RelativeButton key={p.id} person={p} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default function PersonDetailPanel({ relations, onClose, onSelectPerson }: Props) {
  const { person, father, mother, children, siblings } = relations;

  const dead = Boolean(person.deceased || person.deathDate);
  const foto = photoUrl(person);
  const birthLabel = formatDateOnly(person.birthDate);
  const age = dead
    ? getAgeInYears(person.birthDate, person.deathDate)
    : getAgeInYears(person.birthDate);
  const deathLabel = formatDateOnly(person.deathDate);
  const yearsSinceDeath = getAgeInYears(person.deathDate);

  return (
    <aside className="person-detail-panel" aria-label={`Detalhes de ${person.name}`}>
      <button
        type="button"
        className="person-detail-close"
        onClick={onClose}
        title="Fechar"
      >
        ×
      </button>

      <div className="person-detail-header">
        <div className="avatar" style={{ width: 56, height: 56, fontSize: '1.4rem' }}>
          {foto ? <img src={foto} alt={person.name} /> : person.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 className="person-detail-name">
            {dead ? `† ${person.name}` : person.name}
          </h2>
          {person.isCentralUser ? (
            <span className="person-detail-kinship">Você</span>
          ) : person.kinshipDegree ? (
            <span className="person-detail-kinship">{person.kinshipDegree}</span>
          ) : null}
        </div>
      </div>

      <div className="person-detail-meta">
        <span className={`badge badge-${person.relationshipType}`}>
          {RELATIONSHIP_LABELS[person.relationshipType]}
        </span>
        {person.sex && <span className="person-meta">{SEX_LABELS[person.sex]}</span>}
      </div>

      {birthLabel && (
        <p className="person-detail-row">
          <span className="person-detail-label">Nascimento</span>
          {birthLabel}
          {age !== null && ` · ${age} anos`}
        </p>
      )}

      {dead && deathLabel && (
        <p className="person-detail-row">
          <span className="person-detail-label">Falecimento</span>
          {deathLabel}
          {yearsSinceDeath !== null && ` · há ${yearsSinceDeath} anos`}
        </p>
      )}

      {person.notes && (
        <div className="person-detail-section">
          <span className="person-detail-label">Notas</span>
          <p className="person-detail-notes">{person.notes}</p>
        </div>
      )}

      <div className="person-detail-section">
        <span className="person-detail-label">Pai</span>
        {father ? (
          <RelativeButton person={father} onSelect={onSelectPerson} />
        ) : (
          <span className="person-detail-empty">Não cadastrado</span>
        )}
      </div>

      <div className="person-detail-section">
        <span className="person-detail-label">Mãe</span>
        {mother ? (
          <RelativeButton person={mother} onSelect={onSelectPerson} />
        ) : (
          <span className="person-detail-empty">Não cadastrada</span>
        )}
      </div>

      <div className="person-detail-section">
        <span className="person-detail-label">
          {children.length === 1 ? 'Filho(a)' : 'Filhos(as)'}
        </span>
        <RelativeList people={children} onSelect={onSelectPerson} empty="Nenhum" />
      </div>

      <div className="person-detail-section">
        <span className="person-detail-label">
          {siblings.length === 1 ? 'Irmão/Irmã' : 'Irmãos/Irmãs'}
        </span>
        <RelativeList people={siblings} onSelect={onSelectPerson} empty="Nenhum" />
      </div>

      <Link to={`/people/${person.id}/edit`} className="btn-primary person-detail-edit">
        Editar pessoa
      </Link>
    </aside>
  );
}
