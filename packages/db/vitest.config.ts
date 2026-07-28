import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Só o fonte: o `dist` tem a versão compilada em CommonJS, que o vitest não
    // consegue carregar — e rodar o mesmo teste duas vezes não provaria nada.
    include: ["src/**/*.test.ts"],
  },
});
