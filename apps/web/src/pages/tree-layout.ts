import dagre from '@dagrejs/dagre';
import type { Edge, Node } from 'reactflow';
import type { Person, UnionStatus } from '@kindred/types';
import { photoUrl } from '../photo';

// ─── Constantes ───────────────────────────────────────────────────────────────

export const NODE_W = 210;
export const NODE_H = 76;
const NODE_SEP = 26;
const RANK_SEP = 72;
const HORIZONTAL_NODE_GAP = 22;

/** Distância mínima entre dois nós do mesmo rank — e o passo do casal. */
const MIN_GAP = NODE_W + HORIZONTAL_NODE_GAP;

/**
 * Distância entre duas famílias nucleares diferentes no mesmo rank — maior que
 * `MIN_GAP` de propósito, para o agrupamento familiar ficar visível (~1.5×,
 * decisão de produto, não é arredondamento técnico).
 */
export const FAMILY_GAP = Math.round(MIN_GAP * 1.5);

/**
 * O peso de quem, no alinhamento das gerações, não tem para onde ser puxado —
 * um primo sem filhos quando a varredura sobe. Baixo de propósito: ele cede o
 * lugar a quem tem família para alinhar, mas não zero, senão ficaria sem
 * nenhuma preferência por onde já estava (ver `packRank`).
 */
const LOOSE_WEIGHT = 0.05;

/**
 * Quantas vezes o empacotamento por família varre a árvore inteira. Mais de uma
 * porque famílias sem pais visíveis são raízes no meio do desenho e o rank de
 * cima não as vê ao abrir espaço (ver `packFamilies`); quatro passadas bastaram
 * para zerar as sobreposições na base real, e o custo é linear.
 */
const PACK_PASSES = 4;

/**
 * As cores das arestas são `var(...)` em vez de hex porque elas viram `style` inline no SVG do
 * reactflow — e estilo inline resolve custom property normalmente, então a linha troca de cor junto
 * com o tema sem o layout saber que tema existe (ADR-015).
 */
export const EDGE_COLORS = {
  father: { normal: 'var(--tree-edge-father)', highlighted: 'var(--tree-edge-father-on)' },
  mother: { normal: 'var(--tree-edge-mother)', highlighted: 'var(--tree-edge-mother-on)' },
  union: { normal: 'var(--tree-edge-union)', highlighted: 'var(--tree-edge-union-on)' },
  unionEnded: { normal: 'var(--tree-edge-ended)', highlighted: 'var(--tree-edge-ended-on)' },
} as const;

/** Prefixos dos ids de aresta — é por eles que o hover sabe recolorir cada tipo. */
const EDGE_PREFIX = { father: 'ef-', mother: 'em-', union: 'eu-' } as const;

export function isUnionEdge(edgeId: string) {
  return edgeId.startsWith(EDGE_PREFIX.union);
}

export function parentEdgeStyle(edgeId: string, highlighted: boolean) {
  const colors = edgeId.startsWith(EDGE_PREFIX.father) ? EDGE_COLORS.father : EDGE_COLORS.mother;
  return {
    stroke: highlighted ? colors.highlighted : colors.normal,
    strokeWidth: highlighted ? 3.2 : 2,
  };
}

export function unionEdgeStyle(ended: boolean, highlighted: boolean) {
  const colors = ended ? EDGE_COLORS.unionEnded : EDGE_COLORS.union;
  return {
    stroke: highlighted ? colors.highlighted : colors.normal,
    strokeWidth: highlighted ? 3.2 : 2,
    strokeDasharray: ended ? '6 5' : undefined,
  };
}

// ─── Dados do nó ──────────────────────────────────────────────────────────────

export interface NodeData {
  id: string;
  name: string;
  sex?: string | null;
  photoUrl?: string | null;
  kinshipDegree?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  deceased: boolean;
  isCentralUser: boolean;
  hasParents: boolean;
  parentsExpanded: boolean;
  onToggleParents: (personId: string) => void;
  hasSideDown: boolean;
  sideDownExpanded: boolean;
  onToggleSideDown: (personId: string) => void;
  isHovered: boolean;
  isParentOfHovered: boolean;
  isChildOfHovered: boolean;
  isPartnerOfHovered: boolean;
}

// ─── Uniões ───────────────────────────────────────────────────────────────────

/** Uma união vista de fora, sem lado: a API entrega uma cópia para cada parceiro. */
interface UnionLink {
  id: string;
  aId: string;
  bId: string;
  status: UnionStatus;
}

function collectUnions(people: Person[]): UnionLink[] {
  const byId = new Map<string, UnionLink>();
  for (const person of people) {
    for (const union of person.unions ?? []) {
      if (byId.has(union.id)) continue;
      byId.set(union.id, {
        id: union.id,
        aId: person.id,
        bId: union.partnerId,
        status: union.status,
      });
    }
  }
  return [...byId.values()];
}

/**
 * Os pares que o layout mantém juntos sem haver união registrada: pai e mãe do
 * mesmo filho visível. Não são uniões — não viram linha desenhada, e o `status`
 * só existe porque o resto do layout ordena por ele — são a família nuclear que
 * o `fatherId|motherId` já define (a mesma chave do ADR-020) chegando também ao
 * posicionamento do casal.
 */
function coParentLinks(people: Person[], visibleIds: Set<string>, unions: UnionLink[]): UnionLink[] {
  const known = new Set(unions.map((u) => [u.aId, u.bId].sort().join('|')));
  const links = new Map<string, UnionLink>();
  for (const p of people) {
    const { fatherId, motherId } = p;
    if (!fatherId || !motherId) continue;
    if (!visibleIds.has(fatherId) || !visibleIds.has(motherId)) continue;
    const key = [fatherId, motherId].sort().join('|');
    if (known.has(key) || links.has(key)) continue;
    links.set(key, { id: `co-${key}`, aId: fatherId, bId: motherId, status: 'CURRENT' });
  }
  return [...links.values()];
}

/** Cônjuges de cada pessoa, na ordem em que a API os devolveu. */
function partnerIdsByPerson(unions: UnionLink[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    if (!map.has(from)) map.set(from, []);
    map.get(from)!.push(to);
  };
  for (const union of unions) {
    add(union.aId, union.bId);
    add(union.bId, union.aId);
  }
  return map;
}

// ─── Quem aparece ─────────────────────────────────────────────────────────────

export interface VisiblePeople {
  people: Person[];
  /**
   * Quem está na árvore atravessando uma união: o cônjuge e, se ele for
   * expandido, a família dele (sogro, cunhado, avó do cônjuge). Esse pessoal
   * anda junto no layout — ver `inLawGroups`.
   */
  inLawIds: Set<string>;
}

export function buildVisiblePeople(
  people: Person[],
  expandedParents: Set<string>,
  expandedSideDown: Set<string>,
  includeSiblings: boolean,
  includeSpouses: boolean,
): VisiblePeople {
  const pmap = new Map(people.map((p) => [p.id, p]));
  const childrenOf = new Map<string, Set<string>>();
  for (const p of people) {
    for (const pid of [p.fatherId, p.motherId]) {
      if (!pid) continue;
      if (!childrenOf.has(pid)) childrenOf.set(pid, new Set());
      childrenOf.get(pid)!.add(p.id);
    }
  }

  const visible = new Set<string>();
  const central = people.find((p) => p.isCentralUser);

  function addDescendants(id: string, seen = new Set<string>()) {
    if (seen.has(id)) return;
    seen.add(id);
    visible.add(id);
    for (const childId of childrenOf.get(id) ?? []) addDescendants(childId, seen);
  }

  function addAncestors(id: string) {
    const person = pmap.get(id);
    if (!person || !expandedParents.has(id)) return;
    for (const pid of [person.fatherId, person.motherId]) {
      if (!pid || !pmap.has(pid)) continue;
      visible.add(pid);
      addAncestors(pid);
    }
  }

  function addSiblingsAndCousinBranches(id: string) {
    const person = pmap.get(id);
    if (!person) return;

    // Irmaos: mesmos pais.
    for (const pid of [person.fatherId, person.motherId]) {
      if (!pid) continue;
      for (const siblingId of childrenOf.get(pid) ?? []) {
        if (siblingId === id) continue;
        visible.add(siblingId);
        addDescendants(siblingId);
      }
    }

    // Primos: filhos dos irmaos de pai/mae (incluindo descendentes desses ramos).
    for (const parentId of [person.fatherId, person.motherId]) {
      if (!parentId) continue;
      const parent = pmap.get(parentId);
      if (!parent) continue;
      visible.add(parentId);

      for (const grandParentId of [parent.fatherId, parent.motherId]) {
        if (!grandParentId) continue;
        visible.add(grandParentId);

        for (const auntUncleId of childrenOf.get(grandParentId) ?? []) {
          if (auntUncleId === parentId) continue;
          visible.add(auntUncleId);
          addDescendants(auntUncleId);
        }
      }
    }
  }

  if (central) {
    addDescendants(central.id);
    addAncestors(central.id);
    for (const id of [...visible]) addAncestors(id);
  } else {
    // Fallback sem central: mantém apenas pessoas com algum vínculo familiar.
    for (const p of people) {
      if (p.fatherId || p.motherId || childrenOf.has(p.id)) visible.add(p.id);
    }
  }

  // Expansao lateral + para baixo aplicada apenas em nos visiveis.
  if (includeSiblings) {
    for (const id of expandedSideDown) {
      if (!visible.has(id)) continue;
      addSiblingsAndCousinBranches(id);
    }
  }

  // Cônjuges por último, sobre quem o sangue já trouxe: assim o cônjuge de alguém
  // que só apareceu numa expansão também aparece.
  const inLawIds = new Set<string>();
  if (includeSpouses) {
    const partnersOf = partnerIdsByPerson(collectUnions(people));
    const addPartners = (ids: string[]) => {
      for (const id of ids) {
        for (const partnerId of partnersOf.get(id) ?? []) {
          if (!pmap.has(partnerId) || visible.has(partnerId)) continue;
          visible.add(partnerId);
          inLawIds.add(partnerId);
        }
      }
    };

    addPartners([...visible]);

    // A família do cônjuge só entra quando ele é expandido: a árvore é de sangue,
    // e trazer a linha do sogro sem pedir dobraria o tamanho dela (RN-013 dá o
    // nome — sogro, cunhado —, mas quem decide se aparece é quem está olhando).
    const before = new Set(visible);
    for (const id of [...inLawIds]) {
      addAncestors(id);
      if (includeSiblings && expandedSideDown.has(id)) {
        addSiblingsAndCousinBranches(id);
      }
    }
    const inLawFamily = [...visible].filter((id) => !before.has(id));
    for (const id of inLawFamily) inLawIds.add(id);

    // Mais uma volta, para o cunhado não aparecer sozinho enquanto todo o resto
    // da árvore aparece em casal. Só uma: a lista percorrida não cresce de novo.
    addPartners(inLawFamily);
  }

  return { people: people.filter((p) => visible.has(p.id)), inLawIds };
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export interface LayoutOptions {
  people: Person[];
  expandedParents: Set<string>;
  expandedSideDown: Set<string>;
  includeSiblings: boolean;
  includeSpouses: boolean;
  onToggleParents: (personId: string) => void;
  onToggleSideDown: (personId: string) => void;
}

/** A caixa de uma família nuclear (casal-âncora + filhos), no mesmo espaço de `node.position`. */
export interface FamilyGroup {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function computeLayout({
  people: allPeople,
  expandedParents,
  expandedSideDown,
  includeSiblings,
  includeSpouses,
  onToggleParents,
  onToggleSideDown,
}: LayoutOptions): { nodes: Node[]; edges: Edge[]; familyGroups: FamilyGroup[] } {
  const { people, inLawIds } = buildVisiblePeople(
    allPeople,
    expandedParents,
    expandedSideDown,
    includeSiblings,
    includeSpouses,
  );
  const allPeopleById = new Map(allPeople.map((p) => [p.id, p]));
  const allChildrenOf = new Map<string, Set<string>>();
  for (const p of allPeople) {
    for (const pid of [p.fatherId, p.motherId]) {
      if (!pid) continue;
      if (!allChildrenOf.has(pid)) allChildrenOf.set(pid, new Set());
      allChildrenOf.get(pid)!.add(p.id);
    }
  }
  const visibleIds = new Set(people.map((p) => p.id));
  const hiddenInSubtreeCache = new Map<string, boolean>();
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: 'TB',
    align: 'UL',
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 20,
    marginy: 20,
    ranker: 'tight-tree',
  });

  for (const p of people) {
    dagreGraph.setNode(p.id, { width: NODE_W, height: NODE_H });
  }

  const edges: Edge[] = [];
  for (const p of people) {
    for (const [parentId, prefix] of [
      [p.fatherId, EDGE_PREFIX.father],
      [p.motherId, EDGE_PREFIX.mother],
    ] as const) {
      if (!parentId || !visibleIds.has(parentId)) continue;
      // Filiação vale para todo mundo, inclusive o cônjuge: é dela que sai o
      // rank do sogro, uma geração acima. Quem não tem filiação visível fica
      // solto no topo e é o `placeCouples` que o traz para a altura do par.
      dagreGraph.setEdge(parentId, p.id);
      edges.push({
        id: `${prefix}${parentId}-${p.id}`,
        source: parentId,
        target: p.id,
        type: 'smoothstep',
        style: parentEdgeStyle(prefix, false),
      });
    }
  }

  dagre.layout(dagreGraph);

  // Pos-processamento leve: aproxima irmaos sem quebrar o layout global do dagre.
  const layoutPos = new Map<string, { x: number; y: number }>();
  for (const p of people) {
    const n = dagreGraph.node(p.id) as { x: number; y: number } | undefined;
    layoutPos.set(p.id, n ? { x: n.x, y: n.y } : { x: 0, y: 0 });
  }

  const central = people.find((p) => p.isCentralUser);
  const siblingGroups = new Map<string, string[]>();
  for (const p of people) {
    const parentKey = `${p.fatherId ?? ''}|${p.motherId ?? ''}`;
    if (parentKey === '|') continue;
    if (!siblingGroups.has(parentKey)) siblingGroups.set(parentKey, []);
    siblingGroups.get(parentKey)!.push(p.id);
  }

  for (const ids of siblingGroups.values()) {
    if (ids.length < 2) continue;
    const isFathersSiblingGroup =
      Boolean(central?.fatherId) && ids.includes(central!.fatherId!);
    const isMothersSiblingGroup =
      Boolean(central?.motherId) && ids.includes(central!.motherId!);

    const sorted = ids
      .map((id) => ({ id, pos: layoutPos.get(id)! }))
      .sort((a, b) => {
        if (isFathersSiblingGroup && central?.fatherId) {
          if (a.id === central.fatherId) return -1;
          if (b.id === central.fatherId) return 1;
        }
        if (isMothersSiblingGroup && central?.motherId) {
          // No lado materno, mae fica mais proxima do centro (mais a direita do grupo esquerdo).
          if (a.id === central.motherId) return 1;
          if (b.id === central.motherId) return -1;
        }
        return a.pos.x - b.pos.x;
      });
    const centerX = sorted.reduce((acc, item) => acc + item.pos.x, 0) / sorted.length;
    const start = centerX - ((sorted.length - 1) * MIN_GAP) / 2;
    sorted.forEach((item, i) => {
      item.pos.x = start + i * MIN_GAP;
      layoutPos.set(item.id, item.pos);
    });
  }

  const centralX = central ? (layoutPos.get(central.id)?.x ?? 0) : 0;

  // Regras direcionais: lado paterno cresce para direita, lado materno para esquerda.
  if (central) {
    const fatherId = central.fatherId && visibleIds.has(central.fatherId) ? central.fatherId : null;
    const motherId = central.motherId && visibleIds.has(central.motherId) ? central.motherId : null;

    if (fatherId) {
      const pos = layoutPos.get(fatherId);
      if (pos) pos.x = Math.max(pos.x, centralX + MIN_GAP);
    }
    if (motherId) {
      const pos = layoutPos.get(motherId);
      if (pos) pos.x = Math.min(pos.x, centralX - MIN_GAP);
    }

    const adjacency = new Map<string, Set<string>>();
    function link(a: string, b: string) {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    }
    for (const p of people) {
      if (p.fatherId && layoutPos.has(p.fatherId)) link(p.id, p.fatherId);
      if (p.motherId && layoutPos.has(p.motherId)) link(p.id, p.motherId);
    }

    function collectBranch(seedId: string | null, blocked: Set<string>): Set<string> {
      const result = new Set<string>();
      if (!seedId || blocked.has(seedId)) return result;
      const stack = [seedId];
      while (stack.length) {
        const current = stack.pop()!;
        if (result.has(current) || blocked.has(current)) continue;
        result.add(current);
        for (const next of adjacency.get(current) ?? []) {
          if (!result.has(next) && !blocked.has(next)) stack.push(next);
        }
      }
      return result;
    }

    const paternalBranch = collectBranch(fatherId, new Set([central.id, ...(motherId ? [motherId] : [])]));
    const maternalBranch = collectBranch(motherId, new Set([central.id, ...(fatherId ? [fatherId] : [])]));
    const intersection = new Set<string>([...paternalBranch].filter((id) => maternalBranch.has(id)));
    intersection.forEach((id) => {
      paternalBranch.delete(id);
      maternalBranch.delete(id);
    });

    const fatherAnchor = fatherId ? (layoutPos.get(fatherId)?.x ?? (centralX + MIN_GAP)) : (centralX + MIN_GAP);
    const motherAnchor = motherId ? (layoutPos.get(motherId)?.x ?? (centralX - MIN_GAP)) : (centralX - MIN_GAP);

    for (const id of paternalBranch) {
      const pos = layoutPos.get(id);
      if (pos) pos.x = Math.max(pos.x, fatherAnchor);
    }
    for (const id of maternalBranch) {
      const pos = layoutPos.get(id);
      if (pos) pos.x = Math.min(pos.x, motherAnchor);
    }
  }

  const unions = includeSpouses ? collectUnions(allPeople).filter(
    (u) => visibleIds.has(u.aId) && visibleIds.has(u.bId),
  ) : [];
  // O que o layout trata como casal é mais que a união registrada: quem tem um
  // filho em comum também anda junto (ADR-022). Na base real, **todos** os 54
  // filhos com pai e mãe cadastrados têm os pais sem união nenhuma registrada —
  // sem isso, pai e mãe eram duas famílias independentes, cada uma puxada para
  // um lado, e o filho ficava embaixo de um só (7163 px separavam os pais da
  // pessoa central). A união segue sendo o único dado que vira linha desenhada:
  // co-parentalidade posiciona, não inventa vínculo.
  const couples = [...unions, ...coParentLinks(people, visibleIds, unions)];

  // Casais primeiro, espaçamento depois: o passe seguinte trata o casal como um
  // bloco só, senão ele enfiaria alguém entre os dois.
  const affinityGroups = inLawGroups(people, inLawIds);
  const coupleBlocks = placeCouples(couples, inLawIds, affinityGroups, layoutPos, centralX);
  // Só para ordenar famílias por proximidade — não é o grau de parentesco do
  // backend, é uma contagem de saltos que o próprio layout consegue fazer.
  const distanceOf = buildStructuralDistances(people, couples, central?.id ?? null);
  const nodeGap = makeGapRule(allPeopleById, couples);
  // `spreadRanks` decide a ORDEM lateral de cada rank (lado paterno/materno e
  // parente mais próximo por dentro, ADR-020); `packFamilies` decide as
  // posições, tratando cada família como bloco rígido e medindo a distância
  // entre famílias pelo contorno da descendência inteira (ADR-022).
  spreadRanks(layoutPos, coupleBlocks, allChildrenOf, visibleIds, distanceOf, blockGapRule(nodeGap), centralX);
  packFamilies(
    layoutPos,
    coupleBlocks,
    allPeopleById,
    allChildrenOf,
    visibleIds,
    inLawIds,
    nodeGap,
  );
  const familyGroups = buildFamilyGroups(people, layoutPos);

  // As arestas de união saem depois do layout porque quem é fonte e quem é alvo
  // depende de quem ficou à esquerda.
  for (const union of unions) {
    const a = layoutPos.get(union.aId);
    const b = layoutPos.get(union.bId);
    if (!a || !b) continue;
    const [leftId, rightId] = a.x <= b.x ? [union.aId, union.bId] : [union.bId, union.aId];
    edges.push({
      id: `${EDGE_PREFIX.union}${union.id}`,
      source: leftId,
      sourceHandle: 'spouse-right',
      target: rightId,
      targetHandle: 'spouse-left',
      type: 'straight',
      style: unionEdgeStyle(union.status === 'ENDED', false),
    });
  }

  function subtreeHasHiddenNodes(rootId: string): boolean {
    const cached = hiddenInSubtreeCache.get(rootId);
    if (cached !== undefined) return cached;

    const visited = new Set<string>();
    function dfs(id: string): boolean {
      if (visited.has(id)) return false;
      visited.add(id);
      if (!visibleIds.has(id)) return true;
      for (const childId of allChildrenOf.get(id) ?? []) {
        if (dfs(childId)) return true;
      }
      return false;
    }

    const result = dfs(rootId);
    hiddenInSubtreeCache.set(rootId, result);
    return result;
  }

  const nodes: Node[] = people.map((p) => {
    const n = layoutPos.get(p.id);
    const hasParents = Boolean(p.fatherId || p.motherId);

    let hasSideDown = false;
    if (includeSiblings) {
      for (const pid of [p.fatherId, p.motherId]) {
        if (!pid) continue;
        const siblings = allChildrenOf.get(pid);
        if (siblings && [...siblings].some((sid) => sid !== p.id && !visibleIds.has(sid))) {
          hasSideDown = true;
          break;
        }
      }

      if (!hasSideDown) {
        for (const parentId of [p.fatherId, p.motherId]) {
          if (!parentId) continue;
          const parent = allPeopleById.get(parentId);
          if (!parent) continue;
          for (const grandParentId of [parent.fatherId, parent.motherId]) {
            if (!grandParentId) continue;
            const auntUncles = allChildrenOf.get(grandParentId);
            if (auntUncles && [...auntUncles].some((id) => id !== parentId && subtreeHasHiddenNodes(id))) {
              hasSideDown = true;
              break;
            }
          }
          if (hasSideDown) break;
        }
      }
    }

    const data: NodeData = {
      id: p.id,
      name: p.name,
      sex: p.sex,
      photoUrl: photoUrl(p),
      kinshipDegree: p.kinshipDegree,
      birthDate: p.birthDate,
      deathDate: p.deathDate,
      deceased: p.deceased,
      isCentralUser: p.isCentralUser,
      hasParents,
      parentsExpanded: expandedParents.has(p.id),
      onToggleParents,
      hasSideDown,
      sideDownExpanded: expandedSideDown.has(p.id),
      onToggleSideDown,
      isHovered: false,
      isParentOfHovered: false,
      isChildOfHovered: false,
      isPartnerOfHovered: false,
    };

    return {
      id: p.id,
      type: 'person',
      position: n ? { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 } : { x: 0, y: 0 },
      data,
    };
  });

  return { nodes, edges, familyGroups };
}

type Positions = Map<string, { x: number; y: number }>;

// ─── Agrupamento familiar ───────────────────────────────────────────────────

/**
 * A chave da família nuclear de uma pessoa: quem são os pais dela. É a mesma
 * ideia que `siblingGroups` (acima) já usa para juntar irmãos — promovida a
 * função porque `spreadRanks` e `buildFamilyGroups` precisam da mesma noção.
 * Sem pai nem mãe conhecidos, a chave é o próprio id: duas pessoas "sem
 * família" não devem virar uma família só porque as duas têm a chave vazia.
 */
function personalFamilyKey(p: Person): string {
  const key = `${p.fatherId ?? ''}|${p.motherId ?? ''}`;
  return key === '|' ? p.id : key;
}

/**
 * Distância estrutural até a pessoa central — número de saltos de filiação ou
 * união. Só serve para ORDENAR famílias dentro do mesmo rank (parente mais
 * próximo perto do centro): não é o grau de parentesco do backend
 * (`kinshipDegree`), é uma contagem que o próprio layout consegue fazer a
 * partir de quem está visível. Fila por índice, não por `shift()` — o mesmo
 * cuidado do `createKinshipResolver` (ADR-012): um array com `shift()` é O(n)
 * por chamada, e uma árvore grande faz isso centenas de vezes.
 */
function buildStructuralDistances(
  people: Person[],
  unions: UnionLink[],
  centralId: string | null,
): Map<string, number> {
  const distance = new Map<string, number>();
  if (!centralId) return distance;

  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };
  for (const p of people) {
    if (p.fatherId) link(p.id, p.fatherId);
    if (p.motherId) link(p.id, p.motherId);
  }
  for (const u of unions) link(u.aId, u.bId);

  distance.set(centralId, 0);
  const queue = [centralId];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const d = distance.get(current)!;
    for (const next of adjacency.get(current) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, d + 1);
      queue.push(next);
    }
  }
  return distance;
}

/**
 * Quem se move junto quando um bloco é empurrado para abrir espaço: o próprio
 * bloco (cônjuge e grupo de afinidade, via `blockOf`) mais toda a
 * descendência visível dele. Só desce — nunca sobe para pai/mãe —, senão
 * arrastaria de volta um rank já processado (os ranks são varridos de cima
 * para baixo em `spreadRanks`, então "já processado" sempre significa
 * ancestral). `blockMembers` é o índice inverso de `blockOf`, calculado uma
 * vez só em `spreadRanks` — sem ele, cada chamada varreria `blockOf` inteiro.
 */
function collectDependents(
  seedIds: Iterable<string>,
  childrenOf: Map<string, Set<string>>,
  visibleIds: Set<string>,
  blockOf: Map<string, string>,
  blockMembers: Map<string, string[]>,
): Set<string> {
  const result = new Set<string>();
  const stack = [...seedIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);

    const block = blockOf.get(id);
    for (const memberId of (block ? blockMembers.get(block) : undefined) ?? []) {
      if (!result.has(memberId)) stack.push(memberId);
    }
    for (const childId of childrenOf.get(id) ?? []) {
      if (visibleIds.has(childId) && !result.has(childId)) stack.push(childId);
    }
  }
  return result;
}

/**
 * A caixa de cada família nuclear (casal-âncora + filhos que compartilham a
 * mesma chave), para o indicador visual na árvore. Filho único sem nenhum dos
 * pais visível não forma caixa — não há "família" para desenhar em volta de
 * uma pessoa sozinha, sem par nem filho.
 */
function buildFamilyGroups(people: Person[], layoutPos: Positions): FamilyGroup[] {
  const membersByKey = new Map<string, Set<string>>();
  for (const p of people) {
    const key = personalFamilyKey(p);
    if (key === p.id) continue;
    if (!membersByKey.has(key)) membersByKey.set(key, new Set());
    membersByKey.get(key)!.add(p.id);
    for (const parentId of key.split('|')) {
      if (parentId && layoutPos.has(parentId)) membersByKey.get(key)!.add(parentId);
    }
  }

  const groups: FamilyGroup[] = [];
  for (const [key, idSet] of membersByKey) {
    const ids = [...idSet].filter((id) => layoutPos.has(id));
    if (ids.length < 2) continue;

    const boxes = ids.map((id) => layoutPos.get(id)!);
    groups.push({
      id: key,
      minX: Math.min(...boxes.map((b) => b.x)) - NODE_W / 2,
      maxX: Math.max(...boxes.map((b) => b.x)) + NODE_W / 2,
      minY: Math.min(...boxes.map((b) => b.y)) - NODE_H / 2,
      maxY: Math.max(...boxes.map((b) => b.y)) + NODE_H / 2,
    });
  }
  return groups;
}

/**
 * Encosta cada cônjuge no par, na mesma altura. Vale tanto para quem só está na
 * árvore por causa da união quanto para quem tem rank próprio — o cônjuge com
 * filhos, por exemplo, entra como pai/mãe de alguém visível e mesmo assim
 * precisa aparecer ao lado.
 *
 * Havendo mais de uma união, os lados **alternam**: a vigente vai para fora (para
 * longe da pessoa central) e a ex para o outro lado, com o par no meio. Empilhar
 * as duas do mesmo lado faria a linha da ex atravessar o card da atual, e a
 * árvore passaria a dizer que quem é casado são as duas.
 *
 * Devolve o bloco de cada pessoa: quem está no mesmo bloco anda junto no
 * espaçamento seguinte.
 */
function placeCouples(
  unions: UnionLink[],
  inLawIds: Set<string>,
  groupOf: Map<string, string[]>,
  layoutPos: Positions,
  centralX: number,
): Map<string, string> {
  const blockOf = new Map<string, string>();

  // Quem fica parado e quem é encostado nele. Quem veio pela união é sempre o
  // que se move: arrastar o lado de sangue levaria junto a árvore inteira.
  const pairs: { anchorId: string; guestId: string; ended: boolean }[] = [];
  for (const union of unions) {
    const aInLaw = inLawIds.has(union.aId);
    const bInLaw = inLawIds.has(union.bId);
    const ended = union.status === 'ENDED';

    if (aInLaw !== bInLaw) {
      const [anchorId, guestId] = aInLaw ? [union.bId, union.aId] : [union.aId, union.bId];
      if (layoutPos.has(anchorId) && layoutPos.has(guestId)) {
        pairs.push({ anchorId, guestId, ended });
      }
      continue;
    }

    const a = layoutPos.get(union.aId);
    const b = layoutPos.get(union.bId);
    if (!a || !b) continue;
    // Gerações diferentes: encostar um no outro quebraria a leitura da árvore.
    if (Math.abs(a.y - b.y) > 1) continue;
    // Os dois de sangue: fica quem está mais perto do centro.
    const [anchorId, guestId] =
      Math.abs(a.x - centralX) <= Math.abs(b.x - centralX)
        ? [union.aId, union.bId]
        : [union.bId, union.aId];
    pairs.push({ anchorId, guestId, ended });
  }

  // Do centro para fora, e a união vigente antes da desfeita — quem vem primeiro
  // fica com o lado de fora, o mais visível.
  pairs.sort(
    (a, b) =>
      Math.abs(layoutPos.get(a.anchorId)!.x - centralX) -
        Math.abs(layoutPos.get(b.anchorId)!.x - centralX) ||
      Number(a.ended) - Number(b.ended),
  );

  const moved = new Set<string>();
  const slots = new Map<string, number>();

  for (const { anchorId, guestId } of pairs) {
    // Já encostado noutra união: mover de novo desfaria o primeiro casal. Mas o
    // par continua sendo um par — se os dois já estão lado a lado (o caso do
    // sogro e da sogra, que vieram juntos no deslocamento em bloco do grupo de
    // afinidade), o bloco é registrado sem ninguém se mover. Sem isso eles
    // ficavam em blocos separados, e no empacotamento por família (ADR-022) cada
    // metade do casal era puxada por um lado, rasgando a família em duas.
    if (moved.has(guestId) || moved.has(anchorId)) {
      const anchor = layoutPos.get(anchorId)!;
      const guest = layoutPos.get(guestId)!;
      // O limite é `FAMILY_GAP` e não `MIN_GAP` porque quem os posicionou aqui
      // foi o dagre, com o `nodesep` dele (236 px, quatro a mais que o passo do
      // casal) — medir com o passo exato deixava o par de fora por 4 px.
      const juntos =
        Math.abs(anchor.y - guest.y) <= 1 && Math.abs(anchor.x - guest.x) <= FAMILY_GAP;
      if (juntos) {
        const block = blockOf.get(anchorId) ?? blockOf.get(guestId) ?? anchorId;
        blockOf.set(anchorId, block);
        blockOf.set(guestId, block);
        // E o passo passa a ser o do layout, não o do dagre: ninguém mais mexe
        // na distância interna de um bloco depois daqui. Pelo mesmo mecanismo de
        // vagas do caminho principal — um segundo par do mesmo âncora vai para o
        // outro lado, senão os dois pousariam na mesma coluna.
        const slot = slots.get(anchorId) ?? 0;
        slots.set(anchorId, slot + 1);
        const outward = anchor.x >= centralX ? 1 : -1;
        const side = slot % 2 === 0 ? outward : -outward;
        guest.x = anchor.x + side * MIN_GAP * (Math.floor(slot / 2) + 1);
      }
      continue;
    }

    const anchor = layoutPos.get(anchorId)!;
    const slot = slots.get(anchorId) ?? 0;
    slots.set(anchorId, slot + 1);

    const guest = layoutPos.get(guestId)!;
    const outward = anchor.x >= centralX ? 1 : -1;
    const side = slot % 2 === 0 ? outward : -outward;
    const target = {
      x: anchor.x + side * MIN_GAP * (Math.floor(slot / 2) + 1),
      y: anchor.y,
    };

    // A família do cônjuge anda junto com ele: o dagre já a arrumou em volta
    // (sogro acima, cunhado ao lado), e mover só o cônjuge esticaria tudo. O
    // deslocamento é o mesmo para o grupo inteiro, então o desenho interno fica
    // de pé — inclusive na vertical, quando o cônjuge não tinha rank próprio e
    // o grupo dele ficou pendurado no topo.
    //
    // `blockOf` só registra o par cônjuge-âncora, não o grupo de afinidade
    // inteiro: sogro e cunhado continuam como blocos independentes em
    // `spreadRanks`, que é justamente o que garante que nenhum deles fica
    // exatamente em cima de outra pessoa depois do deslocamento em bloco —
    // ver `sameFamily` lá, que os reconhece como família sem precisar do
    // mesmo `blockOf`.
    const delta = { x: target.x - guest.x, y: target.y - guest.y };
    for (const memberId of groupOf.get(guestId) ?? [guestId]) {
      const pos = layoutPos.get(memberId);
      if (!pos) continue;
      pos.x += delta.x;
      pos.y += delta.y;
      moved.add(memberId);
    }

    const block = blockOf.get(anchorId) ?? anchorId;
    blockOf.set(anchorId, block);
    blockOf.set(guestId, block);
  }

  return blockOf;
}

/**
 * Os blocos de afinidade: cada cônjuge com a família que veio atrás dele
 * (sogro, cunhado, avó do cônjuge). São as pessoas ligadas entre si por
 * filiação **sem passar pelo sangue** da pessoa central — é esse conjunto que
 * se desloca junto quando o cônjuge é encostado no par.
 */
function inLawGroups(people: Person[], inLawIds: Set<string>): Map<string, string[]> {
  const links = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!inLawIds.has(a) || !inLawIds.has(b)) return;
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
  };
  for (const p of people) {
    if (p.fatherId) link(p.id, p.fatherId);
    if (p.motherId) link(p.id, p.motherId);
  }

  const groups = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const id of inLawIds) {
    if (seen.has(id)) continue;
    const members: string[] = [];
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      members.push(current);
      for (const next of links.get(current) ?? []) stack.push(next);
    }
    for (const memberId of members) groups.set(memberId, members);
  }
  return groups;
}

// ─── Ranks, blocos e espaçamento ────────────────────────────────────────────

/**
 * Um bloco de um rank: uma pessoa, ou o casal (e o grupo de afinidade) que
 * `placeCouples` amarrou em `blockOf` e que anda junto daí em diante. `members`
 * guarda as **referências** das posições em `layoutPos` — mover o bloco é mover
 * as pessoas dele.
 */
interface RankBlock {
  anchorId: string;
  ids: string[];
  members: { x: number; y: number }[];
  minX: number;
  maxX: number;
}

/** As gerações, pela altura que o dagre deu: `y` arredondado à dezena. */
function bucketByRank(layoutPos: Positions): Map<number, string[]> {
  const buckets = new Map<number, string[]>();
  for (const [id, pos] of layoutPos.entries()) {
    const rankKey = Math.round(pos.y / 10) * 10;
    if (!buckets.has(rankKey)) buckets.set(rankKey, []);
    buckets.get(rankKey)!.push(id);
  }
  return buckets;
}

function buildRankBlocks(
  ids: string[],
  blockOf: Map<string, string>,
  layoutPos: Positions,
): RankBlock[] {
  const byBlock = new Map<string, { id: string; pos: { x: number; y: number } }[]>();
  for (const id of ids) {
    const key = blockOf.get(id) ?? id;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key)!.push({ id, pos: layoutPos.get(id)! });
  }

  return [...byBlock.entries()]
    .map(([anchorId, entries]) => ({
      anchorId,
      ids: entries.map((e) => e.id),
      members: entries.map((e) => e.pos),
      minX: Math.min(...entries.map((e) => e.pos.x)),
      maxX: Math.max(...entries.map((e) => e.pos.x)),
    }))
    .sort((a, b) => a.minX - b.minX);
}

function shiftBlock(block: RankBlock, by: number) {
  for (const member of block.members) member.x += by;
  block.minX += by;
  block.maxX += by;
}

const blockCenter = (block: RankBlock) => (block.minX + block.maxX) / 2;

/** A distância mínima exigida entre duas pessoas vizinhas no mesmo rank. */
type NodeGapRule = (idA: string, idB: string) => number;
type GapRule = (a: RankBlock, b: RankBlock) => number;

/**
 * A distância mínima exigida entre dois vizinhos: `MIN_GAP` dentro da mesma
 * família nuclear, `FAMILY_GAP` na fronteira entre famílias diferentes
 * (ADR-020). É **mínima**, nunca máxima — uma família com muitos filhos abre o
 * espaço que precisar, e as vizinhas se afastam (ADR-022).
 *
 * Duas pessoas são da mesma família se são irmãs de sangue (mesma
 * `personalFamilyKey`) ou casadas. O casamento entra como sinal à parte
 * (`marriedWith`, direto das uniões) e não por `blockOf`: sogro e sogra, por
 * exemplo, nunca ganham a mesma chave ali (a união dos dois é resolvida só pela
 * posição que o dagre já deu a eles, ver `placeCouples`), mas ainda são a mesma
 * família para efeito de gap.
 */
function makeGapRule(peopleById: Map<string, Person>, unions: UnionLink[]): NodeGapRule {
  const familyKeyOf = (id: string) => {
    const person = peopleById.get(id);
    return person ? personalFamilyKey(person) : id;
  };

  const marriedWith = new Map<string, Set<string>>();
  for (const u of unions) {
    if (!marriedWith.has(u.aId)) marriedWith.set(u.aId, new Set());
    if (!marriedWith.has(u.bId)) marriedWith.set(u.bId, new Set());
    marriedWith.get(u.aId)!.add(u.bId);
    marriedWith.get(u.bId)!.add(u.aId);
  }

  return (idA, idB) => {
    const keyA = familyKeyOf(idA);
    const sameFamily =
      (keyA !== idA && keyA === familyKeyOf(idB)) || (marriedWith.get(idA)?.has(idB) ?? false);
    return sameFamily ? MIN_GAP : FAMILY_GAP;
  };
}

/**
 * A versão em blocos da regra: dois blocos são a mesma família se ALGUÉM de um
 * lado é da mesma família de ALGUÉM do outro — comparação par a par, não por uma
 * chave única do bloco, porque um bloco pode conter várias pessoas (casal + ex)
 * ligadas a famílias diferentes cada uma.
 */
function blockGapRule(nodeGap: NodeGapRule): GapRule {
  return (a, b) =>
    a.ids.some((idA) => b.ids.some((idB) => nodeGap(idA, idB) === MIN_GAP)) ? MIN_GAP : FAMILY_GAP;
}

/**
 * Garante a distância certa no mesmo rank, abrindo do centro para fora:
 * `MIN_GAP` entre blocos da mesma família nuclear, `FAMILY_GAP` na fronteira
 * entre famílias diferentes — e, dentro de cada família, entre a mesma
 * família e a de fora, blocos mais próximos da pessoa central (por
 * `distanceOf`) ficam mais perto do centro do desenho. Casais e grupos de
 * afinidade andam juntos (`blockOf`): o bloco inteiro se desloca, então
 * ninguém é enfiado entre duas pessoas casadas.
 *
 * Os ranks são varridos de cima para baixo (ancestral antes de descendente):
 * quando um bloco é empurrado, a descendência visível dele (`collectDependents`)
 * já herda o mesmo deslocamento antes do rank dela ser processado — é assim
 * que uma família inteira (avô, filhos, netos) fica coesa verticalmente, não
 * só a geração em que o empurrão aconteceu.
 *
 * Aqui só se resolve o espaçamento e a ordem lateral; quem alinha pai sobre
 * filho é o `alignGenerations`, depois (ADR-021).
 */
function spreadRanks(
  layoutPos: Positions,
  blockOf: Map<string, string>,
  childrenOf: Map<string, Set<string>>,
  visibleIds: Set<string>,
  distanceOf: Map<string, number>,
  requiredGap: GapRule,
  centralX: number,
) {
  const rankBuckets = bucketByRank(layoutPos);

  const blockMembers = new Map<string, string[]>();
  for (const id of layoutPos.keys()) {
    const key = blockOf.get(id) ?? id;
    if (!blockMembers.has(key)) blockMembers.set(key, []);
    blockMembers.get(key)!.push(id);
  }

  // Cada pessoa só recebe a cascata uma vez: sem essa trava, alguém com pai e
  // mãe em blocos diferentes que se movem no mesmo rank levaria os dois
  // deslocamentos somados. Perde-se precisão num caso raro (dois ancestrais
  // distintos empurrando a mesma pessoa); ganha-se nunca estourar o
  // espaçamento por acúmulo.
  const cascaded = new Set<string>();

  const ranksAscending = [...rankBuckets.entries()].sort(([ay], [by]) => ay - by);

  for (const [, ids] of ranksAscending) {
    const blocks = buildRankBlocks(ids, blockOf, layoutPos);
    if (blocks.length < 2) continue;

    const shiftWithDependents = (block: RankBlock, by: number) => {
      shiftBlock(block, by);

      const dependents = collectDependents(block.ids, childrenOf, visibleIds, blockOf, blockMembers);
      for (const id of dependents) {
        if (block.ids.includes(id) || cascaded.has(id)) continue;
        const pos = layoutPos.get(id);
        if (!pos) continue;
        pos.x += by;
        cascaded.add(id);
      }
    };

    // O bloco mais próximo do centro fica parado; o resto abre para os lados.
    let anchorIndex = 0;
    let best = Infinity;
    blocks.forEach((block, i) => {
      const d = Math.min(Math.abs(block.minX - centralX), Math.abs(block.maxX - centralX));
      if (d < best) {
        best = d;
        anchorIndex = i;
      }
    });

    const distanceOfBlock = (block: RankBlock) =>
      Math.min(...block.ids.map((id) => distanceOf.get(id) ?? Infinity));

    // Do lado que o dagre já escolheu (paterno/materno não muda), reordenado
    // por proximidade: parente estruturalmente mais perto do central fica
    // mais perto do centro do desenho, o mais distante vai para fora — a
    // mesma leitura de "primo de primeiro grau perto, de segundo grau longe"
    // pedida para a árvore inteira, não só o nível de tios.
    const right = blocks.slice(anchorIndex + 1).sort((a, b) => distanceOfBlock(a) - distanceOfBlock(b));
    const left = blocks.slice(0, anchorIndex).sort((a, b) => distanceOfBlock(a) - distanceOfBlock(b));

    let prev = blocks[anchorIndex];
    for (const block of right) {
      const gap = requiredGap(prev, block);
      shiftWithDependents(block, gap - (block.minX - prev.maxX));
      prev = block;
    }
    prev = blocks[anchorIndex];
    for (const block of left) {
      const gap = requiredGap(prev, block);
      shiftWithDependents(block, -(gap - (prev.minX - block.maxX)));
      prev = block;
    }
  }
}

// ─── Famílias como blocos rígidos ───────────────────────────────────────────

/**
 * O contorno horizontal de uma família: por rank, até onde ela vai para cada
 * lado, e quem está na ponta (é a pessoa da ponta que decide o gap exigido).
 * Os valores são **relativos ao centro** da unidade, então o contorno continua
 * valendo depois de ela ser deslocada — a família anda inteira, sem se deformar.
 */
interface Contour {
  byRank: Map<number, { min: number; minId: string; max: number; maxId: string }>;
}

/**
 * Recoloca tudo na horizontal tratando cada família como um bloco rígido, de
 * baixo para cima: o casal (ou a pessoa sozinha) vai para o meio dos próprios
 * filhos, e a distância até a família vizinha é medida pelo **contorno de toda a
 * descendência**, não só pela linha em que as duas estão (ADR-022).
 *
 * É essa medida por contorno que faltava. `spreadRanks` (ADR-020) empacotava
 * cada rank sem saber a largura do que vinha embaixo, e o alinhamento do ADR-021
 * puxava pai e filho para o mesmo eixo sem poder abrir espaço para isso: numa
 * base real de 149 pessoas o resultado era 244 pares de caixas de família
 * sobrepostas — o fundo sutil de cada família virava um borrão só — e filhos a
 * até 3771 px (dezesseis cards) do pai. Com o contorno, uma família grande
 * simplesmente empurra as vizinhas: `MIN_GAP`/`FAMILY_GAP` são pisos, e o canvas
 * é infinito.
 *
 * Duas noções de "filho", de propósito:
 *
 * - **para o destino**, todos os filhos visíveis — é o que mantém o sogro sobre
 *   o cônjuge (ADR-009) mesmo com ele fora da floresta abaixo;
 * - **para o deslocamento**, só a floresta (`forestChildren`): cada unidade tem
 *   no máximo uma unidade-pai, então duas famílias nunca compartilham
 *   descendência e ninguém recebe dois empurrões somados.
 */
function packFamilies(
  layoutPos: Positions,
  blockOf: Map<string, string>,
  peopleById: Map<string, Person>,
  childrenOf: Map<string, Set<string>>,
  visibleIds: Set<string>,
  inLawIds: Set<string>,
  nodeGap: NodeGapRule,
) {
  const rankBuckets = bucketByRank(layoutPos);
  const rankOf = (id: string) => Math.round((layoutPos.get(id)?.y ?? 0) / 10) * 10;
  const unitOf = (id: string) => blockOf.get(id) ?? id;

  const unitMembers = new Map<string, string[]>();
  for (const id of layoutPos.keys()) {
    const unit = unitOf(id);
    if (!unitMembers.has(unit)) unitMembers.set(unit, []);
    unitMembers.get(unit)!.push(id);
  }

  /** Os filhos visíveis de uma unidade, como pessoas — o destino sai daqui. */
  const childrenOfUnit = new Map<string, string[]>();
  /** As unidades-pai possíveis de cada unidade, na ordem em que aparecem. */
  const parentUnitsOf = new Map<string, string[]>();
  for (const [unit, members] of unitMembers) {
    const children: string[] = [];
    const parents: string[] = [];
    // A floresta segue o sangue: quem entra por casamento não pode adotar a
    // família do par como descendência. Se a unidade tem alguém de sangue, só
    // os pais dele contam — e se esse alguém não tem pai visível, a unidade é
    // raiz, com a família do cônjuge por fora, ainda puxada para cima dele pelo
    // destino (ADR-009). Uma unidade só de afinidade (o cunhado, os sogros)
    // pendura-se normalmente nos próprios pais.
    const bloodMembers = members.filter((id) => !inLawIds.has(id));
    for (const id of members) {
      for (const childId of childrenOf.get(id) ?? []) {
        if (visibleIds.has(childId) && layoutPos.has(childId)) children.push(childId);
      }
    }
    for (const id of bloodMembers.length > 0 ? bloodMembers : members) {
      const person = peopleById.get(id);
      for (const parentId of [person?.fatherId, person?.motherId]) {
        if (!parentId || !layoutPos.has(parentId)) continue;
        const parentUnit = unitOf(parentId);
        // Só vale como pai na floresta quem está de fato numa geração acima:
        // dado torto (pai no mesmo rank) não pode virar um laço lateral.
        if (parentUnit !== unit && rankOf(parentId) < rankOf(id)) parents.push(parentUnit);
      }
    }
    childrenOfUnit.set(unit, children);
    parentUnitsOf.set(unit, parents);
  }

  // A floresta: uma unidade-pai por unidade — a primeira candidata que não
  // fecha ciclo. A ordem de escolha vem dos membros, e o primeiro membro de um
  // casal é a âncora (`placeCouples`), o lado de sangue: é por ele que a
  // família entra na floresta, e a família do cônjuge fica como raiz solta,
  // ainda puxada para cima dele pelo destino.
  const forestParent = new Map<string, string>();
  const forestChildren = new Map<string, string[]>();
  for (const unit of unitMembers.keys()) {
    for (const candidate of parentUnitsOf.get(unit) ?? []) {
      let ancestor: string | undefined = candidate;
      let cycle = false;
      while (ancestor && !cycle) {
        if (ancestor === unit) cycle = true;
        ancestor = forestParent.get(ancestor);
      }
      if (cycle) continue;
      forestParent.set(unit, candidate);
      if (!forestChildren.has(candidate)) forestChildren.set(candidate, []);
      forestChildren.get(candidate)!.push(unit);
      break;
    }
  }

  const centerOf = (unit: string) => {
    const xs = (unitMembers.get(unit) ?? []).map((id) => layoutPos.get(id)!.x);
    return xs.length === 0 ? 0 : (Math.min(...xs) + Math.max(...xs)) / 2;
  };

  // A ordem lateral vem da floresta, não do x: um percurso em profundidade, com
  // as raízes e os filhos de cada unidade na ordem que o `spreadRanks` já
  // decidiu (lado paterno/materno, parente mais próximo por dentro). É isso que
  // garante que cada família ocupa uma faixa contínua do desenho — ordenando
  // por x, ramos diferentes se intercalavam e a distância por contorno só
  // conseguia resolver a colisão abrindo vãos enormes (10 mil px de vazio numa
  // geração, no teste com a base real).
  const byCenter = (a: string, b: string) => centerOf(a) - centerOf(b);
  const order = new Map<string, number>();
  const roots = [...unitMembers.keys()].filter((unit) => !forestParent.has(unit)).sort(byCenter);
  const walk = (unit: string) => {
    order.set(unit, order.size);
    for (const child of [...(forestChildren.get(unit) ?? [])].sort(byCenter)) walk(child);
  };
  for (const root of roots) walk(root);

  const subtreeCache = new Map<string, string[]>();
  const subtreeIds = (unit: string): string[] => {
    const cached = subtreeCache.get(unit);
    if (cached) return cached;
    const ids: string[] = [];
    const seen = new Set<string>();
    const stack = [unit];
    while (stack.length) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      ids.push(...(unitMembers.get(current) ?? []));
      for (const child of forestChildren.get(current) ?? []) stack.push(child);
    }
    subtreeCache.set(unit, ids);
    return ids;
  };

  const contourOf = (ids: string[], center: number): Contour => {
    const byRank = new Map<number, { min: number; minId: string; max: number; maxId: string }>();
    for (const id of ids) {
      const pos = layoutPos.get(id);
      if (!pos) continue;
      const rank = Math.round(pos.y / 10) * 10;
      const x = pos.x - center;
      const current = byRank.get(rank);
      if (!current) {
        byRank.set(rank, { min: x, minId: id, max: x, maxId: id });
        continue;
      }
      if (x < current.min) {
        current.min = x;
        current.minId = id;
      }
      if (x > current.max) {
        current.max = x;
        current.maxId = id;
      }
    }
    return { byRank };
  };

  /**
   * A distância mínima entre os centros de duas famílias vizinhas: o pior caso
   * entre todos os ranks em que as duas existem. É aqui que a família grande
   * empurra a vizinha — o rank dos netos manda tanto quanto o dos pais.
   */
  const separation = (left: Contour, right: Contour) => {
    let needed = 0;
    for (const [rank, r] of right.byRank) {
      const l = left.byRank.get(rank);
      if (!l) continue;
      needed = Math.max(needed, nodeGap(l.maxId, r.minId) + l.max - r.min);
    }
    return needed;
  };

  // De baixo para cima: quando um rank é processado, tudo o que vem abaixo dele
  // já está no lugar, então o "meio dos filhos" é definitivo e o contorno da
  // descendência é real.
  //
  // E a varredura inteira repete algumas vezes porque a árvore não é uma árvore:
  // uma família sem pais visíveis é raiz no meio do desenho (os sogros, os avós
  // que só entraram porque uma neta casou), e o rank de cima não tem como saber
  // dela — ao abrir espaço lá, pode encostar nela aqui. Cada passada corrige o
  // que a anterior desarrumou, e as distâncias mínimas convergem em poucas.
  const ranksBottomUp = [...rankBuckets.entries()].sort(([ay], [by]) => by - ay);
  for (let pass = 0; pass < PACK_PASSES; pass++)
  for (const [, ids] of ranksBottomUp) {
    const blocks = buildRankBlocks(ids, blockOf, layoutPos).sort(
      (a, b) => (order.get(a.anchorId) ?? 0) - (order.get(b.anchorId) ?? 0),
    );
    if (blocks.length === 0) continue;

    // Primeiro cada casal vai sozinho para o meio dos próprios filhos — só ele,
    // que os filhos já estão no lugar definitivo. Aqui podem nascer
    // sobreposições neste rank; é o passo seguinte que as resolve.
    const anchored = blocks.map((block) => {
      const children = childrenOfUnit.get(block.anchorId) ?? [];
      const xs = children.map((id) => layoutPos.get(id)!.x);
      if (xs.length === 0) return false;
      shiftBlock(block, (Math.min(...xs) + Math.max(...xs)) / 2 - blockCenter(block));
      return true;
    });

    // Quem anda com quem: a família do bloco menos o que pertence a outro bloco
    // deste mesmo rank. Sem esse desconto, um bloco cuja família contém outro do
    // mesmo rank — o cunhado, que desce dos sogros e senta na fileira do casal
    // (ADR-009) — andaria duas vezes, e pior: o contorno do bloco de fora
    // incluiria o de dentro, então a família mediria distância contra si mesma e
    // deixava o cunhado a meio card do cônjuge.
    const claimed = blocks.map((block) => new Set(subtreeIds(block.anchorId)));
    const movers = blocks.map((block, i) => {
      const own = new Set(claimed[i]);
      blocks.forEach((other, j) => {
        // Desconta só quem está *dentro* de mim: o bloco de fora larga o de
        // dentro (que se move por conta), e o de dentro continua levando a
        // própria descendência. Descontar nos dois sentidos deixava o bloco
        // aninhado sem ninguém para mover — e a sobreposição de pé.
        if (j === i || !claimed[i].has(other.ids[0]) || claimed[j].has(block.ids[0])) return;
        for (const id of claimed[j]) own.delete(id);
      });
      return own;
    });

    // Agora as colisões, com a família andando inteira: deslocar o casal junto
    // com a descendência preserva o alinhamento que acabou de ser feito, e a
    // distância exigida sai do contorno de toda ela — é o que faz uma família
    // grande empurrar a vizinha em vez de invadi-la.
    const contours = blocks.map((block, i) => contourOf([...movers[i]], blockCenter(block)));
    const separations = blocks.slice(1).map((_, i) => separation(contours[i], contours[i + 1]));
    const centers = solvePositions(
      blocks.map((block, i) => ({
        // Quem não tem filhos para centralizar cede o lugar a quem tem.
        desired: blockCenter(block),
        weight: anchored[i] ? 1 : LOOSE_WEIGHT,
      })),
      separations,
    );

    blocks.forEach((block, i) => {
      const by = centers[i] - blockCenter(block);
      if (by === 0) return;
      for (const id of movers[i]) {
        const pos = layoutPos.get(id);
        if (pos) pos.x += by;
      }
      block.minX += by;
      block.maxX += by;
    });
  }

  // Por último, as árvores inteiras. Uma família sem pais visíveis é raiz — e
  // uma raiz não aparece em nenhum rank acima dela, então o espaçamento por rank
  // nunca a vê: ao abrir espaço lá em cima, um ramo inteiro descia por cima
  // dela. Aqui cada árvore é um corpo rígido só, e a separação entre elas sai do
  // mesmo contorno. Vem depois de tudo, e não desarruma nada: mover uma árvore
  // inteira preserva cada distância dentro dela.
  const trees = [...unitMembers.keys()]
    .filter((unit) => !forestParent.has(unit))
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .map((root) => {
      const ids = subtreeIds(root);
      const xs = ids.map((id) => layoutPos.get(id)!.x);
      return { ids, center: (Math.min(...xs) + Math.max(...xs)) / 2 };
    });
  if (trees.length > 1) {
    const contours = trees.map((tree) => contourOf(tree.ids, tree.center));
    const separations = trees.slice(1).map((_, i) => separation(contours[i], contours[i + 1]));
    const centers = solvePositions(
      trees.map((tree) => ({ desired: tree.center, weight: 1 })),
      separations,
    );
    trees.forEach((tree, i) => {
      const by = centers[i] - tree.center;
      if (by === 0) return;
      for (const id of tree.ids) layoutPos.get(id)!.x += by;
    });
  }
}

/**
 * Onde cada bloco de um rank vai ficar: o mais perto possível do destino que
 * pediu (`targets`), sem violar as separações exigidas entre vizinhos
 * (`separations[i]` é a distância mínima entre os centros de `i` e `i+1`) e sem
 * trocar a ordem. É a solução exata desse problema — minimizar a soma
 * ponderada dos quadrados dos desvios sujeito a
 * `centro[i+1] - centro[i] >= separação[i]` —, obtida descontando as
 * separações acumuladas e caindo numa regressão isotônica (PAVA, "pool
 * adjacent violators"): enquanto o bloco novo quer ficar à esquerda do
 * anterior, os dois viram um pool só, na média ponderada dos dois. Um passe
 * guloso da esquerda para a direita empurraria a família inteira para um lado;
 * aqui o grupo que não cabe se divide em volta do ponto que queria.
 *
 * O peso é o que resolve empate: quem está sendo centralizado na própria
 * família pesa 1, quem só quer ficar onde está pesa `LOOSE_WEIGHT` e desliza.
 */
function solvePositions(
  targets: { desired: number; weight: number }[],
  separations: number[],
): number[] {
  const offsets = [0];
  for (let i = 1; i < targets.length; i++) {
    offsets.push(offsets[i - 1] + separations[i - 1]);
  }

  const values: number[] = [];
  const weights: number[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < targets.length; i++) {
    let value = targets[i].desired - offsets[i];
    let weight = targets[i].weight;
    let size = 1;
    while (values.length > 0 && values[values.length - 1] > value) {
      const pooledValue = values.pop()!;
      const pooledWeight = weights.pop()!;
      value = (value * weight + pooledValue * pooledWeight) / (weight + pooledWeight);
      weight += pooledWeight;
      size += sizes.pop()!;
    }
    values.push(value);
    weights.push(weight);
    sizes.push(size);
  }

  const centers: number[] = [];
  for (let pool = 0; pool < values.length; pool++) {
    for (let member = 0; member < sizes[pool]; member++) {
      // Arredondado ao micropixel: a média ponderada do pool traz ruído de
      // ponto flutuante (um gap de 232 saindo 231,99999999999997), e ele se
      // acumularia rank a rank até virar uma distância "quase certa" em vez de
      // certa. Um milionésimo de pixel não muda desenho nenhum.
      centers.push(Math.round((values[pool] + offsets[centers.length]) * 1e6) / 1e6);
    }
  }
  return centers;
}
