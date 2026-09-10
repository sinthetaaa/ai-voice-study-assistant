import {
  ConceptHierarchyValidationError,
  prepareConceptHierarchy,
} from './concept-hierarchy';

const validHierarchy = () => ({
  topics: [
    {
      name: 'Learning Foundations',
      description:
        'Foundational learning ideas.',
      coreConcepts: [
        {
          name: 'Value Learning',
          description:
            'Core ideas around learned values.',
          importance: 5,
          atomicConceptIds: [
            'concept-1',
            'concept-2',
          ],
        },
      ],
    },
    {
      name: 'Learning Strategies',
      description:
        'Strategies used during learning.',
      coreConcepts: [
        {
          name: 'Exploration',
          description:
            'Methods for balancing exploration.',
          importance: 4,
          atomicConceptIds: [
            'concept-3',
          ],
        },
      ],
    },
  ],
});

describe('prepareConceptHierarchy', () => {
  const allowedIds = [
    'concept-1',
    'concept-2',
    'concept-3',
  ];

  it('prepares a complete valid hierarchy', () => {
    const prepared =
      prepareConceptHierarchy(
        validHierarchy(),
        allowedIds,
      );

    expect(prepared.topics).toHaveLength(2);
    expect(prepared.topics[0].position).toBe(0);

    expect(
      prepared.topics[0]
        .coreConcepts[0]
        .position,
    ).toBe(0);
  });

  it('rejects unknown atomic concepts', () => {
    const hierarchy =
      validHierarchy();

    hierarchy.topics[1]
      .coreConcepts[0]
      .atomicConceptIds = [
        'concept-3',
        'invented',
      ];

    expect(() =>
      prepareConceptHierarchy(
        hierarchy,
        allowedIds,
      ),
    ).toThrow(
      ConceptHierarchyValidationError,
    );
  });

  it('rejects duplicate membership', () => {
    const hierarchy =
      validHierarchy();

    hierarchy.topics[1]
      .coreConcepts[0]
      .atomicConceptIds = [
        'concept-2',
        'concept-3',
      ];

    expect(() =>
      prepareConceptHierarchy(
        hierarchy,
        allowedIds,
      ),
    ).toThrow(
      /more than once/,
    );
  });

  it('rejects omitted atomic concepts', () => {
    const hierarchy =
      validHierarchy();

    hierarchy.topics =
      hierarchy.topics.slice(
        0,
        1,
      );

    expect(() =>
      prepareConceptHierarchy(
        hierarchy,
        allowedIds,
      ),
    ).toThrow(
      /omitted atomic concept IDs/,
    );
  });

  it('rejects duplicate normalized Topic names', () => {
    const hierarchy =
      validHierarchy();

    hierarchy.topics[1].name =
      'Learning-Foundations';

    expect(() =>
      prepareConceptHierarchy(
        hierarchy,
        allowedIds,
      ),
    ).toThrow(
      /duplicate Study Topic name/,
    );
  });

  it('rejects duplicate Core Concept names across Topics', () => {
    const hierarchy =
      validHierarchy();

    hierarchy.topics[1]
      .coreConcepts[0].name =
      'Value Learning';

    expect(() =>
      prepareConceptHierarchy(
        hierarchy,
        allowedIds,
      ),
    ).toThrow(
      /duplicate Core Concept name/,
    );
  });
});
