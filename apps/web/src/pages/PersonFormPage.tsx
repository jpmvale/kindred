import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { peopleApi } from '../api/people';
import { locationsApi } from '../api/locations';
import type {
  Location,
  Person,
  PersonFormData,
  RelationshipType,
  Sex,
} from '@kindred/types';

const EMPTY: PersonFormData = {
  name: '',
  sex: null,
  birthDate: '',
  deathDate: '',
  deceased: false,
  profilePhoto: '',
  relationshipType: 'FAMILY',
  fatherId: null,
  motherId: null,
  locationId: null,
};

export default function PersonFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<PersonFormData>(EMPTY);
  const [people, setPeople] = useState<Person[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetches: Promise<unknown>[] = [
      peopleApi.getAll().then(setPeople),
      locationsApi.getAll().then(setLocations),
    ];

    if (id) {
      fetches.push(
        peopleApi.getOne(id).then((person) => {
          setForm({
            name: person.name,
            sex: person.sex ?? null,
            birthDate: person.birthDate ? person.birthDate.slice(0, 10) : '',
            deathDate: person.deathDate ? person.deathDate.slice(0, 10) : '',
            deceased: person.deceased ?? Boolean(person.deathDate),
            profilePhoto: person.profilePhoto ?? '',
            relationshipType: person.relationshipType,
            fatherId: person.fatherId ?? null,
            motherId: person.motherId ?? null,
            locationId: person.locationId ?? null,
          });
        }),
      );
    }

    Promise.all(fetches).finally(() => setLoading(false));
  }, [id]);

  function set<K extends keyof PersonFormData>(field: K, value: PersonFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const payload: PersonFormData = {
      name: form.name,
      sex: form.sex || null,
      relationshipType: form.relationshipType,
      ...(form.birthDate ? { birthDate: form.birthDate } : {}),
      ...(form.deathDate ? { deathDate: form.deathDate } : {}),
      deceased: form.deathDate ? true : Boolean(form.deceased),
      ...(form.profilePhoto ? { profilePhoto: form.profilePhoto } : {}),
      fatherId: form.fatherId || null,
      motherId: form.motherId || null,
      locationId: form.locationId || null,
    };

    try {
      if (isEdit && id) {
        await peopleApi.update(id, payload);
      } else {
        await peopleApi.create(payload);
      }
      navigate('/people');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="page loading">Carregando...</div>;

  const selectablePeople = people.filter((p) => p.id !== id);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isEdit ? 'Editar pessoa' : 'Nova pessoa'}</h1>
      </div>
      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nome *</label>
            <input
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Nome completo"
            />
          </div>

          <div className="form-group">
            <label>Sexo</label>
            <select
              value={form.sex ?? ''}
              onChange={(e) => set('sex', (e.target.value || null) as Sex | null)}
            >
              <option value="">Não informado</option>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Feminino</option>
            </select>
          </div>

          <div className="form-group">
            <label>Data de nascimento</label>
            <input
              type="date"
              value={form.birthDate ?? ''}
              onChange={(e) => set('birthDate', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Data de falecimento</label>
            <input
              type="date"
              value={form.deathDate ?? ''}
              onChange={(e) => set('deathDate', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={Boolean(form.deceased) || Boolean(form.deathDate)}
                disabled={Boolean(form.deathDate)}
                onChange={(e) => set('deceased', e.target.checked)}
              />
              Falecido
            </label>
            {form.deathDate && (
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Marcado automaticamente porque a data de falecimento está preenchida.
              </span>
            )}
          </div>

          <div className="form-group">
            <label>Tipo de relacionamento *</label>
            <select
              value={form.relationshipType}
              onChange={(e) => set('relationshipType', e.target.value as RelationshipType)}
            >
              <option value="FAMILY">Família</option>
              <option value="WIFE">Esposa</option>
              <option value="FRIEND">Amigo(a)</option>
              <option value="ACQUAINTANCE">Conhecido(a)</option>
              <option value="OTHER">Outro</option>
            </select>
          </div>

          <div className="form-group">
            <label>Local de convívio</label>
            <select
              value={form.locationId ?? ''}
              onChange={(e) => set('locationId', e.target.value || null)}
            >
              <option value="">Não informado</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            {locations.length === 0 && (
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                Nenhum local cadastrado.{' '}
                <a href="/locations" style={{ color: '#6366f1' }}>Cadastrar agora</a>
              </span>
            )}
          </div>

          <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
            <legend style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', padding: '0 0.5rem' }}>
              Filiação
            </legend>

            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Pai</label>
              <select
                value={form.fatherId ?? ''}
                onChange={(e) => set('fatherId', e.target.value || null)}
              >
                <option value="">Não informado</option>
                {selectablePeople.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Mãe</label>
              <select
                value={form.motherId ?? ''}
                onChange={(e) => set('motherId', e.target.value || null)}
              >
                <option value="">Não informada</option>
                {selectablePeople.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </fieldset>

          <div className="form-group">
            <label>URL da foto de perfil</label>
            <input
              type="url"
              value={form.profilePhoto ?? ''}
              onChange={(e) => set('profilePhoto', e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => navigate('/people')}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
