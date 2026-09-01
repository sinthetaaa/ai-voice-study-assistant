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

import {
  completeConceptReview,
  ReviewAnswerCorrectness,
} from './review-completion-policy';
import { scheduleConceptReview } from './review-scheduling-policy';
import {
  calculateStudyPackCoverage,
  planNormalStudySession,
} from './session-planner';

import {
  INITIAL_SESSION_ALPHA,
  INITIAL_SESSION_ATTEMPT_COUNT,
  INITIAL_SESSION_BETA,
  INITIAL_SESSION_EVIDENCE_WEIGHT,
  INITIAL_SESSION_MASTERY_SCORE,
  updateSessionMastery,
} from './session-mastery';

type SessionConceptDifficulty = 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';

type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

type SessionKind = 'NORMAL' | 'REVIEW';

type SessionConceptStatus =
  'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REVIEW_REQUIRED';

export type StudySessionQuestion = {
  id: string;

  type: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

  difficulty: 'EASY' | 'MEDIUM' | 'HARD';

  prompt: string;
};

export type StudySessionMastery = {
  score: number;

  evidenceWeight: number;

  attemptCount: number;
};

export type StudySessionCurrentConcept = {
  id: string;

  name: string;

  difficulty: SessionConceptDifficulty;

  importance: number;

  position: number;

  status: SessionConceptStatus;

  reviewRequired: boolean;

  recoveryTargetQuestionType: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION' | null;

  mastery: StudySessionMastery;
};

export type StudySessionConceptFlowItem = {
  id: string;

  name: string;

  difficulty: SessionConceptDifficulty;

  importance: number;

  position: number;

  status: SessionConceptStatus;

  reviewRequired: boolean;

  recoveryTargetQuestionType: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION' | null;

  mastery: StudySessionMastery;
};

export type StudySessionStateResult = {
  sessionId: string;

  studyPackId: string;

  kind: SessionKind;

  status: SessionStatus;

  startedAt: Date;

  completedAt: Date | null;

  /**
   * Human-facing sequence number for NORMAL study sessions.
   *
   * REVIEW sessions do not participate in this sequence.
   */
  sessionNumber: number | null;

  conceptCount: number;

  progress: {
    completedConceptCount: number;

    reviewRequiredCount: number;

    remainingConceptCount: number;
  };

  currentConcept: StudySessionCurrentConcept | null;

  currentQuestion: StudySessionQuestion | null;

  conceptFlow: StudySessionConceptFlowItem[];
};

export type StartStudySessionResult = StudySessionStateResult & {
  currentConcept: StudySessionCurrentConcept;

  currentQuestion: StudySessionQuestion;
};

export type ReviewSessionStepResult = {
  action: 'COMPLETE_REVIEW';

  reasonCode:
    | 'CORRECT_REVIEW_SPACED'
    | 'PARTIAL_REVIEW_REINFORCE'
    | 'INCORRECT_REVIEW_REINFORCE';

  reason: string;

  correctness: 'CORRECT' | 'PARTIAL' | 'INCORRECT';

  reviewQuestionType: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

  previousIntervalDays: number;

  nextIntervalDays: number;

  completedAt: Date;

  nextReviewDueAt: Date;
};

export type StudySessionAnswerResult = {
  evaluation: PersistedEvaluationResult;

  learningStep: LearningLoopNextStepResult | null;

  reviewStep: ReviewSessionStepResult | null;

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
    reviewDueAt: Date | null;
  } | null;
};

type PreparedSessionConcept = SessionPlanConcept & {
  questions: StudySessionQuestion[];
};

export type StudySessionAnalysisSource = {
  chunkId: string;

  documentId: string;

  documentName: string;

  mimeType: string;

  unitId: string;

  unitKind: string;

  unitLabel: string;

  unitIndex: number;

  pageNumber: number | null;

  excerpt: string;

  fileUrl: string;
};

export type StudySessionAnalysisSourcesResult = {
  sessionId: string;

  attemptId: string;

  sourceCount: number;

  sources: StudySessionAnalysisSource[];
};

@Injectable()
export class StudySessionsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly questionsService: QuestionsService,

    private readonly evaluationsService: EvaluationsService,

    private readonly learningLoopService: LearningLoopService,
  ) {}

  async getAttemptAnalysisSources(
    sessionId: string,
    attemptId: string,
  ): Promise<StudySessionAnalysisSourcesResult> {
    /*
     * Historical source review MUST use the exact
     * evidence snapshot captured when the learner
     * answered the question.
     *
     * Never reconstruct this from the live
     * QuestionSource relation.
     */
    const attempt = await this.prisma.questionAttempt.findFirst({
      where: {
        id: attemptId,

        studySessionId: sessionId,
      },

      select: {
        id: true,

        studySessionId: true,

        evidenceChunkIds: true,

        question: {
          select: {
            concept: {
              select: {
                studyPackId: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(
        `Question attempt ${attemptId} was not found for Study Session ${sessionId}`,
      );
    }

    const evidenceIds = attempt.evidenceChunkIds;

    if (evidenceIds.length === 0) {
      return {
        sessionId,

        attemptId,

        sourceCount: 0,

        sources: [],
      };
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

        chunkIndex: true,

        unit: {
          select: {
            id: true,

            unitIndex: true,

            kind: true,

            label: true,

            metadata: true,

            document: {
              select: {
                id: true,

                studyPackId: true,

                originalName: true,

                mimeType: true,

                status: true,
              },
            },
          },
        },
      },
    });

    const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    const sources: StudySessionAnalysisSource[] = [];

    const seenSourceKeys = new Set<string>();

    for (const chunkId of evidenceIds) {
      const chunk = chunkMap.get(chunkId);

      if (!chunk) {
        continue;
      }

      const document = chunk.unit.document;

      /*
       * Defense in depth:
       * historical evidence must still belong to
       * the Study Pack associated with the attempt.
       */
      if (document.studyPackId !== attempt.question.concept.studyPackId) {
        continue;
      }

      const pageNumber = extractPageNumber(
        chunk.unit.metadata,
        chunk.unit.kind,
        chunk.unit.unitIndex,
      );

      /*
       * Avoid showing multiple almost-identical
       * cards from the same page/unit.
       */
      const sourceKey = `${document.id}:${chunk.unit.id}`;

      if (seenSourceKeys.has(sourceKey)) {
        continue;
      }

      seenSourceKeys.add(sourceKey);

      sources.push({
        chunkId: chunk.id,

        documentId: document.id,

        documentName: document.originalName,

        mimeType: document.mimeType,

        unitId: chunk.unit.id,

        unitKind: chunk.unit.kind,

        unitLabel: chunk.unit.label,

        unitIndex: chunk.unit.unitIndex,

        pageNumber,

        excerpt: createAnalysisSourceExcerpt(chunk.text),

        fileUrl:
          `/study-packs/${document.studyPackId}` +
          `/documents/${document.id}/file`,
      });

      /*
       * Analysis should remain focused.
       * Two cards match the approved desktop UI;
       * we allow three so scrollable material
       * review can support another useful source.
       */
      if (sources.length >= 3) {
        break;
      }
    }

    return {
      sessionId,

      attemptId,

      sourceCount: sources.length,

      sources,
    };
  }

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

            reviewDueAt: true,
          },
        },
      },
    });

    /*
     * A NORMAL session is intentionally fresh.
     *
     * Lifetime ConceptMastery remains intact for
     * long-term learning history and scheduled reviews,
     * but it does NOT decide whether a concept is allowed
     * into this newly started session.
     *
     * Session-local mastery begins from zero below.
     */
    const studyConcepts: SessionPlanConcept[] = concepts;

    if (studyConcepts.length === 0) {
      throw new BadRequestException(
        `Study Pack ${studyPackId} has no ` +
          'active READY-backed concepts available for study.',
      );
    }

    /*
     * STUDY PACK COVERAGE
     *
     * Previous Normal Study attempts influence only WHICH
     * concepts should be sampled next.
     *
     * They do not initialize the new session's visible
     * mastery. Every selected concept still starts from zero.
     */
    const historicalAttempts = await this.prisma.questionAttempt.findMany({
      where: {
        studySession: {
          studyPackId,

          kind: 'NORMAL',
        },

        question: {
          concept: {
            studyPackId,
          },
        },
      },

      select: {
        question: {
          select: {
            conceptId: true,
          },
        },
      },
    });

    const attemptCountByConcept = new Map<string, number>();

    for (const attempt of historicalAttempts) {
      const conceptId = attempt.question.conceptId;

      attemptCountByConcept.set(
        conceptId,
        (attemptCountByConcept.get(conceptId) ?? 0) + 1,
      );
    }

    const plan = planNormalStudySession(
      studyConcepts.map((concept) => ({
        id: concept.id,

        importance: concept.importance,

        difficulty: concept.difficulty,

        createdAt: concept.createdAt,

        priorAttemptCount: attemptCountByConcept.get(concept.id) ?? 0,
      })),
    );

    const conceptById = new Map(
      studyConcepts.map((concept) => [concept.id, concept]),
    );

    const plannedConcepts = plan.selectedConcepts.map((plannedConcept) => {
      const concept = conceptById.get(plannedConcept.id);

      if (!concept) {
        throw new InternalServerErrorException(
          `Session planner selected unknown concept ` + `${plannedConcept.id}`,
        );
      }

      return concept;
    });

    if (plannedConcepts.length === 0) {
      throw new InternalServerErrorException(
        'Session planner produced an empty concept batch',
      );
    }

    /*
     * Keep the approved fresh-session behavior:
     *
     * the selected CONTENT batch is coverage-aware,
     * but the first concept is randomized inside that batch.
     *
     * Refreshing does not reroll it because the resulting IDs
     * are persisted on StudySession.
     */
    const firstConceptIndex = Math.floor(
      Math.random() * plannedConcepts.length,
    );

    const firstSelectedConcept = plannedConcepts[firstConceptIndex];

    const selectedConcepts = [
      firstSelectedConcept,
      ...plannedConcepts.filter(
        (concept) => concept.id !== firstSelectedConcept.id,
      ),
    ];

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

          sessionAlpha: INITIAL_SESSION_ALPHA,

          sessionBeta: INITIAL_SESSION_BETA,

          sessionMasteryScore: INITIAL_SESSION_MASTERY_SCORE,

          sessionEvidenceWeight: INITIAL_SESSION_EVIDENCE_WEIGHT,

          sessionAttemptCount: INITIAL_SESSION_ATTEMPT_COUNT,
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

        purpose: 'BASELINE',

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

  async getStudyPackCoverage(studyPackId: string) {
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

        importance: true,
      },
    });

    const attempts = await this.prisma.questionAttempt.findMany({
      where: {
        studySession: {
          studyPackId,

          kind: 'NORMAL',
        },

        question: {
          concept: {
            studyPackId,
          },
        },
      },

      select: {
        question: {
          select: {
            conceptId: true,
          },
        },
      },
    });

    const attemptCountByConcept = new Map<string, number>();

    for (const attempt of attempts) {
      const conceptId = attempt.question.conceptId;

      attemptCountByConcept.set(
        conceptId,
        (attemptCountByConcept.get(conceptId) ?? 0) + 1,
      );
    }

    const coverage = calculateStudyPackCoverage(
      concepts.map((concept) => ({
        id: concept.id,

        importance: concept.importance,

        priorAttemptCount: attemptCountByConcept.get(concept.id) ?? 0,
      })),
    );

    return {
      studyPackId,

      ...coverage,

      percentage: Math.round(coverage.weightedRatio * 100),
    };
  }

  async startReviewSession(
    studyPackId: string,
  ): Promise<StudySessionStateResult> {
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
     * Repeated start requests resume the
     * currently ACTIVE review session instead of
     * creating duplicate review attempts.
     */
    const existingReviewSession = await this.prisma.studySession.findFirst({
      where: {
        studyPackId,

        kind: 'REVIEW',

        status: 'ACTIVE',
      },

      orderBy: {
        startedAt: 'asc',
      },

      select: {
        id: true,
      },
    });

    if (existingReviewSession) {
      return this.getSessionState(existingReviewSession.id);
    }

    const now = new Date();

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

        createdAt: true,

        mastery: {
          select: {
            reviewDueAt: true,

            reviewQuestionType: true,

            reviewIntervalDays: true,
          },
        },
      },
    });

    const dueConcepts = concepts
      .filter(
        (concept) =>
          concept.mastery?.reviewDueAt &&
          concept.mastery.reviewQuestionType &&
          concept.mastery.reviewDueAt.getTime() <= now.getTime(),
      )
      .sort((left, right) => {
        const leftDueAt = left.mastery!.reviewDueAt!.getTime();

        const rightDueAt = right.mastery!.reviewDueAt!.getTime();

        if (leftDueAt !== rightDueAt) {
          return leftDueAt - rightDueAt;
        }

        if (left.importance !== right.importance) {
          return right.importance - left.importance;
        }

        const createdDifference =
          left.createdAt.getTime() - right.createdAt.getTime();

        if (createdDifference !== 0) {
          return createdDifference;
        }

        return left.id.localeCompare(right.id);
      });

    const concept = dueConcepts[0];

    if (!concept) {
      throw new BadRequestException(
        `Study Pack ${studyPackId} has no due reviews.`,
      );
    }

    const reviewQuestionType = concept.mastery!.reviewQuestionType!;

    /*
     * Reuse the existing grounded question
     * preparation subsystem if document changes
     * removed the previously READY-backed set.
     */
    const questions = await this.ensureConceptQuestionSet(
      studyPackId,
      concept.id,
    );

    const reviewQuestion = questions.find(
      (question) => question.type === reviewQuestionType,
    );

    if (!reviewQuestion) {
      throw new InternalServerErrorException(
        `Concept ${concept.id} does not have ` +
          `a READY ${reviewQuestionType} review question`,
      );
    }

    const sessionId = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.studySession.create({
        data: {
          studyPackId,

          kind: 'REVIEW',

          status: 'ACTIVE',

          currentConceptId: concept.id,

          currentQuestionId: reviewQuestion.id,
        },

        select: {
          id: true,
        },
      });

      await transaction.sessionConceptProgress.create({
        data: {
          sessionId: session.id,

          conceptId: concept.id,

          position: 0,

          status: 'IN_PROGRESS',

          reviewRequired: false,

          startedAt: now,
        },
      });

      return session.id;
    });

    return this.getSessionState(sessionId);
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

        kind: true,

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
     * REVIEW sessions intentionally bypass the
     * normal adaptive question ladder.
     *
     * The scheduled question is the entire review
     * check. Evaluation and Bayesian mastery have
     * already been applied above.
     */
    if (session.kind === 'REVIEW') {
      const reviewStep = await this.completeReviewSession(
        session.id,
        conceptId,
        evaluation.correctness,
      );

      const updatedSession = await this.getSessionState(session.id);

      return {
        evaluation,

        learningStep: null,

        reviewStep,

        session: updatedSession,
      };
    }

    /*
     * NORMAL sessions update TWO independent mastery states:
     *
     * 1. lifetime ConceptMastery
     *    - already updated by EvaluationsService
     *    - survives across sessions
     *    - powers delayed review / long-term history
     *
     * 2. session-local mastery
     *    - starts from 0 every new session
     *    - controls the visible mastery ring
     *    - drives adaptive decisions inside THIS session
     */
    const sessionMastery = await this.applySessionMastery(
      session.id,
      conceptId,
      evaluation.evaluationId,
      evaluation.questionType,
      evaluation.score,
    );

    let learningStep: LearningLoopNextStepResult;

    try {
      learningStep = await this.learningLoopService.getNextStep(
        session.studyPackId,
        conceptId,
        evaluation.evaluationId,
        {
          masteryAfter: sessionMastery.masteryAfter,

          evidenceWeightAfter: sessionMastery.evidenceWeightAfter,
        },
      );
    } catch (error) {
      /*
       * The learner's answer has already been:
       *
       * - transcribed
       * - evaluated
       * - persisted
       * - applied to lifetime mastery
       * - applied to session mastery
       *
       * Failure to PREPARE the next adaptive question must
       * never erase that successful answer result or prevent
       * the Answer Analysis screen from opening.
       *
       * Leave the current question/session pointer unchanged.
       * The frontend can safely display the completed analysis.
       * A future retry / next-question request can recover the
       * adaptive continuation independently.
       */
      const updatedSession = await this.getSessionState(session.id);

      return {
        evaluation,

        learningStep: null,

        reviewStep: null,

        session: updatedSession,
      };
    }

    /*
     * If this answer successfully completes a scaffold while
     * the concept is recovering toward a previously failed
     * cognitive level, replace normal progression with a NEW
     * RETEST question at that recovery target.
     */
    const effectiveLearningStep = await this.applyRecoveryClimbBackIfNeeded(
      session.id,
      session.studyPackId,
      conceptId,
      questionId,
      evaluation.correctness,
      learningStep,
    );

    await this.applyLearningStep(
      session.id,
      conceptId,
      questionId,
      effectiveLearningStep,
      evaluation.correctness,
    );

    const updatedSession = await this.getSessionState(session.id);

    return {
      evaluation,

      learningStep: effectiveLearningStep,

      reviewStep: null,

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

        kind: true,

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

            recoveryTargetQuestionType: true,

            sessionMasteryScore: true,

            sessionEvidenceWeight: true,

            sessionAttemptCount: true,

            concept: {
              select: {
                id: true,

                name: true,

                difficulty: true,

                importance: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`StudySession ${sessionId} was not found`);
    }

    /*
     * NORMAL STUDY SESSION NUMBER
     *
     * Session numbering is scoped to the Study Pack and counts
     * only NORMAL sessions.
     *
     * REVIEW sessions are deliberately excluded so a scheduled
     * review never turns Session 02 into Session 03.
     *
     * We count NORMAL sessions that started at or before this
     * session. The ID tie-breaker keeps the result deterministic
     * in the extremely unlikely case of identical timestamps.
     */
    const sessionNumber =
      session.kind === 'NORMAL'
        ? await this.prisma.studySession.count({
            where: {
              studyPackId: session.studyPackId,

              kind: 'NORMAL',

              OR: [
                {
                  startedAt: {
                    lt: session.startedAt,
                  },
                },
                {
                  startedAt: session.startedAt,

                  id: {
                    lte: session.id,
                  },
                },
              ],
            },
          })
        : null;

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

            recoveryTargetQuestionType:
              currentProgress.recoveryTargetQuestionType,

            mastery: {
              score: currentProgress.sessionMasteryScore,

              evidenceWeight: currentProgress.sessionEvidenceWeight,

              attemptCount: currentProgress.sessionAttemptCount,
            },
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

    const conceptFlow: StudySessionConceptFlowItem[] =
      session.conceptProgress.map((progress) => ({
        id: progress.concept.id,

        name: progress.concept.name,

        difficulty: progress.concept.difficulty,

        importance: progress.concept.importance,

        position: progress.position,

        status: progress.status,

        reviewRequired: progress.reviewRequired,

        recoveryTargetQuestionType: progress.recoveryTargetQuestionType,

        mastery: {
          score: progress.sessionMasteryScore,

          evidenceWeight: progress.sessionEvidenceWeight,

          attemptCount: progress.sessionAttemptCount,
        },
      }));

    return {
      sessionId: session.id,

      studyPackId: session.studyPackId,

      kind: session.kind,

      status: session.status,

      sessionNumber,

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

      conceptFlow,
    };
  }

  private async applySessionMastery(
    sessionId: string,
    conceptId: string,
    evaluationId: string,
    questionType: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION',
    score: number,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      /*
       * Lock the session/concept progress row so two concurrent
       * answer-processing requests cannot apply evidence against
       * the same old session-local mastery state.
       */
      await transaction.$queryRaw`
        SELECT "id"
        FROM "SessionConceptProgress"
        WHERE "sessionId" = ${sessionId}
          AND "conceptId" = ${conceptId}
        FOR UPDATE
      `;

      const progress = await transaction.sessionConceptProgress.findUnique({
        where: {
          sessionId_conceptId: {
            sessionId,

            conceptId,
          },
        },

        select: {
          sessionAlpha: true,

          sessionBeta: true,

          sessionMasteryScore: true,

          sessionEvidenceWeight: true,

          sessionAttemptCount: true,
        },
      });

      if (!progress) {
        throw new InternalServerErrorException(
          `StudySession ${sessionId} has no ` +
            `SessionConceptProgress for concept ${conceptId}`,
        );
      }

      /*
       * Idempotency by evaluationId.
       *
       * If this exact evaluated answer has already updated
       * session mastery, return the original transition.
       */
      const existingEvent = await transaction.sessionMasteryEvent.findUnique({
        where: {
          evaluationId,
        },
      });

      if (existingEvent) {
        return {
          applied: false,

          ...existingEvent,
        };
      }

      const update = updateSessionMastery(
        {
          alpha: progress.sessionAlpha,

          beta: progress.sessionBeta,

          masteryScore: progress.sessionMasteryScore,

          evidenceWeight: progress.sessionEvidenceWeight,

          attemptCount: progress.sessionAttemptCount,
        },
        questionType,
        score,
      );

      await transaction.sessionConceptProgress.update({
        where: {
          sessionId_conceptId: {
            sessionId,

            conceptId,
          },
        },

        data: {
          sessionAlpha: update.alphaAfter,

          sessionBeta: update.betaAfter,

          sessionMasteryScore: update.masteryAfter,

          sessionEvidenceWeight: update.evidenceWeightAfter,

          sessionAttemptCount: update.attemptCountAfter,
        },
      });

      const event = await transaction.sessionMasteryEvent.create({
        data: {
          sessionId,

          conceptId,

          evaluationId,

          score,

          weight: update.weight,

          alphaBefore: update.alphaBefore,

          betaBefore: update.betaBefore,

          alphaAfter: update.alphaAfter,

          betaAfter: update.betaAfter,

          masteryBefore: update.masteryBefore,

          masteryAfter: update.masteryAfter,

          evidenceWeightBefore: update.evidenceWeightBefore,

          evidenceWeightAfter: update.evidenceWeightAfter,

          attemptCountBefore: update.attemptCountBefore,

          attemptCountAfter: update.attemptCountAfter,
        },
      });

      return {
        applied: true,

        ...event,
      };
    });
  }

  private async completeReviewSession(
    sessionId: string,
    conceptId: string,
    correctness: ReviewAnswerCorrectness,
  ): Promise<ReviewSessionStepResult> {
    const now = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const mastery = await transaction.conceptMastery.findUnique({
        where: {
          conceptId,
        },

        select: {
          reviewQuestionType: true,

          reviewIntervalDays: true,
        },
      });

      if (!mastery || !mastery.reviewQuestionType) {
        throw new InternalServerErrorException(
          `Concept ${conceptId} completed a review ` +
            'without persistent review state',
        );
      }

      const previousIntervalDays = mastery.reviewIntervalDays;

      const decision = completeConceptReview({
        correctness,

        completedAt: now,

        currentIntervalDays: previousIntervalDays,

        reviewQuestionType: mastery.reviewQuestionType,
      });

      await transaction.sessionConceptProgress.update({
        where: {
          sessionId_conceptId: {
            sessionId,

            conceptId,
          },
        },

        data: {
          status: 'COMPLETED',

          reviewRequired: false,

          completedAt: now,
        },
      });

      await transaction.conceptMastery.update({
        where: {
          conceptId,
        },

        data: {
          reviewDueAt: decision.nextReviewDueAt,

          reviewQuestionType: decision.reviewQuestionType,

          reviewIntervalDays: decision.nextReviewIntervalDays,

          lastReviewedAt: now,
        },
      });

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

      return {
        action: 'COMPLETE_REVIEW',

        reasonCode: decision.reasonCode,

        reason: decision.reason,

        correctness,

        reviewQuestionType: decision.reviewQuestionType,

        previousIntervalDays,

        nextIntervalDays: decision.nextReviewIntervalDays,

        completedAt: now,

        nextReviewDueAt: decision.nextReviewDueAt,
      };
    });
  }

  private async applyRecoveryClimbBackIfNeeded(
    sessionId: string,
    studyPackId: string,
    conceptId: string,
    answeredQuestionId: string,
    correctness: 'CORRECT' | 'PARTIAL' | 'INCORRECT',
    learningStep: LearningLoopNextStepResult,
  ): Promise<LearningLoopNextStepResult> {
    /*
     * Only successful evidence can complete a scaffold and
     * trigger the climb back toward the original level.
     */
    if (correctness !== 'CORRECT') {
      return learningStep;
    }

    const progress = await this.prisma.sessionConceptProgress.findUnique({
      where: {
        sessionId_conceptId: {
          sessionId,

          conceptId,
        },
      },

      select: {
        recoveryTargetQuestionType: true,

        recoveryOriginQuestionId: true,
      },
    });

    if (!progress?.recoveryTargetQuestionType) {
      return learningStep;
    }

    const targetQuestionType = progress.recoveryTargetQuestionType;

    /*
     * Load the exact question just answered. Its prompt is
     * supplied to the adaptive generator as an additional
     * anti-repetition signal.
     *
     * QuestionsService also rejects prompts that duplicate
     * ANY existing question for this concept, so the RETEST
     * cannot silently recreate the original failed question.
     */
    const answeredQuestion = await this.prisma.question.findFirst({
      where: {
        id: answeredQuestionId,

        conceptId,

        concept: {
          studyPackId,
        },
      },

      select: {
        prompt: true,
      },
    });

    if (!answeredQuestion) {
      throw new InternalServerErrorException(
        `Recovery could not load answered question ` + `${answeredQuestionId}`,
      );
    }

    const retest = await this.questionsService.generateAdaptiveQuestion(
      studyPackId,
      conceptId,
      targetQuestionType,
      'RETEST',
      [],
      answeredQuestion.prompt,
    );

    /*
     * Recovery has now climbed back to its target.
     *
     * Clear the recovery marker BEFORE presenting the retest.
     *
     * If the learner fails the RETEST, the normal adaptive
     * path will create a fresh recovery target again.
     */
    await this.prisma.sessionConceptProgress.update({
      where: {
        sessionId_conceptId: {
          sessionId,

          conceptId,
        },
      },

      data: {
        recoveryTargetQuestionType: null,

        recoveryOriginQuestionId: null,
      },
    });

    return {
      ...learningStep,

      action: 'ASK_QUESTION',

      reason:
        `The learner successfully completed the scaffold. ` +
        `Return to a new ${targetQuestionType} retest.`,

      nextQuestionType: targetQuestionType,

      retestQuestionType: null,

      question: {
        id: retest.id,

        type: retest.type,

        difficulty: retest.difficulty,

        prompt: retest.prompt,
      },

      remediation: null,

      reviewQuestionType: null,
    };
  }

  private async applyLearningStep(
    sessionId: string,
    currentConceptId: string,
    answeredQuestionId: string,
    learningStep: LearningLoopNextStepResult,
    correctness: 'CORRECT' | 'PARTIAL' | 'INCORRECT',
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

      /*
       * A completely incorrect answer enters recovery mode.
       *
       * AdaptivePolicy.retestQuestionType represents the
       * original level we eventually want to verify again.
       *
       * PARTIAL answers do not create a new recovery target;
       * if recovery was already active, the existing target
       * is intentionally preserved.
       */
      if (
        learningStep.action === 'REMEDIATE_AND_ASK' &&
        correctness === 'INCORRECT' &&
        learningStep.retestQuestionType
      ) {
        await this.prisma.sessionConceptProgress.update({
          where: {
            sessionId_conceptId: {
              sessionId,

              conceptId: currentConceptId,
            },
          },

          data: {
            recoveryTargetQuestionType: learningStep.retestQuestionType,

            recoveryOriginQuestionId: answeredQuestionId,
          },
        });
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

          recoveryTargetQuestionType: null,

          recoveryOriginQuestionId: null,

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

          purpose: 'BASELINE',

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

function extractPageNumber(
  metadata: unknown,
  unitKind: string,
  unitIndex: number,
): number | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const pageNumber = (metadata as Record<string, unknown>).page_number;

    if (
      typeof pageNumber === 'number' &&
      Number.isInteger(pageNumber) &&
      pageNumber > 0
    ) {
      return pageNumber;
    }
  }

  /*
   * PDF parser currently stores page units with
   * unitIndex equal to the page number as well.
   */
  if (
    unitKind.toLowerCase() === 'page' &&
    Number.isInteger(unitIndex) &&
    unitIndex > 0
  ) {
    return unitIndex;
  }

  return null;
}

function createAnalysisSourceExcerpt(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();

  const MAX_LENGTH = 360;

  if (normalized.length <= MAX_LENGTH) {
    return normalized;
  }

  return normalized.slice(0, MAX_LENGTH).trimEnd() + '…';
}
