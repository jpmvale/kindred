import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { errorMessage, isConflict } from '../api-error';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.register(form);
      // Conta nova, sem pessoa central ainda: `/setup` é quem decide o resto.
      navigate('/setup');
    } catch (err) {
      setError(
        isConflict(err)
          ? 'Este e-mail já tem conta — tente entrar em vez de cadastrar.'
          : errorMessage(err, 'Não foi possível criar a conta.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <div className="page-header">
        <h1>Criar conta</h1>
      </div>
      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="registro-nome">Nome *</label>
            <input
              id="registro-nome"
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div className="form-group">
            <label htmlFor="registro-email">E-mail *</label>
            <input
              id="registro-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="voce@exemplo.com"
            />
          </div>
          <div className="form-group">
            <label htmlFor="registro-senha">Senha *</label>
            <input
              id="registro-senha"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="Pelo menos 8 caracteres"
            />
          </div>
          {error && (
            <p className="field-error" style={{ marginBottom: 0 }}>
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Criando...' : 'Criar conta'}
            </button>
          </div>
        </form>
      </div>
      <p className="text-muted" style={{ marginTop: '1rem', textAlign: 'center' }}>
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </div>
  );
}
