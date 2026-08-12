import { Module } from '@nestjs/common';

import { EvaluationsModule } from '../evaluations/evaluations.module';
import { LearningLoopModule } from '../learning-loop/learning-loop.module';
import { PrismaModule } from '../prisma/prisma.module';

import { StudyPackReadinessService } from './study-pack-readiness.service';
import { StudySessionsController } from './study-sessions.controller';
import { StudySessionsService } from './study-sessions.service';

@Module({
  imports: [PrismaModule, EvaluationsModule, LearningLoopModule],

  controllers: [StudySessionsController],

  providers: [StudySessionsService, StudyPackReadinessService],

  exports: [StudySessionsService, StudyPackReadinessService],
})
export class StudySessionsModule {}
