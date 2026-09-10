/*
 * Backfill Document.conceptStatus for documents that
 * existed before explicit concept-processing state
 * was introduced.
 *
 * READY + persisted ConceptSource provenance => READY
 * FAILED document                           => FAILED
 * everything else                          => PENDING
 */

UPDATE "Document" AS d
SET
  "conceptStatus" =
    CASE
      WHEN d."status" = 'FAILED'
        THEN 'FAILED'::"DocumentConceptStatus"

      WHEN d."status" = 'READY'
        AND EXISTS (
          SELECT 1
          FROM "ConceptSource" cs
          INNER JOIN "DocumentChunk" dc
            ON dc."id" = cs."chunkId"
          INNER JOIN "DocumentUnit" du
            ON du."id" = dc."unitId"
          WHERE du."documentId" = d."id"
        )
        THEN 'READY'::"DocumentConceptStatus"

      ELSE 'PENDING'::"DocumentConceptStatus"
    END,

  "conceptErrorMessage" =
    CASE
      WHEN d."status" = 'FAILED'
        THEN d."errorMessage"
      ELSE NULL
    END;
