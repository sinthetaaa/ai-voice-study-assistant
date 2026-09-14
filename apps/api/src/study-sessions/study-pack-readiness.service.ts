import { Injectable, NotFoundException } from '@nestjs/common';

import {
  ADVANCE_EVIDENCE_THRESHOLD,
  ADVANCE_MASTERY_THRESHOLD,
} from '../adaptive/adaptive-policy';
import { PrismaService } from '../prisma/prisma.service';

import {
  buildStudyPackPreparationSnapshot,
  determineStudyPackReadinessOverallState,
  type StudyPackPreparationSnapshot,
  type StudyPackReadinessOverallState,
} from './study-pack-readiness-policy';

import {
  classifyStudyReadiness,
  StudyReadinessState,
} from './study-session-readiness';

const REQUIRED_QUESTION_TYPES = [
  'RECALL',
  'UNDERSTANDING',
  'APPLICATION',
] as const;

type RequiredQuestionType = (typeof REQUIRED_QUESTION_TYPES)[number];


export type StudyPackConceptReadiness = {
  id: string;

  name: string;

  importance: number;

  difficulty: 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';

  questionReady: boolean;

  availableQuestionTypes: RequiredQuestionType[];

  missingQuestionTypes: RequiredQuestionType[];

  readiness: {
    state: StudyReadinessState;

    masteryScore: number;

    evidenceWeight: number;

    attemptCount: number;

    needsNormalStudy: boolean;
  };

  review: {
    scheduled: boolean;

    due: boolean;

    inProgress: boolean;

    dueAt: Date | null;

    questionType: RequiredQuestionType | null;

    intervalDays: number;

    lastReviewedAt: Date | null;
  };
};

export type StudyPackReadinessResult = {
  studyPackId: string;

  overallState: StudyPackReadinessOverallState;

  preparation: StudyPackPreparationSnapshot;

  thresholds: {
    masteryScore: number;

    evidenceWeight: number;
  };

  counts: {
    activeConceptCount: number;

    questionReadyConceptCount: number;

    conceptsNeedingQuestionPreparation: number;

    unseenConceptCount: number;

    learningConceptCount: number;

    masteredConceptCount: number;

    normalStudyConceptCount: number;

    masteredQuestionReadyConceptCount: number;

    scheduledReviewCount: number;

    dueReviewCount: number;
  };

  questionPreparationCoverage: {
    ready: number;

    total: number;

    ratio: number;
  };

  concepts: StudyPackConceptReadiness[];
};

@Injectable()
export class StudyPackReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getReadiness(studyPackId: string): Promise<StudyPackReadinessResult> {
    const studyPack = await this.prisma.studyPack.findUnique({
      where: {
        id: studyPackId,
      },

      select: {
        id: true,

        hierarchyStatus: true,

        hierarchyRevision: true,

        hierarchyGeneratedRevision: true,

        documents: {
          select: {
            status: true,

            conceptStatus: true,
          },
        },
      },
    });

    if (!studyPack) {
      throw new NotFoundException(`Study Pack ${studyPackId} was not found`);
    }

    const preparation =
      buildStudyPackPreparationSnapshot({
        documents: studyPack.documents,

        hierarchyStatus:
          studyPack.hierarchyStatus,

        hierarchyRevision:
          studyPack.hierarchyRevision,

        hierarchyGeneratedRevision:
          studyPack.hierarchyGeneratedRevision,
      });

    const now = new Date();

    const activeReviewSessions = await this.prisma.studySession.findMany({
      where: {
        studyPackId,

        kind: 'REVIEW',

        status: 'ACTIVE',

        currentConceptId: {
          not: null,
        },
      },

      select: {
        currentConceptId: true,
      },
    });

    const activeReviewConceptIds = new Set(
      activeReviewSessions
        .map((session) => session.currentConceptId)
        .filter((conceptId): conceptId is string => Boolean(conceptId)),
    );

    /*
     * Only concepts with current READY source
     * provenance count as active pack concepts.
     *
     * Historical source-less concepts are
     * intentionally excluded from current pack
     * readiness.
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

      orderBy: [
        {
          importance: 'desc',
        },
        {
          createdAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],

      select: {
        id: true,

        name: true,

        importance: true,

        difficulty: true,

        mastery: {
          select: {
            masteryScore: true,

            evidenceWeight: true,

            attemptCount: true,

            reviewDueAt: true,

            reviewQuestionType: true,

            reviewIntervalDays: true,

            lastReviewedAt: true,
          },
        },

        questions: {
          where: {
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
            type: true,
          },
        },
      },
    });

    const conceptSnapshots: StudyPackConceptReadiness[] = concepts.map(
      (concept) => {
        const readyQuestionTypes = new Set<string>(
          concept.questions.map((question) => question.type),
        );

        const availableQuestionTypes = REQUIRED_QUESTION_TYPES.filter((type) =>
          readyQuestionTypes.has(type),
        );

        const missingQuestionTypes = REQUIRED_QUESTION_TYPES.filter(
          (type) => !readyQuestionTypes.has(type),
        );

        const classifiedReadiness = classifyStudyReadiness(concept.mastery);

        const scheduled = Boolean(
          concept.mastery?.reviewDueAt && concept.mastery.reviewQuestionType,
        );

        const due = Boolean(
          scheduled && concept.mastery!.reviewDueAt!.getTime() <= now.getTime(),
        );

        const inProgress = activeReviewConceptIds.has(concept.id);

        const readiness = {
          ...classifiedReadiness,

          /*
           * A scheduled review owns this
           * concept's next exposure.
           */
          needsNormalStudy: classifiedReadiness.needsNormalStudy && !scheduled,
        };

        return {
          id: concept.id,

          name: concept.name,

          importance: concept.importance,

          difficulty: concept.difficulty,

          questionReady: missingQuestionTypes.length === 0,

          availableQuestionTypes,

          missingQuestionTypes,

          readiness,

          review: {
            scheduled,

            due,

            inProgress,

            dueAt: concept.mastery?.reviewDueAt ?? null,

            questionType: concept.mastery?.reviewQuestionType ?? null,

            intervalDays: concept.mastery?.reviewIntervalDays ?? 0,

            lastReviewedAt: concept.mastery?.lastReviewedAt ?? null,
          },
        };
      },
    );

    const activeConceptCount = conceptSnapshots.length;

    const questionReadyConcepts = conceptSnapshots.filter(
      (concept) => concept.questionReady,
    );

    const questionReadyConceptCount = questionReadyConcepts.length;

    const conceptsNeedingQuestionPreparation =
      activeConceptCount - questionReadyConceptCount;

    const unseenConceptCount = conceptSnapshots.filter(
      (concept) => concept.readiness.state === 'UNSEEN',
    ).length;

    const learningConceptCount = conceptSnapshots.filter(
      (concept) => concept.readiness.state === 'LEARNING',
    ).length;

    const masteredConceptCount = conceptSnapshots.filter(
      (concept) => concept.readiness.state === 'MASTERED',
    ).length;

    /*
     * Question readiness is intentionally not a
     * Normal Study availability gate.
     *
     * The bounded session planner selects active
     * concepts first and prepares missing question
     * sets lazily for the selected batch.
     */
    const normalStudyConceptCount = conceptSnapshots.filter(
      (concept) => concept.readiness.needsNormalStudy,
    ).length;

    const masteredQuestionReadyConceptCount = questionReadyConcepts.filter(
      (concept) => concept.readiness.state === 'MASTERED',
    ).length;

    const scheduledReviewCount = conceptSnapshots.filter(
      (concept) => concept.review.scheduled,
    ).length;

    const dueReviewCount = conceptSnapshots.filter(
      (concept) => concept.review.due && !concept.review.inProgress,
    ).length;

    const ratio =
      activeConceptCount === 0
        ? 0
        : questionReadyConceptCount / activeConceptCount;

    const overallState =
      determineStudyPackReadinessOverallState(
        preparation.state,
        activeConceptCount,
        normalStudyConceptCount,
      );

    return {
      studyPackId,

      overallState,

      preparation,

      thresholds: {
        masteryScore: ADVANCE_MASTERY_THRESHOLD,

        evidenceWeight: ADVANCE_EVIDENCE_THRESHOLD,
      },

      counts: {
        activeConceptCount,

        questionReadyConceptCount,

        conceptsNeedingQuestionPreparation,

        unseenConceptCount,

        learningConceptCount,

        masteredConceptCount,

        normalStudyConceptCount,

        masteredQuestionReadyConceptCount,

        scheduledReviewCount,

        dueReviewCount,
      },

      questionPreparationCoverage: {
        ready: questionReadyConceptCount,

        total: activeConceptCount,

        ratio,
      },

      concepts: conceptSnapshots,
    };
  }


}
