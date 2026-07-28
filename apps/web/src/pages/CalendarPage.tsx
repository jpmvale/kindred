import { useMemo, useState } from 'react';
import { useLoaderData } from 'react-router-dom';
import type { Person } from '@kindred/types';

type BirthdayEntry = {
  id: string;
  name: string;
  month: number;
  day: number;
};

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

function parseDateParts(dateStr?: string | null): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getBirthdaysByDay(entries: BirthdayEntry[], monthIndex: number): Map<number, BirthdayEntry[]> {
  const map = new Map<number, BirthdayEntry[]>();
  entries
    .filter((entry) => entry.month === monthIndex + 1)
    .forEach((entry) => {
      const group = map.get(entry.day) ?? [];
      group.push(entry);
      map.set(entry.day, group);
    });

  for (const [day, list] of map.entries()) {
    map.set(day, [...list].sort((a, b) => a.name.localeCompare(b.name)));
  }

  return map;
}

function getNextOccurrence(month: number, day: number, now: Date): Date {
  const year = now.getFullYear();
  const currentYearOccurrence = new Date(year, month - 1, day);
  if (currentYearOccurrence >= now) return currentYearOccurrence;
  return new Date(year + 1, month - 1, day);
}

function getDaysUntilDate(targetDate: Date, fromDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((targetDate.getTime() - fromDate.getTime()) / msPerDay);
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
  const { year, monthIndex } = cursor;
  const currentMonthDate = new Date(year, monthIndex, 1);

  const aliveBirthdayEntries = useMemo(() => {
    return people
      .filter((person) => !person.deceased && !person.deathDate)
      .map((person) => {
        const birth = parseDateParts(person.birthDate);
        if (!birth) return null;
        return {
          id: person.id,
          name: person.name,
          month: birth.month,
          day: birth.day,
        } as BirthdayEntry;
      })
      .filter((entry): entry is BirthdayEntry => entry !== null);
  }, [people]);

  const daysInMonth = getDaysInMonth(year, monthIndex);
  const firstDayWeekIndex = new Date(year, monthIndex, 1).getDay();

  const birthdaysByDay = useMemo(
    () => getBirthdaysByDay(aliveBirthdayEntries, monthIndex),
    [aliveBirthdayEntries, monthIndex],
  );

  const monthLabel = toTitleCase(MONTH_FORMATTER.format(currentMonthDate));

  const nextFiveBirthdays = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return aliveBirthdayEntries
      .map((entry) => ({
        ...entry,
        nextDate: getNextOccurrence(entry.month, entry.day, startOfToday),
        daysUntil: 0,
      }))
      .map((entry) => ({
        ...entry,
        daysUntil: getDaysUntilDate(entry.nextDate, startOfToday),
      }))
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime() || a.name.localeCompare(b.name))
      .slice(0, 5);
  }, [aliveBirthdayEntries]);

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

  return (
    <div className="page">
      <div className="page-header">
        <h1>Calendário</h1>
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
            const birthdays = birthdaysByDay.get(day) ?? [];
            const isToday = year === todayYear && monthIndex === todayMonth && day === todayDay;

            return (
              <div key={day} className={`calendar-day ${isToday ? 'calendar-day-today' : ''}`}>
                <div className="calendar-day-number">{day}</div>
                {birthdays.map((entry) => (
                  <div key={entry.id} className="calendar-birthday-chip" title={entry.name}>
                    🎂 {entry.name}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="calendar-upcoming-card">
        <h3>Próximos 5 aniversários (pessoas vivas)</h3>
        {nextFiveBirthdays.length === 0 ? (
          <p className="calendar-empty-text">Nenhum aniversário cadastrado para pessoas vivas.</p>
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
              {nextFiveBirthdays.map((entry) => (
                <tr key={`${entry.id}-${entry.nextDate.toISOString()}`}>
                  <td>{entry.name}</td>
                  <td>{entry.nextDate.toLocaleDateString('pt-BR')}</td>
                  <td>{entry.daysUntil}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
