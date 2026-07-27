import { computeKinship, type UnionEdge } from './kinship.util';

/**
 * A árvore usada nos testes (a pessoa central é o Miguel), igual em espírito ao
 * seed do @kindred/db:
 *
 *   antonio + maria          jose + aparecida        heitor + sonia
 *      |         |                 |                    |      |
 *   carlos ------+------------ regina    paulo       marcos   fernanda
 *      |                                   |                    |
 *   miguel, beatriz                      diego                (casa com miguel)
 *      |
 *    laura
 *
 * Uniões: miguel + fernanda (vigente), miguel + tereza (desfeita),
 * beatriz + rafael (vigente), laura + otavio (vigente), carlos + regina (vigente).
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

  // Família da Fernanda, esposa do Miguel.
  { id: 'heitor', fatherId: null, motherId: null, sex: 'MALE' },
  { id: 'sonia', fatherId: null, motherId: null, sex: 'FEMALE' },
  { id: 'fernanda', fatherId: 'heitor', motherId: 'sonia', sex: 'FEMALE' },
  { id: 'marcos', fatherId: 'heitor', motherId: 'sonia', sex: 'MALE' },

  // Cônjuges de parentes do Miguel.
  { id: 'rafael', fatherId: null, motherId: null, sex: 'MALE' },
  { id: 'otavio', fatherId: null, motherId: null, sex: 'MALE' },

  // Ex-esposa do Miguel e a família dela.
  { id: 'gilberto', fatherId: null, motherId: null, sex: 'MALE' },
  { id: 'tereza', fatherId: 'gilberto', motherId: null, sex: 'FEMALE' },
];

const UNIONS: UnionEdge[] = [
  { partnerAId: 'miguel', partnerBId: 'fernanda', status: 'CURRENT' },
  { partnerAId: 'miguel', partnerBId: 'tereza', status: 'ENDED' },
  { partnerAId: 'beatriz', partnerBId: 'rafael', status: 'CURRENT' },
  { partnerAId: 'laura', partnerBId: 'otavio', status: 'CURRENT' },
  { partnerAId: 'carlos', partnerBId: 'regina', status: 'CURRENT' },
];

describe('computeKinship', () => {
  const kinship = (id: string) => computeKinship(id, 'miguel', PEOPLE, UNIONS);

  describe('parentesco de sangue (RN-004)', () => {
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

    it('continua funcionando sem nenhuma união informada', () => {
      expect(computeKinship('carlos', 'miguel', PEOPLE)).toBe('Pai');
      expect(computeKinship('fernanda', 'miguel', PEOPLE)).toBe(
        'Parente distante',
      );
    });
  });

  describe('cônjuge e ex (RN-012)', () => {
    it('nomeia o cônjuge da pessoa central', () => {
      expect(kinship('fernanda')).toBe('Esposa');
    });

    it('nomeia a união desfeita como ex', () => {
      expect(kinship('tereza')).toBe('Ex-esposa');
    });

    it('flexiona pelo sexo, e fica neutro quando não se sabe', () => {
      const semSexo = [
        { id: 'central', fatherId: null, motherId: null, sex: null },
        { id: 'par', fatherId: null, motherId: null, sex: null },
      ];
      const uniao: UnionEdge[] = [
        { partnerAId: 'central', partnerBId: 'par', status: 'CURRENT' },
      ];
      expect(computeKinship('par', 'central', semSexo, uniao)).toBe('Cônjuge');

      const desfeita: UnionEdge[] = [
        { partnerAId: 'central', partnerBId: 'par', status: 'ENDED' },
      ];
      expect(computeKinship('par', 'central', semSexo, desfeita)).toBe(
        'Ex-cônjuge',
      );
    });
  });

  describe('afinidade pelo cônjuge (RN-013)', () => {
    it('reconhece sogro e sogra', () => {
      expect(kinship('heitor')).toBe('Sogro');
      expect(kinship('sonia')).toBe('Sogra');
    });

    it('reconhece o irmão do cônjuge como cunhado', () => {
      expect(kinship('marcos')).toBe('Cunhado');
    });

    it('nomeia parentes mais distantes do cônjuge de forma descritiva', () => {
      const comAvoDoConjuge = [
        ...PEOPLE,
        { id: 'avo-sonia', fatherId: null, motherId: null, sex: 'FEMALE' },
        { id: 'sonia2', fatherId: null, motherId: 'avo-sonia', sex: 'FEMALE' },
      ];
      // Refaz a Fernanda como filha da sonia2 para criar uma avó do cônjuge.
      const gente = comAvoDoConjuge.map((p) =>
        p.id === 'fernanda' ? { ...p, motherId: 'sonia2' } : p,
      );
      expect(computeKinship('avo-sonia', 'miguel', gente, UNIONS)).toBe(
        'Avó do cônjuge',
      );
    });
  });

  describe('afinidade pelo parente (RN-013)', () => {
    it('reconhece o cônjuge da irmã como cunhado', () => {
      expect(kinship('rafael')).toBe('Cunhado');
    });

    it('reconhece o cônjuge da filha como genro', () => {
      expect(kinship('otavio')).toBe('Genro');
    });

    it('reconhece o cônjuge do pai que não é a mãe como padrasto', () => {
      const gente = PEOPLE.map((p) =>
        p.id === 'miguel' ? { ...p, motherId: null } : p,
      );
      const unioes: UnionEdge[] = [
        { partnerAId: 'carlos', partnerBId: 'regina', status: 'CURRENT' },
      ];
      // Sem a regina como mãe, ela deixa de ser sangue e passa a ser a
      // cônjuge do pai.
      expect(computeKinship('regina', 'miguel', gente, unioes)).toBe(
        'Madrasta',
      );
    });

    it('nomeia o cônjuge de parentes mais distantes de forma descritiva', () => {
      const unioes: UnionEdge[] = [
        ...UNIONS,
        { partnerAId: 'diego', partnerBId: 'estranho', status: 'CURRENT' },
      ];
      expect(computeKinship('estranho', 'miguel', PEOPLE, unioes)).toBe(
        'Cônjuge de Primo',
      );
    });
  });

  describe('a união desfeita não propaga afinidade (RN-013)', () => {
    it('não trata o pai da ex como sogro', () => {
      expect(kinship('gilberto')).toBe('Parente distante');
    });

    it('deixa de reconhecer o cunhado quando a união termina', () => {
      expect(kinship('marcos')).toBe('Cunhado');

      const separados = UNIONS.map((u) =>
        u.partnerBId === 'fernanda' ? { ...u, status: 'ENDED' } : u,
      );
      expect(computeKinship('marcos', 'miguel', PEOPLE, separados)).toBe(
        'Parente distante',
      );
      expect(computeKinship('fernanda', 'miguel', PEOPLE, separados)).toBe(
        'Ex-esposa',
      );
    });
  });

  describe('precedência', () => {
    it('prefere o vínculo conjugal ao laço de sangue distante', () => {
      // Miguel e a prima Marina se casam: o rótulo que importa é "Esposa".
      const gente = [
        ...PEOPLE,
        { id: 'marina', fatherId: 'paulo', motherId: null, sex: 'FEMALE' },
      ];
      const unioes: UnionEdge[] = [
        { partnerAId: 'miguel', partnerBId: 'marina', status: 'CURRENT' },
      ];
      expect(computeKinship('marina', 'miguel', gente, unioes)).toBe('Esposa');
    });

    it('prefere o sangue à afinidade', () => {
      // A beatriz é irmã e continua irmã, mesmo com o marido no grafo.
      expect(kinship('beatriz')).toBe('Irmã');
    });
  });
});
