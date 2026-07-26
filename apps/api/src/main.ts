import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadRootEnv } from '@kindred/db';
import { AppModule } from './app.module';

async function bootstrap() {
  // Precisa rodar antes de o Nest instanciar os providers: o PrismaClient lê
  // DATABASE_URL na construção. O .env fica na raiz do monorepo (ADR-002).
  loadRootEnv();

  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Kindred API em http://localhost:${port}/api`);
}

void bootstrap();
