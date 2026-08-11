import { Controller, Param, Post, Query } from '@nestjs/common';

import {
  ConceptGenerationResult,
  ConceptPreviewResult,
  ConceptsService,
} from './concepts.service';

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

  @Post('generate')
  async generateConcepts(
    @Param('studyPackId')
    studyPackId: string,

    @Query('documentId')
    documentId?: string,
  ): Promise<ConceptGenerationResult> {
    return this.conceptsService.generateStudyPackConcepts(
      studyPackId,
      documentId,
    );
  }
}
