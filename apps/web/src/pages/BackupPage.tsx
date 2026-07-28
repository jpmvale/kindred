import { useRef, useState } from 'react';
import type { BackupCounts } from '@kindred/types';
import { backupApi } from '../api/backup';
import { errorMessage, isConflict } from '../api-error';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function summarize(counts: BackupCounts): string {
  return `${counts.Person} pessoa(s), ${counts.Location} local(is), ${counts.Union} união(ões), ${counts.PersonPhoto} foto(s)`;
}

/** Leitura só para dar um resumo antes de mandar — quem valida de verdade é a API. */
function readCountsHint(raw: unknown): BackupCounts | null {
  const contagem = (raw as { contagem?: Partial<BackupCounts> } | null)?.contagem;
  if (!contagem) return null;
  return {
    Location: contagem.Location ?? 0,
    Person: contagem.Person ?? 0,
    Union: contagem.Union ?? 0,
    PersonPhoto: contagem.PersonPhoto ?? 0,
  };
}

export default function BackupPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [fileCounts, setFileCounts] = useState<BackupCounts | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<BackupCounts | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await backupApi.export();
      triggerDownload(blob, filename);
    } catch (error) {
      setExportError(errorMessage(error, 'Não foi possível baixar o backup.'));
    } finally {
      setExporting(false);
    }
  }

  function resetImportState() {
    setFileName(null);
    setPayload(null);
    setFileCounts(null);
    setParseError(null);
    setRestoreError(null);
    setRestoreResult(null);
    setConfirmMessage(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    resetImportState();
    if (!file) return;
    setFileName(file.name);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setParseError('Não deu para ler esse arquivo como JSON.');
      return;
    }
    if (!(parsed as { dados?: { Person?: unknown } })?.dados?.Person) {
      setParseError('Esse arquivo não parece ser um backup do kindred.');
      return;
    }

    setPayload(parsed);
    setFileCounts(readCountsHint(parsed));
  }

  async function handleRestore(force: boolean) {
    if (!payload) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      const counts = await backupApi.restore(payload, force);
      setRestoreResult(counts);
      setConfirmMessage(null);
      // Central, pais, fotos — tudo pode ter mudado. Uma navegação de verdade
      // garante que todo loader da rota inteira roda de novo, em vez de
      // remendar o estado de cada página na mão (ADR-010).
      setTimeout(() => {
        window.location.href = '/people';
      }, 1500);
    } catch (error) {
      if (isConflict(error)) {
        setConfirmMessage(errorMessage(error, 'O banco já tem dados.'));
      } else {
        setRestoreError(
          errorMessage(error, 'Não foi possível restaurar o backup.'),
        );
      }
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Backup</h1>
      </div>

      <div className="form-card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Exportar</h2>
        <p style={{ color: 'var(--muted)' }}>
          Baixa uma cópia completa do banco — pessoas, uniões, locais e fotos — num
          arquivo JSON. É o mesmo formato que o <code>pnpm db:backup</code> gera.
        </p>
        <button className="btn-primary" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Baixando…' : 'Baixar backup'}
        </button>
        {exportError && <p className="field-error">{exportError}</p>}
      </div>

      <div className="form-card">
        <h2 style={{ marginTop: 0 }}>Importar</h2>
        <p style={{ color: 'var(--muted)' }}>
          Escolha um arquivo de backup para restaurar. Isto{' '}
          <strong>substitui os dados atuais</strong> pelo conteúdo do arquivo.
        </p>

        <div className="form-group">
          <label htmlFor="backup-arquivo">Arquivo de backup</label>
          <input
            id="backup-arquivo"
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            disabled={restoring}
          />
        </div>

        {parseError && <p className="field-error">{parseError}</p>}

        {fileName && !parseError && (
          <p style={{ marginTop: '0.75rem' }}>
            <strong>{fileName}</strong>
            {fileCounts && <> — {summarize(fileCounts)}</>}
          </p>
        )}

        {confirmMessage && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              borderRadius: '0.5rem',
              background: 'var(--danger-soft)',
              color: 'var(--danger-text)',
            }}
          >
            <p style={{ margin: '0 0 0.75rem' }}>{confirmMessage}</p>
            <p style={{ margin: '0 0 0.75rem' }}>
              Restaurar vai apagar tudo que está no banco agora e colocar o
              conteúdo do arquivo no lugar. Não tem como desfazer.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-danger"
                onClick={() => handleRestore(true)}
                disabled={restoring}
              >
                {restoring ? 'Restaurando…' : 'Apagar e restaurar'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => setConfirmMessage(null)}
                disabled={restoring}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {restoreError && <p className="field-error">{restoreError}</p>}

        {restoreResult && (
          <p style={{ marginTop: '0.75rem', color: 'var(--primary)' }}>
            Restaurado: {summarize(restoreResult)}. Recarregando…
          </p>
        )}

        {!!payload && !confirmMessage && !restoreResult && (
          <button
            className="btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => handleRestore(false)}
            disabled={restoring || !!parseError}
          >
            {restoring ? 'Restaurando…' : 'Restaurar'}
          </button>
        )}
      </div>
    </div>
  );
}
