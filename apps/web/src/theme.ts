/**
 * Tema claro/escuro. A preferência ("light" | "dark" | "system") vive no `localStorage`; o valor
 * **aplicado** é sempre resolvido para `light`/`dark` e escrito em `data-theme` no <html>, que o CSS
 * (`index.css`) usa para trocar os tokens de cor. "system" é resolvido aqui a partir do
 * `prefers-color-scheme`, então o CSS não precisa duplicar a paleta numa media query.
 *
 * A **primeira** aplicação acontece por um script inline no `index.html`, antes da pintura — sem
 * ele, a tela pisca branca antes de o bundle carregar. Este módulo cuida das trocas em runtime e da
 * sincronia com o SO quando a escolha é "system".
 */
export type Theme = 'light' | 'dark' | 'system';

export const THEME_KEY = 'kindred-theme';

export function getStoredTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system'
    ? stored
    : 'system';
}

/** Resolve "system" para light/dark pelo `prefers-color-scheme`; os demais passam direto. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  const dark =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

/** Escreve o tema resolvido no <html> (não persiste). */
export function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolveTheme(theme);
  }
}

/** Persiste a preferência e aplica. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* modo privado / storage cheio: sem persistência, mas a sessão ainda troca */
  }
  applyTheme(theme);
}
