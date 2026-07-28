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
  /**
   * Quando a foto foi enviada, ou nulo se não há foto (ADR-011). A imagem em si
   * fica em `GET /api/people/:id/photo` — nunca no corpo da pessoa. Serve para
   * duas coisas: saber se existe foto e desempatar o cache do navegador quando
   * ela é trocada.
   */
  photoUpdatedAt?: string | null;
  relationshipType: RelationshipType;
  isCentralUser: boolean;
  /**
   * Texto livre sobre a pessoa (RN-019). Vem junto na listagem, ao contrário da
   * foto — o teto de 2000 caracteres é o que torna isso seguro (ADR-011).
   */
  notes?: string | null;
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
  relationshipType: RelationshipType;
  isCentralUser?: boolean;
  notes?: string | null;
  fatherId?: string | null;
  motherId?: string | null;
  locationId?: string | null;
}

/** Tipos de imagem aceitos no upload da foto de perfil (RN-017). */
export type PhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Corpo de `PUT /api/people/:id/photo`. A imagem vai em base64 dentro do JSON —
 * o porquê de não ser multipart está no ADR-011.
 */
export interface PhotoUploadData {
  /** Só os bytes em base64, sem o prefixo `data:...;base64,`. */
  data: string;
  mimeType: PhotoMimeType;
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
