jest.mock(
  '../prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
);

import type {
  ConceptAiClientService,
} from './concept-ai-client.service';

import {
  ConceptsService,
} from './concepts.service';

import type {
  PrismaService,
} from '../prisma/prisma.service';

const generatedResult = {
  studyPackId: 'pack-1',
  atomicConceptCount: 3,
  topicCount: 2,
  coreConceptCount: 2,
};

function createHarness(options?: {
  unsettled?: number;
  hierarchyStatus?:
    | 'DIRTY'
    | 'GENERATING'
    | 'READY'
    | 'FAILED';
  hierarchyRevision?: number;
  generatedRevision?: number | null;
  claimCount?: number;
}) {
  const {
    unsettled = 0,
    hierarchyStatus = 'DIRTY',
    hierarchyRevision = 7,
    generatedRevision = null,
    claimCount = 1,
  } = options ?? {};

  const prisma = {
    document: {
      count: jest
        .fn()
        .mockResolvedValue(unsettled),
    },

    studyPack: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'pack-1',
          hierarchyStatus,
          hierarchyRevision,
          hierarchyGeneratedRevision:
            generatedRevision,
        }),

      updateMany: jest
        .fn()
        .mockResolvedValue({
          count: claimCount,
        }),
    },
  };

  const conceptAiClient = {};

  const service =
    new ConceptsService(
      prisma as unknown as PrismaService,
      conceptAiClient as unknown as
        ConceptAiClientService,
    );

  return {
    service,
    prisma,
  };
}

describe(
  'Concept hierarchy orchestration',
  () => {
    it(
      'waits while document concept work is unsettled',
      async () => {
        const {
          service,
          prisma,
        } = createHarness({
          unsettled: 1,
        });

        const generateSpy =
          jest
            .spyOn(
              service,
              'generateStudyPackHierarchy',
            )
            .mockResolvedValue(
              generatedResult,
            );

        const result =
          await service
            .tryGenerateStudyPackHierarchy(
              'pack-1',
            );

        expect(result).toBeNull();

        expect(
          prisma.studyPack.findUnique,
        ).not.toHaveBeenCalled();

        expect(
          generateSpy,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'skips a hierarchy already generated for the current revision',
      async () => {
        const {
          service,
          prisma,
        } = createHarness({
          hierarchyStatus:
            'READY',
          hierarchyRevision: 7,
          generatedRevision: 7,
        });

        const generateSpy =
          jest
            .spyOn(
              service,
              'generateStudyPackHierarchy',
            )
            .mockResolvedValue(
              generatedResult,
            );

        const result =
          await service
            .tryGenerateStudyPackHierarchy(
              'pack-1',
            );

        expect(result).toBeNull();

        expect(
          prisma.studyPack.updateMany,
        ).not.toHaveBeenCalled();

        expect(
          generateSpy,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'claims the exact dirty revision before generation',
      async () => {
        const {
          service,
          prisma,
        } = createHarness();

        const generateSpy =
          jest
            .spyOn(
              service,
              'generateStudyPackHierarchy',
            )
            .mockResolvedValue(
              generatedResult,
            );

        const result =
          await service
            .tryGenerateStudyPackHierarchy(
              'pack-1',
            );

        expect(result).toEqual(
          generatedResult,
        );

        expect(
          prisma.studyPack.updateMany,
        ).toHaveBeenCalledWith({
          where: {
            id: 'pack-1',
            hierarchyRevision: 7,
            hierarchyStatus: {
              in: [
                'DIRTY',
                'FAILED',
              ],
            },
          },
          data:
            expect.objectContaining({
              hierarchyStatus:
                'GENERATING',
              hierarchyErrorMessage:
                null,
            }),
        });

        expect(
          generateSpy,
        ).toHaveBeenCalledWith(
          'pack-1',
          7,
        );
      },
    );

    it(
      'does not generate when another worker wins the claim',
      async () => {
        const {
          service,
        } = createHarness({
          claimCount: 0,
        });

        const generateSpy =
          jest
            .spyOn(
              service,
              'generateStudyPackHierarchy',
            )
            .mockResolvedValue(
              generatedResult,
            );

        const result =
          await service
            .tryGenerateStudyPackHierarchy(
              'pack-1',
            );

        expect(result).toBeNull();

        expect(
          generateSpy,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'does not start another generation while one is active',
      async () => {
        const {
          service,
          prisma,
        } = createHarness({
          hierarchyStatus:
            'GENERATING',
        });

        const generateSpy =
          jest
            .spyOn(
              service,
              'generateStudyPackHierarchy',
            )
            .mockResolvedValue(
              generatedResult,
            );

        const result =
          await service
            .tryGenerateStudyPackHierarchy(
              'pack-1',
            );

        expect(result).toBeNull();

        expect(
          prisma.studyPack.updateMany,
        ).not.toHaveBeenCalled();

        expect(
          generateSpy,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'marks only its exact revision failed when generation fails',
      async () => {
        const {
          service,
          prisma,
        } = createHarness();

        jest
          .spyOn(
            service,
            'generateStudyPackHierarchy',
          )
          .mockRejectedValue(
            new Error(
              'hierarchy AI unavailable',
            ),
          );

        await expect(
          service
            .tryGenerateStudyPackHierarchy(
              'pack-1',
            ),
        ).rejects.toThrow(
          'hierarchy AI unavailable',
        );

        expect(
          prisma.studyPack.updateMany,
        ).toHaveBeenNthCalledWith(
          2,
          {
            where: {
              id: 'pack-1',
              hierarchyRevision: 7,
              hierarchyStatus:
                'GENERATING',
            },
            data:
              expect.objectContaining({
                hierarchyStatus:
                  'FAILED',
                hierarchyErrorMessage:
                  'hierarchy AI unavailable',
              }),
          },
        );
      },
    );
  },
);
