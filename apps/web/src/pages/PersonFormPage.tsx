import { useState } from 'react';
import {
  Link,
  useLoaderData,
  useNavigate,
  useParams,
  useRevalidator,
} from 'react-router-dom';
import { peopleApi } from '../api/people';
import { unionsApi } from '../api/unions';
import { errorMessage } from '../api-error';
import { Combobox } from '../components/Combobox';
import PartialDateInput from '../components/PartialDateInput';
import { parentCandidates, type ParentRole } from './parent-candidates';
import { ACCEPTED_PHOTO_TYPES, fileToPhotoUpload, photoUrl } from '../photo';
import { parsePartialDate, partialDateSortKey } from '../date';
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
    birthDate: person.birthDate ?? '',
    deathDate: person.deathDate ?? '',
    deceased: person.deceased ?? Boolean(person.deathDate),
    relationshipType: person.relationshipType,
    notes: person.notes ?? '',
    fatherId: person.fatherId ?? null,
    motherId: person.motherId ?? null,
    locationId: person.locationId ?? null,
  };
}

/** O ano de uma data parcial, quando ela tem ano (RN-027). */
function anoDe(value?: string | null): number | null {
  return parsePartialDate(value)?.year ?? null;
}

/** A segunda linha de cada opção: o que ajuda a distinguir dois homônimos. */
function personHint(person: Person): string | undefined {
  const parts = [
    person.kinshipDegree,
    anoDe(person.birthDate) ? `n. ${anoDe(person.birthDate)}` : null,
    anoDe(person.deathDate)
      ? `f. ${anoDe(person.deathDate)}`
      : person.deceased
        ? 'falecido'
        : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * O campo de pai ou de mãe: um combobox já filtrado pelo que faz sentido —
 * sexo e datas (RN-016) —, com a saída de emergência de listar todo mundo.
 *
 * O filtro é conveniência, nunca trava: se a base tem gente sem sexo ou sem
 * data (e tem muita), essa gente continua na lista, e "mostrar todos" traz o
 * resto sem pedir explicação.
 */
function ParentPicker({
  id,
  label,
  role,
  people,
  childBirthDate,
  value,
  onChange,
}: {
  id: string;
  label: string;
  role: ParentRole;
  people: Person[];
  childBirthDate?: string | null;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const { options, hidden } = parentCandidates(people, {
    role,
    childBirthDate,
    keepId: value,
  });
  const visible = showAll ? people : options;

  return (
    <Combobox
      id={id}
      ariaLabel={label}
      placeholder={role === 'father' ? 'Não informado' : 'Não informada'}
      value={value}
      onChange={onChange}
      options={visible.map((p) => ({ value: p.id, label: p.name, hint: personHint(p) }))}
      footer={
        hidden > 0 && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowAll((v) => !v)}>
            {showAll
              ? `Mostrar só quem se encaixa (${hidden} fora do filtro)`
              : `Mostrar todos (${hidden} ocultos por sexo ou data)`}
          </button>
        )
      }
    />
  );
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
  //
  // `partner` é opcional no tipo porque a lista sem paginação (árvore, calendário)
  // não o manda (BL-14, ADR-017) — mas `person` aqui vem sempre de `GET /people/:id`,
  // que continua trazendo o parceiro por extenso. Daí o cast: é seguro **nesta
  // página**, não uma garantia do tipo em geral.
  const unions = (person?.unions ?? []) as (PersonUnion & {
    partner: Person;
  })[];
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
  // Os filhos não são campo desta pessoa — a filiação mora no cadastro de cada um
  // (RN-003) —, mas quem está editando quer vê-los aqui. Mais velho primeiro; sem
  // data, no fim, por nome.
  const children = people
    .filter((p) => id && (p.fatherId === id || p.motherId === id))
    .sort((a, b) => {
      if (a.birthDate && b.birthDate) {
        return partialDateSortKey(a.birthDate).localeCompare(partialDateSortKey(b.birthDate));
      }
      if (a.birthDate) return -1;
      if (b.birthDate) return 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
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
            <PartialDateInput
              id="pessoa-nascimento"
              label="nascimento"
              value={form.birthDate}
              onChange={(value) => set('birthDate', value ?? '')}
            />
            <span className="field-hint">
              Dia, mês e ano são independentes: sabendo só o ano, preencha só o ano (RN-027).
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="pessoa-falecimento">Data de falecimento</label>
            <PartialDateInput
              id="pessoa-falecimento"
              label="falecimento"
              value={form.deathDate}
              onChange={(value) => set('deathDate', value ?? '')}
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
            <Combobox
              id="pessoa-local"
              ariaLabel="Local de convívio"
              placeholder="Não informado"
              value={form.locationId ?? null}
              onChange={(value) => set('locationId', value)}
              options={locations.map((loc) => ({ value: loc.id, label: loc.name }))}
            />
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
              <ParentPicker
                id="pessoa-pai"
                label="Pai"
                role="father"
                people={selectablePeople}
                childBirthDate={form.birthDate}
                value={form.fatherId ?? null}
                onChange={(value) => set('fatherId', value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="pessoa-mae">Mãe</label>
              <ParentPicker
                id="pessoa-mae"
                label="Mãe"
                role="mother"
                people={selectablePeople}
                childBirthDate={form.birthDate}
                value={form.motherId ?? null}
                onChange={(value) => set('motherId', value)}
              />
            </div>
          </fieldset>

          {isEdit && (
            <fieldset>
              <legend>Filhos</legend>

              {children.length === 0 ? (
                <p className="text-faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                  Ninguém cadastrado como filho ou filha.
                </p>
              ) : (
                <ul className="plain-list">
                  {children.map((child) => (
                    <li key={child.id}>
                      <Link to={`/people/${child.id}/edit`}>{child.name}</Link>
                      {personHint(child) && (
                        <span className="field-hint"> · {personHint(child)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <span className="field-hint">
                A filiação mora no cadastro de cada filho: para incluir alguém aqui, abra a pessoa e
                aponte o pai ou a mãe.
              </span>
            </fieldset>
          )}

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
                  <div style={{ minWidth: '14rem', flex: '1 1 14rem' }}>
                    <Combobox
                      ariaLabel="Cônjuge a adicionar"
                      placeholder="Adicionar cônjuge..."
                      disabled={unionBusy}
                      value={newPartnerId || null}
                      onChange={(value) => setNewPartnerId(value ?? '')}
                      options={availableForUnion.map((p) => ({
                        value: p.id,
                        label: p.name,
                        hint: personHint(p),
                      }))}
                    />
                  </div>
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
