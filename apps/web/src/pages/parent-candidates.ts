import type { Person, Sex } from '@kindred/types';
import { parsePartialDate } from '../date';

/**
 * Quem pode aparecer na lista de pai ou de mãe de alguém (RN-016). É um filtro
 * de **plausibilidade**, não de validade: serve para encurtar uma fila de 150
 * pessoas até as poucas que fazem sentido, e a tela sempre oferece ver os
 * escondidos. Quem valida de verdade é a API.
 *
 * Puro de propósito, como `people-list-query` e `person-relations`: a regra é
 * testável sem montar tela nenhuma.
 */

/** Idade mínima plausível para ter tido um filho. */
export const PARENT_MIN_AGE = 12;

/** Idade máxima plausível. Foi o número que o dono da árvore pediu. */
export const PARENT_MAX_AGE = 80;

/**
 * Um pai pode ter morrido antes de a criança nascer — a mãe, não. Nove meses é
 * a folga que a biologia dá, e é por isso que a regra é assimétrica.
 */
const FATHER_POSTHUMOUS_DAYS = 280;

export type ParentRole = 'father' | 'mother';

export interface ParentCandidates {
  /** Quem entra na lista, na ordem em que chegou. */
  options: Person[];
  /** Quantos o filtro escondeu — a tela usa para oferecer "mostrar todos". */
  hidden: number;
}

export function parentCandidates(
  people: Person[],
  {
    role,
    childBirthDate,
    excludeId,
    keepId,
  }: {
    role: ParentRole;
    /** A data de nascimento de quem está sendo cadastrado, se já preenchida. */
    childBirthDate?: string | null;
    /** A própria pessoa: ninguém é pai de si mesmo. */
    excludeId?: string | null;
    /** O valor já escolhido, que nunca some da lista — senão o campo esvaziaria sozinho. */
    keepId?: string | null;
  },
): ParentCandidates {
  const childBirth = parseDate(childBirthDate);
  const forbiddenSex: Sex = role === 'father' ? 'FEMALE' : 'MALE';

  let hidden = 0;
  const options: Person[] = [];

  for (const person of people) {
    if (excludeId && person.id === excludeId) continue;
    if (keepId && person.id === keepId) {
      options.push(person);
      continue;
    }

    // Sexo em branco continua valendo para os dois lados: metade da base foi
    // cadastrada sem essa informação, e sumir com essa gente seria pior que a fila.
    if (person.sex === forbiddenSex) {
      hidden++;
      continue;
    }

    if (childBirth && !plausibleByDates(person, childBirth, role)) {
      hidden++;
      continue;
    }

    options.push(person);
  }

  return { options, hidden };
}

function plausibleByDates(person: Person, childBirth: number, role: ParentRole): boolean {
  const birth = parseDate(person.birthDate);
  if (birth !== null) {
    const age = yearsBetween(birth, childBirth);
    if (age < PARENT_MIN_AGE || age > PARENT_MAX_AGE) return false;
  }

  const death = parseDate(person.deathDate);
  if (death !== null) {
    const limit = role === 'father' ? childBirth - FATHER_POSTHUMOUS_DAYS * DAY : childBirth;
    if (death < limit) return false;
  }

  return true;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * A data parcial (RN-027) vira um instante comparável, completando o que falta
 * com o começo do período: `1988` vira 1º de janeiro de 1988. Serve para
 * **filtrar por plausibilidade**, onde um mês de erro não muda nada — e não para
 * mostrar data nenhuma na tela. Sem ano não há como comparar: vira `null`, e a
 * pessoa fica na lista.
 *
 * Em UTC porque fuso não pode mudar quem aparece na lista.
 */
function parseDate(value?: string | null): number | null {
  const parts = parsePartialDate(value);
  if (!parts?.year) return null;
  return Date.UTC(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1);
}

function yearsBetween(from: number, to: number): number {
  return (to - from) / (365.2425 * DAY);
}
