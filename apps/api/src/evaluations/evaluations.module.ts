import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { EvaluationAiClientService } from './evaluation-ai-client.service';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

@Module({
  imports: [PrismaModule],

  controllers: [EvaluationsController],

  providers: [EvaluationAiClientService, EvaluationsService],

  exports: [EvaluationsService],
})
export class EvaluationsModule {}
