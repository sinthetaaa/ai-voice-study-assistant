import { Controller, Param, Post } from '@nestjs/common';

import { AdaptiveDecisionResult, AdaptiveService } from './adaptive.service';

@Controller('adaptive')
export class AdaptiveController {
  constructor(private readonly adaptiveService: AdaptiveService) {}

  @Post('evaluations/:evaluationId/decide')
  async decideForEvaluation(
    @Param('evaluationId')
    evaluationId: string,
  ): Promise<AdaptiveDecisionResult> {
    return this.adaptiveService.decideForEvaluation(evaluationId);
  }
}
