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

export const EDGE_COLORS = {
  father: { normal: '#93c5fd', highlighted: '#2563eb' },
  mother: { normal: '#f9a8d4', highlighted: '#db2777' },
  union: { normal: '#c4b5fd', highlighted: '#7c3aed' },
  unionEnded: { normal: '#d1d5db', highlighted: '#9ca3af' },
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

export function computeLayout({
  people: allPeople,
  expandedParents,
  expandedSideDown,
  includeSiblings,
  includeSpouses,
  onToggleParents,
  onToggleSideDown,
}: LayoutOptions): { nodes: Node[]; edges: Edge[] } {
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

  // Casais primeiro, espaçamento depois: o passe seguinte trata o casal como um
  // bloco só, senão ele enfiaria alguém entre os dois.
  const coupleBlocks = placeCouples(
    unions,
    inLawIds,
    inLawGroups(people, inLawIds),
    layoutPos,
    centralX,
  );
  spreadRanks(layoutPos, coupleBlocks, centralX);

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

  return { nodes, edges };
}

type Positions = Map<string, { x: number; y: number }>;

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
    // Dois de afinidade (sogro e sogra, por exemplo): já vieram juntos do dagre
    // e andam no mesmo grupo — encostar um no outro só desalinharia o grupo.
    if (aInLaw && bInLaw) continue;
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
    // Já encostado noutra união: mover de novo desfaria o primeiro casal.
    if (moved.has(guestId) || moved.has(anchorId)) continue;

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

/**
 * Garante a distância mínima no mesmo rank, abrindo do centro para fora. Casais
 * andam juntos: o bloco inteiro se desloca, então ninguém é enfiado entre duas
 * pessoas casadas.
 */
function spreadRanks(layoutPos: Positions, blockOf: Map<string, string>, centralX: number) {
  const rankBuckets = new Map<number, string[]>();
  for (const [id, pos] of layoutPos.entries()) {
    const rankKey = Math.round(pos.y / 10) * 10;
    if (!rankBuckets.has(rankKey)) rankBuckets.set(rankKey, []);
    rankBuckets.get(rankKey)!.push(id);
  }

  for (const ids of rankBuckets.values()) {
    const byBlock = new Map<string, { x: number; y: number }[]>();
    for (const id of ids) {
      const key = blockOf.get(id) ?? id;
      if (!byBlock.has(key)) byBlock.set(key, []);
      byBlock.get(key)!.push(layoutPos.get(id)!);
    }

    const blocks = [...byBlock.values()]
      .map((members) => ({
        members,
        minX: Math.min(...members.map((m) => m.x)),
        maxX: Math.max(...members.map((m) => m.x)),
      }))
      .sort((a, b) => a.minX - b.minX);
    if (blocks.length < 2) continue;

    const shift = (block: (typeof blocks)[number], by: number) => {
      for (const member of block.members) member.x += by;
      block.minX += by;
      block.maxX += by;
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

    for (let i = anchorIndex + 1; i < blocks.length; i++) {
      const folga = blocks[i].minX - blocks[i - 1].maxX;
      if (folga < MIN_GAP) shift(blocks[i], MIN_GAP - folga);
    }
    for (let i = anchorIndex - 1; i >= 0; i--) {
      const folga = blocks[i + 1].minX - blocks[i].maxX;
      if (folga < MIN_GAP) shift(blocks[i], -(MIN_GAP - folga));
    }
  }
}
