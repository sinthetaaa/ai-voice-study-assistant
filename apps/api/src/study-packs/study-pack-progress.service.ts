import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  StudySessionStateResult,
  StudySessionsService,
} from '../study-sessions/study-sessions.service';

export type StudyPackProgressPrimaryAction =
  | {
      type: 'RESUME_NORMAL_SESSION';
      sessionId: string;
      sessionNumber: number;
    }
  | {
      type: 'START_NORMAL_SESSION';
      sessionNumber: number;
    };

export type StudyPackProgressResult = {
  studyPack: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  };

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
      progress: StudySessionStateResult['progress'];
    } | null;
    nextSessionNumber: number;
    primaryAction: StudyPackProgressPrimaryAction;
  };

  lastStudiedAt: Date | null;

  history: Array<{
    sessionId: string;
    sessionNumber: number | null;
    kind: 'NORMAL' | 'REVIEW';
    status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

    startedAt: Date;
    completedAt: Date | null;
    updatedAt: Date;

    answeredQuestionCount: number;

    conceptCount: number;
    completedConceptCount: number;
    reviewRequiredCount: number;

    concepts: Array<{
      conceptId: string;
      name: string;
      difficulty: 'FOUNDATIONAL' | 'INTERMEDIATE' | 'ADVANCED';
      importance: number;

      position: number;
      status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REVIEW_REQUIRED';

      reviewRequired: boolean;

      mastery: {
        score: number;
        evidenceWeight: number;
        attemptCount: number;
      };

      startedAt: Date | null;
      completedAt: Date | null;
    }>;
  }>;
};

@Injectable()
export class StudyPackProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studySessionsService: StudySessionsService,
  ) {}

  async findOne(
    studyPackId: string,
    ownerId: string,
  ): Promise<StudyPackProgressResult> {
    const studyPack = await this.prisma.studyPack.findFirst({
      where: {
        id: studyPackId,
        ownerId,
      },

      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,

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
            completedAt: true,
            updatedAt: true,

            _count: {
              select: {
                attempts: true,
              },
            },

            conceptProgress: {
              orderBy: {
                position: 'asc',
              },

              select: {
                conceptId: true,

                conceptNameSnapshot: true,
                conceptDifficultySnapshot: true,
                conceptImportanceSnapshot: true,

                position: true,
                status: true,
                reviewRequired: true,

                sessionMasteryScore: true,
                sessionEvidenceWeight: true,
                sessionAttemptCount: true,

                startedAt: true,
                completedAt: true,
              },
            },
          },
        },
      },
    });

    if (!studyPack) {
      throw new NotFoundException(`Study Pack ${studyPackId} was not found`);
    }

    const coverage =
      await this.studySessionsService.getStudyPackCoverage(studyPackId);

    /*
     * NORMAL numbering uses the same chronological population
     * as StudySessionsService.getSessionState():
     *
     * startedAt ASC, then id ASC, with REVIEW excluded.
     */
    const normalSessions = studyPack.sessions.filter(
      (session) => session.kind === 'NORMAL',
    );

    const normalSessionNumberById = new Map<string, number>();

    normalSessions.forEach((session, index) => {
      normalSessionNumberById.set(session.id, index + 1);
    });

    const activeNormalSession =
      normalSessions.find((session) => session.status === 'ACTIVE') ?? null;

    let activeSession:
      StudyPackProgressResult['normalStudy']['activeSession'] | null = null;

    if (activeNormalSession) {
      const state = await this.studySessionsService.getSessionState(
        activeNormalSession.id,
      );

      if (state.sessionNumber === null) {
        throw new Error(
          `ACTIVE NORMAL StudySession ${activeNormalSession.id} ` +
            'does not have a session number',
        );
      }

      activeSession = {
        sessionId: state.sessionId,
        sessionNumber: state.sessionNumber,
        startedAt: state.startedAt,
        progress: state.progress,
      };
    }

    const completedSessionCount = normalSessions.filter(
      (session) => session.status === 'COMPLETED',
    ).length;

    const nextSessionNumber = normalSessions.length + 1;

    const primaryAction: StudyPackProgressPrimaryAction = activeSession
      ? {
          type: 'RESUME_NORMAL_SESSION',
          sessionId: activeSession.sessionId,
          sessionNumber: activeSession.sessionNumber,
        }
      : {
          type: 'START_NORMAL_SESSION',
          sessionNumber: nextSessionNumber,
        };

    const lastStudiedAt = studyPack.sessions.reduce<Date | null>(
      (latest, session) => {
        if (!latest || session.updatedAt.getTime() > latest.getTime()) {
          return session.updatedAt;
        }

        return latest;
      },
      null,
    );

    const history = [...studyPack.sessions].reverse().map((session) => {
      const completedConceptCount = session.conceptProgress.filter(
        (progress) => progress.status === 'COMPLETED',
      ).length;

      const reviewRequiredCount = session.conceptProgress.filter(
        (progress) => progress.reviewRequired,
      ).length;

      return {
        sessionId: session.id,

        sessionNumber:
          session.kind === 'NORMAL'
            ? (normalSessionNumberById.get(session.id) ?? null)
            : null,

        kind: session.kind,
        status: session.status,

        startedAt: session.startedAt,
        completedAt: session.completedAt,
        updatedAt: session.updatedAt,

        answeredQuestionCount: session._count.attempts,

        conceptCount: session.conceptProgress.length,

        completedConceptCount,
        reviewRequiredCount,

        /*
         * Historical display intentionally uses persisted
         * snapshots rather than the mutable Concept row.
         */
        concepts: session.conceptProgress.map((progress) => ({
          conceptId: progress.conceptId,

          name: progress.conceptNameSnapshot,

          difficulty: progress.conceptDifficultySnapshot,

          importance: progress.conceptImportanceSnapshot,

          position: progress.position,

          status: progress.status,

          reviewRequired: progress.reviewRequired,

          mastery: {
            score: progress.sessionMasteryScore,

            evidenceWeight: progress.sessionEvidenceWeight,

            attemptCount: progress.sessionAttemptCount,
          },

          startedAt: progress.startedAt,

          completedAt: progress.completedAt,
        })),
      };
    });

    return {
      studyPack: {
        id: studyPack.id,
        name: studyPack.name,
        description: studyPack.description,
        createdAt: studyPack.createdAt,
        updatedAt: studyPack.updatedAt,
      },

      coverage: {
        authoritative: coverage.hierarchy.authoritative,

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

      history,
    };
  }
}
