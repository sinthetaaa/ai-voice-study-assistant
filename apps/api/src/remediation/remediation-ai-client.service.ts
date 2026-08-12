import {
  BadGatewayException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch } from 'undici';

export type RemediationKind =
  'MISCONCEPTION' | 'MISSING_POINTS' | 'GENERAL_GAP';

export type RemediationQuestionType =
  'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

export type RemediationCorrectness = 'CORRECT' | 'PARTIAL' | 'INCORRECT';

export type RemediationEvidenceChunk = {
  id: string;

  text: string;

  documentName?: string;

  unitLabel?: string;
};

export type GenerateRemediationInput = {
  evaluationId: string;

  conceptName: string;

  questionId: string;

  questionType: RemediationQuestionType;

  questionPrompt: string;

  expectedAnswer: string;

  learnerAnswer: string;

  correctness: RemediationCorrectness;

  evaluationFeedback: string;

  missingPoints: string[];

  misconceptions: string[];

  remediationKind: RemediationKind;

  focusPoints: string[];

  evidenceChunks: RemediationEvidenceChunk[];
};

export type GeneratedRemediation = {
  evaluationId: string;

  remediationKind: RemediationKind;

  explanation: string;

  keyTakeaways: string[];

  evidenceChunkIds: string[];

  generatorProvider: string;

  generatorModel: string;

  generatorVersion: string;
};

type RemediationApiResponse = {
  evaluation_id?: unknown;

  remediation_kind?: unknown;

  explanation?: unknown;

  key_takeaways?: unknown;

  evidence_chunk_ids?: unknown;

  generator_provider?: unknown;

  generator_model?: unknown;

  generator_version?: unknown;
};

@Injectable()
export class RemediationAiClientService implements OnModuleDestroy {
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

      headersTimeout: 1_800_000,

      bodyTimeout: 1_800_000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.dispatcher.close();
  }

  async generateRemediation(
    input: GenerateRemediationInput,
  ): Promise<GeneratedRemediation> {
    try {
      const response = await fetch(
        `${this.aiServiceUrl}/remediation/generate`,
        {
          method: 'POST',

          dispatcher: this.dispatcher,

          headers: {
            'content-type': 'application/json',
          },

          body: JSON.stringify({
            evaluation_id: input.evaluationId,

            concept_name: input.conceptName,

            question_id: input.questionId,

            question_type: input.questionType,

            question_prompt: input.questionPrompt,

            expected_answer: input.expectedAnswer,

            learner_answer: input.learnerAnswer,

            correctness: input.correctness,

            evaluation_feedback: input.evaluationFeedback,

            missing_points: input.missingPoints,

            misconceptions: input.misconceptions,

            remediation_kind: input.remediationKind,

            focus_points: input.focusPoints,

            evidence_chunks: input.evidenceChunks.map((chunk) => ({
              id: chunk.id,

              text: chunk.text,

              document_name: chunk.documentName,

              unit_label: chunk.unitLabel,
            })),
          }),
        },
      );

      const responseText = await response.text();

      if (!response.ok) {
        throw new BadGatewayException(
          'AI remediation generation failed ' +
            `with HTTP ${response.status}: ` +
            responseText,
        );
      }

      let payload: RemediationApiResponse;

      try {
        payload = JSON.parse(responseText) as RemediationApiResponse;
      } catch {
        throw new BadGatewayException(
          'AI remediation generation ' + 'returned invalid JSON',
        );
      }

      return this.validateResponse(input, payload);
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);

      throw new BadGatewayException(
        'AI remediation service ' + `is unavailable: ${message}`,
      );
    }
  }

  private validateResponse(
    input: GenerateRemediationInput,
    payload: RemediationApiResponse,
  ): GeneratedRemediation {
    try {
      if (payload.evaluation_id !== input.evaluationId) {
        throw new Error(
          'AI remediation returned an ' + 'unexpected evaluation ID',
        );
      }

      if (payload.remediation_kind !== input.remediationKind) {
        throw new Error(
          'AI remediation returned an ' + 'unexpected remediation kind',
        );
      }

      const explanation = this.requireNonEmptyString(
        payload.explanation,
        'explanation',
      );

      const keyTakeaways = this.validateStringArray(
        payload.key_takeaways,
        'key_takeaways',
        true,
      );

      const evidenceChunkIds = this.validateStringArray(
        payload.evidence_chunk_ids,
        'evidence_chunk_ids',
        true,
      );

      const allowedChunkIds = new Set(
        input.evidenceChunks.map((chunk) => chunk.id),
      );

      for (const chunkId of evidenceChunkIds) {
        if (!allowedChunkIds.has(chunkId)) {
          throw new Error(
            'AI remediation cited an ' +
              'evidence chunk that was ' +
              `not supplied: ${chunkId}`,
          );
        }
      }

      const generatorProvider = this.requireNonEmptyString(
        payload.generator_provider,
        'generator_provider',
      );

      const generatorModel = this.requireNonEmptyString(
        payload.generator_model,
        'generator_model',
      );

      const generatorVersion = this.requireNonEmptyString(
        payload.generator_version,
        'generator_version',
      );

      return {
        evaluationId: input.evaluationId,

        remediationKind: input.remediationKind,

        explanation,

        keyTakeaways,

        evidenceChunkIds,

        generatorProvider,

        generatorModel,

        generatorVersion,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new BadGatewayException(
        'AI remediation returned an ' + `invalid response: ${message}`,
      );
    }
  }

  private requireNonEmptyString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${fieldName} must be a ` + 'non-empty string');
    }

    return value.trim();
  }

  private validateStringArray(
    value: unknown,
    fieldName: string,
    requireNonEmpty: boolean = false,
  ): string[] {
    if (!Array.isArray(value)) {
      throw new Error(`${fieldName} must be an array`);
    }

    const result: string[] = [];

    const seen = new Set<string>();

    for (const item of value) {
      if (typeof item !== 'string' || !item.trim()) {
        throw new Error(`${fieldName} contains an ` + 'invalid string');
      }

      const cleaned = item.trim();

      if (seen.has(cleaned)) {
        continue;
      }

      seen.add(cleaned);
      result.push(cleaned);
    }

    if (requireNonEmpty && result.length === 0) {
      throw new Error(`${fieldName} must contain ` + 'at least one value');
    }

    return result;
  }
}
