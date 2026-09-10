import {
  BadRequestException,
} from '@nestjs/common';

/*
 * ConceptsService depends on PrismaService at runtime
 * because Nest emits constructor metadata.
 *
 * The generated Prisma source client imports sibling
 * modules using .js extensions. That is correct for the
 * compiled application, but Jest executes the TypeScript
 * source tree directly and cannot resolve those generated
 * .js files.
 *
 * Replace only the PrismaService module for this unit test.
 * The test supplies its own Prisma-shaped mock below.
 */
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


const atomicConcepts = [
  {
    id: 'atomic-1',
    name: 'Q-Learning',
    description:
      'Q-Learning learns state-action values from interaction.',
    importance: 5,
    difficulty:
      'INTERMEDIATE' as const,
  },
  {
    id: 'atomic-2',
    name: 'Bellman Equation',
    description:
      'The Bellman equation recursively relates value estimates.',
    importance: 5,
    difficulty:
      'INTERMEDIATE' as const,
  },
  {
    id: 'atomic-3',
    name: 'Epsilon-Greedy Strategy',
    description:
      'Epsilon-greedy balances exploration and exploitation.',
    importance: 4,
    difficulty:
      'FOUNDATIONAL' as const,
  },
];


const validHierarchy = {
  topics: [
    {
      name: 'Value-Based Learning',
      description:
        'Core ideas behind value-based reinforcement learning.',
      coreConcepts: [
        {
          name: 'Value Learning',
          description:
            'Learning and updating state-action value estimates.',
          importance: 5,
          atomicConceptIds: [
            'atomic-1',
            'atomic-2',
          ],
        },
      ],
    },
    {
      name: 'Exploration',
      description:
        'Methods for balancing known rewards with exploration.',
      coreConcepts: [
        {
          name: 'Exploration Strategies',
          description:
            'Policies that balance exploration and exploitation.',
          importance: 4,
          atomicConceptIds: [
            'atomic-3',
          ],
        },
      ],
    },
  ],
};


function createHarness() {
  const events: string[] = [];

  const transaction = {
    concept: {
      updateMany: jest
        .fn()
        .mockResolvedValue({
          count: 1,
        }),
    },

    studyTopic: {
      upsert: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'topic-1',
        })
        .mockResolvedValueOnce({
          id: 'topic-2',
        }),

      deleteMany: jest
        .fn()
        .mockResolvedValue({
          count: 0,
        }),
    },

    coreConcept: {
      upsert: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'core-1',
        })
        .mockResolvedValueOnce({
          id: 'core-2',
        }),

      deleteMany: jest
        .fn()
        .mockResolvedValue({
          count: 0,
        }),
    },
  };

  const prisma = {
    studyPack: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'pack-1',
        }),
    },

    concept: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          atomicConcepts,
        ),
    },

    $transaction: jest.fn(
      async (
        callback: (
          tx: typeof transaction,
        ) => Promise<void>,
      ) => {
        events.push(
          'transaction',
        );

        return callback(
          transaction,
        );
      },
    ),
  };

  const conceptAiClient = {
    generateHierarchy: jest.fn(
      async () => {
        events.push(
          'ai',
        );

        return validHierarchy;
      },
    ),
  };

  const service =
    new ConceptsService(
      prisma as unknown as PrismaService,
      conceptAiClient as unknown as
        ConceptAiClientService,
    );

  return {
    service,
    prisma,
    transaction,
    conceptAiClient,
    events,
  };
}


describe(
  'Concept hierarchy persistence',
  () => {
    it(
      'persists a complete hierarchy using stable atomic Concept IDs',
      async () => {
        const {
          service,
          transaction,
          conceptAiClient,
        } = createHarness();

        const result =
          await service
            .generateStudyPackHierarchy(
              'pack-1',
            );

        expect(result).toEqual({
          studyPackId:
            'pack-1',
          atomicConceptCount: 3,
          topicCount: 2,
          coreConceptCount: 2,
        });

        expect(
          conceptAiClient
            .generateHierarchy,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          conceptAiClient
            .generateHierarchy,
        ).toHaveBeenCalledWith(
          atomicConcepts,
        );

        /*
         * First write detaches stale hierarchy
         * membership without deleting Concept rows.
         */
        expect(
          transaction
            .concept
            .updateMany,
        ).toHaveBeenNthCalledWith(
          1,
          {
            where: {
              studyPackId:
                'pack-1',
            },
            data: {
              coreConceptId:
                null,
              positionInCore:
                null,
            },
          },
        );

        expect(
          transaction
            .studyTopic
            .upsert,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          transaction
            .coreConcept
            .upsert,
        ).toHaveBeenCalledTimes(
          2,
        );

        /*
         * Three additional updateMany calls assign
         * the three Atomic Concepts.
         */
        expect(
          transaction
            .concept
            .updateMany,
        ).toHaveBeenCalledTimes(
          4,
        );

        expect(
          transaction
            .concept
            .updateMany,
        ).toHaveBeenNthCalledWith(
          2,
          {
            where: {
              id: 'atomic-1',
              studyPackId:
                'pack-1',
            },
            data: {
              coreConceptId:
                'core-1',
              positionInCore:
                0,
            },
          },
        );

        expect(
          transaction
            .concept
            .updateMany,
        ).toHaveBeenNthCalledWith(
          3,
          {
            where: {
              id: 'atomic-2',
              studyPackId:
                'pack-1',
            },
            data: {
              coreConceptId:
                'core-1',
              positionInCore:
                1,
            },
          },
        );

        expect(
          transaction
            .concept
            .updateMany,
        ).toHaveBeenNthCalledWith(
          4,
          {
            where: {
              id: 'atomic-3',
              studyPackId:
                'pack-1',
            },
            data: {
              coreConceptId:
                'core-2',
              positionInCore:
                0,
            },
          },
        );

        expect(
          transaction
            .coreConcept
            .deleteMany,
        ).toHaveBeenCalledWith({
          where: {
            studyPackId:
              'pack-1',
            id: {
              notIn: [
                'core-1',
                'core-2',
              ],
            },
          },
        });

        expect(
          transaction
            .studyTopic
            .deleteMany,
        ).toHaveBeenCalledWith({
          where: {
            studyPackId:
              'pack-1',
            id: {
              notIn: [
                'topic-1',
                'topic-2',
              ],
            },
          },
        });
      },
    );

    it(
      'performs the AI call before opening the persistence transaction',
      async () => {
        const {
          service,
          events,
        } = createHarness();

        await service
          .generateStudyPackHierarchy(
            'pack-1',
          );

        expect(events).toEqual([
          'ai',
          'transaction',
        ]);
      },
    );

    it(
      'rejects an invalid hierarchy before any database writes',
      async () => {
        const {
          service,
          prisma,
          conceptAiClient,
        } = createHarness();

        conceptAiClient
          .generateHierarchy
          .mockResolvedValueOnce({
            topics: [
              {
                name:
                  'Invalid Topic',
                description:
                  'An invalid hierarchy response.',
                coreConcepts: [
                  {
                    name:
                      'Invalid Core',
                    description:
                      'Contains an atomic concept that was never supplied.',
                    importance: 3,
                    atomicConceptIds: [
                      'atomic-1',
                      'invented-id',
                    ],
                  },
                ],
              },
            ],
          });

        await expect(
          service
            .generateStudyPackHierarchy(
              'pack-1',
            ),
        ).rejects.toBeInstanceOf(
          BadRequestException,
        );

        expect(
          prisma.$transaction,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'enforces Study Pack ownership again at the write boundary',
      async () => {
        const {
          service,
          transaction,
        } = createHarness();

        /*
         * Call 1 is the hierarchy-detach operation.
         * Call 2 attempts to assign atomic-1.
         *
         * A count of zero simulates the atomic ID not
         * belonging to this Study Pack at write time.
         */
        transaction
          .concept
          .updateMany
          .mockResolvedValueOnce({
            count: 3,
          })
          .mockResolvedValueOnce({
            count: 0,
          });

        await expect(
          service
            .generateStudyPackHierarchy(
              'pack-1',
            ),
        ).rejects.toThrow(
          'Atomic Concept hierarchy assignment failed for atomic-1',
        );

        expect(
          transaction
            .concept
            .updateMany,
        ).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            where: {
              id: 'atomic-1',
              studyPackId:
                'pack-1',
            },
          }),
        );
      },
    );
  },
);
