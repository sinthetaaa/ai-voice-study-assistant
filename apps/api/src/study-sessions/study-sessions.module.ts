import { Module } from '@nestjs/common';

import { EvaluationsModule } from '../evaluations/evaluations.module';
import { LearningLoopModule } from '../learning-loop/learning-loop.module';
import { PrismaModule } from '../prisma/prisma.module';

import { StudySessionsController } from './study-sessions.controller';
import { StudySessionsService } from './study-sessions.service';

@Module({
  imports: [PrismaModule, EvaluationsModule, LearningLoopModule],

  controllers: [StudySessionsController],

  providers: [StudySessionsService],

  exports: [StudySessionsService],
})
export class StudySessionsModule {}
