jest.mock(
  '../prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
);

import type {
  ConceptAiClientService,
  ExtractedConcept,
} from './concept-ai-client.service';

import {
  ConceptsService,
} from './concepts.service';

import type {
  PrismaService,
} from '../prisma/prisma.service';

type PersistConceptsForTest = (
  studyPackId: string,
  chunks: {
    id: string;
    text: string;
    documentId: string;
    documentName: string;
    unitLabel: string | null;
  }[],
  concepts: ExtractedConcept[],
  documentId?: string,
) => Promise<{
  persistedConceptCount: number;
  persistedSourceCount: number;
}>;

describe(
  'Concept hierarchy invalidation',
  () => {
    it(
      'marks the hierarchy DIRTY and increments revision before concept writes',
      async () => {
        const transaction = {
          studyPack: {
            update: jest
              .fn()
              .mockResolvedValue({}),
          },

          conceptSource: {
            deleteMany: jest
              .fn()
              .mockResolvedValue({
                count: 0,
              }),

            createMany: jest
              .fn()
              .mockResolvedValue({
                count: 1,
              }),
          },

          concept: {
            upsert: jest
              .fn()
              .mockResolvedValue({
                id: 'atomic-1',
              }),

            deleteMany: jest
              .fn()
              .mockResolvedValue({
                count: 0,
              }),
          },
        };

        const prisma = {
          concept: {
            count: jest
              .fn()
              .mockResolvedValue(1),
          },

          conceptSource: {
            count: jest
              .fn()
              .mockResolvedValue(1),
          },

          $transaction: jest.fn(
            async (
              input:
                | ((
                    tx: typeof transaction,
                  ) => Promise<unknown>)
                | Promise<unknown>[],
            ) => {
              if (
                typeof input ===
                'function'
              ) {
                return input(
                  transaction,
                );
              }

              return Promise.all(
                input,
              );
            },
          ),
        };

        const service =
          new ConceptsService(
            prisma as unknown as
              PrismaService,
            {} as ConceptAiClientService,
          );

        const persistConcepts =
          (
            service as unknown as {
              persistConcepts:
                PersistConceptsForTest;
            }
          ).persistConcepts.bind(
            service,
          );

        const result =
          await persistConcepts(
            'pack-1',
            [
              {
                id: 'chunk-1',
                text:
                  'Q-learning updates state-action values.',
                documentId:
                  'doc-1',
                documentName:
                  'rl.pdf',
                unitLabel:
                  'Chapter 1',
              },
            ],
            [
              {
                name:
                  'Q-Learning',
                description:
                  'Q-Learning learns state-action values from interaction.',
                importance: 5,
                difficulty:
                  'INTERMEDIATE',
                supportingChunkIds: [
                  'chunk-1',
                ],
              },
            ],
            'doc-1',
          );

        expect(result).toEqual({
          persistedConceptCount: 1,
          persistedSourceCount: 1,
        });

        expect(
          transaction.studyPack.update,
        ).toHaveBeenCalledWith({
          where: {
            id: 'pack-1',
          },
          data: {
            hierarchyStatus:
              'DIRTY',
            hierarchyRevision: {
              increment: 1,
            },
            hierarchyErrorMessage:
              null,
            hierarchyUpdatedAt:
              expect.any(Date),
          },
        });

        /*
         * Both hierarchy persistence and atomic
         * concept persistence now lock StudyPack
         * before touching Concept state.
         */
        expect(
          transaction
            .studyPack
            .update
            .mock
            .invocationCallOrder[0],
        ).toBeLessThan(
          transaction
            .conceptSource
            .deleteMany
            .mock
            .invocationCallOrder[0],
        );

        expect(
          transaction
            .concept
            .upsert,
        ).toHaveBeenCalledTimes(1);
      },
    );
  },
);
