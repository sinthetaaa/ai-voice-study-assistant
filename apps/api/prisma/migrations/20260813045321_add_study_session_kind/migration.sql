-- CreateEnum
CREATE TYPE "StudySessionKind" AS ENUM ('NORMAL', 'REVIEW');

-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN     "kind" "StudySessionKind" NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE INDEX "StudySession_kind_idx" ON "StudySession"("kind");
