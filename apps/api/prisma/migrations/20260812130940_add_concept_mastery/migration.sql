-- CreateTable
CREATE TABLE "ConceptMastery" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "alpha" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "beta" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "evidenceWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptMastery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasteryEvent" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasteryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConceptMastery_conceptId_key" ON "ConceptMastery"("conceptId");

-- CreateIndex
CREATE INDEX "ConceptMastery_masteryScore_idx" ON "ConceptMastery"("masteryScore");

-- CreateIndex
CREATE INDEX "ConceptMastery_updatedAt_idx" ON "ConceptMastery"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MasteryEvent_evaluationId_key" ON "MasteryEvent"("evaluationId");

-- CreateIndex
CREATE INDEX "MasteryEvent_conceptId_idx" ON "MasteryEvent"("conceptId");

-- CreateIndex
CREATE INDEX "MasteryEvent_createdAt_idx" ON "MasteryEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "ConceptMastery" ADD CONSTRAINT "ConceptMastery_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasteryEvent" ADD CONSTRAINT "MasteryEvent_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasteryEvent" ADD CONSTRAINT "MasteryEvent_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "AnswerEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
