import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { RelationshipType, Sex } from '@kindred/db';

// Os enums vêm do schema Prisma (@kindred/db) — o client gerado exporta cada um
// como objeto em runtime, então dá para validar com @IsEnum sem redeclarar aqui.
export { RelationshipType, Sex };

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

  @IsOptional()
  @IsString()
  profilePhoto?: string;

  @IsEnum(RelationshipType)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  relationshipType: RelationshipType;

  @IsOptional()
  @IsBoolean()
  isCentralUser?: boolean;

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
