import { Controller, Param, Post, Query } from '@nestjs/common';

import { ConceptPreviewResult, ConceptsService } from './concepts.service';

@Controller('study-packs/:studyPackId/concepts')
export class ConceptsController {
  constructor(private readonly conceptsService: ConceptsService) {}

  @Post('preview')
  async previewConcepts(
    @Param('studyPackId')
    studyPackId: string,

    @Query('documentId')
    documentId?: string,
  ): Promise<ConceptPreviewResult> {
    return this.conceptsService.previewStudyPackConcepts(
      studyPackId,
      documentId,
    );
  }
}
