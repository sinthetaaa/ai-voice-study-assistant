import { Controller, Param, Post } from '@nestjs/common';

import {
  LearningLoopNextStepResult,
  LearningLoopService,
} from './learning-loop.service';

@Controller(
  'study-packs/:studyPackId/' + 'concepts/:conceptId/' + 'evaluations',
)
export class LearningLoopController {
  constructor(private readonly learningLoopService: LearningLoopService) {}

  @Post(':evaluationId/next-step')
  async getNextStep(
    @Param('studyPackId')
    studyPackId: string,

    @Param('conceptId')
    conceptId: string,

    @Param('evaluationId')
    evaluationId: string,
  ): Promise<LearningLoopNextStepResult> {
    return this.learningLoopService.getNextStep(
      studyPackId,
      conceptId,
      evaluationId,
    );
  }
}
