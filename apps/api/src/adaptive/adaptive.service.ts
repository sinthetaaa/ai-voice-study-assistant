import { Injectable, NotFoundException } from '@nestjs/common';

import { MasteryService } from '../mastery/mastery.service';
import { PrismaService } from '../prisma/prisma.service';

import {
  ADAPTIVE_POLICY_VERSION,
  AdaptivePolicyDecision,
  decideAdaptiveAction,
} from './adaptive-policy';

export type AdaptiveMasteryOverride = {
  masteryAfter: number;

  evidenceWeightAfter: number;
};

export type AdaptiveDecisionResult = {
  decisionVersion: string;

  evaluationId: string;

  conceptId: string;
  conceptName: string;

  questionId: string;

  questionType: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

  score: number;

  correctness: 'CORRECT' | 'PARTIAL' | 'INCORRECT';

  masteryAfter: number;

  evidenceWeightAfter: number;

  decision: AdaptivePolicyDecision;
};

@Injectable()
export class AdaptiveService {
  /*
   * Concept mastery starts from Beta(1, 1).
   *
   * Therefore:
   *
   * alpha + beta = 2
   *
   * before any learner evidence has been applied.
   *
   * Since every mastery update adds exactly its
   * evidence weight across alpha and beta:
   *
   * evidenceWeight =
   * alpha + beta - 2
   *
   * This allows us to reconstruct the amount of
   * accumulated evidence at the exact point of a
   * historical MasteryEvent.
   */
  private static readonly INITIAL_BETA_TOTAL = 2.0;

  constructor(
    private readonly prisma: PrismaService,

    private readonly masteryService: MasteryService,
  ) {}

  async decideForEvaluation(
    evaluationId: string,
    masteryOverride?: AdaptiveMasteryOverride,
  ): Promise<AdaptiveDecisionResult> {
    /*
     * Ensure this evaluation has already affected
     * mastery.
     *
     * MasteryService.applyEvaluation() is
     * idempotent by evaluationId.
     *
     * Therefore this is safe whether:
     *
     * - mastery was already applied automatically
     *   during answer evaluation
     *
     * - mastery was applied manually earlier
     *
     * - mastery has not yet been applied
     */
    await this.masteryService.applyEvaluation(evaluationId);

    /*
     * Load the immutable learner evaluation,
     * QuestionAttempt snapshot, and the exact
     * MasteryEvent created for this evaluation.
     *
     * IMPORTANT:
     *
     * We intentionally use masteryEvent rather
     * than ConceptMastery.
     *
     * ConceptMastery represents the learner's
     * CURRENT state.
     *
     * masteryEvent represents the learner's state
     * immediately AFTER this specific historical
     * evaluation.
     *
     * That makes adaptive decisions historically
     * reproducible.
     */
    const evaluation = await this.prisma.answerEvaluation.findUnique({
      where: {
        id: evaluationId,
      },

      select: {
        id: true,

        score: true,

        correctness: true,

        missingPoints: true,

        misconceptions: true,

        masteryEvent: {
          select: {
            alphaAfter: true,

            betaAfter: true,

            masteryAfter: true,
          },
        },

        attempt: {
          select: {
            questionTypeSnapshot: true,

            question: {
              select: {
                id: true,

                concept: {
                  select: {
                    id: true,

                    name: true,
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
        `AnswerEvaluation ${evaluationId} ` + 'was not found',
      );
    }

    /*
     * applyEvaluation() above should guarantee
     * that this relation exists.
     *
     * If it does not, something is inconsistent
     * between mastery persistence and adaptive
     * processing, so fail loudly.
     */
    if (!evaluation.masteryEvent) {
      throw new Error(
        `AnswerEvaluation ${evaluationId} ` +
          'has no MasteryEvent after mastery ' +
          'application',
      );
    }

    const masteryEvent = evaluation.masteryEvent;

    /*
     * Reconstruct how much weighted evidence had
     * accumulated immediately after THIS
     * evaluation.
     *
     * Starting distribution:
     *
     * alpha = 1
     * beta  = 1
     *
     * Therefore:
     *
     * evidenceWeightAfter =
     * alphaAfter + betaAfter - 2
     */
    const rawEvidenceWeightAfter =
      masteryEvent.alphaAfter +
      masteryEvent.betaAfter -
      AdaptiveService.INITIAL_BETA_TOTAL;

    /*
     * Floating-point arithmetic can theoretically
     * produce a microscopic negative number near
     * zero, so clamp it defensively.
     */
    const lifetimeEvidenceWeightAfter = Math.max(0, rawEvidenceWeightAfter);

    /*
     * Normal StudySession answers use SESSION mastery for
     * adaptive decisions.
     *
     * Stateless/manual learning-loop calls continue using
     * the lifetime MasteryEvent state.
     */
    const masteryAfter =
      masteryOverride?.masteryAfter ?? masteryEvent.masteryAfter;

    const evidenceWeightAfter =
      masteryOverride?.evidenceWeightAfter ?? lifetimeEvidenceWeightAfter;

    /*
     * The policy itself is pure and deterministic.
     *
     * No LLM decides the next learning action.
     *
     * The LLM already diagnosed:
     *
     * - correctness
     * - missing points
     * - misconceptions
     *
     * The adaptive policy converts those signals,
     * plus historical mastery state, into the next
     * StudyLoop action.
     */
    const decision = decideAdaptiveAction({
      questionType: evaluation.attempt.questionTypeSnapshot,

      correctness: evaluation.correctness,

      missingPoints: evaluation.missingPoints,

      misconceptions: evaluation.misconceptions,

      masteryAfter,

      evidenceWeightAfter,
    });

    return {
      decisionVersion: ADAPTIVE_POLICY_VERSION,

      evaluationId: evaluation.id,

      conceptId: evaluation.attempt.question.concept.id,

      conceptName: evaluation.attempt.question.concept.name,

      questionId: evaluation.attempt.question.id,

      questionType: evaluation.attempt.questionTypeSnapshot,

      score: evaluation.score,

      correctness: evaluation.correctness,

      masteryAfter,

      evidenceWeightAfter,

      decision,
    };
  }
}
