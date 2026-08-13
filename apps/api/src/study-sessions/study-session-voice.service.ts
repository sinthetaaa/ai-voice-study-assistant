import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  SpeechAiClientService,
  SpeechTranscriptionResult,
} from '../speech/speech-ai-client.service';

import { composeStudySessionVoiceResponse } from './study-session-voice-response';

import {
  StudySessionAnswerResult,
  StudySessionsService,
} from './study-sessions.service';

export type VoiceSynthesisState =
  | {
      status: 'READY';

      mimeType: 'audio/wav';

      audioBase64: string;

      model: string | null;

      speaker: string | null;

      sampleRate: number | null;

      durationSeconds: number | null;
    }
  | {
      status: 'FAILED';

      mimeType: null;

      audioBase64: null;

      model: null;

      speaker: null;

      sampleRate: null;

      durationSeconds: null;
    };

export type StudySessionVoiceAnswerResult = {
  transcription: SpeechTranscriptionResult;

  answer: StudySessionAnswerResult;

  spokenResponseText: string;

  speech: VoiceSynthesisState;
};

export type StudySessionQuestionSpeechResult = {
  sessionId: string;

  questionId: string;

  text: string;

  speech: VoiceSynthesisState;
};

@Injectable()
export class StudySessionVoiceService {
  private readonly logger = new Logger(StudySessionVoiceService.name);

  constructor(
    private readonly studySessionsService: StudySessionsService,

    private readonly speechAiClient: SpeechAiClientService,
  ) {}

  async synthesizeCurrentQuestion(
    sessionId: string,
  ): Promise<StudySessionQuestionSpeechResult> {
    const session = await this.studySessionsService.getSessionState(sessionId);

    if (session.status !== 'ACTIVE') {
      throw new BadRequestException(`StudySession ${sessionId} is not active.`);
    }

    if (!session.currentQuestion) {
      throw new NotFoundException(
        `StudySession ${sessionId} has no current question.`,
      );
    }

    const text = session.currentQuestion.prompt;

    try {
      const synthesized = await this.speechAiClient.synthesizeText(text);

      return {
        sessionId,

        questionId: session.currentQuestion.id,

        text,

        speech: {
          status: 'READY',

          mimeType: synthesized.mimeType,

          audioBase64: synthesized.audio.toString('base64'),

          model: synthesized.model,

          speaker: synthesized.speaker,

          sampleRate: synthesized.sampleRate,

          durationSeconds: synthesized.durationSeconds,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Question TTS failed for session ${sessionId}. Reason: ${message}`,
      );

      return {
        sessionId,

        questionId: session.currentQuestion.id,

        text,

        speech: {
          status: 'FAILED',

          mimeType: null,

          audioBase64: null,

          model: null,

          speaker: null,

          sampleRate: null,

          durationSeconds: null,
        },
      };
    }
  }

  async answerSession(
    sessionId: string,
    audio: Express.Multer.File | undefined,
  ): Promise<StudySessionVoiceAnswerResult> {
    if (!audio) {
      throw new BadRequestException('A WAV audio file is required.');
    }

    if (!audio.buffer || audio.buffer.length === 0) {
      throw new BadRequestException('Uploaded audio is empty.');
    }

    const transcription = await this.speechAiClient.transcribeAudio({
      audio: audio.buffer,

      filename: audio.originalname || 'answer.wav',

      mimeType: audio.mimetype || 'audio/wav',
    });

    const answer = await this.studySessionsService.answerSession(
      sessionId,
      transcription.text,
    );

    const spokenResponseText = composeStudySessionVoiceResponse(answer);

    try {
      const synthesized =
        await this.speechAiClient.synthesizeText(spokenResponseText);

      return {
        transcription,

        answer,

        spokenResponseText,

        speech: {
          status: 'READY',

          mimeType: synthesized.mimeType,

          audioBase64: synthesized.audio.toString('base64'),

          model: synthesized.model,

          speaker: synthesized.speaker,

          sampleRate: synthesized.sampleRate,

          durationSeconds: synthesized.durationSeconds,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        'Voice answer was persisted, but ' +
          `TTS synthesis failed for session ` +
          `${sessionId}. ` +
          `Reason: ${message}`,
      );

      return {
        transcription,

        answer,

        spokenResponseText,

        speech: {
          status: 'FAILED',

          mimeType: null,

          audioBase64: null,

          model: null,

          speaker: null,

          sampleRate: null,

          durationSeconds: null,
        },
      };
    }
  }
}
