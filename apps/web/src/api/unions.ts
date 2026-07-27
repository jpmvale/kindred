import axios from 'axios';
import type { PersonUnion, UnionFormData, UnionStatus } from '@kindred/types';

const api = axios.create({ baseURL: '/api' });

export const unionsApi = {
  create: (data: UnionFormData) =>
    api.post<PersonUnion>('/unions', data).then((r) => r.data),
  update: (
    id: string,
    data: { status?: UnionStatus; startDate?: string; endDate?: string },
  ) => api.patch<PersonUnion>(`/unions/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/unions/${id}`),
};
