import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './auth/public.decorator';

/**
 * `GET /api/health` — usado pelo healthcheck do container e para conferir à mão
 * se a API está de pé e falando com o banco. Público: o healthcheck do
 * `docker-compose.yml` bate aqui sem credencial nenhuma (BL-10).
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`select 1`;
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }
}
