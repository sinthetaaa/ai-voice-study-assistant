import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { AdaptiveService } from '../adaptive/adaptive.service';
import {
  AdaptiveReasonCode,
  AdaptiveQuestionType,
} from '../adaptive/adaptive-policy';
import { PrismaService } from '../prisma/prisma.service';

import {
  GeneratedRemediation,
  RemediationAiClientService,
  RemediationCorrectness,
  RemediationEvidenceChunk,
  RemediationKind,
  RemediationQuestionType,
} from './remediation-ai-client.service';

export type RemediationResult = {
  studyPackId: string;

  conceptId: string;

  conceptName: string;

  evaluationId: string;

  questionId: string;

  questionType: RemediationQuestionType;

  correctness: RemediationCorrectness;

  decisionVersion: string;

  adaptiveReasonCode: AdaptiveReasonCode;

  remediationKind: RemediationKind;

  focusPoints: string[];

  explanation: string;

  keyTakeaways: string[];

  evidenceChunkIds: string[];

  nextQuestionType: AdaptiveQuestionType | null;

  retestQuestionType: AdaptiveQuestionType | null;

  generatorProvider: string;

  generatorModel: string;

  generatorVersion: string;
};

@Injectable()
export class RemediationService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly adaptiveService: AdaptiveService,

    private readonly remediationAiClient: RemediationAiClientService,
  ) {}

  async generateForEvaluation(
    studyPackId: string,
    conceptId: string,
    evaluationId: string,
  ): Promise<RemediationResult> {
    /*
     * First verify that this exact evaluation
     * belongs to the requested concept and
     * Study Pack.
     *
     * We load immutable QuestionAttempt
     * snapshots here because remediation must
     * reflect what the learner actually saw,
     * not whatever the live Question row may
     * contain after future regeneration.
     */
    const evaluation = await this.prisma.answerEvaluation.findFirst({
      where: {
        id: evaluationId,

        attempt: {
          question: {
            conceptId,

            concept: {
              studyPackId,
            },
          },
        },
      },

      select: {
        id: true,

        correctness: true,

        feedback: true,

        missingPoints: true,

        misconceptions: true,

        attempt: {
          select: {
            answerText: true,

            promptSnapshot: true,

            expectedAnswerSnapshot: true,

            questionTypeSnapshot: true,

            evidenceChunkIds: true,

            question: {
              select: {
                id: true,

                concept: {
                  select: {
                    id: true,

                    name: true,

                    studyPackId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!evaluation) {
      throw new NotFoundException(
        `AnswerEvaluation ${evaluationId} ` +
          `was not found for concept ` +
          `${conceptId} in Study Pack ` +
          studyPackId,
      );
    }

    /*
     * Ask the deterministic Adaptive Engine
     * what should happen next.
     *
     * This also ensures mastery has been
     * applied idempotently for the evaluation.
     */
    const adaptive =
      await this.adaptiveService.decideForEvaluation(evaluationId);

    if (adaptive.conceptId !== conceptId) {
      throw new InternalServerErrorException(
        'Adaptive decision concept does ' + 'not match the requested concept',
      );
    }

    if (adaptive.decision.action !== 'REMEDIATE') {
      throw new BadRequestException(
        `Evaluation ${evaluationId} ` +
          'does not require remediation. ' +
          `Adaptive action is ` +
          `${adaptive.decision.action}.`,
      );
    }

    const remediationDecision = adaptive.decision.remediation;

    if (!remediationDecision) {
      throw new InternalServerErrorException(
        'Adaptive policy returned ' +
          'REMEDIATE without remediation ' +
          'details',
      );
    }

    /*
     * Use the immutable evidence chunk IDs
     * stored on the QuestionAttempt.
     *
     * We deliberately DO NOT reconstruct
     * evidence from the live QuestionSource
     * relation because question regeneration
     * may change those sources later.
     */
    const evidenceIds = evaluation.attempt.evidenceChunkIds;

    if (evidenceIds.length === 0) {
      throw new BadRequestException(
        `Evaluation ${evaluationId} ` +
          'has no historical evidence ' +
          'snapshot available',
      );
    }

    const chunks = await this.prisma.documentChunk.findMany({
      where: {
        id: {
          in: evidenceIds,
        },
      },

      select: {
        id: true,

        text: true,

        unit: {
          select: {
            label: true,

            document: {
              select: {
                originalName: true,
              },
            },
          },
        },
      },
    });

    const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    const evidenceChunks: RemediationEvidenceChunk[] = [];

    for (const chunkId of evidenceIds) {
      const chunk = chunkMap.get(chunkId);

      if (!chunk) {
        throw new BadRequestException(
          `Historical evidence chunk ` +
            `${chunkId} for evaluation ` +
            `${evaluationId} no longer exists`,
        );
      }

      evidenceChunks.push({
        id: chunk.id,

        text: chunk.text,

        documentName: chunk.unit.document.originalName,

        unitLabel: chunk.unit.label,
      });
    }

    const generated: GeneratedRemediation =
      await this.remediationAiClient.generateRemediation({
        evaluationId: evaluation.id,

        conceptName: evaluation.attempt.question.concept.name,

        questionId: evaluation.attempt.question.id,

        questionType: evaluation.attempt.questionTypeSnapshot,

        questionPrompt: evaluation.attempt.promptSnapshot,

        expectedAnswer: evaluation.attempt.expectedAnswerSnapshot,

        learnerAnswer: evaluation.attempt.answerText,

        correctness: evaluation.correctness,

        evaluationFeedback: evaluation.feedback,

        missingPoints: evaluation.missingPoints,

        misconceptions: evaluation.misconceptions,

        remediationKind: remediationDecision.kind,

        focusPoints: remediationDecision.focusPoints,

        evidenceChunks,
      });

    return {
      studyPackId,

      conceptId,

      conceptName: evaluation.attempt.question.concept.name,

      evaluationId: evaluation.id,

      questionId: evaluation.attempt.question.id,

      questionType: evaluation.attempt.questionTypeSnapshot,

      correctness: evaluation.correctness,

      decisionVersion: adaptive.decisionVersion,

      adaptiveReasonCode: adaptive.decision.reasonCode,

      remediationKind: generated.remediationKind,

      focusPoints: remediationDecision.focusPoints,

      explanation: generated.explanation,

      keyTakeaways: generated.keyTakeaways,

      evidenceChunkIds: generated.evidenceChunkIds,

      nextQuestionType: adaptive.decision.nextQuestionType,

      retestQuestionType: adaptive.decision.retestQuestionType,

      generatorProvider: generated.generatorProvider,

      generatorModel: generated.generatorModel,

      generatorVersion: generated.generatorVersion,
    };
  }
}
