import { Controller, Get, Param, Post, Query } from '@nestjs/common';

import { RequireResourceOwnership } from '../auth/resource-ownership.decorator';

import {
  ConceptGenerationResult,
  ConceptHierarchyGenerationResult,
  ConceptPreviewResult,
  ConceptsService,
} from './concepts.service';

@RequireResourceOwnership('STUDY_PACK', 'studyPackId')
@Controller('study-packs/:studyPackId/concepts')
export class ConceptsController {
  constructor(private readonly conceptsService: ConceptsService) {}

  @Get('graph')
  async getConceptGraph(
    @Param('studyPackId')
    studyPackId: string,
  ) {
    return this.conceptsService.getStudyPackConceptGraph(studyPackId);
  }

  @Post('hierarchy/generate')
  async generateConceptHierarchy(
    @Param('studyPackId')
    studyPackId: string,
  ): Promise<ConceptHierarchyGenerationResult | null> {
    return this.conceptsService.tryGenerateStudyPackHierarchy(studyPackId);
  }

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
