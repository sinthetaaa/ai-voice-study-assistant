import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type SessionConceptDifficulty = 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';

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

  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REVIEW_REQUIRED';
};

export type StartStudySessionResult = {
  sessionId: string;

  studyPackId: string;

  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

  startedAt: Date;

  conceptCount: number;

  progress: {
    completedConceptCount: number;

    reviewRequiredCount: number;

    remainingConceptCount: number;
  };

  currentConcept: StudySessionCurrentConcept;

  currentQuestion: StudySessionQuestion;
};

type SessionReadyConcept = {
  id: string;

  name: string;

  importance: number;

  difficulty: SessionConceptDifficulty;

  createdAt: Date;

  questions: {
    id: string;

    type: 'RECALL' | 'UNDERSTANDING' | 'APPLICATION';

    difficulty: 'EASY' | 'MEDIUM' | 'HARD';

    prompt: string;
  }[];
};

@Injectable()
export class StudySessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async startSession(studyPackId: string): Promise<StartStudySessionResult> {
    /*
     * Validate the Study Pack independently so
     * that an empty/non-ready Study Pack can be
     * distinguished from a nonexistent one.
     */
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
     * Session-ready concepts must satisfy BOTH:
     *
     * 1. The concept is ACTIVE:
     *    it still has provenance from a READY
     *    document.
     *
     * 2. It has a persisted RECALL question with
     *    READY provenance.
     *
     * We deliberately do NOT require
     * UNDERSTANDING or APPLICATION here.
     *
     * This allows StudyLoop to start sessions
     * without pre-generating every question level
     * for every concept in the Study Pack.
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

    /*
     * Defensive filtering.
     *
     * The relation filter above should already
     * guarantee this, but the session creation
     * boundary should never assume nested query
     * output contains a usable question.
     */
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
     * Freeze the session concept order now.
     *
     * Priority:
     *
     * 1. higher importance
     * 2. easier conceptual difficulty
     * 3. earlier persisted concept
     * 4. stable ID tie-breaker
     *
     * Once persisted in
     * SessionConceptProgress.position,
     * later concept regeneration cannot change
     * the ordering of this already-started
     * session.
     */
    const orderedConcepts = [...readyConcepts].sort((left, right) => {
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

    /*
     * Session creation and concept-progress
     * snapshotting happen atomically.
     *
     * We never want a StudySession row without
     * its corresponding concept-order snapshot.
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

          studyPackId: true,

          status: true,

          startedAt: true,
        },
      });

      /*
       * Snapshot every session-ready concept.
       *
       * All begin PENDING except the first,
       * which is promoted immediately below.
       */
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

    return {
      sessionId: session.id,

      studyPackId: session.studyPackId,

      status: session.status,

      startedAt: session.startedAt,

      conceptCount: orderedConcepts.length,

      progress: {
        completedConceptCount: 0,

        reviewRequiredCount: 0,

        remainingConceptCount: orderedConcepts.length,
      },

      currentConcept: {
        id: firstConcept.id,

        name: firstConcept.name,

        difficulty: firstConcept.difficulty,

        importance: firstConcept.importance,

        position: 0,

        status: 'IN_PROGRESS',
      },

      currentQuestion: {
        id: firstQuestion.id,

        type: firstQuestion.type,

        difficulty: firstQuestion.difficulty,

        prompt: firstQuestion.prompt,
      },
    };
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
