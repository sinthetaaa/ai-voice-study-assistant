import { Injectable, NotFoundException } from '@nestjs/common';

import {
  ADVANCE_EVIDENCE_THRESHOLD,
  ADVANCE_MASTERY_THRESHOLD,
} from '../adaptive/adaptive-policy';
import { PrismaService } from '../prisma/prisma.service';

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

export type StudyPackReadinessOverallState =
  | 'NO_ACTIVE_CONCEPTS'
  | 'PREPARATION_INCOMPLETE'
  | 'NORMAL_STUDY_AVAILABLE'
  | 'NORMAL_STUDY_COMPLETE';

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
};

export type StudyPackReadinessResult = {
  studyPackId: string;

  overallState: StudyPackReadinessOverallState;

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
      },
    });

    if (!studyPack) {
      throw new NotFoundException(`Study Pack ${studyPackId} was not found`);
    }

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

        const readiness = classifyStudyReadiness(concept.mastery);

        return {
          id: concept.id,

          name: concept.name,

          importance: concept.importance,

          difficulty: concept.difficulty,

          questionReady: missingQuestionTypes.length === 0,

          availableQuestionTypes,

          missingQuestionTypes,

          readiness,
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
     * Normal study can only use concepts that:
     *
     * 1. have all three READY-backed question
     *    levels, and
     * 2. do not already satisfy secure mastery.
     */
    const normalStudyConceptCount = questionReadyConcepts.filter(
      (concept) => concept.readiness.needsNormalStudy,
    ).length;

    const masteredQuestionReadyConceptCount = questionReadyConcepts.filter(
      (concept) => concept.readiness.state === 'MASTERED',
    ).length;

    const ratio =
      activeConceptCount === 0
        ? 0
        : questionReadyConceptCount / activeConceptCount;

    const overallState = this.determineOverallState(
      activeConceptCount,
      conceptsNeedingQuestionPreparation,
      normalStudyConceptCount,
    );

    return {
      studyPackId,

      overallState,

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
      },

      questionPreparationCoverage: {
        ready: questionReadyConceptCount,

        total: activeConceptCount,

        ratio,
      },

      concepts: conceptSnapshots,
    };
  }

  private determineOverallState(
    activeConceptCount: number,
    conceptsNeedingQuestionPreparation: number,
    normalStudyConceptCount: number,
  ): StudyPackReadinessOverallState {
    if (activeConceptCount === 0) {
      return 'NO_ACTIVE_CONCEPTS';
    }

    /*
     * Preparation takes precedence because a
     * pack should never appear fully ready while
     * some active concepts have not yet received
     * their complete question set.
     */
    if (conceptsNeedingQuestionPreparation > 0) {
      return 'PREPARATION_INCOMPLETE';
    }

    if (normalStudyConceptCount > 0) {
      return 'NORMAL_STUDY_AVAILABLE';
    }

    return 'NORMAL_STUDY_COMPLETE';
  }
}
