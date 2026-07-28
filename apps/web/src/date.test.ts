import { describe, expect, it } from 'vitest';
import { formatDateOnly, getAgeInYears, parseDateOnly } from './date';

describe('parseDateOnly', () => {
  it('nulo e vazio viram null', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
    expect(parseDateOnly('')).toBeNull();
  });

  it('interpreta o dia como local, não UTC — o motivo de existir', () => {
    // new Date('2026-01-01') sozinho cairia em 31/12/2025 num fuso negativo.
    const data = parseDateOnly('2026-01-01');
    expect(data?.getFullYear()).toBe(2026);
    expect(data?.getMonth()).toBe(0);
    expect(data?.getDate()).toBe(1);
  });

  it('aceita um carimbo ISO completo, olhando só a parte da data', () => {
    const data = parseDateOnly('2026-07-19T23:00:00.000Z');
    expect(data?.getDate()).toBe(19);
  });
});

describe('formatDateOnly', () => {
  it('formata em pt-BR', () => {
    expect(formatDateOnly('2026-03-05')).toBe('05/03/2026');
  });

  it('sem data, null', () => {
    expect(formatDateOnly(null)).toBeNull();
  });
});

describe('getAgeInYears', () => {
  it('sem nascimento, null', () => {
    expect(getAgeInYears(null)).toBeNull();
  });

  it('conta anos completos, não arredonda para cima antes do aniversário', () => {
    expect(getAgeInYears('2000-06-15', '2026-06-14')).toBe(25);
    expect(getAgeInYears('2000-06-15', '2026-06-15')).toBe(26);
  });

  it('data de referência antes de nascer não vira idade negativa', () => {
    expect(getAgeInYears('2030-01-01', '2026-01-01')).toBeNull();
  });
});
