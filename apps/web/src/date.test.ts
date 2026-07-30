import { describe, expect, it } from 'vitest';
import {
  ageOf,
  formatDateOnly,
  formatPartialDate,
  formatPartialDateISO,
  getAgeInYears,
  isCompleteDate,
  parseDateOnly,
  parsePartialDate,
  partialDateSortKey,
} from './date';

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

describe('datas parciais (RN-027)', () => {
  it('lê as cinco formas do formato canônico', () => {
    expect(parsePartialDate('1988-05-30')).toEqual({ year: 1988, month: 5, day: 30 });
    expect(parsePartialDate('1988-05')).toEqual({ year: 1988, month: 5, day: null });
    expect(parsePartialDate('1988')).toEqual({ year: 1988, month: null, day: null });
    expect(parsePartialDate('--05-30')).toEqual({ year: null, month: 5, day: 30 });
    expect(parsePartialDate('--05')).toEqual({ year: null, month: 5, day: null });
  });

  it('recusa o que não é data: mês 13, dia 40, texto solto, vazio', () => {
    expect(parsePartialDate('1988-13')).toBeNull();
    expect(parsePartialDate('1988-05-40')).toBeNull();
    expect(parsePartialDate('ontem')).toBeNull();
    expect(parsePartialDate('')).toBeNull();
  });

  it('monta o canônico a partir do que foi preenchido', () => {
    expect(formatPartialDateISO({ year: 1988, month: 5, day: 30 })).toBe('1988-05-30');
    expect(formatPartialDateISO({ year: 1988, month: 5, day: null })).toBe('1988-05');
    expect(formatPartialDateISO({ year: 1988, month: null, day: null })).toBe('1988');
    expect(formatPartialDateISO({ year: null, month: 5, day: 30 })).toBe('--05-30');
    expect(formatPartialDateISO({ year: null, month: null, day: null })).toBeNull();
  });

  it('dia sem mês é descartado: não cai em calendário nenhum', () => {
    expect(formatPartialDateISO({ year: 1988, month: null, day: 30 })).toBe('1988');
    expect(formatPartialDateISO({ year: null, month: null, day: 30 })).toBeNull();
  });

  it('escreve na tela sem inventar o que não se sabe', () => {
    expect(formatPartialDate('1988-05-30')).toBe('30/05/1988');
    expect(formatPartialDate('1988-05')).toBe('maio de 1988');
    expect(formatPartialDate('1988')).toBe('1988');
    expect(formatPartialDate('--05-30')).toBe('30 de maio');
    expect(formatPartialDate('--05')).toBe('maio');
  });

  it('só a data inteira conta como completa', () => {
    expect(isCompleteDate('1988-05-30')).toBe(true);
    expect(isCompleteDate('1988-05')).toBe(false);
    expect(isCompleteDate('1988')).toBe(false);
  });

  it('a data incompleta não vira Date — quem exige dia exato recebe null', () => {
    expect(parseDateOnly('1988')).toBeNull();
    expect(parseDateOnly('1988-05')).toBeNull();
    expect(formatDateOnly('1988')).toBeNull();
  });

  it('ordena parcial e completa na mesma escala, e sem ano vai para o fim', () => {
    const ordenado = ['--05-30', '1988', '1988-05-30', '1987-12', '1988-05']
      .sort((a, b) => partialDateSortKey(a).localeCompare(partialDateSortKey(b)));
    expect(ordenado).toEqual(['1987-12', '1988', '1988-05', '1988-05-30', '--05-30']);
  });
});

describe('ageOf — idade com o que se sabe', () => {
  it('data inteira dá idade exata', () => {
    expect(ageOf('1990-06-15', '2020-06-15')).toEqual({ years: 30, approximate: false });
    expect(ageOf('1990-06-15', '2020-06-14')).toEqual({ years: 29, approximate: false });
  });

  it('só o ano dá idade aproximada, sem descontar o aniversário que não se sabe', () => {
    expect(ageOf('1990', '2020-06-15')).toEqual({ years: 30, approximate: true });
    expect(ageOf('1990-06', '2020-06-15')).toEqual({ years: 30, approximate: true });
  });

  it('sem ano não há idade: 30 de maio não diz há quantos anos', () => {
    expect(ageOf('--05-30')).toBeNull();
    expect(getAgeInYears('--05-30')).toBeNull();
  });
});
