/**
 * Datas do domínio são "date-only" (`YYYY-MM-DD`, sem hora) — nascimento,
 * falecimento. `new Date("2026-01-01")` interpreta isso como UTC meia-noite, que
 * em fuso negativo cai no dia anterior na tela; `parseDateOnly` monta a data em
 * componentes locais para não deslizar um dia.
 */
export function parseDateOnly(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function formatDateOnly(dateStr?: string | null): string | null {
  const date = parseDateOnly(dateStr);
  return date ? date.toLocaleDateString('pt-BR') : null;
}

/**
 * Anos completos entre `birthDate` e `endDate` (hoje, se omitido) — idade atual,
 * ou idade num falecimento quando `endDate` é a data da morte. Negativo (data de
 * referência antes do nascimento) não faz sentido aqui, então vira `null`.
 */
export function getAgeInYears(
  birthDate?: string | null,
  endDate?: string | null,
): number | null {
  const birth = parseDateOnly(birthDate);
  if (!birth) return null;
  const end = endDate ? parseDateOnly(endDate) : new Date();
  if (!end) return null;

  let years = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  const dayDiff = end.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    years -= 1;
  }

  return years >= 0 ? years : null;
}
