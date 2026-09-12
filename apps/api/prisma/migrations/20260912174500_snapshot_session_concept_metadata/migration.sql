-- =========================================================
-- SESSION CONCEPT HISTORY SNAPSHOTS
--
-- Historical Study Sessions must not depend on mutable
-- Concept metadata for learner-facing history.
-- =========================================================

ALTER TABLE "SessionConceptProgress"
ADD COLUMN "conceptNameSnapshot" TEXT,
ADD COLUMN "conceptDifficultySnapshot" "ConceptDifficulty",
ADD COLUMN "conceptImportanceSnapshot" INTEGER;

UPDATE "SessionConceptProgress" AS progress
SET
  "conceptNameSnapshot" = concept."name",
  "conceptDifficultySnapshot" = concept."difficulty",
  "conceptImportanceSnapshot" = concept."importance"
FROM "Concept" AS concept
WHERE progress."conceptId" = concept."id";

ALTER TABLE "SessionConceptProgress"
ALTER COLUMN "conceptNameSnapshot" SET NOT NULL,
ALTER COLUMN "conceptDifficultySnapshot" SET NOT NULL,
ALTER COLUMN "conceptImportanceSnapshot" SET NOT NULL;
