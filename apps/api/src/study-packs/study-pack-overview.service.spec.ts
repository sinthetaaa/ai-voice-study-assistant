jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../study-sessions/study-sessions.service', () => ({
  StudySessionsService: class StudySessionsService {},
}));

const { StudyPackOverviewService } = require('./study-pack-overview.service');

describe('StudyPackOverviewService', () => {
  it('returns resume state with the exact Normal session number', async () => {
    const prisma = {
      studyPack: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pack-1',
            name: 'Machine Learning',
            description: 'ML notes',
            createdAt: new Date('2026-09-01T00:00:00.000Z'),
            updatedAt: new Date('2026-09-10T00:00:00.000Z'),
            sessions: [
              {
                id: 'normal-1',
                kind: 'NORMAL',
                status: 'COMPLETED',
                startedAt: new Date('2026-09-02T10:00:00.000Z'),
                updatedAt: new Date('2026-09-02T11:00:00.000Z'),
                _count: {
                  attempts: 15,
                },
              },
              {
                id: 'review-1',
                kind: 'REVIEW',
                status: 'COMPLETED',
                startedAt: new Date('2026-09-04T10:00:00.000Z'),
                updatedAt: new Date('2026-09-06T10:15:00.000Z'),
                _count: {
                  attempts: 1,
                },
              },
              {
                id: 'normal-2',
                kind: 'NORMAL',
                status: 'ACTIVE',
                startedAt: new Date('2026-09-05T10:00:00.000Z'),
                updatedAt: new Date('2026-09-05T10:20:00.000Z'),
                _count: {
                  attempts: 3,
                },
              },
            ],
          },
        ]),
      },
    };

    const studySessionsService = {
      getStudyPackCoverage: jest.fn().mockResolvedValue({
        hierarchy: {
          authoritative: true,
        },
        percentage: 42,
        coveredCoreConceptCount: 4,
        totalCoreConceptCount: 12,
      }),
    };

    const service = new StudyPackOverviewService(prisma, studySessionsService);

    const result = await service.findAll();

    expect(result).toHaveLength(1);

    expect(result[0].coverage).toEqual({
      authoritative: true,
      percentage: 42,
      coveredCoreConceptCount: 4,
      totalCoreConceptCount: 12,
    });

    expect(result[0].normalStudy.activeSession).toEqual({
      sessionId: 'normal-2',
      sessionNumber: 2,
      startedAt: new Date('2026-09-05T10:00:00.000Z'),
      updatedAt: new Date('2026-09-05T10:20:00.000Z'),
      answeredQuestionCount: 3,
    });

    expect(result[0].normalStudy.primaryAction).toEqual({
      type: 'RESUME_NORMAL_SESSION',
      sessionId: 'normal-2',
      sessionNumber: 2,
    });

    expect(result[0].normalStudy.sessionCount).toBe(2);

    expect(result[0].normalStudy.completedSessionCount).toBe(1);

    /*
     * Review activity still counts toward "last studied",
     * even though REVIEW sessions never enter Normal
     * Study numbering.
     */
    expect(result[0].lastStudiedAt).toEqual(
      new Date('2026-09-06T10:15:00.000Z'),
    );
  });

  it('returns start state and hides stale coverage percentage', async () => {
    const prisma = {
      studyPack: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pack-2',
            name: 'Operating Systems',
            description: null,
            createdAt: new Date('2026-09-08T00:00:00.000Z'),
            updatedAt: new Date('2026-09-08T00:00:00.000Z'),
            sessions: [],
          },
        ]),
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
    };

    const service = new StudyPackOverviewService(prisma, studySessionsService);

    const result = await service.findAll();

    expect(result[0].coverage).toEqual({
      authoritative: false,
      percentage: null,
      coveredCoreConceptCount: 0,
      totalCoreConceptCount: 0,
    });

    expect(result[0].normalStudy.activeSession).toBeNull();

    expect(result[0].normalStudy.nextSessionNumber).toBe(1);

    expect(result[0].normalStudy.primaryAction).toEqual({
      type: 'START_NORMAL_SESSION',
      sessionNumber: 1,
    });

    expect(result[0].lastStudiedAt).toBeNull();
  });
});
