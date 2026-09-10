import {
  GeneratedConceptHierarchy,
} from './concept-ai-client.service';

export class ConceptHierarchyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConceptHierarchyValidationError';
  }
}

export type PreparedConceptHierarchy = {
  topics: {
    name: string;
    normalizedName: string;
    description: string | null;
    position: number;
    coreConcepts: {
      name: string;
      normalizedName: string;
      description: string;
      importance: number;
      position: number;
      atomicConceptIds: string[];
    }[];
  }[];
};

export function prepareConceptHierarchy(
  hierarchy: GeneratedConceptHierarchy,
  allowedAtomicConceptIds: string[],
): PreparedConceptHierarchy {
  const allowedIds = new Set(
    allowedAtomicConceptIds,
  );

  if (
    allowedIds.size !==
    allowedAtomicConceptIds.length
  ) {
    throw new ConceptHierarchyValidationError(
      'Allowed atomic concept IDs must be unique',
    );
  }

  if (allowedIds.size === 0) {
    throw new ConceptHierarchyValidationError(
      'At least one atomic concept is required',
    );
  }

  if (hierarchy.topics.length === 0) {
    throw new ConceptHierarchyValidationError(
      'Hierarchy must contain at least one Study Topic',
    );
  }

  const seenTopicNames = new Set<string>();
  const seenCoreNames = new Set<string>();
  const assignedIds = new Set<string>();

  const preparedTopics =
    hierarchy.topics.map(
      (topic, topicPosition) => {
        const normalizedTopicName =
          normalizeHierarchyName(
            topic.name,
          );

        if (!normalizedTopicName) {
          throw new ConceptHierarchyValidationError(
            'Hierarchy contains an invalid Study Topic name',
          );
        }

        if (
          seenTopicNames.has(
            normalizedTopicName,
          )
        ) {
          throw new ConceptHierarchyValidationError(
            `Hierarchy contains duplicate Study Topic name "${topic.name}"`,
          );
        }

        seenTopicNames.add(
          normalizedTopicName,
        );

        if (
          topic.coreConcepts.length === 0
        ) {
          throw new ConceptHierarchyValidationError(
            `Study Topic "${topic.name}" has no Core Concepts`,
          );
        }

        const coreConcepts =
          topic.coreConcepts.map(
            (coreConcept, corePosition) => {
              const normalizedCoreName =
                normalizeHierarchyName(
                  coreConcept.name,
                );

              if (!normalizedCoreName) {
                throw new ConceptHierarchyValidationError(
                  'Hierarchy contains an invalid Core Concept name',
                );
              }

              /*
               * CoreConcept has a Study Pack-level
               * normalized-name uniqueness constraint,
               * so duplicate names are invalid even
               * across different Topics.
               */
              if (
                seenCoreNames.has(
                  normalizedCoreName,
                )
              ) {
                throw new ConceptHierarchyValidationError(
                  `Hierarchy contains duplicate Core Concept name "${coreConcept.name}"`,
                );
              }

              seenCoreNames.add(
                normalizedCoreName,
              );

              if (
                coreConcept.atomicConceptIds
                  .length === 0
              ) {
                throw new ConceptHierarchyValidationError(
                  `Core Concept "${coreConcept.name}" has no Atomic Concepts`,
                );
              }

              for (
                const atomicConceptId
                of coreConcept
                  .atomicConceptIds
              ) {
                if (
                  !allowedIds.has(
                    atomicConceptId,
                  )
                ) {
                  throw new ConceptHierarchyValidationError(
                    'Hierarchy contains unknown atomic concept ID ' +
                      `"${atomicConceptId}"`,
                  );
                }

                if (
                  assignedIds.has(
                    atomicConceptId,
                  )
                ) {
                  throw new ConceptHierarchyValidationError(
                    'Hierarchy assigns atomic concept more than once: ' +
                      `"${atomicConceptId}"`,
                  );
                }

                assignedIds.add(
                  atomicConceptId,
                );
              }

              return {
                name: coreConcept.name,
                normalizedName:
                  normalizedCoreName,
                description:
                  coreConcept.description,
                importance:
                  coreConcept.importance,
                position: corePosition,
                atomicConceptIds: [
                  ...coreConcept
                    .atomicConceptIds,
                ],
              };
            },
          );

        return {
          name: topic.name,
          normalizedName:
            normalizedTopicName,
          description:
            topic.description,
          position: topicPosition,
          coreConcepts,
        };
      },
    );

  const missingIds =
    allowedAtomicConceptIds.filter(
      (conceptId) =>
        !assignedIds.has(conceptId),
    );

  if (missingIds.length > 0) {
    throw new ConceptHierarchyValidationError(
      'Hierarchy omitted atomic concept IDs: ' +
        missingIds.join(', '),
    );
  }

  return {
    topics: preparedTopics,
  };
}

export function normalizeHierarchyName(
  name: string,
): string {
  let normalized = name
    .normalize('NFKC')
    .trim()
    .toLowerCase();

  normalized = normalized.replace(
    /\s*\([a-z0-9-]{2,15}\)\s*$/,
    '',
  );

  normalized = normalized.replace(
    /&/g,
    ' and ',
  );

  normalized = normalized.replace(
    /[-_/]+/g,
    ' ',
  );

  normalized = normalized.replace(
    /[^a-z0-9\s]/g,
    '',
  );

  normalized = normalized.replace(
    /\s+/g,
    ' ',
  );

  return normalized.trim();
}
