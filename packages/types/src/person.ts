import type { Location } from "./location";

export type Sex = "MALE" | "FEMALE";

export type RelationshipType =
  | "FAMILY"
  | "WIFE"
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
  /** Grau de parentesco em relação à pessoa central, calculado pela API (RN-004). */
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
