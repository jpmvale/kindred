/*
 * Cálculo do grau de parentesco em relação à pessoa central (RN-004, RN-012, RN-013).
 *
 * São dois grafos sobrepostos: o de sangue (pai/mãe) e o de uniões conjugais. O de
 * sangue é percorrido em largura contando subidas e descidas; o de uniões entra
 * depois, só para nomear a afinidade (sogro, cunhado, genro), e só através de uniões
 * vigentes — o parente do ex deixa de ser parente (RN-013).
 *
 * **A travessia acontece uma vez, não uma por pessoa** (ADR-012). Uma busca em
 * largura a partir da pessoa central já visita todo mundo alcançável, então o
 * grau de cada um é leitura de mapa. Quem precisa do grau da lista inteira usa o
 * `createKinshipResolver`; o `computeKinship` de uma pessoa só é um atalho por
 * cima dele.
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

/**
 * Prepara tudo o que não depende do alvo — o grafo, a travessia a partir da
 * pessoa central e a das pessoas com quem ela tem união vigente — e devolve uma
 * função que responde o grau de qualquer pessoa em tempo constante.
 *
 * É isto que torna a listagem viável: antes, cada pessoa remontava o grafo e
 * fazia a própria busca, o que dava um custo quadrático (ADR-012).
 */
export function createKinshipResolver(
  centralId: string,
  allPeople: PersonNode[],
  unions: UnionEdge[] = [],
): (targetId: string) => string | null {
  const graph = buildGraph(allPeople);
  const unionsOf = indexUnionsByPerson(unions);

  // Uma travessia a partir do centro dá o caminho de sangue até todo mundo.
  const bloodFromCentral = bloodPathsFrom(centralId, graph);

  // E uma por cônjuge vigente da pessoa central (na prática, um só) resolve a
  // afinidade pelo lado dele: sogro, cunhado, enteado.
  const bloodFromPartners = (unionsOf.get(centralId) ?? [])
    .filter((union) => union.status === 'CURRENT')
    .map((union) => bloodPathsFrom(otherSide(union, centralId), graph));

  return (targetId: string): string | null => {
    if (targetId === centralId) return 'Você';

    const target = graph.people.get(targetId);
    const targetSex = target?.sex ?? null;

    // O vínculo conjugal direto vem antes do sangue: quem é casado com a pessoa
    // central é "Esposa", mesmo no caso raro de também ser primo em 3º grau.
    const ownUnion = (unionsOf.get(targetId) ?? []).find(
      (union) => otherSide(union, targetId) === centralId,
    );
    if (ownUnion) return spouseLabel(ownUnion.status, targetSex);

    const blood = bloodFromCentral.get(targetId);
    if (blood) return kinshipLabel(blood.ups, blood.downs, targetSex);

    // Direção 1 da afinidade: o alvo é parente de sangue do cônjuge do centro.
    for (const paths of bloodFromPartners) {
      const path = paths.get(targetId);
      if (!path) continue;
      const named = IN_LAW_VIA_SPOUSE[`${path.ups}:${path.downs}`];
      if (named) return gender(targetSex, named);
      return `${kinshipLabel(path.ups, path.downs, targetSex)} do cônjuge`;
    }

    // Direção 2: o alvo é cônjuge de um parente de sangue do centro.
    for (const union of unionsOf.get(targetId) ?? []) {
      if (union.status !== 'CURRENT') continue;
      const relativeId = otherSide(union, targetId);
      const path = bloodFromCentral.get(relativeId);
      if (!path) continue;
      const named = IN_LAW_VIA_RELATIVE[`${path.ups}:${path.downs}`];
      if (named) return gender(targetSex, named);
      const relativeSex = graph.people.get(relativeId)?.sex ?? null;
      return `Cônjuge de ${kinshipLabel(path.ups, path.downs, relativeSex)}`;
    }

    // Sem caminho nenhum. Para quem é da família isso é "não se sabe como, mas é
    // parente"; para amigo ou conhecido não é resposta — é ruído (RN-015).
    const relationshipType = target?.relationshipType ?? 'FAMILY';
    return relationshipType === 'FAMILY' ? 'Parente distante' : null;
  };
}

/**
 * O grau de **uma** pessoa. Atalho por cima do resolver — use-o para uma consulta
 * avulsa; para uma lista inteira, crie o resolver uma vez e chame-o N vezes.
 */
export function computeKinship(
  targetId: string,
  centralId: string,
  allPeople: PersonNode[],
  unions: UnionEdge[] = [],
): string | null {
  return createKinshipResolver(centralId, allPeople, unions)(targetId);
}

/** As uniões de cada pessoa, para não varrer a lista inteira a cada consulta. */
function indexUnionsByPerson(unions: UnionEdge[]): Map<string, UnionEdge[]> {
  const byPerson = new Map<string, UnionEdge[]>();
  for (const union of unions) {
    for (const id of [union.partnerAId, union.partnerBId]) {
      const list = byPerson.get(id);
      if (list) list.push(union);
      else byPerson.set(id, [union]);
    }
  }
  return byPerson;
}

function otherSide(union: UnionEdge, personId: string): string {
  return union.partnerAId === personId ? union.partnerBId : union.partnerAId;
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
 * Caminho consanguíneo de `sourceId` até **cada** pessoa alcançável, em subidas e
 * descidas. A subida só acontece antes de qualquer descida: o caminho é sempre
 * "sobe até o ancestral comum, depois desce", o que impede rotular sogro e
 * cunhado como sangue.
 *
 * Como a busca é em largura, a primeira vez que um nó sai da fila é pelo caminho
 * mais curto — daí bastar guardar essa primeira visita. A fila anda por índice,
 * e não por `shift()`, que é O(n) em array e sozinho já tornava a travessia
 * quadrática.
 */
function bloodPathsFrom(
  sourceId: string,
  graph: Graph,
): Map<string, BloodPath> {
  const paths = new Map<string, BloodPath>();
  const visited = new Set<string>();
  const queue: { id: string; ups: number; downs: number }[] = [
    { id: sourceId, ups: 0, downs: 0 },
  ];

  for (let head = 0; head < queue.length; head++) {
    const { id, ups, downs } = queue[head];
    const key = `${id}:${ups}:${downs}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (!paths.has(id)) paths.set(id, { ups, downs });
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

  return paths;
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
