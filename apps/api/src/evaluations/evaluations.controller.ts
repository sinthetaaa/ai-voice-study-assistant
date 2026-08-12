import { Body, Controller, Param, Post } from '@nestjs/common';

import {
  EvaluationsService,
  PersistedEvaluationResult,
} from './evaluations.service';

type EvaluateQuestionBody = {
  answerText?: unknown;
};

@Controller(
  'study-packs/:studyPackId/concepts/:conceptId/questions/:questionId',
)
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post('evaluate')
  async evaluateQuestion(
    @Param('studyPackId')
    studyPackId: string,

    @Param('conceptId')
    conceptId: string,

    @Param('questionId')
    questionId: string,

    @Body()
    body: EvaluateQuestionBody,
  ): Promise<PersistedEvaluationResult> {
    return this.evaluationsService.evaluateQuestion(
      studyPackId,
      conceptId,
      questionId,
      body?.answerText,
    );
  }
}
