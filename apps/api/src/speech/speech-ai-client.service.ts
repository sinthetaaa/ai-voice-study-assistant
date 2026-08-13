import {
  BadGatewayException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch, FormData } from 'undici';

export type SpeechTranscriptionResult = {
  text: string;

  model: string;

  durationSeconds: number;
};

export type SpeechSynthesisResult = {
  audio: Buffer;

  mimeType: 'audio/wav';

  model: string | null;

  speaker: string | null;

  sampleRate: number | null;

  durationSeconds: number | null;
};

type TranscriptionApiResponse = {
  text?: unknown;

  model?: unknown;

  duration_seconds?: unknown;
};

@Injectable()
export class SpeechAiClientService implements OnModuleDestroy {
  private readonly aiServiceUrl: string;

  private readonly dispatcher: Agent;

  constructor(private readonly configService: ConfigService) {
    this.aiServiceUrl = (
      this.configService.get<string>('AI_SERVICE_URL') ??
      'http://localhost:8000'
    ).replace(/\/+$/, '');

    this.dispatcher = new Agent({
      connect: {
        timeout: 10_000,
      },

      /*
       * Local speech models can need extra
       * startup time on the first request.
       */
      headersTimeout: 600_000,

      bodyTimeout: 600_000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.dispatcher.close();
  }

  async transcribeAudio(input: {
    audio: Buffer;

    filename: string;

    mimeType: string;
  }): Promise<SpeechTranscriptionResult> {
    try {
      const formData = new FormData();

      const audioBlob = new Blob([Uint8Array.from(input.audio)], {
        type: input.mimeType || 'audio/wav',
      });

      formData.append('audio', audioBlob, input.filename || 'answer.wav');

      const response = await fetch(`${this.aiServiceUrl}/speech/transcribe`, {
        method: 'POST',

        dispatcher: this.dispatcher,

        body: formData,
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new BadGatewayException(
          'AI speech transcription failed ' +
            `with HTTP ${response.status}: ` +
            responseText,
        );
      }

      let payload: TranscriptionApiResponse | undefined;

      try {
        payload = JSON.parse(responseText) as TranscriptionApiResponse;
      } catch {
        throw new BadGatewayException(
          'AI speech transcription ' + 'returned invalid JSON',
        );
      }

      if (typeof payload.text !== 'string' || !payload.text.trim()) {
        throw new BadGatewayException(
          'AI speech transcription ' + 'returned invalid text',
        );
      }

      if (typeof payload.model !== 'string' || !payload.model.trim()) {
        throw new BadGatewayException(
          'AI speech transcription ' + 'returned invalid model metadata',
        );
      }

      if (
        typeof payload.duration_seconds !== 'number' ||
        !Number.isFinite(payload.duration_seconds) ||
        payload.duration_seconds <= 0
      ) {
        throw new BadGatewayException(
          'AI speech transcription ' + 'returned invalid duration',
        );
      }

      return {
        text: payload.text.trim(),

        model: payload.model.trim(),

        durationSeconds: payload.duration_seconds,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);

      throw new BadGatewayException(
        'AI speech transcription service ' + `is unavailable: ${message}`,
      );
    }
  }

  async synthesizeText(text: string): Promise<SpeechSynthesisResult> {
    try {
      const response = await fetch(`${this.aiServiceUrl}/speech/synthesize`, {
        method: 'POST',

        dispatcher: this.dispatcher,

        headers: {
          'content-type': 'application/json',
        },

        body: JSON.stringify({
          text,
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();

        throw new BadGatewayException(
          'AI speech synthesis failed ' +
            `with HTTP ${response.status}: ` +
            responseText,
        );
      }

      const contentType = response.headers.get('content-type');

      if (!contentType?.toLowerCase().startsWith('audio/wav')) {
        throw new BadGatewayException(
          'AI speech synthesis returned ' + 'an unexpected content type',
        );
      }

      const arrayBuffer = await response.arrayBuffer();

      const audio = Buffer.from(arrayBuffer);

      if (audio.length <= 44) {
        throw new BadGatewayException(
          'AI speech synthesis returned ' + 'empty or invalid WAV audio',
        );
      }

      return {
        audio,

        mimeType: 'audio/wav',

        model: response.headers.get('x-tts-model'),

        speaker: response.headers.get('x-tts-speaker'),

        sampleRate: this.parsePositiveNumberHeader(
          response.headers.get('x-audio-sample-rate'),
        ),

        durationSeconds: this.parsePositiveNumberHeader(
          response.headers.get('x-audio-duration-seconds'),
        ),
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);

      throw new BadGatewayException(
        'AI speech synthesis service ' + `is unavailable: ${message}`,
      );
    }
  }

  private parsePositiveNumberHeader(rawValue: string | null): number | null {
    if (!rawValue) {
      return null;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    return value;
  }
}
