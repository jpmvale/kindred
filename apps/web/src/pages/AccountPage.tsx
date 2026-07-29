import { useState } from 'react';
import { useLoaderData } from 'react-router-dom';
import type { AuthUser } from '@kindred/types';
import { authApi } from '../api/auth';
import { errorMessage, isConflict, isUnauthorized } from '../api-error';

export default function AccountPage() {
  const user = useLoaderData() as AuthUser;

  const [email, setEmail] = useState(user.email);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword && newPassword !== confirmPassword) {
      setError('A confirmação não bate com a senha nova.');
      return;
    }

    const emailMudou = email !== user.email;
    if (!emailMudou && !newPassword) {
      setError('Mude o e-mail ou informe uma senha nova.');
      return;
    }

    setSubmitting(true);
    try {
      const atualizado = await authApi.updateMe({
        currentPassword,
        email: emailMudou ? email : undefined,
        newPassword: newPassword || undefined,
      });
      setEmail(atualizado.email);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(
        newPassword
          ? 'Conta atualizada. Os outros dispositivos logados nesta conta precisam entrar de novo.'
          : 'Conta atualizada.',
      );
    } catch (err) {
      if (isUnauthorized(err)) {
        setError('Senha atual incorreta.');
      } else if (isConflict(err)) {
        setError('Este e-mail já tem conta.');
      } else {
        setError(errorMessage(err, 'Não foi possível atualizar a conta.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <div className="page-header">
        <h1>Minha conta</h1>
      </div>
      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="conta-nome">Nome</label>
            <input id="conta-nome" value={user.name} disabled />
          </div>
          <div className="form-group">
            <label htmlFor="conta-email">E-mail</label>
            <input
              id="conta-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="conta-senha-nova">Nova senha</label>
            <input
              id="conta-senha-nova"
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Deixe em branco para manter a atual"
            />
          </div>
          {newPassword && (
            <div className="form-group">
              <label htmlFor="conta-senha-confirmar">Confirmar senha nova</label>
              <input
                id="conta-senha-confirmar"
                type="password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="conta-senha-atual">Senha atual *</label>
            <input
              id="conta-senha-atual"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Confirme quem é você para salvar"
            />
          </div>
          {error && (
            <p className="field-error" style={{ marginBottom: 0 }}>
              {error}
            </p>
          )}
          {success && (
            <p style={{ color: 'var(--primary)', marginBottom: 0 }}>{success}</p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
