import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateUnionDto } from './create-union.dto';

/**
 * Trocar quem são os parceiros seria outra união, não a mesma: só a situação e as
 * datas são editáveis.
 */
export class UpdateUnionDto extends PartialType(
  OmitType(CreateUnionDto, ['partnerAId', 'partnerBId'] as const),
) {}
