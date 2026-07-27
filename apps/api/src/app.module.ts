import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { PeopleModule } from './people/people.module';
import { LocationsModule } from './locations/locations.module';
import { UnionsModule } from './unions/unions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PeopleModule,
    LocationsModule,
    UnionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
