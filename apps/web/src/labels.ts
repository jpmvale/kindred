import type { RelationshipType, Sex, UnionStatus } from '@kindred/types';

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
  FRIEND: 'Amigo(a)',
  ACQUAINTANCE: 'Conhecido(a)',
  OTHER: 'Outro',
};

export const UNION_STATUS_LABELS: Record<UnionStatus, string> = {
  CURRENT: 'União atual',
  ENDED: 'União desfeita',
};
