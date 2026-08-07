import { Link } from 'react-router-dom';
import { TreeMock } from './tree-mock';

/*
 * A aterrissagem de quem chega de fora.
 *
 * Antes `/` era um `<Navigate to="/people">` dentro do layout, e o layout exige
 * sessão — na prática, todo visitante caía numa tela de e-mail e senha sem uma
 * palavra sobre o que o kindred é. A página existe para responder isso antes de
 * pedir qualquer coisa.
 *
 * O que ela promete é o que o app faz de diferente de uma lista de contatos: o
 * **grau de parentesco é calculado**, não digitado. Esse é o motivo de existir do
 * kindred, e é o que a página mostra primeiro.
 */

/** O que o app faz que uma agenda de contatos não faz. */
const DESTAQUES = [
  {
    titulo: 'O parentesco é calculado, não digitado',
    texto:
      'Você diz quem é filho de quem; o kindred deduz o resto. "Prima em 2º grau", "Tio-avô", "Cunhada" — inclusive por afinidade, atravessando a união, até oito passos de distância.',
  },
  {
    titulo: 'Uma árvore que se abre por onde você quiser',
    texto:
      'Ancestrais, descendentes, irmãos e ramos de primos, um nó por vez. Casais aparecem lado a lado, com a união vigente em linha cheia e a desfeita tracejada — porque as duas coisas são diferentes e a árvore precisa dizer qual é qual.',
  },
  {
    titulo: 'Os aniversários do mês, sem você lembrar',
    texto:
      'Todo mundo que você cadastrou vira um calendário: quem faz aniversário este mês e quem vem em seguida.',
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-top">
        <span className="landing-mark">kindred</span>
        <nav className="landing-top-actions">
          <Link className="landing-btn landing-btn-ghost" to="/login">
            Entrar
          </Link>
          <Link className="landing-btn landing-btn-primary" to="/register">
            Criar conta
          </Link>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div>
            {/* O título nomeia as duas coisas que o app entrega: a árvore
                desenhada e o aniversário que ninguém precisa lembrar sozinho. */}
            <h1>
              Visualize sua <span className="landing-destaque">árvore genealógica</span> e seja
              sempre lembrado dos aniversários.
            </h1>
            <p className="landing-lead">
              Você diz quem é filho de quem; o kindred deduz o resto. O grau de parentesco de toda a
              família, a árvore desenhada e os aniversários do mês vêm daí — sem você calcular nada.
            </p>
            <div className="landing-cta">
              <Link className="landing-btn landing-btn-primary" to="/register">
                Criar conta
              </Link>
              <Link className="landing-btn landing-btn-ghost" to="/login">
                Já tenho conta
              </Link>
            </div>
            <p className="landing-note">
              Cada conta tem a própria árvore, isolada das demais — ninguém vê as suas pessoas.
            </p>
          </div>

          <figure className="landing-figure">
            <TreeMock />
            <figcaption>Ilustração da árvore, com pessoas de exemplo.</figcaption>
          </figure>
        </section>

        <section className="landing-grid">
          {DESTAQUES.map(({ titulo, texto }) => (
            <article key={titulo} className="card">
              <div className="card-body">
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </div>
            </article>
          ))}
        </section>

        {/* Dito antes do cadastro, e não depois: a primeira coisa que a app pede
            é a pessoa central, e chegar nisso de surpresa faz o app parecer
            estar cobrando uma decisão que ninguém explicou. */}
        <section className="landing-start">
          <h2>Como começa</h2>
          <ol>
            <li>
              <strong>Você diz quem é a pessoa central.</strong> É a referência de todo o cálculo —
              normalmente você mesmo. É a primeira coisa que a app pede depois do cadastro.
            </li>
            <li>
              <strong>Cadastra as pessoas e diz quem são os pais.</strong> Nome, nascimento e o
              vínculo bastam; o resto é opcional.
            </li>
            <li>
              <strong>O parentesco aparece sozinho</strong> — na lista, na árvore e no calendário.
            </li>
          </ol>
        </section>
      </main>

      <footer className="landing-foot">
        <span>Uma aplicação pessoal, para a sua família.</span>
        <a href="https://github.com/jpmvale/kindred" target="_blank" rel="noreferrer">
          Código no GitHub
        </a>
      </footer>
    </div>
  );
}
