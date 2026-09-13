-- StudyPack ownership is mandatory after the Phase 6 authentication migration.
-- Refuse to continue rather than silently assigning ownership if legacy data
-- still contains an unowned Study Pack.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "StudyPack"
    WHERE "ownerId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot require StudyPack.ownerId while unowned Study Packs exist';
  END IF;
END
$$;

ALTER TABLE "StudyPack"
ALTER COLUMN "ownerId" SET NOT NULL;
