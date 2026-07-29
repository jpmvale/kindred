import type { Person } from "./person";

/**
 * Situação da união conjugal. É o que distingue o cônjuge do ex, e é por ela que
 * o parentesco por afinidade se propaga — só `CURRENT` propaga (RN-013).
 */
export type UnionStatus = "CURRENT" | "ENDED";

/**
 * União conjugal do ponto de vista de **uma** das pessoas: a API já resolve qual
 * dos dois lados da tabela é "o par" (`partner`), então quem consome nunca precisa
 * saber que existe um `partnerA` e um `partnerB`.
 *
 * `partner` só vem por extenso em `GET /api/people/:id` — quem edita uma pessoa
 * precisa do nome do parceiro na tela de uniões. As listas sem paginação (árvore,
 * calendário, candidatos de um formulário) mandam só `partnerId`: o nome já está
 * na própria lista, e mandar o parceiro por extenso de novo, para cada pessoa,
 * era peso sem uso (BL-14, ADR-017).
 */
export interface PersonUnion {
  id: string;
  status: UnionStatus;
  startDate?: string | null;
  endDate?: string | null;
  partnerId: string;
  partner?: Person;
}

export interface UnionFormData {
  partnerAId: string;
  partnerBId: string;
  status?: UnionStatus;
  startDate?: string;
  endDate?: string;
}
