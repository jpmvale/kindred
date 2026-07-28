import { loadRootEnv } from '@kindred/db';

// O `main.ts` chama isto antes de instanciar o Nest (ADR-002); o e2e monta o
// AppModule direto, então precisa carregar o `.env` da raiz por conta — sem
// isso o PrismaClient sobe sem DATABASE_URL e nada conecta.
loadRootEnv();
