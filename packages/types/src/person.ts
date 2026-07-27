import type { Location } from "./location";
import type { PersonUnion } from "./union";

export type Sex = "MALE" | "FEMALE";

/**
 * Rótulo social de como a pessoa entra na sua vida. Cônjuge **não** está aqui:
 * virou vínculo de verdade (`PersonUnion`), porque precisa distinguir atual de ex
 * e guardar início e fim (ADR-008).
 */
export type RelationshipType =
  | "FAMILY"
  | "FRIEND"
  | "ACQUAINTANCE"
  | "OTHER";

export interface Person {
  id: string;
  name: string;
  sex?: Sex | null;
  birthDate?: string | null;
  deathDate?: string | null;
  deceased: boolean;
  profilePhoto?: string | null;
  relationshipType: RelationshipType;
  isCentralUser: boolean;
  fatherId?: string | null;
  motherId?: string | null;
  locationId?: string | null;
  father?: Person | null;
  mother?: Person | null;
  location?: Location | null;
  /** Uniões conjugais desta pessoa, vigentes e desfeitas (RN-012). */
  unions?: PersonUnion[];
  /**
   * Grau de parentesco em relação à pessoa central, calculado pela API. Cobre
   * sangue (RN-004), cônjuge/ex (RN-012) e afinidade (RN-013).
   */
  kinshipDegree?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonFormData {
  name: string;
  sex?: Sex | null;
  birthDate?: string;
  deathDate?: string;
  deceased?: boolean;
  profilePhoto?: string;
  relationshipType: RelationshipType;
  isCentralUser?: boolean;
  fatherId?: string | null;
  motherId?: string | null;
  locationId?: string | null;
}

/** Campos aceitos em `GET /api/people?sortBy=` (RN-005). */
export type PeopleSortField = "name" | "birthDate" | "age";

export type SortDirection = "asc" | "desc";

export interface PaginatedPeopleResponse {
  data: Person[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
