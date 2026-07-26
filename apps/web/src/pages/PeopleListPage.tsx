import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { peopleApi } from '../api/people';
import type { Person } from '@kindred/types';
import { RELATIONSHIP_LABELS, SEX_LABELS } from '../labels';

export default function PeopleListPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasCentralUser, setHasCentralUser] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'birthDate' | 'age'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const limit = 10;
  const navigate = useNavigate();

  const loadPeople = useCallback(async (
    targetPage: number,
    targetSearch: string,
    targetSortBy: 'name' | 'birthDate' | 'age',
    targetSortDirection: 'asc' | 'desc',
  ) => {
    setLoading(true);
    try {
      const response = await peopleApi.getPage({
        page: targetPage,
        limit,
        search: targetSearch || undefined,
        sortBy: targetSortBy,
        sortDirection: targetSortDirection,
      });
      setPeople(response.data);
      setTotal(response.total);
      setTotalPages(response.totalPages);
      setPage(response.page);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    peopleApi.getCentral().then((person) => setHasCentralUser(Boolean(person)));
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    loadPeople(page, search, sortBy, sortDirection);
  }, [loadPeople, page, search, sortBy, sortDirection]);

  async function handleRemove(id: string, name: string) {
    if (!confirm(`Remover "${name}"?`)) return;
    await peopleApi.remove(id);
    await loadPeople(page, search, sortBy, sortDirection);
  }

  function parseDateOnly(dateStr?: string | null) {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function formatDate(dateStr?: string | null) {
    const date = parseDateOnly(dateStr);
    if (!date) return null;
    return date.toLocaleDateString('pt-BR');
  }

  function getAgeInYears(birthDate?: string | null, endDate?: string | null) {
    const birth = parseDateOnly(birthDate);
    if (!birth) return null;
    const end = endDate ? parseDateOnly(endDate) : new Date();
    if (!end) return null;

    let years = end.getFullYear() - birth.getFullYear();
    const monthDiff = end.getMonth() - birth.getMonth();
    const dayDiff = end.getDate() - birth.getDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      years -= 1;
    }

    return years >= 0 ? years : null;
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
          {!loading && !hasCentralUser && (
            <button className="btn-ghost" onClick={() => navigate('/setup')}>
              Cadastrar Eu
            </button>
          )}
          <button className="btn-primary" onClick={() => navigate('/people/new')}>
            Adicionar pessoa
          </button>
        </div>
      </div>

      <div className="form-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 320, width: '100%' }}>
            <label>Busca</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder='Ex: Maria, Avó, Primo'
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'end', gap: '0.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 170 }}>
              <label>Ordenar por</label>
              <select
                value={sortBy}
                onChange={(e) => {
                  setPage(1);
                  setSortBy(e.target.value as 'name' | 'birthDate' | 'age');
                }}
              >
                <option value="name">Nome</option>
                <option value="birthDate">Data de nascimento</option>
                <option value="age">Idade</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
              <label>Direção</label>
              <select
                value={sortDirection}
                onChange={(e) => {
                  setPage(1);
                  setSortDirection(e.target.value as 'asc' | 'desc');
                }}
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
          <p>{search ? 'Nenhuma pessoa encontrada para esta busca.' : 'Nenhuma pessoa cadastrada ainda.'}</p>
        </div>
      )}

      {people.map((person) => (
        (() => {
          const isDead = Boolean(person.deceased || person.deathDate);
          const ageNow = getAgeInYears(person.birthDate, undefined);
          const ageAtDeath = getAgeInYears(person.birthDate, person.deathDate);
          const yearsSinceDeath = getYearsSinceDate(person.deathDate);
          const ageLabel = isDead ? ageAtDeath : ageNow;

          return (
        <div className="card" key={person.id}>
          <div className="avatar">
            {person.profilePhoto
              ? <img src={person.profilePhoto} alt={person.name} />
              : person.name.charAt(0).toUpperCase()}
          </div>
          <div className="card-body">
            <h3>
              {person.name}
              {isDead && (
                <span style={{ marginLeft: '0.35rem', color: '#9ca3af', fontWeight: 700 }}>
                  †
                </span>
              )}
              {ageLabel !== null && (
                <span style={{ marginLeft: '0.35rem', fontWeight: 500, color: '#374151' }}>
                  - {ageLabel}{isDead ? '' : ' anos'}
                </span>
              )}
              {person.isCentralUser && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#6366f1', fontWeight: 500 }}>
                  (você)
                </span>
              )}
            </h3>
            {isDead && yearsSinceDeath !== null && (
              <p style={{ marginTop: '0.15rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                Falecido há {yearsSinceDeath} ano{yearsSinceDeath === 1 ? '' : 's'}.
              </p>
            )}
            <p>
              <span className={`badge badge-${person.relationshipType}`}>
                {RELATIONSHIP_LABELS[person.relationshipType]}
              </span>
              {person.kinshipDegree && !person.isCentralUser && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                  · {person.kinshipDegree}
                </span>
              )}
              {person.sex && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                  · {SEX_LABELS[person.sex]}
                </span>
              )}
              {person.birthDate && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                  · {formatDate(person.birthDate)}
                </span>
              )}
              {person.deathDate && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                  · † {formatDate(person.deathDate)}
                </span>
              )}
              {person.deceased && !person.deathDate && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                  · † Falecido
                </span>
              )}
            </p>
            {person.location && (
              <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                {person.location.name}
              </p>
            )}
            {(person.father || person.mother) && (
              <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#9ca3af' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            {total} pessoa(s) encontrada(s)
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="btn-ghost"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
            >
              ← Anterior
            </button>
            <span style={{ fontSize: '0.85rem', color: '#4b5563' }}>
              Página {page} de {totalPages}
            </span>
            <button
              className="btn-ghost"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
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
