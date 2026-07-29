import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { errorMessage, isUnauthorized } from '../api-error';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
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
      await authApi.login(form);
      // O `layoutLoader` decide se manda para `/setup` (conta sem pessoa
      // central ainda) ou deixa em `/people` — não precisa ser decidido aqui.
      navigate('/people');
    } catch (err) {
      setError(
        isUnauthorized(err)
          ? 'E-mail ou senha inválidos.'
          : errorMessage(err, 'Não foi possível entrar.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <div className="page-header">
        <h1>Entrar</h1>
      </div>
      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email">E-mail *</label>
            <input
              id="login-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="voce@exemplo.com"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-senha">Senha *</label>
            <input
              id="login-senha"
              type="password"
              required
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </div>
          {error && (
            <p className="field-error" style={{ marginBottom: 0 }}>
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
      <p className="text-muted" style={{ marginTop: '1rem', textAlign: 'center' }}>
        Ainda não tem conta? <Link to="/register">Criar conta</Link>
      </p>
    </div>
  );
}
