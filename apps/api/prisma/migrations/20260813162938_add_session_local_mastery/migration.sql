-- AlterTable
ALTER TABLE "SessionConceptProgress" ADD COLUMN     "sessionAlpha" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "sessionAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sessionBeta" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "sessionEvidenceWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "sessionMasteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0;

-- CreateTable
CREATE TABLE "SessionMasteryEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "alphaBefore" DOUBLE PRECISION NOT NULL,
    "betaBefore" DOUBLE PRECISION NOT NULL,
    "alphaAfter" DOUBLE PRECISION NOT NULL,
    "betaAfter" DOUBLE PRECISION NOT NULL,
    "masteryBefore" DOUBLE PRECISION NOT NULL,
    "masteryAfter" DOUBLE PRECISION NOT NULL,
    "evidenceWeightBefore" DOUBLE PRECISION NOT NULL,
    "evidenceWeightAfter" DOUBLE PRECISION NOT NULL,
    "attemptCountBefore" INTEGER NOT NULL,
    "attemptCountAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionMasteryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionMasteryEvent_evaluationId_key" ON "SessionMasteryEvent"("evaluationId");

-- CreateIndex
CREATE INDEX "SessionMasteryEvent_sessionId_conceptId_idx" ON "SessionMasteryEvent"("sessionId", "conceptId");

-- CreateIndex
CREATE INDEX "SessionMasteryEvent_createdAt_idx" ON "SessionMasteryEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "SessionMasteryEvent" ADD CONSTRAINT "SessionMasteryEvent_sessionId_conceptId_fkey" FOREIGN KEY ("sessionId", "conceptId") REFERENCES "SessionConceptProgress"("sessionId", "conceptId") ON DELETE CASCADE ON UPDATE CASCADE;
