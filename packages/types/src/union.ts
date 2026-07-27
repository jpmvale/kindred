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
 */
export interface PersonUnion {
  id: string;
  status: UnionStatus;
  startDate?: string | null;
  endDate?: string | null;
  partnerId: string;
  partner: Person;
}

export interface UnionFormData {
  partnerAId: string;
  partnerBId: string;
  status?: UnionStatus;
  startDate?: string;
  endDate?: string;
}
