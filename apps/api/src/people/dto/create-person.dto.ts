import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { RelationshipType, Sex } from '@kindred/db';

// Os enums vêm do schema Prisma (@kindred/db) — o client gerado exporta cada um
// como objeto em runtime, então dá para validar com @IsEnum sem redeclarar aqui.
export { RelationshipType, Sex };

/**
 * Teto do texto livre de `notes` (RN-019). O limite é o que permite a nota viajar
 * na listagem sem repetir o problema que tirou a foto de lá (ADR-011). Vive aqui,
 * e não no `@kindred/types`, porque é valor em runtime (ADR-005) — o web tem a
 * sua própria cópia, para avisar antes de o servidor recusar.
 */
export const NOTES_MAX_LENGTH = 2000;

export class CreatePersonDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsDateString()
  deathDate?: string;

  @IsOptional()
  @IsBoolean()
  deceased?: boolean;

  @IsEnum(RelationshipType)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  relationshipType: RelationshipType;

  @IsOptional()
  @IsBoolean()
  isCentralUser?: boolean;

  // Campo vazio vindo do formulário é ausência de nota, não texto em branco.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @IsString()
  @MaxLength(NOTES_MAX_LENGTH)
  notes?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsUUID()
  fatherId?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsUUID()
  motherId?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsUUID()
  locationId?: string | null;
}
