import axios from 'axios';

/** A API responde com `message` nos erros de regra de negócio (400/404/409). */
export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] })
      ?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  return fallback;
}

/** 409: o servidor recusou porque já há dados — não é erro, é uma pergunta. */
export function isConflict(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409;
}

/** 401: sem sessão válida, ou credenciais erradas no login (BL-10). */
export function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}
