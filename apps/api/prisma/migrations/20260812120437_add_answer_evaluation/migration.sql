/*
  Warnings:

  - A unique constraint covering the columns `[conceptId,type]` on the table `Question` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AnswerCorrectness" AS ENUM ('CORRECT', 'PARTIAL', 'INCORRECT');

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "promptSnapshot" TEXT NOT NULL,
    "expectedAnswerSnapshot" TEXT NOT NULL,
    "questionTypeSnapshot" "QuestionType" NOT NULL,
    "difficultySnapshot" "QuestionDifficulty" NOT NULL,
    "evidenceChunkIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answerText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerEvaluation" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "correctness" "AnswerCorrectness" NOT NULL,
    "feedback" TEXT NOT NULL,
    "missingPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "misconceptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evaluatorProvider" TEXT NOT NULL,
    "evaluatorModel" TEXT NOT NULL,
    "evaluatorVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionAttempt_questionId_idx" ON "QuestionAttempt"("questionId");

-- CreateIndex
CREATE INDEX "QuestionAttempt_createdAt_idx" ON "QuestionAttempt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerEvaluation_attemptId_key" ON "AnswerEvaluation"("attemptId");

-- CreateIndex
CREATE INDEX "AnswerEvaluation_correctness_idx" ON "AnswerEvaluation"("correctness");

-- CreateIndex
CREATE INDEX "AnswerEvaluation_createdAt_idx" ON "AnswerEvaluation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Question_conceptId_type_key" ON "Question"("conceptId", "type");

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEvaluation" ADD CONSTRAINT "AnswerEvaluation_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuestionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
