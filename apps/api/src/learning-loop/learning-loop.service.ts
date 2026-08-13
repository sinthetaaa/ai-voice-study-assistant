import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import {
  AdaptiveQuestionType,
  AdaptiveReasonCode,
} from '../adaptive/adaptive-policy';
import {
  AdaptiveMasteryOverride,
  AdaptiveService,
} from '../adaptive/adaptive.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  RemediationResult,
  RemediationService,
} from '../remediation/remediation.service';

export type LearningLoopAction =
  | 'ASK_QUESTION'
  | 'REMEDIATE_AND_ASK'
  | 'ADVANCE_CONCEPT'
  | 'ADVANCE_WITH_REVIEW';

export type LearningLoopQuestion = {
  id: string;

  type: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

  difficulty: 'EASY' | 'MEDIUM' | 'HARD';

  prompt: string;
};

export type LearningLoopRemediation = {
  kind: 'MISCONCEPTION' | 'MISSING_POINTS' | 'GENERAL_GAP';

  focusPoints: string[];

  explanation: string;

  keyTakeaways: string[];

  evidenceChunkIds: string[];

  generatorProvider: string;

  generatorModel: string;

  generatorVersion: string;
};

export type LearningLoopNextStepResult = {
  studyPackId: string;

  conceptId: string;

  conceptName: string;

  evaluationId: string;

  decisionVersion: string;

  action: LearningLoopAction;

  reasonCode: AdaptiveReasonCode;

  reason: string;

  mastery: {
    score: number;

    evidenceWeight: number;
  };

  question: LearningLoopQuestion | null;

  remediation: LearningLoopRemediation | null;

  nextQuestionType: AdaptiveQuestionType | null;

  retestQuestionType: AdaptiveQuestionType | null;

  reviewQuestionType: AdaptiveQuestionType | null;
};

@Injectable()
export class LearningLoopService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly adaptiveService: AdaptiveService,

    private readonly remediationService: RemediationService,
  ) {}

  async getNextStep(
    studyPackId: string,
    conceptId: string,
    evaluationId: string,
    masteryOverride?: AdaptiveMasteryOverride,
  ): Promise<LearningLoopNextStepResult> {
    /*
     * Scope the evaluation before running any
     * downstream orchestration.
     *
     * This prevents an evaluation belonging to
     * another concept or Study Pack from being
     * processed through this route.
     */
    const scopedEvaluation = await this.prisma.answerEvaluation.findFirst({
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

        attempt: {
          select: {
            question: {
              select: {
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

    if (!scopedEvaluation) {
      throw new NotFoundException(
        `AnswerEvaluation ${evaluationId} ` +
          `was not found for concept ` +
          `${conceptId} in Study Pack ` +
          studyPackId,
      );
    }

    /*
     * AdaptiveService uses the historical
     * MasteryEvent belonging to this exact
     * evaluation.
     *
     * Therefore the resulting next step is
     * historically reproducible even if the
     * learner has completed later attempts.
     */
    const adaptive = await this.adaptiveService.decideForEvaluation(
      evaluationId,
      masteryOverride,
    );

    if (adaptive.conceptId !== conceptId) {
      throw new InternalServerErrorException(
        'Adaptive decision concept does ' + 'not match the requested concept',
      );
    }

    const baseResult = {
      studyPackId,

      conceptId,

      conceptName: adaptive.conceptName,

      evaluationId: adaptive.evaluationId,

      decisionVersion: adaptive.decisionVersion,

      reasonCode: adaptive.decision.reasonCode,

      reason: adaptive.decision.reason,

      mastery: {
        score: adaptive.masteryAfter,

        evidenceWeight: adaptive.evidenceWeightAfter,
      },

      nextQuestionType: adaptive.decision.nextQuestionType,

      retestQuestionType: adaptive.decision.retestQuestionType,
    };

    /*
     * Normal successful progression:
     *
     * RECALL -> UNDERSTANDING
     * UNDERSTANDING -> APPLICATION
     */
    if (adaptive.decision.action === 'ASK_QUESTION') {
      const nextQuestionType = adaptive.decision.nextQuestionType;

      if (!nextQuestionType) {
        throw new InternalServerErrorException(
          'Adaptive policy returned ' +
            'ASK_QUESTION without a ' +
            'nextQuestionType',
        );
      }

      const question = await this.loadQuestion(
        studyPackId,
        conceptId,
        nextQuestionType,
      );

      return {
        ...baseResult,

        action: 'ASK_QUESTION',

        question,

        remediation: null,

        reviewQuestionType: null,
      };
    }

    /*
     * Failed / partial response:
     *
     * Generate targeted remediation and then
     * provide the exact stable question slot
     * selected by the adaptive policy.
     *
     * Examples:
     *
     * PARTIAL UNDERSTANDING
     * -> remediate
     * -> UNDERSTANDING
     *
     * INCORRECT UNDERSTANDING
     * -> remediate
     * -> RECALL
     *
     * INCORRECT APPLICATION
     * -> remediate
     * -> UNDERSTANDING
     */
    if (adaptive.decision.action === 'REMEDIATE') {
      const nextQuestionType = adaptive.decision.nextQuestionType;

      if (!nextQuestionType) {
        throw new InternalServerErrorException(
          'Adaptive policy returned ' +
            'REMEDIATE without a ' +
            'nextQuestionType',
        );
      }

      const remediation = await this.remediationService.generateForEvaluation(
        studyPackId,
        conceptId,
        evaluationId,
      );

      const question = await this.loadQuestion(
        studyPackId,
        conceptId,
        nextQuestionType,
      );

      return {
        ...baseResult,

        action: 'REMEDIATE_AND_ASK',

        question,

        remediation: this.buildRemediationResult(remediation),

        reviewQuestionType: null,
      };
    }

    /*
     * The learner has demonstrated enough
     * APPLICATION-level evidence for this
     * concept.
     *
     * The future Study Session orchestrator will
     * select the next concept.
     */
    if (adaptive.decision.action === 'ADVANCE_CONCEPT') {
      return {
        ...baseResult,

        action: 'ADVANCE_CONCEPT',

        question: null,

        remediation: null,

        reviewQuestionType: null,
      };
    }

    /*
     * APPLICATION was correct, but cumulative
     * mastery evidence is not yet strong enough
     * to mark the concept securely mastered.
     *
     * We allow progression now and preserve the
     * recommended delayed review level.
     *
     * Actual scheduling belongs to the Study
     * Session / review subsystem, not this
     * stateless learning-loop service.
     */
    if (adaptive.decision.action === 'ADVANCE_WITH_REVIEW') {
      return {
        ...baseResult,

        action: 'ADVANCE_WITH_REVIEW',

        question: null,

        remediation: null,

        reviewQuestionType: adaptive.decision.retestQuestionType,
      };
    }

    throw new InternalServerErrorException(
      'Adaptive policy returned an ' + 'unsupported learning action',
    );
  }

  private async loadQuestion(
    studyPackId: string,
    conceptId: string,
    questionType: AdaptiveQuestionType,
  ): Promise<LearningLoopQuestion> {
    /*
     * Questions have stable identity through the
     * unique (conceptId, type) constraint.
     *
     * We intentionally load the current question
     * slot because this is the question the
     * learner is about to see now.
     *
     * Once answered, QuestionAttempt snapshots
     * preserve its exact historical version.
     */
    const question = await this.prisma.question.findFirst({
      where: {
        conceptId,

        type: questionType,

        concept: {
          studyPackId,
        },

        sources: {
          some: {
            chunk: {
              unit: {
                document: {
                  status: 'READY',
                },
              },
            },
          },
        },
      },

      select: {
        id: true,

        type: true,

        difficulty: true,

        prompt: true,
      },
    });

    if (!question) {
      throw new NotFoundException(
        `No persisted READY ` +
          `${questionType} question was ` +
          `found for concept ${conceptId} ` +
          `in Study Pack ${studyPackId}`,
      );
    }

    return {
      id: question.id,

      type: question.type,

      difficulty: question.difficulty,

      prompt: question.prompt,
    };
  }

  private buildRemediationResult(
    remediation: RemediationResult,
  ): LearningLoopRemediation {
    return {
      kind: remediation.remediationKind,

      focusPoints: remediation.focusPoints,

      explanation: remediation.explanation,

      keyTakeaways: remediation.keyTakeaways,

      evidenceChunkIds: remediation.evidenceChunkIds,

      generatorProvider: remediation.generatorProvider,

      generatorModel: remediation.generatorModel,

      generatorVersion: remediation.generatorVersion,
    };
  }
}
