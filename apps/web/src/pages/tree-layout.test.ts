import { describe, expect, it } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { Person, PersonUnion, UnionStatus } from '@kindred/types';
import { computeLayout, FAMILY_GAP, NODE_H, NODE_W, type NodeData } from './tree-layout';

// ─── Cenário ──────────────────────────────────────────────────────────────────

/** O passo horizontal do layout: é a distância esperada entre um par e o outro. */
const PASSO = NODE_W + 22;

/** A distância entre duas gerações (altura do card + o `ranksep` do dagre). */
const LINHA = NODE_H + 72;

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

function layout(
  people: Person[],
  opcoes: { comCônjuges?: boolean; paisAbertos?: string[]; ladosAbertos?: string[] } = {},
) {
  return computeLayout({
    people,
    expandedParents: new Set(opcoes.paisAbertos ?? []),
    expandedSideDown: new Set(opcoes.ladosAbertos ?? []),
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

  it('não traz a família do cônjuge sem pedir, mas oferece o botão', () => {
    const { eu, fernanda, filha } = família();
    const sogro = pessoa('sogro');
    fernanda.fatherId = 'sogro';

    const { nodes } = layout([eu, fernanda, filha, sogro]);

    expect(nodes.some((n) => n.id === 'sogro')).toBe(false);
    expect(dados(nó(nodes, 'fernanda')).hasParents).toBe(true);
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

  it('mantém o casal encostado mesmo com a família do cônjuge aberta', () => {
    const { eu, fernanda, filha } = família();
    const sogro = pessoa('sogro');
    fernanda.fatherId = 'sogro';

    const { nodes } = layout([eu, fernanda, filha, sogro], { paisAbertos: ['fernanda'] });

    const x = (id: string) => nó(nodes, id).position.x;
    expect(Math.abs(x('fernanda') - x('eu'))).toBe(PASSO);
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

describe('computeLayout — a família do cônjuge (BL-13)', () => {
  /** Eu e a Fernanda; o pai e o irmão dela estão cadastrados mas fora da árvore. */
  function comSogro() {
    const { eu, fernanda, filha } = família();
    const sogro = pessoa('sogro', { sex: 'MALE' });
    const sogra = pessoa('sogra', { sex: 'FEMALE' });
    const cunhado = pessoa('cunhado', { fatherId: 'sogro', motherId: 'sogra' });
    fernanda.fatherId = 'sogro';
    fernanda.motherId = 'sogra';
    casar(sogro, sogra, 'u-sogros');
    return { eu, fernanda, filha, sogro, sogra, cunhado };
  }

  it('põe o sogro uma geração acima do cônjuge, e não no topo da árvore', () => {
    const { eu, fernanda, filha, sogro, sogra, cunhado } = comSogro();
    const { nodes } = layout([eu, fernanda, filha, sogro, sogra, cunhado], {
      paisAbertos: ['fernanda'],
    });

    const y = (id: string) => nó(nodes, id).position.y;
    // Sem o grupo andar junto, o sogro ficaria pendurado no rank 0 do dagre —
    // uma geração acima de todo mundo, inclusive dos avós do lado de sangue.
    expect(y('fernanda') - y('sogro')).toBe(LINHA);
    expect(y('fernanda')).toBe(y('eu'));
    expect(y('filha') - y('fernanda')).toBe(LINHA);
  });

  it('mantém o sogro em cima do cônjuge, não em cima do par de sangue', () => {
    const { eu, fernanda, filha, sogro, sogra, cunhado } = comSogro();
    const { nodes } = layout([eu, fernanda, filha, sogro, sogra, cunhado], {
      paisAbertos: ['fernanda'],
    });

    const x = (id: string) => nó(nodes, id).position.x;
    // O grupo de afinidade se desloca inteiro com o cônjuge: os sogros ficam
    // sobre ela, do lado dela, e não sobre o Miguel.
    const centroDosSogros = (x('sogro') + x('sogra')) / 2;
    expect(Math.abs(centroDosSogros - x('fernanda'))).toBeLessThan(PASSO);
    expect(Math.abs(centroDosSogros - x('eu'))).toBeGreaterThan(
      Math.abs(centroDosSogros - x('fernanda')),
    );
  });

  it('traz o cunhado quando o lado do cônjuge é aberto', () => {
    const { eu, fernanda, filha, sogro, sogra, cunhado } = comSogro();
    const pessoas = [eu, fernanda, filha, sogro, sogra, cunhado];

    const fechado = layout(pessoas, { paisAbertos: ['fernanda'] });
    expect(fechado.nodes.some((n) => n.id === 'cunhado')).toBe(false);

    const { nodes } = layout(pessoas, {
      paisAbertos: ['fernanda'],
      ladosAbertos: ['fernanda'],
    });
    expect(nodes.some((n) => n.id === 'cunhado')).toBe(true);
    expect(nó(nodes, 'cunhado').position.y).toBe(nó(nodes, 'fernanda').position.y);
  });

  it('desenha a união dos sogros sem desmanchar o grupo', () => {
    const { eu, fernanda, filha, sogro, sogra, cunhado } = comSogro();
    const { nodes, edges } = layout([eu, fernanda, filha, sogro, sogra, cunhado], {
      paisAbertos: ['fernanda'],
    });

    expect(uniões(edges)).toHaveLength(2);
    expect(nó(nodes, 'sogro').position.y).toBe(nó(nodes, 'sogra').position.y);
  });

  it('não deixa dois nós se sobreporem em nenhuma geração', () => {
    const { eu, fernanda, filha, sogro, sogra, cunhado } = comSogro();
    const ana = pessoa('ana');
    casar(eu, ana, 'u-ex', 'ENDED');

    const { nodes } = layout([eu, fernanda, filha, sogro, sogra, cunhado, ana], {
      paisAbertos: ['fernanda'],
      ladosAbertos: ['fernanda'],
    });

    const porLinha = new Map<number, number[]>();
    for (const n of nodes) {
      if (!porLinha.has(n.position.y)) porLinha.set(n.position.y, []);
      porLinha.get(n.position.y)!.push(n.position.x);
    }
    for (const xs of porLinha.values()) {
      const ordenados = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < ordenados.length; i++) {
        expect(ordenados[i] - ordenados[i - 1]).toBeGreaterThanOrEqual(PASSO);
      }
    }
  });
});

describe('computeLayout — agrupamento de famílias', () => {
  /** Avô com dois filhos (tio1, tio2), cada um com dois filhos — dois grupos de primos. */
  function tios() {
    const avô = pessoa('avô');
    const pai = pessoa('pai', { fatherId: 'avô' });
    const tio1 = pessoa('tio1', { fatherId: 'avô' });
    const tio2 = pessoa('tio2', { fatherId: 'avô' });
    const eu = pessoa('eu', { isCentralUser: true, fatherId: 'pai' });
    const primo1a = pessoa('primo1a', { fatherId: 'tio1' });
    const primo1b = pessoa('primo1b', { fatherId: 'tio1' });
    const primo2a = pessoa('primo2a', { fatherId: 'tio2' });
    const primo2b = pessoa('primo2b', { fatherId: 'tio2' });
    return { todos: [avô, pai, tio1, tio2, eu, primo1a, primo1b, primo2a, primo2b] };
  }

  it('afasta famílias diferentes por FAMILY_GAP, mantendo PASSO dentro da mesma família', () => {
    const { todos } = tios();
    const { nodes } = layout(todos, { paisAbertos: ['eu', 'pai'], ladosAbertos: ['eu'] });

    const x = (id: string) => nó(nodes, id).position.x;

    // Primos filhos do mesmo tio: mesma família, PASSO entre si.
    expect(Math.abs(x('primo1b') - x('primo1a'))).toBe(PASSO);
    expect(Math.abs(x('primo2b') - x('primo2a'))).toBe(PASSO);

    // Fronteira entre a família do tio1 e a do tio2: FAMILY_GAP, maior que PASSO.
    const fronteira = Math.min(
      Math.abs(x('primo2a') - x('primo1a')),
      Math.abs(x('primo2a') - x('primo1b')),
      Math.abs(x('primo2b') - x('primo1a')),
      Math.abs(x('primo2b') - x('primo1b')),
    );
    expect(fronteira).toBe(FAMILY_GAP);
    expect(FAMILY_GAP).toBeGreaterThan(PASSO);
  });

  it('a cascata desloca a família inteira sem distorcer a forma interna do ramo', () => {
    const avô = pessoa('avô');
    const pai = pessoa('pai', { fatherId: 'avô' });
    const tio1 = pessoa('tio1', { fatherId: 'avô' });
    const eu = pessoa('eu', { isCentralUser: true, fatherId: 'pai' });
    const primo1 = pessoa('primo1', { fatherId: 'tio1' });
    const primo1filho = pessoa('primo1filho', { fatherId: 'primo1' });
    const sozinho = [avô, pai, tio1, eu, primo1, primo1filho];

    const tio2 = pessoa('tio2', { fatherId: 'avô' });
    const primo2 = pessoa('primo2', { fatherId: 'tio2' });
    const comVizinho = [avô, pai, tio1, tio2, eu, primo1, primo1filho, primo2];

    const opcoes = { paisAbertos: ['eu', 'pai'], ladosAbertos: ['eu', 'primo1'] };
    const semVizinho = layout(sozinho, opcoes);
    const comVizinhoLayout = layout(comVizinho, opcoes);

    const offset = (nodes: Node[]) => nó(nodes, 'primo1filho').position.x - nó(nodes, 'primo1').position.x;

    // A família do tio2 ao lado empurra o ramo do tio1 inteiro, mas o filho de
    // primo1 continua na mesma posição relativa a ele — a família se move em
    // bloco, não se estica.
    expect(offset(comVizinhoLayout.nodes)).toBe(offset(semVizinho.nodes));
  });

  it('ordena por distância estrutural: primo de primeiro grau mais perto que de segundo grau', () => {
    const bisavô = pessoa('bisavô');
    const avô = pessoa('avô', { fatherId: 'bisavô' });
    const tioAvô = pessoa('tioAvô', { fatherId: 'bisavô' });
    const pai = pessoa('pai', { fatherId: 'avô' });
    const tio1 = pessoa('tio1', { fatherId: 'avô' });
    const eu = pessoa('eu', { isCentralUser: true, fatherId: 'pai' });
    const primo1 = pessoa('primo1', { fatherId: 'tio1' });
    const tioAvôFilho = pessoa('tioAvôFilho', { fatherId: 'tioAvô' });
    const primoSegundoGrau = pessoa('primoSegundoGrau', { fatherId: 'tioAvôFilho' });

    const { nodes } = layout(
      [bisavô, avô, tioAvô, pai, tio1, eu, primo1, tioAvôFilho, primoSegundoGrau],
      { paisAbertos: ['eu', 'pai', 'avô'], ladosAbertos: ['eu', 'avô'] },
    );

    const x = (id: string) => nó(nodes, id).position.x;
    const distânciaAoCentro = (id: string) => Math.abs(x(id) - x('eu'));

    expect(distânciaAoCentro('primo1')).toBeLessThan(distânciaAoCentro('primoSegundoGrau'));
  });

  it('familyGroups: a caixa de uma família bate com o bounding box dos seus membros', () => {
    const pai = pessoa('pai', { sex: 'MALE' });
    const mãe = pessoa('mãe', { sex: 'FEMALE' });
    const eu = pessoa('eu', { isCentralUser: true, fatherId: 'pai', motherId: 'mãe' });
    const irmã = pessoa('irmã', { fatherId: 'pai', motherId: 'mãe' });
    casar(pai, mãe, 'u1');

    const { nodes, familyGroups } = layout([pai, mãe, eu, irmã], {
      paisAbertos: ['eu'],
      ladosAbertos: ['eu'],
    });
    const grupo = familyGroups.find((g) => g.id === 'pai|mãe');
    expect(grupo).toBeDefined();

    const membros = ['pai', 'mãe', 'eu', 'irmã'].map((id) => nó(nodes, id));
    const esperado = {
      minX: Math.min(...membros.map((n) => n.position.x)),
      maxX: Math.max(...membros.map((n) => n.position.x)) + NODE_W,
      minY: Math.min(...membros.map((n) => n.position.y)),
      maxY: Math.max(...membros.map((n) => n.position.y)) + NODE_H,
    };
    expect(grupo).toEqual({ id: 'pai|mãe', ...esperado });
  });

  it('casal sem pais conhecidos continua a PASSO um do outro (a mesma família), não FAMILY_GAP', () => {
    const { eu, fernanda, filha } = família();
    const sogro = pessoa('sogro', { sex: 'MALE' });
    const sogra = pessoa('sogra', { sex: 'FEMALE' });
    fernanda.fatherId = 'sogro';
    fernanda.motherId = 'sogra';
    casar(sogro, sogra, 'u-sogros');

    const { nodes } = layout([eu, fernanda, filha, sogro, sogra], { paisAbertos: ['fernanda'] });
    const x = (id: string) => nó(nodes, id).position.x;

    expect(Math.abs(x('sogro') - x('sogra'))).toBe(PASSO);
  });
});
