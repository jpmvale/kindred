/*
 * A árvore, ilustrada — e o argumento da página, não a decoração dela.
 *
 * Cresceu e passou a mostrar **os parentescos escritos**: "Avó", "Tia", "Prima
 * em 2º", "você". Antes os nós eram caixas com traços dentro, e uma árvore
 * anônima é indistinguível de um organograma — o que o kindred faz de diferente é
 * justamente nomear o vínculo, e o desenho precisava dizer isso.
 *
 * Continua SVG com os tokens de cor do `index.css` (ADR-015), sem imagem: segue o
 * tema claro e o escuro sozinha e não pede arquivo de fora. As pessoas são
 * fictícias, e a legenda ao lado avisa.
 */

/** Um nó: posição, rótulo de parentesco, ano, e se é a pessoa de referência. */
interface Pessoa {
  x: number;
  y: number;
  parentesco: string;
  ano: string;
  central?: boolean;
}

const LARGURA_NO = 62;
const ALTURA_NO = 30;

const PESSOAS: Pessoa[] = [
  { x: 66, y: 6, parentesco: 'Avô', ano: '1938' },
  { x: 142, y: 6, parentesco: 'Avó', ano: '1941' },
  { x: 28, y: 76, parentesco: 'Tia', ano: '1969' },
  { x: 180, y: 76, parentesco: 'Mãe', ano: '1972' },
  { x: 10, y: 146, parentesco: 'Prima em 2º', ano: '1996' },
  { x: 198, y: 146, parentesco: 'você', ano: '1994', central: true },
];

export function TreeMock() {
  return (
    <svg
      viewBox="0 0 272 190"
      role="img"
      aria-label="Ilustração da árvore genealógica: avós no topo, duas filhas, e na base a prima em segundo grau e você"
      className="tree-mock"
    >
      {/* União dos avós: linha cheia, como a vigente na árvore de verdade */}
      <line x1="128" y1="21" x2="142" y2="21" stroke="var(--primary)" strokeWidth="2" />

      {/* Descida até as filhas */}
      <path
        d="M135 21 V50 H59 V76 M135 50 H211 V76"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.8"
      />
      {/* Das filhas até a geração de baixo */}
      <path
        d="M59 106 V126 H41 V146 M211 106 V126 H229 V146"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.8"
      />

      {PESSOAS.map(({ x, y, parentesco, ano, central }) => (
        <g key={parentesco}>
          <rect
            x={x}
            y={y}
            width={LARGURA_NO}
            height={ALTURA_NO}
            rx="7"
            fill={central ? 'var(--primary-soft)' : 'var(--surface)'}
            stroke={central ? 'var(--primary)' : 'var(--border)'}
            strokeWidth={central ? 1.8 : 1}
          />
          <text
            x={x + LARGURA_NO / 2}
            y={y + 13}
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="500"
            fill={central ? 'var(--primary-soft-foreground)' : 'var(--strong)'}
          >
            {parentesco}
          </text>
          <text
            x={x + LARGURA_NO / 2}
            y={y + 23}
            textAnchor="middle"
            fontSize="7.5"
            fill="var(--faint)"
          >
            {ano}
          </text>
        </g>
      ))}
    </svg>
  );
}
