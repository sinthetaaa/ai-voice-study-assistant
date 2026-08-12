import {
  BadGatewayException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch } from 'undici';

export type EvaluationCorrectness = 'CORRECT' | 'PARTIAL' | 'INCORRECT';

export type EvaluationQuestionType = 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

export type EvaluationQuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type EvaluationEvidenceChunk = {
  id: string;
  text: string;
  documentName?: string;
  unitLabel?: string;
};

export type EvaluateAnswerInput = {
  questionId: string;

  conceptName: string;

  questionType: EvaluationQuestionType;

  difficulty: EvaluationQuestionDifficulty;

  prompt: string;

  expectedAnswer: string;

  evidenceChunks: EvaluationEvidenceChunk[];

  answerText: string;
};

export type AnswerEvaluationResult = {
  questionId: string;

  score: number;

  correctness: EvaluationCorrectness;

  feedback: string;

  missingPoints: string[];

  misconceptions: string[];

  evaluatorProvider: string;

  evaluatorModel: string;

  evaluatorVersion: string;
};

type EvaluationApiResponse = {
  question_id?: unknown;

  score?: unknown;

  correctness?: unknown;

  feedback?: unknown;

  missing_points?: unknown;

  misconceptions?: unknown;

  evaluator_provider?: unknown;

  evaluator_model?: unknown;

  evaluator_version?: unknown;
};

@Injectable()
export class EvaluationAiClientService implements OnModuleDestroy {
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

  async evaluateAnswer(
    input: EvaluateAnswerInput,
  ): Promise<AnswerEvaluationResult> {
    try {
      const response = await fetch(
        `${this.aiServiceUrl}/evaluations/evaluate`,
        {
          method: 'POST',

          dispatcher: this.dispatcher,

          headers: {
            'content-type': 'application/json',
          },

          body: JSON.stringify({
            question_id: input.questionId,

            concept_name: input.conceptName,

            question_type: input.questionType,

            difficulty: input.difficulty,

            prompt: input.prompt,

            expected_answer: input.expectedAnswer,

            evidence_chunks: input.evidenceChunks.map((chunk) => ({
              id: chunk.id,

              text: chunk.text,

              document_name: chunk.documentName,

              unit_label: chunk.unitLabel,
            })),

            answer_text: input.answerText,
          }),
        },
      );

      const responseText = await response.text();

      if (!response.ok) {
        throw new BadGatewayException(
          'AI answer evaluation failed ' +
            `with HTTP ${response.status}: ` +
            responseText,
        );
      }

      let payload: EvaluationApiResponse;

      try {
        payload = JSON.parse(responseText) as EvaluationApiResponse;
      } catch {
        throw new BadGatewayException(
          'AI answer evaluation returned ' + 'invalid JSON',
        );
      }

      return this.validateResponse(input, payload);
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);

      throw new BadGatewayException(
        'AI answer evaluation service ' + `is unavailable: ${message}`,
      );
    }
  }

  private validateResponse(
    input: EvaluateAnswerInput,
    payload: EvaluationApiResponse,
  ): AnswerEvaluationResult {
    try {
      if (payload.question_id !== input.questionId) {
        throw new Error('AI evaluator returned an unexpected ' + 'question ID');
      }

      if (
        typeof payload.score !== 'number' ||
        !Number.isFinite(payload.score) ||
        payload.score < 0 ||
        payload.score > 1
      ) {
        throw new Error('AI evaluator returned an invalid score');
      }

      const expectedCorrectness = this.correctnessFromScore(payload.score);

      if (payload.correctness !== expectedCorrectness) {
        throw new Error(
          'AI evaluator returned correctness ' + 'inconsistent with its score',
        );
      }

      if (typeof payload.feedback !== 'string' || !payload.feedback.trim()) {
        throw new Error('AI evaluator returned invalid feedback');
      }

      const missingPoints = this.validateStringArray(
        payload.missing_points,
        'missing_points',
      );

      const misconceptions = this.validateStringArray(
        payload.misconceptions,
        'misconceptions',
      );

      const evaluatorProvider = this.requireNonEmptyString(
        payload.evaluator_provider,
        'evaluator_provider',
      );

      const evaluatorModel = this.requireNonEmptyString(
        payload.evaluator_model,
        'evaluator_model',
      );

      const evaluatorVersion = this.requireNonEmptyString(
        payload.evaluator_version,
        'evaluator_version',
      );

      return {
        questionId: input.questionId,

        score: payload.score,

        correctness: expectedCorrectness,

        feedback: payload.feedback.trim(),

        missingPoints,

        misconceptions,

        evaluatorProvider,

        evaluatorModel,

        evaluatorVersion,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new BadGatewayException(
        'AI evaluator returned an invalid ' + `response: ${message}`,
      );
    }
  }

  private correctnessFromScore(score: number): EvaluationCorrectness {
    if (score >= 0.85) {
      return 'CORRECT';
    }

    if (score >= 0.45) {
      return 'PARTIAL';
    }

    return 'INCORRECT';
  }

  private validateStringArray(value: unknown, fieldName: string): string[] {
    if (!Array.isArray(value)) {
      throw new Error(`AI evaluator returned invalid ${fieldName}`);
    }

    const result: string[] = [];

    for (const item of value) {
      if (typeof item !== 'string' || !item.trim()) {
        throw new Error(`AI evaluator returned invalid ${fieldName}`);
      }

      result.push(item.trim());
    }

    return result;
  }

  private requireNonEmptyString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`AI evaluator returned invalid ${fieldName}`);
    }

    return value.trim();
  }
}
