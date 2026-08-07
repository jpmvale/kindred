/*
 * A árvore, ilustrada — e o argumento da página, não a decoração dela.
 *
 * Mostra **os parentescos escritos**: "Avó", "Tia", "Irmã", "você". Uma árvore
 * anônima é indistinguível de um organograma, e o que o kindred faz de diferente
 * é justamente nomear o vínculo.
 *
 * Três gerações e oito pessoas, com dois ramos abrindo em paralelo. A versão
 * anterior tinha seis nós numa linha só de descendência, montada para provar a
 * frase "ela é sua prima em 2º grau" que titulava a página. O título mudou, e
 * uma ilustração que ilustra um argumento que saiu vira enfeite: esta desenha
 * uma família qualquer, que é o que a página promete agora.
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
  { x: 105, y: 6, parentesco: 'Avô', ano: '1938' },
  { x: 173, y: 6, parentesco: 'Avó', ano: '1941' },
  { x: 20, y: 76, parentesco: 'Tia', ano: '1969' },
  { x: 139, y: 76, parentesco: 'Mãe', ano: '1972' },
  { x: 258, y: 76, parentesco: 'Tio', ano: '1975' },
  { x: 20, y: 146, parentesco: 'Primo', ano: '1996' },
  { x: 104, y: 146, parentesco: 'você', ano: '1994', central: true },
  { x: 176, y: 146, parentesco: 'Irmã', ano: '1991' },
];

export function TreeMock() {
  return (
    <svg
      viewBox="0 0 340 210"
      role="img"
      aria-label="Ilustração da árvore genealógica: avós no topo, três filhos na geração seguinte, e na base um primo, você e sua irmã"
      className="tree-mock"
    >
      {/* União dos avós: linha cheia, como a vigente na árvore de verdade */}
      <line x1="167" y1="21" x2="173" y2="21" stroke="var(--primary)" strokeWidth="2" />

      {/* Do casal até os três filhos */}
      <path
        d="M170 21 V50 H51 V76 M170 50 H289 V76 M170 50 V76"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.8"
      />
      {/* Dos filhos até a geração de baixo, em dois ramos paralelos */}
      <path
        d="M51 106 V146 M170 106 V126 H135 V146 M170 126 H207 V146"
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
