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
  useNodesInitialized,
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
  border: '2px solid var(--tree-handle-border)',
  background: 'var(--tree-node-bg)',
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
  if (isCentral) return 'var(--primary)';
  if (sex === 'MALE') return 'var(--tree-avatar-male)';
  if (sex === 'FEMALE') return 'var(--tree-avatar-female)';
  return 'var(--tree-avatar-unknown)';
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
              ? 'var(--tree-node-bg-hover)'
              : 'var(--tree-node-bg)',
          border: `2px solid ${
            d.isHovered
              ? 'var(--tree-hover)'
              : d.isParentOfHovered
                ? 'var(--tree-parent)'
                : d.isChildOfHovered
                  ? 'var(--tree-child)'
                  : d.isPartnerOfHovered
                    ? 'var(--tree-partner)'
                    : d.isCentralUser
                      ? 'var(--primary)'
                      : 'var(--tree-node-border)'
          }`,
          borderRadius: 12,
          boxShadow: d.isHovered
            ? 'var(--tree-shadow-hover)'
            : d.isParentOfHovered
              ? 'var(--tree-shadow-parent)'
              : d.isChildOfHovered
                ? 'var(--tree-shadow-child)'
                : d.isPartnerOfHovered
                  ? 'var(--tree-shadow-partner)'
                  : d.isCentralUser
                    ? 'var(--tree-shadow-central)'
                    : 'var(--tree-shadow-node)',
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
            color: 'var(--tree-avatar-foreground)',
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
              border: '1px solid var(--tree-btn-parents-border)',
              background: 'var(--tree-btn-parents-bg)',
              color: 'var(--tree-btn-parents-fg)',
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
              border: '1px solid var(--tree-btn-side-border)',
              background: 'var(--tree-btn-side-bg)',
              color: 'var(--tree-btn-side-fg)',
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
              color: 'var(--heading)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.35,
            }}
          >
            {dead ? `† ${d.name}` : d.name}
          </div>
          {d.isCentralUser ? (
            <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 500, marginTop: 2 }}>Você</div>
          ) : d.kinshipDegree ? (
            <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 500, marginTop: 2 }}>
              {d.kinshipDegree}
            </div>
          ) : null}
          {lifespan && (
            <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>
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
  // Vira `false` quando entram nós que o reactflow ainda não mediu, e `true` quando
  // todos têm tamanho. É o sinal que o enquadramento espera (ver o efeito abaixo).
  const nodesInitialized = useNodesInitialized();
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

  /*
   * Enquadrar depende de o reactflow **já ter medido** os nós: sem largura e altura ele não sabe
   * calcular os limites do desenho, e o `fitView` desiste em silêncio, deixando a viewport no zoom e
   * na posição de antes. Era o que acontecia ao abrir todos os relacionamentos na base real (BL-15):
   * os 117 nós entravam nas posições certas, a viewport continuava no zoom 2,5 de quando havia um nó
   * só, e tudo caía fora da tela — parecia árvore vazia.
   *
   * Esperar por cronômetro (era `setTimeout(..., 20)`) é uma aposta no tamanho da base: dava certo
   * com as 23 pessoas do seed e não dava com 143. O `useNodesInitialized` é o próprio sinal de que a
   * medição terminou, então não há prazo a chutar.
   */
  useEffect(() => {
    if (empty || !nodesInitialized) return;
    fitView({ padding: 0.06, duration: 350 });
  }, [empty, nodesInitialized, layout, fitView]);

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
    // Quem enquadra é o efeito acima, quando os nós novos tiverem sido medidos.
  }, [people, includeSiblings]);

  if (empty) {
    return (
      <div className="tree-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
        <Controls showInteractive={false} style={{ boxShadow: 'var(--shadow-panel)', borderRadius: 8 }} />

        <Panel position="top-right">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className="tree-panel-button"
              onClick={handleExpandAllRelationships}
              title="Abrir todos os relacionamentos"
            >
              Abrir todos relacionamentos
            </button>
            <label className="tree-panel-label">
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
            <label className="tree-panel-label">
              <input
                type="checkbox"
                checked={includeSpouses}
                onChange={(e) => setIncludeSpouses(e.target.checked)}
              />
              Com cônjuges
            </label>
          </div>
        </Panel>

        {/* A cor do pontilhado vem do CSS (`.react-flow__background-pattern`): o `color` daqui viraria
            atributo de apresentação no SVG, e atributo não entende `var(...)`. */}
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} />

        {/* Legend */}
        <Panel position="bottom-right">
          <div className="tree-legend">
            <div className="tree-legend-row">
              <div style={{ width: 22, height: 2, background: EDGE_COLORS.father.normal, borderRadius: 1 }} />
              <span>Linha paterna (direita)</span>
            </div>
            <div className="tree-legend-row">
              <div style={{ width: 22, height: 2, background: EDGE_COLORS.mother.normal, borderRadius: 1 }} />
              <span>Linha materna (esquerda)</span>
            </div>
            {includeSpouses && (
              <>
                <div className="tree-legend-row">
                  <div style={{ width: 22, height: 2, background: EDGE_COLORS.union.normal, borderRadius: 1 }} />
                  <span>União vigente</span>
                </div>
                <div className="tree-legend-row">
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
