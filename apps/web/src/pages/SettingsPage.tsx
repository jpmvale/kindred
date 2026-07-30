import { useLoaderData } from 'react-router-dom';
import type { AuthUser } from '@kindred/types';
import AccountSettings from '../components/AccountSettings';
import BackupSettings from '../components/BackupSettings';

/**
 * Configurações: o que é ajuste do sistema, e não cadastro de gente (ADR-027).
 * Hoje são duas seções — a conta (e-mail e senha, BL-16) e o backup (exportar e
 * restaurar, BL-06) —, que antes eram duas telas soltas no menu.
 */
export default function SettingsPage() {
  const user = useLoaderData() as AuthUser;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Configurações</h1>
      </div>

      <AccountSettings user={user} />
      <BackupSettings />
    </div>
  );
}
