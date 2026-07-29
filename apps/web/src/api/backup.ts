import type { BackupCounts } from '@kindred/types';
import { client as api } from './client';

/** O nome vem do `Content-Disposition` que a API manda; sem ele, um genérico. */
function filenameFrom(disposition: unknown): string {
  const match =
    typeof disposition === 'string'
      ? disposition.match(/filename="([^"]+)"/)
      : null;
  return match?.[1] ?? 'kindred-backup.json';
}

export const backupApi = {
  export: async (): Promise<{ blob: Blob; filename: string }> => {
    const res = await api.get('/backup', { responseType: 'blob' });
    return {
      blob: res.data as Blob,
      filename: filenameFrom(res.headers['content-disposition']),
    };
  },
  /** `payload` é o próprio conteúdo do arquivo, já parseado (RN-021). */
  restore: (payload: unknown, force: boolean) =>
    api
      .post<BackupCounts>('/backup/restore', payload, { params: { force } })
      .then((r) => r.data),
};
