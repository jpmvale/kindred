import { useState } from 'react';
import { Outlet, useLoaderData } from 'react-router-dom';
import type { AuthUser } from '@kindred/types';
import Sidebar from './components/Sidebar';

/**
 * A moldura de todas as telas menos `/setup`/`/login`/`/register`. Só busca o
 * usuário logado (via `layoutLoader`, que roda antes daqui, ADR-010) para
 * repassar à sidebar — quem garante que a sessão existe é o próprio loader.
 */
export default function AppLayout() {
  const { user } = useLoaderData() as { user: AuthUser };
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar
        user={user}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
