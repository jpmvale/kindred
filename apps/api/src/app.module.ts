import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { PeopleModule } from './people/people.module';
import { LocationsModule } from './locations/locations.module';
import { UnionsModule } from './unions/unions.module';
import { BackupModule } from './backup/backup.module';
import { AuthModule } from './auth/auth.module';
import { SessionGuard } from './auth/session.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    PeopleModule,
    LocationsModule,
    UnionsModule,
    BackupModule,
  ],
  controllers: [HealthController],
  // Guard global (BL-10): todo controller novo nasce protegido por padrão —
  // @Public() é a exceção explícita. AuthModule precisa estar em `imports`
  // para o Nest resolver o SessionGuard (que depende de AuthService) aqui.
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
