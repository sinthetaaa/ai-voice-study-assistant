import { Module } from '@nestjs/common';

import { EvaluationsModule } from '../evaluations/evaluations.module';
import { LearningLoopModule } from '../learning-loop/learning-loop.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuestionsModule } from '../questions/questions.module';
import { SpeechModule } from '../speech/speech.module';

import { StudyPackReadinessService } from './study-pack-readiness.service';
import { StudySessionVoiceService } from './study-session-voice.service';
import { StudySessionsController } from './study-sessions.controller';
import { StudySessionsService } from './study-sessions.service';

@Module({
  imports: [
    PrismaModule,
    EvaluationsModule,
    LearningLoopModule,
    QuestionsModule,
    SpeechModule,
  ],

  controllers: [StudySessionsController],

  providers: [
    StudySessionsService,
    StudyPackReadinessService,
    StudySessionVoiceService,
  ],

  exports: [StudySessionsService, StudyPackReadinessService],
})
export class StudySessionsModule {}
