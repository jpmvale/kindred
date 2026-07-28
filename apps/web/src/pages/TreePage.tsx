import { useEffect, useState, useCallback, useMemo } from 'react';
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
  type NodeProps,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useLoaderData } from 'react-router-dom';
import type { Person } from '@kindred/types';
import {
  computeLayout,
  isUnionEdge,
  parentEdgeStyle,
  unionEdgeStyle,
  EDGE_COLORS,
  NODE_W,
  NODE_H,
  type NodeData,
} from './tree-layout';

// ─── Person node ──────────────────────────────────────────────────────────────

const HANDLE: React.CSSProperties = {
  width: 8,
  height: 8,
  border: '2px solid #d1d5db',
  background: '#fff',
  pointerEvents: 'none',
};

/** As pontas da união ficam invisíveis: a linha do casal já diz o que precisa. */
const SPOUSE_HANDLE: React.CSSProperties = {
  width: 1,
  height: 1,
  border: 'none',
  background: 'transparent',
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
      <Handle type="target" position={Position.Left} id="spouse-left" style={SPOUSE_HANDLE} />
      <div
        style={{
          width: NODE_W,
          height: NODE_H,
          position: 'relative',
          background:
            d.isHovered || d.isParentOfHovered || d.isChildOfHovered || d.isPartnerOfHovered
              ? '#f8fafc'
              : '#fff',
          border: `2px solid ${
            d.isHovered
              ? '#0f172a'
              : d.isParentOfHovered
                ? '#2563eb'
                : d.isChildOfHovered
                  ? '#db2777'
                  : d.isPartnerOfHovered
                    ? '#7c3aed'
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
                : d.isPartnerOfHovered
                  ? '0 0 0 4px rgba(124,58,237,.12), 0 2px 10px rgba(124,58,237,.16)'
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
          {d.photoUrl ? (
            <img src={d.photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
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
      <Handle type="source" position={Position.Right} id="spouse-right" style={SPOUSE_HANDLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE} />
    </>
  );
}

const NODE_TYPES = { person: PersonNode };

// ─── Inner component ──────────────────────────────────────────────────────────

function TreeContent() {
  const people = useLoaderData() as Person[];
  const { fitView } = useReactFlow();
  const nodeTypes = useMemo(() => NODE_TYPES, []);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [includeSiblings, setIncludeSiblings] = useState(true);
  const [includeSpouses, setIncludeSpouses] = useState(true);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [expandedSideDown, setExpandedSideDown] = useState<Set<string>>(new Set());
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);

  const applyHoverStyling = useCallback((hoveredId: string | null) => {
    const peopleById = new Map(people.map((p) => [p.id, p]));
    const hovered = hoveredId ? peopleById.get(hoveredId) : null;
    const parentIds = new Set<string>();
    const childIds = new Set<string>();
    const partnerIds = new Set<string>();

    if (hovered) {
      if (hovered.fatherId) parentIds.add(hovered.fatherId);
      if (hovered.motherId) parentIds.add(hovered.motherId);
      for (const p of people) {
        if (p.fatherId === hovered.id || p.motherId === hovered.id) childIds.add(p.id);
      }
      for (const union of hovered.unions ?? []) partnerIds.add(union.partnerId);
    }

    setNodes((prev) => prev.map((node) => ({
      ...node,
      data: {
        ...(node.data as Record<string, unknown>),
        isHovered: hoveredId === node.id,
        isParentOfHovered: parentIds.has(node.id),
        isChildOfHovered: childIds.has(node.id),
        isPartnerOfHovered: partnerIds.has(node.id),
      },
    })));

    setEdges((prev) => prev.map((edge) => {
      const highlighted = hoveredId !== null && (edge.source === hoveredId || edge.target === hoveredId);
      if (!isUnionEdge(edge.id)) {
        return { ...edge, style: parentEdgeStyle(edge.id, highlighted) };
      }
      const ended = Boolean(edge.style?.strokeDasharray);
      return { ...edge, style: unionEdgeStyle(ended, highlighted) };
    }));
  }, [people, setEdges, setNodes]);

  const toggleIn = useCallback(
    (setter: typeof setExpandedParents) => (personId: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(personId)) next.delete(personId);
        else next.add(personId);
        return next;
      });
    },
    [],
  );

  // O desenho é função pura das pessoas mais os filtros (`computeLayout` não toca
  // em React): dá para calcular durante o render, e aí "a árvore saiu vazia" é
  // coisa derivada, não estado que precisa de efeito para existir.
  const layout = useMemo(
    () =>
      computeLayout({
        people,
        expandedParents,
        expandedSideDown,
        includeSiblings,
        includeSpouses,
        onToggleParents: toggleIn(setExpandedParents),
        onToggleSideDown: toggleIn(setExpandedSideDown),
      }),
    [people, expandedParents, expandedSideDown, includeSiblings, includeSpouses, toggleIn],
  );

  const empty = layout.nodes.length === 0;

  // O reactflow guarda os nós por conta: este efeito só empurra para ele o
  // desenho que o render já calculou. É sincronizar sistema de fora, que é para
  // o que serve um efeito.
  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
    if (layout.nodes.length) setTimeout(() => applyHoverStyling(null), 0);
  }, [layout, applyHoverStyling, setEdges, setNodes]);

  useEffect(() => {
    if (empty) return;
    setTimeout(() => fitView({ padding: 0.06, duration: 350 }), 20);
  }, [empty, expandedParents, expandedSideDown, includeSiblings, includeSpouses, fitView]);

  useEffect(() => {
    if (empty) return;
    applyHoverStyling(hoveredPersonId);
  }, [empty, applyHoverStyling, hoveredPersonId]);

  const handleExpandAllRelationships = useCallback(() => {
    const idsToExpand = new Set<string>();
    const idsToExpandSideDown = new Set<string>();
    const knownIds = new Set(people.map((p) => p.id));

    for (const p of people) {
      if ((p.fatherId && knownIds.has(p.fatherId)) || (p.motherId && knownIds.has(p.motherId))) {
        idsToExpand.add(p.id);
        if (includeSiblings) idsToExpandSideDown.add(p.id);
      }
    }

    setExpandedParents(idsToExpand);
    setExpandedSideDown(includeSiblings ? idsToExpandSideDown : new Set());
    setTimeout(() => fitView({ padding: 0.06, duration: 600 }), 50);
  }, [people, fitView, includeSiblings]);

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
                checked={includeSpouses}
                onChange={(e) => setIncludeSpouses(e.target.checked)}
              />
              Com cônjuges
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
              <div style={{ width: 22, height: 2, background: EDGE_COLORS.father.normal, borderRadius: 1 }} />
              <span>Linha paterna (direita)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 22, height: 2, background: EDGE_COLORS.mother.normal, borderRadius: 1 }} />
              <span>Linha materna (esquerda)</span>
            </div>
            {includeSpouses && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 22, height: 2, background: EDGE_COLORS.union.normal, borderRadius: 1 }} />
                  <span>União vigente</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{
                    width: 22,
                    height: 0,
                    borderTop: `2px dashed ${EDGE_COLORS.unionEnded.normal}`,
                  }} />
                  <span>União desfeita</span>
                </div>
              </>
            )}
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
