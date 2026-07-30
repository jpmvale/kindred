/*
 * As datas que o calendário mostra (RN-020) — módulo puro, sem React.
 *
 * São três coisas diferentes, e a distinção é o ponto do BL-07: o aniversário de
 * quem está vivo (a quem se dá parabéns), o aniversário de quem já morreu (o "hoje
 * ele faria X anos") e a data do falecimento em si. A conta vive aqui para poder
 * ser testada sem montar a página, como o layout da árvore.
 */
import type { Person } from '@kindred/types';
import { parsePartialDate } from '../date';

export type CalendarEntryKind =
  /** Aniversário de quem está vivo. */
  | 'BIRTHDAY'
  /** Aniversário de nascimento de quem já faleceu. */
  | 'MEMORIAL_BIRTHDAY'
  /** Aniversário do falecimento. */
  | 'DEATH';

export type CalendarEntry = {
  /** Único por pessoa **e** tipo: a mesma pessoa rende até duas datas. */
  key: string;
  personId: string;
  name: string;
  kind: CalendarEntryKind;
  /** 1–12, como vem da data ISO — não é índice de mês do `Date`. */
  month: number;
  day: number;
  /**
   * Ano de origem (nascimento ou falecimento), para contar quantos anos faz.
   * `null` quando a data é parcial e não tem ano (RN-027): a data entra no
   * calendário do mesmo jeito, só não dá para dizer "faz X anos".
   */
  sourceYear: number | null;
};

export type UpcomingEntry = CalendarEntry & {
  nextDate: Date;
  daysUntil: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * O calendário precisa de **dia e mês** — é o que faz uma data cair num quadrado.
 * O ano é opcional (RN-027): sem ele a data aparece, só não conta idade. Quem
 * tem só o ano não entra: não há dia nenhum para marcar.
 */
function parseDateParts(
  dateStr?: string | null,
): { year: number | null; month: number; day: number } | null {
  const parts = parsePartialDate(dateStr);
  if (!parts?.month || !parts.day) return null;
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** RN-006: a flag ou a data — qualquer uma das duas diz que a pessoa faleceu. */
function isDeceased(person: Person): boolean {
  return Boolean(person.deceased) || Boolean(person.deathDate);
}

/**
 * Transforma as pessoas nas datas que o calendário desenha.
 *
 * Com `showDeaths` desligado o resultado é o de antes do BL-07: só o aniversário
 * de quem está vivo. Ligado, quem faleceu volta com as duas datas.
 */
export function buildEntries(
  people: Person[],
  showDeaths: boolean,
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  for (const person of people) {
    const birth = parseDateParts(person.birthDate);
    const death = parseDateParts(person.deathDate);
    const deceased = isDeceased(person);

    if (!deceased) {
      if (birth)
        entries.push({
          key: `${person.id}:BIRTHDAY`,
          personId: person.id,
          name: person.name,
          kind: 'BIRTHDAY',
          month: birth.month,
          day: birth.day,
          sourceYear: birth.year,
        });
      continue;
    }

    if (!showDeaths) continue;

    if (birth)
      entries.push({
        key: `${person.id}:MEMORIAL_BIRTHDAY`,
        personId: person.id,
        name: person.name,
        kind: 'MEMORIAL_BIRTHDAY',
        month: birth.month,
        day: birth.day,
        sourceYear: birth.year,
      });

    // Quem faleceu sem data conhecida (RN-006) entra só pelo nascimento.
    if (death)
      entries.push({
        key: `${person.id}:DEATH`,
        personId: person.id,
        name: person.name,
        kind: 'DEATH',
        month: death.month,
        day: death.day,
        sourceYear: death.year,
      });
  }

  return entries;
}

/** As datas de um mês, agrupadas por dia e ordenadas por nome dentro do dia. */
export function entriesByDay(
  entries: CalendarEntry[],
  monthIndex: number,
): Map<number, CalendarEntry[]> {
  const byDay = new Map<number, CalendarEntry[]>();

  for (const entry of entries) {
    if (entry.month !== monthIndex + 1) continue;
    const group = byDay.get(entry.day) ?? [];
    group.push(entry);
    byDay.set(entry.day, group);
  }

  for (const [day, list] of byDay.entries()) {
    byDay.set(
      day,
      [...list].sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'pt-BR') ||
          a.kind.localeCompare(b.kind),
      ),
    );
  }

  return byDay;
}

/** A próxima vez que dia/mês acontecem a partir de `from` (hoje inclusive). */
export function nextOccurrence(month: number, day: number, from: Date): Date {
  const thisYear = new Date(from.getFullYear(), month - 1, day);
  return thisYear >= from
    ? thisYear
    : new Date(from.getFullYear() + 1, month - 1, day);
}

/**
 * As próximas `limit` datas dos tipos pedidos, da mais próxima para a mais
 * distante. É o que alimenta as duas listas do rodapé.
 */
export function nextOccurrences(
  entries: CalendarEntry[],
  kinds: CalendarEntryKind[],
  from: Date,
  limit: number,
): UpcomingEntry[] {
  return entries
    .filter((entry) => kinds.includes(entry.kind))
    .map((entry) => {
      const nextDate = nextOccurrence(entry.month, entry.day, from);
      return {
        ...entry,
        nextDate,
        daysUntil: Math.floor(
          (nextDate.getTime() - from.getTime()) / MS_PER_DAY,
        ),
      };
    })
    .sort(
      (a, b) =>
        a.nextDate.getTime() - b.nextDate.getTime() ||
        a.name.localeCompare(b.name, 'pt-BR'),
    )
    .slice(0, limit);
}

/**
 * Quantos anos a data completa naquela ocorrência — a idade de quem faz
 * aniversário, ou há quanto tempo a pessoa se foi. Nulo quando não há ano de
 * origem (data parcial sem ano, RN-027) ou quando a conta não faz sentido (data
 * futura, cadastro errado). Quem chama já trata o nulo mostrando só o nome.
 */
export function yearsAt(entry: CalendarEntry, occurrence: Date): number | null {
  if (entry.sourceYear === null) return null;
  const years = occurrence.getFullYear() - entry.sourceYear;
  return years > 0 ? years : null;
}

/** O texto do `title` de cada marca — é ele que diz o que a data significa. */
export function entryTitle(entry: CalendarEntry, occurrence: Date): string {
  const years = yearsAt(entry, occurrence);

  if (entry.kind === 'BIRTHDAY')
    return years ? `${entry.name} — faz ${years} anos` : entry.name;

  if (entry.kind === 'MEMORIAL_BIRTHDAY')
    return years ? `${entry.name} — faria ${years} anos` : entry.name;

  return years
    ? `${entry.name} — ${years} anos de falecimento`
    : `${entry.name} — falecimento`;
}
