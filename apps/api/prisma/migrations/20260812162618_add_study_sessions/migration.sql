-- CreateEnum
CREATE TYPE "StudySessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SessionConceptStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REVIEW_REQUIRED');

-- AlterTable
ALTER TABLE "QuestionAttempt" ADD COLUMN     "studySessionId" TEXT;

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "studyPackId" TEXT NOT NULL,
    "status" "StudySessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentConceptId" TEXT,
    "currentQuestionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionConceptProgress" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "SessionConceptStatus" NOT NULL DEFAULT 'PENDING',
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionConceptProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudySession_studyPackId_idx" ON "StudySession"("studyPackId");

-- CreateIndex
CREATE INDEX "StudySession_status_idx" ON "StudySession"("status");

-- CreateIndex
CREATE INDEX "StudySession_currentConceptId_idx" ON "StudySession"("currentConceptId");

-- CreateIndex
CREATE INDEX "StudySession_currentQuestionId_idx" ON "StudySession"("currentQuestionId");

-- CreateIndex
CREATE INDEX "StudySession_startedAt_idx" ON "StudySession"("startedAt");

-- CreateIndex
CREATE INDEX "SessionConceptProgress_sessionId_idx" ON "SessionConceptProgress"("sessionId");

-- CreateIndex
CREATE INDEX "SessionConceptProgress_conceptId_idx" ON "SessionConceptProgress"("conceptId");

-- CreateIndex
CREATE INDEX "SessionConceptProgress_status_idx" ON "SessionConceptProgress"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SessionConceptProgress_sessionId_conceptId_key" ON "SessionConceptProgress"("sessionId", "conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionConceptProgress_sessionId_position_key" ON "SessionConceptProgress"("sessionId", "position");

-- CreateIndex
CREATE INDEX "QuestionAttempt_studySessionId_idx" ON "QuestionAttempt"("studySessionId");

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_studySessionId_fkey" FOREIGN KEY ("studySessionId") REFERENCES "StudySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_studyPackId_fkey" FOREIGN KEY ("studyPackId") REFERENCES "StudyPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_currentConceptId_fkey" FOREIGN KEY ("currentConceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_currentQuestionId_fkey" FOREIGN KEY ("currentQuestionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionConceptProgress" ADD CONSTRAINT "SessionConceptProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionConceptProgress" ADD CONSTRAINT "SessionConceptProgress_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
