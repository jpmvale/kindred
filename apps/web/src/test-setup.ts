import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem `globals: true` no Vitest, a limpeza automática do testing-library não
// acontece sozinha — sem isto, um teste enxergaria a tela do anterior.
afterEach(cleanup);

// O reactflow observa o tamanho do container; o jsdom não tem ResizeObserver.
// Dublê vazio: nada aqui mede nada, e o layout de verdade é testado à parte,
// no módulo puro (`tree-layout.test.ts`).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
