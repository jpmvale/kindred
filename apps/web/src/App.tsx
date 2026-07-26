import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { peopleApi } from './api/people';
import Sidebar from './components/Sidebar';
import PeopleListPage from './pages/PeopleListPage';
import PersonFormPage from './pages/PersonFormPage';
import LocationsPage from './pages/LocationsPage';
import SetupPage from './pages/SetupPage';
import TreePage from './pages/TreePage';
import CalendarPage from './pages/CalendarPage';

export default function App() {
  const [hasCentral, setHasCentral] = useState<boolean | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isSetup = location.pathname === '/setup';

  useEffect(() => {
    peopleApi.getCentral().then((person) => {
      const exists = person !== null;
      setHasCentral(exists);
      if (!exists && !isSetup) {
        navigate('/setup', { replace: true });
      }
    });
  }, []);

  if (hasCentral === null) return null;

  if (isSetup) {
    return <SetupPage />;
  }

  return (
    <div className="app-layout">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />
      <main className="app-main">
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/people" element={<PeopleListPage />} />
          <Route path="/people/new" element={<PersonFormPage />} />
          <Route path="/people/:id/edit" element={<PersonFormPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/tree" element={<TreePage />} />
          <Route path="/" element={<Navigate to="/people" replace />} />
        </Routes>
      </main>
    </div>
  );
}
