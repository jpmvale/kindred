import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  setTheme,
  THEME_KEY,
} from './theme';

/** Dublê do `prefers-color-scheme`, que o jsdom não tem. */
function sistemaEscuro(escuro: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: escuro && query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  sistemaEscuro(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme', () => {
  it('sem nada guardado, a preferência é "sistema"', () => {
    expect(getStoredTheme()).toBe('system');
  });

  it('lixo no localStorage não vira tema', () => {
    localStorage.setItem(THEME_KEY, 'roxo');
    expect(getStoredTheme()).toBe('system');
  });

  it('"sistema" é resolvido pelo SO, e só ele', () => {
    sistemaEscuro(true);
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');

    sistemaEscuro(false);
    expect(resolveTheme('system')).toBe('light');
    // Escolha explícita não muda com o SO: é o ponto de existir a opção.
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('o que vai para o <html> é sempre light ou dark, nunca "system"', () => {
    sistemaEscuro(true);
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('escolher persiste a preferência e aplica o tema resolvido', () => {
    setTheme('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    setTheme('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('storage indisponível não impede a troca na sessão', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('modo privado');
    });

    expect(() => setTheme('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
