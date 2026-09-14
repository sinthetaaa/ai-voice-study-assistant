import { summarizePerformanceHierarchy } from './study-pack-performance-hierarchy';

describe('Study Pack hierarchy performance aggregation', () => {
  it('rolls Atomic mastery into equal-weight Core and Topic performance', () => {
    const result = summarizePerformanceHierarchy([
      {
        id: 'topic-os',

        name: 'Operating Systems',

        position: 0,

        coreConcepts: [
          {
            id: 'core-process',

            name: 'Process Management',

            importance: 5,

            position: 0,

            atomicConcepts: [
              {
                id: 'atomic-process',

                mastery: {
                  masteryScore: 0.9,

                  evidenceWeight: 3,

                  attemptCount: 3,
                },
              },
            ],
          },

          {
            id: 'core-memory',

            name: 'Memory Management',

            importance: 4,

            position: 1,

            atomicConcepts: [
              {
                id: 'atomic-paging',

                mastery: {
                  masteryScore: 0.2,

                  evidenceWeight: 1,

                  attemptCount: 1,
                },
              },

              {
                id: 'atomic-virtual-memory',

                mastery: {
                  masteryScore: 0.4,

                  evidenceWeight: 2,

                  attemptCount: 2,
                },
              },

              {
                id: 'atomic-segmentation',

                mastery: {
                  masteryScore: 0.5,

                  evidenceWeight: 0,

                  attemptCount: 0,
                },
              },
            ],
          },
        ],
      },

      {
        id: 'topic-concurrency',

        name: 'Concurrency',

        position: 1,

        coreConcepts: [
          {
            id: 'core-sync',

            name: 'Synchronization',

            importance: 5,

            position: 0,

            atomicConcepts: [
              {
                id: 'atomic-locks',

                mastery: {
                  masteryScore: 0.7,

                  evidenceWeight: 2,

                  attemptCount: 2,
                },
              },
            ],
          },
        ],
      },
    ]);

    expect(result.coreConcepts).toEqual([
      {
        id: 'core-process',

        name: 'Process Management',

        topicId: 'topic-os',

        topicName: 'Operating Systems',

        topicPosition: 0,

        importance: 5,

        position: 0,

        atomicConceptCount: 1,

        evaluatedAtomicConceptCount: 1,

        unevaluatedAtomicConceptCount: 0,

        averageMastery: 0.9,

        totalAttemptCount: 3,

        totalEvidenceWeight: 3,
      },

      {
        id: 'core-memory',

        name: 'Memory Management',

        topicId: 'topic-os',

        topicName: 'Operating Systems',

        topicPosition: 0,

        importance: 4,

        position: 1,

        atomicConceptCount: 3,

        evaluatedAtomicConceptCount: 2,

        unevaluatedAtomicConceptCount: 1,

        averageMastery: 0.30000000000000004,

        totalAttemptCount: 3,

        totalEvidenceWeight: 3,
      },

      {
        id: 'core-sync',

        name: 'Synchronization',

        topicId: 'topic-concurrency',

        topicName: 'Concurrency',

        topicPosition: 1,

        importance: 5,

        position: 0,

        atomicConceptCount: 1,

        evaluatedAtomicConceptCount: 1,

        unevaluatedAtomicConceptCount: 0,

        averageMastery: 0.7,

        totalAttemptCount: 2,

        totalEvidenceWeight: 2,
      },
    ]);

    /*
     * Operating Systems has:
     *
     * Process Management = 0.9
     * Memory Management  = 0.3
     *
     * Topic mastery must therefore be 0.6.
     *
     * Direct Atomic averaging would incorrectly
     * give the larger Memory Core Concept more
     * influence.
     */
    expect(result.topics[0].averageMastery).toBeCloseTo(0.6);

    expect(result.topics[0]).toEqual(
      expect.objectContaining({
        id: 'topic-os',

        coreConceptCount: 2,

        evaluatedCoreConceptCount: 2,

        unevaluatedCoreConceptCount: 0,

        atomicConceptCount: 4,

        evaluatedAtomicConceptCount: 3,
      }),
    );

    expect(result.strongestCoreConcept).toEqual({
      id: 'core-process',

      name: 'Process Management',

      topicId: 'topic-os',

      topicName: 'Operating Systems',

      averageMastery: 0.9,

      evaluatedAtomicConceptCount: 1,

      atomicConceptCount: 1,
    });

    expect(result.weakestCoreConcept).toEqual({
      id: 'core-memory',

      name: 'Memory Management',

      topicId: 'topic-os',

      topicName: 'Operating Systems',

      averageMastery: 0.30000000000000004,

      evaluatedAtomicConceptCount: 2,

      atomicConceptCount: 3,
    });
  });

  it('ignores neutral zero-attempt mastery as demonstrated performance', () => {
    const result = summarizePerformanceHierarchy([
      {
        id: 'topic-db',

        name: 'Databases',

        position: 0,

        coreConcepts: [
          {
            id: 'core-indexes',

            name: 'Indexes',

            importance: 4,

            position: 0,

            atomicConcepts: [
              {
                id: 'atomic-btree',

                mastery: {
                  masteryScore: 0.5,

                  evidenceWeight: 0,

                  attemptCount: 0,
                },
              },
            ],
          },
        ],
      },
    ]);

    expect(result.coreConcepts[0].averageMastery).toBeNull();

    expect(result.topics[0].averageMastery).toBeNull();

    expect(result.strongestCoreConcept).toBeNull();

    expect(result.weakestCoreConcept).toBeNull();
  });

  it('does not invent strongest and weakest labels when evaluated Core Concepts tie', () => {
    const result = summarizePerformanceHierarchy([
      {
        id: 'topic-1',

        name: 'Topic',

        position: 0,

        coreConcepts: [
          {
            id: 'core-a',

            name: 'Core A',

            importance: 3,

            position: 0,

            atomicConcepts: [
              {
                id: 'atomic-a',

                mastery: {
                  masteryScore: 0.7,

                  evidenceWeight: 1,

                  attemptCount: 1,
                },
              },
            ],
          },

          {
            id: 'core-b',

            name: 'Core B',

            importance: 3,

            position: 1,

            atomicConcepts: [
              {
                id: 'atomic-b',

                mastery: {
                  masteryScore: 0.7,

                  evidenceWeight: 1,

                  attemptCount: 1,
                },
              },
            ],
          },
        ],
      },
    ]);

    expect(result.strongestCoreConcept).toBeNull();

    expect(result.weakestCoreConcept).toBeNull();
  });
});
