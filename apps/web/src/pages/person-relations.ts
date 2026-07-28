/**
 * Quem é pai, mãe, filho e irmão de uma pessoa — para o card de detalhe da
 * árvore. Módulo puro, sem reactflow: a lista vem inteira do loader (não só
 * quem está desenhado na tela), então o card mostra a família de verdade mesmo
 * quando parte dela ainda não foi expandida na árvore.
 */
import type { Person } from '@kindred/types';

export interface PersonRelations {
  person: Person;
  father: Person | null;
  mother: Person | null;
  children: Person[];
  siblings: Person[];
}

/** Ordena por nome (pt-BR) — a ordem em que a lista chega não é garantia de nada. */
function byName(a: Person, b: Person): number {
  return a.name.localeCompare(b.name, 'pt-BR');
}

export function relationsOf(
  personId: string,
  people: Person[],
): PersonRelations | null {
  const person = people.find((p) => p.id === personId);
  if (!person) return null;

  const byId = new Map(people.map((p) => [p.id, p]));
  const father = person.fatherId ? (byId.get(person.fatherId) ?? null) : null;
  const mother = person.motherId ? (byId.get(person.motherId) ?? null) : null;

  const children = people
    .filter((p) => p.fatherId === person.id || p.motherId === person.id)
    .sort(byName);

  // Meio-irmão entra por só um lado bater — é o mesmo critério que a árvore usa
  // para desenhar o grupo de irmãos (tree-layout.ts).
  const siblings = people
    .filter(
      (p) =>
        p.id !== person.id &&
        ((person.fatherId && p.fatherId === person.fatherId) ||
          (person.motherId && p.motherId === person.motherId)),
    )
    .sort(byName);

  return { person, father, mother, children, siblings };
}
