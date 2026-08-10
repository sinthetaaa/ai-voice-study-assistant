import { Body, Controller, Param, Post } from '@nestjs/common';

import { SearchStudyPackDto } from './dto/search-study-pack.dto';
import { RetrievalService } from './retrieval.service';

@Controller('study-packs/:studyPackId/search')
export class RetrievalController {
  constructor(private readonly retrievalService: RetrievalService) {}

  @Post()
  search(
    @Param('studyPackId')
    studyPackId: string,

    @Body()
    body: SearchStudyPackDto,
  ) {
    return this.retrievalService.searchStudyPack(
      studyPackId,
      body.query,
      body.limit,
    );
  }
}
