import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import dagre from '@dagrejs/dagre';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { peopleApi } from '../api/people';
import type { Person } from '@kindred/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 210;
const NODE_H = 76;
const NODE_SEP = 26;
const RANK_SEP = 72;
const HORIZONTAL_NODE_GAP = 22;

// ─── Layout algorithm ─────────────────────────────────────────────────────────

function buildVisiblePeople(
  people: Person[],
  expandedParents: Set<string>,
  expandedSideDown: Set<string>,
  includeSiblings: boolean,
): Person[] {
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

  return people.filter((p) => visible.has(p.id));
}

function computeLayout(
  allPeople: Person[],
  expandedParents: Set<string>,
  expandedSideDown: Set<string>,
  includeSiblings: boolean,
  onToggleParents: (personId: string) => void,
  onToggleSideDown: (personId: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const people = buildVisiblePeople(allPeople, expandedParents, expandedSideDown, includeSiblings);
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
  const parentIdsByPerson = new Map<string, Set<string>>();
  const childIdsByPerson = new Map<string, Set<string>>();
  for (const p of people) {
    if (p.fatherId && visibleIds.has(p.fatherId)) {
      dagreGraph.setEdge(p.fatherId, p.id);
      if (!parentIdsByPerson.has(p.id)) parentIdsByPerson.set(p.id, new Set());
      parentIdsByPerson.get(p.id)!.add(p.fatherId);
      if (!childIdsByPerson.has(p.fatherId)) childIdsByPerson.set(p.fatherId, new Set());
      childIdsByPerson.get(p.fatherId)!.add(p.id);
      edges.push({
        id: `ef-${p.fatherId}-${p.id}`,
        source: p.fatherId,
        target: p.id,
        type: 'smoothstep',
        style: { stroke: '#93c5fd', strokeWidth: 2 },
      });
    }
    if (p.motherId && visibleIds.has(p.motherId)) {
      dagreGraph.setEdge(p.motherId, p.id);
      if (!parentIdsByPerson.has(p.id)) parentIdsByPerson.set(p.id, new Set());
      parentIdsByPerson.get(p.id)!.add(p.motherId);
      if (!childIdsByPerson.has(p.motherId)) childIdsByPerson.set(p.motherId, new Set());
      childIdsByPerson.get(p.motherId)!.add(p.id);
      edges.push({
        id: `em-${p.motherId}-${p.id}`,
        source: p.motherId,
        target: p.id,
        type: 'smoothstep',
        style: { stroke: '#f9a8d4', strokeWidth: 2 },
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
    const gap = NODE_W + HORIZONTAL_NODE_GAP;
    const start = centerX - ((sorted.length - 1) * gap) / 2;
    sorted.forEach((item, i) => {
      item.pos.x = start + i * gap;
      layoutPos.set(item.id, item.pos);
    });
  }

  const centralX = central ? (layoutPos.get(central.id)?.x ?? 0) : 0;

  // Regras direcionais: lado paterno cresce para direita, lado materno para esquerda.
  if (central) {
    const fatherId = central.fatherId && visibleIds.has(central.fatherId) ? central.fatherId : null;
    const motherId = central.motherId && visibleIds.has(central.motherId) ? central.motherId : null;
    const directGap = NODE_W + HORIZONTAL_NODE_GAP;

    if (fatherId) {
      const pos = layoutPos.get(fatherId);
      if (pos) pos.x = Math.max(pos.x, centralX + directGap);
    }
    if (motherId) {
      const pos = layoutPos.get(motherId);
      if (pos) pos.x = Math.min(pos.x, centralX - directGap);
    }

    const adjacency = new Map<string, Set<string>>();
    function link(a: string, b: string) {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    }
    for (const p of people) {
      if (p.fatherId && visibleIds.has(p.fatherId)) link(p.id, p.fatherId);
      if (p.motherId && visibleIds.has(p.motherId)) link(p.id, p.motherId);
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

    const fatherAnchor = fatherId ? (layoutPos.get(fatherId)?.x ?? (centralX + directGap)) : (centralX + directGap);
    const motherAnchor = motherId ? (layoutPos.get(motherId)?.x ?? (centralX - directGap)) : (centralX - directGap);

    for (const id of paternalBranch) {
      const pos = layoutPos.get(id);
      if (pos) pos.x = Math.max(pos.x, fatherAnchor);
    }
    for (const id of maternalBranch) {
      const pos = layoutPos.get(id);
      if (pos) pos.x = Math.min(pos.x, motherAnchor);
    }
  }

  // Garante distancia minima no mesmo rank sem cruzar lados.
  const rankBuckets = new Map<number, string[]>();
  for (const [id, pos] of layoutPos.entries()) {
    const rankKey = Math.round(pos.y / 10) * 10;
    if (!rankBuckets.has(rankKey)) rankBuckets.set(rankKey, []);
    rankBuckets.get(rankKey)!.push(id);
  }
  const minGap = NODE_W + HORIZONTAL_NODE_GAP;
  for (const ids of rankBuckets.values()) {
    const row = ids.map((id) => ({ id, pos: layoutPos.get(id)! }));
    const left = row.filter((n) => n.pos.x < centralX).sort((a, b) => b.pos.x - a.pos.x);
    const right = row.filter((n) => n.pos.x > centralX).sort((a, b) => a.pos.x - b.pos.x);
    const center = row.filter((n) => n.pos.x === centralX).sort((a, b) => a.id.localeCompare(b.id));

    for (let i = 1; i < right.length; i++) {
      const prev = right[i - 1].pos;
      const curr = right[i].pos;
      if (curr.x - prev.x < minGap) curr.x = prev.x + minGap;
    }

    for (let i = 1; i < left.length; i++) {
      const prev = left[i - 1].pos;
      const curr = left[i].pos;
      if (prev.x - curr.x < minGap) curr.x = prev.x - minGap;
    }

    // Nos centrais ocupam espaco proprio.
    if (center.length) {
      center[0].pos.x = centralX;
      for (let i = 1; i < center.length; i++) {
        center[i].pos.x = center[i - 1].pos.x + minGap;
      }
    }
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
    const hasParents = Boolean(
      (p.fatherId && visibleIds.has(p.fatherId)) || (p.motherId && visibleIds.has(p.motherId)) || p.fatherId || p.motherId,
    );

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

    return {
      id: p.id,
      type: 'person',
      position: n ? { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 } : { x: 0, y: 0 },
      data: {
        id: p.id,
        name: p.name,
        sex: p.sex,
        profilePhoto: p.profilePhoto,
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
      },
    };
  });

  return { nodes, edges };
}

// ─── Person node ──────────────────────────────────────────────────────────────

interface NodeData {
  id: string;
  name: string;
  sex?: string | null;
  profilePhoto?: string | null;
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
}

const HANDLE: React.CSSProperties = {
  width: 8,
  height: 8,
  border: '2px solid #d1d5db',
  background: '#fff',
  pointerEvents: 'none',
};

function avatarBg(sex?: string | null, isCentral?: boolean) {
  if (isCentral) return '#6366f1';
  if (sex === 'MALE') return '#3b82f6';
  if (sex === 'FEMALE') return '#ec4899';
  return '#9ca3af';
}

function year(d?: string | null) {
  return d ? new Date(d).getFullYear() : null;
}

function PersonNode({ data }: NodeProps) {
  const d = data as NodeData;
  const dead = Boolean(d.deceased || d.deathDate);
  const by = year(d.birthDate);
  const dy = year(d.deathDate);
  const lifespan = by ? (dy ? `${by} – ${dy}` : String(by)) : null;

  return (
    <>
      <Handle type="target" position={Position.Top} style={HANDLE} />
      <div
        style={{
          width: NODE_W,
          height: NODE_H,
          position: 'relative',
          background: d.isHovered || d.isParentOfHovered || d.isChildOfHovered ? '#f8fafc' : '#fff',
          border: `2px solid ${
            d.isHovered
              ? '#0f172a'
              : d.isParentOfHovered
                ? '#2563eb'
                : d.isChildOfHovered
                  ? '#db2777'
                  : d.isCentralUser
                    ? '#6366f1'
                    : '#e5e7eb'
          }`,
          borderRadius: 12,
          boxShadow: d.isHovered
            ? '0 0 0 4px rgba(15,23,42,.10), 0 2px 12px rgba(15,23,42,.16)'
            : d.isParentOfHovered
              ? '0 0 0 4px rgba(37,99,235,.12), 0 2px 10px rgba(37,99,235,.16)'
              : d.isChildOfHovered
                ? '0 0 0 4px rgba(219,39,119,.12), 0 2px 10px rgba(219,39,119,.16)'
                : d.isCentralUser
                  ? '0 0 0 4px #e0e7ff, 0 2px 10px rgba(99,102,241,.15)'
                  : '0 1px 6px rgba(0,0,0,.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 14px',
          opacity: 1,
          cursor: 'default',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: avatarBg(d.sex, d.isCentralUser),
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 16,
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {d.profilePhoto ? (
            <img src={d.profilePhoto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
          ) : (
            d.name.charAt(0).toUpperCase()
          )}
        </div>
        {d.hasParents && (
          <button
            type="button"
            className="nodrag nopan"
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              d.onToggleParents(d.id);
            }}
            title={d.parentsExpanded ? 'Recolher pais' : 'Expandir pais'}
            style={{
              position: 'absolute',
              top: -8,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 3,
              width: 18,
              height: 18,
              borderRadius: 999,
              border: '1px solid #bfdbfe',
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 0,
              pointerEvents: 'all',
            }}
          >
            {d.parentsExpanded ? '−' : '+'}
          </button>
        )}
        {d.hasSideDown && (
          <button
            type="button"
            className="nodrag nopan"
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              d.onToggleSideDown(d.id);
            }}
            title={d.sideDownExpanded ? 'Recolher laterais e descendentes' : 'Expandir laterais e descendentes'}
            style={{
              position: 'absolute',
              right: -8,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 3,
              width: 18,
              height: 18,
              borderRadius: 999,
              border: '1px solid #c7d2fe',
              background: '#eef2ff',
              color: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 0,
              pointerEvents: 'all',
            }}
          >
            {d.sideDownExpanded ? '−' : '↔'}
          </button>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: '#111827',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.35,
            }}
          >
            {dead ? `† ${d.name}` : d.name}
          </div>
          {d.isCentralUser ? (
            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 500, marginTop: 2 }}>Você</div>
          ) : d.kinshipDegree ? (
            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 500, marginTop: 2 }}>
              {d.kinshipDegree}
            </div>
          ) : null}
          {lifespan && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
              {lifespan}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={HANDLE} />
    </>
  );
}

const NODE_TYPES = { person: PersonNode };

// ─── Inner component ──────────────────────────────────────────────────────────

function TreeContent() {
  const { fitView } = useReactFlow();
  const nodeTypes = useMemo(() => NODE_TYPES, []);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [includeSiblings, setIncludeSiblings] = useState(true);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [expandedSideDown, setExpandedSideDown] = useState<Set<string>>(new Set());
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const allPeopleRef = useRef<Person[]>([]);

  const applyHoverStyling = useCallback((hoveredId: string | null) => {
    const peopleById = new Map(allPeopleRef.current.map((p) => [p.id, p]));
    const hovered = hoveredId ? peopleById.get(hoveredId) : null;
    const parentIds = new Set<string>();
    const childIds = new Set<string>();

    if (hovered) {
      if (hovered.fatherId) parentIds.add(hovered.fatherId);
      if (hovered.motherId) parentIds.add(hovered.motherId);
      for (const p of allPeopleRef.current) {
        if (p.fatherId === hovered.id || p.motherId === hovered.id) childIds.add(p.id);
      }
    }

    setNodes((prev) => prev.map((node) => ({
      ...node,
      data: {
        ...(node.data as Record<string, unknown>),
        isHovered: hoveredId === node.id,
        isParentOfHovered: parentIds.has(node.id),
        isChildOfHovered: childIds.has(node.id),
      },
    })));

    setEdges((prev) => prev.map((edge) => {
      const highlighted = hoveredId !== null && (edge.source === hoveredId || edge.target === hoveredId);
      const isFatherEdge = edge.id.startsWith('ef-');
      return {
        ...edge,
        style: highlighted
          ? {
              stroke: isFatherEdge ? '#2563eb' : '#db2777',
              strokeWidth: 3.2,
            }
          : {
              stroke: isFatherEdge ? '#93c5fd' : '#f9a8d4',
              strokeWidth: 2,
            },
      };
    }));
  }, [setEdges, setNodes]);

  const renderTree = useCallback((people: Person[], expanded: Set<string>, hoveredId: string | null) => {
    const { nodes: n, edges: e } = computeLayout(
      people,
      expanded,
      expandedSideDown,
      includeSiblings,
      (personId) => {
        setExpandedParents((prev) => {
          const next = new Set(prev);
          if (next.has(personId)) next.delete(personId);
          else next.add(personId);
          return next;
        });
      },
      (personId) => {
        setExpandedSideDown((prev) => {
          const next = new Set(prev);
          if (next.has(personId)) next.delete(personId);
          else next.add(personId);
          return next;
        });
      },
    );
    setNodes(n);
    setEdges(e);
    setEmpty(!n.length);
    if (n.length) setTimeout(() => applyHoverStyling(hoveredId), 0);
    return n;
  }, [applyHoverStyling, expandedSideDown, includeSiblings, setEdges, setNodes]);

  const load = useCallback(() => {
    peopleApi.getAll().then((people) => {
      allPeopleRef.current = people;
      if (!people.length) {
        setEmpty(true);
        setLoading(false);
        return;
      }
      renderTree(people, new Set(), null);
      setLoading(false);
    });
  }, [renderTree]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!allPeopleRef.current.length) return;
    renderTree(allPeopleRef.current, expandedParents, null);
  }, [expandedParents, expandedSideDown, includeSiblings, renderTree]);

  useEffect(() => {
    if (!allPeopleRef.current.length) return;
    setTimeout(() => fitView({ padding: 0.06, duration: 350 }), 20);
  }, [expandedParents, expandedSideDown, includeSiblings, fitView]);

  useEffect(() => {
    if (!allPeopleRef.current.length) return;
    applyHoverStyling(hoveredPersonId);
  }, [applyHoverStyling, hoveredPersonId]);

  const handleExpandAllRelationships = useCallback(() => {
    const all = allPeopleRef.current;
    const idsToExpand = new Set<string>();
    const idsToExpandSideDown = new Set<string>();
    const knownIds = new Set(all.map((p) => p.id));

    for (const p of all) {
      if ((p.fatherId && knownIds.has(p.fatherId)) || (p.motherId && knownIds.has(p.motherId))) {
        idsToExpand.add(p.id);
        if (includeSiblings) idsToExpandSideDown.add(p.id);
      }
    }

    setExpandedParents(idsToExpand);
    setExpandedSideDown(includeSiblings ? idsToExpandSideDown : new Set());
    setTimeout(() => fitView({ padding: 0.06, duration: 600 }), 50);
  }, [fitView, includeSiblings]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#9ca3af' }}>
        Carregando árvore...
      </div>
    );
  }

  if (empty) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#9ca3af', gap: 8 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="2" width="8" height="5" rx="1"/>
          <rect x="1" y="15" width="8" height="5" rx="1"/>
          <rect x="15" y="15" width="8" height="5" rx="1"/>
          <line x1="12" y1="7" x2="12" y2="12"/>
          <line x1="12" y1="12" x2="5" y2="12"/>
          <line x1="12" y1="12" x2="19" y2="12"/>
          <line x1="5" y1="12" x2="5" y2="15"/>
          <line x1="19" y1="12" x2="19" y2="15"/>
        </svg>
        <p style={{ margin: 0 }}>Nenhuma pessoa cadastrada</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.06 }}
        minZoom={0.04}
        maxZoom={2.5}
        nodesDraggable={false}
        panOnDrag
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeMouseEnter={(_, node) => setHoveredPersonId(node.id)}
        onNodeMouseLeave={() => setHoveredPersonId(null)}
      >
        <Controls showInteractive={false} style={{ boxShadow: '0 1px 4px rgba(0,0,0,.1)', borderRadius: 8 }} />

        <Panel position="top-right">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={handleExpandAllRelationships}
              title="Abrir todos os relacionamentos"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 500,
                color: '#374151',
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(0,0,0,.08)',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              Abrir todos relacionamentos
            </button>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 12,
                color: '#4b5563',
                boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={includeSiblings}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIncludeSiblings(checked);
                  if (!checked) setExpandedSideDown(new Set());
                }}
              />
              Com irmãos
            </label>
          </div>
        </Panel>

        <Background variant={BackgroundVariant.Dots} color="#e5e7eb" gap={28} size={1} />

        {/* Legend */}
        <Panel position="bottom-right">
          <div style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 11,
            color: '#6b7280',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            boxShadow: '0 1px 4px rgba(0,0,0,.07)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 22, height: 2, background: '#93c5fd', borderRadius: 1 }} />
              <span>Linha paterna (direita)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 22, height: 2, background: '#f9a8d4', borderRadius: 1 }} />
              <span>Linha materna (esquerda)</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TreePage() {
  return (
    <ReactFlowProvider>
      <TreeContent />
    </ReactFlowProvider>
  );
}
