import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import {
  StudyPackReadinessResult,
  StudyPackReadinessService,
} from './study-pack-readiness.service';
import {
  StartStudySessionResult,
  StudySessionAnswerResult,
  StudySessionStateResult,
  StudySessionsService,
} from './study-sessions.service';

type AnswerStudySessionBody = {
  answerText?: unknown;
};

@Controller()
export class StudySessionsController {
  constructor(
    private readonly studySessionsService: StudySessionsService,

    private readonly studyPackReadinessService: StudyPackReadinessService,
  ) {}

  @Post('study-packs/:studyPackId/sessions')
  async startSession(
    @Param('studyPackId')
    studyPackId: string,
  ): Promise<StartStudySessionResult> {
    return this.studySessionsService.startSession(studyPackId);
  }

  @Get('study-packs/:studyPackId/readiness')
  async getStudyPackReadiness(
    @Param('studyPackId')
    studyPackId: string,
  ): Promise<StudyPackReadinessResult> {
    return this.studyPackReadinessService.getReadiness(studyPackId);
  }

  @Post('study-sessions/:sessionId/answer')
  async answerSession(
    @Param('sessionId')
    sessionId: string,

    @Body()
    body: AnswerStudySessionBody,
  ): Promise<StudySessionAnswerResult> {
    return this.studySessionsService.answerSession(sessionId, body?.answerText);
  }

  @Get('study-sessions/:sessionId')
  async getSession(
    @Param('sessionId')
    sessionId: string,
  ): Promise<StudySessionStateResult> {
    return this.studySessionsService.getSessionState(sessionId);
  }
}
