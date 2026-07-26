import type { RelationshipType, Sex } from '@kindred/types';

/**
 * Rótulos em pt-BR dos enums do domínio. Ficam no web porque são apresentação —
 * o contrato compartilhado (@kindred/types) carrega só os tipos.
 */
export const SEX_LABELS: Record<Sex, string> = {
  MALE: 'Masculino',
  FEMALE: 'Feminino',
};

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  FAMILY: 'Família',
  WIFE: 'Esposa',
  FRIEND: 'Amigo(a)',
  ACQUAINTANCE: 'Conhecido(a)',
  OTHER: 'Outro',
};
