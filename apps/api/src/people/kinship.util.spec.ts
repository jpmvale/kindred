import { computeKinship } from './kinship.util';

/**
 * A árvore usada nos testes (a pessoa central é o Miguel), igual em espírito ao
 * seed do @kindred/db:
 *
 *   antonio + maria          jose + aparecida
 *      |         |                 |
 *   carlos ------+------------ regina        paulo (irmão do carlos)
 *      |                                       |
 *   miguel, beatriz                           diego
 *      |
 *    laura
 */
const PEOPLE = [
  { id: 'antonio', fatherId: null, motherId: null, sex: 'MALE' },
  { id: 'maria', fatherId: null, motherId: null, sex: 'FEMALE' },
  { id: 'jose', fatherId: null, motherId: null, sex: 'MALE' },
  { id: 'aparecida', fatherId: null, motherId: null, sex: 'FEMALE' },
  { id: 'carlos', fatherId: 'antonio', motherId: 'maria', sex: 'MALE' },
  { id: 'paulo', fatherId: 'antonio', motherId: 'maria', sex: 'MALE' },
  { id: 'regina', fatherId: 'jose', motherId: 'aparecida', sex: 'FEMALE' },
  { id: 'miguel', fatherId: 'carlos', motherId: 'regina', sex: 'MALE' },
  { id: 'beatriz', fatherId: 'carlos', motherId: 'regina', sex: 'FEMALE' },
  { id: 'diego', fatherId: 'paulo', motherId: null, sex: 'MALE' },
  { id: 'laura', fatherId: 'miguel', motherId: null, sex: 'FEMALE' },
  { id: 'estranho', fatherId: null, motherId: null, sex: 'MALE' },
];

describe('computeKinship', () => {
  const kinship = (id: string) => computeKinship(id, 'miguel', PEOPLE);

  it('reconhece a própria pessoa central', () => {
    expect(kinship('miguel')).toBe('Você');
  });

  it('reconhece pai e mãe', () => {
    expect(kinship('carlos')).toBe('Pai');
    expect(kinship('regina')).toBe('Mãe');
  });

  it('reconhece avós', () => {
    expect(kinship('antonio')).toBe('Avô');
    expect(kinship('aparecida')).toBe('Avó');
  });

  it('reconhece irmãos, tios e primos', () => {
    expect(kinship('beatriz')).toBe('Irmã');
    expect(kinship('paulo')).toBe('Tio');
    expect(kinship('diego')).toBe('Primo');
  });

  it('reconhece descendentes', () => {
    expect(kinship('laura')).toBe('Filha');
  });

  it('devolve parente distante quando não há caminho', () => {
    expect(kinship('estranho')).toBe('Parente distante');
  });
});
