import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { StudySessionsService } from '../study-sessions/study-sessions.service';

export type StudyPackOverviewPrimaryAction =
  | {
      type: 'RESUME_NORMAL_SESSION';
      sessionId: string;
      sessionNumber: number;
    }
  | {
      type: 'START_NORMAL_SESSION';
      sessionNumber: number;
    };

export type StudyPackOverviewItem = {
  studyPackId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;

  coverage: {
    authoritative: boolean;
    percentage: number | null;
    coveredCoreConceptCount: number;
    totalCoreConceptCount: number;
  };

  normalStudy: {
    sessionCount: number;
    completedSessionCount: number;

    activeSession: {
      sessionId: string;
      sessionNumber: number;
      startedAt: Date;
      updatedAt: Date;
      answeredQuestionCount: number;
    } | null;

    nextSessionNumber: number;
    primaryAction: StudyPackOverviewPrimaryAction;
  };

  lastStudiedAt: Date | null;
};

@Injectable()
export class StudyPackOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studySessionsService: StudySessionsService,
  ) {}

  async findAll(): Promise<StudyPackOverviewItem[]> {
    const studyPacks = await this.prisma.studyPack.findMany({
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'asc',
        },
      ],
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,

        /*
         * Load all session kinds because review activity still
         * counts as "last studied".
         *
         * NORMAL session numbering is derived separately below.
         */
        sessions: {
          orderBy: [
            {
              startedAt: 'asc',
            },
            {
              id: 'asc',
            },
          ],
          select: {
            id: true,
            kind: true,
            status: true,
            startedAt: true,
            updatedAt: true,
            _count: {
              select: {
                attempts: true,
              },
            },
          },
        },
      },
    });

    const overviews = await Promise.all(
      studyPacks.map(async (studyPack) => {
        const coverage = await this.studySessionsService.getStudyPackCoverage(
          studyPack.id,
        );

        /*
         * Filtering preserves the original startedAt + id order,
         * which is the same ordering used by getSessionState()
         * when calculating human-facing NORMAL session numbers.
         */
        const normalSessions = studyPack.sessions.filter(
          (session) => session.kind === 'NORMAL',
        );

        const activeNormalIndex = normalSessions.findIndex(
          (session) => session.status === 'ACTIVE',
        );

        const activeNormalSession =
          activeNormalIndex >= 0 ? normalSessions[activeNormalIndex] : null;

        const activeSession = activeNormalSession
          ? {
              sessionId: activeNormalSession.id,
              sessionNumber: activeNormalIndex + 1,
              startedAt: activeNormalSession.startedAt,
              updatedAt: activeNormalSession.updatedAt,
              answeredQuestionCount: activeNormalSession._count.attempts,
            }
          : null;

        const completedSessionCount = normalSessions.filter(
          (session) => session.status === 'COMPLETED',
        ).length;

        const nextSessionNumber = normalSessions.length + 1;

        const lastStudiedAt = studyPack.sessions.reduce<Date | null>(
          (latest, session) => {
            if (!latest || session.updatedAt.getTime() > latest.getTime()) {
              return session.updatedAt;
            }

            return latest;
          },
          null,
        );

        const primaryAction: StudyPackOverviewPrimaryAction = activeSession
          ? {
              type: 'RESUME_NORMAL_SESSION',
              sessionId: activeSession.sessionId,
              sessionNumber: activeSession.sessionNumber,
            }
          : {
              type: 'START_NORMAL_SESSION',
              sessionNumber: nextSessionNumber,
            };

        return {
          studyPackId: studyPack.id,
          name: studyPack.name,
          description: studyPack.description,
          createdAt: studyPack.createdAt,
          updatedAt: studyPack.updatedAt,

          coverage: {
            authoritative: coverage.hierarchy.authoritative,

            /*
             * 0% and "coverage is not authoritative yet"
             * are different learner states.
             */
            percentage: coverage.hierarchy.authoritative
              ? coverage.percentage
              : null,

            coveredCoreConceptCount: coverage.coveredCoreConceptCount,

            totalCoreConceptCount: coverage.totalCoreConceptCount,
          },

          normalStudy: {
            sessionCount: normalSessions.length,
            completedSessionCount,
            activeSession,
            nextSessionNumber,
            primaryAction,
          },

          lastStudiedAt,
        };
      }),
    );

    /*
     * My Studies should surface recent learning activity first.
     * Packs never studied use their creation time as fallback.
     */
    return overviews.sort((left, right) => {
      const leftActivity = left.lastStudiedAt ?? left.createdAt;

      const rightActivity = right.lastStudiedAt ?? right.createdAt;

      const activityDifference =
        rightActivity.getTime() - leftActivity.getTime();

      if (activityDifference !== 0) {
        return activityDifference;
      }

      return left.studyPackId.localeCompare(right.studyPackId);
    });
  }
}
