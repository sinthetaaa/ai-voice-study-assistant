/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import type { PrismaService } from '../prisma/prisma.service';

const { StudyPackReadinessService } =
  require('./study-pack-readiness.service') as typeof import('./study-pack-readiness.service');

function readyPack() {
  return {
    id: 'pack-1',
    hierarchyStatus: 'READY',
    hierarchyRevision: 2,
    hierarchyGeneratedRevision: 2,
    documents: [
      {
        status: 'READY',
        conceptStatus: 'READY',
      },
    ],
  };
}

function activeConcept() {
  return {
    id: 'concept-1',
    name: 'Gradient descent',
    importance: 3,
    difficulty: 'INTERMEDIATE',
    mastery: null,
    questions: [],
  };
}

function createHarness({
  studyPack = readyPack(),
  concepts = [activeConcept()],
}: {
  studyPack?: ReturnType<typeof readyPack>;
  concepts?: ReturnType<typeof activeConcept>[];
} = {}) {
  const prisma = {
    studyPack: {
      findUnique: jest.fn().mockResolvedValue(studyPack),
    },

    studySession: {
      findMany: jest.fn().mockResolvedValue([]),
    },

    concept: {
      findMany: jest.fn().mockResolvedValue(concepts),
    },
  };

  const service = new StudyPackReadinessService(
    prisma as unknown as PrismaService,
  );

  return {
    service,
    prisma,
  };
}

describe('StudyPackReadinessService', () => {
  it('does not report ready while a document is still uploading or extracting concepts', async () => {
    const { service } = createHarness({
      studyPack: {
        ...readyPack(),

        hierarchyStatus: 'DIRTY',
        hierarchyGeneratedRevision: null,

        documents: [
          {
            status: 'UPLOADED',
            conceptStatus: 'PENDING',
          },
        ],
      },
    });

    const result = await service.getReadiness('pack-1');

    expect(result.preparation.state).toBe('INCOMPLETE');

    /*
     * Even if stale/current concept rows happen to
     * exist, preparation wins.
     */
    expect(result.counts.activeConceptCount).toBe(1);

    expect(result.overallState).toBe('PREPARATION_INCOMPLETE');
  });

  it('allows Normal Study before every active concept has a full generated question set', async () => {
    const { service } = createHarness();

    const result = await service.getReadiness('pack-1');

    expect(result.preparation.state).toBe('READY');

    expect(result.counts.questionReadyConceptCount).toBe(0);

    expect(result.counts.conceptsNeedingQuestionPreparation).toBe(1);

    expect(result.counts.normalStudyConceptCount).toBe(1);

    expect(result.overallState).toBe('NORMAL_STUDY_AVAILABLE');
  });

  it('reports a settled hierarchy failure explicitly', async () => {
    const { service } = createHarness({
      studyPack: {
        ...readyPack(),

        hierarchyStatus: 'FAILED',
        hierarchyGeneratedRevision: null,

        documents: [
          {
            status: 'READY',
            conceptStatus: 'FAILED',
          },
        ],
      },

      concepts: [],
    });

    const result = await service.getReadiness('pack-1');

    expect(result.preparation.state).toBe('FAILED');

    expect(result.preparation.hasWarnings).toBe(true);

    expect(result.overallState).toBe('PREPARATION_FAILED');
  });
});
