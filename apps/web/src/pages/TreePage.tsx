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
  viewportTarget,
  type NodeData,
  type FamilyGroup,
} from './tree-layout';
import { relationsOf } from './person-relations';
import PersonDetailPanel from '../components/PersonDetailPanel';

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

/**
 * A chave de uma família: a fileira de irmãos marcada por trás e o traço que
 * desce do casal e abre sobre ela (ADR-023). Só decoração — não recebe
 * clique/hover. O traço é SVG porque precisa sair de um ponto acima da fileira,
 * na coluna do casal, que não é necessariamente o meio dela.
 */
function FamilyGroupNode({ data }: { data: { stemX?: number; stemHeight: number } }) {
  const { stemX, stemHeight } = data;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', pointerEvents: 'none' }}>
      {stemX !== undefined && (
        <svg
          width="100%"
          height={stemHeight}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
          aria-hidden
        >
          <path
            d={`M ${stemX} 0 V ${stemHeight}`}
            fill="none"
            stroke="var(--tree-familygroup-border)"
            strokeWidth={2}
          />
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          top: stemHeight,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 16,
          background: 'var(--tree-familygroup-bg)',
          border: '1px solid var(--tree-familygroup-border)',
        }}
      />
    </div>
  );
}

const NODE_TYPES = { person: PersonNode, familyGroup: FamilyGroupNode };

/** Folga ao redor dos cards dentro da marca do grupo de irmãos. */
const FAMILY_GROUP_PADDING = 18;

function familyGroupNodes(familyGroups: FamilyGroup[]) {
  return familyGroups.map((g) => {
    const top = g.minY - FAMILY_GROUP_PADDING;
    // O traço nasce na base dos cards do casal e morre no topo da marca. Sem
    // casal visível não há de onde descer: fica só a marca da fileira.
    const stemHeight = g.stem ? Math.max(0, top - g.stem.y) : 0;
    return {
      id: `group-${g.id}`,
      type: 'familyGroup',
      position: { x: g.minX - FAMILY_GROUP_PADDING, y: top - stemHeight },
      style: {
        width: g.maxX - g.minX + FAMILY_GROUP_PADDING * 2,
        height: g.maxY - g.minY + FAMILY_GROUP_PADDING * 2 + stemHeight,
        zIndex: -1,
      },
      selectable: false,
      draggable: false,
      focusable: false,
      connectable: false,
      data: {
        stemHeight,
        stemX: g.stem ? g.stem.x - (g.minX - FAMILY_GROUP_PADDING) : undefined,
      },
    };
  });
}

// ─── Inner component ──────────────────────────────────────────────────────────

function TreeContent() {
  const people = useLoaderData() as Person[];
  const { setCenter, getZoom } = useReactFlow();
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
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // A lista inteira, não só quem está desenhado: o card mostra a família de
  // verdade mesmo quando parte dela não foi expandida na árvore.
  const selectedRelations = useMemo(
    () => (selectedPersonId ? relationsOf(selectedPersonId, people) : null),
    [selectedPersonId, people],
  );

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

    setNodes((prev) => prev.map((node) => {
      // O contorno de família não tem `NodeData` nenhum — espalhar os campos de
      // hover nele só sujaria o node à toa.
      if (node.type !== 'person') return node;
      return {
        ...node,
        data: {
          ...(node.data as Record<string, unknown>),
          isHovered: hoveredId === node.id,
          isParentOfHovered: parentIds.has(node.id),
          isChildOfHovered: childIds.has(node.id),
          isPartnerOfHovered: partnerIds.has(node.id),
        },
      };
    }));

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
    // Os contornos de família entram primeiro no array só por organização — quem
    // manda no empilhamento visual é o `zIndex: -1` de cada um, não a ordem aqui.
    setNodes([...familyGroupNodes(layout.familyGroups), ...layout.nodes]);
    setEdges(layout.edges);
    if (layout.nodes.length) setTimeout(() => applyHoverStyling(null), 0);
  }, [layout, applyHoverStyling, setEdges, setNodes]);

  /*
   * Expandir **não mexe no zoom**: a viewport só desliza até a pessoa central, no zoom em que a
   * pessoa já estava (ADR-025). Enquadrar tudo (`fitView`) era o que havia antes, e numa árvore de
   * 13 mil px de largura significava afastar até os cards virarem tijolinhos ilegíveis a cada clique
   * de expandir — o desenho inteiro cabendo na tela não é o que se quer ver, é a família em volta de
   * quem está no centro.
   *
   * Ainda depende de o reactflow **já ter medido** os nós (`useNodesInitialized`): sem largura e
   * altura não há centro que preste, e o efeito silenciaria deixando tudo fora da tela — foi o que
   * acontecia com os 117 nós da base real (BL-15). Esperar por cronômetro (era `setTimeout(..., 20)`)
   * é uma aposta no tamanho da base; o sinal de medição pronta não tem prazo a chutar.
   */
  useEffect(() => {
    if (empty || !nodesInitialized) return;
    const target = viewportTarget(layout.nodes);
    if (!target) return;
    setCenter(target.x, target.y, { zoom: getZoom(), duration: 350 });
  }, [empty, nodesInitialized, layout, setCenter, getZoom]);

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
        minZoom={0.04}
        maxZoom={2.5}
        nodesDraggable={false}
        panOnDrag
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeMouseEnter={(_, node) => node.type === 'person' && setHoveredPersonId(node.id)}
        onNodeMouseLeave={() => setHoveredPersonId(null)}
        onNodeClick={(_, node) => node.type === 'person' && setSelectedPersonId(node.id)}
        onPaneClick={() => setSelectedPersonId(null)}
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

      {selectedRelations && (
        <PersonDetailPanel
          relations={selectedRelations}
          onClose={() => setSelectedPersonId(null)}
          onSelectPerson={setSelectedPersonId}
        />
      )}
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
