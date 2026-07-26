import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { locationsApi } from '../api/locations';
import type { Location } from '@kindred/types';

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    locationsApi.getAll()
      .then(setLocations)
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const created = await locationsApi.create({ name: newName.trim() });
      setLocations((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(loc: Location) {
    setEditingId(loc.id);
    setEditName(loc.name);
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return;
    const updated = await locationsApi.update(id, { name: editName.trim() });
    setLocations((prev) => prev.map((l) => (l.id === id ? updated : l)));
    setEditingId(null);
  }

  async function handleRemove(id: string, name: string) {
    if (!confirm(`Remover "${name}"?`)) return;
    await locationsApi.remove(id);
    setLocations((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Locais de convívio</h1>
        <button className="btn-ghost" onClick={() => navigate('/people')}>
          ← Pessoas
        </button>
      </div>

      <div className="form-card" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>Novo local</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ex: Faculdade USP, Vizinhança, Trabalho..."
            />
          </div>
          <button type="submit" className="btn-primary" disabled={adding || !newName.trim()}>
            Adicionar
          </button>
        </form>
      </div>

      {loading && <div className="loading">Carregando...</div>}

      {!loading && locations.length === 0 && (
        <div className="empty-state">
          <p>Nenhum local cadastrado ainda.</p>
        </div>
      )}

      {locations.map((loc) => (
        <div className="card" key={loc.id}>
          <div className="card-body">
            {editingId === loc.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit(loc.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                style={{ width: '100%', padding: '0.25rem 0.5rem', border: '1px solid #6366f1', borderRadius: '0.375rem' }}
              />
            ) : (
              <h3>{loc.name}</h3>
            )}
          </div>
          <div className="card-actions">
            {editingId === loc.id ? (
              <>
                <button className="btn-primary" onClick={() => handleSaveEdit(loc.id)}>Salvar</button>
                <button className="btn-ghost" onClick={() => setEditingId(null)}>Cancelar</button>
              </>
            ) : (
              <>
                <button className="btn-icon" title="Editar" onClick={() => startEdit(loc)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button className="btn-icon danger" title="Remover" onClick={() => handleRemove(loc.id, loc.name)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
