import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { peopleApi } from '../api/people';
import type { Sex } from '@kindred/types';

export default function SetupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', sex: '' as Sex | '', birthDate: '', profilePhoto: '' });
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await peopleApi.create({
        name: form.name,
        sex: (form.sex || null) as Sex | null,
        relationshipType: 'FAMILY',
        isCentralUser: true,
        ...(form.birthDate ? { birthDate: form.birthDate } : {}),
        ...(form.profilePhoto ? { profilePhoto: form.profilePhoto } : {}),
      });
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
            <label>Nome *</label>
            <input
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Seu nome completo"
            />
          </div>
          <div className="form-group">
            <label>Sexo</label>
            <select value={form.sex} onChange={(e) => set('sex', e.target.value)}>
              <option value="">Não informado</option>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Feminino</option>
            </select>
          </div>
          <div className="form-group">
            <label>Data de nascimento</label>
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => set('birthDate', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>URL da foto de perfil</label>
            <input
              type="url"
              value={form.profilePhoto}
              onChange={(e) => set('profilePhoto', e.target.value)}
              placeholder="https://..."
            />
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
