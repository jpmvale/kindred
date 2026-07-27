/**
 * Contrato da API do kindred — os tipos que a API devolve e o web consome.
 *
 * O pacote é **só tipos**, sem nenhum valor em runtime: o web importa tudo com
 * `import type` e o bundler apaga o import, então não há dependência de módulo
 * CJS/ESM entre o front e um pacote do workspace (que é onde o Vite quebra).
 * Rótulos em pt-BR, por serem apresentação, vivem em `apps/web/src/labels.ts`.
 *
 * A fonte da verdade do schema é o `@kindred/db` (Prisma) — ver
 * `docs-tec/02-modelo-de-dados.md`.
 */
export type { Location, LocationFormData } from "./location";
export type {
  PaginatedPeopleResponse,
  PeopleSortField,
  Person,
  PersonFormData,
  RelationshipType,
  Sex,
  SortDirection,
} from "./person";
export type { PersonUnion, UnionFormData, UnionStatus } from "./union";
