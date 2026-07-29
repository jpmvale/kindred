import type { AuthUser, LoginData, RegisterData } from '@kindred/types';
import { client as api } from './client';

export const authApi = {
  /** 401 se não houver sessão válida — quem chama decide o que fazer. */
  me: () => api.get<AuthUser>('/auth/me').then((r) => r.data),
  register: (data: RegisterData) =>
    api.post<AuthUser>('/auth/register', data).then((r) => r.data),
  login: (data: LoginData) =>
    api.post<AuthUser>('/auth/login', data).then((r) => r.data),
  logout: () => api.post('/auth/logout').then(() => undefined),
};
