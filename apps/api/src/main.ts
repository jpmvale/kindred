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
  // do express (100 KB) barra qualquer imagem. 3 MB cobre com folga o teto de
  // 2 MB do arquivo, que cresce um terço ao virar base64.
  app.useBodyParser('json', { limit: '3mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Kindred API em http://localhost:${port}/api`);
}

void bootstrap();
