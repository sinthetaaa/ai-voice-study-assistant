import { Controller, Param, Post } from '@nestjs/common';

import {
  StartStudySessionResult,
  StudySessionsService,
} from './study-sessions.service';

@Controller('study-packs/:studyPackId/sessions')
export class StudySessionsController {
  constructor(private readonly studySessionsService: StudySessionsService) {}

  @Post()
  async startSession(
    @Param('studyPackId')
    studyPackId: string,
  ): Promise<StartStudySessionResult> {
    return this.studySessionsService.startSession(studyPackId);
  }
}
