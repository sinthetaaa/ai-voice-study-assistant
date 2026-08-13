import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import {
  StudyPackReadinessResult,
  StudyPackReadinessService,
} from './study-pack-readiness.service';

import {
  StudySessionQuestionSpeechResult,
  StudySessionVoiceAnswerResult,
  StudySessionVoiceService,
} from './study-session-voice.service';

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

    private readonly studySessionVoiceService: StudySessionVoiceService,
  ) {}

  @Post('study-packs/:studyPackId/sessions')
  async startSession(
    @Param('studyPackId')
    studyPackId: string,
  ): Promise<StartStudySessionResult> {
    return this.studySessionsService.startSession(studyPackId);
  }

  @Post('study-packs/:studyPackId/review-sessions')
  async startReviewSession(
    @Param('studyPackId')
    studyPackId: string,
  ): Promise<StudySessionStateResult> {
    return this.studySessionsService.startReviewSession(studyPackId);
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

  @Post('study-sessions/:sessionId/question-speech')
  async speakCurrentQuestion(
    @Param('sessionId')
    sessionId: string,
  ): Promise<StudySessionQuestionSpeechResult> {
    return this.studySessionVoiceService.synthesizeCurrentQuestion(sessionId);
  }

  @Post('study-sessions/:sessionId/voice-answer')
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  async answerSessionByVoice(
    @Param('sessionId')
    sessionId: string,

    @UploadedFile()
    audio: Express.Multer.File | undefined,
  ): Promise<StudySessionVoiceAnswerResult> {
    return this.studySessionVoiceService.answerSession(sessionId, audio);
  }

  @Get('study-sessions/:sessionId')
  async getSession(
    @Param('sessionId')
    sessionId: string,
  ): Promise<StudySessionStateResult> {
    return this.studySessionsService.getSessionState(sessionId);
  }
}
