import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { UnionStatus } from '@kindred/db';

// O enum vem do schema Prisma (@kindred/db), como nos DTOs de pessoa.
export { UnionStatus };

export class CreateUnionDto {
  @IsUUID()
  partnerAId: string;

  @IsUUID()
  partnerBId: string;

  @IsOptional()
  @IsEnum(UnionStatus)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  status?: UnionStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsDateString()
  endDate?: string;
}
