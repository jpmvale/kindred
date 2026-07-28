import { IsUUID } from 'class-validator';

/** Corpo de `PUT /api/people/central` — quem passa a ser a pessoa central (RN-018). */
export class SetCentralDto {
  @IsUUID()
  personId: string;
}
