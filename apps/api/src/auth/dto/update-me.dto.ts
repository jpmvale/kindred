import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Trocar e-mail e/ou senha da própria conta (BL-16). `currentPassword` é
 * sempre exigida — é a defesa contra uma sessão sequestrada (XSS, computador
 * compartilhado) assumir a conta de vez trocando e-mail e senha sem saber a
 * senha atual. Pelo menos um de `email`/`newPassword` precisa vir: a
 * validação de "não veio nada para trocar" é do serviço, não do DTO.
 */
export class UpdateMeDto {
  @IsString()
  currentPassword: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email?: string;

  // Mesma ausência de regra de complexidade do cadastro — só o tamanho.
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;
}
