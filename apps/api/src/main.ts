import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadRootEnv } from '@kindred/db';
import { AppModule } from './app.module';

async function bootstrap() {
  // Precisa rodar antes de o Nest instanciar os providers: o PrismaClient lê
  // DATABASE_URL na construção. O .env fica na raiz do monorepo (ADR-002).
  loadRootEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();

  // A foto de perfil sobe em base64 dentro do JSON (ADR-011), e o limite padrão
  // do express (100 KB) barra qualquer imagem. Restaurar um backup (BL-06)
  // manda a base inteira, fotos incluídas, no mesmo corpo — uma base real de
  // ~140 pessoas com 4 fotos já mede ~200 KB; 10 MB dá margem de sobra para uma
  // base pessoal bem maior sem abrir de fato uma porta de negação de serviço
  // (o app não tem autenticação, então esse limite não é a linha de defesa).
  app.useBodyParser('json', { limit: '10mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Kindred API em http://localhost:${port}/api`);
}

void bootstrap();
