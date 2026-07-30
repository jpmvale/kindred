import { Link } from 'react-router-dom';
import type { Person } from '@kindred/types';
import { photoUrl } from '../photo';
import { formatDateOnly, getAgeInYears } from '../date';
import { RELATIONSHIP_LABELS, SEX_LABELS } from '../labels';
import type { PersonRelations } from '../pages/person-relations';

interface Props {
  relations: PersonRelations;
  onClose: () => void;
  /**
   * Clicar num parente troca o card para a família dele **e** leva a árvore até
   * ele (ADR-026) — quando ele está desenhado; ver `drawnIds`.
   */
  onSelectPerson: (id: string) => void;
  /**
   * Quem está desenhado na árvore agora. O card mostra a família inteira, mesmo
   * a parte que ainda não foi expandida, então há parente que não tem para onde
   * a tela ir — esse fica marcado, em vez de virar um clique que não faz nada.
   */
  drawnIds?: Set<string>;
}

function initial(name: string) {
  return name.charAt(0).toUpperCase();
}

/** A mesma cor por sexo dos nós da árvore: o card e o desenho falam a mesma língua. */
function avatarBg(person: Person) {
  if (person.isCentralUser) return 'var(--primary)';
  if (person.sex === 'MALE') return 'var(--tree-avatar-male)';
  if (person.sex === 'FEMALE') return 'var(--tree-avatar-female)';
  return 'var(--tree-avatar-unknown)';
}

function years(person: Person) {
  const birth = person.birthDate?.slice(0, 4);
  const death = person.deathDate?.slice(0, 4);
  if (birth && death) return `${birth} – ${death}`;
  if (birth) return birth;
  if (death) return `† ${death}`;
  return person.deceased ? 'falecido' : null;
}

/**
 * Uma linha de parente: avatar, nome e a informação que situa (parentesco, anos).
 * A linha inteira é o alvo do clique — não só o nome sublinhado de antes.
 */
function RelativeRow({
  person,
  onSelect,
  drawn = true,
  note,
}: {
  person: Person;
  onSelect: (id: string) => void;
  drawn?: boolean;
  /** Uma palavra à direita: "desfeita", para união encerrada. */
  note?: string;
}) {
  const lifespan = years(person);
  const hint = [person.isCentralUser ? 'Você' : person.kinshipDegree, lifespan]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      className={drawn ? 'pd-relative' : 'pd-relative is-offscreen'}
      onClick={() => onSelect(person.id)}
      title={drawn ? `Centralizar ${person.name} na árvore` : `${person.name} não está desenhado na árvore`}
    >
      <span className="pd-relative-avatar" style={{ background: avatarBg(person) }} aria-hidden>
        {photoUrl(person) ? <img src={photoUrl(person)!} alt="" /> : initial(person.name)}
      </span>
      <span className="pd-relative-text">
        <span className="pd-relative-name">
          {person.deceased || person.deathDate ? `† ${person.name}` : person.name}
        </span>
        {hint && <span className="pd-relative-hint">{hint}</span>}
      </span>
      {note && <span className="pd-relative-note">{note}</span>}
    </button>
  );
}

/** Um grupo de parentes, com a contagem no título e o vazio dito por extenso. */
function RelativeGroup({
  title,
  people,
  onSelect,
  drawnIds,
  empty,
  notes,
}: {
  title: string;
  people: Person[];
  onSelect: (id: string) => void;
  drawnIds?: Set<string>;
  empty: string;
  notes?: Map<string, string>;
}) {
  return (
    <section className="pd-group">
      <h3 className="pd-group-title">
        {title}
        {people.length > 1 && <span className="pd-group-count">{people.length}</span>}
      </h3>
      {people.length === 0 ? (
        <p className="pd-empty">{empty}</p>
      ) : (
        people.map((person) => (
          <RelativeRow
            key={person.id}
            person={person}
            onSelect={onSelect}
            drawn={!drawnIds || drawnIds.has(person.id)}
            note={notes?.get(person.id)}
          />
        ))
      )}
    </section>
  );
}

export default function PersonDetailPanel({
  relations,
  onClose,
  onSelectPerson,
  drawnIds,
}: Props) {
  const { person, father, mother, partners, children, siblings } = relations;

  const dead = Boolean(person.deceased || person.deathDate);
  const foto = photoUrl(person);
  const birthLabel = formatDateOnly(person.birthDate);
  const age = dead
    ? getAgeInYears(person.birthDate, person.deathDate)
    : getAgeInYears(person.birthDate);
  const deathLabel = formatDateOnly(person.deathDate);
  const yearsSinceDeath = getAgeInYears(person.deathDate);

  const parents = [father, mother].filter((p): p is Person => Boolean(p));
  const partnerNotes = new Map(
    partners.filter((p) => p.status === 'ENDED').map((p) => [p.person.id, 'desfeita']),
  );

  return (
    <aside className="person-detail-panel" aria-label={`Detalhes de ${person.name}`}>
      <div className="pd-scroll">
        <button type="button" className="pd-close" onClick={onClose} title="Fechar">
          ×
        </button>

        <header className="pd-header">
          <div className="pd-avatar" style={{ background: foto ? 'transparent' : avatarBg(person) }}>
            {foto ? <img src={foto} alt={person.name} /> : initial(person.name)}
          </div>
          <h2 className="pd-name">{dead ? `† ${person.name}` : person.name}</h2>
          {(person.isCentralUser || person.kinshipDegree) && (
            <p className="pd-kinship">
              {person.isCentralUser ? 'Você' : person.kinshipDegree}
            </p>
          )}
          <div className="pd-chips">
            <span className={`badge badge-${person.relationshipType}`}>
              {RELATIONSHIP_LABELS[person.relationshipType]}
            </span>
            {person.sex && <span className="pd-chip">{SEX_LABELS[person.sex]}</span>}
          </div>
        </header>

        {(birthLabel || (dead && deathLabel)) && (
          <dl className="pd-facts">
            {birthLabel && (
              <div className="pd-fact">
                <dt>Nascimento</dt>
                <dd>
                  {birthLabel}
                  {age !== null && <span className="pd-fact-extra">{age} anos</span>}
                </dd>
              </div>
            )}
            {dead && deathLabel && (
              <div className="pd-fact">
                <dt>Falecimento</dt>
                <dd>
                  {deathLabel}
                  {yearsSinceDeath !== null && (
                    <span className="pd-fact-extra">há {yearsSinceDeath} anos</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}

        {person.notes && (
          <section className="pd-group">
            <h3 className="pd-group-title">Notas</h3>
            <p className="pd-notes">{person.notes}</p>
          </section>
        )}

        <RelativeGroup
          title="Pais"
          people={parents}
          onSelect={onSelectPerson}
          drawnIds={drawnIds}
          empty="Nenhum cadastrado"
        />
        <RelativeGroup
          title="Cônjuges"
          people={partners.map((p) => p.person)}
          onSelect={onSelectPerson}
          drawnIds={drawnIds}
          empty="Nenhum cadastrado"
          notes={partnerNotes}
        />
        <RelativeGroup
          title="Filhos"
          people={children}
          onSelect={onSelectPerson}
          drawnIds={drawnIds}
          empty="Nenhum cadastrado"
        />
        <RelativeGroup
          title="Irmãos"
          people={siblings}
          onSelect={onSelectPerson}
          drawnIds={drawnIds}
          empty="Nenhum cadastrado"
        />
      </div>

      {/* Fora da área que rola: numa família grande o botão ficava a uma rolagem
          de distância, e é a ação que mais se usa depois de olhar o card. */}
      <div className="pd-footer">
        <Link to={`/people/${person.id}/edit`} className="btn-primary pd-edit">
          Editar pessoa
        </Link>
      </div>
    </aside>
  );
}
