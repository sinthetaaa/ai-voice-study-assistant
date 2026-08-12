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

type SessionReadyConcept = {
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

  questions: {
    id: string;

    type: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

    difficulty: 'EASY' | 'MEDIUM' | 'HARD';

    prompt: string;
  }[];
};

@Injectable()
export class StudySessionsService {
  constructor(
    private readonly prisma: PrismaService,

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
     * A session begins only with currently active
     * concepts that have a persisted RECALL
     * question backed by READY provenance.
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

        questions: {
          some: {
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

        questions: {
          where: {
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

          take: 1,

          select: {
            id: true,

            type: true,

            difficulty: true,

            prompt: true,
          },
        },
      },
    });

    const readyConcepts: SessionReadyConcept[] = concepts.filter(
      (concept): concept is SessionReadyConcept => concept.questions.length > 0,
    );

    if (readyConcepts.length === 0) {
      throw new BadRequestException(
        `Study Pack ${studyPackId} has no ` +
          'session-ready concepts. At least one ' +
          'active concept must have a persisted ' +
          'RECALL question with READY provenance.',
      );
    }

    /*
     * Normal study sessions should not restart
     * concepts that already satisfy the exact
     * mastery + evidence thresholds used by the
     * adaptive policy.
     *
     * MASTERED concepts will later be handled by
     * the dedicated review path.
     */
    const studyConcepts = readyConcepts.filter(
      (concept) => classifyStudyReadiness(concept.mastery).needsNormalStudy,
    );

    if (studyConcepts.length === 0) {
      throw new BadRequestException(
        `Study Pack ${studyPackId} has no ` +
          'session-ready concepts requiring ' +
          'normal study. All currently ' +
          'session-ready concepts already meet ' +
          'the mastery and evidence thresholds.',
      );
    }

    /*
     * Freeze concept ordering when the session
     * begins.
     *
     * Priority:
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

    const firstConcept = orderedConcepts[0];

    const firstQuestion = firstConcept.questions[0];

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
        data: orderedConcepts.map((concept, position) => ({
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
        learningStep.action === 'ADVANCE_WITH_REVIEW',
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
    reviewRequired: boolean,
  ): Promise<void> {
    const now = new Date();

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
