/* eslint-disable @typescript-eslint/no-require-imports */

import type { PrismaService } from '../prisma/prisma.service';
import type { StudySessionsService } from '../study-sessions/study-sessions.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../study-sessions/study-sessions.service', () => ({
  StudySessionsService: class StudySessionsService {},
}));

const { StudyPackProgressService } =
  require('./study-pack-progress.service') as typeof import('./study-pack-progress.service');

describe('StudyPackProgressService', () => {
  it('returns historical sessions using persisted concept snapshots', async () => {
    const prisma = {
      studyPack: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pack-1',
          name: 'Algorithms',
          description: 'Algorithm notes',

          createdAt: new Date('2026-09-01T00:00:00.000Z'),

          updatedAt: new Date('2026-09-12T00:00:00.000Z'),

          sessions: [
            {
              id: 'normal-1',
              kind: 'NORMAL',
              status: 'COMPLETED',

              startedAt: new Date('2026-09-02T10:00:00.000Z'),

              completedAt: new Date('2026-09-02T10:30:00.000Z'),

              updatedAt: new Date('2026-09-02T10:30:00.000Z'),

              _count: {
                attempts: 15,
              },

              conceptProgress: [
                {
                  conceptId: 'concept-1',

                  conceptNameSnapshot: 'Binary Trees',

                  conceptDifficultySnapshot: 'INTERMEDIATE',

                  conceptImportanceSnapshot: 4,

                  position: 0,
                  status: 'COMPLETED',

                  reviewRequired: false,

                  sessionMasteryScore: 0.82,
                  sessionEvidenceWeight: 2.5,
                  sessionAttemptCount: 3,

                  startedAt: new Date('2026-09-02T10:00:00.000Z'),

                  completedAt: new Date('2026-09-02T10:08:00.000Z'),
                },
              ],
            },

            {
              id: 'review-1',
              kind: 'REVIEW',
              status: 'COMPLETED',

              startedAt: new Date('2026-09-04T10:00:00.000Z'),

              completedAt: new Date('2026-09-04T10:05:00.000Z'),

              updatedAt: new Date('2026-09-04T10:05:00.000Z'),

              _count: {
                attempts: 1,
              },

              conceptProgress: [],
            },

            {
              id: 'normal-2',
              kind: 'NORMAL',
              status: 'ACTIVE',

              startedAt: new Date('2026-09-06T10:00:00.000Z'),

              completedAt: null,

              updatedAt: new Date('2026-09-06T10:15:00.000Z'),

              _count: {
                attempts: 3,
              },

              conceptProgress: [
                {
                  conceptId: 'concept-2',

                  conceptNameSnapshot: 'Graph Traversal',

                  conceptDifficultySnapshot: 'FOUNDATIONAL',

                  conceptImportanceSnapshot: 5,

                  position: 0,
                  status: 'IN_PROGRESS',

                  reviewRequired: true,

                  sessionMasteryScore: 0.55,
                  sessionEvidenceWeight: 1,
                  sessionAttemptCount: 1,

                  startedAt: new Date('2026-09-06T10:00:00.000Z'),

                  completedAt: null,
                },
              ],
            },
          ],
        }),
      },
    };

    const studySessionsService = {
      getStudyPackCoverage: jest.fn().mockResolvedValue({
        hierarchy: {
          authoritative: true,
        },

        percentage: 40,

        coveredCoreConceptCount: 4,
        totalCoreConceptCount: 10,
      }),

      getSessionState: jest.fn().mockResolvedValue({
        sessionId: 'normal-2',
        studyPackId: 'pack-1',

        kind: 'NORMAL',
        status: 'ACTIVE',

        sessionNumber: 2,

        startedAt: new Date('2026-09-06T10:00:00.000Z'),

        completedAt: null,

        conceptCount: 1,

        progress: {
          completedConceptCount: 0,
          reviewRequiredCount: 1,
          remainingConceptCount: 1,

          answeredQuestionCount: 3,
          targetQuestionCount: 3,
          maximumQuestionCount: 20,

          remainingToTarget: 0,
          remainingToMaximum: 17,

          targetReached: true,
          maximumReached: false,
        },

        currentConcept: {},
        currentQuestion: {},
        conceptFlow: [],
      }),
    };

    const service = new StudyPackProgressService(
      prisma as unknown as PrismaService,
      studySessionsService as unknown as StudySessionsService,
    );

    const result = await service.findOne('pack-1', 'user-1');

    expect(prisma.studyPack.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'pack-1',
          ownerId: 'user-1',
        },
      }),
    );

    expect(result.normalStudy.sessionCount).toBe(2);

    expect(result.normalStudy.completedSessionCount).toBe(1);

    expect(result.normalStudy.activeSession).toEqual(
      expect.objectContaining({
        sessionId: 'normal-2',
        sessionNumber: 2,
      }),
    );

    expect(result.normalStudy.primaryAction).toEqual({
      type: 'RESUME_NORMAL_SESSION',
      sessionId: 'normal-2',
      sessionNumber: 2,
    });

    expect(result.history.map((session) => session.sessionId)).toEqual([
      'normal-2',
      'review-1',
      'normal-1',
    ]);

    expect(result.history.map((session) => session.sessionNumber)).toEqual([
      2,
      null,
      1,
    ]);

    expect(result.history[2].concepts[0]).toEqual(
      expect.objectContaining({
        conceptId: 'concept-1',
        name: 'Binary Trees',
        difficulty: 'INTERMEDIATE',
        importance: 4,

        mastery: {
          score: 0.82,
          evidenceWeight: 2.5,
          attemptCount: 3,
        },
      }),
    );

    expect(result.lastStudiedAt).toEqual(new Date('2026-09-06T10:15:00.000Z'));
  });

  it('returns start state and null stale coverage for a pack without sessions', async () => {
    const prisma = {
      studyPack: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pack-2',
          name: 'Databases',
          description: null,

          createdAt: new Date('2026-09-10T00:00:00.000Z'),

          updatedAt: new Date('2026-09-10T00:00:00.000Z'),

          sessions: [],
        }),
      },
    };

    const studySessionsService = {
      getStudyPackCoverage: jest.fn().mockResolvedValue({
        hierarchy: {
          authoritative: false,
        },

        percentage: 0,

        coveredCoreConceptCount: 0,
        totalCoreConceptCount: 0,
      }),

      getSessionState: jest.fn(),
    };

    const service = new StudyPackProgressService(
      prisma as unknown as PrismaService,
      studySessionsService as unknown as StudySessionsService,
    );

    const result = await service.findOne('pack-2', 'user-1');

    expect(result.coverage).toEqual({
      authoritative: false,
      percentage: null,

      coveredCoreConceptCount: 0,
      totalCoreConceptCount: 0,
    });

    expect(result.normalStudy.activeSession).toBeNull();

    expect(result.normalStudy.nextSessionNumber).toBe(1);

    expect(result.normalStudy.primaryAction).toEqual({
      type: 'START_NORMAL_SESSION',
      sessionNumber: 1,
    });

    expect(result.history).toEqual([]);
    expect(result.lastStudiedAt).toBeNull();

    expect(studySessionsService.getSessionState).not.toHaveBeenCalled();
  });
});
