import { useState } from 'react';
import {
  useLoaderData,
  useNavigate,
  useParams,
  useRevalidator,
} from 'react-router-dom';
import axios from 'axios';
import { peopleApi } from '../api/people';
import { unionsApi } from '../api/unions';
import { ACCEPTED_PHOTO_TYPES, fileToPhotoUpload, photoUrl } from '../photo';
import type { PersonFormPageData } from '../loaders';
import { RELATIONSHIP_LABELS, UNION_STATUS_LABELS } from '../labels';
import type {
  Person,
  PersonFormData,
  PersonUnion,
  PhotoUploadData,
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

/**
 * Espelha o teto da API (`NOTES_MAX_LENGTH` no `create-person.dto.ts`). A cópia
 * existe porque o `@kindred/types` não carrega valor em runtime (ADR-005); serve
 * para avisar na tela antes de o servidor recusar, não para substituir a validação.
 */
const NOTES_MAX_LENGTH = 2000;

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
  relationshipType: 'FAMILY',
  notes: '',
  fatherId: null,
  motherId: null,
  locationId: null,
};

/** O que veio da API vira o que o formulário edita: datas sem hora, nulo vira "". */
function toFormData(person: Person | null): PersonFormData {
  if (!person) return EMPTY;
  return {
    name: person.name,
    sex: person.sex ?? null,
    birthDate: person.birthDate ? person.birthDate.slice(0, 10) : '',
    deathDate: person.deathDate ? person.deathDate.slice(0, 10) : '',
    deceased: person.deceased ?? Boolean(person.deathDate),
    relationshipType: person.relationshipType,
    notes: person.notes ?? '',
    fatherId: person.fatherId ?? null,
    motherId: person.motherId ?? null,
    locationId: person.locationId ?? null,
  };
}

export default function PersonFormPage() {
  const { id } = useParams<{ id: string }>();
  const { people, locations, person } = useLoaderData() as PersonFormPageData;
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  // O formulário é o único estado local que sobra: ele se descola do servidor no
  // instante em que a pessoa digita, então nasce do loader e segue por conta.
  const [form, setForm] = useState<PersonFormData>(() => toFormData(person));
  const [submitting, setSubmitting] = useState(false);

  // A foto é recurso próprio, como as uniões: na edição sobe na hora. No
  // cadastro não há id ainda, então ela fica esperando aqui até o submit.
  const [pendingPhoto, setPendingPhoto] = useState<PhotoUploadData | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [centralError, setCentralError] = useState<string | null>(null);
  const [centralBusy, setCentralBusy] = useState(false);

  const savedPhoto = person ? photoUrl(person) : null;
  const photoPreview = pendingPreview ?? savedPhoto;

  async function handlePickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // deixa escolher o mesmo arquivo de novo
    if (!file) return;

    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const upload = await fileToPhotoUpload(file);
      if (id) {
        await peopleApi.savePhoto(id, upload);
        revalidator.revalidate();
      } else {
        setPendingPhoto(upload);
        setPendingPreview(`data:${upload.mimeType};base64,${upload.data}`);
      }
    } catch (error) {
      setPhotoError(
        error instanceof Error
          ? errorMessage(error, error.message)
          : 'Não foi possível usar esta imagem.',
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleMakeCentral() {
    if (!id || !person) return;
    if (
      !confirm(
        `Tornar ${person.name} a pessoa central? O grau de parentesco de todo mundo passa a ser calculado em relação a ela.`,
      )
    )
      return;

    setCentralError(null);
    setCentralBusy(true);
    try {
      await peopleApi.setCentral(id);
      revalidator.revalidate();
    } catch (error) {
      setCentralError(
        errorMessage(error, 'Não foi possível trocar a pessoa central.'),
      );
    } finally {
      setCentralBusy(false);
    }
  }

  async function handleRemovePhoto() {
    setPhotoError(null);
    setPendingPhoto(null);
    setPendingPreview(null);
    if (!id || !person?.photoUpdatedAt) return;

    setPhotoBusy(true);
    try {
      await peopleApi.removePhoto(id);
      revalidator.revalidate();
    } catch (error) {
      setPhotoError(errorMessage(error, 'Não foi possível remover a foto.'));
    } finally {
      setPhotoBusy(false);
    }
  }

  // As uniões são recurso próprio (`/api/unions`): mudam na hora, fora do submit
  // da pessoa — que é também o único jeito de editá-las sem inventar um formato
  // de payload aninhado só para o formulário. Como cada ação recarrega a rota,
  // elas vêm direto do loader, sem cópia em estado.
  const unions: PersonUnion[] = person?.unions ?? [];
  const [newPartnerId, setNewPartnerId] = useState('');
  const [newStatus, setNewStatus] = useState<UnionStatus>('CURRENT');
  const [newStartDate, setNewStartDate] = useState('');
  const [unionError, setUnionError] = useState<string | null>(null);
  const [unionBusy, setUnionBusy] = useState(false);

  function set<K extends keyof PersonFormData>(field: K, value: PersonFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function runUnionAction(action: () => Promise<unknown>, fallback: string) {
    setUnionBusy(true);
    setUnionError(null);
    try {
      await action();
      revalidator.revalidate();
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
      // Campo em branco é ausência de nota: vai como null, não como "".
      notes: form.notes?.trim() ? form.notes.trim() : null,
      fatherId: form.fatherId || null,
      motherId: form.motherId || null,
      locationId: form.locationId || null,
    };

    try {
      if (isEdit && id) {
        await peopleApi.update(id, payload);
      } else {
        // No cadastro a foto espera o submit: só depois de a pessoa existir há
        // um id para pendurar a imagem (ADR-011).
        const criada = await peopleApi.create(payload);
        if (pendingPhoto) await peopleApi.savePhoto(criada.id, pendingPhoto);
      }
      navigate('/people');
    } finally {
      setSubmitting(false);
    }
  }

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
        {person?.isCentralUser && (
          <span className="badge badge-FAMILY">Pessoa central</span>
        )}
      </div>

      {isEdit && person && !person.isCentralUser && (
        <div className="form-card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
              O parentesco de todo mundo é calculado em relação à pessoa central.
              Passar o posto para {person.name} recalcula a lista e a árvore inteiras.
            </span>
            <button
              type="button"
              className="btn-ghost"
              disabled={centralBusy}
              onClick={handleMakeCentral}
            >
              {centralBusy ? 'Trocando...' : 'Tornar pessoa central'}
            </button>
          </div>
          {centralError && (
            <p className="field-error" style={{ margin: '0.5rem 0 0' }}>
              {centralError}
            </p>
          )}
        </div>
      )}

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pessoa-nome">Nome *</label>
            <input
              id="pessoa-nome"
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Nome completo"
            />
          </div>

          <div className="form-group">
            <label htmlFor="pessoa-sexo">Sexo</label>
            <select
              id="pessoa-sexo"
              value={form.sex ?? ''}
              onChange={(e) => set('sex', (e.target.value || null) as Sex | null)}
            >
              <option value="">Não informado</option>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Feminino</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="pessoa-nascimento">Data de nascimento</label>
            <input
              id="pessoa-nascimento"
              type="date"
              value={form.birthDate ?? ''}
              onChange={(e) => set('birthDate', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="pessoa-falecimento">Data de falecimento</label>
            <input
              id="pessoa-falecimento"
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
              <span className="field-hint">
                Marcado automaticamente porque a data de falecimento está preenchida.
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="pessoa-relacionamento">Tipo de relacionamento *</label>
            <select
              id="pessoa-relacionamento"
              value={form.relationshipType}
              onChange={(e) => set('relationshipType', e.target.value as RelationshipType)}
            >
              {RELATIONSHIP_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <span className="field-hint">
              Cônjuge não é um tipo daqui: registre a união logo abaixo.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="pessoa-local">Local de convívio</label>
            <select
              id="pessoa-local"
              value={form.locationId ?? ''}
              onChange={(e) => set('locationId', e.target.value || null)}
            >
              <option value="">Não informado</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            {locations.length === 0 && (
              <span className="field-hint">
                Nenhum local cadastrado.{' '}
                <a href="/locations" className="text-primary">Cadastrar agora</a>
              </span>
            )}
          </div>

          <fieldset>
            <legend>Filiação</legend>

            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="pessoa-pai">Pai</label>
              <select
                id="pessoa-pai"
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
              <label htmlFor="pessoa-mae">Mãe</label>
              <select
                id="pessoa-mae"
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

          <fieldset>
            <legend>Uniões</legend>

            {!isEdit ? (
              <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                Salve a pessoa primeiro; depois volte aqui para registrar o cônjuge.
              </p>
            ) : (
              <>
                {unions.length === 0 && (
                  <p className="text-faint" style={{ fontSize: '0.85rem', marginTop: 0 }}>
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
                      aria-label={`Situação da união com ${union.partner.name}`}
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
                      aria-label={`Remover a união com ${union.partner.name}`}
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
                    aria-label="Cônjuge a adicionar"
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
                    aria-label="Situação da nova união"
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
                  <p className="field-error" style={{ marginBottom: 0 }}>
                    {unionError}
                  </p>
                )}
              </>
            )}
          </fieldset>

          <div className="form-group">
            <label htmlFor="pessoa-foto">Foto de perfil</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="avatar" style={{ width: 64, height: 64, fontSize: '1.25rem' }}>
                {photoPreview
                  ? <img src={photoPreview} alt={`Foto de ${form.name || 'perfil'}`} />
                  : (form.name.charAt(0).toUpperCase() || '?')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <input
                  id="pessoa-foto"
                  type="file"
                  accept={ACCEPTED_PHOTO_TYPES.join(',')}
                  disabled={photoBusy}
                  onChange={handlePickPhoto}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="field-hint">
                    JPEG, PNG ou WebP, até 2 MB. A imagem é reduzida antes de subir.
                  </span>
                  {photoPreview && (
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={photoBusy}
                      onClick={handleRemovePhoto}
                    >
                      Remover foto
                    </button>
                  )}
                </div>
              </div>
            </div>
            {photoError && (
              <p className="field-error" style={{ marginBottom: 0 }}>
                {photoError}
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="pessoa-notas">Notas</label>
            <textarea
              id="pessoa-notas"
              rows={5}
              maxLength={NOTES_MAX_LENGTH}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="De onde veio a amizade, histórias, o que você não quer esquecer..."
            />
            <span className="field-hint">
              {(form.notes?.length ?? 0)} de {NOTES_MAX_LENGTH} caracteres.
            </span>
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
