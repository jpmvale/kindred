import { useMemo, useState } from 'react';
import { useLoaderData } from 'react-router-dom';
import type { Person } from '@kindred/types';
import {
  buildEntries,
  entriesByDay,
  entryTitle,
  nextOccurrences,
  type CalendarEntry,
  type CalendarEntryKind,
  type UpcomingEntry,
} from './calendar-entries';

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** O que cada tipo de data mostra na grade (RN-020). */
const KIND_STYLE: Record<CalendarEntryKind, { icon: string; className: string; label: string }> = {
  BIRTHDAY: { icon: '🎂', className: 'is-birthday', label: 'Aniversário' },
  MEMORIAL_BIRTHDAY: { icon: '🎂', className: 'is-memorial', label: 'Aniversário (falecido)' },
  DEATH: { icon: '🕯️', className: 'is-death', label: 'Falecimento' },
};

function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function UpcomingTable({
  title,
  entries,
  empty,
}: {
  title: string;
  entries: UpcomingEntry[];
  empty: string;
}) {
  return (
    <div className="calendar-upcoming-card">
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p className="calendar-empty-text">{empty}</p>
      ) : (
        <table className="calendar-upcoming-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Data</th>
              <th>Dias faltantes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.key}>
                <td title={entryTitle(entry, entry.nextDate)}>
                  {entry.kind === 'MEMORIAL_BIRTHDAY' && (
                    <span className="calendar-memorial-mark" aria-hidden="true">
                      🕯️{' '}
                    </span>
                  )}
                  {entry.name}
                </td>
                <td>{entry.nextDate.toLocaleDateString('pt-BR')}</td>
                <td>{entry.daysUntil}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const people = useLoaderData() as Person[];

  // O mês navegado é guardado como par de números, não como `Date`: um `Date` em
  // estado é objeto mutável, e memoizar em cima dele faz o compilador do React
  // desistir de otimizar a tela inteira.
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  // Ligado por padrão: as datas de falecimento são o ponto do BL-07. Desligar
  // devolve o calendário ao que ele era — só aniversário de quem está vivo.
  const [showDeaths, setShowDeaths] = useState(true);

  const { year, monthIndex } = cursor;
  const currentMonthDate = new Date(year, monthIndex, 1);

  const entries = useMemo(
    () => buildEntries(people, showDeaths),
    [people, showDeaths],
  );

  const daysInMonth = getDaysInMonth(year, monthIndex);
  const firstDayWeekIndex = new Date(year, monthIndex, 1).getDay();

  const byDay = useMemo(
    () => entriesByDay(entries, monthIndex),
    [entries, monthIndex],
  );

  const monthLabel = toTitleCase(MONTH_FORMATTER.format(currentMonthDate));

  const startOfToday = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const nextBirthdays = useMemo(
    () =>
      nextOccurrences(
        entries,
        ['BIRTHDAY', 'MEMORIAL_BIRTHDAY'],
        startOfToday,
        5,
      ),
    [entries, startOfToday],
  );

  const nextDeaths = useMemo(
    () => nextOccurrences(entries, ['DEATH'], startOfToday, 5),
    [entries, startOfToday],
  );

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  function shiftMonth(step: number) {
    setCursor((prev) => {
      const shifted = new Date(prev.year, prev.monthIndex + step, 1);
      return { year: shifted.getFullYear(), monthIndex: shifted.getMonth() };
    });
  }

  function renderChip(entry: CalendarEntry) {
    const style = KIND_STYLE[entry.kind];
    const occurrence = new Date(year, entry.month - 1, entry.day);
    return (
      <div
        key={entry.key}
        className={`calendar-birthday-chip ${style.className}`}
        title={entryTitle(entry, occurrence)}
      >
        <span aria-hidden="true">{style.icon} </span>
        {entry.name}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Calendário</h1>
        <label className="calendar-toggle">
          <input
            type="checkbox"
            checked={showDeaths}
            onChange={(e) => setShowDeaths(e.target.checked)}
          />
          Mostrar falecimentos
        </label>
      </div>

      <div className="calendar-card">
        <div className="calendar-month-nav">
          <button type="button" className="btn-ghost" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
            ←
          </button>
          <h2>{monthLabel}</h2>
          <button type="button" className="btn-ghost" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
            →
          </button>
        </div>

        <div className="calendar-grid">
          {WEEK_DAYS.map((label) => (
            <div key={label} className="calendar-weekday">{label}</div>
          ))}

          {Array.from({ length: firstDayWeekIndex }).map((_, idx) => (
            <div key={`empty-${idx}`} className="calendar-day calendar-day-empty" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const isToday = year === todayYear && monthIndex === todayMonth && day === todayDay;

            return (
              <div key={day} className={`calendar-day ${isToday ? 'calendar-day-today' : ''}`}>
                <div className="calendar-day-number">{day}</div>
                {(byDay.get(day) ?? []).map(renderChip)}
              </div>
            );
          })}
        </div>

        {showDeaths && (
          <div className="calendar-legend">
            {(['BIRTHDAY', 'MEMORIAL_BIRTHDAY', 'DEATH'] as const).map((kind) => (
              <span key={kind} className={`calendar-legend-item ${KIND_STYLE[kind].className}`}>
                <span aria-hidden="true">{KIND_STYLE[kind].icon}</span>
                {KIND_STYLE[kind].label}
              </span>
            ))}
          </div>
        )}
      </div>

      <UpcomingTable
        title="Próximos 5 aniversários"
        entries={nextBirthdays}
        empty="Nenhum aniversário cadastrado."
      />

      {showDeaths && (
        <UpcomingTable
          title="Próximas 5 datas de falecimento"
          entries={nextDeaths}
          empty="Nenhuma data de falecimento cadastrada."
        />
      )}
    </div>
  );
}
