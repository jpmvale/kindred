import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './App';
import PeopleListPage from './pages/PeopleListPage';
import PersonFormPage from './pages/PersonFormPage';
import LocationsPage from './pages/LocationsPage';
import SetupPage from './pages/SetupPage';
import TreePage from './pages/TreePage';
import CalendarPage from './pages/CalendarPage';
import {
  layoutLoader,
  locationsLoader,
  peopleListLoader,
  peopleLoader,
  personFormLoader,
} from './loaders';

export const router = createBrowserRouter([
  // Fora do layout: é a tela que se vê quando ainda não há pessoa central, e o
  // `layoutLoader` manda para cá justamente quando não há.
  { path: '/setup', element: <SetupPage /> },
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
    ],
  },
]);
