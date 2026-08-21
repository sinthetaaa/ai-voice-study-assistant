/*
  Warnings:

  - A unique constraint covering the columns `[conceptId,type,variant]` on the table `Question` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "QuestionPurpose" AS ENUM ('BASELINE', 'SCAFFOLD', 'ALTERNATE', 'RETEST');

-- DropIndex
DROP INDEX "Question_conceptId_type_key";

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "purpose" "QuestionPurpose" NOT NULL DEFAULT 'BASELINE',
ADD COLUMN     "variant" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Question_purpose_idx" ON "Question"("purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Question_conceptId_type_variant_key" ON "Question"("conceptId", "type", "variant");
