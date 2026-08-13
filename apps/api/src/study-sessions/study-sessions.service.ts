import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import {
  EvaluationsService,
  PersistedEvaluationResult,
} from '../evaluations/evaluations.service';
import {
  LearningLoopNextStepResult,
  LearningLoopService,
} from '../learning-loop/learning-loop.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from '../questions/questions.service';

import { scheduleConceptReview } from './review-scheduling-policy';
import { classifyStudyReadiness } from './study-session-readiness';

type SessionConceptDifficulty = 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';

type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

type SessionConceptStatus =
  'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REVIEW_REQUIRED';

export type StudySessionQuestion = {
  id: string;

  type: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

  difficulty: 'EASY' | 'MEDIUM' | 'HARD';

  prompt: string;
};

export type StudySessionCurrentConcept = {
  id: string;

  name: string;

  difficulty: SessionConceptDifficulty;

  importance: number;

  position: number;

  status: SessionConceptStatus;

  reviewRequired: boolean;
};

export type StudySessionStateResult = {
  sessionId: string;

  studyPackId: string;

  status: SessionStatus;

  startedAt: Date;

  completedAt: Date | null;

  conceptCount: number;

  progress: {
    completedConceptCount: number;

    reviewRequiredCount: number;

    remainingConceptCount: number;
  };

  currentConcept: StudySessionCurrentConcept | null;

  currentQuestion: StudySessionQuestion | null;
};

export type StartStudySessionResult = StudySessionStateResult & {
  currentConcept: StudySessionCurrentConcept;

  currentQuestion: StudySessionQuestion;
};

export type StudySessionAnswerResult = {
  evaluation: PersistedEvaluationResult;

  learningStep: LearningLoopNextStepResult;

  session: StudySessionStateResult;
};

type SessionPlanConcept = {
  id: string;

  name: string;

  importance: number;

  difficulty: SessionConceptDifficulty;

  createdAt: Date;

  mastery: {
    masteryScore: number;
    evidenceWeight: number;
    attemptCount: number;
  } | null;
};

type PreparedSessionConcept = SessionPlanConcept & {
  questions: StudySessionQuestion[];
};

@Injectable()
export class StudySessionsService {
  private static readonly NORMAL_SESSION_CONCEPT_LIMIT = 3;

  constructor(
    private readonly prisma: PrismaService,

    private readonly questionsService: QuestionsService,

    private readonly evaluationsService: EvaluationsService,

    private readonly learningLoopService: LearningLoopService,
  ) {}

  async startSession(studyPackId: string): Promise<StartStudySessionResult> {
    const studyPack = await this.prisma.studyPack.findUnique({
      where: {
        id: studyPackId,
      },

      select: {
        id: true,
      },
    });

    if (!studyPack) {
      throw new NotFoundException(`Study Pack ${studyPackId} was not found`);
    }

    /*
     * Session planning starts from ALL currently
     * active concepts.
     *
     * Question readiness is intentionally NOT a
     * filter here anymore.
     *
     * Missing question sets are prepared lazily
     * only for concepts selected into this
     * bounded session batch.
     */
    const concepts = await this.prisma.concept.findMany({
      where: {
        studyPackId,

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

        name: true,

        importance: true,

        difficulty: true,

        createdAt: true,

        mastery: {
          select: {
            masteryScore: true,

            evidenceWeight: true,

            attemptCount: true,
          },
        },
      },
    });

    const studyConcepts: SessionPlanConcept[] = concepts.filter(
      (concept) => classifyStudyReadiness(concept.mastery).needsNormalStudy,
    );

    if (studyConcepts.length === 0) {
      throw new BadRequestException(
        `Study Pack ${studyPackId} has no ` +
          'active concepts requiring normal study.',
      );
    }

    /*
     * Deterministic global priority:
     *
     * 1. higher importance
     * 2. easier conceptual difficulty
     * 3. earlier creation
     * 4. ID tie-breaker
     */
    const orderedConcepts = [...studyConcepts].sort((left, right) => {
      if (left.importance !== right.importance) {
        return right.importance - left.importance;
      }

      const difficultyDifference =
        this.difficultyRank(left.difficulty) -
        this.difficultyRank(right.difficulty);

      if (difficultyDifference !== 0) {
        return difficultyDifference;
      }

      const createdDifference =
        left.createdAt.getTime() - right.createdAt.getTime();

      if (createdDifference !== 0) {
        return createdDifference;
      }

      return left.id.localeCompare(right.id);
    });

    /*
     * A normal session owns only a bounded
     * concept batch.
     *
     * This prevents POST /sessions from
     * triggering question generation for an
     * entire large Study Pack.
     */
    const selectedConcepts = orderedConcepts.slice(
      0,
      StudySessionsService.NORMAL_SESSION_CONCEPT_LIMIT,
    );

    const preparedConcepts: PreparedSessionConcept[] = [];

    /*
     * Prepare sequentially.
     *
     * Local LLM generation is intentionally not
     * parallelized because concurrent generation
     * would increase resource contention without
     * improving session correctness.
     *
     * QuestionsService itself preserves stable
     * (conceptId, type) identities.
     */
    for (const concept of selectedConcepts) {
      const questions = await this.ensureConceptQuestionSet(
        studyPackId,
        concept.id,
      );

      preparedConcepts.push({
        ...concept,

        questions,
      });
    }

    const firstConcept = preparedConcepts[0];

    const firstQuestion = firstConcept.questions.find(
      (question) => question.type === 'RECALL',
    );

    if (!firstQuestion) {
      throw new InternalServerErrorException(
        `Prepared concept ${firstConcept.id} ` +
          'does not contain a READY RECALL question',
      );
    }

    /*
     * Only after every selected concept has a
     * complete READY-backed question set do we
     * create the persistent session snapshot.
     *
     * Therefore a generation failure cannot
     * create a half-prepared StudySession.
     */
    const session = await this.prisma.$transaction(async (transaction) => {
      const createdSession = await transaction.studySession.create({
        data: {
          studyPackId,

          status: 'ACTIVE',

          currentConceptId: firstConcept.id,

          currentQuestionId: firstQuestion.id,
        },

        select: {
          id: true,

          startedAt: true,
        },
      });

      await transaction.sessionConceptProgress.createMany({
        data: preparedConcepts.map((concept, position) => ({
          sessionId: createdSession.id,

          conceptId: concept.id,

          position,

          status: 'PENDING',

          reviewRequired: false,
        })),
      });

      await transaction.sessionConceptProgress.update({
        where: {
          sessionId_conceptId: {
            sessionId: createdSession.id,

            conceptId: firstConcept.id,
          },
        },

        data: {
          status: 'IN_PROGRESS',

          startedAt: createdSession.startedAt,
        },
      });

      return createdSession;
    });

    const state = await this.getSessionState(session.id);

    if (!state.currentConcept || !state.currentQuestion) {
      throw new InternalServerErrorException(
        'New StudySession was created without ' +
          'an active concept and question',
      );
    }

    return {
      ...state,

      currentConcept: state.currentConcept,

      currentQuestion: state.currentQuestion,
    };
  }

  private async ensureConceptQuestionSet(
    studyPackId: string,
    conceptId: string,
  ): Promise<StudySessionQuestion[]> {
    const requiredQuestionTypes: StudySessionQuestion['type'][] = [
      'RECALL',
      'UNDERSTANDING',
      'APPLICATION',
    ];

    let questions = await this.loadReadyConceptQuestions(
      studyPackId,
      conceptId,
    );

    const existingTypes = new Set(questions.map((question) => question.type));

    const missingTypes = requiredQuestionTypes.filter(
      (type) => !existingTypes.has(type),
    );

    /*
     * Generate only when the concept does not
     * already have the complete three-level
     * READY-backed question set.
     *
     * QuestionsService upserts stable question
     * slots, so partially prepared concepts are
     * safely repaired rather than duplicated.
     */
    if (missingTypes.length > 0) {
      await this.questionsService.generateConceptQuestions(
        studyPackId,
        conceptId,
      );

      questions = await this.loadReadyConceptQuestions(studyPackId, conceptId);
    }

    const finalTypes = new Set(questions.map((question) => question.type));

    const stillMissing = requiredQuestionTypes.filter(
      (type) => !finalTypes.has(type),
    );

    if (stillMissing.length > 0) {
      throw new InternalServerErrorException(
        `Concept ${conceptId} question ` +
          `preparation completed without READY ` +
          `question types: ${stillMissing.join(', ')}`,
      );
    }

    return questions;
  }

  private async loadReadyConceptQuestions(
    studyPackId: string,
    conceptId: string,
  ): Promise<StudySessionQuestion[]> {
    const questions = await this.prisma.question.findMany({
      where: {
        conceptId,

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

    return questions.map((question) => ({
      id: question.id,

      type: question.type,

      difficulty: question.difficulty,

      prompt: question.prompt,
    }));
  }

  async answerSession(
    sessionId: string,
    rawAnswerText: unknown,
  ): Promise<StudySessionAnswerResult> {
    /*
     * The client supplies only:
     *
     * sessionId
     * answerText
     *
     * StudySession is the authoritative source
     * for Study Pack, concept and question IDs.
     */
    const session = await this.prisma.studySession.findUnique({
      where: {
        id: sessionId,
      },

      select: {
        id: true,

        studyPackId: true,

        status: true,

        currentConceptId: true,

        currentQuestionId: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`StudySession ${sessionId} was not found`);
    }

    if (session.status !== 'ACTIVE') {
      throw new BadRequestException(`StudySession ${sessionId} is not ACTIVE`);
    }

    if (!session.currentConceptId || !session.currentQuestionId) {
      throw new InternalServerErrorException(
        `ACTIVE StudySession ${sessionId} ` +
          'does not have a current concept and question',
      );
    }

    const conceptId = session.currentConceptId;

    const questionId = session.currentQuestionId;

    /*
     * EvaluationsService validates that this
     * StudySession is still ACTIVE on exactly
     * these IDs before persisting the attempt.
     *
     * The resulting QuestionAttempt receives:
     *
     * studySessionId = sessionId
     */
    const evaluation = await this.evaluationsService.evaluateQuestion(
      session.studyPackId,
      conceptId,
      questionId,
      rawAnswerText,
      session.id,
    );

    /*
     * Evaluation persistence and mastery are now
     * complete.
     *
     * Ask the existing stateless LearningLoop
     * what this evaluation means for the next
     * learner action.
     */
    const learningStep = await this.learningLoopService.getNextStep(
      session.studyPackId,
      conceptId,
      evaluation.evaluationId,
    );

    /*
     * Apply the learning decision to persistent
     * session state.
     */
    await this.applyLearningStep(
      session.id,
      conceptId,
      questionId,
      learningStep,
    );

    const updatedSession = await this.getSessionState(session.id);

    return {
      evaluation,

      learningStep,

      session: updatedSession,
    };
  }

  async getSessionState(sessionId: string): Promise<StudySessionStateResult> {
    const session = await this.prisma.studySession.findUnique({
      where: {
        id: sessionId,
      },

      select: {
        id: true,

        studyPackId: true,

        status: true,

        startedAt: true,

        completedAt: true,

        currentConceptId: true,

        currentQuestion: {
          select: {
            id: true,

            type: true,

            difficulty: true,

            prompt: true,
          },
        },

        currentConcept: {
          select: {
            id: true,

            name: true,

            difficulty: true,

            importance: true,
          },
        },

        conceptProgress: {
          orderBy: {
            position: 'asc',
          },

          select: {
            conceptId: true,

            position: true,

            status: true,

            reviewRequired: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`StudySession ${sessionId} was not found`);
    }

    const completedConceptCount = session.conceptProgress.filter(
      (progress) => progress.status === 'COMPLETED',
    ).length;

    const reviewRequiredCount = session.conceptProgress.filter(
      (progress) => progress.reviewRequired,
    ).length;

    const remainingConceptCount = session.conceptProgress.filter(
      (progress) =>
        progress.status === 'PENDING' || progress.status === 'IN_PROGRESS',
    ).length;

    const currentProgress = session.currentConceptId
      ? session.conceptProgress.find(
          (progress) => progress.conceptId === session.currentConceptId,
        )
      : undefined;

    const currentConcept =
      session.currentConcept && currentProgress
        ? {
            id: session.currentConcept.id,

            name: session.currentConcept.name,

            difficulty: session.currentConcept.difficulty,

            importance: session.currentConcept.importance,

            position: currentProgress.position,

            status: currentProgress.status,

            reviewRequired: currentProgress.reviewRequired,
          }
        : null;

    const currentQuestion = session.currentQuestion
      ? {
          id: session.currentQuestion.id,

          type: session.currentQuestion.type,

          difficulty: session.currentQuestion.difficulty,

          prompt: session.currentQuestion.prompt,
        }
      : null;

    return {
      sessionId: session.id,

      studyPackId: session.studyPackId,

      status: session.status,

      startedAt: session.startedAt,

      completedAt: session.completedAt,

      conceptCount: session.conceptProgress.length,

      progress: {
        completedConceptCount,

        reviewRequiredCount,

        remainingConceptCount,
      },

      currentConcept,

      currentQuestion,
    };
  }

  private async applyLearningStep(
    sessionId: string,
    currentConceptId: string,
    answeredQuestionId: string,
    learningStep: LearningLoopNextStepResult,
  ): Promise<void> {
    if (learningStep.conceptId !== currentConceptId) {
      throw new InternalServerErrorException(
        'LearningLoop returned a concept that ' +
          'does not match the session concept',
      );
    }

    /*
     * Same-concept progression:
     *
     * CORRECT RECALL
     * -> UNDERSTANDING
     *
     * CORRECT UNDERSTANDING
     * -> APPLICATION
     *
     * PARTIAL / INCORRECT
     * -> remediation + selected retest level
     */
    if (
      learningStep.action === 'ASK_QUESTION' ||
      learningStep.action === 'REMEDIATE_AND_ASK'
    ) {
      if (!learningStep.question) {
        throw new InternalServerErrorException(
          `LearningLoop returned ` +
            `${learningStep.action} without a question`,
        );
      }

      if (
        learningStep.question.id === answeredQuestionId &&
        learningStep.action === 'ASK_QUESTION'
      ) {
        throw new InternalServerErrorException(
          'LearningLoop attempted normal progression ' +
            'without changing the question',
        );
      }

      await this.prisma.studySession.update({
        where: {
          id: sessionId,
        },

        data: {
          currentQuestionId: learningStep.question.id,
        },
      });

      return;
    }

    /*
     * Concept-level progression.
     */
    if (
      learningStep.action === 'ADVANCE_CONCEPT' ||
      learningStep.action === 'ADVANCE_WITH_REVIEW'
    ) {
      await this.advanceConcept(
        sessionId,
        currentConceptId,
        learningStep.action,
        learningStep.reviewQuestionType,
      );

      return;
    }

    throw new InternalServerErrorException(
      'LearningLoop returned an unsupported ' + 'session transition',
    );
  }

  private async advanceConcept(
    sessionId: string,
    conceptId: string,
    action: 'ADVANCE_CONCEPT' | 'ADVANCE_WITH_REVIEW',
    reviewQuestionType: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION' | null,
  ): Promise<void> {
    const now = new Date();

    const reviewRequired = action === 'ADVANCE_WITH_REVIEW';

    const reviewSchedule = scheduleConceptReview({
      action,

      completedAt: now,

      reviewQuestionType,
    });

    await this.prisma.$transaction(async (transaction) => {
      /*
       * Finish the current concept's initial
       * session pass.
       */
      await transaction.sessionConceptProgress.update({
        where: {
          sessionId_conceptId: {
            sessionId,

            conceptId,
          },
        },

        data: {
          status: reviewRequired ? 'REVIEW_REQUIRED' : 'COMPLETED',

          reviewRequired,

          completedAt: now,
        },
      });

      /*
       * Persist the delayed-review schedule in
       * ConceptMastery.
       *
       * Secure mastery:
       *   APPLICATION maintenance review
       *   after 7 days.
       *
       * ADVANCE_WITH_REVIEW:
       *   early reinforcement using the
       *   adaptive policy's requested level
       *   after 1 day.
       *
       * lastReviewedAt stays unchanged because
       * scheduling a review is not the same as
       * completing one.
       */
      const mastery = await transaction.conceptMastery.findUnique({
        where: {
          conceptId,
        },

        select: {
          id: true,
        },
      });

      if (!mastery) {
        throw new InternalServerErrorException(
          `Concept ${conceptId} advanced ` + 'without persisted mastery state',
        );
      }

      await transaction.conceptMastery.update({
        where: {
          conceptId,
        },

        data: {
          reviewDueAt: reviewSchedule.reviewDueAt,

          reviewQuestionType: reviewSchedule.reviewQuestionType,

          reviewIntervalDays: reviewSchedule.reviewIntervalDays,
        },
      });

      /*
       * Concept ordering was frozen when the
       * session started, so progression always
       * uses the next PENDING position.
       */
      const nextProgress = await transaction.sessionConceptProgress.findFirst({
        where: {
          sessionId,

          status: 'PENDING',
        },

        orderBy: {
          position: 'asc',
        },

        select: {
          conceptId: true,
        },
      });

      /*
       * No pending concept remains.
       *
       * REVIEW_REQUIRED concepts are preserved
       * for the future review subsystem but do
       * not block completion of this initial
       * study session pass.
       */
      if (!nextProgress) {
        await transaction.studySession.update({
          where: {
            id: sessionId,
          },

          data: {
            status: 'COMPLETED',

            currentConceptId: null,

            currentQuestionId: null,

            completedAt: now,
          },
        });

        return;
      }

      /*
       * Every concept included in the session
       * snapshot had a valid RECALL question at
       * session creation.
       *
       * Revalidate READY provenance before
       * presenting it now.
       */
      const recallQuestion = await transaction.question.findFirst({
        where: {
          conceptId: nextProgress.conceptId,

          type: 'RECALL',

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
        },
      });

      if (!recallQuestion) {
        throw new NotFoundException(
          `No persisted READY RECALL question ` +
            `was found for next session concept ` +
            `${nextProgress.conceptId}`,
        );
      }

      await transaction.sessionConceptProgress.update({
        where: {
          sessionId_conceptId: {
            sessionId,

            conceptId: nextProgress.conceptId,
          },
        },

        data: {
          status: 'IN_PROGRESS',

          startedAt: now,
        },
      });

      await transaction.studySession.update({
        where: {
          id: sessionId,
        },

        data: {
          currentConceptId: nextProgress.conceptId,

          currentQuestionId: recallQuestion.id,
        },
      });
    });
  }

  private difficultyRank(difficulty: SessionConceptDifficulty): number {
    switch (difficulty) {
      case 'FOUNDATIONAL':
        return 0;

      case 'INTERMEDIATE':
        return 1;

      case 'ADVANCED':
        return 2;
    }
  }
}
