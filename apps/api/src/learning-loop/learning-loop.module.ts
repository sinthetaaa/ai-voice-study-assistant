import { Module } from '@nestjs/common';

import { AdaptiveModule } from '../adaptive/adaptive.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RemediationModule } from '../remediation/remediation.module';
import { QuestionsModule } from '../questions/questions.module';

import { LearningLoopController } from './learning-loop.controller';
import { LearningLoopService } from './learning-loop.service';

@Module({
  imports: [PrismaModule, AdaptiveModule, RemediationModule, QuestionsModule],

  controllers: [LearningLoopController],

  providers: [LearningLoopService],

  exports: [LearningLoopService],
})
export class LearningLoopModule {}
