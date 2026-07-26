import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { PeopleSortField, SortDirection } from '@kindred/types';

// As listas existem para validar em runtime; o `satisfies` garante que elas não
// saiam do contrato que o web consome (@kindred/types).
export const PEOPLE_SORT_FIELDS = [
  'name',
  'birthDate',
  'age',
] as const satisfies readonly PeopleSortField[];

export const SORT_DIRECTIONS = [
  'asc',
  'desc',
] as const satisfies readonly SortDirection[];

export type { PeopleSortField, SortDirection };

export class FindPeopleQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(PEOPLE_SORT_FIELDS)
  sortBy?: PeopleSortField;

  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
