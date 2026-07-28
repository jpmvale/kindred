/**
 * Contagem de linhas por modelo. `GET /api/backup` devolve isso no campo
 * `contagem`, dentro do próprio arquivo baixado; `POST /api/backup/restore`
 * devolve isso como corpo da resposta, depois de restaurar (BL-06).
 */
export interface BackupCounts {
  Location: number;
  Person: number;
  Union: number;
  PersonPhoto: number;
}
