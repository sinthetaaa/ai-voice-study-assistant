import { BadRequestException, Injectable, Logger } from '@nestjs/common';

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

@Injectable()
export class StudySessionVoiceService {
  private readonly logger = new Logger(StudySessionVoiceService.name);

  constructor(
    private readonly studySessionsService: StudySessionsService,

    private readonly speechAiClient: SpeechAiClientService,
  ) {}

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

    /*
     * STT happens before any learner-state
     * mutation.
     *
     * If transcription fails, answerSession()
     * is never entered.
     */
    const transcription = await this.speechAiClient.transcribeAudio({
      audio: audio.buffer,

      filename: audio.originalname || 'answer.wav',

      mimeType: audio.mimetype || 'audio/wav',
    });

    /*
     * Reuse the proven text-answer path.
     *
     * This remains the ONLY place where
     * evaluation, mastery, adaptation,
     * remediation and session progression
     * are applied.
     */
    const answer = await this.studySessionsService.answerSession(
      sessionId,
      transcription.text,
    );

    const spokenResponseText = composeStudySessionVoiceResponse(answer);

    /*
     * IMPORTANT:
     *
     * At this point the learner answer may
     * already be persisted.
     *
     * A TTS failure must therefore NOT turn
     * this request into an HTTP failure that
     * encourages the client to resubmit the
     * learner answer.
     */
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
