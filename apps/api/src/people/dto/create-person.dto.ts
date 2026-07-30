import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
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

/**
 * Data parcial (RN-027): `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `--MM-DD` ou `--MM`.
 * Dia exige mês — não há calendário em que dia sozinho signifique alguma coisa —,
 * e por isso `--DD` não está na lista.
 */
const PARTIAL_DATE_REGEX =
  /^(?:\d{4}(?:-\d{2}(?:-\d{2})?)?|--\d{2}(?:-\d{2})?)$/;

const MENSAGEM_DATA =
  'A data deve ser AAAA-MM-DD, AAAA-MM, AAAA, --MM-DD ou --MM (dia exige mês).';

export class CreatePersonDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @Matches(PARTIAL_DATE_REGEX, { message: MENSAGEM_DATA })
  birthDate?: string;

  @IsOptional()
  @Matches(PARTIAL_DATE_REGEX, { message: MENSAGEM_DATA })
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
