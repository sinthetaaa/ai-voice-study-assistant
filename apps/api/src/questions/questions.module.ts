import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { QuestionAiClientService } from './question-ai-client.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  imports: [PrismaModule],

  controllers: [QuestionsController],

  providers: [QuestionAiClientService, QuestionsService],

  exports: [QuestionsService],
})
export class QuestionsModule {}
