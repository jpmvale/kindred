/**
 * Ordenação de datas parciais (RN-027) do lado da API — a mesma ideia do
 * `partialDateSortKey` do web, repetida aqui porque `@kindred/types` não carrega
 * valor em runtime (ADR-005) e a API não importa do app.
 *
 * `1988-05-30`, `1988-05` e `1988` ficam na mesma escala; quem não tem ano vai
 * para o fim, porque é desconhecido, não antigo.
 */
export function partialDateSortKey(value?: string | Date | null): string {
  if (!value) return '9999-99-99';
  const texto =
    value instanceof Date ? value.toISOString().slice(0, 10) : value.trim();

  const comAno = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(texto);
  if (!comAno) return '9999-99-99';

  return [comAno[1], comAno[2] ?? '00', comAno[3] ?? '00'].join('-');
}
