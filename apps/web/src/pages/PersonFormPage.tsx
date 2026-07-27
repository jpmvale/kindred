import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { peopleApi } from '../api/people';
import { locationsApi } from '../api/locations';
import { unionsApi } from '../api/unions';
import { RELATIONSHIP_LABELS, UNION_STATUS_LABELS } from '../labels';
import type {
  Location,
  Person,
  PersonFormData,
  PersonUnion,
  RelationshipType,
  Sex,
  UnionStatus,
} from '@kindred/types';

const RELATIONSHIP_OPTIONS = Object.entries(RELATIONSHIP_LABELS) as [
  RelationshipType,
  string,
][];

const UNION_STATUS_OPTIONS = Object.entries(UNION_STATUS_LABELS) as [
  UnionStatus,
  string,
][];

/** A API responde com `message` nos erros de regra de negócio (400/404). */
function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] })
      ?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  return fallback;
}

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

  // As uniões são recurso próprio (`/api/unions`): mudam na hora, fora do submit
  // da pessoa — que é também o único jeito de editá-las sem inventar um formato
  // de payload aninhado só para o formulário.
  const [unions, setUnions] = useState<PersonUnion[]>([]);
  const [newPartnerId, setNewPartnerId] = useState('');
  const [newStatus, setNewStatus] = useState<UnionStatus>('CURRENT');
  const [newStartDate, setNewStartDate] = useState('');
  const [unionError, setUnionError] = useState<string | null>(null);
  const [unionBusy, setUnionBusy] = useState(false);

  useEffect(() => {
    const fetches: Promise<unknown>[] = [
      peopleApi.getAll().then(setPeople),
      locationsApi.getAll().then(setLocations),
    ];

    if (id) {
      fetches.push(
        peopleApi.getOne(id).then((person) => {
          setUnions(person.unions ?? []);
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

  async function refreshUnions() {
    if (!id) return;
    const person = await peopleApi.getOne(id);
    setUnions(person.unions ?? []);
  }

  async function runUnionAction(action: () => Promise<unknown>, fallback: string) {
    setUnionBusy(true);
    setUnionError(null);
    try {
      await action();
      await refreshUnions();
    } catch (error) {
      setUnionError(errorMessage(error, fallback));
    } finally {
      setUnionBusy(false);
    }
  }

  function handleAddUnion() {
    if (!id || !newPartnerId) return;
    void runUnionAction(async () => {
      await unionsApi.create({
        partnerAId: id,
        partnerBId: newPartnerId,
        status: newStatus,
        ...(newStartDate ? { startDate: newStartDate } : {}),
      });
      setNewPartnerId('');
      setNewStatus('CURRENT');
      setNewStartDate('');
    }, 'Não foi possível registrar a união.');
  }

  function handleUnionStatus(unionId: string, status: UnionStatus) {
    void runUnionAction(
      () => unionsApi.update(unionId, { status }),
      'Não foi possível alterar a situação da união.',
    );
  }

  function handleRemoveUnion(unionId: string, partnerName: string) {
    if (!confirm(`Remover a união com ${partnerName}?`)) return;
    void runUnionAction(
      () => unionsApi.remove(unionId),
      'Não foi possível remover a união.',
    );
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
  // Quem já tem união com esta pessoa não volta na lista: o par é único (RN-011).
  const alreadyPartnered = new Set(unions.map((u) => u.partnerId));
  const availableForUnion = selectablePeople.filter(
    (p) => !alreadyPartnered.has(p.id),
  );

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
              {RELATIONSHIP_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
              Cônjuge não é um tipo daqui: registre a união logo abaixo.
            </span>
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

          <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
            <legend style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', padding: '0 0.5rem' }}>
              Uniões
            </legend>

            {!isEdit ? (
              <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>
                Salve a pessoa primeiro; depois volte aqui para registrar o cônjuge.
              </p>
            ) : (
              <>
                {unions.length === 0 && (
                  <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: 0 }}>
                    Nenhuma união registrada.
                  </p>
                )}

                {unions.map((union) => (
                  <div
                    key={union.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}
                  >
                    <strong style={{ fontSize: '0.9rem', minWidth: '10rem' }}>
                      {union.partner.name}
                    </strong>
                    <select
                      value={union.status}
                      disabled={unionBusy}
                      onChange={(e) => handleUnionStatus(union.id, e.target.value as UnionStatus)}
                      style={{ width: 'auto' }}
                    >
                      {UNION_STATUS_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={unionBusy}
                      onClick={() => handleRemoveUnion(union.id, union.partner.name)}
                    >
                      Remover
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  <select
                    value={newPartnerId}
                    disabled={unionBusy}
                    onChange={(e) => setNewPartnerId(e.target.value)}
                    style={{ width: 'auto', minWidth: '10rem' }}
                  >
                    <option value="">Adicionar cônjuge...</option>
                    {availableForUnion.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={newStatus}
                    disabled={unionBusy}
                    onChange={(e) => setNewStatus(e.target.value as UnionStatus)}
                    style={{ width: 'auto' }}
                  >
                    {UNION_STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={newStartDate}
                    disabled={unionBusy}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    style={{ width: 'auto' }}
                    aria-label="Início da união"
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={unionBusy || !newPartnerId}
                    onClick={handleAddUnion}
                  >
                    Adicionar
                  </button>
                </div>

                {unionError && (
                  <p style={{ fontSize: '0.85rem', color: '#dc2626', marginBottom: 0 }}>
                    {unionError}
                  </p>
                )}
              </>
            )}
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
