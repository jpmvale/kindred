import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './App';
import PeopleListPage from './pages/PeopleListPage';
import PersonFormPage from './pages/PersonFormPage';
import LocationsPage from './pages/LocationsPage';
import SetupPage from './pages/SetupPage';
import TreePage from './pages/TreePage';
import CalendarPage from './pages/CalendarPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SettingsPage from './pages/SettingsPage';
import {
  accountLoader,
  guestOnlyLoader,
  layoutLoader,
  locationsLoader,
  peopleListLoader,
  peopleLoader,
  personFormLoader,
  setupLoader,
} from './loaders';

export const router = createBrowserRouter([
  // Fora do layout, e sem exigir sessão — são a porta de entrada de quem
  // ainda não tem conta ou perdeu a sessão (BL-10).
  { path: '/login', element: <LoginPage />, loader: guestOnlyLoader },
  { path: '/register', element: <RegisterPage />, loader: guestOnlyLoader },
  // Fora do layout: é a tela que se vê quando ainda não há pessoa central, e o
  // `layoutLoader` manda para cá justamente quando não há. Exige sessão por
  // conta própria (`setupLoader`), já que fica fora do grupo que normalmente
  // garante isso.
  { path: '/setup', element: <SetupPage />, loader: setupLoader },
  {
    element: <AppLayout />,
    loader: layoutLoader,
    children: [
      { index: true, element: <Navigate to="/people" replace /> },
      { path: 'people', element: <PeopleListPage />, loader: peopleListLoader },
      { path: 'people/new', element: <PersonFormPage />, loader: personFormLoader },
      { path: 'people/:id/edit', element: <PersonFormPage />, loader: personFormLoader },
      { path: 'locations', element: <LocationsPage />, loader: locationsLoader },
      { path: 'calendar', element: <CalendarPage />, loader: peopleLoader },
      { path: 'tree', element: <TreePage />, loader: peopleLoader },
      { path: 'settings', element: <SettingsPage />, loader: accountLoader },
      // Os endereços antigos continuam valendo: backup e conta viraram seções de
      // Configurações (ADR-027), e link velho não pode virar tela de erro.
      { path: 'backup', element: <Navigate to="/settings" replace /> },
      { path: 'account', element: <Navigate to="/settings" replace /> },
    ],
  },
]);
