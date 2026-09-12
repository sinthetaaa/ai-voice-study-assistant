-- =========================================================
-- NORMAL STUDY SESSION LIFECYCLE INVARIANT
--
-- A Study Pack may have at most one ACTIVE NORMAL session.
--
-- Historical duplicate ACTIVE sessions may exist from the
-- previous startSession implementation. Preserve the earliest
-- sitting and mark later duplicates ABANDONED before creating
-- the partial unique index.
-- =========================================================

WITH ranked_active_normal_sessions AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "studyPackId"
      ORDER BY "startedAt" ASC, "id" ASC
    ) AS "rowNumber"
  FROM "StudySession"
  WHERE
    "kind" = 'NORMAL'
    AND "status" = 'ACTIVE'
)
UPDATE "StudySession" AS session
SET
  "status" = 'ABANDONED',
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_active_normal_sessions AS ranked
WHERE
  session."id" = ranked."id"
  AND ranked."rowNumber" > 1;

CREATE UNIQUE INDEX
  "StudySession_one_active_normal_per_pack"
ON "StudySession" ("studyPackId")
WHERE
  "kind" = 'NORMAL'
  AND "status" = 'ACTIVE';
