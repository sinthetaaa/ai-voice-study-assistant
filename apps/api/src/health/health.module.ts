import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    TerminusModule,
    HttpModule.register({
      timeout: 3000,
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
