import { Controller, Param, Post } from '@nestjs/common';

import { RequireResourceOwnership } from '../auth/resource-ownership.decorator';

import { RemediationResult, RemediationService } from './remediation.service';

@RequireResourceOwnership('STUDY_PACK', 'studyPackId')
@Controller(
  'study-packs/:studyPackId/' + 'concepts/:conceptId/' + 'evaluations',
)
export class RemediationController {
  constructor(private readonly remediationService: RemediationService) {}

  @Post(':evaluationId/remediation')
  async generateRemediation(
    @Param('studyPackId')
    studyPackId: string,

    @Param('conceptId')
    conceptId: string,

    @Param('evaluationId')
    evaluationId: string,
  ): Promise<RemediationResult> {
    return this.remediationService.generateForEvaluation(
      studyPackId,
      conceptId,
      evaluationId,
    );
  }
}
