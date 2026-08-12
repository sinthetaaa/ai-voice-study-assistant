import { Controller, Param, Post } from '@nestjs/common';

import {
  QuestionGenerationResult,
  QuestionPreviewResult,
  QuestionsService,
} from './questions.service';

@Controller('study-packs/:studyPackId/concepts/:conceptId/questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post('preview')
  async previewQuestions(
    @Param('studyPackId')
    studyPackId: string,

    @Param('conceptId')
    conceptId: string,
  ): Promise<QuestionPreviewResult> {
    return this.questionsService.previewConceptQuestions(
      studyPackId,
      conceptId,
    );
  }

  @Post('generate')
  async generateQuestions(
    @Param('studyPackId')
    studyPackId: string,

    @Param('conceptId')
    conceptId: string,
  ): Promise<QuestionGenerationResult> {
    return this.questionsService.generateConceptQuestions(
      studyPackId,
      conceptId,
    );
  }
}
