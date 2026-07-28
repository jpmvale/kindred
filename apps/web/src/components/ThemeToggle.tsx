import { useEffect, useState } from 'react';
import { applyTheme, getStoredTheme, resolveTheme, setTheme, type Theme } from '../theme';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Sistema' },
];

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
    </svg>
  );
}

/**
 * Seletor de tema (claro/escuro/sistema), no pé da barra lateral.
 *
 * A preferência já está aplicada quando este componente monta — quem faz isso é o script inline do
 * `index.html`, antes da pintura. Aqui só se lê o que ficou guardado para marcar a opção certa e se
 * cuidam as trocas. Em "sistema", o componente acompanha o SO trocando de tema em tempo real.
 *
 * Recolhida, a barra não tem largura para o segmentado: vira um botão que alterna entre claro e
 * escuro, e escolher "sistema" volta a ser possível ao expandir.
 */
export default function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    if (theme !== 'system') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);

  function change(next: Theme) {
    setThemeState(next);
    setTheme(next);
  }

  if (collapsed) {
    const dark = resolveTheme(theme) === 'dark';
    return (
      <button
        type="button"
        className="theme-toggle-collapsed"
        title={dark ? 'Tema claro' : 'Tema escuro'}
        aria-label={dark ? 'Tema claro' : 'Tema escuro'}
        onClick={() => change(dark ? 'light' : 'dark')}
      >
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>
    );
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Tema">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`theme-option${option.value === theme ? ' is-active' : ''}`}
          aria-pressed={option.value === theme}
          onClick={() => change(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
