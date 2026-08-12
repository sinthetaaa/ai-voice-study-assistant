import { Controller, Get, Param, Post } from '@nestjs/common';

import { MasteryApplicationResult, MasteryService } from './mastery.service';

@Controller()
export class MasteryController {
  constructor(private readonly masteryService: MasteryService) {}

  @Post('mastery/evaluations/:evaluationId/apply')
  async applyEvaluation(
    @Param('evaluationId')
    evaluationId: string,
  ): Promise<MasteryApplicationResult> {
    return this.masteryService.applyEvaluation(evaluationId);
  }

  @Get('study-packs/:studyPackId/concepts/:conceptId/mastery')
  async getConceptMastery(
    @Param('studyPackId')
    studyPackId: string,

    @Param('conceptId')
    conceptId: string,
  ) {
    return this.masteryService.getConceptMastery(studyPackId, conceptId);
  }
}
