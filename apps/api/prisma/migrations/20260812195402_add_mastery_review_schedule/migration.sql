-- AlterTable
ALTER TABLE "ConceptMastery" ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewDueAt" TIMESTAMP(3),
ADD COLUMN     "reviewIntervalDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewQuestionType" "QuestionType";

-- CreateIndex
CREATE INDEX "ConceptMastery_reviewDueAt_idx" ON "ConceptMastery"("reviewDueAt");
