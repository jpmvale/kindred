/*
 * Uma ilustração da árvore — não é uma captura de tela, e a legenda ao lado diz
 * isso.
 *
 * Desenhada em SVG com os tokens de cor do `index.css` em vez de uma imagem:
 * acompanha o tema claro e o escuro sozinha (ADR-015, nenhum hex fora dos
 * tokens), não pesa no bundle e não pede arquivo nenhum de fora.
 *
 * O desenho é o menor recorte que ainda mostra o que a árvore de verdade faz:
 * um casal lado a lado, os filhos pendurados na linha do casal, e a união
 * desfeita tracejada — o detalhe que distingue esta árvore de um organograma.
 */

/** Um nó da ilustração. `central` é a pessoa de referência, destacada como na app. */
const PESSOAS = [
  { x: 60, y: 16, largura: 64, central: false },
  { x: 148, y: 16, largura: 64, central: false },
  { x: 16, y: 96, largura: 64, central: false },
  { x: 104, y: 96, largura: 64, central: true },
  { x: 192, y: 96, largura: 64, central: false },
];

export function TreeMock() {
  return (
    <svg
      viewBox="0 0 272 150"
      role="img"
      aria-label="Ilustração da árvore genealógica: um casal no topo e três filhos abaixo"
      className="tree-mock"
    >
      {/* União do casal: a linha cheia que liga os dois no topo */}
      <line x1="124" y1="32" x2="148" y2="32" stroke="var(--primary)" strokeWidth="2" />

      {/* Descida do casal até a linha dos filhos */}
      <line x1="136" y1="32" x2="136" y2="72" stroke="var(--border)" strokeWidth="2" />
      <line x1="48" y1="72" x2="224" y2="72" stroke="var(--border)" strokeWidth="2" />
      {[48, 136, 224].map((x) => (
        <line key={x} x1={x} y1="72" x2={x} y2="96" stroke="var(--border)" strokeWidth="2" />
      ))}

      {/* A união desfeita, tracejada — o estado que a app distingue da vigente */}
      <line
        x1="168"
        y1="112"
        x2="192"
        y2="112"
        stroke="var(--faint)"
        strokeWidth="2"
        strokeDasharray="3 3"
      />

      {PESSOAS.map(({ x, y, largura, central }) => (
        <g key={`${x}-${y}`}>
          <rect
            x={x}
            y={y}
            width={largura}
            height={32}
            rx="6"
            fill={central ? 'var(--primary-soft)' : 'var(--surface)'}
            stroke={central ? 'var(--primary)' : 'var(--border)'}
            strokeWidth={central ? 2 : 1}
          />
          {/* Nome e parentesco, como traços: o desenho não finge ser texto real */}
          <rect
            x={x + 10}
            y={y + 9}
            width={largura - 28}
            height={5}
            rx="2.5"
            fill={central ? 'var(--primary)' : 'var(--strong)'}
            opacity={central ? 0.8 : 0.55}
          />
          <rect
            x={x + 10}
            y={y + 19}
            width={largura - 38}
            height={4}
            rx="2"
            fill="var(--faint)"
          />
        </g>
      ))}
    </svg>
  );
}
