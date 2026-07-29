import type {
  PaginatedPeopleResponse,
  PeopleSortField,
  Person,
  PersonFormData,
  PhotoUploadData,
  SortDirection,
} from '@kindred/types';
import { client as api } from './client';

export const peopleApi = {
  getAll: () => api.get<Person[]>('/people').then((r) => r.data),
  getPage: (params: {
    page: number;
    limit: number;
    search?: string;
    sortBy?: PeopleSortField;
    sortDirection?: SortDirection;
  }) =>
    api.get<PaginatedPeopleResponse>('/people', { params }).then((r) => r.data),
  getCentral: () => api.get<Person | null>('/people/central').then((r) => r.data),
  /** Transfere o posto de pessoa central (RN-018) — não cria uma segunda. */
  setCentral: (personId: string) =>
    api.put<Person>('/people/central', { personId }).then((r) => r.data),
  getOne: (id: string) => api.get<Person>(`/people/${id}`).then((r) => r.data),
  create: (data: PersonFormData) => api.post<Person>('/people', data).then((r) => r.data),
  update: (id: string, data: Partial<PersonFormData>) =>
    api.patch<Person>(`/people/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/people/${id}`),
  savePhoto: (id: string, data: PhotoUploadData) =>
    api
      .put<{ photoUpdatedAt: string }>(`/people/${id}/photo`, data)
      .then((r) => r.data),
  removePhoto: (id: string) => api.delete(`/people/${id}/photo`),
};
