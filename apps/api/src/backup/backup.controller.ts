import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { backupFilename } from '@kindred/db';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  async export(@Res({ passthrough: true }) res: Response) {
    const payload = await this.backupService.export();
    res.set(
      'Content-Disposition',
      `attachment; filename="${backupFilename()}"`,
    );
    return payload;
  }

  /**
   * O corpo é o próprio arquivo de backup — a mesma forma que `GET /api/backup`
   * devolve. Não é DTO validado (`whitelist` cortaria o formato dinâmico dos
   * quatro modelos): `parseBackupFile`, dentro do service, é quem confere.
   */
  @Post('restore')
  restore(
    @Body() body: Record<string, unknown>,
    @Query('force') force?: string,
  ) {
    return this.backupService.restore(body, force === 'true');
  }
}
