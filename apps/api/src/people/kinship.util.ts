/*
 * Cálculo do grau de parentesco em relação à pessoa central (RN-004, RN-012, RN-013).
 *
 * São dois grafos sobrepostos: o de sangue (pai/mãe) e o de uniões conjugais. O de
 * sangue é percorrido em largura contando subidas e descidas; o de uniões entra
 * depois, só para nomear a afinidade (sogro, cunhado, genro), e só através de uniões
 * vigentes — o parente do ex deixa de ser parente (RN-013).
 */

export type PersonNode = {
  id: string;
  fatherId: string | null;
  motherId: string | null;
  sex?: string | null;
  /**
   * Rótulo social. Só interessa ao cálculo no fim da linha: "Parente distante"
   * é resposta para quem é da família, não para amigo ou conhecido (RN-015).
   * Ausente é lido como `FAMILY`.
   */
  relationshipType?: string | null;
};

export type UnionEdge = {
  partnerAId: string;
  partnerBId: string;
  status: string;
};

/** Teto de passos da busca consanguínea — evita percorrer bases grandes à toa. */
const MAX_STEPS = 8;

type BloodPath = { ups: number; downs: number };

type Graph = {
  people: Map<string, PersonNode>;
  childrenOf: Map<string, string[]>;
};

export function computeKinship(
  targetId: string,
  centralId: string,
  allPeople: PersonNode[],
  unions: UnionEdge[] = [],
): string | null {
  if (targetId === centralId) return 'Você';

  const graph = buildGraph(allPeople);
  const target = graph.people.get(targetId);
  const targetSex = target?.sex ?? null;

  // O vínculo conjugal direto vem antes do sangue: quem é casado com a pessoa
  // central é "Esposa", mesmo no caso raro de também ser primo em 3º grau.
  const ownUnion = unions.find((u) => joins(u, centralId, targetId));
  if (ownUnion) return spouseLabel(ownUnion.status, targetSex);

  const blood = findBloodPath(centralId, targetId, graph);
  if (blood) return kinshipLabel(blood.ups, blood.downs, targetSex);

  const affinity = affinityLabel(targetId, centralId, graph, unions);
  if (affinity) return affinity;

  // Sem caminho nenhum. Para quem é da família isso é "não se sabe como, mas é
  // parente"; para amigo ou conhecido não é resposta — é ruído (RN-015).
  const relationshipType = target?.relationshipType ?? 'FAMILY';
  return relationshipType === 'FAMILY' ? 'Parente distante' : null;
}

function buildGraph(allPeople: PersonNode[]): Graph {
  const people = new Map<string, PersonNode>();
  const childrenOf = new Map<string, string[]>();

  for (const p of allPeople) {
    people.set(p.id, p);
    for (const parentId of [p.fatherId, p.motherId]) {
      if (!parentId) continue;
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId)!.push(p.id);
    }
  }

  return { people, childrenOf };
}

/**
 * Caminho consanguíneo de `fromId` até `toId`, em subidas e descidas. A subida só
 * acontece antes de qualquer descida: o caminho é sempre "sobe até o ancestral
 * comum, depois desce", o que impede rotular sogro e cunhado como sangue.
 */
function findBloodPath(
  fromId: string,
  toId: string,
  graph: Graph,
): BloodPath | null {
  if (fromId === toId) return { ups: 0, downs: 0 };

  const visited = new Set<string>();
  const queue: { id: string; ups: number; downs: number }[] = [
    { id: fromId, ups: 0, downs: 0 },
  ];

  while (queue.length > 0) {
    const { id, ups, downs } = queue.shift()!;
    const key = `${id}:${ups}:${downs}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (id === toId) return { ups, downs };
    if (ups + downs >= MAX_STEPS) continue;

    const current = graph.people.get(id);
    if (!current) continue;

    if (downs === 0) {
      if (current.fatherId)
        queue.push({ id: current.fatherId, ups: ups + 1, downs: 0 });
      if (current.motherId)
        queue.push({ id: current.motherId, ups: ups + 1, downs: 0 });
    }

    for (const childId of graph.childrenOf.get(id) ?? []) {
      queue.push({ id: childId, ups, downs: downs + 1 });
    }
  }

  return null;
}

/**
 * Afinidade: um único salto conjugal, em uma das duas direções — o parente do meu
 * cônjuge (sogro, cunhado, enteado) ou o cônjuge do meu parente (genro, cunhado,
 * padrasto). Só uniões vigentes contam (RN-013).
 */
function affinityLabel(
  targetId: string,
  centralId: string,
  graph: Graph,
  unions: UnionEdge[],
): string | null {
  const targetSex = graph.people.get(targetId)?.sex ?? null;

  // Direção 1: o alvo é parente de sangue do cônjuge da pessoa central.
  for (const partnerId of currentPartnersOf(centralId, unions)) {
    const path = findBloodPath(partnerId, targetId, graph);
    if (!path) continue;
    const named = IN_LAW_VIA_SPOUSE[`${path.ups}:${path.downs}`];
    if (named) return gender(targetSex, named);
    return `${kinshipLabel(path.ups, path.downs, targetSex)} do cônjuge`;
  }

  // Direção 2: o alvo é cônjuge de um parente de sangue da pessoa central.
  for (const relativeId of currentPartnersOf(targetId, unions)) {
    const path = findBloodPath(centralId, relativeId, graph);
    if (!path) continue;
    const named = IN_LAW_VIA_RELATIVE[`${path.ups}:${path.downs}`];
    if (named) return gender(targetSex, named);
    const relativeSex = graph.people.get(relativeId)?.sex ?? null;
    return `Cônjuge de ${kinshipLabel(path.ups, path.downs, relativeSex)}`;
  }

  return null;
}

function currentPartnersOf(personId: string, unions: UnionEdge[]): string[] {
  const partners: string[] = [];
  for (const union of unions) {
    if (union.status !== 'CURRENT') continue;
    if (union.partnerAId === personId) partners.push(union.partnerBId);
    else if (union.partnerBId === personId) partners.push(union.partnerAId);
  }
  return partners;
}

function joins(union: UnionEdge, a: string, b: string): boolean {
  return (
    (union.partnerAId === a && union.partnerBId === b) ||
    (union.partnerAId === b && union.partnerBId === a)
  );
}

type Flexion = [male: string, female: string, neutral: string];

function gender(sex: string | null, [male, female, neutral]: Flexion): string {
  if (sex === 'MALE') return male;
  if (sex === 'FEMALE') return female;
  return neutral;
}

function spouseLabel(status: string, sex: string | null): string {
  return status === 'CURRENT'
    ? gender(sex, ['Marido', 'Esposa', 'Cônjuge'])
    : gender(sex, ['Ex-marido', 'Ex-esposa', 'Ex-cônjuge']);
}

/** Parentes do meu cônjuge, indexados pelo caminho de sangue a partir dele. */
const IN_LAW_VIA_SPOUSE: Record<string, Flexion> = {
  '1:0': ['Sogro', 'Sogra', 'Sogro(a)'],
  '1:1': ['Cunhado', 'Cunhada', 'Cunhado(a)'],
  '0:1': ['Enteado', 'Enteada', 'Enteado(a)'],
};

/** Cônjuges dos meus parentes, indexados pelo caminho de sangue até o parente. */
const IN_LAW_VIA_RELATIVE: Record<string, Flexion> = {
  '1:1': ['Cunhado', 'Cunhada', 'Cunhado(a)'],
  '0:1': ['Genro', 'Nora', 'Genro/Nora'],
  '1:0': ['Padrasto', 'Madrasta', 'Padrasto/Madrasta'],
};

const BLOOD_LABELS: Record<string, Flexion> = {
  '1:0': ['Pai', 'Mãe', 'Pai/Mãe'],
  '0:1': ['Filho', 'Filha', 'Filho(a)'],
  '2:0': ['Avô', 'Avó', 'Avô/Avó'],
  '0:2': ['Neto', 'Neta', 'Neto(a)'],
  '1:1': ['Irmão', 'Irmã', 'Irmão/Irmã'],
  '3:0': ['Bisavô', 'Bisavó', 'Bisavô/Bisavó'],
  '0:3': ['Bisneto', 'Bisneta', 'Bisneto(a)'],
  '2:1': ['Tio', 'Tia', 'Tio/Tia'],
  '1:2': ['Sobrinho', 'Sobrinha', 'Sobrinho(a)'],
  '2:2': ['Primo', 'Prima', 'Primo(a)'],
  '4:0': ['Trisavô', 'Trisavó', 'Trisavô/Trisavó'],
  '0:4': ['Trisneto', 'Trisneta', 'Trisneto(a)'],
  '3:1': ['Tio-avô', 'Tia-avó', 'Tio(a)-avô/avó'],
  '1:3': ['Sobrinho-neto', 'Sobrinha-neta', 'Sobrinho(a)-neto(a)'],
  '3:2': ['Primo em 2º grau', 'Prima em 2º grau', 'Primo(a) em 2º grau'],
  '2:3': ['Primo em 2º grau', 'Prima em 2º grau', 'Primo(a) em 2º grau'],
  '3:3': ['Primo em 3º grau', 'Prima em 3º grau', 'Primo(a) em 3º grau'],
};

function kinshipLabel(ups: number, downs: number, sex: string | null): string {
  const entry = BLOOD_LABELS[`${ups}:${downs}`];
  if (entry) return gender(sex, entry);
  return `Parente de ${Math.max(ups, downs)}º grau`;
}
