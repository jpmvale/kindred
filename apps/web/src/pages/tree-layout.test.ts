import { describe, expect, it } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { Person, PersonUnion, UnionStatus } from '@kindred/types';
import { computeLayout, NODE_W, type NodeData } from './tree-layout';

// ─── Cenário ──────────────────────────────────────────────────────────────────

/** O passo horizontal do layout: é a distância esperada entre um par e o outro. */
const PASSO = NODE_W + 22;

function pessoa(id: string, extras: Partial<Person> = {}): Person {
  return {
    id,
    name: id,
    deceased: false,
    relationshipType: 'FAMILY',
    isCentralUser: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extras,
  };
}

/**
 * Cria a união dos dois lados, como a API faz: cada pessoa recebe uma cópia com
 * o par já resolvido. O `partner` não é usado pelo layout, mas o tipo pede.
 */
function casar(a: Person, b: Person, id: string, status: UnionStatus = 'CURRENT') {
  const lado = (partner: Person): PersonUnion => ({
    id,
    status,
    partnerId: partner.id,
    partner,
  });
  a.unions = [...(a.unions ?? []), lado(b)];
  b.unions = [...(b.unions ?? []), lado(a)];
}

function layout(people: Person[], opcoes: { comCônjuges?: boolean; paisAbertos?: string[] } = {}) {
  return computeLayout({
    people,
    expandedParents: new Set(opcoes.paisAbertos ?? []),
    expandedSideDown: new Set(),
    includeSiblings: true,
    includeSpouses: opcoes.comCônjuges ?? true,
    onToggleParents: () => {},
    onToggleSideDown: () => {},
  });
}

function nó(nodes: Node[], id: string) {
  const encontrado = nodes.find((n) => n.id === id);
  if (!encontrado) throw new Error(`nó "${id}" não está na árvore`);
  return encontrado;
}

function dados(node: Node) {
  return node.data as NodeData;
}

function uniões(edges: Edge[]) {
  return edges.filter((e) => e.id.startsWith('eu-'));
}

/** Eu, minha esposa e a filha dos dois — o mínimo para haver um casal. */
function família() {
  const eu = pessoa('eu', { isCentralUser: true, sex: 'MALE' });
  const fernanda = pessoa('fernanda', { sex: 'FEMALE' });
  const filha = pessoa('filha', { sex: 'FEMALE', fatherId: 'eu', motherId: 'fernanda' });
  casar(eu, fernanda, 'u1');
  return { eu, fernanda, filha, todos: [eu, fernanda, filha] };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('computeLayout — casais', () => {
  it('traz o cônjuge para a árvore mesmo sem laço de sangue', () => {
    const { todos } = família();
    const { nodes } = layout(todos);

    expect(nodes.map((n) => n.id).sort()).toEqual(['eu', 'fernanda', 'filha']);
  });

  it('encosta o cônjuge no par: mesma altura, um passo de distância', () => {
    const { todos } = família();
    const { nodes } = layout(todos);

    const eu = nó(nodes, 'eu');
    const fernanda = nó(nodes, 'fernanda');

    expect(fernanda.position.y).toBe(eu.position.y);
    expect(Math.abs(fernanda.position.x - eu.position.x)).toBe(PASSO);
  });

  it('liga o casal por uma aresta que sai de quem está à esquerda', () => {
    const { todos } = família();
    const { nodes, edges } = layout(todos);

    const uniãoEdges = uniões(edges);
    expect(uniãoEdges).toHaveLength(1);

    const [aresta] = uniãoEdges;
    const esquerda = nó(nodes, aresta.source).position.x;
    const direita = nó(nodes, aresta.target).position.x;

    expect(esquerda).toBeLessThan(direita);
    expect(aresta.sourceHandle).toBe('spouse-right');
    expect(aresta.targetHandle).toBe('spouse-left');
    expect(aresta.style?.strokeDasharray).toBeUndefined();
  });

  it('desenha a união desfeita tracejada', () => {
    const eu = pessoa('eu', { isCentralUser: true });
    const ana = pessoa('ana');
    casar(eu, ana, 'u1', 'ENDED');

    const { edges } = layout([eu, ana]);
    const [aresta] = uniões(edges);

    expect(aresta.style?.strokeDasharray).toBeTruthy();
  });

  it('some com cônjuges e uniões quando o filtro está desligado', () => {
    const { todos } = família();
    const { nodes, edges } = layout(todos, { comCônjuges: false });

    expect(nodes.map((n) => n.id).sort()).toEqual(['eu', 'filha']);
    expect(uniões(edges)).toHaveLength(0);
  });

  it('desce a linha do cônjuge até o filho do casal', () => {
    const { todos } = família();
    const { edges } = layout(todos);

    expect(edges.some((e) => e.id === 'em-fernanda-filha')).toBe(true);
    expect(edges.some((e) => e.id === 'ef-eu-filha')).toBe(true);
  });

  it('mantém o cônjuge como folha — sem botão de expandir a família dele', () => {
    const { eu, fernanda, filha } = família();
    const sogro = pessoa('sogro');
    fernanda.fatherId = 'sogro';

    const { nodes } = layout([eu, fernanda, filha, sogro]);

    expect(dados(nó(nodes, 'fernanda')).hasParents).toBe(false);
    expect(dados(nó(nodes, 'fernanda')).hasSideDown).toBe(false);
    expect(nodes.some((n) => n.id === 'sogro')).toBe(false);
  });

  it('põe a ex do outro lado, com o par no meio, em vez de empilhar', () => {
    const { eu, fernanda, filha } = família();
    const ana = pessoa('ana');
    casar(eu, ana, 'u2', 'ENDED');

    const { nodes, edges } = layout([eu, fernanda, filha, ana]);

    const x = (id: string) => nó(nodes, id).position.x;
    // Empilhadas do mesmo lado, a linha da ex atravessaria o card da atual.
    expect(Math.abs(x('fernanda') - x('eu'))).toBe(PASSO);
    expect(Math.abs(x('ana') - x('eu'))).toBe(PASSO);
    expect(Math.sign(x('fernanda') - x('eu'))).toBe(-Math.sign(x('ana') - x('eu')));
    expect(uniões(edges)).toHaveLength(2);
  });

  it('não duplica nó quando os dois cônjuges já são da família', () => {
    const avô = pessoa('avô');
    const pai = pessoa('pai', { fatherId: 'avô' });
    const tio = pessoa('tio', { fatherId: 'avô' });
    const eu = pessoa('eu', { isCentralUser: true, fatherId: 'pai' });
    const prima = pessoa('prima', { fatherId: 'tio' });
    casar(eu, prima, 'u1');

    const { nodes, edges } = layout([avô, pai, tio, eu, prima], { paisAbertos: ['eu', 'pai'] });

    expect(nodes.filter((n) => n.id === 'prima')).toHaveLength(1);
    expect(uniões(edges)).toHaveLength(1);
  });

  it('não afasta ninguém quando não há união nenhuma', () => {
    const pai = pessoa('pai');
    const eu = pessoa('eu', { isCentralUser: true, fatherId: 'pai' });
    const irmã = pessoa('irmã', { fatherId: 'pai' });

    const semUniões = layout([pai, eu, irmã], { paisAbertos: ['eu'] });
    const comFiltroDesligado = layout([pai, eu, irmã], { paisAbertos: ['eu'], comCônjuges: false });

    expect(semUniões.nodes.map((n) => n.position)).toEqual(
      comFiltroDesligado.nodes.map((n) => n.position),
    );
  });
});
