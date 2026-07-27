import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';

/**
 * A moldura de todas as telas menos o `/setup`. Não busca nada: quem garante que
 * existe pessoa central é o `layoutLoader`, que roda antes daqui (ADR-010).
 */
export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
