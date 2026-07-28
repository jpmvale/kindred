import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { peopleApi } from '../api/people';
import { ACCEPTED_PHOTO_TYPES, fileToPhotoUpload } from '../photo';
import type { PhotoUploadData, Sex } from '@kindred/types';

export default function SetupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', sex: '' as Sex | '', birthDate: '' });
  const [submitting, setSubmitting] = useState(false);

  // A pessoa central ainda não existe, então a foto espera o submit para ter um
  // id onde ser pendurada (ADR-011).
  const [photo, setPhoto] = useState<PhotoUploadData | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handlePickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoError(null);
    try {
      const upload = await fileToPhotoUpload(file);
      setPhoto(upload);
      setPhotoPreview(`data:${upload.mimeType};base64,${upload.data}`);
    } catch (error) {
      setPhoto(null);
      setPhotoPreview(null);
      setPhotoError(
        error instanceof Error ? error.message : 'Não foi possível usar esta imagem.',
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const criada = await peopleApi.create({
        name: form.name,
        sex: (form.sex || null) as Sex | null,
        relationshipType: 'FAMILY',
        isCentralUser: true,
        ...(form.birthDate ? { birthDate: form.birthDate } : {}),
      });
      if (photo) await peopleApi.savePhoto(criada.id, photo);
      navigate('/people');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 480 }}>
      <div className="page-header">
        <h1>Bem-vindo ao Kindred</h1>
      </div>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
        Para começar, cadastre a <strong>pessoa central</strong> — geralmente você mesmo.
        O grau de parentesco de todos os outros será calculado em relação a ela.
      </p>
      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="setup-nome">Nome *</label>
            <input
              id="setup-nome"
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Seu nome completo"
            />
          </div>
          <div className="form-group">
            <label htmlFor="setup-sexo">Sexo</label>
            <select
              id="setup-sexo"
              value={form.sex}
              onChange={(e) => set('sex', e.target.value)}
            >
              <option value="">Não informado</option>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Feminino</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="setup-nascimento">Data de nascimento</label>
            <input
              id="setup-nascimento"
              type="date"
              value={form.birthDate}
              onChange={(e) => set('birthDate', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="setup-foto">Foto de perfil</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="avatar" style={{ width: 64, height: 64, fontSize: '1.25rem' }}>
                {photoPreview
                  ? <img src={photoPreview} alt="Sua foto" />
                  : (form.name.charAt(0).toUpperCase() || '?')}
              </div>
              <input
                id="setup-foto"
                type="file"
                accept={ACCEPTED_PHOTO_TYPES.join(',')}
                onChange={handlePickPhoto}
              />
            </div>
            {photoError && (
              <p style={{ fontSize: '0.85rem', color: '#dc2626', marginBottom: 0 }}>
                {photoError}
              </p>
            )}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Começar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
