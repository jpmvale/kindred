import { useEffect, useState } from 'react';
import {
  useLoaderData,
  useNavigate,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from 'react-router-dom';
import { peopleApi } from '../api/people';
import { photoUrl } from '../photo';
import { ageOf, formatPartialDate, getAgeInYears } from '../date';
import type { PeopleSortField, SortDirection } from '@kindred/types';
import type { PeopleListData } from '../loaders';
import {
  serializePeopleListQuery,
  type PeopleListQuery,
} from './people-list-query';
import { RELATIONSHIP_LABELS, SEX_LABELS } from '../labels';

const SEARCH_DEBOUNCE_MS = 300;

export default function PeopleListPage() {
  const { query, result } = useLoaderData() as PeopleListData;
  const { data: people, total, page, totalPages } = result;

  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  const loading =
    navigation.state === 'loading' || revalidator.state === 'loading';

  // O texto digitado é estado da UI, não da busca: ele corre à frente da URL até
  // o debounce alcançar. Quando a URL muda **por fora** — voltar do navegador,
  // link colado —, o campo se realinha com ela; ajustar estado durante o render
  // é o jeito que o React recomenda para isso, e não custa um efeito.
  //
  // O que interessa é a URL *mudar*, não o que ela diz agora: entre mandar a
  // busca e o loader responder, a URL ainda mostra o termo velho, e comparar
  // valores nesse intervalo apagaria o que a pessoa digitou. Daí a mudança ser
  // detectada contra o render anterior, e só valer quando o termo novo não é o
  // que este mesmo campo pediu.
  const [searchInput, setSearchInput] = useState(query.search);
  const [lastUrlSearch, setLastUrlSearch] = useState(query.search);
  const [expectedSearch, setExpectedSearch] = useState(query.search);
  if (lastUrlSearch !== query.search) {
    setLastUrlSearch(query.search);
    if (query.search !== expectedSearch) setSearchInput(query.search);
  }

  function go(changes: Partial<PeopleListQuery>) {
    setSearchParams(serializePeopleListQuery({ ...query, ...changes }));
  }

  // Não é o fetch: é a URL alcançando o que já foi digitado. Quem busca é o
  // loader da rota, assim que a URL muda (ADR-010).
  useEffect(() => {
    const term = searchInput.trim();
    if (term === query.search) return;
    const timeoutId = window.setTimeout(() => {
      setExpectedSearch(term);
      setSearchParams(
        serializePeopleListQuery({ ...query, search: term, page: 1 }),
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput, query, setSearchParams]);

  async function handleRemove(id: string, name: string) {
    if (!confirm(`Remover "${name}"?`)) return;
    await peopleApi.remove(id);
    revalidator.revalidate();
  }

  function getYearsSinceDate(dateStr?: string | null) {
    if (!dateStr) return null;
    return getAgeInYears(dateStr, undefined);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Pessoas</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-primary" onClick={() => navigate('/people/new')}>
            Adicionar pessoa
          </button>
        </div>
      </div>

      <div className="form-card" style={{ marginBottom: '1rem' }}>
        <div className="list-toolbar">
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 320, width: '100%' }}>
            <label htmlFor="busca">Busca</label>
            <input
              id="busca"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder='Ex: Maria, Avó, Primo'
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'end', gap: '0.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 170 }}>
              <label htmlFor="ordenar-por">Ordenar por</label>
              <select
                id="ordenar-por"
                value={query.sortBy}
                onChange={(e) =>
                  go({ sortBy: e.target.value as PeopleSortField, page: 1 })
                }
              >
                <option value="name">Nome</option>
                <option value="birthDate">Data de nascimento</option>
                <option value="age">Idade</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
              <label htmlFor="direcao">Direção</label>
              <select
                id="direcao"
                value={query.sortDirection}
                onChange={(e) =>
                  go({
                    sortDirection: e.target.value as SortDirection,
                    page: 1,
                  })
                }
              >
                <option value="asc">Ascendente</option>
                <option value="desc">Descendente</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading && <div className="loading">Carregando...</div>}

      {!loading && people.length === 0 && (
        <div className="empty-state">
          <p>{query.search ? 'Nenhuma pessoa encontrada para esta busca.' : 'Nenhuma pessoa cadastrada ainda.'}</p>
        </div>
      )}

      {people.map((person) => (
        (() => {
          const isDead = Boolean(person.deceased || person.deathDate);
          const ageNow = ageOf(person.birthDate, undefined);
          const ageAtDeath = ageOf(person.birthDate, person.deathDate);
          const yearsSinceDeath = getYearsSinceDate(person.deathDate);
          const ageLabel = isDead ? ageAtDeath : ageNow;
          const foto = photoUrl(person);

          return (
        <div className="card" key={person.id}>
          <div className="avatar">
            {foto
              ? <img src={foto} alt={person.name} />
              : person.name.charAt(0).toUpperCase()}
          </div>
          <div className="card-body">
            <h3>
              {person.name}
              {isDead && <span className="person-dagger">†</span>}
              {ageLabel !== null && (
                <span className="person-age">
                  {/* O `~` avisa que a data é parcial e a conta pode errar por um ano. */}
                  - {ageLabel.approximate ? '~' : ''}{ageLabel.years}{isDead ? '' : ' anos'}
                </span>
              )}
              {person.isCentralUser && <span className="person-you">(você)</span>}
            </h3>
            {isDead && yearsSinceDeath !== null && (
              <p className="person-sub" style={{ marginTop: '0.15rem', fontSize: '0.78rem' }}>
                Falecido há {yearsSinceDeath} ano{yearsSinceDeath === 1 ? '' : 's'}.
              </p>
            )}
            <p>
              <span className={`badge badge-${person.relationshipType}`}>
                {RELATIONSHIP_LABELS[person.relationshipType]}
              </span>
              {person.kinshipDegree && !person.isCentralUser && (
                <span className="person-meta">· {person.kinshipDegree}</span>
              )}
              {person.sex && (
                <span className="person-meta">· {SEX_LABELS[person.sex]}</span>
              )}
              {person.birthDate && (
                <span className="person-meta">· {formatPartialDate(person.birthDate)}</span>
              )}
              {person.deathDate && (
                <span className="person-meta is-faint">· † {formatPartialDate(person.deathDate)}</span>
              )}
              {person.deceased && !person.deathDate && (
                <span className="person-meta is-faint">· † Falecido</span>
              )}
            </p>
            {person.location && (
              <p className="person-sub">{person.location.name}</p>
            )}
            {(person.father || person.mother) && (
              <p className="person-sub">
                {[person.father?.name, person.mother?.name].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="card-actions">
            <button className="btn-icon" title="Editar" onClick={() => navigate(`/people/${person.id}/edit`)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            {!person.isCentralUser && (
              <button className="btn-icon danger" title="Remover" onClick={() => handleRemove(person.id, person.name)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            )}
          </div>
        </div>
          );
        })()
      ))}

      {!loading && total > 0 && (
        <div className="pagination">
          <span>{total} pessoa(s) encontrada(s)</span>
          <div className="pagination-controls">
            <button
              className="btn-ghost"
              onClick={() => go({ page: Math.max(1, page - 1) })}
              disabled={page <= 1}
            >
              ← Anterior
            </button>
            <span>Página {page} de {totalPages}</span>
            <button
              className="btn-ghost"
              onClick={() => go({ page: Math.min(totalPages, page + 1) })}
              disabled={page >= totalPages}
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
