import type { Location, LocationFormData } from '@kindred/types';
import { client as api } from './client';

export const locationsApi = {
  getAll: () => api.get<Location[]>('/locations').then((r) => r.data),
  getOne: (id: string) => api.get<Location>(`/locations/${id}`).then((r) => r.data),
  create: (data: LocationFormData) => api.post<Location>('/locations', data).then((r) => r.data),
  update: (id: string, data: Partial<LocationFormData>) =>
    api.patch<Location>(`/locations/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/locations/${id}`),
};
