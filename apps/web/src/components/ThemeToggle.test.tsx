import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggle from './ThemeToggle';
import { THEME_KEY } from '../theme';

/*
 * Dublê do `prefers-color-scheme` que guarda quem se inscreveu, para poder avisar depois.
 *
 * O `removeEventListener` **precisa** tirar de verdade: é ele que distingue "o componente ignorou o
 * aviso" de "o componente cancelou a inscrição", que é o que o teste da escolha explícita afirma.
 * Um dublê que aceita e não remove faz o teste passar por engano nos dois casos — ou, como
 * aconteceu aqui, falhar num código correto.
 */
let ouvintes: Array<() => void> = [];

function sistemaEscuro(escuro: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: escuro && query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: (_: string, ouvinte: () => void) => ouvintes.push(ouvinte),
      removeEventListener: (_: string, ouvinte: () => void) => {
        ouvintes = ouvintes.filter((registrado) => registrado !== ouvinte);
      },
    })),
  );
}

beforeEach(() => {
  ouvintes = [];
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  sistemaEscuro(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ThemeToggle', () => {
  it('marca a opção guardada', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    render(<ThemeToggle collapsed={false} />);

    expect(screen.getByRole('button', { name: 'Escuro' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('escolher escuro troca o tema do <html> e guarda a preferência', async () => {
    const usuario = userEvent.setup();
    render(<ThemeToggle collapsed={false} />);

    await usuario.click(screen.getByRole('button', { name: 'Escuro' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('em "sistema", o SO trocando de tema troca a tela', async () => {
    const usuario = userEvent.setup();
    render(<ThemeToggle collapsed={false} />);

    await usuario.click(screen.getByRole('button', { name: 'Sistema' }));
    expect(document.documentElement.dataset.theme).toBe('light');

    // O SO passou para escuro: quem está em "sistema" acompanha sem clique nenhum.
    sistemaEscuro(true);
    for (const avisar of ouvintes) avisar();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('escolha explícita não acompanha o SO', async () => {
    const usuario = userEvent.setup();
    render(<ThemeToggle collapsed={false} />);

    await usuario.click(screen.getByRole('button', { name: 'Claro' }));
    sistemaEscuro(true);
    for (const avisar of ouvintes) avisar();

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('recolhida, a barra mostra um botão só, que alterna', async () => {
    const usuario = userEvent.setup();
    render(<ThemeToggle collapsed />);

    // Está claro, então o botão oferece o escuro.
    const botao = screen.getByRole('button', { name: 'Tema escuro' });
    await usuario.click(botao);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Tema claro' })).toBeInTheDocument();
  });
});
